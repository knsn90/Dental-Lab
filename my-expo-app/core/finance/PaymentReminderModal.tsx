// Vadesi geçmiş ödeme hatırlatması — klinik/hekim panelinde girişte açılan popup.
//
// TON: bu bir tahsilat baskısı değil, bir hatırlatma. Kırmızı uyarı dili, ünlem ve
// "borcunuz" gibi kelimeler bilinçli olarak KULLANILMADI; hekim laboratuvarın
// müşterisi, kovalanan bir borçlu değil. Renk kodu kehribar (uyarı), kırmızı değil.
//
// PARA: çoklu-döviz kuralı gereği farklı para birimleri TOPLANMAZ — her biri kendi
// satırında görünür. Baz para birimine çevirme yapılmaz (kur anlık, fatura değil).
//
// HAREKET: yüzey "belirir" (blur + ölçek birlikte), düz opacity geçişi değil.
// Kritik sönümlü (taşma yok) — kullanıcı bunu fırlatmadı, sadece açıldı.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, Modal, Platform, Animated, Easing,
  AccessibilityInfo, ScrollView,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { X, ReceiptText, Phone } from '../ui/icons';
import { DS } from '../theme/dsTokens';
import { useInkUI } from '../theme/inkScale';
import { autoT } from '../i18n/autoTranslate';
import { formatMoney, type Currency } from '../money/currency';

export type ReminderRow = {
  lab_id: string | null;
  lab_name: string | null;
  currency: string;
  overdue_amount: number;
  total_balance: number;
  overdue_count: number;
  oldest_due_date: string | null;
  days_late: number;
};

/** Kullanıcı hareketi azaltmayı seçtiyse true. Web'de matchMedia, native'de A11y API. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    if (Platform.OS === 'web') {
      const mq = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
      if (!mq) return;
      setReduced(mq.matches);
      const onChange = (e: any) => alive && setReduced(!!e.matches);
      mq.addEventListener?.('change', onChange);
      return () => { alive = false; mq.removeEventListener?.('change', onChange); };
    }
    AccessibilityInfo.isReduceMotionEnabled?.().then(v => { if (alive) setReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => alive && setReduced(!!v));
    return () => { alive = false; (sub as any)?.remove?.(); };
  }, []);
  return reduced;
}

// Uyarı tonu panel accent'i DEĞİL, ortak status rengidir (DS.*.warning) — bu popup
// klinik ve hekim panellerinin ikisinde de aynı görünmeli. AMBER_TEXT, küçük
// UPPERCASE etiket açık zeminde okunaklı olsun diye warning'in koyulaştırılmış hâli.
const AMBER      = DS.clinic.warning;   // #E89B2A — ikon (iki temada da aynı)
// Amber yüzey/metin koyu temada TERS çalışır: krem zemin beyaz leke yapar,
// koyu kahve metin okunmaz. İki set tutulur, bileşende isDark'a göre seçilir.
const AMBER_TEXT = '#9A6212';           // etiket metni (kontrast)
const AMBER_SOFT = '#FFFBEB';
const AMBER_LINE = '#FDE68A';
const AMBER_TEXT_D = '#F0C078';
const AMBER_SOFT_D = 'rgba(232,155,42,0.12)';
const AMBER_LINE_D = 'rgba(232,155,42,0.32)';

const AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

/** "19 Temmuz" — nokta ayraçlı 19.07.2026 tarih değil, kod gibi okunuyordu.
 *  Yıl yalnız içinde bulunduğumuz yıldan farklıysa eklenir. */
function trDate(iso: string | null): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const ay = AYLAR[Number(mo) - 1] ?? mo;
  const buYil = String(new Date().getFullYear());
  return `${Number(d)} ${ay}${y === buYil ? '' : ' ' + y}`;
}

/** Basılınca ANINDA tepki veren buton (pointer-down'da, bırakışta değil). */
function PressScale({ children, onPress, style, containerStyle }: any) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    // DİKKAT: yerleşim stili (flex/genişlik) DIŞ Pressable'a verilmeli. İç
    // Animated.View'a verilince Pressable içeriğe göre büzülüyor ve buton
    // yuvarlak bir lekeye dönüyordu — ekran görüntüsünde tam olarak bu oldu.
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 0 }).start()}
      style={[containerStyle, Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null]}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

export function PaymentReminderModal({
  visible, rows, onClose, contactHint,
}: {
  visible: boolean;
  rows: ReminderRow[];
  onClose: () => void;
  /** Lab'ın iletişim satırı (telefon/e-posta). Yoksa genel metin gösterilir. */
  contactHint?: string | null;
}) {
  const U = useInkUI();
  const amberText = U.isDark ? AMBER_TEXT_D : AMBER_TEXT;
  const amberSoft = U.isDark ? AMBER_SOFT_D : AMBER_SOFT;
  const amberLine = U.isDark ? AMBER_LINE_D : AMBER_LINE;
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current;
  const router = useRouter();
  // Panel-agnostik: '/(clinic)' sabitlenmez, aktif segment'ten çözülür — aynı
  // bileşen hem klinik hem hekim panelinde doğru faturalar sayfasına gider.
  const segments = useSegments();
  const panel = (segments?.[0] as string) || '(clinic)';

  useEffect(() => {
    if (!visible) { anim.setValue(0); return; }
    Animated.timing(anim, {
      toValue: 1,
      duration: reduced ? 180 : 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [visible, reduced, anim]);

  // Web'de Esc ile kapan — modal her an terk edilebilmeli.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: any) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!rows.length) return null;

  const labName = rows.find(r => r.lab_name)?.lab_name ?? null;

  // Materialize: ölçek + opaklık birlikte. Reduced-motion'da yalnız çapraz geçiş.
  const cardStyle = reduced
    ? { opacity: anim }
    : {
        opacity: anim,
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
      };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Dikkati odaklamak için karartma — modal bir görev, arka plan geri itilir. */}
      <Animated.View
        style={{
          flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20,
          backgroundColor: U.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(10,10,10,0.42)',
          opacity: anim,
          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(6px)' } as any : {}),
        }}
      >
        {/* Dışarı tıklayınca kapanır — kullanıcı asla kilitlenmez. */}
        <Pressable
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          accessibilityLabel="Kapat"
        />

        <Animated.View
          style={[
            {
              width: '100%', maxWidth: 460, backgroundColor: U.surface, borderRadius: 22,
              ...(U.isDark ? { borderWidth: 1, borderColor: U.hairline } : {}),
              overflow: 'hidden',
              ...(Platform.OS === 'web'
                ? { boxShadow: '0 28px 70px rgba(15,23,42,0.28)' } as any
                : { elevation: 12, shadowColor: '#0F172A', shadowOpacity: 0.24, shadowRadius: 28, shadowOffset: { width: 0, height: 18 } }),
            },
            cardStyle as any,
          ]}
        >
          {/* Başlık */}
          <View style={{ paddingTop: 22, paddingHorizontal: 22, paddingBottom: 16, flexDirection: 'row', gap: 14 }}>
            <View style={{
              width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
              backgroundColor: amberSoft, borderWidth: 1, borderColor: amberLine,
            }}>
              {/* Takvim 'randevu' çağrıştırıyordu; konu fatura → makbuz ikonu. */}
              <ReceiptText size={21} color={AMBER} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, paddingTop: 1 }}>
              {/* Başlık çerçeveyi kurar (insani), alt satır olguyu söyler.
                  "Ödeme hatırlatması" bir sistem bildirimi gibi okunuyordu. */}
              <Text style={{ fontSize: 17, fontWeight: '700', color: U.ink[900], letterSpacing: -0.35, lineHeight: 23 }}>
                Bakiyeniz hakkında kısa bir hatırlatma
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 19, color: U.ink[500], marginTop: 4 }}>
                {labName ? `${labName} ${autoT('hesabınızda')} ` : 'Hesabınızda '}vadesi geçmiş bir tutar görünüyor.
              </Text>
            </View>
            <PressScale onPress={onClose} style={{ padding: 6, borderRadius: 999 }}>
              <X size={18} color={U.ink[400]} strokeWidth={2.2} />
            </PressScale>
          </View>

          {/* Tutarlar — para birimi başına ayrı blok, toplama yok. */}
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingHorizontal: 22, gap: 10 }}>
            {rows.map((r) => (
              <View
                key={`${r.lab_id ?? 'x'}-${r.currency}`}
                style={{ borderRadius: 14, borderWidth: 1, borderColor: amberLine, backgroundColor: amberSoft, padding: 14 }}
              >
                {/* HİYERARŞİ: rakam ÖNCE, etiket sonra. Etiket üstteyken göz önce
                    "Vadesi geçen"i okuyup sonra sayıya iniyordu; asıl bilgi sayı.
                    İki tutar yan yana ve yakın boyuttayken hangisinin önemli olduğu
                    belirsizdi — artık geciken tutar tek başına üstte ve iki katı
                    büyüklükte, toplam bakiye ince çizginin altında bağlam olarak durur. */}
                <Text style={{ fontSize: 32, fontWeight: '700', color: U.ink[900], letterSpacing: -1.1, lineHeight: 37 }}>
                  {formatMoney(Number(r.overdue_amount) || 0, (r.currency as Currency) ?? 'TRY')}
                </Text>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: amberText, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 3 }}>
                  Vadesi geçen
                </Text>
                {/* Bağlam olmadan rakam yalnız kaygı üretir. Bu bilgi eskiden
                    butonun ALTINDA duruyordu ve kayboluyordu — tutarla aynı karta
                    alındı, iki kısa satır hâlinde. */}
                <View style={{ marginTop: 9, gap: 2 }}>
                  <Text style={{ fontSize: 12, color: U.ink[700], fontWeight: '600' }}>
                    {r.overdue_count} fatura
                  </Text>
                  {!!r.oldest_due_date && (
                    <Text style={{ fontSize: 12, color: U.ink[500] }}>
                      En eski: {trDate(r.oldest_due_date)}
                      {r.days_late > 0 ? ` · ${r.days_late} gün geçti` : ''}
                    </Text>
                  )}
                </View>

                <View style={{ height: 1, backgroundColor: amberLine, marginTop: 12, marginBottom: 10 }} />

                <Text style={{ fontSize: 17, fontWeight: '600', color: U.ink[700], letterSpacing: -0.3 }}>
                  {formatMoney(Number(r.total_balance) || 0, (r.currency as Currency) ?? 'TRY')}
                </Text>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: U.ink[400], letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 }}>
                  Toplam bakiye
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Kapanış mesajı — çözüm yolu gösterir, suçlamaz. */}
          <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <Phone size={15} color={U.ink[400]} strokeWidth={2} style={{ marginTop: 2 }} />
              {/* Uzun paragraf okunmuyordu. İki cümle: biri yanlış alarmı kapatır,
                  biri çıkış yolunu gösterir. Vade planı/tercih detayı buradan çıktı —
                  onu konuşacak kişi zaten yetkiliyle konuşuyor. */}
              <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 19, color: U.ink[500] }}>
                Ödemenizi yaptıysanız bu uyarıyı dikkate almayabilirsiniz; kayıtlar kısa süre içinde
                güncellenir. Ödeme tercihleriniz için laboratuvar yetkilimizle görüşebilirsiniz
                {contactHint ? `: ${contactHint}` : '.'}
              </Text>
            </View>
          </View>

          {/* İki eylem: çıkış (nötr) + gerçek aksiyon (faturalar). Tek siyah buton
              "Anladım, teşekkürler" derken hem çok güçlü hem pasifti — kullanıcıyı
              teşekkür etmeye zorluyordu. Ağırlık artık asıl işe verildi. */}
          <View style={{ flexDirection: 'row', gap: 10, padding: 22, paddingTop: 18 }}>
            <PressScale
              onPress={onClose}
              containerStyle={{ flex: 1 }}
              style={{
                borderRadius: 999, paddingVertical: 13, alignItems: 'center',
                borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
              }}
            >
              <Text style={{ color: U.ink[700], fontSize: 14, fontWeight: '600', letterSpacing: -0.1 }}>
                Kapat
              </Text>
            </PressScale>
            <PressScale
              onPress={() => { onClose(); router.push(`/${panel}/finance` as any); }}
              containerStyle={{ flex: 1.4 }}
              style={{
                borderRadius: 999, paddingVertical: 13, alignItems: 'center',
                backgroundColor: U.ink[900],
              }}
            >
              <Text style={{ color: U.onDarkPill, fontSize: 14, fontWeight: '600', letterSpacing: -0.1 }}>
                Faturaları gör
              </Text>
            </PressScale>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
