/**
 * PublicPaymentScreen — /pay/[token] route
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
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';
import { fetchPublicIntent, chargeWithCard, confirmPayment, PAYMENT_STATUS_LABELS } from '../api';
import type { PublicPaymentIntent, CardInput } from '../types';

function fmtMoney(n: number, cur = 'TRY'): string {
  const sym = cur === 'TRY' ? '₺' : cur === 'USD' ? '$' : '€';
  return sym + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PublicPaymentScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
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
      if (e.data?.type === 'demo-3ds-success') {
        // Backend'e onay
        if (intent) {
          const { error } = await confirmPayment(intent.intent_id, e.data.ref);
          if (error) { setFailMessage(error.message ?? 'Onaylama başarısız'); setStage('fail'); }
          else                                                              setStage('success');
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [stage, intent]);

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
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator color="#2563EB" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !intent) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <View style={[s.iconCircle, { backgroundColor: '#FEF2F2' }]}>
            <AppIcon name="alert-circle" size={36} color="#DC2626" />
          </View>
          <Text style={s.bigTitle}>Ödeme Bulunamadı</Text>
          <Text style={s.bigSub}>{error ?? 'Bu link geçersiz veya süresi dolmuş.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Success view
  if (stage === 'success' || intent.status === 'paid') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <View style={[s.iconCircle, { backgroundColor: '#ECFDF5' }]}>
            <AppIcon name="check-circle" size={48} color="#059669" />
          </View>
          <Text style={s.bigTitle}>Ödemeniz Alındı</Text>
          <Text style={s.bigSub}>
            {fmtMoney(Number(intent.amount), intent.currency)} · {intent.invoice_number}
          </Text>
          <Text style={[s.bigSub, { marginTop: 12, fontSize: 13 }]}>
            Teşekkürler! Makbuz e-postanıza gönderilecektir.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // 3DS view (web iframe)
  if (stage === '3ds' && threedsHtml) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.threedsWrap}>
          {Platform.OS === 'web' ? (
            // @ts-ignore — web only
            <iframe
              srcDoc={threedsHtml}
              style={{ width: '100%', height: '100%', border: 0 }}
              sandbox="allow-scripts allow-forms allow-same-origin"
            />
          ) : (
            <Text style={s.bigSub}>3DS doğrulama yalnızca web'de destekleniyor (mobilde Edge Function callback gerekli)</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Fail view
  if (stage === 'fail') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <View style={[s.iconCircle, { backgroundColor: '#FEF2F2' }]}>
            <AppIcon name="close-circle" size={48} color="#DC2626" />
          </View>
          <Text style={s.bigTitle}>Ödeme Başarısız</Text>
          <Text style={s.bigSub}>{failMessage ?? 'Bilinmeyen hata'}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setStage('form'); setFailMessage(null); }}>
            <Text style={s.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Form view
  const cfg = PAYMENT_STATUS_LABELS[intent.status];
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Lab başlık */}
        <View style={s.labHead}>
          <Text style={s.labName}>{intent.lab_name}</Text>
          <View style={[s.statusPill, { backgroundColor: cfg.color + '15' }]}>
            <Text style={[s.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* Fatura kartı */}
        <View style={s.invCard}>
          <Text style={s.invLabel}>Fatura</Text>
          <Text style={s.invNumber}>{intent.invoice_number}</Text>
          <Text style={s.amountBig}>{fmtMoney(Number(intent.amount), intent.currency)}</Text>
          {intent.clinic_name && <Text style={s.invMeta}>{intent.clinic_name}</Text>}
          {intent.doctor_name && <Text style={s.invMeta}>Hekim: {intent.doctor_name}</Text>}
          {intent.invoice_due_date && (
            <Text style={s.invMeta}>
              Vade: {new Date(intent.invoice_due_date + 'T00:00:00').toLocaleDateString('tr-TR')}
            </Text>
          )}
        </View>

        {/* Kart formu */}
        <View style={s.cardForm}>
          <Text style={s.formTitle}>Kart Bilgileri</Text>

          <Field label="Kart Sahibi">
            <TextInput
              style={s.input}
              value={card.holder_name}
              onChangeText={v => setCard({ ...card, holder_name: v })}
              placeholder="AD SOYAD"
              autoCapitalize="characters"
              placeholderTextColor="#94A3B8"
            />
          </Field>

          <Field label="Kart Numarası">
            <TextInput
              style={s.input}
              value={card.number}
              onChangeText={v => setCard({ ...card, number: v.replace(/\D/g, '').slice(0, 16) })}
              placeholder="1234 5678 9012 3456"
              keyboardType="number-pad"
              maxLength={16}
              placeholderTextColor="#94A3B8"
            />
          </Field>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Ay" style={{ flex: 1 }}>
              <TextInput
                style={s.input}
                value={card.expire_month}
                onChangeText={v => setCard({ ...card, expire_month: v.replace(/\D/g, '').slice(0, 2) })}
                placeholder="MM"
                keyboardType="number-pad"
                maxLength={2}
                placeholderTextColor="#94A3B8"
              />
            </Field>
            <Field label="Yıl" style={{ flex: 1 }}>
              <TextInput
                style={s.input}
                value={card.expire_year}
                onChangeText={v => setCard({ ...card, expire_year: v.replace(/\D/g, '').slice(0, 4) })}
                placeholder="YYYY"
                keyboardType="number-pad"
                maxLength={4}
                placeholderTextColor="#94A3B8"
              />
            </Field>
            <Field label="CVC" style={{ flex: 1 }}>
              <TextInput
                style={s.input}
                value={card.cvc}
                onChangeText={v => setCard({ ...card, cvc: v.replace(/\D/g, '').slice(0, 4) })}
                placeholder="123"
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholderTextColor="#94A3B8"
              />
            </Field>
          </View>

          <Text style={s.demoHint}>
            🧪 Sandbox: CVC 000 → fail · 999 → 3DS · diğer → success
          </Text>
        </View>

        {/* Pay button */}
        <TouchableOpacity
          style={[s.payBtn, paying && { opacity: 0.6 }]}
          onPress={handlePay}
          disabled={paying}
        >
          {paying
            ? <ActivityIndicator color="#FFFFFF" />
            : <AppIcon name="lock" size={16} color="#FFFFFF" />}
          <Text style={s.payText}>
            {paying ? 'İşleniyor...' : `${fmtMoney(Number(intent.amount), intent.currency)} Öde`}
          </Text>
        </TouchableOpacity>

        <Text style={s.secureHint}>
          🔒 Kart bilgileriniz GİB onaylı 3D Secure altyapısı ile güvence altındadır.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F1F5F9' },
  scroll: { padding: 20, paddingBottom: 60, gap: 16, maxWidth: 480, alignSelf: 'center', width: '100%' },
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
