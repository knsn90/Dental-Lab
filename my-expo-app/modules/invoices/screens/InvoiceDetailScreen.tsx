import { localeTag } from '../../../core/i18n';
/**
 * InvoiceDetailScreen — Fatura Detayı (Patterns Design Language)
 *
 * Patterns showcase §05 cardSolid, §09 tablo, §10 hero,
 * §04 chip/tag token'larıyla fatura belge görünümü.
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert,
  Modal, TextInput, Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Printer, Banknote, CreditCard, Landmark, File,
  MoreHorizontal, Building2, User, Phone, MapPin, Calendar,
  ClipboardList, Plus, Trash2, Send, BellRing, CircleX,
  CircleCheck, X, AlertCircle, ChevronRight, ChevronDown, Check, FileText,
} from 'lucide-react-native';
import { toast } from '../../../core/ui/Toast';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { useRouter, useLocalSearchParams, useSegments } from 'expo-router';

import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { baseSymbol, getBaseCurrency } from '../../../core/money/baseCurrency';
import { useInvoice } from '../hooks/useInvoices';
import {
  recordPayment, setInvoiceStatus, deleteInvoice,
  addInvoiceItem, deleteInvoiceItem, updateInvoiceItem, updateInvoice,
} from '../api';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS, type PaymentMethod,
} from '../types';
import { printInvoice } from '../printInvoice';
import { PaymentReminderModal } from '../components/PaymentReminderModal';
import { EFaturaPanel } from '../../efatura/components/EFaturaPanel';
import { PaymentLinkPanel } from '../../payments/components/PaymentLinkPanel';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';

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
function fmtMoneyCur(n: number | string | null | undefined, currency = 'TRY'): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  const sym = CURRENCY_META[currency as Currency]?.symbol ?? '₺';
  return sym + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'long', year: 'numeric' });
}
// Adres JSON ({il,ilce,mahalle,sokak,bina_no,posta_kodu}) ise okunaklı metne çevir;
// düz metinse aynen döndür.
function formatAddress(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!(s.startsWith('{') && s.endsWith('}'))) return s;
  try {
    const o: any = JSON.parse(s);
    if (!o || typeof o !== 'object') return s;
    const sokak = String(o.sokak ?? '').trim();
    const binaNo = String(o.bina_no ?? '').trim();
    const line1 = [sokak, binaNo && !sokak.includes(binaNo) ? 'No: ' + binaNo : null].filter(Boolean).join(' ');
    const mahalle = String(o.mahalle ?? '').trim();
    const line2 = [
      mahalle ? (/mah/i.test(mahalle) ? mahalle : mahalle + ' Mah.') : null,
      [o.ilce, o.il].filter(Boolean).join('/'),
      o.posta_kodu,
    ].filter(Boolean).join(', ');
    const out = [line1, line2].filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
    return out || s;
  } catch { return s; }
}

// Inline düzenlenebilir sayı hücresi — taslak faturada birim fiyat/adet için.
function EditableNum({ value, editable, onSave, fmt, textStyle, inputStyle }: {
  value: number;
  editable: boolean;
  onSave: (n: number) => void;
  fmt?: (n: number) => string;            // salt-okunur gösterim formatı (para birimi vb.)
  textStyle?: any;
  inputStyle?: any;
}) {
  const [v, setV] = useState(String(value ?? 0));
  React.useEffect(() => { setV(String(value ?? 0)); }, [value]);
  const commit = () => {
    const n = Number(String(v).replace(',', '.'));
    if (Number.isFinite(n) && n !== Number(value)) onSave(n);
  };
  if (!editable) {
    return <Text style={textStyle}>{fmt ? fmt(value) : Number(value).toLocaleString('tr-TR')}</Text>;
  }
  return (
    <TextInput
      value={v}
      onChangeText={setV}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
      selectTextOnFocus
      style={[{
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)', borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, color: DS.ink[900],
        backgroundColor: '#FFFFFF',
        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
      }, inputStyle]}
    />
  );
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function InvoiceDetailScreen() {
  const theme = usePanelTheme();
  const router = useRouter();
  const segments = useSegments();
  const panelBase = String(segments?.[0] ?? '(lab)');  // sipariş linki için aktif panel
  // Klinik/hekim panelinde fatura yalnız GÖRÜNTÜLENİR — lab aksiyonları (tahsilat,
  // hatırlatma, ödeme linki, e-fatura, iptal/sil) gizlenir.
  const readOnly = panelBase === '(clinic)' || panelBase === '(doctor)';
  const { id } = useLocalSearchParams<{ id: string }>();
  const { invoice, loading, refetch } = useInvoice(id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [curPickerOpen, setCurPickerOpen] = useState(false);   // taslak para birimi seçici
  const [rateEditOpen, setRateEditOpen] = useState(false);     // kur düzenleme
  const [rateInput, setRateInput] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);   // iptal/sil onayı (web-safe)

  if (loading) {
    return <CenteredLoader color={DS.ink[400]} />;
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

  // Faturanın para birimine göre formatla (₺ sabit değil) — tüm fmtMoney
  // çağrılarını bu yerel closure gölgeler.
  const fmtMoney = (n: number | string | null | undefined) => fmtMoneyCur(n, invoice.currency || 'TRY');

  // Taslak fatura kalemini inline güncelle (birim fiyat/adet) — toplam trigger'la yeniden hesaplanır.
  const saveItem = async (id: string, patch: { quantity?: number; unit_price?: number }) => {
    const { error } = await updateInvoiceItem(id, patch);
    if (error) toast.error((error as any).message ?? String(error)); else refetch();
  };

  // Taslak faturanın para birimini değiştir (kalemler bu para biriminde gösterilir).
  const changeCurrency = async (c: string) => {
    setCurPickerOpen(false);
    if (c === invoice.currency) return;
    const { error } = await updateInvoice(invoice.id, { currency: c });
    if (error) toast.error((error as any).message ?? String(error)); else refetch();
  };

  // Kuru elle değiştir → trigger amount_base'i yeni kurla yeniden hesaplar.
  const saveRate = async () => {
    const v = Number(String(rateInput).replace(',', '.'));
    setRateEditOpen(false);
    if (!Number.isFinite(v) || v <= 0) { toast.error('Geçerli bir kur gir.'); return; }
    const { error } = await updateInvoice(invoice.id, { rate_at_time: v });
    if (error) toast.error((error as any).message ?? String(error)); else { toast.success('Kur güncellendi.'); refetch(); }
  };

  const base = getBaseCurrency();
  const isForeign = (invoice.currency || base) !== base;
  const rateVal = Number(invoice.rate_at_time ?? 0);

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
  // NOT: RN Alert.alert web'de çalışmıyor → onay diyaloğu açılmıyordu (silinemiyordu).
  // Cross-platform ConfirmDialog kullanılıyor.
  const handleCancel = () => {
    setConfirm({
      title: 'Faturayı İptal Et', variant: 'warning',
      message: 'Bu faturayı iptal etmek istediğinize emin misiniz?',
      label: 'İptal Et',
      onConfirm: async () => {
        setBusy(true);
        const { error } = await setInvoiceStatus(invoice.id, 'iptal');
        setBusy(false);
        if (error) toast.error((error as any).message ?? String(error)); else refetch();
      },
    });
  };
  const handleDelete = () => {
    setConfirm({
      title: 'Faturayı Sil', variant: 'danger',
      message: 'Bu taslak fatura silinecek. Geri alınamaz.',
      label: 'Evet, sil',
      onConfirm: async () => {
        setBusy(true);
        const { error } = await deleteInvoice(invoice.id);
        setBusy(false);
        if (error) toast.error((error as any).message ?? String(error)); else router.back();
      },
    });
  };

  const items = (invoice.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  return (
    <View style={{ flex: 1 }}>

      {/* ── Toolbar — mobile'da ikon-only pills ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: isDesktop ? 20 : 12,
        paddingTop: (isDesktop ? 10 : 8) + (isDesktop ? 0 : insets.top),
        paddingBottom: isDesktop ? 10 : 8,
      }}>
        <Pressable onPress={() => router.back()} style={{
          width: isDesktop ? 36 : 34, height: isDesktop ? 36 : 34, borderRadius: 10,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          cursor: 'pointer' as any,
        }}>
          <ArrowLeft size={17} strokeWidth={1.8} color={DS.ink[900]} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {!readOnly && invoice.status === 'taslak' && (
          <PillBtn icon={Send} label={isDesktop ? 'Kesildi Isaretle' : undefined} color={CHIP_TONES.info.text} bg={CHIP_TONES.info.bg} onPress={handleMarkSent} disabled={busy} />
        )}
        {!readOnly && (invoice.status === 'kesildi' || invoice.status === 'kismi_odendi') && (
          <PillBtn icon={BellRing} label={isDesktop ? 'Hatirlatma' : undefined} color={CHIP_TONES.warning.text} bg={CHIP_TONES.warning.bg} onPress={() => setReminderOpen(true)} disabled={busy} />
        )}
        {!readOnly && balance > 0 && invoice.status !== 'iptal' && (
          <PillBtn icon={Banknote} label={isDesktop ? 'Tahsilat Ekle' : undefined} onPress={() => setPaymentModalVisible(true)} dark />
        )}
        <PillBtn icon={Printer} onPress={handlePrint} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          alignItems: isDesktop ? 'center' : 'stretch',
          paddingHorizontal: isDesktop ? 32 : 12,
          paddingTop: 4,
          paddingBottom: 80,
          gap: isDesktop ? 20 : 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Split: desktop'ta sol=fatura içeriği · sağ=aksiyonlar; mobilde tek kolon */}
        <View style={{
          width: '100%', maxWidth: isDesktop ? 1180 : 800,
          flexDirection: isDesktop ? 'row' : 'column',
          alignItems: 'flex-start',
          gap: isDesktop ? 20 : 14,
        }}>
        {/* ═══ SOL KOLON — fatura içeriği ═══ */}
        <View style={{ flex: isDesktop ? 1 : undefined, width: '100%', minWidth: 0, gap: isDesktop ? 20 : 14 }}>

        {/* ═══════════════════════════════════════════════════════════
            §10 HERO — Fatura özet kartı (koşullu: overdue=dark, normal=panel)
            ═══════════════════════════════════════════════════════════ */}
        <View style={{
          width: '100%', maxWidth: 800,
          borderRadius: isDesktop ? 28 : 20,
          padding: isDesktop ? 36 : 18,
          backgroundColor: isOverdue ? DS.ink[900] : theme.primary,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* §10 decorative circles — beyaz cam tonu (her iki bg state'inde) */}
          <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} />

          {/* Row 1: FATURA title + number + status */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <Text style={{
              ...DISPLAY, fontSize: isDesktop ? 40 : 22, letterSpacing: -1,
              color: '#FFFFFF',
            }}>
              FATURA
            </Text>
            <View style={{
              paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.22)',
            }}>
              <Text style={{
                fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase',
                color: '#FFFFFF',
              }}>
                {isOverdue ? 'Vadesi Geçti' : INVOICE_STATUS_LABELS[invoice.status]}
              </Text>
            </View>
          </View>
          <Text style={{
            fontSize: 12, fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.72)',
            marginBottom: isDesktop ? 20 : 14,
          }}>
            {invoice.invoice_number}
          </Text>

          {/* Row 2: BigStats — toplam, ödenen, kalan */}
          <View style={{ flexDirection: 'row', gap: isDesktop ? 48 : 16, flexWrap: 'wrap' }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', marginBottom: 4 }}>
                Toplam
              </Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...DISPLAY, fontSize: isDesktop ? 40 : 22, letterSpacing: -0.8, color: '#FFFFFF' }}>
                {fmtMoney(invoice.total)}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', marginBottom: 4 }}>
                Ödenen
              </Text>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 40 : 22, letterSpacing: -0.8, color: '#FFFFFF' }}>
                {fmtMoney(invoice.paid_amount)}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', marginBottom: 4 }}>
                Kalan
              </Text>
              <Text style={{
                ...DISPLAY, fontSize: isDesktop ? 40 : 22, letterSpacing: -0.8,
                color: '#FFFFFF',
              }}>
                {fmtMoney(balance)}
              </Text>
            </View>
          </View>

          {/* Dates row */}
          <View style={{
            flexDirection: 'row', gap: 20, marginTop: isDesktop ? 20 : 14, paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.18)',
          }}>
            <View>
              <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>Düzenleme</Text>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#FFFFFF', marginTop: 2 }}>{fmtDate(invoice.issue_date)}</Text>
            </View>
            <View>
              <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>Vade</Text>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#FFFFFF', marginTop: 2 }}>{fmtDate(invoice.due_date)}</Text>
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
              {invoice.clinic?.address && <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2, maxWidth: 280 }}>{formatAddress(invoice.clinic.address)}</Text>}
            </View>

            {/* Is emirleri */}
            {(invoice.linked_orders?.length || invoice.work_order) && (
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], marginBottom: 10 }}>Is Emirleri</Text>
                {(invoice.linked_orders && invoice.linked_orders.length > 0)
                  ? invoice.linked_orders.map(lo => lo.work_order && (
                      <Pressable key={lo.work_order_id} onPress={() => router.push(`/${panelBase}/order/${lo.work_order!.id}` as any)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer' as any }}>
                        <ClipboardList size={12} strokeWidth={1.6} color="#2563EB" />
                        <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '500' }}>
                          {lo.work_order.order_number}{lo.work_order.patient_name ? ` · ${lo.work_order.patient_name}` : ''}
                        </Text>
                        <ChevronRight size={11} strokeWidth={1.4} color={DS.ink[300]} />
                      </Pressable>
                    ))
                  : invoice.work_order && (
                      <Pressable onPress={() => router.push(`/${panelBase}/order/${invoice.work_order!.id}` as any)}
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
              <Pressable onPress={() => setCurPickerOpen(true)} style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: '#FFF',
                cursor: 'pointer' as any,
              }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[700] }}>
                  {CURRENCY_META[(invoice.currency || 'TRY') as Currency]?.symbol ?? '₺'} {invoice.currency || 'TRY'}
                </Text>
                <ChevronDown size={13} strokeWidth={1.8} color={DS.ink[500]} />
              </Pressable>
            )}
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
                    invoice.status === 'taslak' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <EditableNum value={Number(it.quantity)} editable onSave={(n) => saveItem(it.id, { quantity: n })} inputStyle={{ width: 48, textAlign: 'center' }} />
                        <Text style={{ fontSize: 12, color: DS.ink[400] }}>×</Text>
                        <EditableNum value={Number(it.unit_price)} editable onSave={(n) => saveItem(it.id, { unit_price: n })} fmt={fmtMoney} inputStyle={{ width: 96, textAlign: 'right' }} />
                      </View>
                    ) : (
                      <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                        {Number(it.quantity).toLocaleString('tr-TR')} x {fmtMoney(it.unit_price)}
                      </Text>
                    )
                  )}
                </View>
                {isDesktop && (
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <EditableNum value={Number(it.quantity)} editable={invoice.status === 'taslak'} onSave={(n) => saveItem(it.id, { quantity: n })} textStyle={{ fontSize: 13, color: DS.ink[800] }} inputStyle={{ width: 56, textAlign: 'center' }} />
                  </View>
                )}
                {isDesktop && (
                  <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                    <EditableNum value={Number(it.unit_price)} editable={invoice.status === 'taslak'} onSave={(n) => saveItem(it.id, { unit_price: n })} fmt={fmtMoney} textStyle={{ fontSize: 13, color: DS.ink[800], textAlign: 'right' }} inputStyle={{ width: 110, textAlign: 'right' }} />
                  </View>
                )}
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
              {isForeign && (
                <Pressable
                  onPress={!readOnly ? () => { setRateInput(rateVal ? String(rateVal) : ''); setRateEditOpen(true); } : undefined}
                  disabled={readOnly}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingVertical: 4, ...(Platform.OS === 'web' && !readOnly ? { cursor: 'pointer' } as any : {}) }}
                >
                  <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                    Kur: 1 {invoice.currency} = {baseSymbol()}{rateVal.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}{!readOnly ? '  · düzenle' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[700] }}>
                    ≈ {baseSymbol()}{Number(invoice.amount_base ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                  </Text>
                </Pressable>
              )}
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

        </View>{/* ═══ /SOL KOLON ═══ */}

        {/* ═══ SAĞ KOLON — aksiyonlar (Notlar · Ödeme · e-Fatura · tehlikeli) ═══ */}
        <View style={{ width: isDesktop ? 360 : '100%', gap: isDesktop ? 16 : 14 }}>

        {/* ═══ Notlar — cardSolid ═══ */}
        {invoice.notes && (
          <View style={{ width: '100%', maxWidth: 800, ...cardSolid }}>
            <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], marginBottom: 8 }}>Notlar</Text>
            <Text style={{ fontSize: 13, color: DS.ink[700], lineHeight: 20 }}>{invoice.notes}</Text>
          </View>
        )}

        {/* ═══ Paneller ═══ (lab/admin) */}
        {!readOnly && (
          <View style={{ width: '100%', maxWidth: 800, gap: 12 }}>
            <PaymentLinkPanel invoiceId={invoice.id} balance={balance} onChanged={refetch} />
            <EFaturaPanel
              invoiceId={invoice.id} status={invoice.efatura_status ?? 'pending'}
              uuid={invoice.efatura_uuid ?? null} type={invoice.efatura_type ?? null}
              provider={invoice.efatura_provider ?? null} error={invoice.efatura_error ?? null}
              onChanged={refetch}
            />
          </View>
        )}

        {/* ═══ Tehlikeli aksiyonlar ═══ (lab/admin) */}
        {!readOnly && (
          <View style={{ width: '100%', maxWidth: 800, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {invoice.status !== 'iptal' && invoice.status !== 'odendi' && (
              <PillBtn icon={CircleX} label="Iptal Et" color={CHIP_TONES.danger.text} bg={CHIP_TONES.danger.bg} onPress={handleCancel} disabled={busy} />
            )}
            {invoice.status === 'taslak' && (
              <PillBtn icon={Trash2} label="Taslagi Sil" color={CHIP_TONES.danger.text} bg={CHIP_TONES.danger.bg} onPress={handleDelete} disabled={busy} />
            )}
          </View>
        )}

        </View>{/* ═══ /SAĞ KOLON ═══ */}
        </View>{/* ═══ /split wrapper ═══ */}
      </ScrollView>

      {/* Modals */}
      <PaymentModal visible={paymentModalVisible} invoiceId={invoice.id} maxAmount={balance} currency={invoice.currency || 'TRY'}
        onClose={() => setPaymentModalVisible(false)} onDone={() => { setPaymentModalVisible(false); refetch(); }} />
      {/* İptal/Sil onayı — web-safe ConfirmDialog (Alert.alert web'de çalışmıyor) */}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      {/* Para birimi seçici — Modal (clipping/z-index sorunsuz) */}
      <Modal visible={curPickerOpen} transparent animationType="fade" onRequestClose={() => setCurPickerOpen(false)}>
        <Pressable onPress={() => setCurPickerOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#FFF', borderRadius: 18, padding: 8, width: 260, ...(Platform.OS === 'web' ? { boxShadow: modalShadow } as any : {}) } as any}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[400], letterSpacing: 1, textTransform: 'uppercase' as any, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
              Para Birimi
            </Text>
            {(['TRY', 'EUR', 'USD', 'GBP'] as const).map(c => {
              const active = (invoice.currency || 'TRY') === c;
              return (
                <Pressable key={c} onPress={() => changeCurrency(c)} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 12, borderRadius: 11,
                  backgroundColor: active ? DS.ink[50] : 'transparent',
                  cursor: 'pointer' as any,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: DS.ink[700], width: 18 }}>{CURRENCY_META[c].symbol}</Text>
                  <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: DS.ink[900], flex: 1 }}>{c} · {CURRENCY_META[c].label}</Text>
                  {active && <Check size={16} color={DS.ink[700]} strokeWidth={2} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Kur düzenleme — manuel override; trigger amount_base'i yeni kurla hesaplar */}
      <Modal visible={rateEditOpen} transparent animationType="fade" onRequestClose={() => setRateEditOpen(false)}>
        <Pressable onPress={() => setRateEditOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#FFF', borderRadius: 18, padding: 18, width: 300, gap: 10, ...(Platform.OS === 'web' ? { boxShadow: modalShadow } as any : {}) } as any}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: DS.ink[900] }}>Kuru Düzenle</Text>
            <Text style={{ fontSize: 12, color: DS.ink[500] }}>1 {invoice.currency} kaç {base}? Kaydedince toplamın {base} karşılığı bu kura göre hesaplanır.</Text>
            <TextInput
              value={rateInput}
              onChangeText={setRateInput}
              keyboardType="decimal-pad"
              placeholder="örn. 53.21"
              placeholderTextColor={DS.ink[400]}
              style={{ borderWidth: 1, borderColor: DS.ink[200], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: DS.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Pressable onPress={() => setRateEditOpen(false)} style={{ flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: DS.ink[100], alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[700] }}>Vazgeç</Text>
              </Pressable>
              <Pressable onPress={saveRate} style={{ flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: DS.ink[900], alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Kaydet</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <AddItemModal visible={addItemModalVisible} invoiceId={invoice.id} currency={invoice.currency || 'TRY'}
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

function PaymentModal({ visible, invoiceId, maxAmount, currency = 'TRY', onClose, onDone }: {
  visible: boolean; invoiceId: string; maxAmount: number; currency?: string; onClose: () => void; onDone: () => void;
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
      <View style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
        <View style={{ backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 520, padding: 28, gap: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', boxShadow: modalShadow } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Tahsilat Ekle</Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} strokeWidth={1.8} color={DS.ink[500]} />
            </Pressable>
          </View>
          <FL>{`Tutar (${CURRENCY_META[currency as Currency]?.symbol ?? '₺'})`}</FL>
          <FI value={amount} onChangeText={setAmount} placeholder="0,00" keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} />
          {maxAmount > 0 && <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: -4 }}>Kalan bakiye: {fmtMoneyCur(maxAmount, currency)}</Text>}
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
function AddItemModal({ visible, invoiceId, currency = 'TRY', onClose, onDone }: {
  visible: boolean; invoiceId: string; currency?: string; onClose: () => void; onDone: () => void;
}) {
  const curSym = CURRENCY_META[currency as Currency]?.symbol ?? '₺';
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
      <View style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
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
            <View style={{ flex: 2 }}><FL>{`Birim Fiyat (${curSym})`}</FL><FI value={price} onChangeText={setPrice} placeholder="0,00" keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} /></View>
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
