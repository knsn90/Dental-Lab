/**
 * Mali İşlemler — Ödeme Bildir modal'ı.
 *
 * Klinik kullanıcısı:
 *   1) Açık fatura seçer (opsiyonel — boş bırakırsa genel ödeme)
 *   2) Yöntem (havale / EFT / nakit / kart / çek / diğer)
 *   3) Tutar + ödeme tarihi
 *   4) Havale/EFT için: dekont no, banka, gönderen
 *   5) Notlar
 *
 * Submit → `submit_payment` RPC → 'pending' statüde admin onayına düşer.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, Modal, Platform,
  ActivityIndicator,
} from 'react-native';
import {
  X, Building2, Banknote, CreditCard, FileText, CheckCircle2, AlertCircle,
  ArrowDownToLine, Hash, User as UserIcon,
} from 'lucide-react-native';

import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';
import { DatePicker } from '../../../core/ui/DatePicker';
import {
  submitPayment, fetchOpenInvoices,
  type ClinicInvoiceRow, type SubmissionMethod,
} from '../api';
import { DISPLAY, TRY, M, fmtDate, PillButton } from './atoms';
import { useRates } from '../../../core/money/rateCache';

type Props = {
  visible: boolean;
  clinicId: string;
  initialInvoiceId?: string;
  onClose: () => void;
  onSubmitted: () => void;
};

const METHODS: { key: SubmissionMethod; label: string; icon: any; color: string; needsRef?: boolean }[] = [
  { key: 'havale', label: 'Havale',   icon: Building2,  color: '#0EA5E9', needsRef: true  },
  { key: 'eft',    label: 'EFT',      icon: ArrowDownToLine, color: '#0369A1', needsRef: true },
  { key: 'kart',   label: 'Kart',     icon: CreditCard, color: '#7C3AED' },
  { key: 'nakit',  label: 'Nakit',    icon: Banknote,   color: '#059669' },
  { key: 'cek',    label: 'Çek',      icon: FileText,   color: '#D97706', needsRef: true },
  { key: 'diger',  label: 'Diğer',    icon: Banknote,   color: DS.ink[500] },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

export function SubmitPaymentModal({
  visible, clinicId, initialInvoiceId, onClose, onSubmitted,
}: Props) {
  const TH = usePanelTheme();
  useRates();
  useBaseCurrency();

  // Form state
  const [method, setMethod]         = useState<SubmissionMethod>('havale');
  const [invoiceId, setInvoiceId]   = useState<string | null>(initialInvoiceId ?? null);
  const [amount, setAmount]         = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(todayISO());
  const [referenceNo, setReferenceNo] = useState('');
  const [bankName, setBankName]     = useState('');
  const [senderName, setSenderName] = useState('');
  const [notes, setNotes]           = useState('');
  const [invoices, setInvoices]     = useState<ClinicInvoiceRow[]>([]);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  const methodCfg = METHODS.find(m => m.key === method)!;
  const needsRef  = !!methodCfg.needsRef;

  // Modal açıldığında fatura listesini yükle + form'u resetle
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setError(null); setSuccess(false);
    setMethod('havale');
    setInvoiceId(initialInvoiceId ?? null);
    setAmount('');
    setPaymentDate(todayISO());
    setReferenceNo(''); setBankName(''); setSenderName(''); setNotes('');
    fetchOpenInvoices(clinicId)
      .then(rows => { if (!cancelled) setInvoices(rows); })
      .catch(() => { /* yoksayılır — fatura seçimi opsiyonel */ });
    return () => { cancelled = true; };
  }, [visible, clinicId, initialInvoiceId]);

  // Seçili fatura — auto-suggest amount
  const selectedInvoice = useMemo(
    () => invoices.find(i => i.id === invoiceId),
    [invoices, invoiceId],
  );

  // Faturayı seçince kalanı amount'a doldur (eğer kullanıcı henüz boşsa)
  useEffect(() => {
    if (selectedInvoice && !amount) {
      setAmount(String(selectedInvoice.remaining));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoice]);

  const parsedAmount = Number(amount.replace(/\./g, '').replace(',', '.')) || 0;

  const canSubmit =
    parsedAmount > 0 &&
    !!paymentDate &&
    !!method &&
    (!needsRef || referenceNo.trim().length > 0) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      await submitPayment({
        clinicId,
        invoiceId: invoiceId ?? null,
        amount: parsedAmount,
        method,
        paymentDate,
        referenceNo: referenceNo.trim() || null,
        bankName:    bankName.trim()    || null,
        senderName:  senderName.trim()  || null,
        notes:       notes.trim()       || null,
      });
      setSuccess(true);
      setTimeout(() => {
        onSubmitted();
        onClose();
      }, 1200);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setSubmitting(false); }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1, backgroundColor: 'rgba(10,14,26,0.42)',
          alignItems: 'center', justifyContent: 'center',
          padding: 16,
          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
        }}
      >
        {/* Modal container — backdrop tıklamasını yutar */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 560, maxHeight: '92%',
            backgroundColor: '#FFF', borderRadius: 22,
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(0,0,0,0.30)' } as any : { elevation: 24 }),
          }}
        >
          {/* Header */}
          <View style={{
            paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: DS.ink[100],
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>
                Ödeme Bildir
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5, marginTop: 4 }}>
                Yeni Tahsilat Bildirimi
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4, lineHeight: 17 }}>
                Bilgileri girdikten sonra ödeme admin onayına düşer. Onaylanınca cari hesabınıza işlenir.
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4, marginLeft: 8 }}>
              <X size={20} color={DS.ink[500]} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 18, gap: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {success ? (
              <View style={{
                padding: 24, alignItems: 'center', gap: 8,
                backgroundColor: 'rgba(45,154,107,0.08)', borderRadius: 16,
                borderWidth: 1, borderColor: 'rgba(45,154,107,0.25)',
              }}>
                <CheckCircle2 size={36} color="#1F6B47" />
                <Text style={{ ...DISPLAY, fontSize: 20, color: DS.ink[900], letterSpacing: -0.3 }}>
                  Bildirim alındı
                </Text>
                <Text style={{ fontSize: 12, color: DS.ink[500], textAlign: 'center', maxWidth: 320 }}>
                  Ödemeniz admin onayına gönderildi. Onaylandığında bildirim alacaksınız.
                </Text>
              </View>
            ) : (
              <>
                {/* ─── Yöntem ─── */}
                <FormSection label="Ödeme Yöntemi">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {METHODS.map(m => {
                      const Icon = m.icon;
                      const active = method === m.key;
                      return (
                        <Pressable
                          key={m.key}
                          onPress={() => setMethod(m.key)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                            paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
                            borderWidth: 1,
                            borderColor: active ? m.color : DS.ink[200],
                            backgroundColor: active ? m.color + '14' : '#FFF',
                          }}
                        >
                          <Icon size={13} color={active ? m.color : DS.ink[500]} strokeWidth={2} />
                          <Text style={{
                            fontSize: 12, fontWeight: '600',
                            color: active ? m.color : DS.ink[700],
                          }}>
                            {m.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </FormSection>

                {/* ─── Fatura (opsiyonel) ─── */}
                <FormSection label="Fatura (opsiyonel)">
                  <View style={{ position: 'relative', zIndex: invoiceOpen ? 100 : 1 }}>
                    <Pressable
                      onPress={() => setInvoiceOpen(o => !o)}
                      style={{
                        borderWidth: 1, borderColor: DS.ink[200], borderRadius: 10,
                        paddingHorizontal: 12, paddingVertical: 10,
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        backgroundColor: '#FFF',
                      }}
                    >
                      <FileText size={14} color={DS.ink[500]} />
                      <Text style={{ flex: 1, fontSize: 13, color: selectedInvoice ? DS.ink[900] : DS.ink[400] }}>
                        {selectedInvoice
                          ? `Fatura ${selectedInvoice.invoice_no ?? '—'} · Kalan ${M(selectedInvoice.remaining, selectedInvoice.currency)}`
                          : 'Fatura seçilmedi (genel ödeme)'}
                      </Text>
                      <Text style={{ fontSize: 10, color: DS.ink[400] }}>▼</Text>
                    </Pressable>
                    {invoiceOpen && (
                      <View style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                        backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200],
                        borderRadius: 10, maxHeight: 260, overflow: 'hidden', zIndex: 100,
                        ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.18)' } as any : { elevation: 12 }),
                      }}>
                        <ScrollView style={{ maxHeight: 260 }}>
                          <Pressable
                            onPress={() => { setInvoiceId(null); setInvoiceOpen(false); }}
                            style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: DS.ink[100] }}
                          >
                            <Text style={{ fontSize: 12, color: invoiceId === null ? TH.primary : DS.ink[800] }}>
                              Fatura seçme (genel ödeme)
                            </Text>
                          </Pressable>
                          {invoices.length === 0 ? (
                            <View style={{ padding: 14 }}>
                              <Text style={{ fontSize: 11, color: DS.ink[400] }}>Açık fatura yok.</Text>
                            </View>
                          ) : invoices.map((inv, i) => {
                            const active = inv.id === invoiceId;
                            return (
                              <Pressable
                                key={inv.id}
                                onPress={() => { setInvoiceId(inv.id); setInvoiceOpen(false); }}
                                style={{
                                  paddingHorizontal: 12, paddingVertical: 10,
                                  borderBottomWidth: i < invoices.length - 1 ? 1 : 0,
                                  borderBottomColor: DS.ink[100],
                                  backgroundColor: active ? TH.bgSoft : '#FFF',
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: active ? TH.primary : DS.ink[900] }} numberOfLines={1}>
                                    Fatura {inv.invoice_no ?? '—'}
                                  </Text>
                                  <Text style={{ ...DISPLAY, fontSize: 14, color: inv.days_overdue > 0 ? '#9C2E2E' : DS.ink[900] }}>
                                    {M(inv.remaining, inv.currency)}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 10, color: inv.days_overdue > 0 ? '#9C2E2E' : DS.ink[500], marginTop: 2 }}>
                                  Vade {fmtDate(inv.due_date)}
                                  {inv.days_overdue > 0 ? ` · ${inv.days_overdue} gün gecikme` : ''}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                </FormSection>

                {/* ─── Tutar + Tarih ─── */}
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  <View style={{ flex: 1, minWidth: 180 }}>
                    <FormSection label={`Tutar (${baseSymbol()})`}>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        borderWidth: 1, borderColor: parsedAmount > 0 ? TH.primary : DS.ink[200],
                        borderRadius: 10, paddingHorizontal: 12,
                        backgroundColor: '#FFF',
                      }}>
                        <Text style={{ fontSize: 16, color: DS.ink[400], fontWeight: '500' }}>{baseSymbol()}</Text>
                        <TextInput
                          value={amount}
                          onChangeText={setAmount}
                          keyboardType="decimal-pad"
                          placeholder="0,00"
                          placeholderTextColor={DS.ink[300]}
                          style={{
                            flex: 1, fontSize: 16, fontWeight: '500',
                            color: DS.ink[900], paddingVertical: 9,
                            outlineStyle: 'none' as any,
                          }}
                        />
                      </View>
                    </FormSection>
                  </View>
                  <View style={{ flex: 1, minWidth: 180 }}>
                    <FormSection label="Ödeme Tarihi">
                      <DatePicker
                        value={paymentDate}
                        onChange={setPaymentDate}
                        accent={TH.primary}
                        compact
                        maxDate={todayISO()}
                      />
                    </FormSection>
                  </View>
                </View>

                {/* ─── Havale/EFT bilgileri ─── */}
                {(method === 'havale' || method === 'eft' || method === 'cek') && (
                  <View style={{ gap: 14, padding: 14, backgroundColor: DS.ink[50], borderRadius: 12, borderWidth: 1, borderColor: DS.ink[200] }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Hash size={11} color={DS.ink[500]} />
                      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
                        {method === 'cek' ? 'Çek Bilgileri' : 'Dekont Bilgileri'}
                      </Text>
                    </View>

                    <FormField
                      label={method === 'cek' ? 'Çek No' : 'Dekont / Referans No *'}
                      value={referenceNo}
                      onChange={setReferenceNo}
                      placeholder={method === 'cek' ? '1234567' : 'ÖRN: TRY2026053012345'}
                      required
                    />

                    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                      <View style={{ flex: 1, minWidth: 180 }}>
                        <FormField
                          label="Banka"
                          value={bankName}
                          onChange={setBankName}
                          placeholder="ÖRN: İş Bankası"
                          leftIcon={<Building2 size={13} color={DS.ink[400]} />}
                        />
                      </View>
                      <View style={{ flex: 1, minWidth: 180 }}>
                        <FormField
                          label="Gönderen"
                          value={senderName}
                          onChange={setSenderName}
                          placeholder="Gönderici isim / firma"
                          leftIcon={<UserIcon size={13} color={DS.ink[400]} />}
                        />
                      </View>
                    </View>
                  </View>
                )}

                {/* ─── Notlar ─── */}
                <FormSection label="Notlar (opsiyonel)">
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Eklemek istediğiniz açıklama"
                    placeholderTextColor={DS.ink[300]}
                    multiline
                    style={{
                      borderWidth: 1, borderColor: DS.ink[200], borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10,
                      fontSize: 13, color: DS.ink[900], minHeight: 64,
                      textAlignVertical: 'top',
                      backgroundColor: '#FFF',
                      outlineStyle: 'none' as any,
                    }}
                  />
                </FormSection>

                {/* Error */}
                {error && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    padding: 10, borderRadius: 10,
                    backgroundColor: 'rgba(217,75,75,0.08)', borderWidth: 1, borderColor: 'rgba(217,75,75,0.25)',
                  }}>
                    <AlertCircle size={14} color="#9C2E2E" />
                    <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E' }}>{error}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Footer aksiyon */}
          {!success && (
            <View style={{
              paddingHorizontal: 22, paddingVertical: 14,
              borderTopWidth: 1, borderTopColor: DS.ink[100],
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            }}>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                * Zorunlu alan
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PillButton variant="ghost" onPress={onClose}>Vazgeç</PillButton>
                <PillButton
                  variant="dark"
                  disabled={!canSubmit}
                  onPress={handleSubmit}
                  leftIcon={
                    submitting
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <CheckCircle2 size={13} color="#FFF" />
                  }
                >
                  {submitting ? 'Gönderiliyor…' : 'Bildirimi Gönder'}
                </PillButton>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ──────── form helpers ──────── */

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function FormField({
  label, value, onChange, placeholder, required, leftIcon,
}: {
  label: string; value: string; onChange: (s: string) => void;
  placeholder?: string; required?: boolean; leftIcon?: React.ReactNode;
}) {
  const TH = usePanelTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.4, color: DS.ink[500] }}>
        {label}
      </Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderWidth: 1, borderColor: required && !value.trim() ? 'rgba(217,75,75,0.40)' : DS.ink[200],
        borderRadius: 10, paddingHorizontal: 10,
        backgroundColor: '#FFF',
      }}>
        {leftIcon}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={DS.ink[300]}
          style={{
            flex: 1, fontSize: 13, color: DS.ink[900], paddingVertical: 9,
            outlineStyle: 'none' as any,
          }}
        />
      </View>
    </View>
  );
}
