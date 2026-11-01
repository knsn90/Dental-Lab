/**
 * Mali İşlemler — Ödeme Geçmişi + Bildirim
 *
 *   1. "Ödeme Bildir" CTA — havale/EFT/nakit dekontunu girer
 *   2. Bekleyen bildirimler kartı (onay sürecindekiler)
 *   3. Tahsil edilmiş ödemeler tablosu (admin onayından geçenler)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import {
  Banknote, ListChecks, CreditCard, Building2, FileText, ArrowDownToLine,
  Plus, Clock, CheckCircle2, X, AlertCircle, RefreshCcw,
} from '../../../core/ui/icons';

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
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { MobileTableX, MobileTableRowX, MobileTableIconX, useMobileTableText } from '../../../core/ui/MobileTableX';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';

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
  const U = useInkUI();
  const MT = useMobileTableText();
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
  const ccySlices = (list: { amount: number; currency: string }[]) =>
    groupByCurrency(list, p => ({ amount: Number(p.amount) || 0, currency: (p.currency || 'TRY') as Currency }));
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
              eyebrow="Ödemeler"
              title="Ödeme Geçmişi"
              desc={
                payments.length === 0
                  ? (pendingSubs.length > 0 ? `${pendingSubs.length} bekleyen bildirim` : '—')
                  : `${payments.length} ödeme · ${paidLabel}`
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
          /* Ekstre / giderler mobil tablosuyla aynı kalıp */
          <MobileTableX
            title="İncelenmeyi Bekliyor" count={pendingSubs.length} countLabel="bildirim"
            footer={<>
              <Text style={MT.footNote}>{pendingSubs.length} bildirim</Text>
              <View style={{ flex: 1 }} />
              <Text style={MT.footLabel}>Bekleyen:</Text>
              <MoneyMultiX slices={ccySlices(pendingSubs)} variant="inline" />
            </>}
          >
              {pendingSubs.map((s, i) => (
                <SubmissionRow
                  key={s.id}
                  s={s}
                  isLast={i === pendingSubs.length - 1}
                  onCancel={() => handleCancel(s.id)}
                />
              ))}
          </MobileTableX>
        )}

        {/* ─── Son işlenen bildirimler ─── */}
        {recentReviewed.length > 0 && (
          <MobileTableX title="Sonuçlanan Bildirimler" count={recentReviewed.length} countLabel="kayıt">
              {recentReviewed.map((s, i) => (
                <SubmissionRow
                  key={s.id}
                  s={s}
                  isLast={i === recentReviewed.length - 1}
                />
              ))}
          </MobileTableX>
        )}

        {/* ─── Yapılan ödemeler (klinik gözüyle) ─── */}
        {payments.length === 0 ? (
          <View>
            <SecHeader
              eyebrow="Onaylanan Tahsilat"
              title="Hesaba İşlenen Ödemeler"
              desc="—"
            />
            <EmptyCard
              icon={ListChecks}
              title="Tahsilat kaydı yok"
              description="Henüz hesabınıza işlenmiş bir ödeme yok. Ödeme bildirimleri admin onayı sonrası burada görünür."
              cta={{ label: '+ Ödeme Bildir', onPress: () => setModalOpen(true) }}
            />
          </View>
        ) : (
          <MobileTableX
            title="Hesaba İşlenen Ödemeler" count={payments.length} countLabel="kayıt"
            footer={<>
              <Text style={MT.footNote}>{payments.length} kayıt</Text>
              <View style={{ flex: 1 }} />
              <Text style={MT.footLabel}>Toplam:</Text>
              <MoneyMultiX slices={ccySlices(payments)} variant="inline" />
            </>}
          >
            {payments.map((p, i) => {
              const cfg = METHOD_LABEL[p.payment_method] ?? METHOD_LABEL.diger;
              const title = [autoT(cfg.label), p.invoice_no ? `${autoT('Fatura')} ${p.invoice_no}` : null, p.patient_name || null].filter(Boolean).join(' · ');
              return (
                <MobileTableRowX key={p.id} isLast={i === payments.length - 1}>
                  <MobileTableIconX icon={cfg.icon} tone={{ bg: cfg.color + '18', fg: cfg.color }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={MT.title} numberOfLines={1}>{title}</Text>
                    <Text style={MT.sub} numberOfLines={1}>
                      {fmtDate(p.payment_date)}
                      {p.reference_no ? `  ·  ${autoT('Ref.')} ${p.reference_no}` : ''}
                    </Text>
                  </View>
                  <Text style={[MT.amount, { color: U.chipTones.success.fg }]}>
                    {M(p.amount, p.currency)}
                  </Text>
                </MobileTableRowX>
              );
            })}
          </MobileTableX>
        )}
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
  const U = useInkUI();
  const MT = useMobileTableText();
  const cfg    = METHOD_LABEL[s.payment_method] ?? METHOD_LABEL.diger;
  const status = STATUS_CFG[s.status];
  const title = [autoT(cfg.label), s.invoice_no ? `${autoT('Fatura')} ${s.invoice_no}` : null, s.patient_name || null].filter(Boolean).join(' · ');
  return (
    <MobileTableRowX isLast={isLast} align="flex-start">
      <MobileTableIconX icon={cfg.icon} tone={{ bg: cfg.color + '18', fg: cfg.color }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[MT.title, { flexShrink: 1 }]} numberOfLines={1}>{title}</Text>
          <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: status.bg }}>
            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.4, color: status.fg }}>
              {status.label}
            </Text>
          </View>
        </View>
        <Text style={MT.sub} numberOfLines={1}>
          {fmtDate(s.payment_date)}
          {s.reference_no ? `  ·  ${autoT('Ref.')} ${s.reference_no}` : ''}
          {s.bank_name ? `  ·  ${s.bank_name}` : ''}
        </Text>
        {s.sender_name ? (
          <Text style={[MT.meta, { marginTop: 2 }]} numberOfLines={1}>
            {autoT('Gönderen:')} {s.sender_name}
          </Text>
        ) : null}
        {s.status === 'rejected' && s.reject_reason ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4 }}>
            <AlertCircle size={11} color={U.chipTones.danger.fg} />
            <Text style={{ fontSize: 11, color: U.chipTones.danger.fg, flex: 1 }} numberOfLines={3}>
              {s.reject_reason}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={MT.amount}>
          {M(s.amount, s.currency)}
        </Text>
        {onCancel && s.status === 'pending' ? (
          <GlassTooltip title={autoT('İptal')} text={autoT('Bildirimi iptal eder')}>
            <Pressable
              onPress={onCancel}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <X size={10} color={U.plainBtn.fgMuted} />
              <Text style={{ fontSize: 10, color: U.plainBtn.fg, fontWeight: '500' }}>İptal</Text>
            </Pressable>
          </GlassTooltip>
        ) : null}
      </View>
    </MobileTableRowX>
  );
}
