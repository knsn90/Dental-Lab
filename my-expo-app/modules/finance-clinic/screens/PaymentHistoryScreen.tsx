/**
 * Mali İşlemler — Ödeme Geçmişi + Bildirim
 *
 *   1. "Ödeme Bildir" CTA — havale/EFT/nakit dekontunu girer
 *   2. Bekleyen bildirimler kartı (onay sürecindekiler)
 *   3. Tahsil edilmiş ödemeler tablosu (admin onayından geçenler)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import {
  Banknote, ListChecks, CreditCard, Building2, FileText, ArrowDownToLine,
  Plus, Clock, CheckCircle2, X, AlertCircle, RefreshCcw,
} from 'lucide-react-native';

import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import {
  fetchPayments, fetchMySubmissions, cancelMySubmission,
  type PaymentRow, type PaymentSubmissionRow, type SubmissionStatus,
} from '../api';
import {
  DISPLAY, TRY, M, fmtDate, PAGE_PADDING,
  ErrorBar, Loader, Card, SecHeader, EmptyCard, PillButton,
} from '../components/atoms';
import { useRates, rateToBase } from '../../../core/money/rateCache';
import { groupByCurrency } from '../../../core/money/aggregations';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { SubmitPaymentModal } from '../components/SubmitPaymentModal';

type Props = { clinicId: string };

const METHOD_LABEL: Record<string, { label: string; icon: any; color: string }> = {
  kart:   { label: 'Kredi Kartı', icon: CreditCard, color: '#7C3AED' },
  nakit:  { label: 'Nakit',       icon: Banknote,   color: '#059669' },
  havale: { label: 'Havale',      icon: Building2,  color: '#0EA5E9' },
  eft:    { label: 'EFT',         icon: ArrowDownToLine, color: '#0369A1' },
  cek:    { label: 'Çek',         icon: FileText,   color: '#D97706' },
  diger:  { label: 'Diğer',       icon: Banknote,   color: DS.ink[500] },
};

const STATUS_CFG: Record<SubmissionStatus, { label: string; fg: string; bg: string }> = {
  pending:   { label: 'ONAY BEKLİYOR', fg: '#9C5E0E', bg: 'rgba(232,155,42,0.15)' },
  approved:  { label: 'ONAYLANDI',     fg: '#1F6B47', bg: 'rgba(45,154,107,0.14)' },
  rejected:  { label: 'REDDEDİLDİ',    fg: '#9C2E2E', bg: 'rgba(217,75,75,0.12)' },
  cancelled: { label: 'İPTAL',         fg: DS.ink[500], bg: DS.ink[100] },
};

export function PaymentHistoryScreen({ clinicId }: Props) {
  const TH = usePanelTheme();
  useRates();
  const [payments, setPayments]       = useState<PaymentRow[]>([]);
  const [submissions, setSubmissions] = useState<PaymentSubmissionRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [modalOpen, setModalOpen]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [p, s] = await Promise.all([
        fetchPayments(clinicId),
        fetchMySubmissions(clinicId),
      ]);
      setPayments(p); setSubmissions(s);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, [clinicId]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;
  if (error)   return <View style={{ padding: PAGE_PADDING }}><ErrorBar message={error} /></View>;

  const pendingSubs   = submissions.filter(s => s.status === 'pending');
  const recentReviewed = submissions.filter(s => s.status !== 'pending').slice(0, 5);

  // Katı per-currency: toplamlar para birimine göre BAĞIMSIZ (asla toplanmaz)
  const ccyLabel = (list: { amount: number; currency: string }[]) => {
    const g = groupByCurrency(list, p => ({ amount: Number(p.amount) || 0, currency: (p.currency || 'TRY') as Currency }));
    return g.length ? g.map(s => formatMoney(s.total, s.currency, { fractionDigits: 0 })).join(' · ') : '—';
  };
  const paidLabel = ccyLabel(payments);
  const pendingLabel = ccyLabel(pendingSubs);

  const handleCancel = async (id: string) => {
    try { await cancelMySubmission(id); await load(); }
    catch (e: any) { alert(`İptal başarısız: ${e?.message ?? e}`); }
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 48, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Başlık + Ödeme Bildir CTA */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 240 }}>
            <SecHeader
              eyebrow="Tahsilat"
              title="Ödeme Geçmişi"
              desc={
                payments.length === 0
                  ? (pendingSubs.length > 0 ? `${pendingSubs.length} bekleyen bildirim` : '—')
                  : `${payments.length} tahsil edilen · ${paidLabel}`
              }
            />
          </View>
          <PillButton
            variant="dark"
            onPress={() => setModalOpen(true)}
            leftIcon={<Plus size={13} color="#FFF" />}
          >
            Ödeme Bildir
          </PillButton>
        </View>

        {/* ─── Bekleyen bildirimler ─── */}
        {pendingSubs.length > 0 && (
          <View>
            <SecHeader
              eyebrow="İncelenmeyi Bekliyor"
              title={`${pendingSubs.length} Bildirim`}
              desc={`Toplam ${pendingLabel} · admin onayı sonrası işlenecek`}
            />
            <Card style={{ padding: 0, overflow: 'hidden', borderColor: 'rgba(232,155,42,0.30)' }}>
              {pendingSubs.map((s, i) => (
                <SubmissionRow
                  key={s.id}
                  s={s}
                  isLast={i === pendingSubs.length - 1}
                  onCancel={() => handleCancel(s.id)}
                />
              ))}
            </Card>
          </View>
        )}

        {/* ─── Son işlenen bildirimler ─── */}
        {recentReviewed.length > 0 && (
          <View>
            <SecHeader
              eyebrow="Geçmiş Bildirim"
              title="Sonuçlanan Bildirimler"
              desc="Son 5 inceleme"
            />
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {recentReviewed.map((s, i) => (
                <SubmissionRow
                  key={s.id}
                  s={s}
                  isLast={i === recentReviewed.length - 1}
                />
              ))}
            </Card>
          </View>
        )}

        {/* ─── Tahsil edilen ödemeler ─── */}
        <View>
          <SecHeader
            eyebrow="Onaylanan Tahsilat"
            title="Hesaba İşlenen Ödemeler"
            desc={payments.length === 0 ? '—' : `${payments.length} kayıt`}
          />
          {payments.length === 0 ? (
            <EmptyCard
              icon={ListChecks}
              title="Tahsilat kaydı yok"
              description="Henüz hesabınıza işlenmiş bir ödeme yok. Ödeme bildirimleri admin onayı sonrası burada görünür."
              cta={{ label: '+ Ödeme Bildir', onPress: () => setModalOpen(true) }}
            />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {payments.map((p, i) => {
                const cfg = METHOD_LABEL[p.payment_method] ?? METHOD_LABEL.diger;
                const Icon = cfg.icon;
                return (
                  <View
                    key={p.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingHorizontal: 16, paddingVertical: 14,
                      borderBottomWidth: i < payments.length - 1 ? 1 : 0,
                      borderBottomColor: DS.ink[100],
                    }}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: cfg.color + '18',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={16} color={cfg.color} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                        {cfg.label}
                        {p.invoice_no ? `  ·  Fatura ${p.invoice_no}` : ''}
                      </Text>
                      <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                        {fmtDate(p.payment_date)}
                        {p.reference_no ? `  ·  Ref. ${p.reference_no}` : ''}
                      </Text>
                    </View>
                    <Text style={{ ...DISPLAY, fontSize: 18, color: '#1F6B47', letterSpacing: -0.5 }}>
                      {M(p.amount, p.currency)}
                    </Text>
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      </ScrollView>

      <SubmitPaymentModal
        visible={modalOpen}
        clinicId={clinicId}
        onClose={() => setModalOpen(false)}
        onSubmitted={() => { void load(); }}
      />
    </>
  );
}

/* ──────── SubmissionRow ──────── */

function SubmissionRow({
  s, isLast, onCancel,
}: { s: PaymentSubmissionRow; isLast: boolean; onCancel?: () => void }) {
  const TH = usePanelTheme();
  const cfg    = METHOD_LABEL[s.payment_method] ?? METHOD_LABEL.diger;
  const status = STATUS_CFG[s.status];
  const Icon   = cfg.icon;
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: DS.ink[100],
      }}
    >
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: cfg.color + '18',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color={cfg.color} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
            {cfg.label}
            {s.invoice_no ? `  ·  Fatura ${s.invoice_no}` : ''}
          </Text>
          <View style={{
            paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
            backgroundColor: status.bg,
          }}>
            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.4, color: status.fg }}>
              {status.label}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 3 }}>
          {fmtDate(s.payment_date)}
          {s.reference_no ? `  ·  Ref. ${s.reference_no}` : ''}
          {s.bank_name ? `  ·  ${s.bank_name}` : ''}
        </Text>
        {s.sender_name ? (
          <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>
            Gönderen: {s.sender_name}
          </Text>
        ) : null}
        {s.status === 'rejected' && s.reject_reason ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
            <AlertCircle size={11} color="#9C2E2E" />
            <Text style={{ fontSize: 11, color: '#9C2E2E', flex: 1 }} numberOfLines={3}>
              {s.reject_reason}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], letterSpacing: -0.5 }}>
          {M(s.amount, s.currency)}
        </Text>
        {onCancel && s.status === 'pending' ? (
          <Pressable
            onPress={onCancel}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <X size={10} color={DS.ink[500]} />
            <Text style={{ fontSize: 10, color: DS.ink[500], fontWeight: '500' }}>İptal</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
