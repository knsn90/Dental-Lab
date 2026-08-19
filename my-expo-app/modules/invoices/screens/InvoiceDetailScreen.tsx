import { localeTag, isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
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
  ArrowLeft, ArrowRight, Printer, Banknote, CreditCard, Landmark, File,
  MoreHorizontal, Building2, User, Phone, MapPin, Calendar,
  ClipboardList, Plus, Trash2, Send, BellRing, CircleX,
  CircleCheck, X, AlertCircle, ChevronRight, ChevronLeft, ChevronDown, Check, FileText, Undo2,
} from 'lucide-react-native';
import { toast } from '../../../core/ui/Toast';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { useRouter, useLocalSearchParams, useSegments } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';

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
import { normalizeDoctorName } from '../../../core/utils/textCase';

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
interface DetailProps {
  /** Hub içinde gömülü açılırken — route param yerine doğrudan id */
  invoiceId?: string;
  /** Gömülü kullanımda geri; verilmezse geçmiş kullanılır */
  onBack?: () => void;
}

export function InvoiceDetailScreen({ invoiceId, onBack }: DetailProps = {}) {
  const theme = usePanelTheme();
  const router = useRouter();
  const segments = useSegments();
  const panelBase = String(segments?.[0] ?? '(lab)');
  // Doğrudan URL ile açılışta (yenileme / paylaşılan link) navigasyon geçmişi yok:
  // router.back() "GO_BACK was not handled" konsol hatası verip hiçbir şey yapmıyordu.
  // Fatura listesi rotası yalnız lab'da var; diğer panellerde Finans hub'ı
  // ortak giriş noktası (hepsinde finance.tsx mevcut).
  const goBack = () => {
    if (onBack) { onBack(); return; }
    safeBack(`/${panelBase}${panelBase === '(lab)' ? '/invoices' : '/finance'}`);
  };
  // Klinik/hekim panelinde fatura yalnız GÖRÜNTÜLENİR — lab aksiyonları (tahsilat,
  // hatırlatma, ödeme linki, e-fatura, iptal/sil) gizlenir.
  const readOnly = panelBase === '(clinic)' || panelBase === '(doctor)';
  const routeParams = useLocalSearchParams<{ id: string }>();
  const id = invoiceId ?? routeParams.id;
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
        <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>Fatura bulunamadı</Text>
        <Pressable onPress={goBack} style={{
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

  // Zaman şeridi — oluşturuldu · son ödeme · vade baskısı (kullanıcı zaman baskısını da yönetir)
  const createdDate = (invoice.created_at ? String(invoice.created_at).slice(0, 10) : invoice.issue_date);
  const _payDates = (invoice.payments ?? []).map(p => p.payment_date).filter(Boolean).sort();
  const lastPaymentDate = _payDates.length ? _payDates[_payDates.length - 1] : null;
  const duePressure: { text: string; color: string; bg: string; fg: string; light: string } = (() => {
    const amber = { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E', light: '#FCD34D' };
    const green = { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47', light: '#86EFAC' };
    const red   = { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E', light: '#FCA5A5' };
    const none  = { bg: DS.ink[100],             fg: DS.ink[500], light: 'rgba(255,255,255,0.7)' };
    if (invoice.status === 'odendi') return { text: 'Ödendi', color: '#1F6B47', ...green };
    if (invoice.status === 'iptal')  return { text: 'İptal',  color: DS.ink[400], ...none };
    if (!invoice.due_date)           return { text: '—',      color: DS.ink[400], ...none };
    const diff = Math.round(
      (new Date(invoice.due_date + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000,
    );
    if (diff < 0)   return { text: `${Math.abs(diff)} ${autoT('gün gecikti')}`, color: '#DC2626', ...red };
    if (diff === 0) return { text: 'Bugün vadeli',                  color: '#B45309', ...amber };
    return { text: `${diff} ${autoT('gün kaldı')}`, color: diff <= 7 ? '#B45309' : '#1F6B47', ...(diff <= 7 ? amber : green) };
  })();

  // Fatura yaşam döngüsü — muhasebe için 4 adımlı çizelge (✓ done · ● active · ○ pending)
  const _paid = invoice.status === 'odendi';
  const _partial = invoice.status === 'kismi_odendi';
  const _issued = _paid || _partial || invoice.status === 'kesildi';
  const _cancelled = invoice.status === 'iptal';
  type LcState = 'done' | 'active' | 'pending';
  const _dueVisible = _issued && !_paid && !_cancelled && !!invoice.due_date;
  const lifecycle: {
    label: string; short: string; state: LcState; date?: string | null;
    dueCaption?: string | null; badge?: { text: string; bg: string; fg: string } | null;
  }[] = [
    { label: 'Fatura oluşturuldu', short: 'Oluşturuldu', state: 'done', date: createdDate },
    { label: _cancelled ? 'İptal edildi' : 'Kesildi', short: _cancelled ? 'İptal' : 'Kesildi',
      state: _cancelled ? 'done' : _issued ? 'done' : 'active',
      date: _issued ? invoice.issue_date : null },
    { label: _partial ? 'Kısmi tahsil edildi' : 'Ödeme bekleniyor', short: _partial ? 'Kısmi' : 'Ödeme',
      state: _cancelled ? 'pending' : _paid ? 'done' : _issued ? 'active' : 'pending',
      dueCaption: _dueVisible ? `Vade ${fmtDate(invoice.due_date)}` : null,
      badge: _dueVisible ? { text: duePressure.text, bg: duePressure.bg, fg: duePressure.fg } : null },
    { label: 'Tahsil edildi', short: 'Tahsil',
      state: _paid ? 'done' : _partial ? 'active' : 'pending',
      date: _paid ? lastPaymentDate : null },
  ];

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
  // Kesilmiş faturayı TASLAĞA geri al → düzenleme (kalem ekle/sil, adet/fiyat) yeniden açılır.
  // Yalnız ödeme yokken; taslak bakiyeye/ekstreye girmez, yeniden kesilince aynı numarayla döner.
  const handleRevertToDraft = () => {
    setConfirm({
      title: 'Taslağa Dön', variant: 'warning',
      message: 'Fatura taslağa çevrilecek ve düzenlenebilir olacak. Taslak fatura bakiyeye/ekstreye dahil edilmez; düzenledikten sonra "Kesildi İşaretle" ile yeniden kesebilirsin.',
      label: 'Taslağa Dön',
      onConfirm: async () => {
        setConfirm(null);   // onay diyaloğunu hemen kapat (ConfirmDialog onConfirm sonrası kapatmıyor)
        setBusy(true);
        const { error } = await setInvoiceStatus(invoice.id, 'taslak');
        setBusy(false);
        if (error) toast.error((error as any).message ?? String(error)); else { toast.success('Fatura taslağa alındı — artık düzenlenebilir.'); refetch(); }
      },
    });
  };
  // NOT: RN Alert.alert web'de çalışmıyor → onay diyaloğu açılmıyordu (silinemiyordu).
  // Cross-platform ConfirmDialog kullanılıyor.
  const handleCancel = () => {
    setConfirm({
      title: 'Faturayı İptal Et', variant: 'warning',
      message: 'Bu faturayı iptal etmek istediğinize emin misiniz?',
      label: 'İptal Et',
      onConfirm: async () => {
        setConfirm(null);   // onay diyaloğunu hemen kapat
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
        if (error) toast.error((error as any).message ?? String(error)); else goBack();
      },
    });
  };

  const items = (invoice.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  return (
    <View style={{ flex: 1 }}>

      {/* ── Toolbar — solda belge kimliği, sağda eylemler ──
          Eskiden yalnız geri oku + sağda butonlar vardı; satırın ortası bomboş
          kalıyor, üstündeki dikey pay ile birlikte ~180px boşluk oluşuyordu.
          Belge kimliği (numara + durum) buraya taşındı: sayfa kaydırılıp hero
          ekrandan çıktığında da "hangi faturadayım" görünür kalır. */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: isDesktop ? 20 : 12,
        paddingTop: (isDesktop ? 6 : 6) + (isDesktop ? 0 : insets.top),
        paddingBottom: isDesktop ? 6 : 8,
      }}>
        <Pressable onPress={goBack} style={{
          width: isDesktop ? 36 : 34, height: isDesktop ? 36 : 34, borderRadius: 10,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          cursor: 'pointer' as any,
        }}>
          {isRTL() ? <ArrowRight size={17} strokeWidth={1.8} color={DS.ink[900]} /> : <ArrowLeft size={17} strokeWidth={1.8} color={DS.ink[900]} />}
        </Pressable>

        {isDesktop && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Text style={{ fontSize: 13, fontFamily: 'monospace', color: DS.ink[700] }} numberOfLines={1}>
              {invoice.invoice_number}
            </Text>
            {(() => {
              const chip = isOverdue ? CHIP_TONES.danger : (STATUS_CHIP[invoice.status] ?? CHIP_TONES.neutral);
              return (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 999, backgroundColor: chip.bg }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: chip.text }}>
                    {isOverdue ? 'Vadesi Geçti' : INVOICE_STATUS_LABELS[invoice.status]}
                  </Text>
                </View>
              );
            })()}
            {!!invoice.clinic?.name && (
              <>
                <Text style={{ fontSize: 12, color: DS.ink[300] }}>·</Text>
                <Text style={{ fontSize: 12.5, color: DS.ink[500], flexShrink: 1 }} numberOfLines={1}>
                  {invoice.clinic.name}
                </Text>
              </>
            )}
          </View>
        )}

        <View style={{ flex: 1 }} />
        {!readOnly && invoice.status === 'taslak' && (
          <PillBtn icon={Send} label={isDesktop ? 'Kesildi İşaretle' : undefined} color={CHIP_TONES.info.text} bg={CHIP_TONES.info.bg} onPress={handleMarkSent} disabled={busy} />
        )}
        {!readOnly && (invoice.status === 'kesildi' || invoice.status === 'kismi_odendi') && (
          <PillBtn icon={BellRing} label={isDesktop ? 'Hatirlatma' : undefined} color={DS.ink[500]} bg={DS.ink[50]} onPress={() => setReminderOpen(true)} disabled={busy} />
        )}
        {!readOnly && invoice.status === 'kesildi' && Number(invoice.paid_amount) === 0 && (
          <PillBtn icon={Undo2} label={isDesktop ? 'Taslağa Dön' : undefined} color={DS.ink[700]} bg={DS.ink[100]} onPress={handleRevertToDraft} disabled={busy} />
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
          paddingTop: 0,
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
        {/* ═══ SOL KOLON — fatura içeriği (maxWidth TEK yerde: tüm kartlar width:100% → aynı sol hiza) ═══ */}
        <View style={{ flex: isDesktop ? 1 : undefined, width: '100%', minWidth: 0, maxWidth: 800, gap: isDesktop ? 20 : 14 }}>

        {/* ═══════════════════════════════════════════════════════════
            §10 HERO — Fatura özet kartı (koşullu: overdue=dark, normal=panel)
            ═══════════════════════════════════════════════════════════ */}
        <View style={{
          width: '100%',
          borderRadius: 24,
          padding: 22,
          backgroundColor: isOverdue ? DS.ink[900] : theme.primary,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Row 1: FATURA title + number + status */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <Text style={{
              ...DISPLAY, fontSize: isDesktop ? 32 : 20, letterSpacing: -1,
              color: '#FFFFFF',
            }}>
              FATURA
            </Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.22)',
            }}>
              {(() => {
                const SIcon = isOverdue ? AlertCircle
                  : invoice.status === 'odendi' ? CircleCheck
                  : invoice.status === 'kesildi' ? Check
                  : invoice.status === 'kismi_odendi' ? Check
                  : invoice.status === 'iptal' ? X
                  : FileText; // taslak
                return <SIcon size={11} color="#FFFFFF" strokeWidth={2.6} />;
              })()}
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
            marginBottom: isDesktop ? 12 : 10,
          }}>
            {invoice.invoice_number}
          </Text>

          {/* Row 2: HİYERARŞİ — Kalan birincil (büyük), Toplam & Ödenen ikincil (küçük kolonlar) */}
          <View style={{
            flexDirection: isDesktop ? 'row' : 'column',
            alignItems: isDesktop ? 'flex-end' : 'stretch',
            gap: isDesktop ? 40 : 28,
          }}>
            {/* PRIMARY — Kalan */}
            <View style={{ flex: isDesktop ? 1 : undefined, minWidth: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>
                Kalan
              </Text>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...DISPLAY, fontSize: isDesktop ? 46 : 32, letterSpacing: -1.2, color: '#FFFFFF' }}>
                {fmtMoney(balance)}
              </Text>
            </View>
            {/* SECONDARY — Toplam · Ödenen (küçük, eşit kolonlar) */}
            <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
              {[
                { label: 'Toplam', value: fmtMoney(invoice.total) },
                { label: 'Ödenen', value: fmtMoney(invoice.paid_amount) },
              ].map((s, i) => (
                <View key={s.label} style={{
                  minWidth: isDesktop ? 96 : 0, flex: isDesktop ? undefined : 1,
                  paddingStart: i === 0 ? 0 : 16, paddingEnd: i === 0 ? 16 : 0,
                  borderStartWidth: i === 0 ? 0 : 1, borderStartColor: 'rgba(255,255,255,0.15)',
                }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', color: 'rgba(255,255,255,0.60)', marginBottom: 3 }}>
                    {s.label}
                  </Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...DISPLAY, fontSize: isDesktop ? 18 : 17, letterSpacing: -0.4, color: 'rgba(255,255,255,0.90)' }}>
                    {s.value}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* ═══ YATAY YAŞAM DÖNGÜSÜ ŞERİDİ — hero içinde (✓ done · ● active · ○ pending) ═══ */}
          <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', flexDirection: 'row', alignItems: 'flex-start' }}>
            {lifecycle.map((st, i) => {
              const done = st.state === 'done';
              const active = st.state === 'active';
              const prevDone = i > 0 && lifecycle[i - 1].state === 'done';
              const isLast = i === lifecycle.length - 1;
              return (
                // minWidth:0 şart — web'de flex öğesinin varsayılan min-width'i
                // "auto"dur, yani hücre içeriğinden (ör. "29 gün kaldı" rozeti)
                // daha dar olamaz. Rozetli adım genişleyince bağlaç çizgileri
                // eşitliğini kaybediyor ve son aralık kırık görünüyordu.
                <View key={st.label} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                  {/* Düğüm + bağlaç çizgileri */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                    <View style={{ flex: 1, height: 1.5, backgroundColor: i === 0 ? 'transparent' : (prevDone ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.16)') }} />
                    {/* Düğüm yuvası SABİT 18px. Bekleyen daire 14px çizilir ama
                        yuvası 18 kalır. Aksi halde çizgiler flex:1 olduğu için
                        küçük düğümün iki yanındaki aralık 4px uzuyor ve bağlaç
                        çizgileri farklı boylarda görünüyordu (daire merkezleri
                        eşit aralıklı olsa bile). */}
                    <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                      {done ? (
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={12} color={theme.primary} strokeWidth={3} />
                        </View>
                      ) : active ? (
                        <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
                        </View>
                      ) : (
                        <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.40)' }} />
                      )}
                    </View>
                    <View style={{ flex: 1, height: 1.5, backgroundColor: isLast ? 'transparent' : (done ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.16)') }} />
                  </View>
                  <Text numberOfLines={1} style={{ maxWidth: '100%', fontSize: 9.5, fontWeight: active ? '700' : '600', letterSpacing: 0.2, color: done || active ? '#FFFFFF' : 'rgba(255,255,255,0.5)', marginTop: 6 }}>
                    {st.short}
                  </Text>
                  {st.badge ? (
                    <Text numberOfLines={1} style={{ maxWidth: '100%', fontSize: 9, fontWeight: '700', color: duePressure.light, marginTop: 2 }}>
                      {st.badge.text}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

        </View>

        {/* ═══════════════════════════════════════════════════════════
            §05 cardSolid — Alici bilgileri
            ═══════════════════════════════════════════════════════════ */}
        <View style={{ width: '100%' }}>
          <View style={{
            ...cardSolid,
            flexDirection: isDesktop ? 'row' : 'column',
            gap: isDesktop ? 40 : 16,
          }}>
            {/* Alici */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], marginBottom: 10 }}>Alici</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>{invoice.clinic?.name ?? '—'}</Text>
              {/* doctors.full_name ZATEN ön ek içeriyor ("Dr. Aylar Teke", "Dt. Beyza…").
                  Düz "Dr. " eklemek "Dr. Dr. Aylar Teke" üretiyordu. normalizeDoctorName
                  ön eki varsa korur, yoksa ekler. */}
              {invoice.doctor?.full_name && <Text style={{ fontSize: 13, color: DS.ink[500], marginTop: 4 }}>{normalizeDoctorName(invoice.doctor.full_name)}</Text>}
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
                        {isRTL() ? <ChevronLeft size={11} strokeWidth={1.4} color={DS.ink[300]} /> : <ChevronRight size={11} strokeWidth={1.4} color={DS.ink[300]} />}
                      </Pressable>
                    ))
                  : invoice.work_order && (
                      <Pressable onPress={() => router.push(`/${panelBase}/order/${invoice.work_order!.id}` as any)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, cursor: 'pointer' as any }}>
                        <ClipboardList size={12} strokeWidth={1.6} color="#2563EB" />
                        <Text style={{ fontSize: 13, color: '#2563EB', fontWeight: '500' }}>
                          {invoice.work_order.order_number}{invoice.work_order.patient_name ? ` · ${invoice.work_order.patient_name}` : ''}
                        </Text>
                        {isRTL() ? <ChevronLeft size={11} strokeWidth={1.4} color={DS.ink[300]} /> : <ChevronRight size={11} strokeWidth={1.4} color={DS.ink[300]} />}
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
        <View style={{ width: '100%', ...tableCard }}>
          {/* Toolbar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            padding: 20, gap: 12,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900], flex: 1 }}>
              Fatura Kalemleri
            </Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: DS.ink[100] }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[500] }}>
                {items.length} Kalem
              </Text>
            </View>
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
            {isDesktop && <Text style={{ flex: 1.5, ...TH, textAlign: 'end' as any }}>BIRIM FIYAT</Text>}
            <Text style={{ flex: 1.5, ...TH, textAlign: 'end' as any }}>TOPLAM</Text>
            {invoice.status === 'taslak' && <View style={{ width: 32 }} />}
          </View>

          {/* Rows — §09 exact: paddingHorizontal 20, paddingVertical 14 */}
          {items.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: DS.ink[400], fontStyle: 'italic' }}>Kalem eklenmemiş</Text>
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
                        <EditableNum value={Number(it.unit_price)} editable onSave={(n) => saveItem(it.id, { unit_price: n })} fmt={fmtMoney} inputStyle={{ width: 96, textAlign: 'end' as any }} />
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
                    <EditableNum value={Number(it.unit_price)} editable={invoice.status === 'taslak'} onSave={(n) => saveItem(it.id, { unit_price: n })} fmt={fmtMoney} textStyle={{ fontSize: 13, color: DS.ink[800], textAlign: 'end' as any }} inputStyle={{ width: 110, textAlign: 'end' as any }} />
                  </View>
                )}
                <Text style={{ flex: 1.5, fontSize: 13, fontWeight: '500', color: DS.ink[900], textAlign: 'end' as any }}>{fmtMoney(it.total)}</Text>
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
                    Kur: 1 {invoice.currency} = {baseSymbol()}{(Number(rateVal) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}{!readOnly ? '  · düzenle' : ''}
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
          <View style={{ width: '100%', ...tableCard }}>
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
        {/* Sağ kolon ilk kartı hero ile AYNI hizadan başlar (fatura toolbar'ı yüzen
            arama/profil çubuğu için zaten yeterli boşluk bırakıyor). */}
        <View style={{ width: isDesktop ? 360 : '100%', gap: isDesktop ? 16 : 14 }}>

        {/* ═══ Notlar — cardSolid ═══ */}
        {invoice.notes && (
          <View style={{ width: '100%', maxWidth: 800, ...cardSolid }}>
            <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400], marginBottom: 8 }}>Notlar</Text>
            <Text style={{ fontSize: 13, color: DS.ink[700], lineHeight: 20 }}>{invoice.notes}</Text>
          </View>
        )}

        {/* ═══ Paneller ═══ (lab/admin) — AKIŞ: 1) Ödeme Linki → 2) E-Fatura
            (numaralı adımlar "önce hangisi?" belirsizliğini giderir) */}
        {!readOnly && (
          <View style={{ width: '100%', gap: 6 }}>
            {/* Adım 1 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>1</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[700], letterSpacing: 0.3 }}>Ödeme Linki</Text>
            </View>
            <PaymentLinkPanel invoiceId={invoice.id} balance={balance} onChanged={refetch} />

            {/* Bağlaç ↓ */}
            <View style={{ alignItems: 'center', paddingVertical: 2 }}>
              <ChevronDown size={16} color={DS.ink[300]} strokeWidth={2.2} />
            </View>

            {/* Adım 2 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>2</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[700], letterSpacing: 0.3 }}>E-Fatura</Text>
            </View>
            <EFaturaPanel
              invoiceId={invoice.id} status={invoice.efatura_status ?? 'pending'}
              uuid={invoice.efatura_uuid ?? null} type={invoice.efatura_type ?? null}
              provider={invoice.efatura_provider ?? null} error={invoice.efatura_error ?? null}
              onChanged={refetch}
            />
          </View>
        )}

        </View>{/* ═══ /SAĞ KOLON ═══ */}
        </View>{/* ═══ /split wrapper ═══ */}

        {/* ═══ TEHLİKELİ İŞLEMLER — sayfa altı, birincil aksiyonlardan AYRI, sönük ═══
            Koşul: iptal/ödendi DIŞINDA (İptal Et uygun); taslakta ayrıca Sil. */}
        {!readOnly && invoice.status !== 'iptal' && invoice.status !== 'odendi' && (
          <View style={{
            width: '100%', maxWidth: isDesktop ? 1180 : 800,
            marginTop: 8, paddingTop: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.07)',
            flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <Text style={{ flex: 1, minWidth: 140, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[400] }}>
              Tehlikeli işlemler
            </Text>
            <Pressable onPress={handleCancel} disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(217,75,75,0.28)', opacity: busy ? 0.5 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <CircleX size={13} strokeWidth={1.8} color={CHIP_TONES.danger.text} />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: CHIP_TONES.danger.text }}>Iptal Et</Text>
            </Pressable>
            {invoice.status === 'taslak' && (
              <Pressable onPress={handleDelete} disabled={busy}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(217,75,75,0.28)', opacity: busy ? 0.5 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Trash2 size={13} strokeWidth={1.8} color={CHIP_TONES.danger.text} />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: CHIP_TONES.danger.text }}>Taslagi Sil</Text>
              </Pressable>
            )}
          </View>
        )}
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
            {(['TRY', 'EUR', 'USD', 'GBP', 'IRT'] as const).map(c => {
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
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Geçerli bir tutar girin.'); return; }
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
    if (!desc.trim()) { toast.error('Açıklama girin.'); return; }
    if (!Number.isFinite(q) || q <= 0) { toast.error('Geçerli bir adet girin.'); return; }
    if (!Number.isFinite(p) || p < 0) { toast.error('Geçerli bir birim fiyat girin.'); return; }
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
          <FL>Açıklama</FL>
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
