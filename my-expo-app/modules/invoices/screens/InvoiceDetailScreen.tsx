import { localeTag, isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { invoiceStatusErrorText } from '../lib/statementDiscount';
import { isDiscountPayment, discountPaymentLabel } from '../lib/discountPayment';
import { validateInvoiceDiscount, invoiceDiscountRpcError, invoiceTotalsWithDiscount, listPriceInfo, round2, type InvoiceDiscountType } from '../lib/invoiceDiscount';
import { InvoiceDiscountField } from '../components/InvoiceDiscountField';
import { CorrectionDocModal } from '../components/CorrectionDocModal';
import { correctionMaxAmount } from '../lib/correctionDoc';
import { LabApprovalModal } from '../components/LabApprovalModal';
import { fetchPreStatement } from '../preStatementApi';
import { canLabWrite, preStatementErrorText } from '../lib/preStatement';
import type { PreStatementInvoice } from '../types';
import { useInvoiceApprovalEnabled } from '../../../core/store/labSettingsStore';
/**
 * InvoiceDetailScreen — Fatura Detayı (Patterns Design Language)
 *
 * Patterns showcase §05 cardSolid, §09 tablo, §10 hero,
 * §04 chip/tag token'larıyla fatura belge görünümü.
 */
import React, { useContext, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert,
  Modal, TextInput, Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navBarMetrics } from '../../../core/ui/mobile/navGlass';
import { EdgeSwipeBack } from '../../../core/ui/mobile/EdgeSwipeBack';
import { HubContext } from '../../../core/ui/HubContext';
import {
  ArrowLeft, ArrowRight, Printer, Banknote, CreditCard, Landmark, File,
  MoreHorizontal, Building2, User, Phone, MapPin, Calendar,
  ClipboardList, Plus, Trash2, Send, BellRing, CircleX, FileCheck,
  CircleCheck, X, AlertCircle, ChevronRight, ChevronLeft, ChevronDown, Check, FileText, Undo2, Pencil, FileEdit,
} from '../../../core/ui/icons';
import { toast } from '../../../core/ui/Toast';
import { PaymentBadges } from '../../../core/ui/PaymentBadges';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { useRouter, useLocalSearchParams, useSegments } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';

import { DS } from '../../../core/theme/dsTokens';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { useInkUI, type InkUI } from '../../../core/theme/inkScale';
import { useHeroSurface, HERO_NAVY } from '../../../core/ui/HeroGlow';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { CURRENCY_META, type Currency } from '../../../core/money/currency';
import { baseSymbol, getBaseCurrency } from '../../../core/money/baseCurrency';
import { useInvoice } from '../hooks/useInvoices';
import {
  recordPayment, setInvoiceStatus, deleteInvoice,
  addInvoiceItem, deleteInvoiceItem, updateInvoiceItem, updateInvoice,
  undoManualPayment, fetchCorrectionsForInvoice,
} from '../api';
import type { Payment, CorrectionDoc } from '../types';
import { usePermissions } from '../../../core/hooks/usePermissions';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS, type PaymentMethod,
} from '../types';
import { printInvoice } from '../printInvoice';
import { PaymentReminderModal } from '../components/PaymentReminderModal';
import { InvoiceActionsCard } from '../components/InvoiceActionsCard';
import { clinicEFaturaGaps, EFATURA_GAP_LABELS } from '../../efatura/lib/readiness';
import { openEFaturaPdf } from '../../efatura/pdf';
import { startMyInvoicePayment } from '../../payments/api';
import { PaymentSheetModal } from '../../payments/components/PaymentSheetModal';
import { OrderDetailScreenV2 } from '../../orders/screens/OrderDetailScreenV2';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { normalizeDoctorName } from '../../../core/utils/textCase';
import { NavyBackButtonX } from '../../../core/ui/NavyBackButtonX';
import { labTodayOf } from '../../../core/metrics/orderDefs';
import { cachedLabTz } from '../../../core/metrics/useLabToday';

// ── Patterns tokens (§05 kartlar) ───────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// cardSolid / tableCard / CHIP_TONES / TH artık `useInkUI()`ten türetilir —
// modül seviyesindeki sabitler hook çağıramadığı için koyu temada beyaz kalıyordu.
function chipTones(U: InkUI) {
  const t = U.chipTones;
  return {
    success: { bg: t.success.bg, text: t.success.fg },
    warning: { bg: t.warning.bg, text: t.warning.fg },
    danger:  { bg: t.danger.bg,  text: t.danger.fg },
    info:    { bg: t.info.bg,    text: t.info.fg },
    neutral: { bg: U.ink[100],   text: U.ink[500] },
  };
}

function modalShadowOf(U: InkUI) {
  return U.isDark ? '0 24px 48px -12px rgba(0,0,0,0.65)' : '0 24px 48px -12px rgba(0,0,0,0.18)';
}

function statusChip(U: InkUI): Record<string, { bg: string; text: string }> {
  const C = chipTones(U);
  return {
    taslak:       C.neutral,
    kesildi:      C.info,
    kismi_odendi: C.warning,
    odendi:       C.success,
    iptal:        C.danger,
  };
}

function thOf(U: InkUI) {
  return {
    fontSize: 10 as const,
    fontWeight: '600' as const,
    letterSpacing: 0.7,
    color: U.ink[500],
  };
}

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
// Adres JSON ({il,ilce,mahalle,sokak,bina_no,daire_no,posta_kodu}) ise okunaklı metne çevir;
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
    const daireNo = String(o.daire_no ?? '').trim();
    const line1 = [sokak, binaNo && !sokak.includes(binaNo) ? 'No: ' + binaNo : null, daireNo ? 'D: ' + daireNo : null].filter(Boolean).join(' ');
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
  const U = useInkUI();
  const [v, setV] = useState(String(value ?? 0));
  const focusedRef = React.useRef(false);
  // Input ODAKTAYKEN dış re-render (silent refetch) değeri EZMESİN — kullanıcı yazarken
  // sıfırlanma buradan oluyordu. Yalnız odak dışıyken prop'tan senkronla.
  React.useEffect(() => { if (!focusedRef.current) setV(String(value ?? 0)); }, [value]);
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
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; commit(); }}
      onSubmitEditing={commit}
      keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
      selectTextOnFocus
      style={[{
        borderWidth: 1, borderColor: U.fieldBorder, borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, color: U.ink[900],
        backgroundColor: U.isDark ? U.surfaceSoft : '#FFFFFF',
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

const DISCOUNT_LOCKED_TEXT = 'Kesilmiş faturada indirim değiştirilemez. Ekstreden indirim ekleyebilirsiniz.';

export function InvoiceDetailScreen({ invoiceId, onBack }: DetailProps = {}) {
  const U = useInkUI();
  const CHIP_TONES = chipTones(U);
  const STATUS_CHIP = statusChip(U);
  const theme = usePanelTheme();
  // Tablo şeritleri (Kalemler / Tahsilat) — finans tablolarıyla aynı dil: panel accent zemin
  const stripBg = theme.primary;
  const stripInk = onAccentInk(stripBg);
  const stripPill = stripInk === '#FFFFFF' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)';
  // HOOK: erken return'lerden ÖNCE ve koşulsuz. Aşağıda (isOverdue'nun
  // yanında) çağrılınca 'Rendered more hooks than during the previous
  // render' hatası veriyordu — yükleme/bulunamadı dallarında hiç
  // çalışmıyor, faturalı dalda çalışıyordu. Döndürdüğü değerlerden
  // kullandıklarım (tileBg/tileBorder/ink/inkFaint/isDark) accent'e
  // bağlı değil, o yüzden argümansız çağrılabiliyor.
  const hInk = useWhiteHeroInk();
  // İş emri bağlantıları hero zemininde: koyu temada kobalt sönük kalıyor.
  const linkInk = hInk.isDark ? '#93C5FD' : '#2563EB';

  /** Hero içi sütun başlığı — üç sütunda da birebir aynı ölçü. */
  const HERO_LBL = (h: { inkFaint: string }) => ({
    fontSize: 9, fontWeight: '700' as const, letterSpacing: 1,
    textTransform: 'uppercase' as const, color: h.inkFaint, marginBottom: 6,
  });
  // Koyu temada parlak accent hero göz yorar → derinleştirilmiş yüzey (HERO kuralı).
  const heroBg = useHeroSurface(theme.primary);
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
  const { invoice, loading, refetch, refetchSilent, patchItem } = useInvoice(id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  // Hub (Finans › Faturalar) içinde gömülüyken üstte hub başlığı + sekmeler zaten
  // var; çentik payını (insets.top) bir daha eklemek sekmelerin altında ~60pt boşluk
  // bırakıyordu. Yalnız bağımsız rota (/invoice/[id]) açılışında pay eklenir.
  const isEmbedded = useContext(HubContext) || !!onBack;

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  /** Klinik/hekim "Öde" düğmesi — intent açılırken çift tıklamayı engeller. */
  const [payBusy, setPayBusy] = useState(false);
  // Resmi e-fatura PDF'i — klinik/hekim panelinde başlıkta (lab'da e-Fatura kartında da var)
  const [efPdfBusy, setEfPdfBusy] = useState(false);
  const handleEFaturaPdf = async () => {
    if (!invoice) return;
    setEfPdfBusy(true);
    const r = await openEFaturaPdf(invoice.id);
    setEfPdfBusy(false);
    if (!r.ok) toast.error(autoT(r.error ?? 'PDF açılamadı'));
  };
  /** Açık ödeme modalinin token'ı — null iken modal kapalı. */
  const [payToken, setPayToken] = useState<string | null>(null);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [curPickerOpen, setCurPickerOpen] = useState(false);   // taslak para birimi seçici
  const [rateEditOpen, setRateEditOpen] = useState(false);     // kur düzenleme
  const [rateInput, setRateInput] = useState('');
  const [taxEditOpen, setTaxEditOpen] = useState(false);       // KDV oranı düzenleme
  const [taxInput, setTaxInput] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  // Fatura altı indirim alanı (taslakta düzenlenir). Ham metin; boş = indirim yok.
  const [discType, setDiscType] = useState<InvoiceDiscountType>('percent');
  const [discRaw, setDiscRaw] = useState('');
  const [discErr, setDiscErr] = useState<string | null>(null);     // alanın altı: doğrulama / kilit
  const [discSaveErr, setDiscSaveErr] = useState<string | null>(null); // kaydet düğmesinin yanı: ham sunucu hatası
  const [discBusy, setDiscBusy] = useState(false);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  // Masaüstünde iş emri faturanın üstünde popup açılır; mobilde SAYFA olarak — tam ekran
  // popup'ın kapatma X'i çentiğin altına düşüp dokunulamıyordu. Geri/kenar kaydırma faturaya döner.
  const openOrder = (id: string) => {
    if (isDesktop) setPreviewOrderId(id);
    else router.push(`/${panelBase}/order/${id}` as any);
  };
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);   // iptal/sil onayı (web-safe)
  // Tahsilatı geri alma yalnız finans yetkilisine (RLS de aynı kuralı uygular).
  // Hook KOŞULSUZ ve erken dönüşlerden ÖNCE — bu dosyada iki kez hook sırası bozuldu.
  const { can } = usePermissions();
  const canUndoPayment = !readOnly && can('manage_finance');
  // Düzeltme belgeleri (DZ) — kalem altında listelenir; pencere tek kalem için açılır.
  const [corrections, setCorrections] = useState<CorrectionDoc[]>([]);
  const [dzItemId, setDzItemId] = useState<string | null>(null);
  const corrReqRef = React.useRef(0);
  /** Kayıttan sonra DZ listesini yeniden çekmek için (ödenmiş faturada tutar/durum değişmeyebilir). */
  const [corrTick, setCorrTick] = useState(0);
  // Ön ekstre (K5): lab ayarı açıkken taslak "Kesildi İşaretle" yerine "Klinik adına onay kaydet".
  // Sunucu yine INV_APPROVAL_REQUIRED döndürürse (ör. ayar başka cihazda açıldı) düğme yerinde değişir.
  const approvalSetting = useInvoiceApprovalEnabled();
  const [approvalForced, setApprovalForced] = useState(false);
  // Kliniği olmayan faturada ön ekstre yolu yok → bugünkü "Kesildi İşaretle" akışı.
  const approvalOn = (approvalSetting || approvalForced) && !!invoice?.clinic_id;
  // Hata, işlemi başlatan butonun yanında: üst şerit ('hero') ya da e-Fatura kısayolu ('efatura').
  const [markErrState, setMarkErrState] = useState<{ msg: string; at: 'hero' | 'efatura' } | null>(null);
  const markErr = markErrState?.at === 'hero' ? markErrState.msg : null;
  const efaturaIssueErr = markErrState?.at === 'efatura' ? markErrState.msg : null;
  const setMarkErr = (msg: string | null, at: 'hero' | 'efatura' = 'hero') => setMarkErrState(msg ? { msg, at } : null);
  const [labApprove, setLabApprove] = useState<PreStatementInvoice[] | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const approveLoadRef = React.useRef(false);
  useEffect(() => { setMarkErr(null); setLabApprove(null); }, [invoice?.id]);
  const invStatus = invoice?.status;
  const invPaid = invoice?.paid_amount;
  useEffect(() => {
    const invId = invoice?.id;
    if (!invId || invStatus === 'taslak') { setCorrections([]); return; }
    const my = ++corrReqRef.current;
    fetchCorrectionsForInvoice(invId).then((res) => {
      if (my !== corrReqRef.current) return;
      if (!res.error) setCorrections(res.data);
    });
  }, [invoice?.id, invStatus, invPaid, corrTick]);

  // Fatura değiştiğinde not düzenleyicisini o faturanın güncel notuyla başlat.
  useEffect(() => {
    setNoteDraft(invoice?.notes ?? '');
  }, [invoice?.id]);

  // İndirim alanı sunucudaki değerle eşitlenir (fatura değişince / kayıttan sonra).
  useEffect(() => {
    setDiscType((invoice?.discount_type as InvoiceDiscountType) ?? 'percent');
    const v = Number(invoice?.discount_value) || 0;
    setDiscRaw(v > 0 ? String(v).replace('.', ',') : '');
    setDiscErr(null); setDiscSaveErr(null);
  }, [invoice?.id, invoice?.discount_type, invoice?.discount_value]);

  if (loading) {
    return <CenteredLoader color={U.ink[400]} />;
  }

  if (!invoice) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <AlertCircle size={40} strokeWidth={1.4} color={U.ink[300]} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>Fatura bulunamadı</Text>
        <Pressable onPress={goBack} style={{
          paddingHorizontal: 20, paddingVertical: 10, borderRadius: 9999,
          backgroundColor: U.ink[100], cursor: 'pointer' as any,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>Geri don</Text>
        </Pressable>
      </View>
    );
  }

  // Faturanın para birimine göre formatla (₺ sabit değil) — tüm fmtMoney
  // çağrılarını bu yerel closure gölgeler.
  const fmtMoney = (n: number | string | null | undefined) => fmtMoneyCur(n, invoice.currency || 'TRY');

  // Taslak fatura kalemini inline güncelle (birim fiyat/adet) — toplam trigger'la yeniden hesaplanır.
  const saveItem = async (id: string, patch: { quantity?: number; unit_price?: number; discount_type?: 'percent' | 'fixed'; discount_value?: number }) => {
    const { data, error } = await updateInvoiceItem(id, patch);
    if (error) { toast.error((error as any).message ?? String(error)); return; }
    // Kalemi UPDATE'in döndürdüğü TAZE satırla güncelle + toplamları yerelde hesapla.
    // Fatura sorgusunun gömülü invoice_items(*) embed'i bayat/0 döndürse bile değer
    // silinmez — refetch KULLANILMAZ (embed staleness sorununu tamamen atlar).
    if (data) patchItem(id, data as any);
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

  // KDV oranı: e-faturaya gönderilene kadar değiştirilebilir (gönderilmiş belge
  // GİB'de kayıtlı — oran değişemez). Toplamları recalc_on_tax_change yeniden hesaplar.
  const canEditTax = !readOnly && invoice.status === 'taslak'
    && (!invoice.efatura_uuid || invoice.efatura_status === 'error');
  // Resmi e-faturası (ETTN) olan fatura Siman'da iptal edilemez / silinemez
  // (DB tetikleyicisi zz_invoices_efatura_lock da reddeder). e-Fatura Luca'da iptal edildiyse açılır.
  const efLocked = !!invoice.efatura_uuid && invoice.efatura_status !== 'cancelled';
  const saveTax = async (raw?: string) => {
    const v = Number(String(raw ?? taxInput).replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 100) { toast.error(autoT('Geçerli bir KDV oranı gir (0–100).')); return; }
    setTaxEditOpen(false);
    if (v === Number(invoice.tax_rate)) return;
    const { error } = await updateInvoice(invoice.id, { tax_rate: v });
    if (error) toast.error((error as any).message ?? String(error)); else { toast.success(autoT('KDV oranı güncellendi.')); refetch(); }
  };

  // Fatura altı indirim: doğrula → updateInvoice → yeniden yükle. Sunucu hataları alanın yanında.
  const saveDiscount = async () => {
    setDiscSaveErr(null);
    const r = validateInvoiceDiscount(discType, discRaw);
    if (!r.ok) { setDiscErr(r.error); return; }
    setDiscErr(null);
    setDiscBusy(true);
    const patch = r.value > 0
      ? { discount_type: discType, discount_value: r.value }
      : { discount_type: null, discount_value: 0 };
    const { error } = await updateInvoice(invoice.id, patch);
    setDiscBusy(false);
    if (error) {
      const msg = String((error as any).message ?? error);
      if (msg.includes('INV_DISCOUNT_LOCKED')) setDiscErr(DISCOUNT_LOCKED_TEXT);
      else {
        const mapped = invoiceDiscountRpcError(msg, discType, discRaw);
        if (mapped) setDiscErr(mapped); else setDiscSaveErr(msg);
      }
      return;
    }
    toast.success(autoT('Fatura indirimi kaydedildi'));
    refetchSilent();
  };

  const saveNote = async () => {
    const notes = noteDraft.trim() || null;
    if (notes === (invoice.notes ?? null)) return;
    setSavingNote(true);
    const { error } = await updateInvoice(invoice.id, { notes });
    setSavingNote(false);
    if (error) {
      toast.error((error as any).message ?? String(error));
      return;
    }
    toast.success(notes ? 'Klinik notu kaydedildi.' : 'Klinik notu kaldırıldı.');
    refetch();
  };

  const base = getBaseCurrency();
  const isForeign = (invoice.currency || base) !== base;
  const rateVal = Number(invoice.rate_at_time ?? 0);

  const chip = STATUS_CHIP[invoice.status] ?? CHIP_TONES.neutral;
  const balance = Number(invoice.total) - Number(invoice.paid_amount);
  const today = labTodayOf(cachedLabTz());   // lab günü (UTC değil)
  const isOverdue = invoice.due_date && invoice.due_date < today
    && invoice.status !== 'odendi' && invoice.status !== 'iptal';
  /** Gecikmede hero tehlike rengine döner; hero içindeki her vurgu bundan
   *  beslenir (düğümler, bağlaç çizgileri, durum rozeti). */
  const heroAccent = isOverdue ? '#D94B4B' : theme.primary;

  // Zaman şeridi — oluşturuldu · son ödeme · vade baskısı (kullanıcı zaman baskısını da yönetir)
  const createdDate = (invoice.created_at ? String(invoice.created_at).slice(0, 10) : invoice.issue_date);
  const _payDates = (invoice.payments ?? []).map(p => p.payment_date).filter(Boolean).sort();
  const lastPaymentDate = _payDates.length ? _payDates[_payDates.length - 1] : null;
  const duePressure: { text: string; color: string; bg: string; fg: string; light: string } = (() => {
    const amber = { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E', light: '#FCD34D' };
    const green = { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47', light: '#86EFAC' };
    const red   = { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E', light: '#FCA5A5' };
    const none  = { bg: U.ink[100],             fg: U.ink[500], light: 'rgba(255,255,255,0.7)' };
    if (invoice.status === 'odendi') return { text: 'Ödendi', color: '#1F6B47', ...green };
    if (invoice.status === 'iptal')  return { text: 'İptal',  color: U.ink[400], ...none };
    if (!invoice.due_date)           return { text: '—',      color: U.ink[400], ...none };
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
  // Bağlı iş emirleri TEK listede: çoklu bağlantı (linked_orders) yoksa
  // eski tek-emirli faturalar work_order alanını kullanıyor.
  const orderLinks = (invoice.linked_orders?.length
    ? invoice.linked_orders.map(lo => lo.work_order).filter(Boolean)
    : (invoice.work_order ? [invoice.work_order] : [])) as NonNullable<typeof invoice.work_order>[];
  // Tahsilat yüzdesi 0-100'e kıstırılır: fazla tahsilatta çubuk taşmasın.
  const paidPct = Math.max(0, Math.min(100, Number(invoice.total) > 0
    ? Math.round((Number(invoice.paid_amount) / Number(invoice.total)) * 100) : 0));

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

  // Klinik/hekim kendi faturasını öder: RPC intent açar (tutar SUNUCUDA
  // hesaplanır), sonra halka açık ödeme sayfasına gidilir. Aynı fatura için
  // geçerli bir intent varsa yenisi açılmaz, mevcut token döner.
  // (payBusy state'i YUKARIDA, diğer hook'ların yanında — burada tanımlanırsa
  //  `if (loading) return` erken çıkışının ALTINDA kalır ve ilk render'da
  //  hook sayısı değişir: "Rendered more hooks than during the previous render".)
  const handleClientPay = async () => {
    if (payBusy) return;
    setPayBusy(true);
    const r = await startMyInvoicePayment(invoice.id);
    setPayBusy(false);
    if (r.error || !r.token) { toast.error(r.error ?? 'Ödeme başlatılamadı'); return; }
    setPayToken(r.token);   // ayrı sayfa değil, modal
  };

  const handlePrint = async () => {
    const res = await printInvoice(invoice);
    if (!res.ok && res.error) toast.error(res.error);
  };
  const handleMarkSent = async (at: 'hero' | 'efatura' = 'hero') => {
    setBusy(true);
    setMarkErr(null);
    const { error } = await setInvoiceStatus(invoice.id, 'kesildi');
    setBusy(false);
    if (error) {
      const msg = (error as any).message ?? String(error);
      if (/INV_APPROVAL_REQUIRED/.test(msg)) {
        // Ayar bu arada açılmış: hata düğmenin yanında, düğme "Klinik adına onay kaydet"e döner.
        setApprovalForced(true);
        setMarkErr(autoT(invoiceStatusErrorText(msg)), at);
      } else toast.error(autoT(invoiceStatusErrorText(msg)));
    } else refetch();
  };
  // Yalnız bu faturayı içeren LabApprovalModal. Fatura sunucudan get_pre_statement ile TAZE
  // çekilir: updated_at dizgisi DB'deki gibi kalır (Date'e çevrilmez — K6).
  const openLabApproval = async (at: 'hero' | 'efatura' = 'hero') => {
    if (approveLoadRef.current || !invoice.clinic_id) return;
    approveLoadRef.current = true;
    setApproveLoading(true); setMarkErr(null);
    try {
      const ps = await fetchPreStatement(invoice.clinic_id);
      if (!canLabWrite(ps.actor, ps.can_manage)) { setMarkErr(autoT('Bu işlem için mali işlem yönetme yetkisi gerekir'), at); return; }
      const inv = (ps.invoices ?? []).find(i => i.id === invoice.id);
      if (!inv) { setMarkErr(autoT('Bu fatura artık taslak değil'), at); refetch(); return; }
      setLabApprove([inv]);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const known = preStatementErrorText(msg);
      setMarkErr(known ? autoT(known) : msg, at);
    } finally {
      approveLoadRef.current = false;
      setApproveLoading(false);
    }
  };
  // Yanlışlıkla girilen tahsilat ("ödendi" yapılan fatura) — durum tetikleyiciyle kendiliğinden döner.
  const handleUndoPayment = (p: Payment) => {
    setConfirm({
      title: 'Tahsilatı geri al', variant: 'danger',
      message:
        `${fmtMoney(p.amount)} · ${fmtDate(p.payment_date)} · ${autoT(PAYMENT_METHOD_LABELS[p.payment_method])}\n\n` +
        autoT('Bu tahsilat silinir; fatura durumu ve kalan tutar kendiliğinden güncellenir. İşlem aktivite kaydına yazılır.'),
      label: 'Geri al',
      onConfirm: async () => {
        setConfirm(null);
        setBusy(true);
        const { error } = await undoManualPayment(p, invoice.invoice_number, invoice.lab_id ?? null);
        setBusy(false);
        if (error) toast.error(autoT(error));
        else { toast.success(autoT('Tahsilat geri alındı, fatura güncellendi.')); refetch(); }
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
        if (error) toast.error(autoT(invoiceStatusErrorText((error as any).message ?? String(error)))); else refetch();
      },
    });
  };
  const handleDelete = () => {
    setConfirm({
      title: 'Faturayı Sil', variant: 'danger',
      message: 'Bu taslak fatura silinecek. Geri alınamaz.',
      label: 'Evet, sil',
      onConfirm: async () => {
        setConfirm(null);   // onay diyaloğunu hemen kapat (ConfirmDialog onConfirm sonrası kapatmıyor)
        setBusy(true);
        const { error } = await deleteInvoice(invoice.id);
        setBusy(false);
        if (error) { toast.error((error as any).message ?? String(error)); return; }
        toast.success('Taslak fatura silindi.');
        // Silinen kayda "geri" dönülmez: yığın boşken router.back() sessizce hiçbir şey
        // yapmıyor, kullanıcı silinmiş faturanın sayfasında kalıyordu → listeye REPLACE.
        if (onBack) { onBack(); return; }
        router.replace((panelBase === '(lab)' ? '/(lab)/invoices' : `/${panelBase}/finance?tab=invoices`) as any);
      },
    });
  };

  const items = (invoice.items ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  // Düzeltme belgesi (DZ): yalnız lab panelinde, kesinleşmiş (iptal olmayan) faturada.
  const canCorrect = !readOnly && can('manage_finance') && ['kesildi', 'kismi_odendi', 'odendi'].includes(invoice.status);
  const correctionsByItem = new Map<string, CorrectionDoc[]>();
  for (const c of corrections) {
    if (!c.invoice_item_id) continue;
    const arr = correctionsByItem.get(c.invoice_item_id) ?? [];
    arr.push(c);
    correctionsByItem.set(c.invoice_item_id, arr);
  }
  const priorOn = (itemId: string) =>
    round2((correctionsByItem.get(itemId) ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0));
  // Tavan (SQL ile aynı): kalemin fatura toplamındaki payı − kalemdeki DZ; ayrıca faturanın tüm DZ'leri ≤ toplam
  const sumItemNet = items.reduce((s, it) => s + (Number(it.net_total ?? it.total) || 0), 0);
  const priorOnInvoice = round2(corrections.reduce((s, c) => s + (Number(c.amount) || 0), 0));
  const correctionCapFor = (it: { id: string; net_total?: number | null; total?: number | null }) => correctionMaxAmount({
    itemNetTotal: Number(it.net_total ?? it.total) || 0, invoiceTotal: Number(invoice.total) || 0, sumNetTotal: sumItemNet,
    priorOnItem: priorOn(it.id), priorOnInvoice,
  });
  const dzItem = dzItemId ? items.find(i => i.id === dzItemId) ?? null : null;

  return (
    <View style={{ flex: 1 }}>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          alignItems: isDesktop ? 'center' : 'stretch',
          paddingHorizontal: isDesktop ? 32 : 12,
          /* Eylemler hero'ya taşındığı için üstteki araç çubuğu kalktı;
             çentik payı buraya geçti, aksi halde içerik saat/çentiğin altına
             giriyordu. */
          paddingTop: isDesktop || isEmbedded ? 8 : insets.top + 8,
          // Mobilde yüzen alt menünün gerçek yüksekliği kadar boşluk; sabit 80 Face ID'li
          // iPhone'da son ~36pt'yi (alttaki aksiyonlar) menünün arkasında bırakıyordu.
          paddingBottom: isDesktop ? 80 : navBarMetrics(insets.bottom).clearance + 16,
          gap: isDesktop ? 20 : 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero TAM GENİŞLİK: split satırının üstünde, iki kolonu birden
            kapsar. Sağ kolon kartları bu yüzden hero'nun altından başlar. */}
        <View style={{ width: '100%', maxWidth: isDesktop ? 1180 : 800 }}>
          {/* ═══════════════════════════════════════════════════════════
              §10 HERO — Fatura özet kartı (koşullu: overdue=dark, normal=panel)
              ═══════════════════════════════════════════════════════════ */}
          <WhiteHero
            /* Gecikmede accent tehlike rengine döner: hero zemini, düğümler ve
               bağlaç çizgileri hep bu accent'ten beslenir, tek yerden. */
            accent={heroAccent}
            compact
            leading={
              /* Lacivert geri düğmesi — Finans'ın ortak bileşeni (NavyBackButtonX) */
              <NavyBackButtonX onPress={goBack} />
            }
            kicker={`${autoT('Fatura')} · ${invoice.invoice_number}`}
            title={fmtMoney(balance)}
            description={autoT('Kalan')}
            /* Durum rozeti + belge eylemleri kartın SAĞ ÜST köşesinde, yani
               tutarın ÖNÜNDE: alt şeride sarkınca kart uzuyor, eylemler de
               zaman çizelgesinin altında kalıp gözden kaçıyordu. */
            cta={
              <View style={{ alignItems: 'flex-end', gap: 9 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                backgroundColor: hInk.tileBg, borderWidth: 1, borderColor: hInk.tileBorder,
              }}>
                {(() => {
                  const SIcon = isOverdue ? AlertCircle
                    : invoice.status === 'odendi' ? CircleCheck
                    : invoice.status === 'kesildi' ? Check
                    : invoice.status === 'kismi_odendi' ? Check
                    : invoice.status === 'iptal' ? X
                    : FileText;
                  return <SIcon size={11} color={isOverdue ? heroAccent : hInk.ink} strokeWidth={2.6} />;
                })()}
                <Text style={{
                  fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5,
                  textTransform: 'uppercase', color: isOverdue ? heroAccent : hInk.ink,
                }}>
                  {isOverdue ? 'Vadesi Geçti' : INVOICE_STATUS_LABELS[invoice.status]}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {/* Klinik/hekim: fatura bazında online ödeme. Gecikmede
                        kırmızı — listedeki "Öde" kapsülüyle aynı kural. */}
                    {readOnly && balance > 0 && invoice.status !== 'iptal' && invoice.status !== 'taslak' && (
                      <PillBtn
                        icon={CreditCard}
                        label={payBusy ? autoT('Açılıyor…') : autoT('Öde')}
                        bg={isOverdue ? '#D94B4B' : '#314F7E'}
                        color="#FFFFFF"
                        onPress={handleClientPay}
                        disabled={payBusy}
                      />
                    )}
                    {!readOnly && invoice.status === 'taslak' && markErr ? (
                      <Text style={{ maxWidth: 280, fontSize: 12, lineHeight: 16, color: U.chipTones.danger.fg }}>{markErr}</Text>
                    ) : null}
                    {!readOnly && invoice.status === 'taslak' && !approvalOn && (
                      <PillBtn icon={Send} label="Kesildi İşaretle" stacked={!isDesktop} color={CHIP_TONES.info.text} bg={CHIP_TONES.info.bg} onPress={() => { void handleMarkSent('hero'); }} disabled={busy} />
                    )}
                    {!readOnly && invoice.status === 'taslak' && approvalOn && (
                      <GlassTooltip title={autoT('Klinik adına onay kaydet')} text={autoT('Klinikten aldığınız onayı gerekçesiyle kaydeder; fatura kesinleşir')}>
                        <PillBtn icon={FileCheck} label={autoT('Klinik adına onay kaydet')} stacked={!isDesktop} color={CHIP_TONES.info.text} bg={CHIP_TONES.info.bg} onPress={() => { void openLabApproval('hero'); }} disabled={busy || approveLoading} />
                      </GlassTooltip>
                    )}
                    {!readOnly && (invoice.status === 'kesildi' || invoice.status === 'kismi_odendi') && (
                      <PillBtn icon={BellRing} label="Hatırlatma" stacked={!isDesktop} color={U.ink[500]} bg={U.ink[50]} onPress={() => setReminderOpen(true)} disabled={busy} />
                    )}
                    {!readOnly && balance > 0 && invoice.status !== 'iptal' && (
                      <PillBtn icon={Banknote} label="Tahsilat Ekle" stacked={!isDesktop} onPress={() => setPaymentModalVisible(true)} dark />
                    )}
                    {readOnly && invoice.efatura_uuid && invoice.efatura_status !== 'cancelled' && (
                      <PillBtn icon={FileText} label={efPdfBusy ? 'PDF alınıyor…' : 'e-Fatura PDF'} stacked={!isDesktop} onPress={handleEFaturaPdf} disabled={efPdfBusy} />
                    )}
                    <PillBtn icon={Printer} label="Yazdır" stacked={!isDesktop} onPress={handlePrint} />
              </View>
              </View>
            }
          >
            {/* ═══ BİLGİ ŞERİDİ — alıcı · bağlı iş emirleri · tahsilat ═══
                Üç sütun eşit ağırlıkta: "kime kestim", "neyin karşılığı",
                "ne kadarı tahsil edildi". Dar ekranda alt alta iner. */}
            <View style={{
              marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: hInk.tileBorder,
              flexDirection: isDesktop ? 'row' : 'column',
              gap: isDesktop ? 22 : 14,
            }}>
              {/* ── Alıcı ── */}
              <View style={{ flex: isDesktop ? 1.2 : undefined, minWidth: 0, flexDirection: 'row', gap: 11 }}>
                {/* Monogram: klinik adının baş harfleri — logo yoksa kimliği
                    taşıyan tek görsel çapa. */}
                <View style={{
                  width: 34, height: 34, borderRadius: 11, marginTop: 1,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: hInk.tileBg, borderWidth: 1, borderColor: hInk.tileBorder,
                }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: hInk.ink }}>
                    {(invoice.clinic?.name ?? '—').split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={HERO_LBL(hInk)}>{autoT('Alıcı')}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '600', color: hInk.ink }}>
                    {invoice.clinic?.name ?? '—'}
                  </Text>
                  {/* doctors.full_name ZATEN ön ek içeriyor ("Dt. Beyza…") →
                      normalizeDoctorName ön eki varsa korur, yoksa ekler. */}
                  {invoice.doctor?.full_name ? (
                    <Text numberOfLines={1} style={{ fontSize: 12.5, color: hInk.inkSoft, marginTop: 2 }}>
                      {normalizeDoctorName(invoice.doctor.full_name)}
                    </Text>
                  ) : null}
                  {invoice.doctor?.phone ? (
                    <Text numberOfLines={1} style={{ fontSize: 11.5, color: hInk.inkFaint, marginTop: 2 }}>
                      {invoice.doctor.phone}
                    </Text>
                  ) : null}
                  {invoice.clinic?.address ? (
                    <Text numberOfLines={2} style={{ fontSize: 11.5, color: hInk.inkFaint, marginTop: 2, lineHeight: 15 }}>
                      {formatAddress(invoice.clinic.address)}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* ── Bağlı iş emirleri (kapsül, düz satır değil) ── */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={HERO_LBL(hInk)}>{autoT('İş emirleri')}</Text>
                {orderLinks.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {orderLinks.map(o => (
                      <Pressable key={o.id} onPress={() => openOrder(o.id)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                          maxWidth: '100%',
                          backgroundColor: hInk.tileBg, borderWidth: 1, borderColor: hInk.tileBorder,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        }}>
                        <ClipboardList size={12} strokeWidth={1.7} color={linkInk} />
                        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: linkInk, flexShrink: 1 }}>
                          {o.order_number}{o.patient_name ? ` · ${o.patient_name}` : ''}
                        </Text>
                        {isRTL()
                          ? <ChevronLeft size={11} strokeWidth={1.6} color={hInk.inkFaint} />
                          : <ChevronRight size={11} strokeWidth={1.6} color={hInk.inkFaint} />}
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: hInk.inkFaint }}>{autoT('Bağlı iş emri yok')}</Text>
                )}
              </View>

              {/* ── Tahsilat ilerlemesi ── */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={HERO_LBL(hInk)}>{autoT('Tahsilat')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: hInk.ink }}>%{paidPct}</Text>
                  <Text style={{ fontSize: 11.5, color: hInk.inkFaint, flexShrink: 1 }} numberOfLines={1}>
                    {autoT('tahsil edildi')}
                  </Text>
                </View>
                {/* Ray accent'in soluk tonu: gecikmede kırmızı, normalde panel
                    rengi — kartın geri kalanıyla aynı kaynaktan beslenir. */}
                <View style={{
                  height: 6, borderRadius: 999, marginTop: 8, overflow: 'hidden',
                  backgroundColor: hInk.isDark ? 'rgba(255,255,255,0.18)' : `${heroAccent}24`,
                }}>
                  <View style={{ width: `${paidPct}%`, height: '100%', borderRadius: 999, backgroundColor: heroAccent }} />
                </View>
                <View style={{ marginTop: 8, gap: 3 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ fontSize: 11.5, color: hInk.inkFaint }}>{autoT('Toplam')}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: hInk.ink }}>{fmtMoney(invoice.total)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ fontSize: 11.5, color: hInk.inkFaint }}>{autoT('Ödenen')}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: hInk.ink }}>{fmtMoney(invoice.paid_amount)}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ═══ YATAY YAŞAM DÖNGÜSÜ ŞERİDİ (✓ done · ● active · ○ pending) ═══ */}
            <View style={{
              marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: hInk.tileBorder,
              flexDirection: 'row', alignItems: 'flex-start',
            }}>
              {lifecycle.map((st, i) => {
                const done = st.state === 'done';
                const active = st.state === 'active';
                const prevDone = i > 0 && lifecycle[i - 1].state === 'done';
                const isLast = i === lifecycle.length - 1;
                const lineOn = hInk.isDark ? 'rgba(255,255,255,0.45)' : `${heroAccent}66`;
                const lineOff = hInk.isDark ? 'rgba(255,255,255,0.16)' : `${heroAccent}1F`;
                return (
                  // minWidth:0 şart — web'de flex öğesinin varsayılan min-width'i
                  // "auto"dur, yani hücre içeriğinden (ör. "29 gün kaldı" rozeti)
                  // daha dar olamaz. Rozetli adım genişleyince bağlaç çizgileri
                  // eşitliğini kaybediyor ve son aralık kırık görünüyordu.
                  <View key={st.label} style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                      <View style={{ flex: 1, height: 1.5, backgroundColor: i === 0 ? 'transparent' : (prevDone ? lineOn : lineOff) }} />
                      {/* Düğüm yuvası SABİT 18px. Bekleyen daire 14px çizilir ama
                          yuvası 18 kalır; aksi halde çizgiler flex:1 olduğu için
                          küçük düğümün iki yanındaki aralık uzuyor ve bağlaçlar
                          farklı boylarda görünüyordu. */}
                      <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                        {done ? (
                          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: heroAccent, alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={12} color={onAccentInk(heroAccent)} strokeWidth={3} />
                          </View>
                        ) : active ? (
                          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: heroAccent, alignItems: 'center', justifyContent: 'center' }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: heroAccent }} />
                          </View>
                        ) : (
                          <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: hInk.inkFaint }} />
                        )}
                      </View>
                      <View style={{ flex: 1, height: 1.5, backgroundColor: isLast ? 'transparent' : (done ? lineOn : lineOff) }} />
                    </View>
                    <Text numberOfLines={1} style={{
                      maxWidth: '100%', fontSize: 9.5, fontWeight: active ? '700' : '600',
                      letterSpacing: 0.2, marginTop: 6,
                      color: done || active ? hInk.ink : hInk.inkFaint,
                    }}>
                      {st.short}
                    </Text>
                    {st.badge ? (
                      <Text numberOfLines={1} style={{
                        maxWidth: '100%', fontSize: 9, fontWeight: '700',
                        color: st.badge.fg, marginTop: 2,
                      }}>
                        {st.badge.text}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </WhiteHero>
        </View>

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
            §09 TABLO — Kalemler
            ═══════════════════════════════════════════════════════════ */}
        <View style={{ width: '100%', ...U.tableCard }}>
          {/* Toolbar — mobilde tek satıra sığmıyordu (başlık + rozet + kur + "Kalem Ekle"
              butonu sayfa dışına taşıyordu). Dar ekranda aksiyonlar ALT SATIRA iner. */}
          {(() => {
            const itemActions = invoice.status === 'taslak' ? (
              <>
                <Pressable onPress={() => setCurPickerOpen(true)} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: stripPill,
                  cursor: 'pointer' as any,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: stripInk }}>
                    {CURRENCY_META[(invoice.currency || 'TRY') as Currency]?.symbol ?? '₺'} {invoice.currency || 'TRY'}
                  </Text>
                  <ChevronDown size={13} strokeWidth={1.8} color={stripInk} />
                </Pressable>
                {/* Şerit üstünde birincil eylem: şerit mürekkebi zemin, accent yazı */}
                <Pressable onPress={() => setAddItemModalVisible(true)} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: stripInk, cursor: 'pointer' as any,
                }}>
                  <Plus size={13} strokeWidth={2} color={stripBg} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: stripBg }}>Kalem Ekle</Text>
                </Pressable>
              </>
            ) : null;
            return (
              <View style={{
                paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: isDesktop ? 20 : 14, gap: 12,
                backgroundColor: stripBg,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text numberOfLines={1} style={{ ...DISPLAY, fontSize: isDesktop ? 22 : 18, letterSpacing: -0.4, color: stripInk, flexShrink: 1 }}>
                    Fatura Kalemleri
                  </Text>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: stripPill }}>
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: stripInk }}>
                      {items.length} Kalem
                    </Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  {isDesktop ? itemActions : null}
                </View>
                {!isDesktop && itemActions ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {itemActions}
                  </View>
                ) : null}
              </View>
            );
          })()}

          {/* Header — §09 exact: #FAFAFA bg, uppercase 10px */}
          <View style={{
            flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12,
            backgroundColor: U.surfaceSoft,
            borderBottomWidth: 1, borderBottomColor: U.hairline,
          }}>
            <Text style={{ flex: 3, ...thOf(U) }}>ACIKLAMA</Text>
            {isDesktop && <Text style={{ flex: 1, ...thOf(U), textAlign: 'center' }}>ADET</Text>}
            {isDesktop && <Text style={{ flex: 1.5, ...thOf(U), textAlign: 'end' as any }}>BIRIM FIYAT</Text>}
            <Text style={{ flex: 1.5, ...thOf(U), textAlign: 'end' as any }}>TOPLAM</Text>
            {invoice.status === 'taslak' && <View style={{ width: 32 }} />}
          </View>

          {/* Rows — §09 exact: paddingHorizontal 20, paddingVertical 14 */}
          {items.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: U.ink[400], fontStyle: 'italic' }}>Kalem eklenmemiş</Text>
            </View>
          ) : (
            items.map((it, idx) => (
              <View key={it.id} style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 20, paddingVertical: 14,
                borderBottomWidth: idx < items.length - 1 ? 1 : 0,
                borderBottomColor: U.hairlineSoft,
              }}>
                <View style={{ flex: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[900] }}>{it.description}</Text>
                  {/* Kliniğin genel oranından gelen kalem: liste fiyatı ve oran (yalnız gösterim; birim fiyat/tutar net) */}
                  {(() => {
                    const lp = listPriceInfo(it);
                    return lp ? (
                      <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 2 }}>
                        {`${autoT('Liste fiyatı')} ${fmtMoney(Number(lp.listUnit) || 0)} · ${autoT('Genel indirim')} %${(Number(lp.pct) || 0).toLocaleString(localeTag())}`}
                      </Text>
                    ) : null;
                  })()}
                  {!isDesktop && (
                    invoice.status === 'taslak' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <EditableNum value={Number(it.quantity)} editable onSave={(n) => saveItem(it.id, { quantity: n })} inputStyle={{ width: 48, textAlign: 'center' }} />
                        <Text style={{ fontSize: 12, color: U.ink[400] }}>×</Text>
                        <EditableNum value={Number(it.unit_price)} editable onSave={(n) => saveItem(it.id, { unit_price: n })} fmt={fmtMoney} inputStyle={{ width: 96, textAlign: 'end' as any }} />
                      </View>
                    ) : (
                      <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 2 }}>
                        {Number(it.quantity).toLocaleString('tr-TR')} x {fmtMoney(it.unit_price)}
                      </Text>
                    )
                  )}
                  {/* Kalem indirimi — % / sabit tutar */}
                  {invoice.status === 'taslak' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <Text style={{ fontSize: 11, color: U.ink[500] }}>İndirim</Text>
                      <Pressable
                        onPress={() => saveItem(it.id, { discount_type: (it.discount_type === 'fixed' ? 'percent' : 'fixed') })}
                        style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: U.fieldBorder, cursor: 'pointer' as any }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[700] }}>{it.discount_type === 'fixed' ? 'Tutar' : '%'}</Text>
                      </Pressable>
                      <EditableNum value={Number(it.discount_value) || 0} editable onSave={(n) => saveItem(it.id, { discount_value: n })} textStyle={{ fontSize: 12, color: U.ink[800] }} inputStyle={{ width: 60, textAlign: 'center' }} />
                    </View>
                  ) : (Number(it.discount_value) || 0) > 0 ? (
                    <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 2 }}>
                      İndirim: {it.discount_type === 'fixed' ? `−${fmtMoney(it.discount_value)}` : `%${Number(it.discount_value).toLocaleString('tr-TR')}`}
                    </Text>
                  ) : null}
                  {/* Kalemin düzeltme belgeleri: DZ-n · −tutar · gerekçe · tarih */}
                  {(correctionsByItem.get(it.id) ?? []).map(c => (
                    <Text key={c.id} style={{ fontSize: 11, color: U.chipTones.info.fg, marginTop: 3 }}>
                      {`DZ-${c.doc_no} · −${fmtMoney(Number(c.amount) || 0)}${c.description ? ` · ${c.description}` : ''} · ${fmtDate(c.discount_date)}`}
                    </Text>
                  ))}
                  {canCorrect ? (
                    <View style={{ flexDirection: 'row', marginTop: 8 }}>
                      <GlassTooltip title={autoT('Düzeltme')} text={autoT('Bu kalem için düzeltme belgesi (DZ) yaz')}>
                        <Pressable
                          onPress={() => setDzItemId(it.id)}
                          accessibilityRole="button"
                          accessibilityLabel={autoT('Düzeltme')}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                            borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                            ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                          }}
                        >
                          <FileEdit size={12} strokeWidth={1.8} color={U.plainBtn.fgMuted} />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Düzeltme')}</Text>
                        </Pressable>
                      </GlassTooltip>
                    </View>
                  ) : null}
                </View>
                {isDesktop && (
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <EditableNum value={Number(it.quantity)} editable={invoice.status === 'taslak'} onSave={(n) => saveItem(it.id, { quantity: n })} textStyle={{ fontSize: 13, color: U.ink[800] }} inputStyle={{ width: 56, textAlign: 'center' }} />
                  </View>
                )}
                {isDesktop && (
                  <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                    <EditableNum value={Number(it.unit_price)} editable={invoice.status === 'taslak'} onSave={(n) => saveItem(it.id, { unit_price: n })} fmt={fmtMoney} textStyle={{ fontSize: 13, color: U.ink[800], textAlign: 'end' as any }} inputStyle={{ width: 110, textAlign: 'end' as any }} />
                  </View>
                )}
                {(() => {
                  const gross = Number(it.total) || 0;
                  const net = it.net_total != null ? Number(it.net_total) : gross;
                  const discounted = net < gross - 0.001;
                  return (
                    <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                      {discounted && (
                        <Text style={{ fontSize: 11, color: U.ink[400], textDecorationLine: 'line-through' }}>{fmtMoney(gross)}</Text>
                      )}
                      <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[900], textAlign: 'end' as any }}>{fmtMoney(net)}</Text>
                    </View>
                  );
                })()}
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
            backgroundColor: U.surfaceSoft,
            borderTopWidth: 1, borderTopColor: U.hairline,
          }}>
            {/* Fatura altı indirim — yalnız lab panelinde; taslakta düzenlenir, kesilmişte kilitli */}
            {!readOnly && (() => {
              const canEditDiscount = invoice.status === 'taslak' && !efLocked;
              const parsed = validateInvoiceDiscount(discType, discRaw);
              const itemsNet = round2(((invoice as any).items ?? []).reduce((sum: number, it: any) => sum + (Number(it.net_total ?? it.total) || 0), 0));
              const zeroed = canEditDiscount && parsed.ok && parsed.value > 0
                && invoiceTotalsWithDiscount(itemsNet, 0, discType, parsed.value).subtotal <= 0;
              const dirty = parsed.ok
                && ((parsed.value > 0 ? discType : null) !== (invoice.discount_type ?? null)
                  || parsed.value !== (Number(invoice.discount_value) || 0));
              return (
                <View style={{ alignSelf: 'flex-end', width: isDesktop ? 360 : '100%', marginBottom: 14 }}>
                  <InvoiceDiscountField
                    type={discType}
                    value={discRaw}
                    onChange={(t, v) => { setDiscType(t); setDiscRaw(v); setDiscErr(null); setDiscSaveErr(null); }}
                    error={discErr}
                    disabled={!canEditDiscount}
                    lockedHint={autoT(DISCOUNT_LOCKED_TEXT)}
                  />
                  {zeroed ? (
                    <Text style={{ marginTop: 6, fontSize: 12, fontWeight: '600', color: U.chipTones.warning.fg }}>{autoT('Fatura tutarı 0 olacak.')}</Text>
                  ) : null}
                  {canEditDiscount ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
                      <Pressable
                        onPress={discBusy || !dirty ? undefined : saveDiscount}
                        disabled={discBusy || !dirty}
                        accessibilityRole="button"
                        style={[{
                          paddingHorizontal: 18, paddingVertical: 9, borderRadius: 9999,
                          backgroundColor: U.ink[900], opacity: discBusy || !dirty ? 0.45 : 1,
                        }, Platform.OS === 'web' ? ({ cursor: discBusy || !dirty ? 'not-allowed' : 'pointer' } as any) : null]}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: U.onDarkPill }}>{autoT('Kaydet')}</Text>
                      </Pressable>
                      {discSaveErr ? (
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{discSaveErr}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })()}
            {/* Toplamlar — sağa dayalı */}
            <View style={{ alignSelf: 'flex-end', width: isDesktop ? 260 : '100%', gap: 6 }}>
              {(Number(invoice.discount_amount) || 0) > 0 && (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: U.ink[500] }}>{autoT('Kalem toplamı')}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[900] }}>
                      {fmtMoney(round2(((invoice as any).items ?? []).reduce((sum: number, it: any) => sum + (Number(it.net_total ?? it.total) || 0), 0)))}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: U.ink[500] }}>
                      {autoT('Fatura indirimi')}{invoice.discount_type === 'percent' ? ` (%${Number(invoice.discount_value).toLocaleString('tr-TR')})` : ''}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[900] }}>−{fmtMoney(invoice.discount_amount)}</Text>
                  </View>
                </>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: U.ink[500] }}>Ara Toplam</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[900] }}>{fmtMoney(invoice.subtotal)}</Text>
              </View>
              <Pressable
                onPress={canEditTax ? () => { setTaxInput(String(Number(invoice.tax_rate) || 0)); setTaxEditOpen(true); } : undefined}
                disabled={!canEditTax}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...(Platform.OS === 'web' && canEditTax ? { cursor: 'pointer' } as any : {}) }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ fontSize: 12, color: U.ink[500] }}>KDV (%{Number(invoice.tax_rate).toLocaleString('tr-TR')})</Text>
                  {canEditTax ? <Pencil size={11} color={U.ink[400]} strokeWidth={1.8} /> : null}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[900] }}>{fmtMoney(invoice.tax_amount)}</Text>
              </Pressable>
              <View style={{ height: 2, backgroundColor: U.ink[900], marginVertical: 4 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>Genel Toplam</Text>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: U.ink[900] }}>{fmtMoney(invoice.total)}</Text>
              </View>
              {isForeign && (
                <Pressable
                  onPress={!readOnly ? () => { setRateInput(rateVal ? String(rateVal) : ''); setRateEditOpen(true); } : undefined}
                  disabled={readOnly}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingVertical: 4, ...(Platform.OS === 'web' && !readOnly ? { cursor: 'pointer' } as any : {}) }}
                >
                  <Text style={{ fontSize: 11, color: U.ink[500] }}>
                    Kur: 1 {invoice.currency} = {baseSymbol()}{(Number(rateVal) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}{!readOnly ? '  · düzenle' : ''}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[700] }}>
                    ≈ {baseSymbol()}{Number(invoice.amount_base ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                  </Text>
                </Pressable>
              )}
              {Number(invoice.paid_amount) > 0 && (
                <>
                  <View style={{ height: 1, backgroundColor: U.plainBtn.hoverBg, marginVertical: 2 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: U.ink[500] }}>Odenen</Text>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: '#059669' }}>{fmtMoney(invoice.paid_amount)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: isOverdue ? CHIP_TONES.danger.text : U.ink[900] }}>Kalan</Text>
                    <Text style={{
                      ...DISPLAY, fontSize: 18, letterSpacing: -0.3,
                      color: balance <= 0 ? '#059669' : (isOverdue ? CHIP_TONES.danger.text : U.ink[900]),
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
            §05 U.cardSolid — Tahsilat Gecmisi
            ═══════════════════════════════════════════════════════════ */}
        {(invoice.payments ?? []).length > 0 && (
          <View style={{ width: '100%', ...U.tableCard }}>
            {/* Toolbar */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: isDesktop ? 20 : 14, gap: 12,
              backgroundColor: stripBg,
            }}>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 22 : 18, letterSpacing: -0.4, color: stripInk }}>
                Tahsilat
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: stripInk, opacity: 0.75 }}>
                {invoice.payments!.length} kayıt
              </Text>
            </View>
            {invoice.payments!.map((p, idx) => (
              <View key={p.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 20, paddingVertical: 14,
                borderBottomWidth: idx < invoice.payments!.length - 1 ? 1 : 0,
                borderBottomColor: U.hairlineSoft,
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
                  <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 2 }}>
                    {fmtDate(p.payment_date)} · {isDiscountPayment(p)
                      ? discountPaymentLabel(autoT('Ekstre indirimi'), p.notes, ' ', autoT('Düzeltme belgesi'))
                      : PAYMENT_METHOD_LABELS[p.payment_method]}
                    {p.reference_no ? ` · ${p.reference_no}` : ''}
                  </Text>
                </View>
                {p.receiver?.full_name && (
                  <Text style={{ fontSize: 11, color: U.ink[400] }}>{p.receiver.full_name}</Text>
                )}
                {/* Yalnız ELLE girilmiş tahsilat geri alınır; online ödeme iade akışında kalır. */}
                {canUndoPayment && !p.idempotency_key && !isDiscountPayment(p) && invoice.status !== 'iptal' ? (
                  <GlassTooltip text={autoT('Tahsilatı geri al')}>
                    <Pressable
                      onPress={() => handleUndoPayment(p)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={autoT('Tahsilatı geri al')}
                      hitSlop={6}
                      style={({ hovered, pressed }: any) => ({
                        width: 32, height: 32, borderRadius: 999,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 1, borderColor: U.plainBtn.border,
                        backgroundColor: hovered ? U.plainBtn.hoverBg : U.plainBtn.bg,
                        opacity: busy ? 0.5 : 1,
                        transform: [{ scale: pressed ? 0.94 : 1 }],
                        ...(Platform.OS === 'web' ? ({ cursor: busy ? 'default' : 'pointer' } as any) : {}),
                      })}
                    >
                      <Undo2 size={14} strokeWidth={1.9} color={U.ink[500]} />
                    </Pressable>
                  </GlassTooltip>
                ) : null}
              </View>
            ))}
          </View>
        )}

        </View>{/* ═══ /SOL KOLON ═══ */}

        {/* ═══ SAĞ KOLON — aksiyonlar (Notlar · Ödeme · e-Fatura · tehlikeli) ═══ */}
        {/* Hero artık iki kolonun üstünde tam genişlik olduğu için sağ kolon
            kartları kalem tablosuyla aynı hizadan, hero'nun ALTINDAN başlar. */}
        <View style={{ width: isDesktop ? 360 : '100%', gap: isDesktop ? 16 : 14 }}>

        {/* ═══ BELGE İŞLEMLERİ — not · ödeme linki · e-fatura TEK kartta ═══
            Üç ayrı gölgeli kart üç ayrı tasarım dili kullanıyor ve kolonu
            uzatıyordu; numaralı bölümler akışı ("önce hangisi?") koruyor. */}
        <PaymentSheetModal
          token={payToken}
          onClose={() => setPayToken(null)}
          onPaid={() => { setPayToken(null); refetch(); }}
        />

        {(!readOnly || invoice.notes) && (
          <InvoiceActionsCard
            invoiceId={invoice.id}
            balance={balance}
            notes={invoice.notes}
            readOnly={readOnly}
            noteDraft={noteDraft}
            onNoteChange={setNoteDraft}
            onSaveNote={saveNote}
            savingNote={savingNote}
            efatura={{
              status: invoice.efatura_status ?? 'pending',
              uuid: invoice.efatura_uuid ?? null,
              type: invoice.efatura_type ?? null,
              provider: invoice.efatura_provider ?? null,
              error: invoice.efatura_error ?? null,
              number: invoice.efatura_number ?? null,
            }}
            invoiceStatus={invoice.status}
            onIssueInvoice={() => (approvalOn ? openLabApproval('efatura') : handleMarkSent('efatura'))}
            issueInvoiceError={efaturaIssueErr}
            clinicGaps={invoice.clinic ? clinicEFaturaGaps(invoice.clinic).map((g) => autoT(EFATURA_GAP_LABELS[g])) : []}
            onEditClinic={invoice.clinic ? () => router.push(`/${panelBase}/clinics?editClinic=${invoice.clinic!.id}` as any) : undefined}
            onChanged={refetch}
            workBreakdown={readOnly ? undefined : { invoiceNumber: invoice.invoice_number, clinicName: invoice.clinic?.name ?? null }}
          />
        )}

        </View>{/* ═══ /SAĞ KOLON ═══ */}
        </View>{/* ═══ /split wrapper ═══ */}

        {/* ═══ TEHLİKELİ İŞLEMLER — sayfa altı, birincil aksiyonlardan AYRI, sönük ═══
            Koşul: iptal/ödendi DIŞINDA (İptal Et uygun); taslakta ayrıca Sil. */}
        {!readOnly && invoice.status !== 'iptal' && invoice.status !== 'odendi' && (
          <View style={{
            width: '100%', maxWidth: isDesktop ? 1180 : 800,
            marginTop: 8, paddingTop: 16,
            borderTopWidth: 1, borderTopColor: U.hairline,
            flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          }}>
            <Text style={{ flex: 1, minWidth: 140, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[400] }}>
              Tehlikeli işlemler
            </Text>
            {efLocked ? (
              <Text style={{ flexBasis: '100%', fontSize: 12, lineHeight: 17, color: U.ink[500] }}>
                Bu faturanın resmi e-faturası kesildi; Siman'da iptal edilemez veya değiştirilemez. İptal / iade Luca'dan yapılır.
              </Text>
            ) : (
            <Pressable onPress={handleCancel} disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(217,75,75,0.28)', opacity: busy ? 0.5 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <CircleX size={13} strokeWidth={1.8} color={CHIP_TONES.danger.text} />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: CHIP_TONES.danger.text }}>Iptal Et</Text>
            </Pressable>
            )}
            {invoice.status === 'taslak' && (
              <Pressable onPress={handleDelete} disabled={busy}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(217,75,75,0.28)', opacity: busy ? 0.5 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Trash2 size={13} strokeWidth={1.8} color={CHIP_TONES.danger.text} />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: CHIP_TONES.danger.text }}>Taslagi Sil</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ═══ ÖDEME YÖNTEMLERİ — iyzico kriteri: kabul edilen ödeme logoları fatura sayfasında görünür.
            Marka logoları koyu temada da kendi renklerinde kalır → küçük açık plaka üstünde. */}
        <View style={{
          width: '100%', maxWidth: isDesktop ? 1180 : 800,
          marginTop: 18, paddingTop: 14,
          borderTopWidth: 1, borderTopColor: U.hairline,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[400] }}>
            Güvenli ödeme
          </Text>
          <View style={{
            // Marka logoları kendi renginde kalmalı → koyu temada okunur bir zemin
            // şart. Ama tam beyaz levha parlıyordu: kısılmış zemin + hairline çerçeve.
            paddingHorizontal: U.isDark ? 9 : 0, paddingVertical: U.isDark ? 5 : 0, borderRadius: 10,
            backgroundColor: U.isDark ? 'rgba(233,233,231,0.80)' : 'transparent',
            borderWidth: U.isDark ? 1 : 0, borderColor: 'rgba(255,255,255,0.14)',
          }}>
            <PaymentBadges height={14} />
          </View>
        </View>
      </ScrollView>

      {/* Modals */}
      {/* İş emri, fatura bağlamını korumak için aynı ekranın üzerinde açılır. */}
      <Modal visible={!!previewOrderId} transparent animationType="fade" onRequestClose={() => setPreviewOrderId(null)}>
        <Pressable
          onPress={() => setPreviewOrderId(null)}
          style={{
            flex: 1, backgroundColor: U.isDark ? 'rgba(0,0,0,0.72)' : 'rgba(10,14,26,0.52)',
            ...(Platform.OS === 'web' ? { backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' } : {}),
            alignItems: 'center', justifyContent: 'center', padding: isDesktop ? 24 : 0,
          }}
        >
          <Pressable
            onPress={(e) => (e as any).stopPropagation?.()}
            style={{
              width: '100%', maxWidth: 1240, height: isDesktop ? '94%' : '100%',
              borderRadius: isDesktop ? 24 : 0, overflow: 'hidden', backgroundColor: '#F5F1EB', position: 'relative',
              ...(Platform.OS === 'web' ? { boxShadow: modalShadowOf(U) } as any : {}),
            }}
          >
            {previewOrderId && (
              <OrderDetailScreenV2
                idOverride={previewOrderId}
                embedded
                onRequestClose={() => setPreviewOrderId(null)}
                onOpenRelated={setPreviewOrderId}
              />
            )}
            <Pressable
              onPress={() => setPreviewOrderId(null)}
              accessibilityLabel="Sipariş detayını kapat"
              style={{
                position: 'absolute', top: 12, end: 12, zIndex: 50,
                width: 38, height: 38, borderRadius: 19, backgroundColor: U.surface,
                alignItems: 'center', justifyContent: 'center',
                ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: '0 4px 14px rgba(15,23,42,0.2)' } as any : {}),
              }}
            >
              <X size={18} color={U.ink[900]} strokeWidth={2} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <PaymentModal visible={paymentModalVisible} invoiceId={invoice.id} maxAmount={balance} currency={invoice.currency || 'TRY'}
        onClose={() => setPaymentModalVisible(false)} onDone={() => { setPaymentModalVisible(false); refetch(); }} />
      {/* Düzeltme belgesi (DZ) penceresi — kesinleşmiş faturanın tek kalemi */}
      {dzItem ? (
        <CorrectionDocModal
          visible={!!dzItem}
          onClose={() => setDzItemId(null)}
          onSaved={() => { setDzItemId(null); setCorrTick(t => t + 1); refetch(); }}
          invoice={invoice}
          item={{ id: dzItem.id, description: dzItem.description, net_total: Number(dzItem.net_total ?? dzItem.total) || 0 }}
          priorOnItem={priorOn(dzItem.id)}
          cap={correctionCapFor(dzItem)}
        />
      ) : null}

      {/* İptal/Sil onayı — web-safe ConfirmDialog (Alert.alert web'de çalışmıyor) */}
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      {!readOnly && invoice.clinic_id ? (
        <LabApprovalModal
          open={!!labApprove}
          clinicId={invoice.clinic_id}
          invoices={labApprove ?? []}
          onClose={() => setLabApprove(null)}
          onDone={() => { setMarkErr(null); void refetchSilent(); }}
        />
      ) : null}

      {/* Para birimi seçici — Modal (clipping/z-index sorunsuz) */}
      <Modal visible={curPickerOpen} transparent animationType="fade" onRequestClose={() => setCurPickerOpen(false)}>
        <Pressable onPress={() => setCurPickerOpen(false)} style={{ flex: 1, backgroundColor: U.isDark ? 'rgba(0,0,0,0.66)' : 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: U.surface, borderRadius: 18, padding: 8, width: 260, ...(Platform.OS === 'web' ? { boxShadow: modalShadowOf(U) } as any : {}) } as any}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[400], letterSpacing: 1, textTransform: 'uppercase' as any, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
              Para Birimi
            </Text>
            {(['TRY', 'EUR', 'USD', 'GBP', 'IRT'] as const).map(c => {
              const active = (invoice.currency || 'TRY') === c;
              return (
                <Pressable key={c} onPress={() => changeCurrency(c)} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 12, borderRadius: 11,
                  backgroundColor: active ? U.ink[50] : 'transparent',
                  cursor: 'pointer' as any,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: U.ink[700], width: 18 }}>{CURRENCY_META[c].symbol}</Text>
                  <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: U.ink[900], flex: 1 }}>{c} · {CURRENCY_META[c].label}</Text>
                  {active && <Check size={16} color={U.ink[700]} strokeWidth={2} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Kur düzenleme — manuel override; trigger amount_base'i yeni kurla hesaplar */}
      <Modal visible={rateEditOpen} transparent animationType="fade" onRequestClose={() => setRateEditOpen(false)}>
        <Pressable onPress={() => setRateEditOpen(false)} style={{ flex: 1, backgroundColor: U.isDark ? 'rgba(0,0,0,0.66)' : 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: U.surface, borderRadius: 18, padding: 18, width: 300, gap: 10, ...(Platform.OS === 'web' ? { boxShadow: modalShadowOf(U) } as any : {}) } as any}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }}>Kuru Düzenle</Text>
            <Text style={{ fontSize: 12, color: U.ink[500] }}>1 {invoice.currency} kaç {base}? Kaydedince toplamın {base} karşılığı bu kura göre hesaplanır.</Text>
            <TextInput
              value={rateInput}
              onChangeText={setRateInput}
              keyboardType="decimal-pad"
              placeholder="örn. 53.21"
              placeholderTextColor={U.ink[400]}
              style={{ borderWidth: 1, borderColor: U.ink[200], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Pressable onPress={() => setRateEditOpen(false)} style={{ flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: U.ink[100], alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[700] }}>Vazgeç</Text>
              </Pressable>
              <Pressable onPress={saveRate} style={{ flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: U.ink[900], alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>Kaydet</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* KDV oranı — e-faturaya gönderilene kadar; toplamlar DB'de yeniden hesaplanır */}
      <Modal visible={taxEditOpen} transparent animationType="fade" onRequestClose={() => setTaxEditOpen(false)}>
        <Pressable onPress={() => setTaxEditOpen(false)} style={{ flex: 1, backgroundColor: U.isDark ? 'rgba(0,0,0,0.66)' : 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: U.surface, borderRadius: 18, padding: 18, width: 300, gap: 10, ...(Platform.OS === 'web' ? { boxShadow: modalShadowOf(U) } as any : {}) } as any}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }}>KDV Oranı</Text>
            <Text style={{ fontSize: 12, color: U.ink[500] }}>Fatura toplamı bu orana göre yeniden hesaplanır. e-Faturaya gönderildikten sonra değiştirilemez.</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[0, 1, 10, 20].map((r) => {
                const on = Number(String(taxInput).replace(',', '.')) === r;
                return (
                  <Pressable key={r} onPress={() => setTaxInput(String(r))}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center', borderWidth: 1,
                      backgroundColor: on ? U.ink[900] : U.plainBtn.bg, borderColor: on ? U.ink[900] : U.plainBtn.border,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: on ? U.onDarkPill : U.plainBtn.fg }}>%{r}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={taxInput}
              onChangeText={setTaxInput}
              keyboardType="decimal-pad"
              placeholder="10"
              placeholderTextColor={U.ink[400]}
              onSubmitEditing={() => saveTax()}
              style={{ borderWidth: 1, borderColor: U.ink[200], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Pressable onPress={() => setTaxEditOpen(false)} style={{ flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: U.ink[100], alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[700] }}>Vazgeç</Text>
              </Pressable>
              <Pressable onPress={() => saveTax()} style={{ flex: 1, paddingVertical: 11, borderRadius: 999, backgroundColor: U.ink[900], alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>Kaydet</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <AddItemModal visible={addItemModalVisible} invoiceId={invoice.id} currency={invoice.currency || 'TRY'}
        onClose={() => setAddItemModalVisible(false)} onDone={() => { setAddItemModalVisible(false); refetch(); }} />
      <PaymentReminderModal visible={reminderOpen} invoice={invoice}
        clinicName={invoice.clinic?.name ?? undefined} onClose={() => setReminderOpen(false)} onSent={() => refetch()} />

      {/* Kenardan sağa kaydırınca geri — geri butonuyla AYNI fonksiyon (hub içi / rota) */}
      <EdgeSwipeBack onBack={goBack} />
    </View>
  );
}

// ─── PillBtn (§03 butonlar — pill köşeli) ───────────────────────────
function PillBtn({ icon: Icon, label, color, bg, onPress, disabled, dark, stacked }: {
  icon: React.ComponentType<any>; label?: string; color?: string; bg?: string;
  onPress: () => void; disabled?: boolean; dark?: boolean;
  /** Mobil: ikon dairesi + ALTINDA etiket. Yalnız ikonlu kapsüller ne yaptığını söylemiyordu. */
  stacked?: boolean;
}) {
  const U = useInkUI();
  if (stacked) {
    return (
      <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
        style={{ width: 72, alignItems: 'center', gap: 6, opacity: disabled ? 0.5 : 1 }}>
        <View style={{
          width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
          backgroundColor: dark ? U.ink[900] : (bg ?? U.plainBtn.bg),
          borderWidth: dark || bg ? 0 : 1, borderColor: U.plainBtn.border,
        }}>
          {/* dark zemin = ink[900] → koyu temada KREM olur; ikon onDarkPill (ikiz tuzak) */}
          <Icon size={18} strokeWidth={1.8} color={dark ? U.onDarkPill : (color ?? U.ink[900])} />
        </View>
        {label ? (
          <Text numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, fontWeight: '500', color: U.ink[700], textAlign: 'center' }}>
            {label}
          </Text>
        ) : null}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: label ? 14 : 10, paddingVertical: 8, borderRadius: 999,
      backgroundColor: dark ? U.ink[900] : (bg ?? U.plainBtn.bg),
      borderWidth: dark || bg ? 0 : 1, borderColor: U.plainBtn.border,
      opacity: disabled ? 0.5 : 1, cursor: 'pointer' as any,
    }}>
      <Icon size={14} strokeWidth={1.8} color={dark ? U.onDarkPill : (color ?? U.ink[900])} />
      {label && <Text style={{ fontSize: 12, fontWeight: '500', color: dark ? U.onDarkPill : (color ?? U.ink[900]) }}>{label}</Text>}
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
  const U = useInkUI();
  const [amount, setAmount] = useState('');
  // Yöntem bilerek boş gelir (nakit kasaya yanlışlıkla havale düşmesin) — madde 8
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [methodErr, setMethodErr] = useState(false);
  const [refNo, setRefNo] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (visible) { setAmount(maxAmount > 0 ? maxAmount.toFixed(2) : ''); setMethod(null); setMethodErr(false); setRefNo(''); setNotes(''); }
  }, [visible, maxAmount]);

  const handleSave = async () => {
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Geçerli bir tutar girin.'); return; }
    if (!method) { setMethodErr(true); return; }
    setBusy(true);
    const { error } = await recordPayment({ invoice_id: invoiceId, amount: amt, payment_method: method, reference_no: refNo || undefined, notes: notes || undefined });
    setBusy(false);
    if (error) toast.error((error as any).message ?? String(error)); else onDone();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: U.isDark ? 'rgba(0,0,0,0.66)' : 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
        <View style={{ backgroundColor: U.surface, borderRadius: 24, width: '100%', maxWidth: 520, padding: 28, gap: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', boxShadow: modalShadowOf(U) } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>Tahsilat Ekle</Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: U.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} strokeWidth={1.8} color={U.ink[500]} />
            </Pressable>
          </View>
          <FL>{`Tutar (${CURRENCY_META[currency as Currency]?.symbol ?? '₺'})`}</FL>
          <FI value={amount} onChangeText={setAmount} placeholder="0,00" keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} />
          {maxAmount > 0 && <Text style={{ fontSize: 10, color: U.ink[400], marginTop: -4 }}>Kalan bakiye: {fmtMoneyCur(maxAmount, currency)}</Text>}
          <FL>Yontem</FL>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {PAYMENT_METHOD_OPTIONS.map(opt => { const a = method === opt.v; const MI = opt.icon; return (
              <Pressable key={opt.v} onPress={() => { setMethod(opt.v); setMethodErr(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: a ? U.ink[900] : methodErr ? U.chipTones.danger.fg : U.plainBtn.border, backgroundColor: a ? U.ink[50] : U.plainBtn.bg, cursor: 'pointer' as any }}>
                <MI size={12} strokeWidth={1.6} color={a ? U.ink[900] : U.ink[400]} />
                <Text style={{ fontSize: 12, fontWeight: a ? '600' : '500', color: a ? U.ink[900] : U.ink[400] }}>{opt.l}</Text>
              </Pressable>
            ); })}
          </View>
          <FL>Referans No (ops.)</FL>
          <FI value={refNo} onChangeText={setRefNo} placeholder="Havale/cek referans no" />
          <FL>Not (ops.)</FL>
          <FI value={notes} onChangeText={setNotes} placeholder="Ek bilgi..." multiline style={{ minHeight: 56, textAlignVertical: 'top' }} />
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', alignItems: 'center', paddingTop: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: U.hairline }}>
            {methodErr ? <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{autoT('Ödeme yöntemini seçin')}</Text> : null}
            <Pressable onPress={onClose} disabled={busy} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[500] }}>Vazgec</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={busy} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: U.ink[900], opacity: busy ? 0.5 : 1, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: U.onDarkPill }}>{busy ? 'Kaydediliyor...' : 'Kaydet'}</Text>
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
  const U = useInkUI();
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
      <View style={{ flex: 1, backgroundColor: U.isDark ? 'rgba(0,0,0,0.66)' : 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
        <View style={{ backgroundColor: U.surface, borderRadius: 24, width: '100%', maxWidth: 520, padding: 28, gap: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', boxShadow: modalShadowOf(U) } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>Kalem Ekle</Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: U.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} strokeWidth={1.8} color={U.ink[500]} />
            </Pressable>
          </View>
          <FL>Açıklama</FL>
          <FI value={desc} onChangeText={setDesc} placeholder="Orn: Zirkonya kron" />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><FL>Adet</FL><FI value={qty} onChangeText={setQty} placeholder="1" keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} /></View>
            <View style={{ flex: 2 }}><FL>{`Birim Fiyat (${curSym})`}</FL><FI value={price} onChangeText={setPrice} placeholder="0,00" keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', paddingTop: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: U.hairline }}>
            <Pressable onPress={onClose} disabled={busy} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: U.ink[500] }}>Vazgec</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={busy} style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: U.ink[900], opacity: busy ? 0.5 : 1, cursor: 'pointer' as any }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: U.onDarkPill }}>{busy ? 'Ekleniyor...' : 'Ekle'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── §05.5 Form field components ────────────────────────────────────
function FL({ children }: { children: string }) {
  const U = useInkUI();
  return <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[500], marginTop: 8, marginBottom: 4 }}>{children}</Text>;
}
function FI(props: React.ComponentProps<typeof TextInput> & { style?: any }) {
  const U = useInkUI();
  const { style: extra, ...rest } = props;
  return <TextInput placeholderTextColor={U.ink[400]} {...rest} style={[{ height: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: U.fieldBorder, backgroundColor: U.isDark ? U.surfaceSoft : '#FFF', fontSize: 15, color: U.ink[900], outline: 'none' as any }, extra]} />;
}

export default InvoiceDetailScreen;
