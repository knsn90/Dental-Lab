/**
 * PublicPaymentScreen — ödeme akışı.
 *
 * İKİ YERDE kullanılır, gövdesi aynıdır:
 *   • /pay/[token] rotası — halka açık, oturum gerekmez. Lab'ın e-posta ya da
 *     WhatsApp ile gönderdiği ödeme linki buraya düşer.
 *   • PaymentSheetModal — uygulama içinden ödeyen klinik sayfadan kopmasın
 *     diye aynı akış modal içinde çizilir (`embedded`).
 *
 * Auth gerekmez. Token ile intent çekilir, kart bilgisi alınır,
 * 3DS akışı tetiklenir, sonuç gösterilir.
 *
 * Demo provider için kart kuralları:
 *   CVC '000' → fail
 *   CVC '999' → 3DS pending (iframe sandbox)
 *   diğer    → otomatik success
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, Pressable, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { AppIcon } from '../../../core/ui/AppIcon';
import { Lock } from '../../../core/ui/icons';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { Shadows, CardSpec } from '../../../core/theme/shadows';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { fetchPublicIntent, chargeWithCard, confirmPayment, PAYMENT_STATUS_LABELS } from '../api';
import type { PublicPaymentIntent, CardInput } from '../types';

/** Sayfa kabuğu: rotada SafeAreaView, modalda düz View. */
function Shell({ embedded, bg, children }: { embedded?: boolean; bg: string; children: React.ReactNode }) {
  return embedded
    ? <View style={{ flex: 1 }}>{children}</View>
    : <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>{children}</SafeAreaView>;
}

function fmtMoney(n: number, cur = 'TRY'): string {
  const sym = cur === 'TRY' ? '₺' : cur === 'USD' ? '$' : '€';
  return sym + (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Ödeme düğmesi KLİNİK yeşili (zümrüt 400 — DS.clinic.primary).
 *
 * Neden panelden türetilmiyor: bu ekran /pay/<token> olarak oturumsuz da
 * açılıyor; orada route segmenti yok, usePanelTheme() lab safranına düşerdi.
 * Ödeyen taraf her zaman klinik/hekim olduğu için palet sabit.
 */
const PAY_GREEN = '#32BB78';

export function PublicPaymentScreen({
  token: tokenProp, embedded, onPaid,
}: {
  /** Modal kullanımında token prop'tan gelir; rotada adresten okunur. */
  token?: string;
  /** true → sayfa kabuğu (SafeAreaView + tam ekran zemin) çizilmez. */
  embedded?: boolean;
  /** Ödeme başarıyla tamamlandığında (modalı kapatıp listeyi tazelemek için). */
  onPaid?: () => void;
} = {}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Hook koşulsuz çağrılır; modalda parametre yok, prop kazanır.
  const params = useLocalSearchParams<{ token: string }>();
  const token = tokenProp ?? params.token;
  const [intent, setIntent] = useState<PublicPaymentIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [card, setCard] = useState<CardInput>({
    holder_name: '', number: '', expire_month: '', expire_year: '', cvc: '',
  });
  const [installment, setInstallment] = useState(1);
  const [paying, setPaying] = useState(false);
  const [stage, setStage]   = useState<'form' | '3ds' | 'success' | 'fail'>('form');
  const [threedsHtml, setThreedsHtml] = useState<string | null>(null);
  const [failMessage, setFailMessage] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const { error: err, intent: data } = await fetchPublicIntent(String(token));
    setLoading(false);
    if (err || !data) { setError(err ?? 'Ödeme bulunamadı'); return; }
    setIntent(data);
    if (data.status === 'paid') setStage('success');
  };

  useEffect(() => { load(); }, [token]);

  // 3DS HTML postMessage dinleyicisi (web'de iframe için)
  useEffect(() => {
    if (Platform.OS !== 'web' || stage !== '3ds') return;
    const onMsg = async (e: MessageEvent) => {
      // iyzico: 3DS iframe'i banka doğrulamasından sonra payments-callback'e
      // POST eder; ödeme ORADA (sunucuda) tamamlanır ve sonuç buraya
      // postMessage ile gelir. İstemci hiçbir şeyi "ödendi" YAPMAZ, yalnız
      // kaydı yeniden okur — doğruluk kaynağı sunucudaki intent durumudur.
      if (e.data?.type === 'iyzico-3ds-done') {
        if (e.data.ok) { setStage('success'); load(); onPaid?.(); }
        else { setFailMessage('3DS doğrulaması tamamlanamadı'); setStage('fail'); }
        return;
      }
      if (e.data?.type === 'demo-3ds-success') {
        // Backend'e onay
        if (intent) {
          const { error } = await confirmPayment(intent.intent_id, e.data.ref, String(token));
          if (error) { setFailMessage(error.message ?? 'Onaylama başarısız'); setStage('fail'); }
          else                                                              setStage('success');
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [stage, intent, token]);

  const handlePay = async () => {
    if (!intent) return;
    if (!card.holder_name.trim() || !card.number.trim() || !card.cvc.trim()) {
      setFailMessage('Tüm kart alanları zorunlu');
      setStage('fail');
      return;
    }
    setPaying(true);
    const result = await chargeWithCard({
      intent_id: intent.intent_id,
      token: String(token),
      card: { ...card, installment },
    });
    setPaying(false);

    if (!result.ok) {
      setFailMessage(result.error ?? 'Ödeme başarısız');
      setStage('fail');
      return;
    }

    if (result.status === 'paid') {
      setStage('success');
      load();
      onPaid?.();
      return;
    }

    if (result.threeds_html) {
      setThreedsHtml(result.threeds_html);
      setStage('3ds');
      return;
    }

    if (result.threeds_url && Platform.OS === 'web') {
      window.location.href = result.threeds_url;
      return;
    }

    // Default: poll status
    setStage('success');
    load();
  };

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Shell embedded={embedded} bg={T.bg}>
        <View style={s.center}>
          <ActivityIndicator color="#2563EB" size="large" />
        </View>
      </Shell>
    );
  }

  if (error || !intent) {
    return (
      <Shell embedded={embedded} bg={T.bg}>
        <View style={s.center}>
          <View style={[s.iconCircle, { backgroundColor: '#FEF2F2' }]}>
            <AppIcon name="alert-circle" size={36} color="#DC2626" />
          </View>
          <Text style={[s.bigTitle, { color: T.ink }]}>Ödeme Bulunamadı</Text>
          <Text style={[s.bigSub, { color: T.ink3 }]}>{error ?? 'Bu link geçersiz veya süresi dolmuş.'}</Text>
        </View>
      </Shell>
    );
  }

  // Success view
  if (stage === 'success' || intent.status === 'paid') {
    return (
      <Shell embedded={embedded} bg={T.bg}>
        <View style={s.center}>
          <View style={[s.iconCircle, { backgroundColor: '#ECFDF5' }]}>
            <AppIcon name="check-circle" size={48} color="#059669" />
          </View>
          <Text style={[s.bigTitle, { color: T.ink }]}>Ödemeniz Alındı</Text>
          <Text style={[s.bigSub, { color: T.ink3 }]}>
            {fmtMoney(Number(intent.amount), intent.currency)} · {intent.invoice_number}
          </Text>
          <Text style={[s.bigSub, { color: T.ink3, marginTop: 12, fontSize: 13 }]}>
            Teşekkürler! Makbuz e-postanıza gönderilecektir.
          </Text>
        </View>
      </Shell>
    );
  }

  // 3DS view (web iframe)
  if (stage === '3ds' && threedsHtml) {
    return (
      <Shell embedded={embedded} bg={T.bg}>
        <View style={s.threedsWrap}>
          {Platform.OS === 'web' ? (
            // @ts-ignore — web only
            <iframe
              srcDoc={threedsHtml}
              style={{ width: '100%', height: '100%', border: 0 }}
              sandbox="allow-scripts allow-forms allow-same-origin"
            />
          ) : (
            <Text style={[s.bigSub, { color: T.ink3 }]}>3DS doğrulama yalnızca web'de destekleniyor (mobilde Edge Function callback gerekli)</Text>
          )}
        </View>
      </Shell>
    );
  }

  // Fail view
  if (stage === 'fail') {
    return (
      <Shell embedded={embedded} bg={T.bg}>
        <View style={s.center}>
          <View style={[s.iconCircle, { backgroundColor: '#FEF2F2' }]}>
            <AppIcon name="close-circle" size={48} color="#DC2626" />
          </View>
          <Text style={[s.bigTitle, { color: T.ink }]}>Ödeme Başarısız</Text>
          <Text style={[s.bigSub, { color: T.ink3 }]}>{failMessage ?? 'Bilinmeyen hata'}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setStage('form'); setFailMessage(null); }}>
            <Text style={s.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      </Shell>
    );
  }

  // Form view
  const cfg = PAYMENT_STATUS_LABELS[intent.status];
  const money = fmtMoney(Number(intent.amount), intent.currency);
  return (
    <Shell embedded={embedded} bg={U.pageBg}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Lab kimliği — logo varsa logo, yoksa ad. Müşteri kartını girmeden
            önce kime ödediğini görmeli. */}
        <View style={s.labHead}>
          {intent.lab_logo_url ? (
            <Image
              source={{ uri: intent.lab_logo_url }}
              style={{ width: 132, height: 30 }}
              resizeMode="contain"
              accessibilityLabel={intent.lab_name}
            />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: '700', color: U.ink[900] }} numberOfLines={1}>
              {intent.lab_name}
            </Text>
          )}
          <View style={{ paddingHorizontal: 9, paddingVertical: 3.5, borderRadius: 999, backgroundColor: cfg.color + (U.isDark ? '2E' : '15') }}>
            <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: cfg.color }}>
              {cfg.label}
            </Text>
          </View>
        </View>

        {/* Tutar — ekranın tek büyük rakamı */}
        <View style={{ ...U.cardSolid, padding: 16, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ ...(U.colHeader as object) }}>{autoT('Fatura')}</Text>
            <Text style={{ fontSize: 11.5, fontFamily: 'monospace' as any, color: U.ink[500] }}>
              {intent.invoice_number}
            </Text>
          </View>
          <Text style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.8, color: U.ink[900], marginTop: 2 }}>
            {money}
          </Text>
          <Text style={{ fontSize: 11.5, color: U.ink[500], marginTop: 4 }} numberOfLines={2}>
            {[intent.clinic_name, intent.doctor_name].filter(Boolean).join(' · ')}
          </Text>
          {intent.invoice_due_date ? (
            <Text style={{ fontSize: 11.5, color: U.ink[400] }}>
              {autoT('Vade')}: {new Date(intent.invoice_due_date + 'T00:00:00').toLocaleDateString('tr-TR')}
            </Text>
          ) : null}
        </View>

        {/* Kart formu */}
        <View style={{ ...U.cardSolid, padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900] }}>{autoT('Kart bilgileri')}</Text>

          <Field label={autoT('Kart sahibi')}>
            <TextInput
              style={U.inputStyle}
              value={card.holder_name}
              onChangeText={v => setCard({ ...card, holder_name: v })}
              placeholder="AD SOYAD"
              autoCapitalize="characters"
              placeholderTextColor={U.ink[400]}
            />
          </Field>

          <Field label={autoT('Kart numarası')}>
            <TextInput
              style={U.inputStyle}
              value={card.number}
              onChangeText={v => setCard({ ...card, number: v.replace(/\D/g, '').slice(0, 16) })}
              placeholder="1234 5678 9012 3456"
              keyboardType="number-pad"
              maxLength={16}
              placeholderTextColor={U.ink[400]}
            />
          </Field>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label={autoT('Ay')} style={{ flex: 1 }}>
              <TextInput
                style={U.inputStyle}
                value={card.expire_month}
                onChangeText={v => setCard({ ...card, expire_month: v.replace(/\D/g, '').slice(0, 2) })}
                placeholder="AA" keyboardType="number-pad" maxLength={2}
                placeholderTextColor={U.ink[400]}
              />
            </Field>
            <Field label={autoT('Yıl')} style={{ flex: 1 }}>
              <TextInput
                style={U.inputStyle}
                value={card.expire_year}
                onChangeText={v => setCard({ ...card, expire_year: v.replace(/\D/g, '').slice(0, 4) })}
                placeholder="YYYY" keyboardType="number-pad" maxLength={4}
                placeholderTextColor={U.ink[400]}
              />
            </Field>
            <Field label="CVC" style={{ flex: 1 }}>
              <TextInput
                style={U.inputStyle}
                value={card.cvc}
                onChangeText={v => setCard({ ...card, cvc: v.replace(/\D/g, '').slice(0, 4) })}
                placeholder="123" keyboardType="number-pad" maxLength={4} secureTextEntry
                placeholderTextColor={U.ink[400]}
              />
            </Field>
          </View>

          {/* Test kuralları YALNIZ demo POS'ta. Canlı sağlayıcıda gerçek
              kliniğe "CVC'ye 999 yaz" demiş oluyorduk. */}
          {intent.provider === 'demo' && (
            <Text style={{ fontSize: 11, color: U.ink[400], fontStyle: 'italic' }}>
              Sandbox: CVC 000 → başarısız · 999 → 3DS · diğer → başarılı
            </Text>
          )}
        </View>

        {/* Ödeme düğmesi — lacivert, tam yuvarlak (ödeme dili) */}
        <Pressable
          onPress={handlePay}
          disabled={paying}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            paddingVertical: 13, borderRadius: 9999, backgroundColor: PAY_GREEN,
            opacity: paying ? 0.6 : pressed ? 0.85 : 1,
            ...(Platform.OS === 'web' ? { cursor: paying ? 'default' : 'pointer' } as any : {}),
          })}
        >
          {paying
            ? <ActivityIndicator color="#FFFFFF" size="small" />
            : <Lock size={14} color="#FFFFFF" strokeWidth={2} />}
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
            {paying ? autoT('İşleniyor…') : `${money} ${autoT('Öde')}`}
          </Text>
        </Pressable>

        <Text style={{ fontSize: 10.5, color: U.ink[400], textAlign: 'center', lineHeight: 15 }}>
          {autoT('Kart bilgileriniz 3D Secure ile korunur ve laboratuvarda saklanmaz.')}
        </Text>
      </ScrollView>
    </Shell>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  const U = useInkUI();
  return (
    <View style={[{ gap: 5 }, style]}>
      <Text style={U.colHeader}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F1F5F9' },
  scroll: { padding: 16, paddingBottom: 28, gap: 12, maxWidth: 420, alignSelf: 'center', width: '100%' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },

  iconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  bigTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginTop: 4 },
  bigSub:   { fontSize: 14, color: '#64748B', textAlign: 'center', maxWidth: 320, lineHeight: 20 },

  labHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  invCard: { backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, padding: 22, gap: 4, ...Shadows.card } as any,
  invLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 },
  invNumber: { fontSize: 14, fontWeight: '700', color: '#475569' },
  amountBig: { fontSize: 36, fontWeight: '800', color: '#0F172A', letterSpacing: -1, marginVertical: 8 },
  invMeta: { fontSize: 12, color: '#64748B' },

  cardForm: { backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, padding: 18, ...Shadows.card } as any,
  formTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF' },
  demoHint: { fontSize: 11, color: '#94A3B8', marginTop: 8, fontStyle: 'italic' },

  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 12, backgroundColor: '#10B981' },
  payText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },

  secureHint: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 8 },

  threedsWrap: { flex: 1, padding: 16 },

  retryBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 10, backgroundColor: '#2563EB', marginTop: 8 },
  retryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
