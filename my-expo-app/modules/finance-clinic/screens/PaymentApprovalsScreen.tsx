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
} from 'lucide-react-native';

import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
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
          <View style={{ gap: 12 }}>
            {items.map(s => {
              const cfg = METHOD_LABEL[s.payment_method] ?? METHOD_LABEL.diger;
              const Icon = cfg.icon;
              const busy = acting === s.id;
              return (
                <Card key={s.id} style={{ padding: 16, borderColor: 'rgba(232,155,42,0.30)' }}>
                  {/* Header row: clinic + amount + status */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <View style={{
                      width: 44, height: 44, borderRadius: 12,
                      backgroundColor: cfg.color + '18',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={20} color={cfg.color} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                          {s.clinic_name ?? 'Klinik'}
                        </Text>
                        <View style={{
                          paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
                          backgroundColor: cfg.color + '14',
                        }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: cfg.color, letterSpacing: 0.3 }}>
                            {cfg.label.toUpperCase()}
                          </Text>
                        </View>
                        {s.invoice_no && (
                          <View style={{
                            paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
                            backgroundColor: DS.ink[100],
                          }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: DS.ink[700], letterSpacing: 0.3 }}>
                              FATURA {s.invoice_no}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 4 }}>
                        {s.patient_name ? `${s.patient_name} · ` : ''}
                        Bildirim: {fmtDate(s.submitted_at.slice(0, 10))} · Ödeme tarihi: {fmtDate(s.payment_date)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ ...DISPLAY, fontSize: 24, color: DS.ink[900], letterSpacing: -0.7 }}>
                        {M(s.amount, s.currency)}
                      </Text>
                    </View>
                  </View>

                  {/* Detay grid */}
                  <View style={{
                    marginTop: 12, padding: 12,
                    backgroundColor: DS.ink[50], borderRadius: 12,
                    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
                  }}>
                    {s.reference_no && (
                      <DetailItem label="Referans / Dekont" value={s.reference_no} />
                    )}
                    {s.bank_name && (
                      <DetailItem label="Banka" value={s.bank_name} />
                    )}
                    {s.sender_name && (
                      <DetailItem label="Gönderen" value={s.sender_name} />
                    )}
                    {s.notes && (
                      <View style={{ flexBasis: '100%' }}>
                        <DetailItem label="Not" value={s.notes} />
                      </View>
                    )}
                  </View>

                  {/* Aksiyonlar */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <PillButton
                      variant="ghost"
                      disabled={busy}
                      onPress={() => { setRejectTarget(s); setRejectReason(''); }}
                      leftIcon={<X size={13} color={DS.ink[700]} />}
                    >
                      Reddet
                    </PillButton>
                    <PillButton
                      variant="dark"
                      disabled={busy}
                      onPress={() => handleApprove(s)}
                      leftIcon={busy ? <ActivityIndicator size="small" color="#FFF" /> : <CheckCircle2 size={13} color="#FFF" />}
                    >
                      {busy ? 'İşleniyor…' : 'Onayla & Hesaba İşle'}
                    </PillButton>
                  </View>
                </Card>
              );
            })}
          </View>
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 140 }}>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: DS.ink[500] }}>
        {label}
      </Text>
      <Text style={{ fontSize: 12, color: DS.ink[900], marginTop: 2, fontWeight: '500' }}>
        {value}
      </Text>
    </View>
  );
}
