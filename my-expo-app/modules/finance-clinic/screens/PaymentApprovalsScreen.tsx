/**
 * Mali İşlemler — Admin: Ödeme Onayları
 *
 * Klinikler tarafından bildirilen havale/EFT/nakit ödemelerin onay paneli.
 * Admin onayladığında payments tablosuna gerçek kayıt düşer.
 */

import React, { useEffect, useState, useCallback, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Platform, ActivityIndicator } from 'react-native';
import {
  ListChecks, CheckCircle2, X, AlertCircle, Building2, Banknote,
  CreditCard, FileText, ArrowDownToLine, Clock, RefreshCcw,
} from '../../../core/ui/icons';

import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useInkUI } from '../../../core/theme/inkScale';
import {
  fetchPendingSubmissions, approveSubmission, rejectSubmission,
  type PaymentSubmissionRow,
} from '../api';
import {
  DISPLAY, TRY, M, fmtDate, PAGE_PADDING,
  ErrorBar, Loader, Card, SecHeader, EmptyCard, PillButton,
} from '../components/atoms';
import { useRates, rateToBase } from '../../../core/money/rateCache';
import { groupByCurrency } from '../../../core/money/aggregations';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { MobileTableX, MobileTableRowX, MobileTableIconX, useMobileTableText } from '../../../core/ui/MobileTableX';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';

type SubmissionWithClinic = PaymentSubmissionRow & { clinic_name?: string };

const METHOD_LABEL: Record<string, { label: string; icon: any; color: string }> = {
  kart:   { label: 'Kredi Kartı', icon: CreditCard, color: '#7C3AED' },
  nakit:  { label: 'Nakit',       icon: Banknote,   color: '#059669' },
  havale: { label: 'Havale',      icon: Building2,  color: '#0EA5E9' },
  eft:    { label: 'EFT',         icon: ArrowDownToLine, color: '#0369A1' },
  cek:    { label: 'Çek',         icon: FileText,   color: '#D97706' },
  diger:  { label: 'Diğer',       icon: Banknote,   color: DS.ink[500] },
};

export function PaymentApprovalsScreen() {
  const TH = usePanelTheme();
  const U = useInkUI();
  const MT = useMobileTableText();
  useRates();
  const isEmbedded = useContext(HubContext);   // FinanceHub içindeyse kendi başlığını gösterme
  const [items, setItems]     = useState<SubmissionWithClinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [acting, setActing]   = useState<string | null>(null);   // submission id with action in flight

  const [rejectTarget, setRejectTarget] = useState<SubmissionWithClinic | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await fetchPendingSubmissions() as SubmissionWithClinic[]); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleApprove = async (s: SubmissionWithClinic) => {
    setActing(s.id);
    try { await approveSubmission(s.id); await load(); }
    catch (e: any) { alert(`Onay başarısız: ${e?.message ?? e}`); }
    finally { setActing(null); }
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { alert('Red sebebi gerekli.'); return; }
    setActing(rejectTarget.id);
    try {
      await rejectSubmission(rejectTarget.id, rejectReason.trim());
      setRejectTarget(null); setRejectReason('');
      await load();
    } catch (e: any) { alert(`Red başarısız: ${e?.message ?? e}`); }
    finally { setActing(null); }
  };

  if (loading) return <Loader />;
  if (error)   return <View style={{ padding: PAGE_PADDING }}><ErrorBar message={error} /></View>;

  // Katı per-currency: bekleyen onaylar para birimine göre bağımsız
  const _pg = groupByCurrency(items, x => ({ amount: Number(x.amount) || 0, currency: (x.currency || 'TRY') as Currency }));
  const pendingLabel = _pg.length ? _pg.map(s => formatMoney(s.total, s.currency, { fractionDigits: 0 })).join(' · ') : '—';

  return (
    <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 48, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: isEmbedded ? 'flex-end' : 'space-between', flexWrap: 'wrap', gap: 12 }}>
          {!isEmbedded && (
            <View style={{ flex: 1, minWidth: 240 }}>
              <SecHeader
                eyebrow="Onay Kuyruğu"
                title="Ödeme Onayları"
                desc={items.length === 0 ? 'Bekleyen bildirim yok' : `${items.length} bildirim · ${pendingLabel}`}
              />
            </View>
          )}
          <PillButton variant="light" onPress={load} leftIcon={<RefreshCcw size={13} color={DS.ink[800]} />}>
            Yenile
          </PillButton>
        </View>

        {items.length === 0 ? (
          <EmptyCard
            icon={CheckCircle2}
            title="Bekleyen bildirim yok"
            description="Tüm ödeme bildirimleri işlendi. Yeni bildirim geldikçe burada görünür."
          />
        ) : (
          /* Ekstre / giderler mobil tablosuyla aynı kalıp */
          <MobileTableX
            title="Ödeme Onayları" count={items.length} countLabel="bildirim"
            footer={<>
              <Text style={MT.footNote}>{items.length} bildirim</Text>
              <View style={{ flex: 1 }} />
              <Text style={MT.footLabel}>Bekleyen:</Text>
              <MoneyMultiX slices={_pg} variant="inline" />
            </>}
          >
            {items.map((s, i) => {
              const cfg = METHOD_LABEL[s.payment_method] ?? METHOD_LABEL.diger;
              const Icon = cfg.icon;
              const busy = acting === s.id;
              const details = [
                s.reference_no ? `${autoT('Referans / Dekont')}: ${s.reference_no}` : null,
                s.bank_name ? `${autoT('Banka')}: ${s.bank_name}` : null,
                s.sender_name ? `${autoT('Gönderen')}: ${s.sender_name}` : null,
              ].filter(Boolean).join(' · ');
              return (
                <MobileTableRowX key={s.id} isLast={i === items.length - 1} align="flex-start">
                  <MobileTableIconX icon={Icon} tone={{ bg: cfg.color + '18', fg: cfg.color }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={MT.title} numberOfLines={1}>{s.clinic_name ?? autoT('Klinik')}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: cfg.color + '14' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: cfg.color, letterSpacing: 0.3 }}>
                          {autoT(cfg.label).toLocaleUpperCase(localeTag())}
                        </Text>
                      </View>
                      {s.invoice_no ? (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: U.chipNeutral }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: U.ink[700], letterSpacing: 0.3 }}>
                            {autoT('FATURA')} {s.invoice_no}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[MT.meta, { marginTop: 3 }]}>
                      {s.patient_name ? `${s.patient_name} · ` : ''}{autoT('Bildirim:')} {fmtDate(s.submitted_at.slice(0, 10))} · {autoT('Ödeme tarihi:')} {fmtDate(s.payment_date)}
                    </Text>
                    {details ? <Text style={[MT.meta, { marginTop: 2 }]}>{details}</Text> : null}
                    {s.notes ? <Text style={[MT.meta, { marginTop: 2 }]} numberOfLines={2}>{autoT('Not')}: {s.notes}</Text> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <GlassTooltip title={autoT('Reddet')} text={autoT('Bildirimi sebep yazarak reddeder')}>
                        <Pressable
                          disabled={busy}
                          onPress={() => { setRejectTarget(s); setRejectReason(''); }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg, opacity: busy ? 0.5 : 1, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}
                        >
                          <X size={12} color={U.plainBtn.fgMuted} strokeWidth={2} />
                          <Text style={{ fontSize: 11, fontWeight: '500', color: U.plainBtn.fg }}>Reddet</Text>
                        </Pressable>
                      </GlassTooltip>
                      <GlassTooltip title={autoT('Onayla & Hesaba İşle')} text={autoT('Ödemeyi onaylar ve klinik hesabına işler')}>
                        <Pressable
                          disabled={busy}
                          onPress={() => handleApprove(s)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: U.ink[900], opacity: busy ? 0.7 : 1, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}
                        >
                          {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : <CheckCircle2 size={12} color={U.onDarkPill} strokeWidth={2} />}
                          <Text style={{ fontSize: 11, fontWeight: '600', color: U.onDarkPill }}>{busy ? 'İşleniyor…' : 'Onayla & Hesaba İşle'}</Text>
                        </Pressable>
                      </GlassTooltip>
                    </View>
                  </View>
                  <Text style={MT.amount}>{M(s.amount, s.currency)}</Text>
                </MobileTableRowX>
              );
            })}
          </MobileTableX>
        )}
      </ScrollView>

      {/* Reddetme modalı */}
      <Modal visible={!!rejectTarget} animationType="fade" transparent onRequestClose={() => setRejectTarget(null)}>
        <Pressable
          onPress={() => setRejectTarget(null)}
          style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', alignItems: 'center', justifyContent: 'center', padding: 16, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{
            width: '100%', maxWidth: 460, backgroundColor: '#FFF', borderRadius: 18,
            padding: 22,
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(0,0,0,0.30)' } as any : { elevation: 24 }),
          }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#9C2E2E' }}>
              Bildirimi Reddet
            </Text>
            <Text style={{ ...DISPLAY, fontSize: 20, color: DS.ink[900], letterSpacing: -0.4, marginTop: 4 }}>
              {rejectTarget?.clinic_name} · {M(rejectTarget?.amount ?? 0, rejectTarget?.currency)}
            </Text>
            <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 6, lineHeight: 17 }}>
              Klinik bu sebebi görür. Bildirim "reddedildi" olarak işaretlenir, payments tablosuna kayıt düşmez.
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Örn: Dekont no eşleşmedi, banka kayıtlarında bulunamadı"
              placeholderTextColor={DS.ink[300]}
              multiline
              autoFocus
              style={{
                marginTop: 12,
                borderWidth: 1, borderColor: DS.ink[200], borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 10,
                fontSize: 13, color: DS.ink[900], minHeight: 80,
                textAlignVertical: 'top',
                outlineStyle: 'none' as any,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <PillButton variant="ghost" onPress={() => setRejectTarget(null)}>Vazgeç</PillButton>
              <PillButton
                variant="danger"
                disabled={!rejectReason.trim() || acting === rejectTarget?.id}
                onPress={submitReject}
                leftIcon={
                  acting === rejectTarget?.id
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <X size={13} color="#FFF" />
                }
              >
                Reddet
              </PillButton>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

