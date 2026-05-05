/**
 * InvoiceDetailScreen — Fatura Detayı (Patterns Design Language)
 *
 * Patterns showcase §05 cardSolid, §09 tablo, §10 hero,
 * §04 chip/tag token'larıyla fatura belge görünümü.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert,
  Modal, TextInput, ActivityIndicator, Platform,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowLeft, Printer, Banknote, CreditCard, Landmark, File,
  MoreHorizontal, Building2, User, Phone, MapPin, Calendar,
  ClipboardList, Plus, Trash2, Send, BellRing, CircleX,
  CircleCheck, X, AlertCircle, ChevronRight, FileText,
} from 'lucide-react-native';
import { toast } from '../../../core/ui/Toast';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { DS } from '../../../core/theme/dsTokens';
import { useInvoice } from '../hooks/useInvoices';
import {
  recordPayment, setInvoiceStatus, deleteInvoice,
  addInvoiceItem, deleteInvoiceItem,
} from '../api';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS, type PaymentMethod,
} from '../types';
import { printInvoice } from '../printInvoice';
import { PaymentReminderModal } from '../components/PaymentReminderModal';
import { EFaturaPanel } from '../../efatura/components/EFaturaPanel';
import { PaymentLinkPanel } from '../../payments/components/PaymentLinkPanel';

// ── Patterns tokens (§05 kartlar) ───────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  // @ts-ignore web
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

// §09 tablo kartı — borderWidth variant
const tableCard = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden' as const,
};

// §04 chip tones
const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', text: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', text: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  text: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', text: '#1F5689' },
  neutral: { bg: DS.ink[100],             text: DS.ink[500] },
};

const modalShadow = '0 24px 48px -12px rgba(0,0,0,0.18)';

const STATUS_CHIP: Record<string, { bg: string; text: string }> = {
  taslak:       CHIP_TONES.neutral,
  kesildi:      CHIP_TONES.info,
  kismi_odendi: CHIP_TONES.warning,
  odendi:       CHIP_TONES.success,
  iptal:        CHIP_TONES.danger,
};

// §09 tablo header stili
const TH = {
  fontSize: 10 as const,
  fontWeight: '600' as const,
  letterSpacing: 0.7,
  color: DS.ink[500],
};

// ── Helpers ─────────────────────────────────────────────────────────
function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function InvoiceDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { invoice, loading, refetch } = useInvoice(id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={DS.ink[400]} />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AlertCircle size={40} strokeWidth={1.4} color={DS.ink[300]} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>Fatura bulunamadi</Text>
        <Pressable onPress={() => router.back()} style={{
          paddingHorizontal: 20, paddingVertical: 10, borderRadius: 9999,
          backgroundColor: DS.ink[100], cursor: 'pointer' as any,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>Geri don</Text>
        </Pressable>
      </View>
    );
  }

  const chip = STATUS_CHIP[invoice.status] ?? CHIP_TONES.neutral;
  const balance = Number(invoice.total) - Number(invoice.paid_amount);
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = invoice.due_date && invoice.due_date < today
    && invoice.status !== 'odendi' && invoice.status !== 'iptal';

  const handlePrint = async () => {
    const res = await printInvoice(invoice);
    if (!res.ok && res.error) toast.error(res.error);
  };
  const handleMarkSent = async () => {
    setBusy(true);
    const { error } = await setInvoiceStatus(invoice.id, 'kesildi');
    setBusy(false);
    if (error) toast.error((error as any).message ?? String(error)); else refetch();
  };
  const handleCancel = () => {
    Alert.alert('Fatura Iptal', 'Bu faturayi iptal etmek istediginize emin misiniz?', [
      { text: 'Vazgec', style: 'cancel' },
      { text: 'Iptal Et', style: 'destructive', onPress: async () => {
        setBusy(true);
        const { error } = await setInvoiceStatus(invoice.id, 'iptal');
        setBusy(false);
        if (error) toast.error((error as any).message ?? String(error)); else refetch();
      }},
    ]);
  };
  const handleDelete = () => {
    Alert.alert('Faturayi Sil', 'Bu taslak fatura silinecek. Geri alinamaz.', [
      { text: 'Vazgec', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        setBusy(true);
        const { error } = await deleteInvoice(invoice.id);
        setBusy(false);
        if (error) toast.error((error as any).message ?? String(error)); else router.back();
      }},
    ]);
  };

  const items = (invoice.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  return (
    <View style={{ flex: 1 }}>

      {/* ── Toolbar — pill buttons on DS.ink[50] bg ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: 20, paddingVertical: 10,
      }}>
        <Pressable onPress={() => router.back()} style={{
          width: 36, height: 36, borderRadius: 10,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          cursor: 'pointer' as any,
        }}>
          <ArrowLeft size={17} strokeWidth={1.8} color={DS.ink[900]} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {invoice.status === 'taslak' && (
          <PillBtn icon={Send} label="Kesildi Isaretle" color={CHIP_TONES.info.text} bg={CHIP_TONES.info.bg} onPress={handleMarkSent} disabled={busy} />
        )}
        {(invoice.status === 'kesildi' || invoice.status === 'kismi_odendi') && (
          <PillBtn icon={BellRing} label="Hatirlatma" color={CHIP_TONES.warning.text} bg={CHIP_TONES.warning.bg} onPress={() => setReminderOpen(true)} disabled={busy} />
        )}
        {balance > 0 && invoice.status !== 'iptal' && (
          <PillBtn icon={Banknote} label="Tahsilat Ekle" onPress={() => setPaymentModalVisible(true)} dark />
        )}
        <PillBtn icon={Printer} onPress={handlePrint} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          alignItems: 'center', padding: isDesktop ? 32 : 16, paddingBottom: 80,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════════════════════════════════════════════
            §10 HERO — Fatura özet kartı (koşullu: overdue=dark, normal=lab.bg)
            ═══════════════════════════════════════════════════════════ */}
        <View style={{
          width: '100%', maxWidth: 800,
          borderRadius: 28, padding: isDesktop ? 36 : 24,
          backgroundColor: isOverdue ? DS.ink[900] : DS.lab.bg,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* §10 decorative circles */}
          <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: isOverdue ? 'rgba(255,255,255,0.06)' : DS.lab.bgDeep, opacity: 0.6 }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: isOverdue ? 'rgba(255,255,255,0.03)' : DS.lab.bgDeep, opacity: 0.4 }} />

          {/* Row 1: FATURA title + number + status */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Text style={{
              ...DISPLAY, fontSize: isDesktop ? 40 : 28, letterSpacing: -1.4,
              color: isOverdue ? '#FFF' : DS.ink[900],
            }}>
              FATURA
            </Text>
            <View style={{
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
              backgroundColor: isOverdue ? 'rgba(217,75,75,0.25)' : chip.bg,
            }}>
              <Text style={{
                fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase',
                color: isOverdue ? '#EF4444' : chip.text,
              }}>
                {isOverdue ? 'Vadesi Gecti' : INVOICE_STATUS_LABELS[invoice.status]}
              </Text>
            </View>
          </View>
          <Text style={{
            fontSize: 13, fontFamily: 'monospace',
            color: isOverdue ? 'rgba(255,255,255,0.5)' : DS.ink[500],
            marginBottom: 20,
          }}>
            {invoice.invoice_number}
          </Text>

          {/* Row 2: BigStats — toplam, ödenen, kalan */}
          <View style={{ flexDirection: 'row', gap: isDesktop ? 48 : 24, flexWrap: 'wrap' }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: isOverdue ? 'rgba(255,255,255,0.5)' : DS.ink[500], marginBottom: 6 }}>
                Toplam
              </Text>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 40 : 28, letterSpacing: -1.4, color: isOverdue ? '#FFF' : DS.ink[900] }}>
                {fmtMoney(invoice.total)}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: isOverdue ? 'rgba(255,255,255,0.5)' : DS.ink[500], marginBottom: 6 }}>
                Odenen
              </Text>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 40 : 28, letterSpacing: -1.4, color: isOverdue ? CHIP_TONES.success.text : '#059669' }}>
                {fmtMoney(invoice.paid_amount)}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: isOverdue ? 'rgba(255,255,255,0.5)' : DS.ink[500], marginBottom: 6 }}>
                Kalan
              </Text>
              <Text style={{
                ...DISPLAY, fontSize: isDesktop ? 40 : 28, letterSpacing: -1.4,
                color: balance <= 0 ? '#059669' : (isOverdue ? '#EF4444' : DS.ink[900]),
              }}>
                {fmtMoney(balance)}
              </Text>
            </View>
          </View>

          {/* Dates row */}
          <View style={{
            flexDirection: 'row', gap: 24, marginTop: 20, paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: isOverdue ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          }}>
            <View>
              <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: isOverdue ? 'rgba(255,255,255,0.4)' : DS.ink[400] }}>Duzenleme</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: isOverdue ? 'rgba(255,255,255,0.7)' : DS.ink[900], marginTop: 3 }}>{fmtDate(invoice.issue_date)}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: isOverdue ? 'rgba(255,255,255,0.4)' : DS.ink[400] }}>Vade</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: isOverdue ? '#EF4444' : DS.ink[900], marginTop: 3 }}>{fmtDate(invoice.due_date)}</Text>
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            §05 cardSolid — Alici bilgileri
            ═══════════════════════════════════════════════════════════ */}
        <View style={{ width: '100%', maxWidth: 800 }}>
          <View style={{
            ...cardSolid,
            flexDirection: isDesktop ? 'row' : 'column',
            gap: isDesktop ? 40 : 16,
          }}>
            {/* Alici */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], marginBottom: 10 }}>Alici</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>{invoice.clinic?.name ?? '—'}</Text>
              {invoice.doctor?.full_name && <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 4 }}>Dr. {invoice.doctor.full_name}</Text>}
              {invoice.doctor?.phone && <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>{invoice.doctor.phone}</Text>}
              {invoice.clinic?.address && <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2, maxWidth: 280 }}>{invoice.clinic.address}</Text>}
            </View>

            {/* Is emirleri */}
            {(invoice.linked_orders?.length || invoice.work_order) && (
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], marginBottom: 10 }}>Is Emirleri</Text>
                {(invoice.linked_orders && invoice.linked_orders.length > 0)
                  ? invoice.linked_orders.map(lo => lo.work_order && (
                      <Pressable key={lo.work_order_id} onPress={() => router.push(`/(lab)/order/${lo.work_order!.id}` as any)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer' as any }}>
                        <ClipboardList size={12} strokeWidth={1.6} color="#2563EB" />
                        <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '500' }}>
                          {lo.work_order.order_number}{lo.work_order.patient_name ? ` · ${lo.work_order.patient_name}` : ''}
                        </Text>
                        <ChevronRight size={11} strokeWidth={1.4} color={DS.ink[300]} />
                      </Pressable>
                    ))
                  : invoice.work_order && (
                      <Pressable onPress={() => router.push(`/(lab)/order/${invoice.work_order!.id}` as any)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, cursor: 'pointer' as any }}>
                        <ClipboardList size={12} strokeWidth={1.6} color="#2563EB" />
                        <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '500' }}>
                          {invoice.work_order.order_number}{invoice.work_order.patient_name ? ` · ${invoice.work_order.patient_name}` : ''}
                        </Text>
                        <ChevronRight size={11} strokeWidth={1.4} color={DS.ink[300]} />
                      </Pressable>
                    )
                }
              </View>
            )}
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            §09 TABLO — Kalemler
            ═══════════════════════════════════════════════════════════ */}
        <View style={{ width: '100%', maxWidth: 800, ...tableCard }}>
          {/* Toolbar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            padding: 20, gap: 12,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900], flex: 1 }}>
              Kalemler · {items.length}
            </Text>
            {invoice.status === 'taslak' && (
              <Pressable onPress={() => setAddItemModalVisible(true)} style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                backgroundColor: DS.ink[900], cursor: 'pointer' as any,
              }}>
                <Plus size={13} strokeWidth={2} color="#FFF" />
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#FFF' }}>Kalem Ekle</Text>
              </Pressable>
            )}
          </View>

          {/* Header — §09 exact: #FAFAFA bg, uppercase 10px */}
          <View style={{
            flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12,
            backgroundColor: '#FAFAFA',
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <Text style={{ flex: 3, ...TH }}>ACIKLAMA</Text>
            {isDesktop && <Text style={{ flex: 1, ...TH, textAlign: 'center' }}>ADET</Text>}
            {isDesktop && <Text style={{ flex: 1.5, ...TH, textAlign: 'right' }}>BIRIM FIYAT</Text>}
            <Text style={{ flex: 1.5, ...TH, textAlign: 'right' }}>TOPLAM</Text>
            {invoice.status === 'taslak' && <View style={{ width: 32 }} />}
          </View>

          {/* Rows — §09 exact: paddingHorizontal 20, paddingVertical 14 */}
          {items.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: DS.ink[400], fontStyle: 'italic' }}>Kalem eklenmemis</Text>
            </View>
          ) : (
            items.map((it, idx) => (
              <View key={it.id} style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 20, paddingVertical: 14,
                borderBottomWidth: idx < items.length - 1 ? 1 : 0,
                borderBottomColor: 'rgba(0,0,0,0.04)',
              }}>
                <View style={{ flex: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>{it.description}</Text>
                  {!isDesktop && (
                    <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                      {Number(it.quantity).toLocaleString('tr-TR')} x {fmtMoney(it.unit_price)}
                    </Text>
                  )}
                </View>
                {isDesktop && <Text style={{ flex: 1, fontSize: 13, color: DS.ink[800], textAlign: 'center' }}>{Number(it.quantity).toLocaleString('tr-TR')}</Text>}
                {isDesktop && <Text style={{ flex: 1.5, fontSize: 13, color: DS.ink[800], textAlign: 'right' }}>{fmtMoney(it.unit_price)}</Text>}
                <Text style={{ flex: 1.5, fontSize: 13, fontWeight: '500', color: DS.ink[900], textAlign: 'right' }}>{fmtMoney(it.total)}</Text>
                {invoice.status === 'taslak' && (
                  <Pressable onPress={async () => {
                    const { error } = await deleteInvoiceItem(it.id);
                    if (error) toast.error((error as any).message ?? String(error)); else refetch();
                  }} style={{ width: 32, alignItems: 'center', cursor: 'pointer' as any }}>
                    <Trash2 size={13} strokeWidth={1.6} color={CHIP_TONES.danger.text} />
                  </Pressable>
                )}
              </View>
            ))
          )}

          {/* Footer — §09 exact: #FAFAFA bg, borderTop */}
          <View style={{
            paddingHorizontal: 20, paddingVertical: 14,
            backgroundColor: '#FAFAFA',
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            {/* Toplamlar — sağa dayalı */}
            <View style={{ alignSelf: 'flex-end', width: isDesktop ? 260 : '100%', gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: DS.ink[500] }}>Ara Toplam</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>{fmtMoney(invoice.subtotal)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: DS.ink[500] }}>KDV (%{Number(invoice.tax_rate).toLocaleString('tr-TR')})</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>{fmtMoney(invoice.tax_amount)}</Text>
              </View>
              <View style={{ height: 2, backgroundColor: DS.ink[900], marginVertical: 4 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>Genel Toplam</Text>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: DS.ink[900] }}>{fmtMoney(invoice.total)}</Text>
              </View>
              {Number(invoice.paid_amount) > 0 && (
                <>
                  <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 2 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: DS.ink[500] }}>Odenen</Text>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: '#059669' }}>{fmtMoney(invoice.paid_amount)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: isOverdue ? CHIP_TONES.danger.text : DS.ink[900] }}>Kalan</Text>
                    <Text style={{
                      ...DISPLAY, fontSize: 18, letterSpacing: -0.3,
                      color: balance <= 0 ? '#059669' : (isOverdue ? CHIP_TONES.danger.text : DS.ink[900]),
                    }}>
                      {fmtMoney(balance)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════════════
            §05 cardSolid — Tahsilat Gecmisi
            ═══════════════════════════════════════════════════════════ */}
        {(invoice.payments ?? []).length > 0 && (
          <View style={{ width: '100%', maxWidth: 800, ...tableCard }}>
            {/* Toolbar */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              padding: 20, gap: 12,
              borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
            }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
                Tahsilat · {invoice.payments!.length}
              </Text>
            </View>
            {invoice.payments!.map((p, idx) => (
              <View key={p.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 20, paddingVertical: 14,
                borderBottomWidth: idx < invoice.payments!.length - 1 ? 1 : 0,
                borderBottomColor: 'rgba(0,0,0,0.04)',
              }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: CHIP_TONES.success.bg,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <CircleCheck size={14} strokeWidth={1.8} color={CHIP_TONES.success.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: CHIP_TONES.success.text }}>{fmtMoney(p.amount)}</Text>
                  <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>
                    {fmtDate(p.payment_date)} · {PAYMENT_METHOD_LABELS[p.payment_method]}
                    {p.reference_no ? ` · ${p.reference_no}` : ''}
                  </Text>
                </View>
                {p.receiver?.full_name && (
                  <Text style={{ fontSize: 11, color: DS.ink[400] }}>{p.receiver.full_name}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ═══ Notlar — cardSolid ═══ */}
        {invoice.notes && (
          <View style={{ width: '100%', maxWidth: 800, ...cardSolid }}>
            <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], marginBottom: 8 }}>Notlar</Text>
            <Text style={{ fontSize: 13, color: DS.ink[700], lineHeight: 20 }}>{invoice.notes}</Text>
          </View>
        )}

        {/* ═══ Paneller ═══ */}
        <View style={{ width: '100%', maxWidth: 800, gap: 12 }}>
          <PaymentLinkPanel invoiceId={invoice.id} balance={balance} onChanged={refetch} />
          <EFaturaPanel
            invoiceId={invoice.id} status={invoice.efatura_status ?? 'pending'}
            uuid={invoice.efatura_uuid ?? null} type={invoice.efatura_type ?? null}
            provider={invoice.efatura_provider ?? null} error={invoice.efatura_error ?? null}
            onChanged={refetch}
          />
        </View>

        {/* ═══ Tehlikeli aksiyonlar ═══ */}
        <View style={{ width: '100%', maxWidth: 800, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {invoice.status !== 'iptal' && invoice.status !== 'odendi' && (
            <PillBtn icon={CircleX} label="Iptal Et" color={CHIP_TONES.danger.text} bg={CHIP_TONES.danger.bg} onPress={handleCancel} disabled={busy} />
          )}
          {invoice.status === 'taslak' && (
            <PillBtn icon={Trash2} label="Taslagi Sil" color={CHIP_TONES.danger.text} bg={CHIP_TONES.danger.bg} onPress={handleDelete} disabled={busy} />
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      <PaymentModal visible={paymentModalVisible} invoiceId={invoice.id} maxAmount={balance}
        onClose={() => setPaymentModalVisible(false)} onDone={() => { setPaymentModalVisible(false); refetch(); }} />
      <AddItemModal visible={addItemModalVisible} invoiceId={invoice.id}
        onClose={() => setAddItemModalVisible(false)} onDone={() => { setAddItemModalVisible(false); refetch(); }} />
      <PaymentReminderModal visible={reminderOpen} invoice={invoice}
        clinicName={invoice.clinic?.name ?? undefined} onClose={() => setReminderOpen(false)} onSent={() => refetch()} />
    </View>
  );
}

// ─── PillBtn (§03 butonlar — pill köşeli) ───────────────────────────
function PillBtn({ icon: Icon, label, color, bg, onPress, disabled, dark }: {
  icon: React.ComponentType<any>; label?: string; color?: string; bg?: string;
  onPress: () => void; disabled?: boolean; dark?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: label ? 14 : 10, paddingVertical: 8, borderRadius: 999,
      backgroundColor: dark ? DS.ink[900] : (bg ?? '#FFF'),
      borderWidth: dark || bg ? 0 : 1, borderColor: 'rgba(0,0,0,0.05)',
      opacity: disabled ? 0.5 : 1, cursor: 'pointer' as any,
    }}>
      <Icon size={14} strokeWidth={1.8} color={dark ? '#FFF' : (color ?? DS.ink[900])} />
      {label && <Text style={{ fontSize: 12, fontWeight: '500', color: dark ? '#FFF' : (color ?? DS.ink[900]) }}>{label}</Text>}
    </Pressable>
  );
}

// ═════════════════════════════════════════════════════════════════════
// PAYMENT MODAL (§05.5 form elemanları + §08 dialog)
// ═════════════════════════════════════════════════════════════════════
const PAYMENT_METHOD_OPTIONS: { v: PaymentMethod; l: string; icon: React.ComponentType<any> }[] = [
  { v: 'nakit',  l: 'Nakit',    icon: Banknote },
  { v: 'kart',   l: 'Kredi K.', icon: CreditCard },
  { v: 'havale', l: 'Havale',   icon: Landmark },
  { v: 'cek',    l: 'Cek',      icon: File },
  { v: 'diger',  l: 'Diger',    icon: MoreHorizontal },
];

function PaymentModal({ visible, invoiceId, maxAmount, onClose, onDone }: {
  visible: boolean; invoiceId: string; maxAmount: number; onClose: () => void; onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('nakit');
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (visible) { setAmount(maxAmount > 0 ? maxAmount.toFixed(2) : ''); setMethod('nakit'); setRefNo(''); setNotes(''); }
  }, [visible, maxAmount]);

  const handleSave = async () => {
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Gecerli bir tutar girin.'); return; }
    setBusy(true);
    const { error } = await recordPayment({ invoice_id: invoiceId, amount: amt, payment_method: method, reference_no: refNo || undefined, notes: notes || undefined });
    setBusy(false);
    if (error) toast.error((error as any).message ?? String(error)); else onDone();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 520, padding: 28, gap: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', boxShadow: modalShadow } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Tahsilat Ekle</Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} strokeWidth={1.8} color={DS.ink[500]} />
            </Pressable>
          </View>
          <FL>Tutar (TL)</FL>
          <FI value={amount} onChangeText={setAmount} placeholder="0,00" keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} />
          {maxAmount > 0 && <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: -4 }}>Kalan bakiye: {fmtMoney(maxAmount)}</Text>}
          <FL>Yontem</FL>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {PAYMENT_METHOD_OPTIONS.map(opt => { const a = method === opt.v; const MI = opt.icon; return (
              <Pressable key={opt.v} onPress={() => setMethod(opt.v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: a ? DS.ink[900] : 'rgba(0,0,0,0.08)', backgroundColor: a ? DS.ink[50] : '#FFF', cursor: 'pointer' as any }}>
                <MI size={12} strokeWidth={1.6} color={a ? DS.ink[900] : DS.ink[400]} />
                <Text style={{ fontSize: 12, fontWeight: a ? '600' : '500', color: a ? DS.ink[900] : DS.ink[400] }}>{opt.l}</Text>
              </Pressable>
            ); })}
          </View>
          <FL>Referans No (ops.)</FL>
          <FI value={refNo} onChangeText={setRefNo} placeholder="Havale/cek referans no" />
          <FL>Not (ops.)</FL>
          <FI value={notes} onChangeText={setNotes} placeholder="Ek bilgi..." multiline style={{ minHeight: 56, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', paddingTop: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable onPress={onClose} disabled={busy} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[500] }}>Vazgec</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={busy} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: DS.ink[900], opacity: busy ? 0.5 : 1, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFF' }}>{busy ? 'Kaydediliyor...' : 'Kaydet'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// ADD ITEM MODAL
// ═════════════════════════════════════════════════════════════════════
function AddItemModal({ visible, invoiceId, onClose, onDone }: {
  visible: boolean; invoiceId: string; onClose: () => void; onDone: () => void;
}) {
  const [desc, setDesc] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => { if (visible) { setDesc(''); setQty('1'); setPrice(''); } }, [visible]);

  const handleSave = async () => {
    const q = Number(qty.replace(',', '.')); const p = Number(price.replace(',', '.'));
    if (!desc.trim()) { toast.error('Aciklama girin.'); return; }
    if (!Number.isFinite(q) || q <= 0) { toast.error('Gecerli bir adet girin.'); return; }
    if (!Number.isFinite(p) || p < 0) { toast.error('Gecerli bir birim fiyat girin.'); return; }
    setBusy(true);
    const { error } = await addInvoiceItem(invoiceId, { description: desc.trim(), quantity: q, unit_price: p });
    setBusy(false);
    if (error) toast.error((error as any).message ?? String(error)); else onDone();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 520, padding: 28, gap: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', boxShadow: modalShadow } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Kalem Ekle</Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} strokeWidth={1.8} color={DS.ink[500]} />
            </Pressable>
          </View>
          <FL>Aciklama</FL>
          <FI value={desc} onChangeText={setDesc} placeholder="Orn: Zirkonya kron" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><FL>Adet</FL><FI value={qty} onChangeText={setQty} placeholder="1" keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} /></View>
            <View style={{ flex: 2 }}><FL>Birim Fiyat (TL)</FL><FI value={price} onChangeText={setPrice} placeholder="0,00" keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', paddingTop: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable onPress={onClose} disabled={busy} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[500] }}>Vazgec</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={busy} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: DS.ink[900], opacity: busy ? 0.5 : 1, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFF' }}>{busy ? 'Ekleniyor...' : 'Ekle'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── §05.5 Form field components ────────────────────────────────────
function FL({ children }: { children: string }) {
  return <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginTop: 8, marginBottom: 4 }}>{children}</Text>;
}
function FI(props: React.ComponentProps<typeof TextInput> & { style?: any }) {
  const { style: extra, ...rest } = props;
  return <TextInput placeholderTextColor={DS.ink[400]} {...rest} style={[{ height: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF', fontSize: 15, color: DS.ink[900], outline: 'none' as any }, extra]} />;
}

export default InvoiceDetailScreen;
