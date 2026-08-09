/**
 * İstemci hata raportörü — `public.client_errors` tablosuna yazar.
 *
 * NEDEN: performans denetimi (docs/performance-final-report.md §7) projede sıfır
 * hata izleme aracı olduğunu ölçtü. RootErrorBoundary tüm çökmeleri yalnızca
 * console.error'a yazıyordu; üretimde bir lab'da uygulama çöktüğünde ekibe
 * hiçbir sinyal ulaşmıyordu.
 *
 * BU SENTRY DEĞİL. Gruplama, sourcemap çözümleme, release takibi ve alerting
 * yok. Amaç: hesap açılmasını beklemeden bir zemin sağlamak. Sentry geldiğinde
 * bu dosya onun yanında kalabilir (ağ kesikken yedek havuz) veya kaldırılır.
 *
 * TASARIM KURALI — bu modül ASLA:
 *   · throw etmez            (hata raporlarken çökmek en kötü sonuç)
 *   · await ile UI'ı bekletmez (fire-and-forget)
 *   · oturum yoksa yazmaya çalışmaz (RLS zaten reddeder, gürültü olur)
 *   · aynı hatayı tekrar tekrar göndermez (döngü koruması)
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../api/supabase';

type Source = 'boundary' | 'global' | 'rejection' | 'manual';

/** DB'deki CHECK sınırlarıyla birebir — sunucu reddetmesin diye burada da kes. */
const LIMITS = {
  message: 2000,
  stack: 8000,
  component_stack: 8000,
  fingerprint: 128,
  route: 512,
  platform: 16,
  app_version: 32,
} as const;

/**
 * Döngü koruması. Bir hata render sırasında oluşuyorsa saniyede yüzlerce kez
 * tetiklenebilir; tabloyu doldurmasın.
 */
const RATE_WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const DEDUP_TTL_MS = 5 * 60_000;

let windowStart = 0;
let sentInWindow = 0;
const recentFingerprints = new Map<string, number>();

function truncate(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : String(v);
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Aynı hatayı tanımlayan kararlı bir anahtar. Mesajdaki değişken kısımları
 * (uuid, sayı, tarih) siler ki aynı bug tek parmak izi altında toplansın.
 */
function fingerprintOf(source: Source, message: string, stack?: string | null): string {
  const normMsg = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+/g, '<ts>')
    .replace(/\b\d+\b/g, '<n>');
  // Stack'in ilk anlamlı satırı — hangi dosyada patladığını sabitler.
  const firstFrame = (stack ?? '')
    .split('\n')
    .map(l => l.trim())
    .find(l => l.startsWith('at ') && !l.includes('reportError')) ?? '';
  const key = `${source}|${normMsg}|${firstFrame}`.slice(0, LIMITS.fingerprint);
  return key;
}

function allowedToSend(fingerprint: string): boolean {
  const now = Date.now();

  // Pencere sıfırlama
  if (now - windowStart > RATE_WINDOW_MS) {
    windowStart = now;
    sentInWindow = 0;
  }
  if (sentInWindow >= MAX_PER_WINDOW) return false;

  // Aynı parmak izi TTL içinde tekrar gönderilmesin
  const lastSeen = recentFingerprints.get(fingerprint);
  if (lastSeen && now - lastSeen < DEDUP_TTL_MS) return false;

  // Map'in sınırsız büyümesini engelle
  if (recentFingerprints.size > 200) {
    for (const [k, t] of recentFingerprints) {
      if (now - t > DEDUP_TTL_MS) recentFingerprints.delete(k);
    }
  }

  recentFingerprints.set(fingerprint, now);
  sentInWindow += 1;
  return true;
}

function currentRoute(): string | null {
  if (Platform.OS !== 'web') return null;
  try {
    return truncate((globalThis as any)?.location?.pathname ?? null, LIMITS.route);
  } catch {
    return null;
  }
}

function appVersion(): string | null {
  try {
    const c: any = Constants;
    return truncate(
      c?.expoConfig?.version ?? c?.manifest?.version ?? null,
      LIMITS.app_version,
    );
  } catch {
    return null;
  }
}

/**
 * Hatayı havuza yaz. Fire-and-forget — çağıran await ETMEMELİ.
 *
 * @param source  hatanın yakalandığı nokta
 * @param error   Error ya da herhangi bir değer
 * @param extra   componentStack (React), fatal bayrağı
 */
export function reportError(
  source: Source,
  error: unknown,
  extra?: { componentStack?: string | null; fatal?: boolean },
): void {
  try {
    const err = error as any;
    const message = truncate(err?.message ?? err ?? 'unknown error', LIMITS.message);
    if (!message) return;

    const stack = truncate(err?.stack ?? null, LIMITS.stack);
    const fingerprint = fingerprintOf(source, message, stack);
    if (!allowedToSend(fingerprint)) return;

    // Oturum yoksa RLS zaten reddeder — boş yere istek atma.
    // getSession() senkron cache'ten okur, ağ çağrısı yapmaz.
    void supabase.auth.getSession().then(({ data }) => {
      const uid = data?.session?.user?.id;
      if (!uid) return;

      void supabase
        .from('client_errors')
        .insert({
          user_id: uid,
          source,
          fatal: extra?.fatal ?? false,
          fingerprint,
          message,
          stack,
          component_stack: truncate(extra?.componentStack ?? null, LIMITS.component_stack),
          platform: truncate(Platform.OS, LIMITS.platform),
          app_version: appVersion(),
          route: currentRoute(),
        })
        .then(({ error: insErr }) => {
          // Rapor gönderilemediyse SESSİZ kal — burada console.error yazmak
          // ağ kesikken sonsuz gürültü üretir.
          if (insErr && __DEV__) {
            // eslint-disable-next-line no-console
            console.debug('[reportError] gönderilemedi:', insErr.message);
          }
        });
    });
  } catch {
    // Raporlama hiçbir koşulda uygulamayı etkilemez.
  }
}

/** Test/teşhis için sayaçları sıfırla. */
export function __resetReportErrorState(): void {
  windowStart = 0;
  sentInWindow = 0;
  recentFingerprints.clear();
}
