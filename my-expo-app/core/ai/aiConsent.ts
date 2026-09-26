/**
 * aiConsent — Üçüncü taraf yapay zekâ için AÇIK İZİN kapısı.
 *
 * Neden: App Store 5.1.2(i) (13 Kasım 2025) kişisel veri üçüncü taraf bir
 * yapay zekâya gönderilecekse İLK GÖNDERİMDEN ÖNCE uygulama içinde açık izin
 * ister; gizlilik politikasına link vermek yetmez. Bizde en hassas akış iş
 * emri okuma: Claude'a hasta adı, cinsiyeti ve doğum tarihi gidiyor.
 *
 * Kullanım — yapay zekâya veri gönderen HER çağrı yerinde:
 *
 *   if (!(await ensureAiConsent())) return;   // kullanıcı izin vermedi
 *
 * Karar `user_consents` defterine `ai_processing` türüyle yazılır (append-only;
 * geri çekme = granted=false yeni satır). Defter zaten KVKK/GDPR için vardı,
 * bu kapı onu Apple'ın istediği "kullanımdan önce sor" akışına bağlar.
 */
import { create } from 'zustand';
import { Platform } from 'react-native';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { LEGAL_DOC_VERSION } from '../legal';

type Status = 'unknown' | 'granted' | 'denied';

interface AiConsentState {
  /** Onay diyaloğu açık mı (global host dinler) */
  open: boolean;
  /** Son bilinen karar + hangi kullanıcıya ait olduğu (oturum değişince geçersiz) */
  status: Status;
  uid: string | null;
  setOpen: (v: boolean) => void;
  setStatus: (s: Status, uid: string | null) => void;
}

export const useAiConsentStore = create<AiConsentState>((set) => ({
  open: false,
  status: 'unknown',
  uid: null,
  setOpen: (open) => set({ open }),
  setStatus: (status, uid) => set({ status, uid }),
}));

/** Diyalog kapanana kadar bekleyen ensureAiConsent() çağrıları. */
let waiters: ((granted: boolean) => void)[] = [];

function flush(granted: boolean) {
  const list = waiters;
  waiters = [];
  list.forEach((r) => r(granted));
}

function currentUid(): string | null {
  return useAuthStore.getState().session?.user?.id ?? null;
}

function userAgent(): string {
  return Platform.OS === 'web' && typeof navigator !== 'undefined'
    ? navigator.userAgent
    : `app/${Platform.OS}`;
}

/** Defterdeki SON ai_processing kararı. Kayıt yoksa izin yok sayılır. */
export async function fetchAiConsent(): Promise<boolean> {
  const uid = currentUid();
  if (!uid) return false;
  const { data, error } = await supabase
    .from('user_consents')
    .select('granted, granted_at')
    .eq('user_id', uid)
    .eq('kind', 'ai_processing')
    .order('granted_at', { ascending: false })
    .limit(1);
  if (error) {
    console.warn('[ai-consent] okunamadı:', error.message);
    return false;
  }
  return !!data?.[0]?.granted;
}

/**
 * İzin var mı? Yoksa diyaloğu açar ve kullanıcının kararını bekler.
 * true → çağrı yapılabilir. false → çağrı YAPILMAMALI.
 */
export async function ensureAiConsent(): Promise<boolean> {
  const uid = currentUid();
  if (!uid) return false;

  const st = useAiConsentStore.getState();
  // Önbellek yalnız AYNI kullanıcı için geçerli (hesap değişince yeniden sor).
  if (st.uid === uid && st.status === 'granted') return true;

  if (await fetchAiConsent()) {
    useAiConsentStore.getState().setStatus('granted', uid);
    return true;
  }

  return new Promise<boolean>((resolve) => {
    waiters.push(resolve);
    useAiConsentStore.getState().setOpen(true);
  });
}

/** "İzin ver" — deftere yazar, bekleyen çağrıları serbest bırakır. */
export async function grantAiConsent(): Promise<boolean> {
  const uid = currentUid();
  try {
    const { error } = await supabase.rpc('record_consents', {
      p_consents: [{
        kind: 'ai_processing',
        granted: true,
        document_version: LEGAL_DOC_VERSION,
        user_agent: userAgent(),
      }],
    });
    if (error) throw error;
  } catch (e: any) {
    console.warn('[ai-consent] yazılamadı:', e?.message ?? e);
    // Kayıt başarısızsa izin VERİLMİŞ sayma: ispat edilemeyen onay, onay değildir.
    useAiConsentStore.getState().setOpen(false);
    flush(false);
    return false;
  }
  useAiConsentStore.getState().setStatus('granted', uid);
  useAiConsentStore.getState().setOpen(false);
  flush(true);
  return true;
}

/** "Şimdi değil" — deftere RED yazmayız (kullanıcı sonra açabilir), çağrı iptal. */
export function dismissAiConsent(): void {
  useAiConsentStore.getState().setOpen(false);
  flush(false);
}

/** Ayarlardan geri çekme — deftere granted=false satırı yazar. */
export async function withdrawAiConsent(): Promise<boolean> {
  const uid = currentUid();
  const { error } = await supabase.rpc('record_consents', {
    p_consents: [{
      kind: 'ai_processing',
      granted: false,
      document_version: LEGAL_DOC_VERSION,
      user_agent: userAgent(),
    }],
  });
  if (error) {
    console.warn('[ai-consent] geri çekilemedi:', error.message);
    return false;
  }
  useAiConsentStore.getState().setStatus('denied', uid);
  return true;
}
