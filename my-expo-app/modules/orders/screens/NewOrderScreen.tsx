import { localeTag, dirIcon, weekdayOffset, weekStartsOn } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { openFileUrl } from '../../../core/util/openFile';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  TextInput, Platform, useWindowDimensions,
  Modal, FlatList, Image, Linking,
} from 'react-native';

// Web-only portal helper — renders children in document.body, bypassing
// any transform/overflow containing block that would trap position:fixed
let _portal: ((node: React.ReactNode) => React.ReactNode) | null = null;
if (Platform.OS === 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ReactDOM = require('react-dom');
    _portal = (node: React.ReactNode) =>
      typeof document !== 'undefined'
        ? ReactDOM.createPortal(node, document.body)
        : node;
  } catch {}
}
const WebPortal = ({ children }: { children: React.ReactNode }) =>
  _portal ? (_portal(children) as React.ReactElement) : <>{children}</>;
import { useRouter } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MOBILE_PANEL_THEMES, type MobilePanel, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { ClinicIcon } from '../../../core/ui/ClinicIcon';
import { BrandedQR } from '../../../core/ui/BrandedQR';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCodeSvg = require('react-native-qrcode-svg').default;
import { useAuthStore } from '../../../core/store/authStore';
import { usePermissionStore } from '../../../core/store/permissionStore';
import { createWorkOrder, addOrderItem, updateOrderAdmin, updateOrderClient, isOrderPrePlanning, type ClientOrderEditFields, type ClientOrderEditItem } from '../api';
import { createChangeRequest } from '../changeRequests';
import type { OrderPrefill, OrderEditPrefill } from '../prefillFromOrder';
import { fetchOrderEditPrefill } from '../prefillFromOrder';
import { useNewOrderModalStore } from '../../../core/store/newOrderModalStore';
import { useOnboardingStore } from '../../../core/onboarding/onboardingStore';
import { useTourTarget } from '../../../core/onboarding/useTourTarget';
import { OnboardingOverlay } from '../../../core/onboarding/OnboardingOverlay';
import { sendMessage, uploadChatAttachment, AttachmentType } from '../chatApi';
import { supabase } from '../../../core/api/supabase';
import { getActiveLabId } from '../../../core/store/activeLabStore';
import { CURRENCY_META } from '../../../core/money/currency';
import { DentyFAB } from '../../denty/components/DentyFAB';
import { useSuppressDentyFab } from '../../../core/store/uiOverlayStore';
import { fetchClinics, fetchAllDoctors, createClinic, createDoctor } from '../../clinics/api';
import { titleCaseTR } from '../../../core/utils/textCase';
import { toast } from '../../../core/ui/Toast';
import { ClinicModal as CanonicalClinicModal, DoctorModal as CanonicalDoctorModal } from '../../clinics/screens/ClinicsScreen';
import { fetchLabServices } from '../../services/api';
import { MachineType, PendingItem } from '../types';
import { Clinic, Doctor } from '../../clinics/types';
import { LabService } from '../../services/types';
import { ToothNumberPicker } from '../components/ToothNumberPicker';
import { WORK_TYPES, ALL_SHADES, ORDER_TAGS, OP_CATEGORY, IMPLANT_SYSTEMS, IMPLANT_TYPES, ABUTMENT_TYPES, SCREW_TYPES, REMOVABLE_MATS, CROWN_MATERIALS, WORK_TYPE_TREE, WORK_TYPE_MAIN, deriveDepartment, isImplantWorkType } from '../constants';
import { TOOTH_PATHS, TOOTH_LABEL_POS } from '../assets/toothPaths';
import { GEO_COUNTRIES, GEO_BY_LABEL } from '../data/geo';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { EkartorluIcon } from '../../../components/icons/EkartorluIcon';
import { GulushIcon } from '../../../components/icons/GulushIcon';

// 3D görüntüleyici — lab (StageFileUpload) ile AYNI bileşen: senkron require'lı,
// Metro DEV async-chunk {} sorununa dayanıklı Viewer3DModalLazy. Tek/çoklu tarama
// aynı zengin modalda açılır (tutarlılık).
import { Viewer3DModalLazy } from '../../viewer-3d/Viewer3DLazy';

import { AppIcon } from '../../../core/ui/AppIcon';
import {
  SectionCard, FieldError, Field, SearchableDropdown, Chip, TwoCol,
  LockedInfoCard, DISPLAY_FONT, CARD_SHADOW, INPUT_STYLE,
} from '../components/FormPrimitives';
import type { DropdownOption, SearchableDropdownProps } from '../components/FormPrimitives';
import { DS } from '../../../core/theme/dsTokens';
import { NO, NOType, NORadius, useNOTokens } from '../components/NOTokens';
import { NOCard, NOCardHead } from '../components/NOCard';
import { NOStepHeader, NOEmText, NOLabel, NOEyebrow, NOSegment, NOToggle, NOField as NOFieldPrimitive } from '../components/NOFormPrimitives';
import { NOPageChrome } from '../components/NOPageChrome';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { TeethLoader } from '../../../core/ui/TeethLoader';
import { uploadWithProgress } from '../../../core/storage/uploadWithProgress';
import { FilesUploadModal, type UploadAttachment } from '../components/FilesUploadModal';
import { createQrShortUrl } from '../../../lib/qrLinks';

type Step = 1 | 2 | 3 | 4;

// ── Chat message model ───────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  type: 'text' | 'voice' | 'file' | 'image';
  text?: string;
  uri?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  ts: string; // ISO
}

// ── Attached file model ──────────────────────────────────────────────────────
/** Önizlemede ileri/geri oku — görselin üstünde yüzen yuvarlak buton. */
const navBtnStyle = {
  position: 'absolute' as const,
  top: '50%' as any,
  marginTop: -18,
  width: 36, height: 36, borderRadius: 18,
  alignItems: 'center' as const, justifyContent: 'center' as const,
  backgroundColor: 'rgba(255,255,255,0.92)',
  borderWidth: 1, borderColor: '#E2E8F0',
  ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: '0 2px 10px rgba(15,23,42,0.14)' } as any) : {}),
};

type FileKind = 'photo' | 'video' | 'stl' | 'ply' | 'pdf' | 'other';

interface AttachedFile {
  id: string;
  name: string;
  uri: string;           // object URL (web) — local URI (native)
  kind: FileKind;
  size: number;          // bytes
  scope: 'case' | 'tooth';
  tooth?: number;        // defined only when scope === 'tooth'
  // Erken upload alanları — pick sonrası drafts/ path'ine yüklenir
  storage_path?: string;            // drafts/{userId}/{ts}-{name}
  upload_progress?: number | null;  // 0..100 (null = indeterminate / başlamadı)
  upload_status?: 'pending' | 'uploading' | 'done' | 'error';
  upload_error?: string;
}

interface ToothOp {
  tooth: number;
  work_type: string;
  // crown_bridge / aesthetic
  shade: string;
  // implant
  implant_system: string;   // marka (Straumann, Nobel, …)
  implant_type: string;     // tür (Bone Level / Tissue Level / Mini / Diğer)
  abutment: string;
  screw: string;
  // removable
  material: string;
  // pricing
  price: number;
  material_price: number;
  /** Fiyat listesindeki para birimi (lab_services.currency) — gösterimde kullanılır. */
  currency?: string;
  /** Fiyat listesindeki birim (lab_services.unit): 'Çene' | 'Vaka' | 'Seans' | 'Adet' | …
   *  Fiyatlama çarpanını belirler: Çene→çene sayısı, Vaka/Seans→1, diğer→diş sayısı. */
  price_unit?: string | null;
  /** Aynı diş için birden fazla işlem ayırt etmek için transient uid (DB'ye yazılmaz). */
  __uid?: string;
}

/** Diş numaralarından çene sayısı (üst 11–28, alt 31–48). */
function archCountOf(teeth: number[]): number {
  const up = teeth.some(t => t >= 11 && t <= 28);
  const lo = teeth.some(t => t >= 31 && t <= 48);
  return (up ? 1 : 0) + (lo ? 1 : 0);
}
/** Fiyat birimine göre bir grubun çarpanı: Çene→çene sayısı, Vaka/Seans→1, diğer→diş sayısı. */
function priceUnitQty(priceUnit: string | null | undefined, teeth: number[]): number {
  const u = (priceUnit ?? '').toLocaleLowerCase('tr-TR');
  if (u === 'çene') return Math.max(1, archCountOf(teeth));
  if (u === 'vaka' || u === 'seans') return 1;
  return teeth.length;
}
/** İş listesi miktar etiketi (ör. "1 çene", "2 çene", "vaka", "16 adet"). */
function unitQtyLabel(priceUnit: string | null | undefined, teeth: number[]): string {
  const u = (priceUnit ?? '').toLocaleLowerCase('tr-TR');
  if (u === 'çene') { const q = Math.max(1, archCountOf(teeth)); return `${q} çene`; }
  if (u === 'vaka') return 'vaka';
  if (u === 'seans') return 'seans';
  return `${teeth.length} adet`;
}
/** confirmed tooth_ops → birim-farkında toplam (labor + material). */
function toothOpsTotals(ops: ToothOp[]): { labor: number; material: number; grand: number } {
  const map = new Map<string, { price: number; material: number; unit?: string | null; teeth: number[] }>();
  for (const o of ops) {
    if (!o.work_type) continue;
    const k = [o.work_type, o.shade, o.material, o.implant_system, o.implant_type, o.abutment, o.screw, o.price, o.material_price, o.price_unit].join('||');
    let g = map.get(k);
    if (!g) { g = { price: o.price || 0, material: o.material_price || 0, unit: o.price_unit, teeth: [] }; map.set(k, g); }
    g.teeth.push(o.tooth);
  }
  let labor = 0, material = 0;
  for (const g of map.values()) {
    const q = priceUnitQty(g.unit, Array.from(new Set(g.teeth)));
    labor += g.price * q;
    material += g.material * q;
  }
  return { labor, material, grand: labor + material };
}

// Uid generator — same tooth için ikinci/üçüncü op ayırt etmek için
const newOpUid = () => `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Para birimi sembolü — fiyat listesindeki currency'ye göre (₺ · € · $ · £). */
const curSym = (c?: string | null): string => {
  const m = c ? (CURRENCY_META as any)[c] : null;
  return m?.symbol ?? '₺';
};

interface FormData {
  clinic_id: string;
  doctor_id: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_id: string;
  patient_gender: 'erkek' | 'kadın' | 'belirtilmedi';
  patient_dob: Date | null;
  patient_phone: string;
  is_urgent: boolean;
  model_type: string;
  delivery_date: Date;
  notes: string;
  lab_notes: string;
  tooth_ops: ToothOp[];
  machine_type: MachineType;
  tags: string[];
  pending_items: PendingItem[];
  measurement_type: 'manual' | 'digital';
  doctor_approval_required: boolean;
  patient_nationality: string;
  patient_country: string;
  patient_city: string;
  lab_notes_visible: boolean;
  attachments: AttachedFile[];
  voice_notes: { uri: string; duration: number }[];
  lab_voice_notes: { uri: string; duration: number }[];
  chat_messages: ChatMessage[];
  delivery_method: 'kurye' | 'elden' | 'kargo' | '';
  implant_brand: string;
  scan_bodies_delivered: boolean;
  /** Devam siparişi bağı — dolu ise bu sipariş, teslim edilmiş bir işin planlı
   *  devamıdır (ör. geçici→nihai). Kaydederken payload'a eklenir. Revizyon değil. */
  continues_order_id?: string;
}

const BLANK_OP: Omit<ToothOp, 'tooth'> = {
  work_type: '', shade: '',
  implant_system: '', implant_type: '', abutment: '', screw: '',
  material: '', price: 0, material_price: 0, price_unit: null,
};

const INITIAL_FORM: FormData = {
  clinic_id: '', doctor_id: '',
  patient_first_name: '', patient_last_name: '', patient_id: '', patient_gender: 'belirtilmedi',
  patient_dob: null, patient_phone: '',
  is_urgent: false, model_type: '',
  delivery_date: null as unknown as Date,
  notes: '', lab_notes: '',
  tooth_ops: [],
  machine_type: 'milling', tags: [], pending_items: [],
  attachments: [],
  measurement_type: '' as 'manual' | 'digital',
  doctor_approval_required: false,
  patient_nationality: '',
  patient_country: '',
  patient_city: '',
  lab_notes_visible: false,
  voice_notes: [],
  lab_voice_notes: [],
  chat_messages: [],
  delivery_method: '',
  implant_brand: '',
  scan_bodies_delivered: false,
  continues_order_id: undefined,
};

/**
 * "Bu siparişten yeni oluştur" — OrderPrefill'i form başlangıç değerine çevirir.
 * INITIAL_FORM üzerine yalnız vaka kurgusu yazılır; hasta kimliği, tarih,
 * aciliyet, notlar ve ekler bilinçli olarak boş bırakılır (bkz. prefillFromOrder).
 */
function applyPrefill(p: OrderPrefill): FormData {
  const base: FormData = {
    ...INITIAL_FORM,
    clinic_id:                p.clinic_id,
    doctor_id:                p.doctor_id,
    model_type:               p.model_type,
    machine_type:             (p.machine_type || 'milling') as MachineType,
    measurement_type:         p.measurement_type as FormData['measurement_type'],
    delivery_method:          p.delivery_method,
    tags:                     [...p.tags],
    lab_notes_visible:        p.lab_notes_visible,
    doctor_approval_required: p.doctor_approval_required,
    tooth_ops: p.tooth_ops.map(o => ({
      ...o,
      __uid: `${o.tooth}-${o.work_type}-${Math.random().toString(36).slice(2, 8)}`,
    })),
    pending_items: p.pending_items.map(it => ({ ...it })) as FormData['pending_items'],
  };

  // Devam siparişi — hasta bilgisini de taşı + bağı forma yaz (varsa). Plain kopyada
  // bu alanlar undefined → base olduğu gibi döner (hasta boş, davranış değişmez).
  if (p.continues_order_id) base.continues_order_id = p.continues_order_id;
  // Devam siparişinde hekim notu taşınır (aynı hasta, aynı vaka).
  if (p.source_notes) base.notes = p.source_notes;
  if (p.patient_prefill) {
    const pp = p.patient_prefill;
    base.patient_first_name = pp.first_name;
    base.patient_last_name  = pp.last_name;
    base.patient_id         = pp.id;
    base.patient_gender     = pp.gender;
    base.patient_dob        = pp.dob ? new Date(pp.dob) : null;
    base.patient_nationality = pp.nationality;
    base.patient_country    = pp.country;
    base.patient_city       = pp.city;
  }
  return base;
}

/**
 * DÜZENLEME — mevcut siparişi forma doldurur. applyPrefill'den farkı: hasta kimliği,
 * teslim tarihi, aciliyet ve notlar da yüklenir (yerinde güncelleme için).
 */
function applyEditPrefill(p: OrderEditPrefill): FormData {
  const base = applyPrefill(p);
  const nameParts = (p.patient_name || '').trim().split(/\s+/);
  const first = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : (nameParts[0] ?? '');
  const last  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  return {
    ...base,
    patient_first_name: first,
    patient_last_name: last,
    patient_id: p.patient_id,
    patient_gender: p.patient_gender,
    patient_dob: p.patient_dob ? new Date(p.patient_dob) : null,
    patient_phone: p.patient_phone,
    patient_nationality: p.patient_nationality,
    patient_country: p.patient_country,
    patient_city: p.patient_city,
    is_urgent: p.is_urgent,
    delivery_date: p.delivery_date ? new Date(p.delivery_date) : (null as unknown as Date),
    notes: p.notes,
    lab_notes: p.lab_notes,
    implant_brand: p.implant_brand,
    scan_bodies_delivered: p.scan_bodies_delivered,
  };
}

// ── Auto-save draft (Gmail taslak mantığı) ─────────────────────────────
const DRAFT_KEY        = 'newOrderDraft:v1';
const DRAFT_TS_KEY     = 'newOrderDraft:v1:ts';
const DRAFT_STEP_KEY   = 'newOrderDraft:v1:step';
const DRAFT_DEBOUNCE_MS = 600;

/** form'un persist edilmeyecek alanları — blob URI'lar reload sonrası geçersiz olur.
 *  NOT: attachments özel olarak işlenir — storage_path'i olanlar persist edilir,
 *  blob-only olanlar atılır (aşağıda restore/save logic'i). */
const DRAFT_STRIP_FIELDS = ['voice_notes', 'lab_voice_notes', 'chat_messages'] as const;

const fmtDraftTime = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const ALL_IMPLANT_BRANDS = [
  // ── Yerli markalar (Türkiye) ──
  'Implance','Bilimplant','NucleOSS','AGS Medikal','Mode Medikal','Mode Implant',
  'Trinon Q-Implant','Implassis','Tekka','Medentika TR','İmplad',
  'Surgikor','Dynamic Implant','Maxer Implant','Mr. Curette Tech',
  // ── Uluslararası markalar ──
  'Straumann','Nobel Biocare','Osstem','Zimmer Biomet','Dentsply Sirona',
  'Megagen','Neodent','BioHorizons','Camlog','Astra Tech (Dentsply)',
  'Ankylos','Bicon','Biomet 3i','Blue Sky Bio','Dentium','DIO Implant',
  'Hi-Sen','IMZ','Keystone Dental','Lifecore','MIS Implants','Neway',
  'OsteoCare','Phibo','Replace (Nobel)','Seven Implant','SPI Element',
  'Touareg','Xive (Dentsply)','Southern Implants','Bredent','Cortex',
  'Alpha-Bio Tec','Biohorizons','Euroteknika','Implant Direct','Adin',
  'Thommen Medical','Bionika','T-Plus',
  'Hiossen','Anthogyr','Sweden & Martina','Noris Medical','Paltop',
  'Ditron Dental','TBR','C-Tech','GDT Dental','Cowellmedi','Dentis',
  'Warantec','Shinhung','Z-Systems','SGS Dental','Global D','Leader Italia',
  'Neobiotech','Dentegris','BEGO Semados','Carlo de Chiesa','Ace Surgical',
  'Diğer',
];

const MODEL_TYPES = [
  { value: 'dijital', label: '💻 Dijital Tarama' },
  { value: 'fiziksel', label: '📦 Fiziksel Model' },
  { value: 'cad', label: '🖥️ CAD Dosyası' },
];

// Ölçüm yöntemine göre model tipi seçenekleri
const MODEL_TYPES_MANUAL = [
  { value: 'silikon_olcu',            label: 'Silikon Ölçü' },
  { value: 'aljinat_olcu',            label: 'Aljinat Ölçü' },
  { value: 'fiziksel_model',          label: 'Fiziksel Model' },
  { value: 'baski_3d_model',          label: '3D Baskı Model' },
  { value: 'mevcut_protez_referansi', label: 'Mevcut Protez Referansı' },
  { value: 'wax_up',                  label: 'Wax-Up' },
  { value: 'hibrit_olcu_stl',         label: 'Hibrit (Ölçü + STL)' },
];

const MODEL_TYPES_DIGITAL = [
  { value: 'dijital_tarama', label: 'Dijital Tarama' },
  { value: 'stl_dosyasi',    label: 'STL Dosyası' },
  { value: 'cad_dosyasi',    label: 'CAD Dosyası' },
  { value: 'baski_3d_model', label: '3D Baskı Model' },
];

const GENDERS = [
  { value: 'erkek', label: '♂ Erkek' },
  { value: 'kadın', label: '♀ Kadın' },
];

const PHOTO_GUIDE_IMG = require('../../../assets/photo-guide.jpg');
const BITE_GUIDE_IMG  = require('../../../assets/bite-guide.jpg');

const PHOTO_GUIDE_TEXT =
  'Smile design için en az iki fotoğraf gerekir: gülüş (frontal smile) ve retracted (ağız açık, dudak çekilmiş) görüntü.\n\n' +
  'Her iki fotoğraf aynı açı ve pozisyonda çekilmeli, yüz düz ve ortalanmış olmalıdır.\n\n' +
  'İyi sonuç için yeterli aydınlatma, mümkünse ring light veya çift ışık kullanılmalıdır.\n\n' +
  'Kamera göz hizasında olmalı, hasta başını sabit tutmalı ve yaklaşık 1 metre mesafeden çekim yapılmalıdır.';

const UPLOAD_TIPS: Record<string, string> = {
  'Ekartörlü Fotoğraf':  'Dudak ekartörü ile çekilmiş ön ve yan diş görüntüsü.',
  'Gülüş Fotoğrafı':     'Hastanın doğal gülümseme fotoğrafı (estetik analiz için).',
  'Gülüş Videosu':       'Dinamik gülüş ve dudak hareketlerini görmek için önerilir.',
  'Alt Çene Taraması':   'Alt dişlerin 3D taraması (STL/PLY).',
  'Üst Çene Taraması':   'Üst dişlerin 3D taraması (STL/PLY).',
  'Kapanış Taraması':    'Bite/oklüzyon kaydı — dişlerin doğru temasını belirler.\nEksik olursa oklüzyon hatası riski oluşur.',
  'Diş Eti Taraması':    'Diş eti dokusunun 3D taraması. İmplant ve gingival kontur planlaması için kullanılır.',
  'Scan Body Taraması':  'İmplant pozisyonunu doğru belirlemek için scan body taraması.',
  'PDF Belgesi':         'Reçete, ek talimat veya detaylı bilgileri içeren belgeyi yükleyin.',
  'Referans Fotoğrafı':  'İstenen estetik ve formu göstermek için örnek görsel yükleyin.',
};

// ─── Hover tooltip wrapper ────────────────────────────────────────────────────
function WithTooltip({
  text,
  children,
  image,
}: {
  text: string;
  children: React.ReactNode;
  image?: any;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; side: 'left' | 'right' } | null>(null);

  const TIP_W = image ? 300 : 240;

  const computePos = (node: any) => {
    const target: Element | null = node?.getBoundingClientRect
      ? node
      : (node?._nativeTag ?? null);
    if (!target || typeof (target as any).getBoundingClientRect !== 'function') return;
    const rect = (target as any).getBoundingClientRect();
    const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'right' : 'left';
    setPos({
      top: rect.top + rect.height / 2,
      left: rect.left + rect.width / 2,
      side,
    });
  };

  const tooltipNode = pos ? (
    <WebPortal>
      <View style={{
        // @ts-ignore
        position: 'fixed',
        top: pos.top,
        left: pos.side === 'right' ? pos.left + 12 : pos.left - TIP_W - 12,
        transform: [{ translateY: -40 }],
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        width: TIP_W,
        zIndex: 99999,
        // @ts-ignore
        boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
        pointerEvents: 'none',
      }}>
        {image && (
          <Image
            source={image}
            style={{ width: TIP_W, height: 110 }}
            resizeMode="cover"
          />
        )}
        <View style={{ padding: 12 }}>
          <Text style={{ color: '#0F172A', fontSize: 11, lineHeight: 17 }}>{text}</Text>
        </View>
      </View>
    </WebPortal>
  ) : null;

  // ── Web: sarmalama yok — mouseEnter/Leave'i child'a inject et ──
  // Wrapping div (hatta display:contents/inline-block) Safari'de bazen
  // TouchableOpacity'nin onPress event'ini yutuyor. cloneElement ile
  // child'a doğrudan eklersek click 100% çalışır.
  if (Platform.OS === 'web') {
    const child = React.Children.only(children) as React.ReactElement<any>;
    const enhanced = React.cloneElement(child, {
      onMouseEnter: (e: any) => {
        child.props.onMouseEnter?.(e);
        computePos(e.currentTarget);
      },
      onMouseLeave: (e: any) => {
        child.props.onMouseLeave?.(e);
        setPos(null);
      },
    });
    return (
      <>
        {enhanced}
        {tooltipNode}
      </>
    );
  }

  // Native fallback (mobile) — Pressable ile hover desteği
  return (
    <Pressable
      // @ts-ignore
      onHoverIn={(e: any) => computePos(e?.currentTarget)}
      onHoverOut={() => setPos(null)}
      style={{ alignSelf: 'flex-start' }}
    >
      {children}
      {tooltipNode}
    </Pressable>
  );
}

// InfoTooltip artık kullanılmıyor — WithTooltip ile değiştirildi
function InfoTooltip(_props: { text: string; color?: string }) { return null; }

export type NewOrderPanel = 'lab' | 'doctor' | 'clinic' | 'admin' | 'station';

// Panel-specific accent colors + persona-aware texts
const PANEL_THEMES: Record<NewOrderPanel, {
  accent:   string;
  title:    string;
  headerStep1: { lead: string; em: string; tail: string };
  submitLabel: string;
}> = {
  lab: {
    accent:      '#E0A82E', // lab saffron deep — patterns dili
    title:       'Yeni İş Emri',
    headerStep1: { lead: 'Önce ',  em: 'kim için', tail: ' çalışıyoruz?' },
    submitLabel: 'İş emrini oluştur',
  },
  doctor: {
    accent:      '#32BB78', // doctor emerald — patterns dili
    title:       'Yeni Sipariş',
    headerStep1: { lead: 'Hangi ', em: 'hasta',    tail: ' için çalışıyoruz?' },
    submitLabel: 'Laboratuvara gönder',
  },
  clinic: {
    accent:      '#32BB78', // clinic emerald — patterns dili
    title:       'Yeni Sipariş',
    headerStep1: { lead: 'Hangi ', em: 'hekim',    tail: ' için çalışıyoruz?' },
    submitLabel: 'Laboratuvara gönder',
  },
  admin: {
    accent:      '#4771AB', // admin coral
    title:       'Yeni Sipariş',
    headerStep1: { lead: 'Önce ',  em: 'kim için', tail: ' çalışıyoruz?' },
    submitLabel: 'Siparişi oluştur',
  },
  station: {
    accent:      '#3B82F6', // teknisyen / station mavi
    title:       'Yeni İş Emri',
    headerStep1: { lead: 'Önce ',  em: 'kim için', tail: ' çalışıyoruz?' },
    submitLabel: 'İş emrini oluştur',
  },
};

export function NewOrderScreen({
  accentColor,
  onClose,
  doctorMode = false,
  clinicMode = false,
  panel,
  prefill,
  editOrderId,
  onSaved,
}: {
  accentColor?: string;
  onClose?: () => void;
  /**
   * Verilirse → DÜZENLEME modu: NewOrderScreen mevcut siparişi (hasta kimliği dâhil)
   * ön-doldurur, taslak-autosave devre dışı, Kaydet siparişi GÜNCELLER (yeni oluşturmaz).
   */
  editOrderId?: string;
  /** Düzenleme kaydı başarıyla uygulandıktan sonra çağrılır (liste/detay yenileme). */
  onSaved?: () => void;
  /**
   * Doktor panelinden çağrıldığında klinik+hekim seçimi gizlenir,
   * doctor_id otomatik olarak giriş yapan hekimin profile.id'si ile doldurulur,
   * ve submit sonrası /(doctor) rotasına yönlendirilir.
   */
  doctorMode?: boolean;
  /**
   * Klinik müdürü panelinden çağrıldığında klinik sabit, hekim seçimi yapılabilir
   * ancak sadece kendi kliniğindeki hekimler listelenir.
   */
  clinicMode?: boolean;
  /**
   * Panel kimliği — başlık, alt yazılar ve aksent rengi buna göre seçilir.
   * Verilmezse doctorMode/clinicMode'dan türetilir.
   */
  panel?: NewOrderPanel;
  /**
   * "Bu siparişten yeni oluştur" başlangıç değerleri (modules/orders/prefillFromOrder).
   * Verilmezse davranış birebir eskisi gibi — kaydedilmiş taslak varsa o yüklenir.
   * Verilirse taslak yok sayılır ve form vaka kurgusuyla dolu açılır (hasta boş).
   */
  prefill?: OrderPrefill | null;
}) {
  // Panel kimliğini türet — açıkça verilmemişse mode flag'lerinden çıkar
  const resolvedPanel: NewOrderPanel = panel
    ?? (doctorMode ? 'doctor' : clinicMode ? 'clinic' : 'lab');
  const theme = PANEL_THEMES[resolvedPanel];

  // Düzenleme modu — mevcut siparişi yerinde günceller (yeni oluşturmaz).
  const isEdit = !!editOrderId;
  // Simanty yeni sipariş OLUŞTURMA formunu doldurur; mevcut siparişi
  // düzenleyemez. Düzenleme sihirbazı açıkken FAB gizlenir — modalın üstünde
  // durup (kök FAB zIndex 9999) Kaydet düğmesiyle çakışıyordu.
  useSuppressDentyFab(isEdit);
  const [editReady, setEditReady] = useState(!isEdit); // düzenlemede prefill gelene kadar false
  const [editOrderRow, setEditOrderRow] = useState<{ triaged_at?: string | null; status?: string | null } | null>(null);

  // Fiyat görünürlüğü: admin/klinik/hekim panelleri her zaman görür;
  // lab/istasyon kullanıcıları yalnız view_order_pricing izniyle görür.
  const canPerm = usePermissionStore(s => s.can);
  const showPrices = resolvedPanel === 'admin' || resolvedPanel === 'clinic' || resolvedPanel === 'doctor' || canPerm('view_order_pricing');

  // accentColor explicit verilmişse onu kullan, yoksa panel teması
  const P     = accentColor ?? theme.accent;
  const PBg   = '#F1F5F9';
  const PLight = '#1E293B';
  // Panel-aware sayfa arka planı — her panelde dashboard/settings ile aynı bgPage.
  // Dark mode'da panel bgPage yerine T.bg (dark surface) kullanılır.
  const PANEL_TO_MOBILE: Record<NewOrderPanel, MobilePanel> = { lab: 'lab', doctor: 'doctor', clinic: 'klinik', admin: 'exec', station: 'teknisyen' };
  // Station panelinde order/orders rotaları yok → submit sonrası güvenli hedef (dashboard)
  const orderDetailPath = (id: string) =>
    resolvedPanel === 'station' ? '/(station)' : `/(${resolvedPanel})/order/${id}`;
  const orderListPath =
    resolvedPanel === 'station' ? '/(station)' : `/(${resolvedPanel})/orders`;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const NO = useNOTokens();
  const pageBg = isDark ? T.bg : MOBILE_PANEL_THEMES[PANEL_TO_MOBILE[resolvedPanel]].bgPage;
  const styles = useMemo(() => makeStyles(P, T, isDark), [P, T, isDark]);
  const fus    = useMemo(() => makeFusStyles(P), [P]);
  const s2     = useMemo(() => makeS2Styles(P), [P]);

  const router = useRouter();
  const { profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;

  // Mobilde iki-sütunlu alan satırları tek sütuna düşsün (dar ekranda input daralmasın)
  const twoColStyle = isDesktop ? styles.twoCol : styles.twoColStack;

  // ── "Siparişten kopyala" prefill'i ────────────────────────────────────
  // Prop öncelikli; verilmemişse global modal store'dan TEK KULLANIMLIK okunur
  // (openWithPrefill ile set edilir). Böylece 5 panelin layout'una dokunmadan
  // modal prefill ile açılabiliyor; okunduktan sonra temizlenir ki bir sonraki
  // "Yeni sipariş" boş açılsın.
  const [effectivePrefill] = useState<OrderPrefill | null>(
    () => prefill ?? useNewOrderModalStore.getState().prefill ?? null
  );
  useEffect(() => {
    if (!prefill && effectivePrefill) useNewOrderModalStore.getState().clearPrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [step, setStep] = useState<Step>(() => {
    // Düzenleme / kopyalama ile açıldıysa taslağın kaldığı adıma değil, baştan başla.
    if (editOrderId) return 1;
    if (effectivePrefill) return 1;
    if (Platform.OS === 'web') {
      try {
        // Önce kalıcı (localStorage) sonra session — re-mount/reload sonrası kaldığı yerden devam
        const s = localStorage.getItem(DRAFT_STEP_KEY) ?? sessionStorage.getItem('new_order_step');
        if (s === '1' || s === '2' || s === '3' || s === '4') return Number(s) as Step;
      } catch {}
    }
    return 1;
  });

  // Native (iOS/Android) — AsyncStorage'dan step restore et (async, mount sonrası)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (effectivePrefill) return;   // kopyalama ile açıldı → taslak adımını geri yükleme
    let active = true;
    (async () => {
      try {
        const s = await AsyncStorage.getItem(DRAFT_STEP_KEY);
        if (active && (s === '1' || s === '2' || s === '3' || s === '4')) {
          setStep(Number(s) as Step);
        }
      } catch {}
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToStep = (s: Step) => {
    if (Platform.OS === 'web') {
      try {
        sessionStorage.setItem('new_order_step', String(s));
        localStorage.setItem(DRAFT_STEP_KEY, String(s));
      } catch {}
    } else {
      AsyncStorage.setItem(DRAFT_STEP_KEY, String(s)).catch(() => {});
    }
    setStep(s);
  };

  // ─── Onboarding turu (interaktif form gezisi) ─────────────────────────────
  // Hepsi ADDITIVE: tur aktif değilken hiçbir etkisi yok. Yalnız hekim/klinik
  // panelinde çalışır. Bölüm ref'leri spotlight hedefidir; controller ref'i
  // overlay'e sihirbaz adımını değiştirtir; overlayHost modal açıkken spotlight'ı
  // modal-içi overlay'e devreder (fullScreen modal kök overlay'i örter).
  const tourGuided = doctorMode || clinicMode;
  const tourRefClinic  = useTourTarget('tour-no-clinic');
  const tourRefPatient = useTourTarget('tour-no-patient');
  const tourRefTeeth   = useTourTarget('tour-no-teeth');
  const tourRefWork    = useTourTarget('tour-no-work');
  const tourRefHow     = useTourTarget('tour-no-how');
  const tourRefSummary = useTourTarget('tour-no-summary');
  // Alan-alan (field-level) hedefler — adım 1'i tek tek doldurmaya yardımcı olur.
  const tourFldDoctor  = useTourTarget('tour-fld-doctor');
  const tourFldName    = useTourTarget('tour-fld-name');
  const tourFldDob     = useTourTarget('tour-fld-dob');
  const tourFldGender  = useTourTarget('tour-fld-gender');
  const tourRefChat    = useTourTarget('tour-no-chat');
  const tourRefFiles   = useTourTarget('tour-no-files');
  // goToStep'in en güncel sürümünü stabil bir sarmalayıcıyla yayınla.
  const goToStepRef = useRef(goToStep);
  goToStepRef.current = goToStep;
  useEffect(() => {
    if (!tourGuided) return;
    const store = useOnboardingStore.getState();
    store.registerRef('no-form-controller', { goToStep: (n: number) => goToStepRef.current(n as Step) });
    // Tur çalışıyorken bu modal spotlight'ı devralır.
    if (store.active) store.setOverlayHost('newOrder');
    return () => {
      const s = useOnboardingStore.getState();
      s.unregisterRef('no-form-controller');
      s.setOverlayHost('root');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourGuided]);

  // Sayfa başlığını set et
  const setPageTitle = usePageTitleStore(s => s.setTitle);
  const clearPageTitle = usePageTitleStore(s => s.clear);
  useEffect(() => {
    setPageTitle(theme.title);
    return () => clearPageTitle();
  }, []);

  // Her step değişiminde storage'ı güncelle (HMR/reload + app kapatma sonrası kaldığı yerden devam)
  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        sessionStorage.setItem('new_order_step', String(step));
        localStorage.setItem(DRAFT_STEP_KEY, String(step));
      } catch {}
    } else {
      AsyncStorage.setItem(DRAFT_STEP_KEY, String(step)).catch(() => {});
    }
  }, [step]);

  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  // selectedTeeth: the "edit group" — changes in the panel apply to ALL of these
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);

  const [form, setForm] = useState<FormData>(() => {
    // Düzenleme modu: form boş başlar, prefill mount effect'inde async yüklenir
    // (taslak asla okunmaz/karışmaz).
    if (editOrderId) return INITIAL_FORM;
    // "Siparişten kopyala" — açık bir kullanıcı eylemi olduğu için kaydedilmiş
    // taslağın önüne geçer. Hasta alanları INITIAL_FORM'dan boş gelir.
    if (effectivePrefill) return applyPrefill(effectivePrefill);
    if (Platform.OS === 'web') {
      try {
        // Öncelik: kalıcı localStorage taslağı (Gmail draft mantığı)
        const saved = localStorage.getItem(DRAFT_KEY) ?? sessionStorage.getItem('new_order_form');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.patient_dob)   parsed.patient_dob   = new Date(parsed.patient_dob);
          if (parsed.delivery_date) parsed.delivery_date = new Date(parsed.delivery_date);
          const arrFields = ['tooth_ops','pending_items','attachments','tags','voice_notes','lab_voice_notes','chat_messages'] as const;
          arrFields.forEach(k => { if (!Array.isArray(parsed[k])) parsed[k] = (INITIAL_FORM as any)[k]; });
          // Blob URI'lar reload sonrası geçersiz — voice/chat tamamen atılır.
          DRAFT_STRIP_FIELDS.forEach(k => { (parsed as any)[k] = (INITIAL_FORM as any)[k]; });
          // Attachments: sadece storage_path'i olanları (drafts/ bucket'a yüklenmiş)
          // koru — bunların uri'sini boşalt ve 'done' state olarak işaretle.
          if (Array.isArray(parsed.attachments)) {
            parsed.attachments = parsed.attachments
              .filter((a: any) => a?.storage_path)
              .map((a: any) => ({
                ...a,
                uri: '',                       // blob URI ölü, gerekirse signedUrl ile yeniden alınır
                upload_status: 'done',
                upload_progress: 100,
              }));
          } else {
            parsed.attachments = [];
          }
          return { ...INITIAL_FORM, ...parsed };
        }
      } catch {}
    }
    return INITIAL_FORM;
  });
  const [loading, setLoading] = useState(false);

  // ── Düzenleme: DB'de zaten var olan ekler ────────────────────────────────
  // attachment.id === work_order_photos.id olan kayıtlar. Kaydet'te bunlar
  // tekrar insert EDİLMEZ; formdan kaldırılanlar removedPhotosRef'e düşer ve
  // kaydet'te (yalnız lab/admin — RLS delete lab'a açık) silinir.
  const existingPhotosRef = useRef<Record<string, string>>({});
  const removedPhotosRef  = useRef<Array<{ id: string; storage_path: string }>>([]);

  // ── Düzenleme prefill'i (async) — mevcut siparişi forma doldur ──
  useEffect(() => {
    if (!editOrderId) return;
    let alive = true;
    (async () => {
      const p = await fetchOrderEditPrefill(editOrderId);
      if (!alive) return;
      if (!p) { toast.error('Sipariş yüklenemedi.'); onClose?.(); return; }
      const base = applyEditPrefill(p);
      // Mevcut ekleri forma "yüklenmiş" olarak doldur — düzenlemede dosyalar
      // sıfırlanmış görünmesin / tekrar yükleme istenmesin (DB'de zaten korunuyor).
      try {
        const { data: photos } = await supabase
          .from('work_order_photos')
          .select('id, storage_path, caption')
          .eq('work_order_id', editOrderId)
          .order('created_at', { ascending: true });
        const list = (photos ?? []) as any[];
        existingPhotosRef.current = {};
        removedPhotosRef.current  = [];
        list.forEach(ph => { if (ph?.id) existingPhotosRef.current[ph.id] = ph.storage_path ?? ''; });
        if (list.length) {
          const paths = list.map(ph => ph.storage_path).filter(Boolean);
          const urlMap: Record<string, string> = {};
          if (paths.length) {
            const { data: signed } = await supabase.storage.from('work-order-photos').createSignedUrls(paths, 3600);
            (signed ?? []).forEach((s: any) => { if (s?.path && s?.signedUrl) urlMap[s.path] = s.signedUrl; });
          }
          base.attachments = list.map((ph): AttachedFile => {
            const ext = String(ph.storage_path || '').split('.').pop()?.toLowerCase() ?? '';
            const kind: FileKind =
              ext === 'pdf' ? 'pdf'
              : ['mp4', 'mov', 'webm', 'm4v'].includes(ext) ? 'video'
              : ext === 'stl' ? 'stl'
              : ext === 'ply' ? 'ply'
              : ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif'].includes(ext) ? 'photo'
              : 'other';
            return {
              id: ph.id, name: ph.caption || 'Dosya', uri: urlMap[ph.storage_path] || '',
              kind, size: 0, scope: 'case',
              storage_path: ph.storage_path, upload_status: 'done', upload_progress: 100,
            };
          });
        }
      } catch { /* ekler yüklenemese de düzenleme çalışsın */ }
      if (!alive) return;
      setForm(base);
      setEditOrderRow({ triaged_at: p.triaged_at, status: p.status });
      setStep(1);
      setEditReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOrderId]);

  // ── Submit-time dosya upload progress state ──
  // Submit sırasında her dosya için ayrı progress bar gösterilir.
  type SubmitUploadState = {
    id:       string;
    name:     string;
    progress: number | null; // 0..100 veya null (indeterminate)
    status:   'pending' | 'uploading' | 'done' | 'error';
    error?:   string;
  };
  const [submitUploads, setSubmitUploads] = useState<SubmitUploadState[]>([]);
  const [submitUploadsVisible, setSubmitUploadsVisible] = useState(false);

  // ── Lab bilgisi (print preview için) ─────────────────────────────────
  const [labInfo, setLabInfo] = useState<{ name: string; phone: string | null; address: string | null; logo_url: string | null; sidebar_brand_mode?: string | null } | null>(null);
  useEffect(() => {
    const labId = getActiveLabId() ?? (profile as any)?.lab_id;
    if (!labId) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase.from('labs').select('name, phone, address, logo_url, sidebar_brand_mode').eq('id', labId).maybeSingle();
      if (!cancel && data) setLabInfo({ name: data.name, phone: data.phone, address: data.address, logo_url: data.logo_url, sidebar_brand_mode: (data as any).sidebar_brand_mode ?? null });
    })();
    return () => { cancel = true; };
  }, [(profile as any)?.lab_id]);

  // ── Acil vaka ek ücret oranı (Mali İşler → Fiyat Listesi'nden) ──────
  const [urgentSurchargeRate, setUrgentSurchargeRate] = useState<number>(0);
  useEffect(() => {
    const labId = getActiveLabId() ?? (profile as any)?.lab_id;
    if (!labId) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from('lab_settings')
        .select('urgent_surcharge_rate')
        .eq('lab_id', labId)
        .maybeSingle();
      if (!cancel && data) setUrgentSurchargeRate(Number(data.urgent_surcharge_rate) || 0);
    })();
    return () => { cancel = true; };
  }, [(profile as any)?.lab_id]);

  // ── In-app print preview popup state (yeni tab yerine modal) ─────────
  const [printPreviewHtml, setPrintPreviewHtml] = useState<string | null>(null);

  // ── QR short URL — submit sonrası create_qr_link RPC ile üretilir ────
  const [qrShortUrl, setQrShortUrl] = useState<string | null>(null);

  // ── OCR'dan pre-fill (kağıt iş emri tarama akışı, Faz 1+2) ──
  // ScanWorkOrderModal sessionStorage'a 'ocr_work_order' yazıp NewOrderScreen'e yönlendiriyor.
  // İlk mount'ta okunur, form'a uygulanır ve key silinir.
  const [ocrBanner, setOcrBanner] = useState<string | null>(null);
  // WhatsApp botunda adım-adım siparişte toplanan medya (paper-orders/wa-pending yolları);
  // onaylanıp work_order oluşunca work-order-photos'a taşınır (aşağıda submit sonrası).
  const pendingWaMediaRef = useRef<any[] | null>(null);
  // Manuel/kağıt sipariş onayından geldiyse: sipariş BAŞARIYLA oluşunca bu pending kaydı
  // 'approved' + work_order_id yapılır (o ana kadar manuel kutuda kalır, kaybolmaz).
  const pendingPaperIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.sessionStorage) return;
    let raw: string | null = null;
    try { raw = window.sessionStorage.getItem('ocr_work_order'); } catch { return; }
    if (!raw) return;
    try {
      const ocr = JSON.parse(raw) as {
        clinic_id: string | null;
        doctor_name: string | null;
        patient_name: string | null;
        order_date: string | null;
        delivery_date: string | null;
        urgency: 'normal' | 'acil' | 'cok_acil' | null;
        tooth_numbers: number[];
        work_type: string | null;
        shade: string | null;
        impression_type: string | null;
        notes: string | null;
        // Yeni form alanları — eski formlarda gelmez (undefined/null)
        patient_gender?: 'kadın' | 'erkek' | null;
        patient_dob?: string | null;
        delivery_method?: 'kurye' | 'elden' | 'kargo' | null;
        scan_bodies_delivered?: boolean | null;
        items?: Array<{ work_type: string | null; tooth_numbers: number[]; shade: string | null }>;
      };

      // WhatsApp botundan gelen ek medyayı yakala (varsa) — submit sonrası taşınır.
      pendingWaMediaRef.current = Array.isArray((ocr as any).wa_media) ? (ocr as any).wa_media : null;
      // Manuel kutu onayından geldiyse pending_id — sipariş oluşunca 'approved' yapılır.
      pendingPaperIdRef.current = (ocr as any).__pending_id ?? null;

      // Hasta adı parse — son kelime soyad, geri kalanı ad
      let pFirst = '', pLast = '';
      if (ocr.patient_name) {
        const parts = ocr.patient_name.trim().split(/\s+/);
        if (parts.length === 1) { pFirst = parts[0]; }
        else { pLast = parts.pop()!; pFirst = parts.join(' '); }
      }

      // Ölçü yöntemi map
      // 'Manuel' yeni formun etiketi ("Manuel (Ölçü)"); Klasik/Putty eski formlar.
      const measMap: Record<string, 'manual' | 'digital'> = {
        'Manuel': 'manual', 'Klasik': 'manual', 'Putty': 'manual', 'Dijital': 'digital',
      };
      const measurement_type = ocr.impression_type ? (measMap[ocr.impression_type] ?? '' as any) : '' as any;

      // tooth_ops üret. Formdaki "İŞLEM SATIRLARI" tablosu doluysa HER SATIR
      // kendi işlemini/rengini taşır (farklı dişe farklı işlem); tablo boşsa
      // eski davranış: tüm dişlere tek work_type + shade.
      const ocrItems = (ocr.items ?? []).filter(it => (it?.tooth_numbers?.length ?? 0) > 0);
      const tooth_ops: ToothOp[] = ocrItems.length > 0
        ? ocrItems.flatMap(it => it.tooth_numbers.map(t => ({
            ...BLANK_OP,
            tooth: t,
            __uid: newOpUid(),
            work_type: it.work_type ?? ocr.work_type ?? '',
            shade: it.shade ?? ocr.shade ?? '',
          })))
        : (ocr.tooth_numbers ?? []).map(t => ({
            ...BLANK_OP,
            tooth: t,
            __uid: newOpUid(),
            work_type: ocr.work_type ?? '',
            shade: ocr.shade ?? '',
          }));

      setForm(prev => ({
        ...prev,
        clinic_id: ocr.clinic_id || prev.clinic_id,
        patient_first_name: pFirst || prev.patient_first_name,
        patient_last_name:  pLast  || prev.patient_last_name,
        is_urgent: ocr.urgency === 'acil' || ocr.urgency === 'cok_acil' ? true : prev.is_urgent,
        delivery_date: ocr.delivery_date ? new Date(ocr.delivery_date) : prev.delivery_date,
        tooth_ops: tooth_ops.length > 0 ? tooth_ops : prev.tooth_ops,
        notes: ocr.notes ? (prev.notes ? prev.notes + '\n' + ocr.notes : ocr.notes) : prev.notes,
        measurement_type: measurement_type || prev.measurement_type,
        patient_gender: ocr.patient_gender === 'kadın' ? 'kadın'
                      : ocr.patient_gender === 'erkek' ? 'erkek'
                      : prev.patient_gender,
        patient_dob: ocr.patient_dob ? new Date(ocr.patient_dob) : prev.patient_dob,
        delivery_method: ocr.delivery_method ?? prev.delivery_method,
        scan_bodies_delivered: ocr.scan_bodies_delivered ?? prev.scan_bodies_delivered,
      }));

      // Klinik varsa: ÖNCE doctor_name varsa o hekimi ara (case-insensitive),
      // bulamazsan kliniğin ilk aktif hekimini auto-set et
      if (ocr.clinic_id) {
        (async () => {
          let resolvedDoctorId: string | null = null;
          if (ocr.doctor_name) {
            const { data: byName } = await supabase
              .from('profiles')
              .select('id')
              .eq('clinic_id', ocr.clinic_id)
              .eq('user_type', 'doctor')
              .ilike('full_name', `%${ocr.doctor_name.trim()}%`)
              .limit(1)
              .maybeSingle();
            if (byName?.id) resolvedDoctorId = (byName as any).id;
          }
          if (!resolvedDoctorId) {
            const { data: first } = await supabase
              .from('profiles')
              .select('id')
              .eq('clinic_id', ocr.clinic_id)
              .eq('is_active', true)
              .eq('user_type', 'doctor')
              .limit(1)
              .maybeSingle();
            if (first?.id) resolvedDoctorId = (first as any).id;
          }
          if (resolvedDoctorId) {
            setForm(prev => ({ ...prev, doctor_id: prev.doctor_id || resolvedDoctorId! }));
          }
        })();
      }

      const filledCount = [
        ocr.clinic_id ? autoT('klinik') : null,
        ocr.doctor_name ? autoT('hekim') : null,
        ocr.patient_name ? autoT('hasta') : null,
        ocr.tooth_numbers?.length ? `${ocr.tooth_numbers.length} ${autoT('diş')}` : null,
        ocr.work_type ? autoT('işlem tipi') : null,
        ocr.shade ? autoT('renk') : null,
        ocr.delivery_date ? autoT('tarih') : null,
        ocr.urgency === 'acil' || ocr.urgency === 'cok_acil' ? autoT('aciliyet') : null,
      ].filter(Boolean);
      setOcrBanner(`${autoT('Kağıt formdan')} ${filledCount.join(' · ')} ${autoT('otomatik dolduruldu. Kontrol et ve eksik alanları tamamla.')}`);

      // Bir kez kullan, sonra temizle
      try { window.sessionStorage.removeItem('ocr_work_order'); } catch {}
    } catch { /* JSON parse hatası — sessizce yut */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Draft save timestamp (UI göstergesinde kullanılır) ──
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(() => {
    if (editOrderId) return null;   // düzenleme → taslak göstergesi yok
    if (Platform.OS === 'web') {
      try {
        const t = localStorage.getItem(DRAFT_TS_KEY);
        if (t) return new Date(parseInt(t, 10));
      } catch {}
    }
    return null;
  });

  // ── Taslak prompt: localStorage'da taslak varsa ve bu oturumda henüz
  //    sorulmadıysa kullanıcıya sor: devam et mi yeni mi başla?
  const [draftPromptOpen, setDraftPromptOpen] = useState<boolean>(() => {
    if (Platform.OS !== 'web') return false;
    if (editOrderId) return false;        // düzenleme → taslak sorusu yok
    if (effectivePrefill) return false;   // kopyalama ile açıldı → taslak sorusu sorma
    try {
      const hasDraft     = !!localStorage.getItem(DRAFT_KEY);
      const alreadyAsked = sessionStorage.getItem('new_order_draft_prompted') === '1';
      return hasDraft && !alreadyAsked;
    } catch { return false; }
  });
  const [draftSavedAtPrompt, setDraftSavedAtPrompt] = useState<Date | null>(() => {
    if (Platform.OS !== 'web') return null;
    try {
      const t = localStorage.getItem(DRAFT_TS_KEY);
      if (t) return new Date(parseInt(t, 10));
    } catch {}
    return null;
  });

  // İlk mount'ta otomatik re-save etmeyi engelle (restored form'un timestamp'i korunur)
  const skipFirstDraftSaveRef = useRef(true);

  // Form değiştiğinde debounced olarak draft persist et (web: localStorage, native: AsyncStorage)
  useEffect(() => {
    if (isEdit) return;   // düzenleme modu: yeni-sipariş taslağına dokunma
    if (skipFirstDraftSaveRef.current) {
      skipFirstDraftSaveRef.current = false;
      return;
    }
    const handle = setTimeout(() => {
      try {
        const serializable: any = { ...form };
        DRAFT_STRIP_FIELDS.forEach(k => { delete serializable[k]; });
        if (Array.isArray(serializable.attachments)) {
          serializable.attachments = serializable.attachments
            .filter((a: any) => a?.storage_path)
            .map((a: any) => ({ ...a, uri: '' }));
        }
        const isEmpty =
          !serializable.clinic_id && !serializable.doctor_id &&
          !serializable.patient_first_name && !serializable.patient_last_name &&
          !serializable.patient_id && !serializable.patient_phone &&
          (serializable.tooth_ops?.length ?? 0) === 0 &&
          (serializable.pending_items?.length ?? 0) === 0 &&
          !serializable.notes && !serializable.lab_notes;
        if (isEmpty) {
          if (Platform.OS === 'web') {
            try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(DRAFT_TS_KEY); } catch {}
          } else {
            void AsyncStorage.removeItem(DRAFT_KEY);
            void AsyncStorage.removeItem(DRAFT_TS_KEY);
          }
          setLastSavedAt(null);
          return;
        }
        const payload = JSON.stringify(serializable);
        const now = Date.now();
        if (Platform.OS === 'web') {
          try {
            localStorage.setItem(DRAFT_KEY, payload);
            localStorage.setItem(DRAFT_TS_KEY, String(now));
          } catch {}
        } else {
          void AsyncStorage.setItem(DRAFT_KEY, payload);
          void AsyncStorage.setItem(DRAFT_TS_KEY, String(now));
        }
        setLastSavedAt(new Date(now));
      } catch {}
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [form]);

  // ── Native: mount sonrası AsyncStorage'dan draft yükle + prompt göster ──
  // (Web'de form INITIAL'da sync olarak localStorage'dan restore edilir;
  //  native'de AsyncStorage async olduğu için ayrı bir effect ile yapılır.)
  const nativeDraftCheckedRef = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (isEdit) return;             // düzenleme → taslak yükleme yok
    if (effectivePrefill) return;   // kopyalama ile açıldı → taslak formu geri yükleme
    if (nativeDraftCheckedRef.current) return;
    nativeDraftCheckedRef.current = true;
    (async () => {
      try {
        const [savedRaw, tsRaw, askedRaw] = await Promise.all([
          AsyncStorage.getItem(DRAFT_KEY),
          AsyncStorage.getItem(DRAFT_TS_KEY),
          AsyncStorage.getItem('new_order_draft_prompted'),
        ]);
        if (!savedRaw) return;
        // Bu oturumda zaten sorulduysa otomatik restore et, prompt'u gösterme
        const alreadyAsked = askedRaw === '1';
        try {
          const parsed = JSON.parse(savedRaw);
          if (parsed.patient_dob)   parsed.patient_dob   = new Date(parsed.patient_dob);
          if (parsed.delivery_date) parsed.delivery_date = new Date(parsed.delivery_date);
          const arrFields = ['tooth_ops','pending_items','attachments','tags','voice_notes','lab_voice_notes','chat_messages'] as const;
          arrFields.forEach(k => { if (!Array.isArray(parsed[k])) parsed[k] = (INITIAL_FORM as any)[k]; });
          DRAFT_STRIP_FIELDS.forEach(k => { (parsed as any)[k] = (INITIAL_FORM as any)[k]; });
          if (Array.isArray(parsed.attachments)) {
            parsed.attachments = parsed.attachments
              .filter((a: any) => a?.storage_path)
              .map((a: any) => ({ ...a, uri: '', upload_status: 'done', upload_progress: 100 }));
          } else {
            parsed.attachments = [];
          }
          // Form'u restore et (skip auto-save so timestamp doesn't reset)
          skipFirstDraftSaveRef.current = true;
          setForm({ ...INITIAL_FORM, ...parsed });
          if (tsRaw) setLastSavedAt(new Date(parseInt(tsRaw, 10)));
          if (!alreadyAsked) {
            if (tsRaw) setDraftSavedAtPrompt(new Date(parseInt(tsRaw, 10)));
            setDraftPromptOpen(true);
          }
        } catch { /* JSON parse fail — sessiz yut */ }
      } catch { /* AsyncStorage fail */ }
    })();
  }, []);

  // Taslağı sil ve formu sıfırla
  const discardDraft = useCallback(() => {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_TS_KEY);
        localStorage.removeItem(DRAFT_STEP_KEY);
        sessionStorage.removeItem('new_order_form');
        sessionStorage.removeItem('new_order_step');
      } catch {}
    } else {
      void AsyncStorage.multiRemove([DRAFT_KEY, DRAFT_TS_KEY, DRAFT_STEP_KEY, 'new_order_draft_prompted']);
    }
    skipFirstDraftSaveRef.current = true;
    setForm(INITIAL_FORM);
    setConfirmedTeeth([]);
    setLastSavedAt(null);
    setStep(1);
  }, []);

  // ── Taslak prompt handler'ları ──
  const handleContinueDraft = useCallback(() => {
    if (Platform.OS === 'web') {
      try { sessionStorage.setItem('new_order_draft_prompted', '1'); } catch {}
    } else {
      void AsyncStorage.setItem('new_order_draft_prompted', '1');
    }
    setDraftPromptOpen(false);
    // form zaten init/effect'te restore edildi, bir şey yapmaya gerek yok
  }, []);

  const handleStartNewOrder = useCallback(() => {
    if (Platform.OS === 'web') {
      try {
        sessionStorage.setItem('new_order_draft_prompted', '1');
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_TS_KEY);
        localStorage.removeItem(DRAFT_STEP_KEY);
        sessionStorage.removeItem('new_order_form');
        sessionStorage.removeItem('new_order_step');
      } catch {}
    } else {
      void AsyncStorage.setItem('new_order_draft_prompted', '1');
      void AsyncStorage.multiRemove([DRAFT_KEY, DRAFT_TS_KEY, DRAFT_STEP_KEY]);
    }
    skipFirstDraftSaveRef.current = true;
    setForm(INITIAL_FORM);
    setConfirmedTeeth([]);
    setLastSavedAt(null);
    setStep(1);
    setDraftPromptOpen(false);
  }, []);

  // Clinic add modal
  const [clinicModal, setClinicModal] = useState<{ visible: boolean; prefill: string }>({ visible: false, prefill: '' });
  const [clinicSaving, setClinicSaving] = useState(false);

  // Doctor add modal
  const [doctorModal, setDoctorModal] = useState<{ visible: boolean; prefill: string }>({ visible: false, prefill: '' });
  const [doctorSaving, setDoctorSaving] = useState(false);

  // Chat modal
  const [chatModalVisible, setChatModalVisible] = useState(false);
  // Submit sonrası başarı ekranı — { id, orderNumber } | null
  const [submittedOrder, setSubmittedOrder] = useState<{ id: string; orderNumber: string; patientName: string } | null>(null);


  // Step 3 — confirmed teeth (shown in bottom list after "Listeye ekle")
  // Initial state: draft restore'dan gelen form.tooth_ops içinde work_type
  // dolu olanları confirmed olarak kabul et — aksi halde liste boş kalıyor.
  const [confirmedTeeth, setConfirmedTeeth] = useState<number[]>(() => {
    return (form.tooth_ops ?? [])
      .filter(o => !!o.work_type)
      .map(o => o.tooth);
  });
  // ── "Son siparişlerden seç" ──────────────────────────────────────────
  const lastConfirmedOpRef = useRef<Omit<ToothOp, 'tooth'>>({ ...BLANK_OP });
  const [opResetKey, setOpResetKey] = useState(0);

  // İkinci işlem için aktif op'ların uid listesi — set ise updateToothOp bu uid'leri patch eder
  // (tek diş için 1 uid, çene shortcut'la N uid).
  const [secondaryOpUids, setSecondaryOpUids] = useState<string[]>([]);
  const secondaryOpUid = secondaryOpUids[0] ?? null; // backward-compat readers

  // Form draft restore sonrası confirmedTeeth'i de senkronize et — yeni
  // mount'ta useState init zaten yapar ama OCR/external setForm
  // değişikliklerinde de senkron kalsın.
  useEffect(() => {
    const filled = form.tooth_ops.filter(o => !!o.work_type).map(o => o.tooth);
    setConfirmedTeeth(prev => {
      // sadece eksik olanları ekle, ekstradan kaldırma yok (kullanıcı manuel sildiyse)
      const missing = filled.filter(t => !prev.includes(t));
      if (missing.length === 0) return prev;
      return [...prev, ...missing];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tooth_ops.length]);

  // Color palette for distinct work-type groups in tooth picker
  const OP_COLOR_PALETTE = ['#2563EB','#059669','#D97706','#7C3AED','#DC2626','#0891B2','#DB2777','#65A30D'];

  // Map each confirmed tooth to a color based on its work_type
  const toothColorMap = useMemo<Record<number, string>>(() => {
    const workTypeColor: Record<string, string> = {};
    let idx = 0;
    const map: Record<number, string> = {};
    confirmedTeeth.forEach(t => {
      const op = form.tooth_ops.find(o => o.tooth === t);
      const key = (op?.work_type ?? '') || '__none__';
      if (!workTypeColor[key]) {
        workTypeColor[key] = OP_COLOR_PALETTE[idx % OP_COLOR_PALETTE.length];
        idx++;
      }
      map[t] = workTypeColor[key];
    });
    return map;
  }, [confirmedTeeth, form.tooth_ops]);

  // localStorage cache — yeni sipariş formunun dropdown verileri.
  // Açılışta cache'den okuyup instant render, arka planda refetch (silent).
  const NEW_ORDER_CACHE_KEY = 'new_order_dropdowns_v1';
  const loadCache = (): {
    clinics: Clinic[]; doctors: Doctor[]; services: LabService[]; materialPrices: Record<string, number>;
  } | null => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const raw = window.localStorage.getItem(NEW_ORDER_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  };
  const saveCache = (data: { clinics: Clinic[]; doctors: Doctor[]; services: LabService[]; materialPrices: Record<string, number> }) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(NEW_ORDER_CACHE_KEY, JSON.stringify(data)); } catch { /* quota */ }
  };
  const cached = loadCache();

  const [clinics, setClinics] = useState<Clinic[]>(cached?.clinics ?? []);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>(cached?.doctors ?? []);
  const [services, setServices] = useState<LabService[]>(cached?.services ?? []);
  const [serviceSearch, setServiceSearch] = useState('');
  // dataLoading: yalnızca cache yoksa true (ilk kez) — sonraki açılışlar instant
  const [dataLoading, setDataLoading] = useState(cached === null);
  const [materialPrices, setMaterialPrices] = useState<Record<string, number>>(cached?.materialPrices ?? {});
  // Klinik-özel fiyat listesi: serviceId → kliniğe özel fiyat (override varsa).
  // Yoksa genel katalog fiyatı (lab_services.price) kullanılır.
  /** Klinik-özel fiyat: FİYAT + PARA BİRİMİ birlikte taşınır.
   *  Eskiden yalnız sayı tutuluyordu; klinik listesi USD olsa bile katalogdan
   *  gelen EUR sembolü gösteriliyordu (ölçüldü: "Dent Hekim" 24 kalem USD,
   *  katalog EUR → ekranda €). Fiyatla para birimi ayrılamaz. */
  const [clinicPriceMap, setClinicPriceMap] = useState<Record<string, { price: number; currency?: string | null }>>({});

  useEffect(() => {
    // Doctor mode: clinic/doctor fetch'i atla
    const clinicsPromise = doctorMode
      ? Promise.resolve({ data: [] })
      : fetchClinics();
    const doctorsPromise = doctorMode
      ? Promise.resolve({ data: [] })
      : clinicMode
        ? supabase.from('my_clinic_doctors').select('id, full_name, phone, avatar_url, clinic_id')
        : fetchAllDoctors();

    Promise.all([
      clinicsPromise,
      doctorsPromise,
      fetchLabServices(),
      supabase.from('materials').select('name,price').eq('is_active', true),
    ]).catch((err) => {
      console.warn('[new-order] data fetch failed:', err?.message ?? err);
      return [{ data: [] }, { data: [] }, { data: [] }, { data: [] }] as any;
    }).then(([clinicsRes, doctorsRes, servicesRes, matsRes]) => {
      const freshClinics = (clinicsRes?.data as Clinic[]) ?? [];
      setClinics(freshClinics);
      let freshDoctors: Doctor[] = [];
      if (clinicMode) {
        freshDoctors = ((doctorsRes?.data as any[]) ?? []).map(d => ({
          id: d.id,
          full_name: d.full_name,
          phone: d.phone,
          clinic_id: d.clinic_id,
          clinic: null,
        })) as unknown as Doctor[];
      } else {
        freshDoctors = (doctorsRes?.data as Doctor[]) ?? [];
      }
      setAllDoctors(freshDoctors);
      const freshServices = (servicesRes?.data as LabService[]) ?? [];
      setServices(freshServices);
      const priceMap: Record<string, number> = {};
      ((matsRes?.data ?? []) as { name: string; price: number }[]).forEach(m => {
        priceMap[m.name] = m.price;
      });
      setMaterialPrices(priceMap);
      setDataLoading(false);
      // Cache'i tazele
      saveCache({ clinics: freshClinics, doctors: freshDoctors, services: freshServices, materialPrices: priceMap });
    });
  }, []);

  // Seçili klinik için klinik-özel fiyat listesini (clinic_price_overrides) çek.
  // custom_price varsa onu, yoksa discount_percent'i katalog fiyatına uygular.
  // Klinik seçili değilse / override yoksa → genel katalog fiyatı kullanılır.
  // clinicPriceMap'i YALNIZ gerçekten değiştiyse güncelle — her fire'da yeni {} / yeni
  // obje set etmek (özellikle klinik seçilmemiş WhatsApp/OCR siparişinde) gereksiz
  // render zinciri (effectiveServices → WorkTypeSelector …) üretip #185'i besleyebilir.
  const applyClinicPriceMap = useCallback((next: Record<string, { price: number; currency?: string | null }>) => {
    setClinicPriceMap(prev => {
      const pk = Object.keys(prev), nk = Object.keys(next);
      if (pk.length === nk.length && pk.every(k =>
        prev[k]?.price === next[k]?.price && (prev[k]?.currency ?? null) === (next[k]?.currency ?? null)
      )) return prev;
      return next;
    });
  }, []);
  useEffect(() => {
    const clinicId = form.clinic_id;
    if (!clinicId) { applyClinicPriceMap({}); return; }
    const labId = (profile as any)?.lab_id ?? profile?.id ?? null;
    let cancelled = false;
    (async () => {
      try {
        let q = supabase
          .from('clinic_price_overrides')
          .select('service_id, custom_price, discount_percent, currency')
          .eq('clinic_id', clinicId);
        if (labId) q = q.eq('lab_id', labId);
        const { data, error } = await q;
        if (error || cancelled) return;
        const base: Record<string, number> = {};
        services.forEach(s => { base[s.id] = Number(s.price) || 0; });
        const map: Record<string, { price: number; currency?: string | null }> = {};
        ((data ?? []) as any[]).forEach(ov => {
          if (ov.custom_price != null) {
            // Özel FİYAT: para birimi de override'dan gelir (USD listesi gibi).
            map[ov.service_id] = { price: Number(ov.custom_price), currency: ov.currency ?? null };
          } else if (ov.discount_percent != null && Number(ov.discount_percent) > 0) {
            // İskonto: katalog fiyatının yüzdesi → para birimi KATALOĞUN kalır.
            const catalog = base[ov.service_id] ?? 0;
            map[ov.service_id] = { price: Math.round(catalog * (100 - Number(ov.discount_percent)) / 100 * 100) / 100 };
          }
        });
        if (!cancelled) applyClinicPriceMap(map);
      } catch { if (!cancelled) applyClinicPriceMap({}); }
    })();
    return () => { cancelled = true; };
  }, [form.clinic_id, services, profile, applyClinicPriceMap]);

  // ── Devam siparişinde ASIL işin dosyaları ────────────────────────────────
  // KOPYALANMAZ: yeni satır açılmaz, aynı dosya iki kez kaydedilmez. Sipariş
  // detayında `StageFileUpload` zaten ebeveynin dosyalarını salt-okunur
  // devralıyor; sihirbazda ise sipariş henüz oluşmadığı için o kod çalışmıyordu
  // ve kullanıcı "Henüz dosya eklenmedi" görüyordu. Burada yalnızca GÖSTERİM
  // için ebeveynin listesi çekilir.
  const [inheritedFiles, setInheritedFiles] = useState<{ id: string; name: string; path: string }[]>([]);
  // Devam siparişinde hasta bilgisi ana siparişten doldurulur. Alanlar KİLİTLİ
  // gelir ki iki kayıt zamanla birbirinden ayrışmasın (aynı hasta, iki farklı
  // yazım). Kilit kalıcı değil: gerçek bir düzeltme gerekiyorsa açılabilir.
  const [patientLocked, setPatientLocked] = useState(false);
  useEffect(() => {
    setPatientLocked(!!effectivePrefill?.patient_prefill);
  }, [effectivePrefill?.patient_prefill]);
  useEffect(() => {
    const parentId = effectivePrefill?.continues_order_id;
    if (!parentId) { setInheritedFiles([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('work_order_photos')
        .select('id, storage_path, caption')
        .eq('work_order_id', parentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      setInheritedFiles(((data ?? []) as any[]).map(r => {
        const parts = String(r.storage_path).split('/');
        const fname = parts[parts.length - 1] ?? r.storage_path;
        return {
          id: r.id,
          path: r.storage_path,
          name: (r.caption ?? '').trim() || decodeURIComponent(fname.split('-').slice(1).join('-') || fname),
        };
      }));
    })();
    return () => { cancelled = true; };
  }, [effectivePrefill?.continues_order_id]);

  // İş türü seçicisine geçilecek servisler — klinik-özel fiyat varsa onunla,
  // yoksa genel katalog fiyatıyla. Çip görünümü + seçim + kayıt hepsi bunu kullanır.
  const effectiveServices = useMemo(
    () => services.map(s => {
      const ov = clinicPriceMap[s.id];
      if (ov == null) return s;
      return { ...s, price: ov.price, currency: ov.currency ?? s.currency };
    }),
    [services, clinicPriceMap]
  );

  // Sipariş geneli para birimi — seçili işlemlerin (yoksa fiyat listesinin) currency'si.
  const orderCur = form.tooth_ops.find(o => o.currency)?.currency ?? services[0]?.currency ?? 'TRY';

  const set = <K extends keyof FormData>(key: K) =>
    (val: FormData[K]) => {
      setForm((f) => ({ ...f, [key]: val }));
    };

  // ── Reactive validation ───────────────────────────────────────────────────
  const [stepAttempted, setStepAttempted] = useState<Record<Step, boolean>>({
    1: false, 2: false, 3: false, 4: false,
  });
  const [submitError, setSubmitError] = useState('');

  // Doctor mode: doctor_id'yi giriş yapan hekimin profile.id'si ile sabitle
  useEffect(() => {
    if (doctorMode && profile?.id && form.doctor_id !== profile.id) {
      setForm(f => ({ ...f, doctor_id: profile.id }));
    }
  }, [doctorMode, profile?.id, form.doctor_id]);

  const errors = useMemo((): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!doctorMode && !form.doctor_id)         e.doctor_id      = 'Diş hekimi seçin';
    if (!form.patient_first_name.trim())        e.patient_first_name = 'Ad zorunlu';
    if (!form.patient_last_name.trim())         e.patient_last_name  = 'Soyad zorunlu';
    if (!form.patient_dob)                      e.patient_dob        = 'Doğum tarihi zorunlu';
    if (form.patient_gender === 'belirtilmedi') e.patient_gender = 'Cinsiyet seçin';
    if (!form.patient_id?.trim())               e.patient_id     = 'TC kimlik zorunlu';
    if (!form.patient_nationality)              e.patient_nationality = 'Uyruk seçin';
    if (!form.measurement_type)  e.measurement_type  = 'Ölçüm yöntemi seçin';
    if (!form.model_type)        e.model_type        = 'Model tipi seçin';
    // Dijital ölçüm + dosya gerektiren model tipi → en az 1 dosya yüklenmiş olmalı
    const DIGITAL_FILE_REQUIRED = ['dijital_tarama', 'stl_dosyasi', 'cad_dosyasi', 'baski_3d_model'];
    if (form.measurement_type === 'digital' && DIGITAL_FILE_REQUIRED.includes(form.model_type)) {
      const hasFile = (form.attachments ?? []).some(a => ['stl', 'ply', 'other', 'pdf'].includes(a.kind));
      // Devam siparişinde ASIL işin dosyaları miras alınır (continues_order_id) →
      // yeniden yükleme zorunlu değil; asıl işte dosya varsa kural gevşer.
      const inheritsFiles = !!effectivePrefill?.continues_order_id && !!effectivePrefill?.has_source_files;
      if (!hasFile && !inheritsFiles) e.attachments = 'Bu model tipi için dosya yüklemelisiniz (STL / CAD / 3D)';
    }
    if (!form.delivery_date)     e.delivery_date     = 'Teslim tarihi seçin';
    else {
      // Normal vakada 72 saat (3 gün), acil vakada 1 gün (yarından itibaren)
      const minDays = form.is_urgent ? 1 : 3;
      const earliest = new Date(); earliest.setHours(0, 0, 0, 0); earliest.setDate(earliest.getDate() + minDays);
      const sel = new Date(form.delivery_date); sel.setHours(0, 0, 0, 0);
      if (sel < earliest) {
        e.delivery_date = form.is_urgent
          ? 'Acil vakada teslim tarihi en erken yarın olabilir'
          : 'Teslim tarihi en az 72 saat sonra olmalı';
      }
    }
    if (!form.delivery_method)   e.delivery_method   = 'Teslim yöntemi seçin';
    if (form.tooth_ops.length === 0)
      e.tooth_ops = 'En az 1 diş seçin';
    else if (!form.tooth_ops.some(o => o.work_type) && form.pending_items.length === 0)
      e.tooth_ops = 'En az 1 diş için işlem belirleyin';
    return e;
  }, [form]);

  const STEP_FIELDS: Record<Step, string[]> = {
    1: ['doctor_id', 'patient_first_name', 'patient_last_name', 'patient_gender', 'patient_dob'],
    2: ['tooth_ops'],
    3: ['measurement_type', 'model_type', 'delivery_date', 'delivery_method', 'attachments'],
    4: [],
  };

  const isStepValid = (s: Step) => STEP_FIELDS[s].every(k => !errors[k]);
  const isFormValid = isStepValid(1) && isStepValid(2) && isStepValid(3);

  // Returns error string for a field, only after user has attempted this step
  const fe = (key: string): string | undefined =>
    stepAttempted[step] ? errors[key] : undefined;

  // Filter doctors by selected clinic
  const filteredDoctors = form.clinic_id
    ? allDoctors.filter((d) => d.clinic_id === form.clinic_id)
    : allDoctors;

  const itemTotal = form.pending_items.reduce((s, i) => s + i.price * i.quantity, 0);

  const addPendingItem = async (service: LabService) => {
    const existing = form.pending_items.find((i) => i.service_id === service.id);
    if (existing) {
      set('pending_items')(
        form.pending_items.map((i) =>
          i.service_id === service.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
      return;
    }

    // Faz 1: 3-kademe fiyat çözümleyicisini çağır (clinic override > promotion > catalog)
    let resolvedPrice = service.price;
    let priceSource: string = 'catalog';
    // Para birimi fiyatla BİRLİKTE taşınır — resolve_item_price zaten döndürüyor,
    // eskiden atılıyordu ve 7 EUR ekranda ₺7 oluyordu.
    let resolvedCurrency: string = (service as any).currency ?? 'TRY';
    try {
      const labId = getActiveLabId() ?? (profile as any)?.lab_id ?? profile?.id ?? null;
      if (labId && service.id) {
        const { data, error } = await supabase.rpc('resolve_item_price', {
          p_lab_id:     labId,
          p_service_id: service.id,
          p_clinic_id:  form.clinic_id || null,
          p_order_date: new Date().toISOString().slice(0, 10),
        });
        if (!error && Array.isArray(data) && data.length > 0) {
          const row = data[0] as any;
          if (row.price != null) {
            resolvedPrice = Number(row.price);
            priceSource = row.source ?? 'catalog';
            if (row.currency) resolvedCurrency = String(row.currency);
          }
        }
      }
    } catch (_) { /* RPC başarısızsa katalog fiyatı */ }

    set('pending_items')([
      ...form.pending_items,
      { service_id: service.id, name: service.name, price: resolvedPrice, currency: resolvedCurrency, quantity: 1, price_source: priceSource } as any,
    ]);
  };

  const removePendingItem = (idx: number) => {
    set('pending_items')(form.pending_items.filter((_, i) => i !== idx));
  };

  // ── File attachments ──────────────────────────────────────────────────────
  const [fileActiveTooth, setFileActiveTooth] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<AttachedFile | null>(null);

  /** Önizlemede oklarla gezmek için yalnız fotoğraflar (sıra ekrandakiyle aynı). */
  const previewPhotos = useMemo(
    () => form.attachments.filter(a => a.kind === 'photo' && !!a.uri),
    [form.attachments],
  );
  const previewIndex = useMemo(
    () => (previewFile ? previewPhotos.findIndex(a => a.id === previewFile.id) : -1),
    [previewPhotos, previewFile],
  );
  const stepPreview = useCallback((delta: number) => {
    if (previewIndex < 0 || previewPhotos.length < 2) return;
    const n = (previewIndex + delta + previewPhotos.length) % previewPhotos.length;
    setPreviewFile(previewPhotos[n]);
  }, [previewIndex, previewPhotos]);

  // Klavye ile gezinme (web) — ok tuşları, Esc zaten modal'da bağlı.
  useEffect(() => {
    if (Platform.OS !== 'web' || !previewFile || previewPhotos.length < 2) return;
    const onKey = (e: any) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); stepPreview(1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); stepPreview(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewFile, previewPhotos.length, stepPreview]);
  // 3D taramalar lab ile aynı Viewer3DModal'da açılır (tek veya çoklu).
  const [viewer3DFiles, setViewer3DFiles] = useState<Array<{ id: string; name: string; url: string; format: 'stl' | 'ply' | 'obj' }> | null>(null);
  // Önizleme yönlendirici: 3D dosya → Viewer3DModal; diğerleri → normal önizleme.
  const openFilePreview = (file: AttachedFile) => {
    if (file.kind === 'stl' || file.kind === 'ply') {
      setViewer3DFiles([{ id: file.id, name: file.name, url: file.uri, format: file.kind }]);
    } else {
      setPreviewFile(file);
    }
  };
  // Upload modalı state'i — sessionStorage'a persist edilir, tab switch / re-mount sonrası
  // kullanıcı modal'ı tekrar açmak zorunda kalmaz.
  const [uploadModalOpen, setUploadModalOpenRaw] = useState<boolean>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    try { return window.sessionStorage.getItem('new_order_upload_modal') === '1'; }
    catch { return false; }
  });
  const setUploadModalOpen = (v: boolean) => {
    setUploadModalOpenRaw(v);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        if (v) window.sessionStorage.setItem('new_order_upload_modal', '1');
        else   window.sessionStorage.removeItem('new_order_upload_modal');
      } catch {}
    }
  };
  // Track whether preview was opened from inside the upload modal so we can reopen it on close
  const [previewFromUpload, setPreviewFromUpload] = useState(false);

  // İmplant brand search dropdown
  const [implantBrandSearch, setImplantBrandSearch] = useState('');
  const [implantBrandDropOpen, setImplantBrandDropOpen] = useState(false);
  const [implantDropPos, setImplantDropPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const implantInputRef = useRef<View>(null);

  const measureImplantInput = () => {
    if (Platform.OS !== 'web' || !implantInputRef.current) return;
    try {
      // @ts-ignore
      const rect = (implantInputRef.current as any).getBoundingClientRect?.();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow >= 200) {
        setImplantDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      } else {
        setImplantDropPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width });
      }
    } catch {}
  };

  const openPreviewFromUpload = (file: AttachedFile) => {
    setUploadModalOpen(false);
    setPreviewFromUpload(true);
    // Small delay so upload modal finishes closing before preview opens
    setTimeout(() => openFilePreview(file), 150);
  };

  const closePreview = () => {
    setPreviewFile(null);
    if (previewFromUpload) {
      setPreviewFromUpload(false);
      setTimeout(() => setUploadModalOpen(true), 150);
    }
  };

  const openFilePicker = async (scope: 'case' | 'tooth', tooth?: number) => {
    // ── Native (iOS / Android) — expo-document-picker ──
    if (Platform.OS !== 'web') {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          multiple: true,
          copyToCacheDirectory: true,
          // Geniş tip: STL/PLY/PDF/JPG/PNG/HEIC/WEBP + tarama-kompatible
          type: ['*/*'],
        });
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        const newFiles: AttachedFile[] = result.assets.map((asset, i) => ({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
          name: asset.name ?? `file-${i}`,
          uri: asset.uri,
          kind: resolveFileKind(asset.name ?? ''),
          size: asset.size ?? 0,
          scope,
          tooth: scope === 'tooth' ? tooth : undefined,
        }));
        setForm(f => ({ ...f, attachments: [...f.attachments, ...newFiles] }));
      } catch (err: any) {
        console.warn('[file-picker] iOS/Android pick failed:', err?.message ?? err);
        try { toast.error('Dosya seçimi başarısız oldu'); } catch {}
      }
      return;
    }

    // ── Web — <input type="file"> ──
    // @ts-ignore — document is available on web
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.stl,.ply,.pdf,image/*,.jpg,.jpeg,.png,.heic,.webp';
    input.onchange = (e: any) => {
      const files: FileList = e.target.files;
      if (!files || files.length === 0) return;
      const newFiles: AttachedFile[] = Array.from(files as any).map((file: any, i: number) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        // @ts-ignore
        uri: URL.createObjectURL(file),
        kind: resolveFileKind(file.name),
        size: file.size,
        scope,
        tooth: scope === 'tooth' ? tooth : undefined,
      }));
      setForm(f => ({ ...f, attachments: [...f.attachments, ...newFiles] }));
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  // ── Picker helper: aynı slota BİRDEN ÇOK dosya eklenebilir (append) ──
  // İsim `${label} · ${orijinalAd}.${ext}` — slot kimliği label prefix'inde
  // korunur (startsWith(label) gruplaması her yerde çalışmaya devam eder),
  // dosya benzersizliği orijinal addan gelir.
  const slotFileName = (label: string, origName: string, ext: string) => {
    const base = (origName.replace(/\.[^.]+$/, '') || 'dosya').slice(0, 48);
    return `${label} · ${base}.${ext}`;
  };
  const addAttachmentAndUpload = (label: string, file: File, kind: FileKind) => {
    const ext = file.name.split('.').pop() ?? 'bin';
    const newFile: AttachedFile = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: slotFileName(label, file.name, ext),
      // @ts-ignore
      uri: URL.createObjectURL(file),
      kind,
      size: file.size,
      scope: 'case',
      upload_status: 'pending',
      upload_progress: 0,
    };
    setForm(f => ({ ...f, attachments: [...f.attachments, newFile] }));
    // Erken upload
    void uploadAttachmentToDraft(newFile, file);
  };

  // Native (iOS / Android) — DocumentPicker asset'inden Blob'a çevirip
  // addAttachmentAndUpload mantığını uygular.
  const addAttachmentAndUploadFromUri = async (
    label: string,
    asset: { uri: string; name: string; size?: number | null; mimeType?: string | null },
    kind: FileKind
  ) => {
    const ext = (asset.name.split('.').pop() ?? 'bin').toLowerCase();
    const newFile: AttachedFile = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: slotFileName(label, asset.name, ext),
      uri: asset.uri,
      kind,
      size: asset.size ?? 0,
      scope: 'case',
      upload_status: 'pending',
      upload_progress: 0,
    };
    setForm(f => ({ ...f, attachments: [...f.attachments, newFile] }));
    // uri → Blob, sonra existing uploadAttachmentToDraft
    try {
      const res = await fetch(asset.uri);
      const blob = await res.blob();
      void uploadAttachmentToDraft(newFile, blob);
    } catch (err: any) {
      console.warn('[file-picker] native blob fetch failed:', err?.message ?? err);
      try { toast.error('Dosya yüklenemedi'); } catch {}
    }
  };

  // ── Specific photo picker (ekartörlü / gülüş) ─────────────────────────────
  const openSpecificPhotoPicker = async (photoLabel: string) => {
    if (Platform.OS !== 'web') {
      console.log('[photo-picker] tapped, label=', photoLabel, 'DocumentPicker=', typeof DocumentPicker, 'getDocumentAsync=', typeof DocumentPicker?.getDocumentAsync);
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'image/*',
          multiple: true,
          copyToCacheDirectory: true,
        });
        console.log('[photo-picker] result=', JSON.stringify(result).slice(0, 200));
        if (result.canceled || !result.assets?.length) return;
        for (const asset of result.assets) await addAttachmentAndUploadFromUri(photoLabel, asset, 'photo');
      } catch (err: any) {
        console.warn('[photo-picker] iOS fail:', err?.message ?? err, err);
        try { toast.error('Foto seçimi başarısız: ' + (err?.message ?? '')); } catch {}
      }
      return;
    }
    // @ts-ignore
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,.jpg,.jpeg,.png,.heic,.webp';
    input.onchange = (e: any) => {
      const files: FileList = e.target.files;
      if (!files || files.length === 0) return;
      Array.from(files as any).forEach((file: any) => addAttachmentAndUpload(photoLabel, file, 'photo'));
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  // ── Specific scan picker (kesim öncesi / alt çene / üst çene / ek tarama) ──
  const openSpecificScanPicker = async (scanLabel: string) => {
    if (Platform.OS !== 'web') {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;
        for (const asset of result.assets) {
          const ext = asset.name.split('.').pop()?.toLowerCase() ?? 'stl';
          const kind: FileKind = ext === 'ply' ? 'ply' : 'stl';
          await addAttachmentAndUploadFromUri(scanLabel, asset, kind);
        }
      } catch (err: any) {
        console.warn('[scan-picker] iOS fail:', err?.message ?? err);
        try { toast.error('Tarama seçimi başarısız'); } catch {}
      }
      return;
    }
    // @ts-ignore
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.stl,.ply,.obj,.dcm,.zip';
    input.onchange = (e: any) => {
      const files: FileList = e.target.files;
      if (!files || files.length === 0) return;
      Array.from(files as any).forEach((file: any) => {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'stl';
        const kind: FileKind = ext === 'ply' ? 'ply' : 'stl';
        addAttachmentAndUpload(scanLabel, file, kind);
      });
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  // ── Video picker (gülüş videosu) ──────────────────────────────────────────
  const openSpecificVideoPicker = async (videoLabel: string) => {
    if (Platform.OS !== 'web') {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'video/*',
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;
        for (const asset of result.assets) await addAttachmentAndUploadFromUri(videoLabel, asset, 'video');
      } catch (err: any) {
        console.warn('[video-picker] iOS fail:', err?.message ?? err);
        try { toast.error('Video seçimi başarısız'); } catch {}
      }
      return;
    }
    // @ts-ignore
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*,.mp4,.mov,.avi,.webm';
    input.onchange = (e: any) => {
      const files: FileList = e.target.files;
      if (!files || files.length === 0) return;
      Array.from(files as any).forEach((file: any) => addAttachmentAndUpload(videoLabel, file, 'video'));
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  const removeAttachment = (id: string) => {
    const target = form.attachments.find(a => a.id === id);
    // Düzenlemede DB'de kayıtlı bir ek ise depodan HEMEN silme — önce
    // work_order_photos satırı gitmeli, yoksa kırık kayıt kalır. Kaydet'te silinir.
    if (id in existingPhotosRef.current) {
      removedPhotosRef.current.push({ id, storage_path: existingPhotosRef.current[id] ?? '' });
      delete existingPhotosRef.current[id];
      setForm(f => ({ ...f, attachments: f.attachments.filter(a => a.id !== id) }));
      return;
    }
    // Drafts'a yüklenmiş dosyayı silmeye çalış (fire & forget)
    if (target?.storage_path) {
      void supabase.storage.from('work-order-photos').remove([target.storage_path]);
    }
    setForm(f => ({ ...f, attachments: f.attachments.filter(a => a.id !== id) }));
  };

  // ── Erken upload: pick sonrası drafts/ path'ine yükler ────────────────
  // RLS storage policy "authenticated upload" allow ediyor. Submit'te
  // work_order_photos row insert'i yapılırken bu storage_path kullanılır
  // (re-upload yok).
  const uploadAttachmentToDraft = React.useCallback(async (att: AttachedFile, blob: Blob) => {
    if (!profile?.id) return;
    const safeName = att.name.replace(/[^\w.-]+/g, '_').slice(0, 80);
    const path = `drafts/${profile.id}/${Date.now()}-${att.id}-${safeName}`;
    const contentType = blob.type || 'application/octet-stream';

    // Mark uploading
    setForm(f => ({
      ...f,
      attachments: f.attachments.map(a => a.id === att.id
        ? { ...a, upload_status: 'uploading', upload_progress: 0 } : a),
    }));

    let errMsg: string | null = null;
    if (Platform.OS === 'web' && typeof XMLHttpRequest !== 'undefined') {
      errMsg = await uploadWithProgress({
        bucket: 'work-order-photos',
        file: blob,
        path,
        contentType,
        onProgress: (pct) => setForm(f => ({
          ...f,
          attachments: f.attachments.map(a => a.id === att.id
            ? { ...a, upload_progress: pct } : a),
        })),
      });
    } else {
      const { error } = await supabase.storage
        .from('work-order-photos')
        .upload(path, blob, { contentType, upsert: false });
      errMsg = error?.message ?? null;
    }

    if (errMsg) {
      setForm(f => ({
        ...f,
        attachments: f.attachments.map(a => a.id === att.id
          ? { ...a, upload_status: 'error', upload_error: errMsg ?? 'yükleme hatası' } : a),
      }));
    } else {
      setForm(f => ({
        ...f,
        attachments: f.attachments.map(a => a.id === att.id
          ? { ...a, upload_status: 'done', upload_progress: 100, storage_path: path } : a),
      }));

      // STL/PLY/OBJ için küçük resim — arka planda, tarayıcı boştayken.
      // Dosya listesi 16–29 MB'lık mesh'i indirmeden önizleme gösterebilsin diye.
      // Üretilemezse (çok büyük / desteklenmeyen) sessizce atlanır; o dosya
      // küçük resmini ilk kez 3D görüntüleyicide açılınca alır.
      if (Platform.OS === 'web' && /\.(stl|ply|obj)$/i.test(att.name)) {
        void (async () => {
          try {
            const [{ generateMeshThumbWhenIdle }, { saveMeshThumb }] = await Promise.all([
              import('../../viewer-3d/lib/offscreenThumb'),
              import('../../../lib/photos'),
            ]);
            // Yerel object URL kullanılıyor — dosya zaten bellekte, tekrar indirilmiyor.
            generateMeshThumbWhenIdle(att.uri, att.name, (dataUrl) => {
              void saveMeshThumb(path, dataUrl);
            });
          } catch { /* küçük resim bir kolaylık, akışı etkilemez */ }
        })();
      }
    }
  }, [profile?.id]);

  // ── PDF picker (Reçete, Referans Fotoğraf vb.) ────────────────────────
  const openSpecificPdfPicker = async (label: string) => {
    // Reçete = PDF; Referans Fotoğraf = image; type'ı akıllı seç
    const isPhoto = /fotoğraf|foto|resim|referans/i.test(label);
    if (Platform.OS !== 'web') {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: isPhoto ? 'image/*' : 'application/pdf',
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;
        for (const asset of result.assets) await addAttachmentAndUploadFromUri(label, asset, isPhoto ? 'photo' : 'pdf');
      } catch (err: any) {
        console.warn('[pdf-picker] iOS fail:', err?.message ?? err);
        try { toast.error('Dosya seçimi başarısız'); } catch {}
      }
      return;
    }
    // @ts-ignore
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = isPhoto
      ? 'image/*,.jpg,.jpeg,.png,.heic,.webp'
      : 'application/pdf,.pdf';
    input.onchange = (e: any) => {
      const files: FileList = e.target.files;
      if (!files || files.length === 0) return;
      Array.from(files as any).forEach((file: any) => addAttachmentAndUpload(label, file, isPhoto ? 'photo' : 'pdf'));
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  // ── ZIP / arşiv picker — tarayıcıdan çıkan sıkıştırılmış tarama arşivi ──────
  // Çoğu hekim ağız-içi tarayıcının ürettiği ZIP'i (birden çok STL/PLY + meta)
  // tek dosya olarak yüklemek istiyor. kind='other' → 3D olarak açılmaz, dosya
  // olarak saklanır; lab indirir/açar.
  const openSpecificZipPicker = async (label: string) => {
    if (Platform.OS !== 'web') {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;
        for (const asset of result.assets) await addAttachmentAndUploadFromUri(label, asset, 'other');
      } catch (err: any) {
        console.warn('[zip-picker] iOS fail:', err?.message ?? err);
        try { toast.error('Arşiv seçimi başarısız'); } catch {}
      }
      return;
    }
    // @ts-ignore
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.zip,.rar,.7z,application/zip,application/x-zip-compressed,application/x-rar-compressed,application/x-7z-compressed';
    input.onchange = (e: any) => {
      const files: FileList = e.target.files;
      if (!files || files.length === 0) return;
      Array.from(files as any).forEach((file: any) => addAttachmentAndUpload(label, file, 'other'));
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  // Apply patch to current edit target.
  //   • İkinci işlem modu (secondaryOpUids[] dolu) → sadece o uid'lere patch
  //   • Normal: seçili + henüz confirmed olmayan tüm dişlere uygula (grup edit)
  const updateToothOp = (patch: Partial<Omit<ToothOp, 'tooth'>>) => {
    setForm(f => ({
      ...f,
      tooth_ops: f.tooth_ops.map(o => {
        if (secondaryOpUids.length > 0) {
          return o.__uid && secondaryOpUids.includes(o.__uid) ? { ...o, ...patch } : o;
        }
        return selectedTeeth.includes(o.tooth) && !confirmedTeeth.includes(o.tooth)
          ? { ...o, ...patch } : o;
      }),
    }));
  };

  const updateOneTooth = (tooth: number, patch: Partial<Omit<ToothOp, 'tooth'>>) =>
    setForm(f => ({ ...f, tooth_ops: f.tooth_ops.map(o => o.tooth === tooth ? { ...o, ...patch } : o) }));

  const handleNext = () => {
    if (!isStepValid(step as Step)) {
      setStepAttempted(p => ({ ...p, [step]: true }));
      return;
    }
    goToStep((step < 4 ? (step + 1) as Step : step));
  };

  // ── DÜZENLEME: ekleri siparişe persist et ────────────────────────────────
  // Yeni-sipariş akışıyla aynı mantık: pick anında drafts/'a yüklenmiş dosyalar
  // için re-upload yok, sadece work_order_photos satırı açılır (RLS
  // wop_select_drafts_via_order o satır üzerinden drafts yolunu okunur kılar).
  // Henüz yüklenmemiş dosya varsa orders/<id>/ altına yüklenir.
  const persistEditAttachments = async (orderId: string, canDelete: boolean) => {
    let added = 0, removed = 0, failed = 0;

    // RLS: lab kullanıcısında photos.lab_id = get_my_lab_id() olmalı; hekimin
    // profile.lab_id null olabildiği için siparişten okuyoruz.
    let labId: string | null = (profile as any)?.lab_id ?? null;
    try {
      const { data: wo } = await supabase.from('work_orders').select('lab_id').eq('id', orderId).maybeSingle();
      if ((wo as any)?.lab_id) labId = (wo as any).lab_id;
    } catch {}

    for (const a of form.attachments) {
      if (a.id in existingPhotosRef.current) continue;   // zaten DB'de
      try {
        let storagePath = (a.storage_path && a.upload_status === 'done') ? a.storage_path : '';
        if (!storagePath) {
          if (!a.uri) { failed++; continue; }
          const resp = await fetch(a.uri);
          const blob = await resp.blob();
          const safeName = a.name.replace(/[^\w.-]+/g, '_').slice(0, 80);
          // 'orders/' öneki ŞART — storage RLS yalnız orders/<work_order_id>/... açar.
          storagePath = `orders/${orderId}/${Date.now()}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from('work-order-photos')
            .upload(storagePath, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
          if (upErr) {
            failed++;
            console.error('[edit-attachments] storage upload error', a.name, upErr.message);
            continue;
          }
        }

        // .select() YOK — RETURNING, SELECT politikasına tabi olurdu; satır
        // yazılmışken hata sayılmasın diye yalın insert.
        const { error: dbErr } = await supabase
          .from('work_order_photos')
          .insert({
            work_order_id: orderId,
            storage_path:  storagePath,
            uploaded_by:   profile?.id,
            lab_id:        labId,
            caption:       a.name,
          });

        if (dbErr) {
          failed++;
          console.error('[edit-attachments] db insert error', a.name, dbErr.message);
          continue;
        }
        // Tekrar kaydette çift insert olmasın
        existingPhotosRef.current[a.id] = storagePath;
        added++;
      } catch (e: any) {
        failed++;
        console.error('[edit-attachments] unexpected error', a.name, e?.message);
      }
    }

    // Kaldırılan mevcut ekler — RLS'te delete yalnız lab/admin tarafına açık.
    // Klinik/hekim kaldırırsa dosya siparişte kalır, kullanıcıya söylenir.
    const pendingRemovals = removedPhotosRef.current;
    let keptOnServer = 0;
    if (canDelete) {
      for (const r of pendingRemovals) {
        const { error } = await supabase.from('work_order_photos').delete().eq('id', r.id);
        if (error) { failed++; console.error('[edit-attachments] delete error', r.id, error.message); continue; }
        if (r.storage_path) void supabase.storage.from('work-order-photos').remove([r.storage_path]);
        removed++;
      }
    } else {
      keptOnServer = pendingRemovals.length;
    }
    removedPhotosRef.current = [];

    return { added, removed, failed, keptOnServer };
  };

  // ── DÜZENLEME kaydet — yeni oluşturmaz, mevcut siparişi günceller ──
  // Kalemler yeni-sipariş ile AYNI kodlamayla üretilir (opGroupMap + notes: "Marka:…·Renk:…")
  // ki tekrar düzenlemede prefill parse'ı bozulmasın. Ekler/ses/sohbet düzenlemede korunur
  // (bu akış yalnız hasta + iş kalemleri + vaka alanlarını günceller).
  const handleSaveEdit = async () => {
    if (!editOrderId || loading) return;
    setSubmitError('');

    const toothNumbers = Array.from(new Set(form.tooth_ops.map(o => o.tooth)));
    const workType =
      Array.from(new Set(form.tooth_ops.map(o => o.work_type).filter(Boolean))).join(', ') ||
      (form.pending_items.length > 0 ? Array.from(new Set(form.pending_items.map(i => i.name).filter(Boolean))).join(', ') : 'Belirtilmedi');
    const shade = form.tooth_ops.find(o => o.shade)?.shade || null;

    // Kalemler — diş-işlemi grupları (yeni-sipariş ile birebir kodlama) + serbest servis kalemleri
    const items: ClientOrderEditItem[] = [];
    {
      const opGroupMap = new Map<string, { ops: ToothOp[]; teeth: number[]; name: string; price: number }>();
      form.tooth_ops.forEach(o => {
        if (!o.work_type) return;
        const k = [o.work_type, o.shade, o.material, o.implant_system, o.implant_type, o.abutment, o.screw].join('||');
        if (!opGroupMap.has(k)) opGroupMap.set(k, { ops: [], teeth: [], name: o.work_type, price: o.price || 0 });
        const g = opGroupMap.get(k)!;
        g.ops.push(o); g.teeth.push(o.tooth);
      });
      for (const g of opGroupMap.values()) {
        const teethUnique = Array.from(new Set(g.teeth)).sort((a, b) => a - b);
        const rep = g.ops[0];
        const noteParts: string[] = [];
        if (rep.implant_system) noteParts.push(`Marka: ${rep.implant_system}`);
        if (rep.implant_type)   noteParts.push(`Tür: ${rep.implant_type}`);
        if (rep.abutment)       noteParts.push(`Abutment: ${rep.abutment}`);
        if (rep.screw)          noteParts.push(`Vida: ${rep.screw}`);
        if (rep.material)       noteParts.push(`Materyal: ${rep.material}`);
        if (rep.shade)          noteParts.push(`Renk: ${rep.shade}`);
        items.push({
          name: g.name,
          price: g.price,
          quantity: priceUnitQty(rep.price_unit, teethUnique),
          tooth_numbers: teethUnique,
          notes: noteParts.length ? noteParts.join(' · ') : null,
        });
      }
      form.pending_items.forEach((it: any) => {
        if (!it?.name) return;
        items.push({ name: it.name, price: Number(it.price) || 0, quantity: Number(it.quantity) || 1, tooth_numbers: [], notes: null });
      });
    }
    if (items.length === 0) { setSubmitError('En az bir iş kalemi gerekli.'); return; }

    const cleanedFullName = [titleCaseTR(form.patient_first_name), titleCaseTR(form.patient_last_name)].filter(Boolean).join(' ');
    const fields: ClientOrderEditFields = {
      patient_name: cleanedFullName || null,
      patient_id: form.patient_id || null,
      patient_gender: form.patient_gender !== 'belirtilmedi' ? form.patient_gender : null,
      patient_dob: form.patient_dob ? form.patient_dob.toISOString().split('T')[0] : null,
      patient_nationality: form.patient_nationality || null,
      patient_country: form.patient_country || null,
      patient_city: form.patient_city || null,
      work_type: workType,
      shade,
      model_type: form.model_type || null,
      delivery_method: form.delivery_method || null,
      delivery_date: form.delivery_date instanceof Date ? form.delivery_date.toISOString().split('T')[0] : null,
      is_urgent: form.is_urgent,
      notes: form.notes || null,
      tooth_numbers: toothNumbers,
    };

    // Kaydet yolu: lab/admin panel → doğrudan admin güncelleme; hekim/klinik →
    // planlama öncesi doğrudan, sonrası değişiklik talebi (lab onayı).
    const adminEdit = resolvedPanel === 'lab' || resolvedPanel === 'admin' || resolvedPanel === 'station';
    const requestMode = !adminEdit && !isOrderPrePlanning(editOrderRow);

    setLoading(true);
    const { error } = adminEdit
      ? await updateOrderAdmin(editOrderId, fields, items)
      : requestMode
        ? await createChangeRequest(editOrderId, fields, items)
        : await updateOrderClient(editOrderId, fields, items);
    if (error) {
      setLoading(false);
      setSubmitError(`${requestMode ? 'Talep gönderilemedi' : 'Kaydedilemedi'}: ${(error as any).message ?? 'hata'}`);
      return;
    }

    // Ekler alan/kalem güncellemesinden bağımsız yürür: yeni eklenen dosyalar
    // siparişe bağlanır, kaldırılanlar (yalnız lab/admin) silinir. Değişiklik
    // talebi modunda da dosyalar doğrudan eklenir — lab'ın görmesi gerekir.
    const att = await persistEditAttachments(editOrderId, adminEdit);
    setLoading(false);
    if (att.failed > 0) toast.error(`${att.failed} dosya kaydedilemedi`);
    if (att.keptOnServer > 0) toast.info(`${att.keptOnServer} dosya yalnız lab tarafından silinebilir — siparişte kalacak.`);

    toast.success(
      requestMode
        ? 'Değişiklik talebin gönderildi — lab onayına düştü.'
        : att.added > 0 || att.removed > 0
          ? `Sipariş güncellendi ✓${att.added > 0 ? ` · ${att.added} dosya eklendi` : ''}${att.removed > 0 ? ` · ${att.removed} dosya silindi` : ''}`
          : 'Sipariş güncellendi ✓'
    );
    onSaved?.();
    onClose?.();
  };

  const handleSubmit = async () => {
    if (isEdit) return handleSaveEdit();
    if (!profile) return;
    setLoading(true);

    // tooth_numbers DB'de unique diş listesi — aynı diş için 2 op varsa dedup
    const toothNumbers = Array.from(new Set(form.tooth_ops.map(o => o.tooth)));
    // work_type — aynı iş tipi birden çok dişte tekrar etmesin (tekilleştir)
    const workType =
      Array.from(new Set(form.tooth_ops.map(o => o.work_type).filter(Boolean))).join(', ') ||
      (form.pending_items.length > 0 ? Array.from(new Set(form.pending_items.map(i => i.name).filter(Boolean))).join(', ') : 'Belirtilmedi');
    const shade = form.tooth_ops.find(o => o.shade)?.shade || undefined;
    // Auto-derive department from the dominant work type (not shown to user)
    const department = deriveDepartment(form.tooth_ops.find(o => o.work_type)?.work_type ?? '');

    // Hasta ad/soyad normalizasyonu — TR locale title case + boşluk temizliği
    const cleanedFirstName = titleCaseTR(form.patient_first_name);
    const cleanedLastName  = titleCaseTR(form.patient_last_name);
    const cleanedFullName  = [cleanedFirstName, cleanedLastName].filter(Boolean).join(' ');

    // ── doctor_id resolution ──
    // work_orders.doctor_id FK constraint sadece `doctors` tablosunu referans
    // ediyor. Eğer form.doctor_id bir profiles.id ise (doctor mode veya profile-
    // source doctor seçimi), doctors tablosundan ilgili row'u bul/oluştur.
    let resolvedDoctorId: string = form.doctor_id;
    try {
      const { data: existing } = await supabase
        .from('doctors')
        .select('id')
        .eq('id', form.doctor_id)
        .maybeSingle();
      if (!existing) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, full_name, phone, specialty, clinic_id')
          .eq('id', form.doctor_id)
          .maybeSingle();
        if (prof) {
          let match: any = null;
          if ((prof as any).full_name) {
            const q = supabase
              .from('doctors')
              .select('id')
              .ilike('full_name', (prof as any).full_name)
              .limit(1);
            if ((prof as any).clinic_id) {
              q.eq('clinic_id', (prof as any).clinic_id);
            }
            const { data } = await q.maybeSingle();
            match = data;
          }
          if (match?.id) {
            resolvedDoctorId = match.id;
          } else {
            const { data: created, error: cErr } = await supabase
              .from('doctors')
              .insert({
                clinic_id:  (prof as any).clinic_id ?? null,
                full_name:  (prof as any).full_name ?? 'Diş Hekimi',
                phone:      (prof as any).phone ?? null,
                specialty:  (prof as any).specialty ?? null,
                is_active:  true,
              })
              .select('id')
              .single();
            if (!cErr && created?.id) {
              resolvedDoctorId = (created as any).id;
            } else if (cErr) {
              setSubmitError(`Hekim kaydı oluşturulamadı: ${cErr.message}`);
              setLoading(false);
              return;
            }
          }
        }
      }
    } catch (resolveErr: any) {
      console.warn('[doctor_id resolve] failed:', resolveErr?.message);
    }

    // Çoklu-lab klinik: sipariş AKTİF lab'a gitsin. activeLab null ise (lab/admin
    // kullanıcısı veya tek-lab klinik) lab_id göndermeyiz → auto_set_lab_id trigger'ı
    // bugünkü gibi get_my_lab_id() ile doldurur (davranış değişmez).
    // NOT: work_orders'ta clinic_id kolonu YOK — sipariş↔klinik ilişkisi doctor_id +
    // clinic_name üzerinden; izolasyon lab_id ile. clinic_id GÖNDERİLMEZ (PostgREST
    // "clinic_id column not found" hatası verir).
    const _labExtra: any = {};
    const _al = getActiveLabId();
    if (_al) _labExtra.lab_id = _al;

    const { data: order, error } = await createWorkOrder({
      ..._labExtra,
      doctor_id: resolvedDoctorId,
      patient_name: cleanedFullName || undefined,
      patient_id: form.patient_id || undefined,
      patient_gender: form.patient_gender !== 'belirtilmedi' ? form.patient_gender : undefined,
      patient_dob: form.patient_dob ? form.patient_dob.toISOString().split('T')[0] : undefined,
      patient_phone: form.patient_phone || undefined,
      department,
      tags: form.tags.length > 0 ? form.tags : undefined,
      tooth_numbers: toothNumbers,
      work_type: workType,
      shade: shade,
      machine_type: form.machine_type,
      model_type: form.model_type || undefined,
      is_urgent: form.is_urgent || undefined,
      notes: form.notes || undefined,
      lab_notes: form.lab_notes || undefined,
      delivery_date: (form.delivery_date instanceof Date ? form.delivery_date : new Date(form.delivery_date as any)).toISOString().split('T')[0],
      delivery_method: (form.delivery_method || undefined) as 'kurye' | 'kargo' | 'elden' | undefined,
      measurement_type: form.measurement_type,
      doctor_approval_required: form.doctor_approval_required,
      patient_nationality: form.patient_nationality || undefined,
      patient_country: form.patient_country || undefined,
      patient_city: form.patient_city || undefined,
      lab_notes_visible: form.lab_notes_visible,
      scan_bodies_delivered: form.scan_bodies_delivered,
      continues_order_id: form.continues_order_id || undefined,
    });

    if (error || !order) {
      setSubmitError((error as any)?.message ?? 'İş emri oluşturulamadı.');
      setLoading(false);
      return;
    }

    // Manuel/kağıt sipariş onayından geldiyse: sipariş ARTIK oluştu → pending kaydı
    // 'approved' + work_order_id yap (bu ana kadar manuel kutuda kalmıştı, kaybolmadı).
    if (pendingPaperIdRef.current) {
      const pid = pendingPaperIdRef.current;
      pendingPaperIdRef.current = null;
      void supabase.from('pending_paper_orders').update({
        status: 'approved',
        work_order_id: order.id,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', pid);
    }

    // Create order items
    for (const item of form.pending_items) {
      await addOrderItem({
        work_order_id: order.id,
        service_id: item.service_id,
        name: item.name,
        price: item.price,
        currency: (item as any).currency,
        quantity: item.quantity,
      });
    }

    // Tooth-ops'tan da order_item üret — her grup (work_type + detay) için 1 item.
    // Bu sayede sipariş detayında diş şeması farklı işlemleri farklı renkle gösterir.
    {
      const opGroupMap = new Map<string, { ops: ToothOp[]; teeth: number[]; name: string; price: number; currency?: string }>();
      form.tooth_ops.forEach(o => {
        if (!o.work_type) return;
        const k = [o.work_type, o.shade, o.material, o.implant_system, o.implant_type, o.abutment, o.screw].join('||');
        if (!opGroupMap.has(k)) {
          // currency: fiyat listesinden gelen para birimi (ToothOp.currency) —
          // artık kaleme de yazılıyor, aksi halde ekranda ₺ varsayılıyordu.
          opGroupMap.set(k, { ops: [], teeth: [], name: o.work_type, price: o.price || 0, currency: o.currency });
        }
        const g = opGroupMap.get(k)!;
        g.ops.push(o);
        g.teeth.push(o.tooth);
      });
      for (const g of opGroupMap.values()) {
        const teethUnique = Array.from(new Set(g.teeth)).sort((a, b) => a - b);
        // İş detayı item.notes'a yazılır (implant marka/tür + abutment/vida +
        // materyal/renk) — lab sipariş detayında görür, DB şema değişikliği yok.
        const rep = g.ops[0];
        const noteParts: string[] = [];
        if (rep.implant_system) noteParts.push(`Marka: ${rep.implant_system}`);
        if (rep.implant_type)   noteParts.push(`Tür: ${rep.implant_type}`);
        if (rep.abutment)       noteParts.push(`Abutment: ${rep.abutment}`);
        if (rep.screw)          noteParts.push(`Vida: ${rep.screw}`);
        if (rep.material)       noteParts.push(`Materyal: ${rep.material}`);
        if (rep.shade)          noteParts.push(`Renk: ${rep.shade}`);
        await addOrderItem({
          work_order_id: order.id,
          name: g.name,
          price: g.price,
          currency: g.currency,
          // Çene/Vaka/Seans birimli hizmetlerde miktar diş sayısı DEĞİL, birim çarpanıdır
          // (gece plağı çene başına: üst çene 16 diş → 1 çene → qty 1).
          quantity: priceUnitQty(rep.price_unit, teethUnique),
          tooth_numbers: teethUnique,
          notes: noteParts.length ? noteParts.join(' · ') : undefined,
        });
      }
    }

    // ─── Form'daki dosyaları (form.attachments) supabase storage'a yükle ve
    // work_order_photos tablosuna persist et — labta StageFileUpload bunları
    // aynı tabloyu okuyarak gösterir.
    {
      // RLS: photos.lab_id work_order.lab_id ile eşleşmeli. Doctor'un profile.lab_id'i
      // null olabildiği için (external hekim) order'dan alıyoruz.
      const labId = (order as any)?.lab_id ?? (profile as any)?.lab_id ?? null;
      let attachFailures = 0;
      let attachSuccess  = 0;

      // Progress overlay'i SADECE pick anında upload edilmemiş dosyalar varsa göster.
      // Çoğu durumda tüm dosyalar zaten storage_path'a sahip → sadece DB insert
      // yapılır, modal hiç açılmaz.
      const pendingReupload = form.attachments.filter(a => !a.storage_path || a.upload_status !== 'done');
      if (pendingReupload.length > 0) {
        const initialStates: SubmitUploadState[] = pendingReupload.map(a => ({
          id: a.id, name: a.name, progress: 0, status: 'pending',
        }));
        setSubmitUploads(initialStates);
        setSubmitUploadsVisible(true);
      }

      for (const a of form.attachments) {
        // Mark as uploading
        setSubmitUploads(prev => prev.map(u => u.id === a.id ? { ...u, status: 'uploading' } : u));
        try {
          // Eğer dosya pick sırasında zaten yüklendiyse (storage_path var) →
          // re-upload yok, sadece work_order_photos row insert.
          let storagePath: string;
          if (a.storage_path && a.upload_status === 'done') {
            storagePath = a.storage_path;
            setSubmitUploads(prev => prev.map(u => u.id === a.id ? { ...u, progress: 100 } : u));
          } else {
            // Fallback: pick sırasında upload edilmemiş veya başarısız olmuş →
            // şimdi yükle. (örn. native ortamlar, ya da pick'ten önce upload bitmiş olmamış)
            const resp = await fetch(a.uri);
            const blob = await resp.blob();
            const safeName = a.name.replace(/[^\w.-]+/g, '_').slice(0, 80);
            // 'orders/' öneki ŞART — storage RLS (wop_select_orders) yalnız
            // orders/<work_order_id>/... yolunu lab tarafına açar. Öneksiz
            // '<order_id>/...' hiçbir politikayla eşleşmez → dosya erişilemez kalır.
            storagePath = `orders/${order.id}/${Date.now()}-${safeName}`;
            const contentType = blob.type || 'application/octet-stream';

            let upErrMsg: string | null = null;
            if (Platform.OS === 'web' && typeof XMLHttpRequest !== 'undefined') {
              upErrMsg = await uploadWithProgress({
                bucket:      'work-order-photos',
                file:        blob,
                path:        storagePath,
                contentType,
                onProgress:  (pct) => setSubmitUploads(prev => prev.map(u =>
                  u.id === a.id ? { ...u, progress: pct } : u
                )),
              });
            } else {
              const { error: upErr } = await supabase.storage
                .from('work-order-photos')
                .upload(storagePath, blob, { contentType, upsert: false });
              upErrMsg = upErr?.message ?? null;
              if (!upErrMsg) {
                setSubmitUploads(prev => prev.map(u => u.id === a.id ? { ...u, progress: 100 } : u));
              }
            }

            if (upErrMsg) {
              attachFailures++;
              setSubmitUploads(prev => prev.map(u => u.id === a.id
                ? { ...u, status: 'error', error: upErrMsg ?? 'yükleme hatası' } : u));
              console.error('[attachments] storage upload error', a.name, upErrMsg);
              continue;
            }
          }

          const { error: dbErr } = await supabase
            .from('work_order_photos')
            .insert({
              work_order_id: order.id,
              storage_path:  storagePath,
              uploaded_by:   profile.id,
              lab_id:        labId,
              caption:       a.name,
            });

          if (dbErr) {
            attachFailures++;
            setSubmitUploads(prev => prev.map(u => u.id === a.id
              ? { ...u, status: 'error', error: `kayıt: ${dbErr.message}` } : u));
            console.error('[attachments] db insert error', a.name, dbErr.message);
            // Sadece bu submit'te yüklenmişse temizle (drafts'a dokunma)
            if (!a.storage_path) {
              void supabase.storage.from('work-order-photos').remove([storagePath]);
            }
            continue;
          }

          attachSuccess++;
          setSubmitUploads(prev => prev.map(u => u.id === a.id
            ? { ...u, status: 'done', progress: 100 } : u));
        } catch (e: any) {
          attachFailures++;
          setSubmitUploads(prev => prev.map(u => u.id === a.id
            ? { ...u, status: 'error', error: e?.message ?? 'bilinmeyen hata' } : u));
          console.error('[attachments] unexpected error', a.name, e?.message);
        }
      }
      if (attachFailures > 0) {
        toast.error(`${attachFailures} dosya yüklenemedi (${attachSuccess} başarılı)`);
      }
    }

    // ─── WhatsApp botundan (adım-adım sipariş) toplanan medyayı dosyalara taşı ──
    // finalizeNewOrder bunları paper-orders/<lab>/wa-pending/... altında bırakıp pending
    // kaydın ocr_data.wa_media[]'ine yazmıştı; sipariş onaylanınca work-order-photos'a kopyalanır.
    const waMedia = pendingWaMediaRef.current;
    if (waMedia && waMedia.length && Platform.OS === 'web') {
      const waLabId = (order as any)?.lab_id ?? (profile as any)?.lab_id ?? null;
      let waMoved = 0;
      for (const wm of waMedia) {
        try {
          const srcPath = String(wm?.storage_path ?? wm?.path ?? '');
          if (!srcPath) continue;
          const { data: blob, error: dlErr } = await supabase.storage.from('paper-orders').download(srcPath);
          if (dlErr || !blob) { console.error('[wa-media] download fail', srcPath, dlErr?.message); continue; }
          const ext = String(wm?.ext || srcPath.split('.').pop() || 'jpg').slice(0, 8);
          const destPath = `orders/${order.id}/wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const contentType = (blob as any).type || wm?.mime || 'application/octet-stream';
          const { error: upErr } = await supabase.storage
            .from('work-order-photos')
            .upload(destPath, blob, { contentType, upsert: false });
          if (upErr) { console.error('[wa-media] upload fail', upErr.message); continue; }
          const { error: dbErr } = await supabase.from('work_order_photos').insert({
            work_order_id: order.id, storage_path: destPath, uploaded_by: profile.id,
            lab_id: waLabId, caption: wm?.caption || 'WhatsApp', external_source: 'whatsapp',
          });
          if (dbErr) {
            console.error('[wa-media] db insert fail', dbErr.message);
            void supabase.storage.from('work-order-photos').remove([destPath]);
            continue;
          }
          waMoved++;
        } catch (e: any) { console.error('[wa-media] transfer error', e?.message); }
      }
      pendingWaMediaRef.current = null;
      if (waMoved > 0) toast.success(`${waMoved} WhatsApp dosyası siparişe eklendi`);
    }

    // ─── Form'da yazılan chat mesajlarını order_messages tablosuna persist et ──
    // Yeni iş emrindeki sohbet, sipariş açıldıktan sonra detay sayfasında
    // ve mesaj kutusunda dahil olan herkesin panelinde görünmeli.
    console.log('[chat-persist] starting loop, total messages:', form.chat_messages.length, 'order:', order.id);
    let chatPersistFailures = 0;
    let chatPersistSuccess = 0;
    for (const m of form.chat_messages) {
      try {
        if (m.type === 'text') {
          if (m.text?.trim()) {
            const res = await sendMessage(order.id, profile.id, m.text.trim());
            if ((res as any)?.error) {
              chatPersistFailures++;
              console.error('[chat-persist] sendMessage TEXT error', { msgId: m.id, error: (res as any).error, hint: (res as any).error?.hint, code: (res as any).error?.code });
              toast.error(`Mesaj kaydedilemedi: ${(res as any).error?.message ?? 'bilinmeyen hata'}`);
            } else {
              chatPersistSuccess++;
              console.log('[chat-persist] sendMessage TEXT OK', m.id);
            }
          }
        } else if (m.uri) {
          // Voice / file / image — blob'a çevir, upload et, sonra send
          const response = await fetch(m.uri);
          const blob     = await response.blob();
          const ext      = m.type === 'image' ? 'jpg'
                         : m.type === 'voice' ? 'webm'
                         : 'bin';
          const fileName = m.fileName ?? `${m.type}-${m.id}.${ext}`;
          const upRes    = await uploadChatAttachment(blob, order.id, fileName);
          if (upRes.url) {
            const attachmentType: AttachmentType =
              m.type === 'image' ? 'image' :
              m.type === 'voice' ? 'audio' :
                                   'file';
            const res = await sendMessage(order.id, profile.id, m.text ?? '', {
              url: upRes.url,
              type: attachmentType,
              name: fileName,
              size: m.fileSize,
            });
            if ((res as any)?.error) {
              chatPersistFailures++;
              console.warn('[chat-persist] sendMessage with attach error', m.id, (res as any).error);
            }
          } else {
            chatPersistFailures++;
            console.warn('[chat-persist] upload failed', m.id, upRes.error);
          }
        }
      } catch (e) {
        chatPersistFailures++;
        console.warn('[chat-persist] failed for message', m.id, e);
      }
    }
    console.log('[chat-persist] done. success:', chatPersistSuccess, 'failures:', chatPersistFailures);
    if (chatPersistFailures > 0) {
      toast.error(`${chatPersistFailures} mesaj kaydedilemedi. Sipariş detayından tekrar yazabilirsiniz.`);
    } else if (chatPersistSuccess > 0) {
      toast.success(`${chatPersistSuccess} mesaj kaydedildi`);
    }

    setLoading(false);
    skipFirstDraftSaveRef.current = true;  // INITIAL_FORM set'i re-save tetiklemesin
    setForm(INITIAL_FORM);
    setLastSavedAt(null);
    if (Platform.OS === 'web') {
      try {
        sessionStorage.removeItem('new_order_step');
        sessionStorage.removeItem('new_order_form');
        sessionStorage.removeItem('new_order_draft_prompted');
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_TS_KEY);
        localStorage.removeItem(DRAFT_STEP_KEY);
      } catch {}
    } else {
      void AsyncStorage.multiRemove([DRAFT_KEY, DRAFT_TS_KEY, DRAFT_STEP_KEY, 'new_order_draft_prompted']);
    }
    setStep(1);

    // Başarı ekranını göster — close/navigate kullanıcı seçiminde tetiklenir
    const orderNumber = (order as any).order_number ?? '';
    setSubmittedOrder({
      id: order.id,
      orderNumber,
      patientName: cleanedFullName || 'Yeni vaka',
    });
  };

  // Doctor modunda klinik/hekim profile'den gelir
  // Clinic modunda klinik profile'den, hekim ise allDoctors'dan (kliniğin hekimleri)
  const selectedClinic = doctorMode || clinicMode
    ? (profile?.clinic_name ? { id: '', name: profile.clinic_name, phone: null, is_active: true } as any : undefined)
    : clinics.find((c) => c.id === form.clinic_id);
  const selectedDoctor = doctorMode
    ? (profile ? { id: profile.id, full_name: profile.full_name, phone: profile.phone ?? null, clinic_id: '', clinic: profile.clinic_name ? { name: profile.clinic_name } : undefined } as any : undefined)
    : allDoctors.find((d) => d.id === form.doctor_id);

  // QR — submit sonrası create_qr_link RPC ile üretilen kısa URL.
  // `https://www.nexadent.net/c/X4A92` (6-char Crockford) → server resolve →
  // gerçek vaka. Önceki uzun /order/{uuid} URL'i değil; tek tip kompakt.
  const qrValue = qrShortUrl ?? 'https://www.nexadent.net';

  // Submit sonrası kısa kod üret + state'e koy
  useEffect(() => {
    if (!submittedOrder?.id) return;
    let cancel = false;
    (async () => {
      const url = await createQrShortUrl('work_order', submittedOrder.id, {
        fallbackOrderNumber: submittedOrder.orderNumber,
      });
      if (!cancel) setQrShortUrl(url);
    })();
    return () => { cancel = true; };
  }, [submittedOrder?.id]);

  const printSummary = () => {
    if (Platform.OS !== 'web') return;

    // QR SVG from rendered component
    const qrSvgHtml = (document.getElementById('dental-qr-container') as HTMLElement | null)
      ?.querySelector('svg')?.outerHTML ?? '';

    // ── Dental arch SVG — same tooth paths as Step 3 picker ─────────────────
    const ops = [...form.tooth_ops].sort((a, b) => a.tooth - b.tooth);
    const selNums = ops.map(o => o.tooth);
    const ALL_FDI = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,
                     48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
    const VBX = -320, VBY = 200, VBW = 3720, VBH = 4380;
    const SVG_W = 260;
    const SVG_H = Math.round(SVG_W * VBH / VBW);

    const toothEls = ALL_FDI.map(fdi => {
      const paths = TOOTH_PATHS[fdi];
      const pos   = TOOTH_LABEL_POS[fdi];
      if (!paths || !pos) return '';
      const isSel  = selNums.includes(fdi);
      const fill   = isSel ? '#1E293B' : '#F8FAFC';
      const stroke = isSel ? '#0F172A' : '#CBD5E1';
      const txtCol = isSel ? '#FFFFFF' : '#94A3B8';
      const detail = paths.slice(1).map(d =>
        `<path d="${d}" fill="none" stroke="${isSel ? 'rgba(255,255,255,0.35)' : '#CBD5E1'}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`
      ).join('');
      return `<g>
        <path d="${paths[0]}" fill="${fill}" stroke="${stroke}" stroke-width="20" stroke-linejoin="round" stroke-linecap="round"/>
        ${detail}
        <text x="${pos[0]}" y="${pos[1]}" font-size="130" font-weight="700" fill="${txtCol}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">${fdi}</text>
      </g>`;
    }).join('');

    const archSVG = `<svg viewBox="${VBX} ${VBY} ${VBW} ${VBH}" width="${SVG_W}" height="${SVG_H}" style="display:block;">
      ${toothEls}
    </svg>`;

    // ── Teeth list HTML ───────────────────────────────────────────────────────
    const teethListHtml = ops.length > 0 ? ops.map(op => {
      const det = [op.work_type, op.shade, op.material, op.implant_system, op.implant_type, op.abutment, op.screw].filter(Boolean).join(' · ') || '—';
      return `<div class="ti">
        <b class="tn">Diş ${op.tooth}:</b>
        <span class="td">${det}</span>
        <span class="tq">⊞</span>
      </div>`;
    }).join('') : '<div class="ti"><span class="td">—</span></div>';

    // ── Icon helpers ──────────────────────────────────────────────────────────
    const ico = (path: string) =>
      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    const icoClinic = `<svg width="15" height="15" viewBox="0 0 48 48"><path d="M28.869,11.067H26.412V8.61a.75.75,0,0,0-.75-.75H22.338a.75.75,0,0,0-.75.75v2.457H19.131a.75.75,0,0,0-.75.75v3.324a.75.75,0,0,0,.75.75h2.457v2.458a.75.75,0,0,0,.75.75h3.324a.75.75,0,0,0,.75-.75V15.891h2.457a.75.75,0,0,0,.75-.75V11.817A.75.75,0,0,0,28.869,11.067Z" fill="#666"/><path d="M47.25,12.729H33.358V6.12h2.363a.75.75,0,0,0,.75-.75V.75a.75.75,0,0,0-.75-.75H12.279a.75.75,0,0,0-.75.75V5.37a.75.75,0,0,0,.75.75h2.363v6.609H.75a.751.751,0,0,0-.75.743l-.031,3.39a.751.751,0,0,0,.75.757H14.642V47.25a.75.75,0,1,0,1.5,0V6.12h2.1a.75.75,0,0,0,0-1.5H13.029V1.5H34.971V4.62H20.959a.75.75,0,0,0,0,1.5h10.9V47.25a.75.75,0,0,0,1.5,0V17.619H47.25a.75.75,0,0,0,.75-.75v-3.39A.75.75,0,0,0,47.25,12.729Z" fill="#666"/></svg>`;
    const icoDoctor = ico('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M17 14v4M15 16h4"/>');
    const icoPerson = ico('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>');
    const icoMale   = ico('<circle cx="10" cy="14" r="5"/><path d="M14 10l5-5M19 5h-4M19 5v4"/>');
    const icoFemale = ico('<circle cx="12" cy="10" r="5"/><path d="M12 15v4M9 17h6"/>');
    const icoCal    = ico('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>');
    const icoPhone  = ico('<path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>');
    const genderIco = form.patient_gender === 'erkek' ? icoMale : icoFemale;

    const row = (icon: string, label: string, value: string) =>
      `<div class="cr"><div class="ci">${icon}</div><span class="cl">${label}</span><span class="cv">${value}</span></div>`;

    // ── Hekim talepleri (chat'ten + form.notes birleşik) ──────────────
    const chatTextMsgs = (form.chat_messages || [])
      .filter(m => m.type === 'text' && m.text && m.text.trim())
      .map(m => ({ text: m.text!.trim(), ts: m.ts }));
    const chatAttachMsgs = (form.chat_messages || [])
      .filter(m => m.type !== 'text')
      .map(m => ({ type: m.type, fileName: m.fileName, duration: m.duration, ts: m.ts }));

    const escapeHtml = (s: string) => s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const messagesHtml = chatTextMsgs.length > 0 || chatAttachMsgs.length > 0
      ? `<div class="card">
          <div class="ch">Hekim Talepleri · Mesajlar</div>
          <div class="msgList">
            ${chatTextMsgs.map(m => `
              <div class="msgItem">
                <span class="msgTs">${new Date(m.ts).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                <span class="msgBody">${escapeHtml(m.text).replace(/\n/g, '<br>')}</span>
              </div>
            `).join('')}
            ${chatAttachMsgs.map(m => `
              <div class="msgItem msgItemAttach">
                <span class="msgTs">${new Date(m.ts).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                <span class="msgBody">
                  <em>${m.type === 'voice' ? 'Ses kaydı' : m.type === 'image' ? 'Görüntü' : 'Dosya'}</em>
                  ${m.fileName ? ` — ${escapeHtml(m.fileName)}` : ''}
                  ${m.duration ? ` (${Math.round(m.duration / 1000)}s)` : ''}
                </span>
              </div>
            `).join('')}
          </div>
        </div>`
      : '';

    // ── Klinik & lab isimleri ───────────────────────────────────────────
    const clinicName = selectedClinic?.name ?? '—';
    const labName    = labInfo?.name ?? 'Laboratuvar';
    const labLogoOnly = labInfo?.sidebar_brand_mode === 'logo' && !!labInfo?.logo_url;
    const labPhone   = labInfo?.phone ?? '';
    const labAddress = labInfo?.address ?? '';

    // ── Derived data for sidebar cards ──
    const orderNoStr = submittedOrder?.orderNumber
      ?? `NXD-${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}-${String(Math.floor(Math.random()*9999)).padStart(4,'0')}`;
    const createdAtStr = new Date().toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const kaynakStr = labName ? labName : 'Nexadent Dijital Laboratuvarı';
    const tahminiTeslim = form.delivery_date ? form.delivery_date.toLocaleDateString(localeTag()) : '—';
    const teslimSekli = form.delivery_method === 'kurye' ? 'Kurye'
                      : form.delivery_method === 'kargo' ? 'Kargo'
                      : form.delivery_method === 'elden' ? 'Elden Teslim'
                      : 'Klinik Teslim';
    const oncelikLabel = form.is_urgent ? 'Acil' : 'Normal';

    // Materyaller (dedupe + adet) — önce o.material'lar, yoksa work_type fallback
    const matCounts = new Map<string, number>();
    ops.forEach(o => {
      const key = (o.material && o.material.trim()) ? o.material.trim() : null;
      if (key) matCounts.set(key, (matCounts.get(key) ?? 0) + 1);
    });
    // Hiç gerçek materyal yoksa work_type'lardan derle (her biri tek kez)
    if (matCounts.size === 0) {
      ops.forEach(o => {
        const wt = (o.work_type && o.work_type.trim()) ? o.work_type.trim() : null;
        if (wt) matCounts.set(wt, (matCounts.get(wt) ?? 0) + 1);
      });
    }
    const materyalList = Array.from(matCounts.entries()).map(([name, count]) =>
      count > 1 ? `${name} × ${count}` : name,
    );

    // Üretim yöntemi — material'a göre tahmin (basit heuristic)
    const uretimSet = new Set<string>();
    ops.forEach(o => {
      const m = (o.material || o.work_type || '').toLowerCase();
      if (m.includes('zirk') || m.includes('e.max') || m.includes('cad')) {
        uretimSet.add('CAD/CAM');
        uretimSet.add('Frezeleme');
      }
      if (m.includes('zirk') || m.includes('seramik')) uretimSet.add('Sinterleme');
      if (m.includes('metal')) { uretimSet.add('Döküm'); }
      if (m.includes('3d')) uretimSet.add('3D Baskı');
    });
    const uretimList = Array.from(uretimSet);
    if (uretimList.length === 0) uretimList.push('Manuel Üretim');

    // Aynı işlem değerlerine sahip dişleri grupla — A5'e sığsın diye kompakt
    const groupKeyOf = (o: ToothOp) => [
      o.work_type, o.shade, o.material, o.implant_system, o.implant_type, o.abutment, o.screw,
    ].join('||');
    const opGroupMap = new Map<string, { key: string; ops: ToothOp[]; teeth: number[] }>();
    ops.forEach(o => {
      const k = groupKeyOf(o);
      if (!opGroupMap.has(k)) opGroupMap.set(k, { key: k, ops: [], teeth: [] });
      const g = opGroupMap.get(k)!;
      g.ops.push(o);
      g.teeth.push(o.tooth);
    });
    const opGroups = Array.from(opGroupMap.values())
      .map(g => ({ ...g, teeth: Array.from(new Set(g.teeth)).sort((a, b) => a - b) }))
      .sort((a, b) => a.teeth[0] - b.teeth[0]);

    const formatTeethRangeHtml = (teeth: number[]): string => {
      if (teeth.length === 0) return '';
      if (teeth.length === 1) return String(teeth[0]);
      const parts: string[] = [];
      let start = teeth[0], prev = teeth[0];
      for (let i = 1; i <= teeth.length; i++) {
        const t = teeth[i];
        if (t !== prev + 1) {
          parts.push(start === prev ? String(start) : `${start}–${prev}`);
          start = t as number; prev = t as number;
        } else {
          prev = t as number;
        }
      }
      return parts.join(', ');
    };

    // İşlem & Açıklama table rows — gruplu
    const opTableRows = opGroups.length > 0 ? opGroups.map(g => {
      const op = g.ops[0];
      const det = [op.work_type, op.shade, op.material, op.implant_system, op.implant_type, op.abutment, op.screw]
        .filter(Boolean).join(' · ') || '—';
      const teethLabel = formatTeethRangeHtml(g.teeth);
      const count = g.ops.length;
      return `<div class="opRow">
        <div class="opNum">${escapeHtml(teethLabel)}</div>
        <div class="opText">
          ${escapeHtml(det)}
          ${count > 1 ? `<span class="opCount">${count} adet</span>` : ''}
        </div>
      </div>`;
    }).join('') : '<div class="opEmpty">Henüz işlem eklenmedi</div>';

    // Ek dosyalar
    const ekDosyalarHtml = form.attachments.length > 0
      ? form.attachments.map(a => `
          <div class="fileRow">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>${escapeHtml(a.name)}</span>
          </div>`).join('')
        + `<div class="fileTotal">Toplam ${form.attachments.length} dosya</div>`
      : '<div class="opEmpty">Dosya yok</div>';

    const toothLogoSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5.5c-1.5 0-2.5-1-4-1-2.5 0-4 1.5-4 4 0 4 2 12 4 12 1.5 0 1.5-4 4-4s2.5 4 4 4c2 0 4-8 4-12 0-2.5-1.5-4-4-4-1.5 0-2.5 1-4 1z"/></svg>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dijital Vaka Özeti</title>
<style>
@page{size:A5 portrait;margin:7mm 7mm}
*{box-sizing:border-box;margin:0;padding:0}
html,body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#0F172A;background:#fff;font-size:8.5px;line-height:1.35;-webkit-font-smoothing:antialiased}
.doc{max-width:134mm;margin:0 auto}

/* ── TOP HEADER: brand + QR ── */
.topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px}
.brand{display:flex;align-items:center;gap:7px}
.brand svg{width:24px;height:24px}
.brand img{width:30px!important;height:30px!important}
.brandName{font-size:13px;font-weight:800;letter-spacing:0.6px;color:#0F172A;line-height:1}
.brandSub{font-size:6.5px;font-weight:700;color:#64748B;letter-spacing:2.6px;margin-top:3px}
.qrBox{text-align:center;flex-shrink:0}
.qrBox svg{display:block;width:54px;height:54px;border:1px solid #E2E8F0;border-radius:5px;padding:3px;background:#fff;box-sizing:content-box}
.qrPlaceholder{width:54px;height:54px;background:#F1F5F9;border:1px dashed #CBD5E1;border-radius:5px}
.qrBox .qrLbl{margin-top:3px;font-size:6.5px;font-weight:800;color:#0F172A;letter-spacing:1px}
.qrBox .qrCap{display:none}

/* Eyebrow + title under topbar */
.hdrText{margin-bottom:8px}
.eb{font-size:7px;font-weight:700;color:#64748B;letter-spacing:1.3px;text-transform:uppercase}
.ttl{margin-top:2px;font-size:18px;font-weight:400;letter-spacing:-0.4px;color:#0F172A;line-height:1.05}

/* Meta row */
.metaRow{display:flex;gap:0;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;padding:5px 0;margin-bottom:8px}
.metaCell{flex:1;padding:0 7px;border-right:1px solid #F1F5F9;min-width:0}
.metaCell:last-child{border-right:none}
.metaCell:first-child{padding-left:0}
.ml{font-size:6.5px;font-weight:700;color:#64748B;letter-spacing:0.9px;text-transform:uppercase;margin-bottom:2px}
.mv{font-size:8.5px;font-weight:700;color:#0F172A;line-height:1.2;word-break:break-word}

/* ── CARDS ── */
.card{border:1px solid #E2E8F0;border-radius:6px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
.row{display:flex;gap:6px;margin-bottom:6px}
.col{flex:1;min-width:0;display:flex}
.col > .card{flex:1}
.ch{padding:6px 8px;font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0F172A;display:flex;align-items:center;gap:5px;border-bottom:1px solid #F1F5F9}
.ch svg{width:11px;height:11px;flex-shrink:0}
.chBadge{margin-left:4px;font-weight:600;color:#94A3B8;letter-spacing:0.4px;font-size:7px}
.cardBody{padding:3px 8px 8px}
.cr{display:flex;align-items:center;padding:3px 0;border-bottom:1px solid #F1F5F9;gap:6px;font-size:8.5px}
.cr:last-child{border-bottom:none}
.ci{width:11px;flex-shrink:0;color:#94A3B8}
.cl{color:#94A3B8;flex:1;font-size:7.5px}
.cv{font-weight:700;color:#0F172A;font-size:8.5px}

/* ── TEETH CARD ── */
.teethCard{margin-bottom:6px}
.teethBox{display:flex;gap:8px;padding:7px;align-items:flex-start}
.archCol{flex-shrink:0;width:88px}
.archCol svg{display:block;width:100%;height:auto}
.tableCol{flex:1;min-width:0}
.tHead{display:flex;align-items:center;gap:8px;padding:0 2px 4px;border-bottom:1px solid #E2E8F0;font-size:7px;font-weight:800;color:#64748B;letter-spacing:0.9px;text-transform:uppercase}
.tHead .h1{width:64px}
.tHead .h2{flex:1}
.opRow{display:flex;align-items:center;gap:8px;padding:4px 2px;border-bottom:1px solid #F1F5F9;font-size:8.5px}
.opRow:last-child{border-bottom:none}
.opNum{min-width:60px;max-width:90px;padding:3px 5px;border-radius:4px;background:#0F172A;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:8.5px;line-height:1.15;text-align:center;font-family:'Inter',-apple-system,monospace}
.opText{flex:1;color:#0F172A;font-weight:600;line-height:1.3}
.opCount{display:inline-block;margin-left:6px;padding:1px 5px;border-radius:9999px;background:#F1F5F9;color:#64748B;font-size:7px;font-weight:700;letter-spacing:0.3px;vertical-align:middle}
.opIco{flex-shrink:0}
.opEmpty{padding:9px;text-align:center;color:#94A3B8;font-size:7.5px;font-style:italic}

/* ── 4-COL INFO STRIP ── */
.row4{display:flex;gap:6px;margin-bottom:8px}
.row4 > .card{flex:1;min-width:0}
.kv{padding:7px}
.kv h{display:flex;align-items:center;gap:5px;font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0F172A;margin-bottom:6px}
.kv h svg{width:10px;height:10px}
/* Inline chip list — A5'te dikey değil, satır içi pill'ler */
.kvChips{display:flex;flex-wrap:wrap;gap:3px}
.kvChips .chip{display:inline-block;padding:1.5px 6px;border-radius:9999px;background:#F1F5F9;color:#0F172A;font-size:7.5px;font-weight:600;letter-spacing:0.1px;line-height:1.3;border:1px solid #E2E8F0}
.kv .deliveryGrid{display:flex;flex-direction:column;gap:4px;font-size:8px}
.kv .dRow{display:flex;justify-content:space-between;align-items:center;gap:6px}
.kv .dLbl{color:#94A3B8}
.kv .dVal{font-weight:700;color:#0F172A;text-align:right}
.kv .pill{display:inline-block;background:#DCFCE7;color:#166534;padding:1px 6px;border-radius:9999px;font-size:7px;font-weight:700;letter-spacing:0.2px}
.kv .pillUrgent{background:#FEE2E2;color:#991B1B}
.fileRow{display:flex;align-items:center;gap:4px;padding:2px 0;font-size:8px;color:#475569}
.fileRow svg{flex-shrink:0;width:9px;height:9px}
.fileTotal{margin-top:5px;padding-top:4px;border-top:1px solid #F1F5F9;font-size:7px;color:#94A3B8;font-weight:600}

/* ── NOTES / MESSAGES ── */
.notesBox{margin:6px 0;padding:6px 8px;background:#F8FAFC;border-radius:5px;font-size:8.5px;color:#0F172A;line-height:1.4}
.notesBox .nh{font-size:7px;font-weight:800;color:#64748B;letter-spacing:0.9px;text-transform:uppercase;margin-bottom:3px}
.msgList{margin:6px 0;display:flex;flex-direction:column}
.msgList .nh{font-size:7px;font-weight:800;color:#64748B;letter-spacing:0.9px;text-transform:uppercase;margin-bottom:4px}
.msgItem{display:flex;align-items:baseline;gap:6px;padding:3px 0;border-bottom:1px solid #F1F5F9;font-size:8.5px;line-height:1.35}
.msgItem:last-child{border-bottom:none}
.msgTs{flex-shrink:0;width:62px;font-size:7px;color:#94A3B8;font-weight:600;letter-spacing:0.2px;font-variant-numeric:tabular-nums}
.msgBody{flex:1;color:#0F172A}
.msgItemAttach .msgBody em{font-style:italic;color:#475569;font-weight:600;margin-right:2px}

/* ── SIGNATURE FOOTER ── */
.sigFooter{display:flex;gap:6px;margin-top:8px}
.sigItem{flex:1;border:1px solid #E2E8F0;border-radius:5px;padding:7px}
.sigHead{display:flex;align-items:center;gap:5px;margin-bottom:6px}
.sigHead svg{width:11px;height:11px;color:#0F172A}
.sigHead h{font-size:7.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0F172A}
.sigLine{height:1px;background:#0F172A;margin:10px 0 4px}
.sigDateLine{font-size:7.5px;color:#475569;text-align:right;font-weight:600}
.sigDateLine span{display:inline-block;border-bottom:1px solid #94A3B8;min-width:16px;padding:0 4px;margin:0 1px}

.brandFooter{margin-top:6px;padding-top:5px;border-top:1px solid #E2E8F0;display:flex;align-items:center;justify-content:center;gap:4px;font-size:7px;color:#94A3B8;letter-spacing:0.2px}
.brandFooter svg{width:9px;height:9px}
.brandFooter b{color:#0F172A;font-weight:700}

@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
</style></head><body>
<div class="doc">

  <div class="topbar">
    <div class="brand">
      ${labInfo?.logo_url
        ? `<img src="${escapeHtml(labInfo.logo_url)}" alt="${escapeHtml(labName)}" style="width:48px;height:48px;object-fit:contain;display:block" />`
        : toothLogoSvg}
      ${labLogoOnly ? '' : `<div>
        <div class="brandName">${escapeHtml((labName || 'NEXADENT').toUpperCase())}</div>
        <div class="brandSub">LABORATORY</div>
      </div>`}
    </div>
    <div class="qrBox">
      ${qrSvgHtml || '<div class="qrPlaceholder"></div>'}
      <div class="qrLbl">VAKA QR</div>
      <div class="qrCap">Tarayın ve vaka detaylarına ulaşın.</div>
    </div>
  </div>

  <div class="hdrText">
    <div class="eb">Dijital Vaka Özeti · Digital Case Summary</div>
    <div class="ttl">İş Emri${form.is_urgent ? ' <span style="font-size:11px;background:#DC2626;color:#fff;padding:3px 10px;border-radius:9999px;font-weight:700;letter-spacing:1px;vertical-align:middle;margin-left:8px">ACİL</span>' : ''}</div>
  </div>

  <div class="metaRow">
    <div class="metaCell"><div class="ml">İş Emri No</div><div class="mv">${escapeHtml(orderNoStr)}</div></div>
    <div class="metaCell"><div class="ml">Oluşturulma</div><div class="mv">${createdAtStr}</div></div>
    <div class="metaCell"><div class="ml">Kaynak</div><div class="mv">${escapeHtml(kaynakStr)}</div></div>
    <div class="metaCell"><div class="ml">Klinik</div><div class="mv">${escapeHtml(clinicName)}</div></div>
  </div>

  <div class="row">
    <div class="col">
      <div class="card">
        <div class="ch">${icoClinic} Klinik &amp; Hekim Bilgileri</div>
        <div class="cardBody">
          ${selectedClinic ? `<div class="cr">${icoClinic}<div class="cl">Klinik</div><div class="cv">${escapeHtml(selectedClinic.name)}</div></div>` : ''}
          ${selectedDoctor ? `<div class="cr">${icoDoctor}<div class="cl">Diş Hekimi</div><div class="cv">${escapeHtml(selectedDoctor.full_name)}</div></div>` : ''}
        </div>
      </div>
    </div>
    <div class="col">
      <div class="card">
        <div class="ch">${icoPerson} Hasta Bilgileri</div>
        <div class="cardBody">
          ${(form.patient_first_name || form.patient_last_name) ? `<div class="cr">${icoPerson}<div class="cl">Ad Soyad</div><div class="cv">${escapeHtml([form.patient_first_name, form.patient_last_name].filter(Boolean).join(' '))}</div></div>` : ''}
          ${form.patient_gender !== 'belirtilmedi' ? `<div class="cr">${genderIco}<div class="cl">Cinsiyet</div><div class="cv">${form.patient_gender === 'erkek' ? 'Erkek' : 'Kadın'}</div></div>` : ''}
          ${form.patient_dob ? `<div class="cr">${icoCal}<div class="cl">Doğum Tarihi</div><div class="cv">${form.patient_dob.toLocaleDateString(localeTag())}</div></div>` : ''}
          ${form.patient_phone ? `<div class="cr">${icoPhone}<div class="cl">Telefon</div><div class="cv">${escapeHtml(form.patient_phone)}</div></div>` : ''}
        </div>
      </div>
    </div>
  </div>

  ${ops.length > 0 ? `<div class="card teethCard">
    <div class="ch">${toothLogoSvg.replace('width="24"','width="14"').replace('height="24"','height="14"')} Dişler &amp; İşlemler <span class="chBadge">· ${ops.length} diş</span></div>
    <div class="teethBox">
      <div class="archCol">${archSVG}</div>
      <div class="tableCol">
        <div class="tHead"><div class="h1">Diş No</div><div class="h2">İşlem &amp; Açıklama</div></div>
        ${opTableRows}
      </div>
    </div>
  </div>` : ''}

  <div class="row4">
    <div class="card kv">
      <h><svg viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg> Materyal</h>
      ${materyalList.length > 0
        ? `<div class="kvChips">${materyalList.map(m => `<span class="chip">${escapeHtml(m)}</span>`).join('')}</div>`
        : '<div class="opEmpty">—</div>'}
    </div>
    <div class="card kv">
      <h><svg viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Üretim Yöntemi</h>
      <div class="kvChips">${uretimList.map(u => `<span class="chip">${escapeHtml(u)}</span>`).join('')}</div>
    </div>
    <div class="card kv">
      <h><svg viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Teslimat Bilgisi</h>
      <div class="deliveryGrid">
        <div class="dRow"><span class="dLbl">Tahmini Teslim</span><span class="dVal">${tahminiTeslim}</span></div>
        <div class="dRow"><span class="dLbl">Teslim Şekli</span><span class="dVal">${escapeHtml(teslimSekli)}</span></div>
        <div class="dRow"><span class="dLbl">Öncelik</span><span class="dVal"><span class="pill ${form.is_urgent ? 'pillUrgent' : ''}">${oncelikLabel}</span></span></div>
      </div>
    </div>
    <div class="card kv">
      <h><svg viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Ek Dosyalar</h>
      ${ekDosyalarHtml}
    </div>
  </div>

  ${form.notes ? `<div class="notesBox">
    <div class="nh">Hekim Talimatı</div>
    ${escapeHtml(form.notes).replace(/\n/g, '<br>')}
  </div>` : ''}

  ${chatTextMsgs.length > 0 || chatAttachMsgs.length > 0 ? `<div class="msgList">
    <div class="nh">Hekim Talepleri · Mesajlar</div>
    ${chatTextMsgs.map(m => `
      <div class="msgItem">
        <span class="msgTs">${new Date(m.ts).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
        <span class="msgBody">${escapeHtml(m.text).replace(/\n/g, '<br>')}</span>
      </div>`).join('')}
    ${chatAttachMsgs.map(m => `
      <div class="msgItem msgItemAttach">
        <span class="msgTs">${new Date(m.ts).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
        <span class="msgBody"><em>${m.type === 'voice' ? 'Ses kaydı' : m.type === 'image' ? 'Görüntü' : 'Dosya'}</em>${m.fileName ? ` — ${escapeHtml(m.fileName)}` : ''}${m.duration ? ` (${Math.round(m.duration / 1000)}s)` : ''}</span>
      </div>`).join('')}
  </div>` : ''}

  <div class="sigFooter">
    <div class="sigItem">
      <div class="sigHead">
        <svg viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
        <h>Hekim İmza</h>
      </div>
      <div class="sigLine"></div>
      <div class="sigDateLine">Tarih: <span>&nbsp;</span>/<span>&nbsp;</span>/<span>&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
    </div>
    <div class="sigItem">
      <div class="sigHead">
        <svg viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
        <h>Lab Teslim Alan</h>
      </div>
      <div class="sigLine"></div>
      <div class="sigDateLine">Tarih: <span>&nbsp;</span>/<span>&nbsp;</span>/<span>&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
    </div>
  </div>

  <div class="brandFooter">
    ${toothLogoSvg}
    <b>Siman</b> · Dijital İş Emri · QR kod ile vaka detaylarına ulaşın.
  </div>

</div>
</body></html>`;

    // Yeni tab yerine in-app modal'a yansıt — iframe srcDoc ile render edilir
    setPrintPreviewHtml(html);
  };

  const filteredServices = services.filter(
    (s) => !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );
  const servicesByCategory: Record<string, LabService[]> = {};
  filteredServices.forEach((s) => {
    const cat = s.category ?? 'Diğer';
    if (!servicesByCategory[cat]) servicesByCategory[cat] = [];
    servicesByCategory[cat].push(s);
  });

  if (dataLoading) return (
    <SafeAreaView edges={[]} style={[styles.safe, { backgroundColor: pageBg }]}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <TeethLoader size="lg" accentColor={P} />
        <Text style={{ fontSize: 13, color: '#6B6B6B', fontWeight: '500', letterSpacing: 0.2 }}>
          Form hazırlanıyor…
        </Text>
      </View>
    </SafeAreaView>
  );

  // Mobile uses the same web new-order module — fall through to the
  // existing form below. (B4 simplified flow disabled per user request.)

  return (
    <SafeAreaView edges={[]} style={[styles.safe, { backgroundColor: pageBg }]}>
      {/* ── Submit sonrası başarı ekranı ── */}
      {/* Submit-time upload progress overlay — her dosya için ayrı progress satırı */}
      <Modal
        visible={submitUploadsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { /* upload sırasında kapatma yok */ }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <View style={{
            width: 520, maxWidth: '100%', maxHeight: '90%',
            backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
          }}>
            <View style={{ paddingHorizontal: 22, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: P, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                Yükleniyor · {submitUploads.filter(u => u.status === 'done').length}/{submitUploads.length}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '600', color: '#0A0A0A', marginTop: 4 }}>
                Dosyalar yükleniyor
              </Text>
              <Text style={{ fontSize: 12, color: '#6B6B6B', marginTop: 4 }}>
                Sipariş kaydedildi, dosyalar arka planda yükleniyor — kapatmayın.
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 16, gap: 8 }} showsVerticalScrollIndicator={false}>
              {submitUploads.map(u => {
                const pct = u.progress ?? 0;
                const statusColor =
                  u.status === 'done'      ? '#2D9A6B' :
                  u.status === 'error'     ? '#9C2E2E' :
                  u.status === 'uploading' ? P :
                                             '#9A9A9A';
                return (
                  <View key={u.id} style={{
                    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                    backgroundColor: '#FBF9F4',
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
                    gap: 8,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor }} />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#0A0A0A' }} numberOfLines={1}>
                        {u.name}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor, minWidth: 56, textAlign: 'end' as any }}>
                        {u.status === 'done'  ? 'TAMAM' :
                         u.status === 'error' ? 'HATA'  :
                         u.status === 'pending' ? 'BEKLER' :
                         `%${pct}`}
                      </Text>
                    </View>
                    {/* Progress bar */}
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.06)' }}>
                      <View style={{
                        height: 4, borderRadius: 2,
                        width: `${u.status === 'error' ? 100 : pct}%` as any,
                        backgroundColor: statusColor,
                      }} />
                    </View>
                    {u.error ? (
                      <Text style={{ fontSize: 11, color: '#9C2E2E' }} numberOfLines={2}>{u.error}</Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            {/* Kapat butonu — sadece hepsi bittiyse */}
            {submitUploads.length > 0 && submitUploads.every(u => u.status === 'done' || u.status === 'error') && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', backgroundColor: '#FBF9F4', alignItems: 'flex-end' }}>
                <Pressable
                  onPress={() => { setSubmitUploadsVisible(false); setSubmitUploads([]); }}
                  style={{
                    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 9999,
                    backgroundColor: P,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Tamam</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Vaka Özeti Önizleme — in-app popup (iframe srcDoc) ── */}
      {Platform.OS === 'web' && printPreviewHtml && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setPrintPreviewHtml(null)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <View style={{
              width: 920, maxWidth: '100%', height: '90%' as any, maxHeight: '95%' as any,
              backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden',
              flexDirection: 'column',
              ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.25)' } as any : {}),
            }}>
              {/* Toolbar */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 18, paddingVertical: 12,
                borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)',
                backgroundColor: '#FAFAFA',
              }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P }} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A' }}>
                  Vaka Özeti Önizleme
                </Text>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => {
                    if (typeof document === 'undefined') return;
                    const iframe = document.getElementById('print-preview-iframe') as HTMLIFrameElement | null;
                    if (iframe?.contentWindow) {
                      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch {}
                    }
                  }}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9,
                    backgroundColor: hovered ? `${P}E6` : P,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } as any : {}),
                  })}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#FFFFFF' }}>🖨  Yazdır</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPrintPreviewHtml(null)}
                  style={({ hovered }: any) => ({
                    width: 32, height: 32, borderRadius: 8,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: hovered ? '#F1F5F9' : '#FFFFFF',
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } as any : {}),
                  })}
                >
                  <Text style={{ fontSize: 16, color: '#475569', fontWeight: '500' }}>×</Text>
                </Pressable>
              </View>
              {/* Iframe içeriği */}
              <View style={{ flex: 1, backgroundColor: '#F1F5F9' }}>
                {React.createElement('iframe' as any, {
                  id: 'print-preview-iframe',
                  srcDoc: printPreviewHtml,
                  style: { width: '100%', height: '100%', border: 'none', backgroundColor: '#FFFFFF' },
                  title: 'Vaka Özeti Önizleme',
                })}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {submittedOrder && (
        <NewOrderSuccess
          accent={P}
          orderNumber={submittedOrder.orderNumber}
          patientName={submittedOrder.patientName}
          panel={resolvedPanel}
          onNewOrder={() => {
            skipFirstDraftSaveRef.current = true;
            setForm(INITIAL_FORM);
            setLastSavedAt(null);
            if (Platform.OS === 'web') {
              try {
                sessionStorage.removeItem('new_order_step');
                sessionStorage.removeItem('new_order_form');
                localStorage.removeItem(DRAFT_KEY);
                localStorage.removeItem(DRAFT_TS_KEY);
                localStorage.removeItem(DRAFT_STEP_KEY);
              } catch {}
            } else {
              void AsyncStorage.multiRemove([DRAFT_KEY, DRAFT_TS_KEY, DRAFT_STEP_KEY]);
            }
            setStep(1);
            setSubmittedOrder(null);
          }}
          onViewOrder={() => {
            if (onClose) onClose();
            router.push(orderDetailPath(submittedOrder.id) as any);
          }}
          onClose={() => {
            if (onClose) onClose();
            else router.replace(orderListPath as any);
          }}
        />
      )}

      {/* ── Taslak seçim modalı: mevcut taslak varsa ilk açılışta sorar ── */}
      <Modal
        visible={draftPromptOpen}
        transparent
        animationType="fade"
        onRequestClose={handleContinueDraft}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.55)',
          alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <View style={{
            width: '100%', maxWidth: 440,
            backgroundColor: T.card, borderRadius: 16,
            padding: 24, gap: 16,
            borderWidth: 1, borderColor: T.hairline,
            ...(Platform.OS === 'web'
              ? ({ boxShadow: isDark ? '0 20px 60px rgba(0,0,0,0.6)' : '0 20px 60px rgba(15,23,42,0.25)' } as any)
              : { shadowColor: '#000', shadowOpacity: isDark ? 0.5 : 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: 20 }, elevation: 12 }),
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: P + '14',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <AppIcon name={'file-document-edit-outline' as any} size={18} color={P} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontFamily: F.bold, color: T.ink }}>
                  Kaydedilmiş taslak bulundu
                </Text>
                {draftSavedAtPrompt && (
                  <Text style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
                    Son kayıt · {draftSavedAtPrompt.toLocaleString('tr-TR')}
                  </Text>
                )}
              </View>
            </View>
            <Text style={{ fontSize: 13, color: T.ink2, lineHeight: 19 }}>
              Önceki iş emri taslağınızdan kaldığınız yerden devam etmek ister misiniz, yoksa yeni bir iş emri mi başlatmak istersiniz?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                onPress={handleStartNewOrder}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 10,
                  backgroundColor: T.cardSoft,
                  borderWidth: 1, borderColor: T.hairline,
                  alignItems: 'center',
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 13, fontFamily: F.semibold, color: T.ink2 }}>
                  Yeni iş emri
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleContinueDraft}
                style={{
                  flex: 1, paddingVertical: 12, borderRadius: 10,
                  backgroundColor: P,
                  alignItems: 'center',
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontSize: 13, fontFamily: F.semibold, color: '#FFFFFF' }}>
                  Taslaktan devam et
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <NOPageChrome
        step={step}
        title={isEdit ? 'Siparişi Düzenle' : theme.title}
        hekim={selectedDoctor?.full_name}
        hasta={form.patient_first_name ? `${form.patient_first_name} ${form.patient_last_name}`.trim() : undefined}
        toothCount={form.tooth_ops.length || undefined}
        onCancel={() => {
          // Modal olarak açıldıysa onClose'u çağır; route olarak açıldıysa geri
          if (onClose) { onClose(); return; }
          safeBack(orderListPath);
        }}
        // Step 1: yalnızca Mesaj + X. Step 2+: Upload butonu da görünür.
        onUpload={step >= 2 ? () => setUploadModalOpen(true) : undefined}
        // Sticky mesaj butonu — upload'ın solunda
        onChat={() => setChatModalVisible(true)}
        // Sticky çıktı al butonu — sadece step 4 + web'de (yazdırma yalnız web)
        onPrint={step === 4 && Platform.OS === 'web' ? printSummary : undefined}
        uploadCount={form.attachments.length}
        accent={P}
        bgColor={pageBg}
        chatRef={tourGuided ? tourRefChat : undefined}
        uploadRef={tourGuided ? tourRefFiles : undefined}
        onStepPress={(s) => goToStep(s as Step)}
        onBack={step > 1 ? () => goToStep((step - 1) as Step) : undefined}
        onNext={step < 4 ? handleNext : handleSubmit}
        nextLabel={step < 4 ? 'İleri' : (isEdit ? 'Kaydet' : (isDesktop ? theme.submitLabel : 'Gönder'))}
        actionPrimary={step === 4 ? 'success' : 'dark'}
        loading={loading || (isEdit && !editReady)}
        savedTime={isEdit ? undefined : (lastSavedAt ? fmtDraftTime(lastSavedAt) : undefined)}
        rightPanel={undefined}
      >

      {/* Step 1 — Clinic & Patient */}
      {step === 1 && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 96, flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>

          {/* OCR pre-fill banner (kağıt iş emri taraması) */}
          {ocrBanner && (
            <View style={{
              marginHorizontal: 24, marginTop: 16,
              padding: 14, borderRadius: 12,
              backgroundColor: 'rgba(37,99,235,0.06)',
              borderStartWidth: 3, borderStartColor: '#2563EB',
              flexDirection: 'row', alignItems: 'flex-start', gap: 10,
            }}>
              <AppIcon name={'camera-outline' as any} size={18} color="#2563EB" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB', letterSpacing: 0.4 }}>OCR · Otomatik Doldurma</Text>
                <Text style={{ fontSize: 12, color: '#1F2937', marginTop: 2, lineHeight: 17 }}>{ocrBanner}</Text>
              </View>
              <Pressable onPress={() => setOcrBanner(null)} hitSlop={6}>
                <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '600' }}>Kapat</Text>
              </Pressable>
            </View>
          )}

          {/* Step header — panel-aware */}
          <NOStepHeader step={1}>
            {theme.headerStep1.lead}<NOEmText>{theme.headerStep1.em}</NOEmText>{theme.headerStep1.tail}
          </NOStepHeader>

          {/* 2 kart: Klinik & hekim (dar) + Hasta bilgileri (geniş) */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 8 : 10 }}>

            {/* ── Kart 1: Klinik & hekim ── */}
            <View ref={tourRefClinic} style={isDesktop ? { flex: 1 } : undefined}>
              <NOCard>
                <NOCardHead num={1} title="Klinik & hekim" sub="Vakanın bağlı olduğu klinik ve hekim" accent={P} />

                {clinicMode ? (
                  <View style={{ gap: 12 }}>
                    <LockedInfoCard
                      label="Klinik"
                      value={profile?.clinic_name ?? 'Klinik belirtilmemiş'}
                      iconVariant="clinic"
                    />
                    <View ref={tourFldDoctor}>
                      <SearchableDropdown
                        label="Diş hekimi"
                        placeholder={allDoctors.length > 0 ? 'Hekimi seçin veya ekleyin' : 'Hekim bulunmuyor — yeni ekleyin'}
                        options={allDoctors.map(d => ({ id: d.id, label: d.full_name, sublabel: (d as any).phone ?? undefined }))}
                        selectedId={form.doctor_id}
                        onSelect={set('doctor_id')}
                        onAddNew={async (name) => { setDoctorModal({ visible: true, prefill: name }); }}
                        addNewLabel="Yeni diş hekimi ekle"
                        required
                        error={fe('doctor_id')}
                      />
                    </View>
                  </View>
                ) : doctorMode ? (
                  <View style={{ gap: 12 }}>
                    <LockedInfoCard
                      label="Diş Hekimi"
                      value={profile?.full_name ?? '—'}
                      subtitle={profile?.phone ?? undefined}
                      avatarInitials={(profile?.full_name ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                      accentColor={P}
                    />
                    <LockedInfoCard
                      label="Klinik"
                      value={profile?.clinic_name ?? 'Klinik belirtilmemiş'}
                      iconVariant="clinic"
                    />
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    <SearchableDropdown
                      label="Klinik"
                      placeholder="Klinik seçin veya ekleyin"
                      // Klinik logosu varsa baş harfler yerine logo görünür
                      options={clinics.filter(c => c.is_active).map(c => ({
                        id: c.id, label: c.name, sublabel: c.phone ?? undefined,
                        imageUrl: (c as any).logo_url ?? undefined,
                      }))}
                      selectedId={form.clinic_id}
                      onSelect={(id) => { set('clinic_id')(id); set('doctor_id')(''); }}
                      onAddNew={async (name) => {
                        setClinicModal({ visible: true, prefill: name });
                      }}
                      addNewLabel="Yeni klinik ekle"
                      required
                    />
                    <SearchableDropdown
                      label="Diş hekimi"
                      placeholder={form.clinic_id ? 'Diş hekimi seçin veya ekleyin' : 'Önce klinik seçin'}
                      disabled={!form.clinic_id}
                      disabledHint="Önce klinik seçin"
                      // Klinik yetkilisi de hekim olabilir → alt etikette rolü belli olsun
                      options={filteredDoctors.map(d => ({
                        id: d.id,
                        label: d.full_name,
                        sublabel: (d as any).is_clinic_admin
                          ? [d.clinic?.name, 'klinik yetkilisi'].filter(Boolean).join(' · ')
                          : (d.clinic?.name ?? undefined),
                      }))}
                      selectedId={form.doctor_id}
                      onSelect={set('doctor_id')}
                      onAddNew={async (name) => {
                        setDoctorModal({ visible: true, prefill: name });
                      }}
                      addNewLabel="Yeni diş hekimi ekle"
                      required
                      error={fe('doctor_id')}
                    />
                  </View>
                )}

                {/* Aktif vaka sayısı info */}
                {selectedDoctor && (
                  <View style={{
                    marginTop: 12, padding: 10, paddingHorizontal: 12,
                    backgroundColor: NO.bgInput, borderRadius: 10,
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: NO.success }} />
                    <Text style={{ fontSize: 11, color: NO.inkSoft }}>
                      Bu hekimle <Text style={{ color: NO.inkStrong, fontWeight: '600' }}>aktif</Text> vakalar
                    </Text>
                  </View>
                )}
              </NOCard>
            </View>

            {/* ── Kart 2: Hasta bilgileri ── */}
            <View ref={tourRefPatient} style={isDesktop ? { flex: 1.6 } : undefined}>
              <NOCard>
                <NOCardHead
                  num={2}
                  title="Hasta bilgileri"
                  sub={patientLocked ? 'Ana siparişten geldi' : 'Mevcut hastayı seç veya yeni ekle'}
                  badge={patientLocked ? 'Devam' : 'Yeni'}
                  accent={P}
                />

                {/* Devam siparişi: hasta bilgisi ana siparişin kaydından gelir.
                    Kilitli tutulur ki aynı hasta iki farklı yazımla kaydedilmesin;
                    gerçek bir düzeltme gerekiyorsa "Düzenle" ile açılır. */}
                {patientLocked && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 10, marginBottom: 12, borderRadius: 10,
                    backgroundColor: 'rgba(53,99,168,0.08)',
                    borderWidth: 1, borderColor: 'rgba(53,99,168,0.20)',
                  }}>
                    <AppIcon name={'lock-closed-outline' as any} size={14} color="#3563A8" />
                    <Text style={{ flex: 1, fontSize: 11.5, color: '#2A4E85', lineHeight: 16 }}>
                      Hasta bilgileri ana siparişten alındı. Aynı vakanın devamı olduğu için kilitli.
                    </Text>
                    <TouchableOpacity
                      onPress={() => setPatientLocked(false)}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#3563A8' }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>Düzenle</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View
                  pointerEvents={patientLocked ? 'none' : 'auto'}
                  style={patientLocked ? { opacity: 0.55 } : undefined}
                >

                {/* Satır 1: Ad + Soyad */}
                <View ref={tourFldName}>
                <TwoCol stack={!isDesktop}>
                  <Field label="Ad" value={form.patient_first_name}
                    onChangeText={set('patient_first_name')} placeholder="Ad" flex
                    required error={fe('patient_first_name')} />
                  <Field label="Soyad" value={form.patient_last_name}
                    onChangeText={set('patient_last_name')} placeholder="Soyad" flex
                    required error={fe('patient_last_name')} />
                </TwoCol>
                </View>

                {/* Satır 2: TC / Pasaport + Doğum tarihi */}
                <View ref={tourFldDob}>
                <TwoCol stack={!isDesktop}>
                  <Field label="TC / Pasaport No" value={form.patient_id}
                    onChangeText={set('patient_id')} placeholder="TC veya Pasaport No" flex />
                  <DateField
                    label="Doğum tarihi"
                    value={form.patient_dob}
                    onChange={set('patient_dob')}
                    maxDate={new Date()}
                    placeholder="Tarih seçin"
                    flex
                    required
                    error={fe('patient_dob')}
                    accentColor={P}
                  />
                </TwoCol>
                </View>

                {/* Satır 3: Cinsiyet + Uyruk */}
                <View ref={tourFldGender}>
                <TwoCol stack={!isDesktop}>
                  <View style={{ flex: 1 }}>
                    <NOLabel required>Cinsiyet</NOLabel>
                    <NOSegment
                      options={GENDERS.map(g => g.label)}
                      value={GENDERS.find(g => g.value === form.patient_gender)?.label ?? ''}
                      onChange={(label) => {
                        const g = GENDERS.find(x => x.label === label);
                        if (g) set('patient_gender')(g.value as any);
                      }}
                    />
                  </View>
                  <SearchableDropdown
                    label="Uyruk"
                    placeholder="Ülke ara..."
                    options={GEO_COUNTRIES.map(c => ({ id: c.label, label: c.label }))}
                    selectedId={form.patient_nationality}
                    onSelect={set('patient_nationality')}
                  />
                </TwoCol>
                </View>

                {/* Satır 4: İkamet ülkesi + İkamet şehri + Telefon (3 kolon desktop) */}
                <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <SearchableDropdown
                      label="İkamet ülkesi"
                      placeholder="Ülke ara..."
                      options={GEO_COUNTRIES.map(c => ({ id: c.label, label: c.label }))}
                      selectedId={form.patient_country}
                      onSelect={(val) => {
                        set('patient_country')(val);
                        set('patient_city')('');
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <SearchableDropdown
                      label="İkamet şehri"
                      placeholder={form.patient_country ? 'Şehir ara...' : 'Önce ülke seçin'}
                      options={
                        form.patient_country && GEO_BY_LABEL[form.patient_country]
                          ? GEO_BY_LABEL[form.patient_country].cities.map(city => ({ id: city, label: city }))
                          : []
                      }
                      selectedId={form.patient_city}
                      onSelect={set('patient_city')}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Telefon" value={form.patient_phone}
                      onChangeText={set('patient_phone')} placeholder="05XX XXX XX XX" flex />
                  </View>
                </View>

                </View>{/* /hasta alanları kilidi */}

              </NOCard>
            </View>

          </View>
        </ScrollView>
      )}

      {/* Step 2 — Case Details */}
      {step === 3 && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 96, flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>

          {/* Step header */}
          <NOStepHeader
            step={3}
            /* Dosya pill kaldırıldı — sticky upload icon top-right'da (X yanı) */
          >
            <NOEmText>Nasıl</NOEmText> çalışılacak?
          </NOStepHeader>

          {/* 2 kart: Çalışma yöntemi (sol) + Teslimat (sağ) */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12, marginBottom: 12 }}>

            {/* ── Kart 1: Çalışma yöntemi ── */}
            <View ref={tourRefHow} style={isDesktop ? { flex: 1 } : undefined}>
              <NOCard>
                <NOCardHead num={1} title="Çalışma yöntemi" sub="Ölçüm ve model tipi" accent={P} />
                <View style={{ gap: 12 }}>
                  <InlineSelect
                    label="* Ölçüm yöntemi"
                    icon={'ruler' as any}
                    value={form.measurement_type}
                    options={[
                      { value: 'manual',  label: 'Manuel' },
                      { value: 'digital', label: 'Dijital' },
                    ]}
                    onSelect={(v) => {
                      const next = v as 'manual' | 'digital';
                      set('measurement_type')(next);
                      // Ölçüm yöntemi değişirse mevcut seçim yeni listede yoksa sıfırla
                      const validList = next === 'manual' ? MODEL_TYPES_MANUAL : MODEL_TYPES_DIGITAL;
                      if (form.model_type && !validList.some(o => o.value === form.model_type)) {
                        set('model_type')('');
                      }
                    }}
                    error={fe('measurement_type')}
                    accentColor={P}
                  />
                  <InlineSelect
                    label="* Model tipi"
                    icon={'cube-outline' as any}
                    value={form.model_type}
                    options={form.measurement_type === 'manual' ? MODEL_TYPES_MANUAL : MODEL_TYPES_DIGITAL}
                    onSelect={(v) => set('model_type')(form.model_type === v ? '' : v)}
                    error={fe('model_type')}
                    accentColor={P}
                  />
                  {/* Acil vaka toggle */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 10, paddingHorizontal: 12,
                    backgroundColor: NO.bgInput, borderRadius: 10,
                  }}>
                    <AppIcon name="zap" size={14} color="#94A3B8" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '500', color: NO.inkStrong }}>Acil vaka</Text>
                      <Text style={{ fontSize: 10, color: NO.inkMute }}>
                        {urgentSurchargeRate > 0
                          ? `+%${urgentSurchargeRate.toFixed(urgentSurchargeRate % 1 === 0 ? 0 : 2)} ek ücret · 5 gün öncelik`
                          : 'Ek ücretsiz · 5 gün öncelik'}
                      </Text>
                    </View>
                    <NOToggle on={form.is_urgent} onChange={(v) => set('is_urgent')(v)} accentColor={P} />
                  </View>
                </View>
              </NOCard>
            </View>

            {/* ── Kart 2: Teslimat ── */}
            <View style={isDesktop ? { flex: 1 } : undefined}>
              <NOCard>
                <NOCardHead num={2} title="Teslimat" sub="En geç teslim tarihi ve yöntemi" accent={P} />
                <View style={{ gap: 12 }}>
                  <InlineDateSelect
                    label="* Teslim tarihi"
                    value={form.delivery_date}
                    onChange={set('delivery_date')}
                    // Normal vakada en erken 72 saat sonra; acil vakada yarından itibaren
                    minDate={(() => {
                      const d = new Date();
                      d.setHours(0, 0, 0, 0);
                      d.setDate(d.getDate() + (form.is_urgent ? 1 : 3));
                      return d;
                    })()}
                    error={fe('delivery_date')}
                    accentColor={P}
                  />
                  <InlineSelect
                    label="* Teslim yöntemi"
                    icon={'truck' as any}
                    value={form.delivery_method}
                    options={[
                      { value: 'kurye', label: 'Kurye' },
                      { value: 'elden', label: 'Elden teslim' },
                      { value: 'kargo', label: 'Kargo' },
                    ]}
                    onSelect={(v) => set('delivery_method')(form.delivery_method === v ? '' : v as any)}
                    error={fe('delivery_method')}
                    accentColor={P}
                  />
                  {/* Üretim öncesi tasarım onayı toggle */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 10, paddingHorizontal: 12,
                    backgroundColor: NO.bgInput, borderRadius: 10,
                  }}>
                    <AppIcon name="shield-check" size={14} color={form.doctor_approval_required ? P : '#94A3B8'} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '500', color: NO.inkStrong }}>
                        Üretim öncesi tasarım onayı
                      </Text>
                      <Text style={{ fontSize: 10, color: NO.inkMute }}>
                        Tasarım dosyası hekime gönderilir · onaylanmadan üretim başlamaz
                      </Text>
                    </View>
                    <NOToggle on={form.doctor_approval_required} onChange={(v) => set('doctor_approval_required')(v)} accentColor={P} />
                  </View>
                </View>
              </NOCard>
            </View>

          </View>

          {/* ── Dosyalar ── */}
          <NOCard>
            <NOCardHead num={3} title="Dosyalar & ölçüm" sub="STL, PLY, JPG, PDF — maks 200 MB" badge={form.attachments.length > 0 ? `${form.attachments.length} dosya · ${formatBytes(form.attachments.reduce((s, a) => s + (a.size || 0), 0))}` : undefined} accent={P} />

            {/* Dijital ölçüm + dosya zorunlu model tipi uyarısı.
                Devam siparişi asıl işten dosya miras alıyorsa (continues_order_id +
                has_source_files) engelleyici uyarı yerine bilgilendirme gösterilir. */}
            {form.measurement_type === 'digital'
              && ['dijital_tarama', 'stl_dosyasi', 'cad_dosyasi', 'baski_3d_model'].includes(form.model_type)
              && form.attachments.length === 0
              && !(effectivePrefill?.continues_order_id && effectivePrefill?.has_source_files) && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                padding: 12, marginBottom: 12,
                borderRadius: 12,
                backgroundColor: fe('attachments') ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.10)',
                borderWidth: 1,
                borderColor: fe('attachments') ? 'rgba(220,38,38,0.25)' : 'rgba(245,158,11,0.25)',
              }}>
                <AppIcon name={'alert-circle-outline' as any} size={16} color={fe('attachments') ? '#DC2626' : '#B45309'} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: fe('attachments') ? '#991B1B' : '#92400E' }}>
                    Bu model tipi için dosya gerekli
                  </Text>
                  <Text style={{ fontSize: 11, color: fe('attachments') ? '#7F1D1D' : '#78350F', marginTop: 1 }}>
                    Dijital ölçüm seçtiniz — STL / CAD / 3D dosyası yüklemeden bir sonraki adıma geçemezsiniz.
                  </Text>
                </View>
              </View>
            )}

            {/* Devam siparişi — asıl işin taramaları devralınacak (bilgilendirme) */}
            {form.measurement_type === 'digital'
              && ['dijital_tarama', 'stl_dosyasi', 'cad_dosyasi', 'baski_3d_model'].includes(form.model_type)
              && form.attachments.length === 0
              && !!effectivePrefill?.continues_order_id && !!effectivePrefill?.has_source_files && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                padding: 12, marginBottom: 12, borderRadius: 12,
                backgroundColor: 'rgba(16,185,129,0.10)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)',
              }}>
                <AppIcon name={'checkmark-circle-outline' as any} size={16} color="#0F6E50" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F6E50' }}>
                    Asıl işin dosyaları devralınacak
                  </Text>
                  <Text style={{ fontSize: 11, color: '#115E45', marginTop: 1 }}>
                    Bu bir devam siparişi — geçici işin taramaları otomatik devralınır. İstersen yeni dosya da ekleyebilirsin.
                  </Text>
                </View>
              </View>
            )}

            <View style={[fus.twoCol, !isDesktop && { flexDirection: 'column', gap: 16, alignItems: 'stretch' }]}>

              {/* ── Sol: Yükleme butonu — mobil'de top-right'a sticky olarak taşındı (X butonunun yanına) ── */}
              {isDesktop && (
                <View style={fus.twoColLeft}>
                  <TouchableOpacity
                    style={fus.uploadTrigger}
                    onPress={() => setUploadModalOpen(true)}
                    activeOpacity={0.75}
                  >
                    <View style={[fus.uploadTriggerIcon, { backgroundColor: P + '14' }]}>
                      <AppIcon name={'cloud-upload-outline' as any} size={28} color={P} />
                    </View>
                    <Text style={[fus.uploadTriggerTitle, { color: P }]}>Dosya Yükleme</Text>
                    <Text style={[fus.uploadTriggerSub, { textAlign: 'center' }]}>
                      {form.attachments.length === 0
                        ? 'Fotoğraf, STL, PLY, PDF eklemek için tıklayın'
                        : `${form.attachments.length} dosya · ${formatBytes(form.attachments.reduce((s, a) => s + (a.size || 0), 0))}`}
                    </Text>
                    {form.attachments.length > 0 && (
                      <View style={[fus.uploadTriggerBadge, { backgroundColor: P }]}>
                        <Text style={fus.uploadTriggerBadgeText}>{form.attachments.length} dosya · {formatBytes(form.attachments.reduce((s, a) => s + (a.size || 0), 0))}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Dikey ayırıcı sadece desktop'ta */}
              {isDesktop && (
                <View style={fus.twoColDivider} />
              )}

              {/* ── Sağ: Dosya listesi ── */}
              <View style={[fus.twoColRight, !isDesktop && { paddingStart: 0 }]}>
                <View style={fus.subHeader}>
                  <Text style={fus.subLabel}>YÜKLENEN DOSYALAR</Text>
                  <Text style={fus.subHint}>Tüm ekler ve ön izleme</Text>
                </View>
                {/* ── Ana siparişten devralınan dosyalar (salt okunur) ──
                    Kopyalanmaz: burada yalnız GÖSTERİLİR, yeni kayıt açılmaz.
                    Sipariş oluşunca detay ekranı aynı listeyi ebeveynden okur. */}
                {inheritedFiles.length > 0 && (
                  <View style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <AppIcon name={'link-outline' as any} size={13} color="#0F6E50" />
                      <Text style={{ fontSize: 10.5, fontFamily: F.semibold, letterSpacing: 0.8, color: '#0F6E50' }}>
                        ANA SİPARİŞTEN DEVRALINAN
                      </Text>
                      <Text style={{ fontSize: 10.5, color: '#94A3B8' }}>{inheritedFiles.length} dosya</Text>
                    </View>
                    <View style={{ gap: 6 }}>
                      {inheritedFiles.map(f => (
                        <View
                          key={f.id}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 9,
                            paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
                            backgroundColor: 'rgba(16,185,129,0.06)',
                            borderWidth: 1, borderColor: 'rgba(16,185,129,0.20)',
                          }}
                        >
                          <AppIcon name={'document-outline' as any} size={15} color="#0F6E50" />
                          <Text style={{ flex: 1, fontSize: 12, color: '#115E45' }} numberOfLines={1}>{f.name}</Text>
                          <Text style={{ fontSize: 9.5, fontFamily: F.semibold, color: '#0F6E50', letterSpacing: 0.4 }}>
                            DEVRALINDI
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 6, lineHeight: 15 }}>
                      Bu dosyalar ana siparişte duruyor; kopyalanmaz, yeni siparişte de görünür.
                    </Text>
                  </View>
                )}

                {form.attachments.length === 0 && inheritedFiles.length === 0 ? (
                  <View style={{ paddingVertical: 30, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 12,
                      backgroundColor: '#F1F5F9',
                      alignItems: 'center', justifyContent: 'center',
                      marginBottom: 8,
                    }}>
                      <AppIcon name={'document-outline' as any} size={20} color="#94A3B8" />
                    </View>
                    <Text style={{ fontSize: 13, fontFamily: F.semibold, color: '#64748B' }}>
                      Henüz dosya eklenmedi
                    </Text>
                    <Text style={{ fontSize: 11.5, color: '#94A3B8', textAlign: 'center', marginTop: 3, lineHeight: 16 }}>
                      {isDesktop
                        ? 'Eklediğiniz dosyalar burada listelenecek'
                        : 'Yukarıdaki "Dosya Yükleme" alanından ekleyin'}
                    </Text>
                  </View>
                ) : form.attachments.length === 0 ? null : (
                  <>
                    {([
                      // prefixes: yeni etiketler + legacy isim'ler (eski caption'lı dosyalar da gruba düşsün)
                      { label: 'Gülüş Tasarımı', icon: 'image-outline', prefixes: ['Ekartörlü Fotoğraf', 'Gülüş Fotoğrafı', 'Gülüş Videosu', 'Ekartörlü Resim', 'Gülüş Resmi'] },
                      { label: 'Tarama Verileri', icon: 'tooth-outline', prefixes: ['Alt Çene Taraması', 'Üst Çene Taraması', 'Kapanış Taraması', 'Diş Eti Taraması', 'Alt Çene', 'Üst Çene', 'Bite (Kapanış)', 'Bite'] },
                      { label: 'İmplant Bilgileri', icon: 'screw-machine-flat-top', prefixes: ['Scan Body Taraması', 'Scan Body STL'] },
                      { label: 'Ek Dosyalar', icon: 'paperclip', prefixes: ['PDF Belgesi', 'Referans Fotoğrafı', 'Referans Fotoğraf'] },
                    ] as const).map(group => {
                      const groupFiles = form.attachments.filter(a =>
                        group.prefixes.some(p => a.name.startsWith(p))
                      );
                      if (groupFiles.length === 0) return null;
                      return (
                        <View key={group.label} style={fus.fileGroup}>
                          <View style={fus.fileGroupHeader}>
                            <AppIcon name={group.icon as any} size={11} color="#94A3B8" />
                            <Text style={fus.fileGroupLabel}>{group.label}</Text>
                          </View>
                          {groupFiles.map(a => (
                            <FileRow key={a.id} file={a} onRemove={() => removeAttachment(a.id)} onPreview={() => openFilePreview(a)} />
                          ))}
                        </View>
                      );
                    })}
                    {/* Files that don't match any group */}
                    {(() => {
                      const allGroupPrefixes = [
                        // Yeni etiketler
                        'Ekartörlü Fotoğraf', 'Gülüş Fotoğrafı', 'Gülüş Videosu',
                        'Alt Çene Taraması', 'Üst Çene Taraması', 'Kapanış Taraması', 'Diş Eti Taraması',
                        'Scan Body Taraması', 'PDF Belgesi', 'Referans Fotoğrafı',
                        // Legacy
                        'Ekartörlü Resim', 'Gülüş Resmi', 'Alt Çene', 'Üst Çene', 'Bite (Kapanış)', 'Bite', 'Scan Body STL', 'Referans Fotoğraf',
                      ];
                      const others = form.attachments.filter(a => !allGroupPrefixes.some(p => a.name.startsWith(p)));
                      if (others.length === 0) return null;
                      return (
                        <View style={fus.fileGroup}>
                          <View style={fus.fileGroupHeader}>
                            <AppIcon name={'folder-outline' as any} size={11} color="#94A3B8" />
                            <Text style={fus.fileGroupLabel}>Diğer Dosyalar</Text>
                          </View>
                          {others.map(a => (
                            <FileRow key={a.id} file={a} onRemove={() => removeAttachment(a.id)} onPreview={() => openFilePreview(a)} />
                          ))}
                        </View>
                      );
                    })()}
                    {/* ── Toplam özet + boyut barı ── */}
                    {(() => {
                      const MAX_BYTES = 200 * 1024 * 1024; // 200 MB
                      const totalBytes = form.attachments.reduce((s, a) => s + (a.size || 0), 0);
                      const pct = Math.min((totalBytes / MAX_BYTES) * 100, 100);
                      const barColor = pct >= 90 ? NO.error : pct >= 70 ? '#F59E0B' : NO.success;
                      return (
                        <View style={fus.totalRow}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <AppIcon name={'paperclip' as any} size={12} color="#64748B" />
                                <Text style={fus.totalText}>{form.attachments.length} dosya</Text>
                              </View>
                              <Text style={{ fontSize: 11, fontFamily: F.medium, color: barColor }}>
                                {formatBytes(totalBytes)} / 200 MB
                              </Text>
                            </View>
                            {/* Progress bar */}
                            <View style={{ height: 4, borderRadius: 2, backgroundColor: NO.bgInput }}>
                              <View style={{ height: 4, borderRadius: 2, backgroundColor: barColor, width: `${pct}%` as any }} />
                            </View>
                          </View>
                        </View>
                      );
                    })()}
                  </>
                )}
              </View>

            </View>

          </NOCard>

          {/* ── Dosya Yükleme Modal — FilesUploadModal (paralel upload, split view) ── */}
          <FilesUploadModal
            visible={uploadModalOpen}
            onClose={() => setUploadModalOpen(false)}
            accentColor={P}
            title="Sipariş Dosyaları"
            splitView
            showImplant={form.tooth_ops.some(o => {
                if (isImplantWorkType(o.work_type)) return true;
                // Servis adı "implant" içermese de KATEGORİSİ implant olabilir
                // (ör. "İmplant Üstü Hizmetler") — Türkçe "İ" için locale-aware.
                const svc = services.find(s => s.name === o.work_type);
                return (svc?.category ?? '').toLocaleLowerCase('tr-TR').includes('implant');
              })
              || form.attachments.some(a => (a.name ?? '').toLowerCase().includes('scan body'))}
            // YÜKLENEN DOSYALAR listesi — sadece upload'ı tamamlanmış dosyalar.
            // Henüz yüklenmekte olanlar üstteki progress bar'larda görünüyor;
            // burada da listelenirse duplicate olur.
            attachments={form.attachments
              .filter(a => !a.upload_status || a.upload_status === 'done' || a.upload_status === 'error')
              .map<UploadAttachment>(a => ({
                id:   a.id,
                name: a.name,
                uri:  a.uri,
                // 'other' (zip, dcm, obj…) EskiDEN 'image'a düşüyordu; yükleme
                // panelinde boş bir küçük resim kutusu çiziliyordu. Artık 'scan'.
                kind: a.kind === 'photo' ? 'image'
                    : a.kind === 'video' ? 'video'
                    : a.kind === 'pdf'   ? 'pdf'
                    : 'scan',
                filename: a.name,
                canRemove: true,
              }))}
            uploadingStates={form.attachments
              .filter(a => a.upload_status === 'uploading' || a.upload_status === 'pending')
              .map(a => {
                // Label = a.name'in extension'sız hali (örn "Üst Çene.ply" → "Üst Çene")
                const label = a.name.replace(/\.[^.]+$/, '');
                return {
                  id: a.id,
                  filename: a.name,
                  progress: a.upload_progress ?? 0,
                  label,
                };
              })}
            scanBodiesDelivered={form.scan_bodies_delivered}
            onToggleScanBodiesDelivered={() => setForm(f => ({ ...f, scan_bodies_delivered: !f.scan_bodies_delivered }))}
            count3D={form.attachments.filter(a => a.kind === 'stl' || a.kind === 'ply').length}
            onPreviewAll3D={() => setViewer3DFiles(
              form.attachments
                .filter(a => a.kind === 'stl' || a.kind === 'ply')
                .map(a => ({ id: a.id, name: a.name, url: a.uri, format: a.kind as 'stl' | 'ply' }))
            )}
            onPickPhoto={(label) => openSpecificPhotoPicker(label)}
            onPickVideo={(label) => openSpecificVideoPicker(label)}
            onPickScan={(label)  => openSpecificScanPicker(label)}
            onPickPdf={(label)   => openSpecificPdfPicker(label)}
            onPickZip={(label)   => openSpecificZipPicker(label)}
            onPreview={(att) => {
              const a = form.attachments.find(x => x.id === att.id);
              if (a) openFilePreview(a);
            }}
            onRemove={(id) => removeAttachment(id)}
            implantBrandSlot={
              <ImplantBrandPicker
                value={form.implant_brand}
                onChange={(v) => setForm(f => ({ ...f, implant_brand: v }))}
                accent={'#8B5CF6'}
              />
            }
          />

        </ScrollView>
      )}

      {/* Step 3 — Teeth & Dentures */}
      {step === 2 && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 96, flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>

          {/* Step header (sticky upload + chat butonları top-right'da) */}
          <NOStepHeader step={2}>
            <NOEmText>Hangi diş</NOEmText>, hangi iş?
          </NOStepHeader>

          {/* 2 kart: Diş seçimi (sol, geniş) + İş detayı & iş listesi (sağ) */}
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 12, alignItems: 'stretch' }}>

            {/* ── Kart 1: Diş seçimi ── */}
            <View ref={tourRefTeeth} style={isDesktop ? { flex: 1.4 } : undefined}>
              <NOCard>
                <NOCardHead
                  num={1}
                  title="Diş seçimi"
                  sub="Şema üzerinden seç"
                  accent={P}
                  headerRight={
                    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      {([
                        { label: 'Üst çene', teeth: [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28] },
                        { label: 'Alt çene', teeth: [31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48] },
                        { label: 'Full ağız', teeth: [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48] },
                      ] as { label: string; teeth: number[] }[]).map(({ label, teeth }) => (
                        <Pressable
                          key={label}
                          onPress={() => {
                            const existing = form.tooth_ops.map(o => o.tooth);
                            const toAdd = teeth.filter(t => !existing.includes(t));

                            // Tüm dişler zaten ekli → ikinci işlem prompt
                            if (toAdd.length === 0) {
                              const hasWork = form.tooth_ops.some(o => teeth.includes(o.tooth) && !!o.work_type);
                              if (hasWork) {
                                const wantSecond = typeof window !== 'undefined' && (window as any).confirm
                                  ? (window as any).confirm(`${label} için tüm dişlere zaten işlem eklenmiş.\n\nBu çenedeki dişlere ikinci işlem eklemek ister misiniz?`)
                                  : false;
                                if (!wantSecond) return;
                                // Yeni ops oluştur — her diş için ayrı uid
                                const newEntries = teeth.map(t => ({ tooth: t, ...BLANK_OP, __uid: newOpUid() }));
                                setForm(f => ({ ...f, tooth_ops: [...f.tooth_ops, ...newEntries] }));
                                setSelectedTeeth(teeth);
                                setActiveTooth(teeth[0]);
                                // Grup edit: yeni op'ların uid'lerini secondary listesine al
                                setSecondaryOpUids(newEntries.map(e => e.__uid!));
                                return;
                              }
                              // Hiçbir diş work_type'lı değilse normal seç
                              setSelectedTeeth(teeth);
                              setActiveTooth(teeth[0]);
                              return;
                            }

                            // Normal: eklenmemiş dişleri ekle, çenenin tümünü seçili yap
                            setForm(f => {
                              const newOps = [...f.tooth_ops, ...toAdd.map(t => ({ tooth: t, ...BLANK_OP, __uid: newOpUid() }))];
                              return { ...f, tooth_ops: newOps };
                            });
                            setSelectedTeeth(teeth);
                            setActiveTooth(teeth[0]);
                            setSecondaryOpUids([]);
                          }}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 5,
                            borderRadius: NORadius.pill,
                            backgroundColor: 'transparent',
                            borderWidth: 1, borderColor: NO.borderMedium,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '500', color: NO.inkMedium }}>{label}</Text>
                        </Pressable>
                      ))}
                      {/* "Temizle" butonu kaldırıldı — yanlış tıklama önlenir */}
                    </View>
                  }
                />
                <ToothNumberPicker
                  selected={Array.from(new Set(form.tooth_ops.map(o => o.tooth)))}
                  colorMap={toothColorMap}
                  accentColor={NO.saffron}
                  onChange={(newTeeth) => {
                    const prevTeethSet = new Set(form.tooth_ops.map(o => o.tooth));
                    const prevTeeth = Array.from(prevTeethSet);
                    const added   = newTeeth.filter(t => !prevTeethSet.has(t));
                    const removed = prevTeeth.filter(t => !newTeeth.includes(t));

                    // ── İkinci işlem prompt ─────────────────────────────────
                    // Eğer kullanıcı tek bir confirmed/dolu dişe tekrar tıkladıysa:
                    // bunu "ikinci işlem eklemek istiyorum" niyeti olarak yorumla.
                    if (removed.length === 1 && added.length === 0) {
                      const t = removed[0];
                      const hasWork = form.tooth_ops.some(o => o.tooth === t && !!o.work_type);
                      if (hasWork) {
                        const wantSecond = typeof window !== 'undefined' && (window as any).confirm
                          ? (window as any).confirm(`Diş ${t} için zaten bir işlem var.\n\nİkinci bir işlem eklemek ister misiniz?\n\n(Diş seçimini iptal etmek için işlem listesindeki çarpı (×) butonunu kullanın.)`)
                          : false;
                        if (wantSecond) {
                          const uid = newOpUid();
                          setForm(f => ({ ...f, tooth_ops: [...f.tooth_ops, { tooth: t, ...BLANK_OP, __uid: uid }] }));
                          setSecondaryOpUids([uid]);
                          setActiveTooth(t);
                          setSelectedTeeth([t]);
                          return; // ToothPicker'a deselect propagasyonu yapma
                        }
                        // İptal seçildi — yine de silme, sadece seçili kalsın
                        return;
                      }
                    }

                    setForm(f => {
                      let ops = f.tooth_ops.filter(o => !removed.includes(o.tooth));
                      added.forEach(t => { ops = [...ops, { tooth: t, ...BLANK_OP, __uid: newOpUid() }]; });
                      return { ...f, tooth_ops: ops };
                    });
                    if (removed.length > 0) {
                      setConfirmedTeeth(prev => prev.filter(t => !removed.includes(t)));
                      setSecondaryOpUids([]);
                    }
                    const nextSelected = selectedTeeth.filter(t => !removed.includes(t));
                    if (added.length > 0) {
                      setSelectedTeeth([...nextSelected, ...added]);
                      setActiveTooth(added[added.length - 1]);
                      setSecondaryOpUids([]);
                    } else {
                      setSelectedTeeth(nextSelected);
                      if (activeTooth !== null && removed.includes(activeTooth)) {
                        setActiveTooth(nextSelected.length > 0 ? nextSelected[nextSelected.length - 1] : null);
                      }
                    }
                  }}
                  containerWidth={isDesktop ? (width - 100) / 2 - 64 : width - 80}
                />

                {/* Renk paleti kaldırıldı — renk seçimi alttaki "İş detayı" kartında yapılıyor */}

                <FieldError msg={fe('tooth_ops')} />
              </NOCard>
            </View>

            {/* ── Sağ kolon: İş detayı + İş listesi ── */}
            <View ref={tourRefWork} style={isDesktop ? { flex: 1, gap: 12 } : { gap: 12 }}>

              {/* Kart 2: İş detayı */}
              {(() => {
                const validTooth = activeTooth !== null && selectedTeeth.includes(activeTooth) ? activeTooth : null;
                // Aktif op:
                //   • secondaryOpUids dolu → aktif diş için o uid'lerden ilkini al
                //   • değilse: aktif dişin work_type'sı boş olan op'unu (yeni eklenenler önceliklidir)
                const op =
                  (secondaryOpUids.length > 0
                    ? form.tooth_ops.find(o => o.__uid && secondaryOpUids.includes(o.__uid) && o.tooth === validTooth)
                    : null)
                  ?? form.tooth_ops.find(o => o.tooth === validTooth)
                  ?? { tooth: 0, ...BLANK_OP };
                const isAlreadyConfirmed = secondaryOpUids.length === 0
                  && selectedTeeth.length > 0
                  && selectedTeeth.every(t => confirmedTeeth.includes(t));
                const hasLastOp = lastConfirmedOpRef.current.work_type !== '';

                return (
                  <NOCard>
                    <NOCardHead
                      num={2}
                      title="İş detayı"
                      sub={validTooth ? `Diş ${validTooth} düzenleniyor` : 'Diş seçin'}
                      badge={validTooth ? 'Aktif' : undefined}
                      accent={P}
                    />
                    {!validTooth ? (
                      <View style={{ paddingVertical: 16, alignItems: 'center', opacity: 0.45 }}>
                        <Text style={{ color: NO.inkSoft, fontSize: 12, textAlign: 'center' }}>
                          Önce bir diş seçin
                        </Text>
                      </View>
                    ) : (
                      <>
                        <WorkTypeSelector
                          key={opResetKey}
                          op={op}
                          services={effectiveServices}
                          showPrices={showPrices}
                          updateToothOp={updateToothOp}
                          selectedTeeth={selectedTeeth}
                          accentColor={P}
                          onNightGuard={(jaw) => {
                            const upper = [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28];
                            const lower = [31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48];
                            const teeth = jaw === 'upper' ? upper : jaw === 'lower' ? lower : [...upper, ...lower];
                            setForm(f => {
                              const existing = f.tooth_ops.map(o => o.tooth);
                              const kept    = f.tooth_ops.filter(o => !teeth.includes(o.tooth));
                              const updated = teeth.map(t =>
                                existing.includes(t)
                                  ? { ...f.tooth_ops.find(o => o.tooth === t)!, work_type: 'Gece Plağı' }
                                  : { tooth: t, ...BLANK_OP, __uid: newOpUid(), work_type: 'Gece Plağı' }
                              );
                              return { ...f, tooth_ops: [...kept, ...updated] };
                            });
                            setSelectedTeeth(teeth);
                            setActiveTooth(teeth[0]);
                          }}
                          onAutoConfirm={(opOverride) => {
                            // opOverride: seçimle aynı anda gelen taze op (stale closure'ı önler).
                            const effOp = { ...op, ...(opOverride ?? {}) } as ToothOp;
                            if (!effOp.work_type) return;
                            const { tooth: _t, ...rest } = effOp;
                            lastConfirmedOpRef.current = rest;
                            selectedTeeth.forEach(t => {
                              setConfirmedTeeth(prev => prev.includes(t) ? prev : [...prev, t]);
                            });
                            setSelectedTeeth([]);
                            setActiveTooth(null);
                            setSecondaryOpUids([]);
                            setOpResetKey(k => k + 1);
                          }}
                        />

                        {/* Önceki dişi kopyala butonu */}
                        {hasLastOp && !isAlreadyConfirmed && (
                          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: NO.borderSoft }}>
                            <Pressable
                              onPress={() => {
                                updateToothOp({ ...lastConfirmedOpRef.current });
                                // Auto-confirm after copying
                                setTimeout(() => {
                                  const { tooth: _t, ...rest } = op as ToothOp;
                                  lastConfirmedOpRef.current = { ...lastConfirmedOpRef.current };
                                  selectedTeeth.forEach(t => {
                                    setConfirmedTeeth(prev => prev.includes(t) ? prev : [...prev, t]);
                                  });
                                  setSelectedTeeth([]);
                                  setActiveTooth(null);
                                  setSecondaryOpUids([]);
                                  setOpResetKey(k => k + 1);
                                }, 0);
                              }}
                              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: NO.borderSoft, backgroundColor: NO.bgInput }}
                            >
                              <AppIcon name={'content-copy' as any} size={14} color={NO.inkSoft} />
                              <Text style={{ fontSize: 12, fontWeight: '500', color: NO.inkSoft }}>Önceki dişi kopyala</Text>
                            </Pressable>
                          </View>
                        )}
                      </>
                    )}
                  </NOCard>
                );
              })()}

              {/* Kart 3: İş listesi — aynı işlem değerlerine sahip dişler tek satırda gruplanır */}
              {(() => {
                const confirmed = [...form.tooth_ops]
                  .filter(o => confirmedTeeth.includes(o.tooth))
                  .sort((a, b) => a.tooth - b.tooth);
                const totalPrice = toothOpsTotals(confirmed).grand;

                // Aynı işlem değerlerine sahip op'ları grupla
                const groupKeyOf = (o: ToothOp) => [
                  o.work_type, o.shade, o.material,
                  o.implant_system, o.implant_type, o.abutment, o.screw,
                  o.price, o.material_price, o.price_unit,
                ].join('||');
                const groupMap = new Map<string, { key: string; ops: ToothOp[]; teeth: number[] }>();
                confirmed.forEach(o => {
                  const k = groupKeyOf(o);
                  if (!groupMap.has(k)) groupMap.set(k, { key: k, ops: [], teeth: [] });
                  const g = groupMap.get(k)!;
                  g.ops.push(o);
                  g.teeth.push(o.tooth);
                });
                const groups = Array.from(groupMap.values())
                  .map(g => ({ ...g, teeth: Array.from(new Set(g.teeth)).sort((a, b) => a - b) }))
                  .sort((a, b) => a.teeth[0] - b.teeth[0]);

                // 11, 12, 13, 14 → "11-14" range formatı
                const formatTeethRange = (teeth: number[]): string => {
                  if (teeth.length === 0) return '';
                  if (teeth.length === 1) return String(teeth[0]);
                  const parts: string[] = [];
                  let start = teeth[0], prev = teeth[0];
                  for (let i = 1; i <= teeth.length; i++) {
                    const t = teeth[i];
                    if (t !== prev + 1) {
                      parts.push(start === prev ? String(start) : `${start}–${prev}`);
                      start = t; prev = t;
                    } else {
                      prev = t;
                    }
                  }
                  return parts.join(', ');
                };

                return (
                  <NOCard>
                    <NOCardHead
                      num={3}
                      title="İş listesi"
                      badge={confirmed.length > 0 ? (showPrices ? `${confirmed.length} diş · ${curSym(confirmed[0]?.currency ?? orderCur)}${totalPrice.toLocaleString('tr-TR')}` : `${confirmed.length} diş`) : undefined}
                      accent={P}
                    />
                    {confirmed.length === 0 ? (
                      <View style={{ paddingVertical: 20, alignItems: 'center', gap: 6, opacity: 0.5 }}>
                        <Text style={{ color: NO.inkMute, fontSize: 12, textAlign: 'center' }}>
                          Diş seçin ve işlemleri doldurun — otomatik eklenir
                        </Text>
                      </View>
                    ) : (
                      <View>
                        {/* Başlık satırı */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 6, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: NO.borderSoft }}>
                          <Text style={{ flex: 0.45, fontSize: 10, fontWeight: '600', color: NO.inkMute, letterSpacing: 0.5 }}>DİŞ</Text>
                          <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: NO.inkMute, letterSpacing: 0.5 }}>İŞLEM</Text>
                          <Text style={{ width: 80, fontSize: 10, fontWeight: '600', color: NO.inkMute, letterSpacing: 0.5, textAlign: 'end' as any }}>MALİYET</Text>
                          <View style={{ width: 28 }} />
                        </View>
                        {/* Gruplanmış satırlar */}
                        {groups.map((g, i) => {
                          const op = g.ops[0]; // grup üyeleri özdeş özelliklere sahip
                          const detail = [op.material, op.shade].filter(Boolean).join(' · ');
                          const unitCost = (op.price || 0) + (op.material_price || 0);
                          const groupCost = unitCost * priceUnitQty(op.price_unit, g.teeth);
                          const isEditing = g.teeth.some(t => selectedTeeth.includes(t));
                          const teethLabel = formatTeethRange(g.teeth);
                          return (
                            <Pressable
                              key={g.key + '|' + i}
                              onPress={() => {
                                setSelectedTeeth(g.teeth);
                                setActiveTooth(g.teeth[0]);
                                setOpResetKey(k => k + 1);
                              }}
                              style={{
                                flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4,
                                borderBottomWidth: i < groups.length - 1 ? 1 : 0,
                                borderBottomColor: NO.borderSoft,
                                backgroundColor: isEditing ? NO.saffronSoft : 'transparent',
                                borderRadius: isEditing ? 8 : 0,
                                marginHorizontal: isEditing ? -4 : 0,
                              }}
                            >
                              {/* Diş listesi */}
                              <View style={{ flex: 0.45, flexDirection: 'row', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
                                <Text style={{
                                  fontSize: 11, fontWeight: '700',
                                  color: isEditing ? NO.saffron : NO.inkStrong,
                                  fontFamily: 'monospace',
                                }}>
                                  {teethLabel}
                                </Text>
                                {g.ops.length > 1 && (
                                  <Text style={{ fontSize: 10, color: NO.inkMute }}>· {unitQtyLabel(op.price_unit, g.teeth)}</Text>
                                )}
                              </View>
                              {/* İşlem detay */}
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: '500', color: NO.inkStrong }} numberOfLines={1}>{op.work_type || '—'}</Text>
                                {detail ? <Text style={{ fontSize: 10, color: NO.inkMute, marginTop: 1 }} numberOfLines={1}>{detail}</Text> : null}
                              </View>
                              {/* Düzenle ikonu */}
                              {isEditing && (
                                <View style={{ marginEnd: 4 }}>
                                  <AppIcon name="pencil" size={11} color={NO.inkSoft} />
                                </View>
                              )}
                              {/* Maliyet */}
                              <Text style={{ width: 80, fontSize: 12, fontWeight: '600', color: groupCost > 0 ? NO.inkStrong : NO.inkMute, textAlign: 'end' as any }}>
                                {showPrices && groupCost > 0 ? `${curSym(op.currency ?? orderCur)}${groupCost.toLocaleString('tr-TR')}` : '—'}
                              </Text>
                              {/* Sil — gruptaki TÜM op'ları kaldırır */}
                              <TouchableOpacity
                                onPress={(e) => {
                                  (e as any).stopPropagation?.();
                                  const uids = g.ops.map(o => o.__uid).filter(Boolean) as string[];
                                  setForm(f => {
                                    const nextOps = uids.length > 0
                                      ? f.tooth_ops.filter(o => !o.__uid || !uids.includes(o.__uid))
                                      : f.tooth_ops.filter(o => !g.teeth.includes(o.tooth));
                                    // Bu dişlerin hiç op'u kalmadıysa confirmedTeeth'ten çıkar
                                    g.teeth.forEach(t => {
                                      const stillHas = nextOps.some(o => o.tooth === t);
                                      if (!stillHas) {
                                        setConfirmedTeeth(prev => prev.filter(x => x !== t));
                                      }
                                    });
                                    return { ...f, tooth_ops: nextOps };
                                  });
                                  if (uids.some(u => secondaryOpUids.includes(u))) {
                                    setSecondaryOpUids(prev => prev.filter(u => !uids.includes(u)));
                                  }
                                  if (isEditing) { setSelectedTeeth([]); setActiveTooth(null); }
                                  return; // eski tekli satır mantığı atlanır
                                }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={{ width: 28, alignItems: 'center' }}
                              >
                                <AppIcon name="x" size={13} color={NO.inkMute} />
                              </TouchableOpacity>
                            </Pressable>
                          );
                        })}
                        {/* Eski tekli satır renderı artık devre dışı — grup satırı kullanılıyor */}
                        {false && confirmed.map((op, i) => {
                          const detail = [op.material, op.shade].filter(Boolean).join(' · ');
                          const cost = (op.price || 0) + (op.material_price || 0);
                          const isEditing = selectedTeeth.includes(op.tooth);
                          return (
                            <Pressable
                              key={op.__uid ?? `t-${op.tooth}-${(op as any).work_type ?? ''}`}
                              onPress={() => {
                                setSelectedTeeth([op.tooth]);
                                setActiveTooth(op.tooth);
                                setOpResetKey(k => k + 1);
                              }}
                              style={{
                                flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 4,
                                borderBottomWidth: i < confirmed.length - 1 ? 1 : 0,
                                borderBottomColor: NO.borderSoft,
                                backgroundColor: isEditing ? NO.saffronSoft : 'transparent',
                                borderRadius: isEditing ? 8 : 0,
                                marginHorizontal: isEditing ? -4 : 0,
                              }}
                            >
                              {/* Diş badge */}
                              <View style={{ flex: 0.3 }}>
                                <View style={{
                                  width: 28, height: 22, borderRadius: 6,
                                  backgroundColor: isEditing ? NO.saffron : NO.saffronSoft,
                                  alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: isEditing ? '#FFFFFF' : NO.inkStrong, fontFamily: 'monospace' }}>{op.tooth}</Text>
                                </View>
                              </View>
                              {/* İşlem detay */}
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: '500', color: NO.inkStrong }} numberOfLines={1}>{op.work_type || '—'}</Text>
                                {detail ? <Text style={{ fontSize: 10, color: NO.inkMute, marginTop: 1 }} numberOfLines={1}>{detail}</Text> : null}
                              </View>
                              {/* Düzenle ikonu */}
                              {isEditing && (
                                <View style={{ marginEnd: 4 }}>
                                  <AppIcon name="pencil" size={11} color={NO.inkSoft} />
                                </View>
                              )}
                              {/* Maliyet */}
                              <Text style={{ width: 70, fontSize: 12, fontWeight: '600', color: cost > 0 ? NO.inkStrong : NO.inkMute, textAlign: 'end' as any }}>
                                {showPrices && cost > 0 ? `${curSym(op.currency ?? orderCur)}${cost.toLocaleString('tr-TR')}` : '—'}
                              </Text>
                              {/* Sil — uid varsa sadece o op'u sil, yoksa o tooth'un tümünü sil */}
                              <TouchableOpacity
                                onPress={(e) => {
                                  (e as any).stopPropagation?.();
                                  const targetUid = op.__uid;
                                  setForm(f => {
                                    const nextOps = targetUid
                                      ? f.tooth_ops.filter(o => o.__uid !== targetUid)
                                      : f.tooth_ops.filter(o => o.tooth !== op.tooth);
                                    // Eğer bu diş için başka op kalmadıysa confirmedTeeth'ten de çıkar
                                    const stillHas = nextOps.some(o => o.tooth === op.tooth);
                                    if (!stillHas) {
                                      setConfirmedTeeth(prev => prev.filter(t => t !== op.tooth));
                                    }
                                    return { ...f, tooth_ops: nextOps };
                                  });
                                  if (targetUid && secondaryOpUids.includes(targetUid)) {
                                    setSecondaryOpUids(prev => prev.filter(u => u !== targetUid));
                                  }
                                  if (isEditing) { setSelectedTeeth([]); setActiveTooth(null); }
                                }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={{ width: 28, alignItems: 'center' }}
                              >
                                <AppIcon name="x" size={13} color={NO.inkMute} />
                              </TouchableOpacity>
                            </Pressable>
                          );
                        })}
                        {/* Toplam */}
                        <View style={{
                          flexDirection: 'row', alignItems: 'center',
                          marginTop: 8, paddingTop: 8,
                          borderTopWidth: 1, borderTopColor: NO.inkStrong,
                        }}>
                          <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: NO.inkStrong }}>Toplam</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: NO.inkStrong }}>
                            {showPrices ? `${curSym(confirmed[0]?.currency ?? orderCur)}${totalPrice.toLocaleString('tr-TR')}` : '—'}
                          </Text>
                          <View style={{ width: 28 }} />
                        </View>
                      </View>
                    )}
                  </NOCard>
                );
              })()}

              {/* Mesaj kutusu — iş listesinin altında */}
              <ChatBox
                messages={form.chat_messages}
                onAdd={(msg) => { console.log('[NewOrderScreen.onAdd] received msg', msg.id, 'type:', msg.type); setForm(f => { const next = { ...f, chat_messages: [...f.chat_messages, msg] }; console.log('[NewOrderScreen.onAdd] new chat_messages count:', next.chat_messages.length); return next; }); }}
                onDelete={(id) => setForm(f => ({ ...f, chat_messages: f.chat_messages.filter(m => m.id !== id) }))}
                accentColor={P}
              />

            </View>{/* end right column */}

          </View>{/* end split row */}

        </ScrollView>
      )}

      {/* Step 4 — Summary & Approval */}
      {step === 4 && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 96, flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>

          {/* Step header — tüm sticky butonlar top-right'da */}
          <NOStepHeader step={4}>
            <NOEmText>Hepsi hazır.</NOEmText> Bir kez daha bakalım.
          </NOStepHeader>

          <View ref={tourRefSummary} style={{ gap: 12 }}>

            {/* ── Urgent banner ── */}
            {form.is_urgent && (
              <View style={{
                padding: 12, borderRadius: NORadius.md,
                backgroundColor: 'rgba(156,46,46,0.08)',
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <AppIcon name="zap" size={14} color={NO.error} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: NO.error }}>ACİL VAKA</Text>
                  <Text style={{ fontSize: 10, color: NO.error, opacity: 0.7 }}>+%30 ücret · öncelikli üretim</Text>
                </View>
              </View>
            )}

            {/* ── Kart 1: F1 Hero — accent bg + blobs + QR + stat triplet ── */}
            {(() => {
              const ops = form.tooth_ops.filter(o => confirmedTeeth.includes(o.tooth));
              const toothCount = ops.length;
              const fileCount = form.attachments.length;
              const grandTotal = toothOpsTotals(ops).grand;
              const deliveryStr = form.delivery_date ? form.delivery_date.toLocaleDateString(localeTag()) : '—';
              const patientStr  = form.patient_first_name
                ? `${form.patient_first_name} ${form.patient_last_name}`.trim()
                : '—';
              return (
                <View style={{
                  position: 'relative' as any,
                  borderRadius: NORadius.xl,
                  backgroundColor: P,
                  padding: 18,
                  overflow: 'hidden' as any,
                  ...(Platform.OS === 'web' ? { boxShadow: `0 16px 40px ${P}33` } as any : {}),
                }}>
                  {/* Decorative blobs */}
                  <View pointerEvents="none" style={{
                    position: 'absolute' as any, top: -60, end: -40,
                    width: 200, height: 200, borderRadius: 9999,
                    backgroundColor: 'rgba(255,255,255,0.10)',
                  }} />
                  <View pointerEvents="none" style={{
                    position: 'absolute' as any, bottom: -80, start: -30,
                    width: 220, height: 220, borderRadius: 9999,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                  }} />

                  {/* Üst row: eyebrow / title + QR */}
                  <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.80)', letterSpacing: 1.4, textTransform: 'uppercase' }}>
                        Adım 4 / 4 · Sipariş Özeti
                      </Text>
                      <Text style={{
                        marginTop: 4,
                        fontSize: 22, fontWeight: '300',
                        letterSpacing: -0.4, color: '#FFFFFF',
                        fontFamily: DISPLAY_FONT.fontFamily,
                      }}>
                        İş Emri Hazır
                      </Text>

                      {/* Compact info satırları */}
                      <View style={{ marginTop: 12, gap: 5 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                          <Text style={{ width: 60, fontSize: 9.5, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.6, fontWeight: '700' }}>KLİNİK</Text>
                          <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: '#FFFFFF' }} numberOfLines={1}>{selectedClinic?.name || '—'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                          <Text style={{ width: 60, fontSize: 9.5, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.6, fontWeight: '700' }}>HEKİM</Text>
                          <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: '#FFFFFF' }} numberOfLines={1}>{selectedDoctor?.full_name || '—'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                          <Text style={{ width: 60, fontSize: 9.5, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.6, fontWeight: '700' }}>HASTA</Text>
                          <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: '#FFFFFF' }} numberOfLines={1}>{patientStr}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                          <Text style={{ width: 60, fontSize: 9.5, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.6, fontWeight: '700' }}>TESLİM</Text>
                          <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: '#FFFFFF' }} numberOfLines={1}>{deliveryStr}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Sağ: QR kart — premium minimal, kısa URL ile minimal matrix */}
                    {Platform.OS === 'web' && (
                      <View style={{
                        width: 120,
                        paddingVertical: 10, paddingHorizontal: 10,
                        alignItems: 'center',
                        backgroundColor: '#FFFFFF',
                        borderRadius: 12,
                        ...(Platform.OS === 'web' ? { boxShadow: '0 6px 16px rgba(0,0,0,0.16)' } as any : {}),
                      }}>
                        {React.createElement('div' as any, { id: 'dental-qr-container', style: { display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 } },
                          <QRCodeSvg
                            value={qrValue}
                            size={100}
                            color="#0F172A"
                            backgroundColor="#FFFFFF"
                            ecl="M"
                          />
                        )}
                        {qrShortUrl && (
                          <Text style={{
                            marginTop: 6, fontSize: 9, color: '#0F172A', letterSpacing: 0.6,
                            fontFamily: Platform.OS === 'web' ? 'ui-monospace, SFMono-Regular, monospace' as any : 'monospace',
                            fontWeight: '700',
                          }}>
                            {qrShortUrl.split('/c/')[1] ?? ''}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Stat triplet — 3 mini stat pill */}
                  <View style={{
                    marginTop: 14,
                    flexDirection: 'row', gap: 8,
                  }}>
                    {[
                      { label: 'Diş', value: String(toothCount) },
                      { label: 'Dosya', value: String(fileCount) },
                      { label: 'Tutar', value: showPrices && grandTotal > 0 ? `${curSym(orderCur)}${grandTotal.toLocaleString('tr-TR')}` : '—' },
                    ].map(s => (
                      <View key={s.label} style={{
                        flex: 1, paddingHorizontal: 10, paddingVertical: 8,
                        borderRadius: 10,
                        backgroundColor: 'rgba(255,255,255,0.14)',
                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
                      }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.70)', letterSpacing: 0.7 }}>
                          {s.label.toUpperCase()}
                        </Text>
                        <Text style={{ marginTop: 2, fontSize: 16, fontWeight: '700', color: '#FFFFFF', fontFamily: DISPLAY_FONT.fontFamily, letterSpacing: -0.2 }}>
                          {s.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* ── Kart 2: İş listesi özeti — aynı işlemler tek satırda gruplanır ── */}
            {(() => {
              const ops = form.tooth_ops.filter(o => confirmedTeeth.includes(o.tooth)).sort((a, b) => a.tooth - b.tooth);
              const { labor: totalLabor, material: totalMat, grand: grandTotal } = toothOpsTotals(ops);

              // Gruplama — aynı op signature → tek satır
              const groupKeyOf = (o: ToothOp) => [
                o.work_type, o.shade, o.material,
                o.implant_system, o.implant_type, o.abutment, o.screw,
                o.price, o.material_price, o.price_unit,
              ].join('||');
              const gMap = new Map<string, { key: string; ops: ToothOp[]; teeth: number[] }>();
              ops.forEach(o => {
                const k = groupKeyOf(o);
                if (!gMap.has(k)) gMap.set(k, { key: k, ops: [], teeth: [] });
                const g = gMap.get(k)!;
                g.ops.push(o);
                g.teeth.push(o.tooth);
              });
              const groups = Array.from(gMap.values())
                .map(g => ({ ...g, teeth: Array.from(new Set(g.teeth)).sort((a, b) => a - b) }))
                .sort((a, b) => a.teeth[0] - b.teeth[0]);

              // Range formatla: [11,12,13,14] → "11–14", [11,13,14] → "11, 13–14"
              const formatTeethRange = (teeth: number[]): string => {
                if (teeth.length === 0) return '';
                if (teeth.length === 1) return String(teeth[0]);
                const parts: string[] = [];
                let start = teeth[0], prev = teeth[0];
                for (let i = 1; i <= teeth.length; i++) {
                  const t = teeth[i];
                  if (t !== prev + 1) {
                    parts.push(start === prev ? String(start) : `${start}–${prev}`);
                    start = t; prev = t;
                  } else {
                    prev = t;
                  }
                }
                return parts.join(', ');
              };

              return (
                <NOCard>
                  <NOCardHead num={2} title="İşlemler" sub={`${ops.length} diş · ${groups.length} işlem`} badge={showPrices && grandTotal > 0 ? `${curSym(ops[0]?.currency ?? orderCur)}${grandTotal.toLocaleString('tr-TR')}` : undefined} accent={P} />
                  {ops.length === 0 ? (
                    <View style={{ paddingVertical: 16, alignItems: 'center', opacity: 0.5 }}>
                      <Text style={{ fontSize: 12, color: NO.inkMute }}>Henüz işlem eklenmedi</Text>
                    </View>
                  ) : (
                    <View>
                      {groups.map((g, i) => {
                        const op = g.ops[0];
                        const detail = [op.material, op.shade].filter(Boolean).join(' · ');
                        const unitCost = (op.price || 0) + (op.material_price || 0);
                        const groupCost = unitCost * priceUnitQty(op.price_unit, g.teeth);
                        const teethLabel = formatTeethRange(g.teeth);
                        return (
                          <View key={g.key + '|' + i} style={{
                            flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
                            borderBottomWidth: i < groups.length - 1 ? 1 : 0, borderBottomColor: NO.borderSoft,
                          }}>
                            {/* Diş listesi */}
                            <View style={{
                              minWidth: 60, maxWidth: 130,
                              paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5,
                              backgroundColor: NO.saffronSoft, alignItems: 'center', justifyContent: 'center', marginEnd: 10,
                            }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: NO.inkStrong, fontFamily: 'monospace' }}>
                                {teethLabel}
                              </Text>
                              {g.ops.length > 1 && (
                                <Text style={{ fontSize: 8, color: NO.inkMute, marginTop: 1 }}>{unitQtyLabel(op.price_unit, g.teeth)}</Text>
                              )}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 11, fontWeight: '500', color: NO.inkStrong }} numberOfLines={1}>{op.work_type}</Text>
                              {detail ? <Text style={{ fontSize: 9, color: NO.inkMute }} numberOfLines={1}>{detail}</Text> : null}
                            </View>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: groupCost > 0 ? NO.inkStrong : NO.inkMute }}>
                              {showPrices && groupCost > 0 ? `${curSym(op.currency ?? orderCur)}${groupCost.toLocaleString('tr-TR')}` : '—'}
                            </Text>
                          </View>
                        );
                      })}
                      {/* Maliyet özeti — yalnız fiyat yetkisi olanlara */}
                      {showPrices && (
                      <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: NO.inkStrong, gap: 4 }}>
                        {totalMat > 0 && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 11, color: NO.inkSoft }}>Materyal</Text>
                            <Text style={{ fontSize: 11, color: NO.inkSoft }}>{curSym(ops[0]?.currency ?? orderCur)}{totalMat.toLocaleString('tr-TR')}</Text>
                          </View>
                        )}
                        {totalLabor > 0 && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 11, color: NO.inkSoft }}>İşçilik</Text>
                            <Text style={{ fontSize: 11, color: NO.inkSoft }}>{curSym(ops[0]?.currency ?? orderCur)}{totalLabor.toLocaleString('tr-TR')}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: NO.inkStrong }}>Toplam</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: NO.inkStrong }}>{curSym(ops[0]?.currency ?? orderCur)}{grandTotal.toLocaleString('tr-TR')}</Text>
                        </View>
                      </View>
                      )}
                    </View>
                  )}
                </NOCard>
              );
            })()}

            {/* ── Kart 3: Dosyalar özeti ── */}
            {form.attachments.length > 0 && (
              <NOCard>
                <NOCardHead num={3} title="Dosyalar" badge={`${form.attachments.length} dosya · ${formatBytes(form.attachments.reduce((s, a) => s + (a.size || 0), 0))}`} accent={P} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {form.attachments.map(a => (
                    <View key={a.id} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingVertical: 5, paddingHorizontal: 10,
                      backgroundColor: NO.bgInput, borderRadius: NORadius.pill,
                    }}>
                      <AppIcon name={a.kind === 'photo' ? 'image' : a.kind === 'pdf' ? 'file-text' : a.kind === 'stl' || a.kind === 'ply' ? 'box' : 'paperclip'} size={12} color={NO.inkSoft} />
                      <Text style={{ fontSize: 11, color: NO.inkMedium, maxWidth: 120 }} numberOfLines={1}>{a.name}</Text>
                    </View>
                  ))}
                </View>
              </NOCard>
            )}

            {/* ── Kart 4: Not (hekim → laboratuvara not, diğer → hekime not) ── */}
            <NOCard>
              <NOCardHead
                num={form.attachments.length > 0 ? 4 : 3}
                title={resolvedPanel === 'doctor' ? 'Laboratuvara not' : 'Hekime not'}
                sub="Opsiyonel · vaka kartında gözükür"
                accent={P}
              />
              <View style={{
                padding: 12, paddingHorizontal: 14,
                backgroundColor: NO.bgInput, borderRadius: 11,
                minHeight: 60,
              }}>
                <TextInput
                  value={form.notes}
                  onChangeText={set('notes')}
                  placeholder="Notunuzu yazın..."
                  placeholderTextColor={NO.inkMute}
                  multiline
                  style={{
                    fontSize: 12, color: NO.inkStrong, minHeight: 40,
                    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
                    textAlignVertical: 'top' as const,
                  }}
                />
              </View>
            </NOCard>

          </View>
        </ScrollView>
      )}

      {/* API / submit error */}
      {submitError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {submitError}</Text>
        </View>
      ) : null}

      </NOPageChrome>{/* NOPageChrome */}

      {/* Denty FAB — NATIVE'de modal (pageSheet) kök FAB'ı örttüğü için burada
          ayrıca mount edilir. WEB'de gerekmez: kök FAB zIndex 9999 ile modalın
          ÜSTÜNDE çizilir, buradaki ikinci mount ekranda çift hap gösteriyordu.
          Düzenlemede hiç gösterilmez — asistan sipariş OLUŞTURMA formunu
          doldurur, mevcut siparişi düzenleyemez (bkz. useSuppressDentyFab). */}
      {onClose && !isEdit && Platform.OS !== 'web' && <DentyFAB />}

{/* Canonical clinic add modal — sağlık kurumları ekranıyla aynı form */}
      <CanonicalClinicModal
        visible={clinicModal.visible}
        editingClinic={null}
        existingClinics={clinics as any}
        accentColor={P}
        onClose={() => setClinicModal({ visible: false, prefill: '' })}
        onSuccess={() => setClinicModal({ visible: false, prefill: '' })}
        onCreated={(clinic) => {
          setClinics(prev => [...prev, clinic as any]);
          set('clinic_id')((clinic as any).id);
          set('doctor_id')('');
        }}
      />

      {/* Canonical doctor add modal — Hekim formu ile aynı */}
      <CanonicalDoctorModal
        visible={doctorModal.visible}
        editingDoctor={null}
        clinics={clinics as any}
        // Klinik modunda klinik seçilmez → hekim, kullanıcının kendi kliniğine eklenir.
        defaultClinicId={form.clinic_id || (clinicMode ? ((profile as any)?.clinic_id || allDoctors[0]?.clinic_id || clinics[0]?.id || '') : '')}
        accentColor={P}
        onClose={() => setDoctorModal({ visible: false, prefill: '' })}
        onSuccess={() => setDoctorModal({ visible: false, prefill: '' })}
        onCreated={(doctor) => {
          setAllDoctors(prev => [...prev, doctor as any]);
          set('doctor_id')((doctor as any).id);
        }}
      />

      {/* ── File Preview Modal ── */}
      <Modal
        visible={!!previewFile}
        transparent
        animationType="fade"
        onRequestClose={closePreview}
      >
        <Pressable style={fpv.overlay} onPress={closePreview}>
          <Pressable style={fpv.card} onPress={(e: any) => e.stopPropagation()}>
            {/* Header */}
            <View style={fpv.header}>
              <View style={fpv.headerLeft}>
                <View style={[fpv.kindBadge, { backgroundColor: kindColor(previewFile?.kind ?? 'other') + '18' }]}>
                  <AppIcon
                    name={kindIcon(previewFile?.kind ?? 'other') as any}
                    size={14}
                    color={kindColor(previewFile?.kind ?? 'other')}
                  />
                </View>
                <View>
                  <Text style={fpv.title} numberOfLines={1}>{previewFile?.name ?? ''}</Text>
                  <Text style={fpv.meta}>
                    {kindLabel(previewFile?.kind ?? 'other')}
                    {(previewFile?.size ?? 0) > 0 ? ` · ${formatBytes(previewFile!.size)}` : ''}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={closePreview} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <AppIcon name={'close' as any} size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {previewFile?.kind === 'photo' ? (
              <View style={{ position: 'relative' }}>
                <Image
                  source={{ uri: previewFile.uri }}
                  style={fpv.image}
                  resizeMode="contain"
                />
                {previewPhotos.length > 1 && (
                  <>
                    <TouchableOpacity
                      onPress={() => stepPreview(-1)}
                      style={[navBtnStyle, { start: 10 }]}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Önceki fotoğraf"
                    >
                      <AppIcon name={dirIcon('chevron-left') as any} size={20} color="#0F172A" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => stepPreview(1)}
                      style={[navBtnStyle, { end: 10 }]}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Sonraki fotoğraf"
                    >
                      <AppIcon name={dirIcon('chevron-right') as any} size={20} color="#0F172A" />
                    </TouchableOpacity>
                    <View style={{
                      position: 'absolute', bottom: 10, alignSelf: 'center',
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                      backgroundColor: 'rgba(15,23,42,0.72)',
                    }}>
                      <Text style={{ fontSize: 11, color: '#FFF', fontFamily: F.semibold }}>
                        {previewIndex + 1} / {previewPhotos.length}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            ) : previewFile?.kind === 'pdf' ? (
              <View style={fpv.fileInfo}>
                <View style={fpv.fileIconBig}>
                  <AppIcon name={'file-pdf-box' as any} size={52} color="#EF4444" />
                </View>
                <Text style={fpv.fileInfoTitle}>PDF Belgesi</Text>
                <View style={fpv.fileInfoMeta}>
                  <View style={fpv.fileMetaRow}>
                    <AppIcon name={'file-outline' as any} size={13} color="#94A3B8" />
                    <Text style={fpv.fileMetaText}>{previewFile.name}</Text>
                  </View>
                  {previewFile.size > 0 && (
                    <View style={fpv.fileMetaRow}>
                      <AppIcon name={'database-outline' as any} size={13} color="#94A3B8" />
                      <Text style={fpv.fileMetaText}>{formatBytes(previewFile.size)}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[fpv.openBtn, { borderColor: '#EF4444' }]}
                  onPress={() => { openFileUrl(previewFile.uri); }}
                >
                  <AppIcon name={'open-in-new' as any} size={14} color="#EF4444" />
                  <Text style={[fpv.openBtnText, { color: '#EF4444' }]}>PDF'yi aç</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={fpv.fileInfo}>
                <View style={fpv.fileIconBig}>
                  <AppIcon name={'file-outline' as any} size={52} color="#64748B" />
                </View>
                <Text style={fpv.fileInfoTitle}>{previewFile?.name ?? 'Dosya'}</Text>
                {(previewFile?.size ?? 0) > 0 && (
                  <Text style={fpv.fileMetaText}>{formatBytes(previewFile!.size)}</Text>
                )}
                <TouchableOpacity
                  style={fpv.openBtn}
                  onPress={() => { openFileUrl(previewFile?.uri); }}
                >
                  <AppIcon name={'open-in-new' as any} size={14} color="#64748B" />
                  <Text style={[fpv.openBtnText, { color: '#64748B' }]}>Yeni sekmede aç</Text>
                </TouchableOpacity>
              </View>
            )}

          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 3D tarama görüntüleyici — lab ile AYNI Viewer3DModal (tek/çoklu) ── */}
      {viewer3DFiles && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModalLazy
            visible
            files={viewer3DFiles}
            title={viewer3DFiles.length > 1 ? `${viewer3DFiles.length} tarama birlikte` : viewer3DFiles[0]?.name}
            onClose={() => setViewer3DFiles(null)}
          />
        </React.Suspense>
      )}

      {/* ── Chat popup modal ── */}
      <Modal
        visible={chatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChatModalVisible(false)}
      >
        <Pressable style={chatModal.overlay} onPress={() => setChatModalVisible(false)}>
          <Pressable style={[chatModal.sheet, { backgroundColor: T.card }]} onPress={(e: any) => e.stopPropagation()}>
            <View style={[chatModal.header, { backgroundColor: T.card, borderBottomColor: T.hairline }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <AppIcon name={'forum' as any} size={18} color={P} />
                <View>
                  <Text style={[chatModal.headerTitle, { color: T.ink }]}>Mesaj kutusu</Text>
                  <Text style={[chatModal.headerSub, { color: T.ink3 }]}>Bu vakaya özel notlar, sesli mesajlar ve dosyalar</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setChatModalVisible(false)} style={chatModal.closeBtn}>
                <AppIcon name={'close' as any} size={20} color={T.ink3} />
              </TouchableOpacity>
            </View>
            <ChatBox
              messages={form.chat_messages}
              onAdd={(msg) => { console.log('[NewOrderScreen.onAdd] received msg', msg.id, 'type:', msg.type); setForm(f => { const next = { ...f, chat_messages: [...f.chat_messages, msg] }; console.log('[NewOrderScreen.onAdd] new chat_messages count:', next.chat_messages.length); return next; }); }}
              onDelete={(id) => setForm(f => ({ ...f, chat_messages: f.chat_messages.filter(m => m.id !== id) }))}
              hideHeader
              accentColor={P}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Interaktif form turu — fullScreen modal kök overlay'i örttüğü için
          spotlight burada, formun ÜSTÜNDE çizilir. Tur aktif değilken null. */}
      {tourGuided && <OnboardingOverlay host="newOrder" />}

    </SafeAreaView>
  );
}

// ── Submit sonrası başarı ekranı ──────────────────────────────────────────
// ── İmplant marka seçici (FilesUploadModal'ın implantBrandSlot'una geçer) ──
// Liste, arama, seçim + kütüphane indirme linki.
const IMPLANT_LIBRARY_LINKS: Record<string, string> = {
  // ── Yerli (Türkiye) ──
  'Implance':            'https://www.implance.com/digital',
  'Bilimplant':          'https://bilimplant.com/dijital-cozumler/',
  'NucleOSS':            'https://nucleoss.com/dijital',
  'AGS Medikal':         'https://www.agsmedikal.com/dijital',
  'Mode Medikal':        'https://www.modemedikal.com/dijital',
  'Mode Implant':        'https://www.modemedikal.com/dijital',
  'Trinon Q-Implant':    'https://www.trinon.com/digital-services/',
  'İmplad':              'https://implad.com.tr/',
  // ── Uluslararası ──
  'Straumann':           'https://www.straumann.com/en/dental-professionals/services-and-forms/downloads.html',
  'Nobel Biocare':       'https://www.nobelbiocare.com/en/digital-workflow-and-equipment/dental-cad-cam-software/scan-bodies',
  'Osstem':              'https://www.hiossen.com/digital-dentistry/scan-bodies',
  'Zimmer Biomet':       'https://www.zimvie.com/en/dental/digital-dentistry/digital-workflow.html',
  'Dentsply Sirona':     'https://www.dentsplysirona.com/en/explore/implants/dental-implant-digital-workflows.html',
  'Megagen':             'https://megagen.com/scan-body-library/',
  'Neodent':             'https://www.neodent.com/en/digital-solutions',
  'BioHorizons':         'https://www.biohorizons.com/digital-scanning.aspx',
  'Camlog':              'https://www.camlog.com/en/products/digital-dentistry/dedicam-scanbody/',
  'Astra Tech (Dentsply)':'https://www.dentsplysirona.com/en/explore/implants/astra-tech-implant-system.html',
  'Ankylos':             'https://www.dentsplysirona.com/en/explore/implants/ankylos.html',
  'Bicon':               'https://www.bicon.com/cad-cam/',
  'Biomet 3i':           'https://www.zimvie.com/en/dental.html',
  'Blue Sky Bio':        'https://blueskybio.com/store/downloads.html',
  'Dentium':             'https://www.dentium.com/en/main/main.php',
  'DIO Implant':         'https://en.diodent.com/digital_workflow.html',
  'Keystone Dental':     'https://www.keystonedental.com/digital-dentistry/',
  'MIS Implants':        'https://www.mis-implants.com/en-int/digital-dentistry',
  'Phibo':               'https://www.phibo.com/digital-workflow/',
  'Southern Implants':   'https://southernimplants.com/digital-dentistry/',
  'Bredent':             'https://www.bredent-medical.com/en/products/digital-implant-prosthetics/',
  'Cortex':              'https://www.cortex-dental.com/digital/',
  'Alpha-Bio Tec':       'https://www.alpha-bio.net/en/digital-dentistry/',
  'Euroteknika':         'https://www.euroteknika.com/en/digital-dentistry',
  'Implant Direct':      'https://www.implantdirect.com/clinical-resources/cad-cam-libraries',
  'Adin':                'https://www.adin-implants.com/digital-dentistry/',
  'Thommen Medical':     'https://www.thommenmedical.com/en/products/digital-dentistry/',
  'Bionika':             'https://www.bionikadental.com/digital/',
  'T-Plus':              'https://www.t-plusimplant.com/',
  'Seven Implant':       'https://www.mis-implants.com/seven',
};
function getImplantLibraryLink(brand: string): string {
  if (!brand) return '';
  if (IMPLANT_LIBRARY_LINKS[brand]) return IMPLANT_LIBRARY_LINKS[brand];
  return `https://www.google.com/search?q=${encodeURIComponent(brand + ' scan body library download')}`;
}

// ── Premium İmplant Bilgileri Section ───────────────────────────────────
// Sol: Scan Body STL upload zone (empty / uploading / success states)
// Sağ üst: Combobox (verified library badge)
// Sağ alt: Library download CTA (Official source + exocad uyumluluk)
function ImplantInfoSection({
  brand, onBrandChange,
  scanFile, onPickScan, onRemoveScan,
  accent,
}: {
  brand: string;
  onBrandChange: (v: string) => void;
  scanFile: AttachedFile | null;
  onPickScan: () => void;
  onRemoveScan: () => void;
  accent: string;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const NO = useNOTokens();
  const hasVerifiedLibrary = !!brand && !!IMPLANT_LIBRARY_LINKS[brand];
  const libLink = getImplantLibraryLink(brand);

  const fileStatus =
    !scanFile ? 'empty'
    : scanFile.upload_status === 'uploading' ? 'uploading'
    : scanFile.upload_status === 'error' ? 'error'
    : 'done';

  const fileSizeStr = scanFile ? formatBytes(scanFile.size ?? 0) : '';
  const fileExt = scanFile?.name.split('.').pop()?.toUpperCase() ?? 'STL';

  const openLib = () => {
    if (!libLink) return;
    if (Platform.OS === 'web') { try { window.open(libLink, '_blank'); } catch {} }
    else Linking.openURL(libLink);
  };

  return (
    <View style={{ gap: 10 }}>
      {/* ── Üst sıra: 2 kart yan yana ── */}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>

        {/* ═════ SOL — Scan Body STL Upload Zone ═════ */}
        <Pressable
          onPress={fileStatus === 'empty' ? onPickScan : undefined}
          style={({ hovered }: any) => ({
            flex: 1,
            minWidth: 220,
            minHeight: 156,
            borderRadius: 14,
            borderWidth: 1,
            borderStyle: (fileStatus === 'empty' ? 'dashed' : 'solid') as any,
            borderColor: fileStatus === 'done' ? accent + '40'
                       : fileStatus === 'error' ? '#EF444466'
                       : hovered && fileStatus === 'empty' ? accent + '80' : '#CBD5E1',
            backgroundColor: fileStatus === 'done' ? accent + '05'
                           : fileStatus === 'error' ? '#FEF2F2'
                           : hovered && fileStatus === 'empty' ? accent + '06' : '#FAFAFA',
            padding: 14,
            justifyContent: 'center' as any,
            ...(Platform.OS === 'web'
              ? {
                  cursor: (fileStatus === 'empty' ? 'pointer' : 'default') as any,
                  transition: 'all 0.18s ease',
                } as any
              : {}),
          })}
        >
          {fileStatus === 'empty' && (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 16,
                backgroundColor: accent + '14',
                borderWidth: 1, borderColor: accent + '20',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <AppIcon name={'cube-scan' as any} size={28} color={accent} />
              </View>
              <Text style={{ fontSize: 13, fontFamily: F.semibold, color: NO.inkStrong }}>
                Scan Body STL
              </Text>
              <Text style={{ fontSize: 10.5, fontFamily: F.regular, color: NO.inkMute, textAlign: 'center', lineHeight: 14 }}>
                STL · PLY · OBJ formatında{'\n'}sürükle bırak veya tıkla
              </Text>
            </View>
          )}

          {fileStatus === 'uploading' && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: accent + '14',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <AppIcon name={'cube-outline' as any} size={16} color={accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 9.5, fontFamily: F.bold, color: accent, letterSpacing: 0.7 }}>
                    YÜKLENİYOR · %{scanFile?.upload_progress ?? 0}
                  </Text>
                  <Text style={{ fontSize: 12, fontFamily: F.semibold, color: NO.inkStrong, marginTop: 2 }} numberOfLines={1}>
                    {scanFile?.name}
                  </Text>
                </View>
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: accent + '14' }}>
                <View style={{
                  height: 4, borderRadius: 2,
                  width: `${scanFile?.upload_progress ?? 0}%` as any,
                  backgroundColor: accent,
                }} />
              </View>
            </View>
          )}

          {fileStatus === 'done' && scanFile && (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 42, height: 42, borderRadius: 12,
                  backgroundColor: accent + '14',
                  borderWidth: 1, borderColor: accent + '28',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <AppIcon name={'cube-outline' as any} size={20} color={accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: NO.success }} />
                    <Text style={{ fontSize: 9, fontFamily: F.bold, color: NO.success, letterSpacing: 0.6 }}>
                      YÜKLENDİ
                    </Text>
                    <View style={{
                      paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5,
                      backgroundColor: accent + '12',
                    }}>
                      <Text style={{ fontSize: 9, fontFamily: F.bold, color: accent, letterSpacing: 0.4 }}>
                        {fileExt}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12.5, fontFamily: F.semibold, color: NO.inkStrong, marginTop: 2 }} numberOfLines={1}>
                    {scanFile.name}
                  </Text>
                  <Text style={{ fontSize: 10.5, fontFamily: F.regular, color: NO.inkMute, marginTop: 1 }}>
                    {fileSizeStr}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable
                  onPress={onPickScan}
                  style={({ hovered }: any) => ({
                    flex: 1,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8,
                    backgroundColor: hovered ? accent + '14' : '#FFFFFF',
                    borderWidth: 1, borderColor: accent + '30',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any, transition: 'all 0.15s ease' } as any : {}),
                  })}
                >
                  <AppIcon name={'refresh' as any} size={12} color={accent} />
                  <Text style={{ fontSize: 11, fontFamily: F.semibold, color: accent }}>Değiştir</Text>
                </Pressable>
                <Pressable
                  onPress={onRemoveScan}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8,
                    backgroundColor: hovered ? '#FEE2E2' : '#FFFFFF',
                    borderWidth: 1, borderColor: '#FCA5A540',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any, transition: 'all 0.15s ease' } as any : {}),
                  })}
                >
                  <AppIcon name={'close' as any} size={12} color="#DC2626" />
                </Pressable>
              </View>
            </View>
          )}

          {fileStatus === 'error' && (
            <View style={{ alignItems: 'center', gap: 6 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 12,
                backgroundColor: '#FEE2E2',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <AppIcon name={'alert-circle-outline' as any} size={22} color="#DC2626" />
              </View>
              <Text style={{ fontSize: 12, fontFamily: F.semibold, color: '#DC2626' }}>
                Yükleme hatası
              </Text>
              <Pressable onPress={onPickScan} style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: '#FCA5A5',
              }}>
                <Text style={{ fontSize: 11, fontFamily: F.semibold, color: '#DC2626' }}>Tekrar dene</Text>
              </Pressable>
            </View>
          )}
        </Pressable>

        {/* ═════ SAĞ — İmplant Marka Combobox ═════ */}
        <View style={{
          flex: 1, minWidth: 220, minHeight: 156,
          borderRadius: 14,
          borderWidth: 1, borderColor: brand ? accent + '40' : (isDark ? 'rgba(255,255,255,0.10)' : '#E2E8F0'),
          backgroundColor: brand ? accent + (isDark ? '14' : '04') : 'transparent',
          padding: 14,
          gap: 10,
          overflow: 'visible' as any,
          ...(Platform.OS === 'web' ? { transition: 'all 0.18s ease' } as any : {}),
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{
              width: 18, height: 18, borderRadius: 6,
              backgroundColor: accent + '14',
              borderWidth: 1, borderColor: accent + '24',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <AppIcon name={'screw-machine-flat-top' as any} size={10} color={accent} />
            </View>
            <Text style={{ fontSize: 10, fontFamily: F.bold, color: T.ink, letterSpacing: 0.6 }}>
              İMPLANT MARKA
            </Text>
            {hasVerifiedLibrary && (
              <View style={{
                marginStart: 'auto' as any,
                flexDirection: 'row', alignItems: 'center', gap: 3,
                paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
                backgroundColor: NO.success + '14',
                borderWidth: 1, borderColor: NO.success + '28',
              }}>
                <AppIcon name={'check-decagram' as any} size={9} color={NO.success} />
                <Text style={{ fontSize: 8.5, fontFamily: F.bold, color: NO.success, letterSpacing: 0.4 }}>
                  VERIFIED
                </Text>
              </View>
            )}
          </View>

          <ImplantBrandCombobox value={brand} onChange={onBrandChange} accent={accent} />

          {/* Brand seçildikten sonra Library Download */}
          {brand && (
            <Pressable
              onPress={openLib}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 9,
                paddingVertical: 9, paddingHorizontal: 11,
                borderRadius: 10,
                backgroundColor: hovered ? accent + '1A' : accent + '10',
                borderWidth: 1, borderColor: accent + '30',
                ...(Platform.OS === 'web' ? {
                  cursor: 'pointer' as any,
                  transition: 'all 0.18s ease',
                  boxShadow: hovered ? `0 4px 14px ${accent}30` : 'none',
                } as any : {}),
              })}
            >
              <View style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: accent,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <AppIcon name={'download' as any} size={14} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11.5, fontFamily: F.semibold, color: NO.inkStrong }} numberOfLines={1}>
                  {brand} Scan Body Kütüphanesi
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                  {hasVerifiedLibrary ? (
                    <Text style={{ fontSize: 9.5, fontFamily: F.semibold, color: accent }}>
                      Resmi kaynak
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 9.5, fontFamily: F.regular, color: NO.inkSoft }}>
                      Topluluk araması
                    </Text>
                  )}
                  <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: NO.inkMute }} />
                  <Text style={{ fontSize: 9.5, fontFamily: F.regular, color: NO.inkSoft }}>
                    exocad 3.2 uyumlu
                  </Text>
                </View>
              </View>
              <AppIcon name={'open-in-new' as any} size={12} color={accent} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// Combobox — popover, search, recent, smooth open
function ImplantBrandCombobox({
  value, onChange, accent,
}: { value: string; onChange: (v: string) => void; accent: string }) {
  const NO = useNOTokens();
  const T = useMobileTokens();
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const RECENT_KEY = 'implant_brand_recents';
  const [recents, setRecents] = useState<string[]>([]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try { const r = window.localStorage.getItem(RECENT_KEY); if (r) setRecents(JSON.parse(r)); } catch {}
  }, []);

  const pushRecent = (b: string) => {
    const next = [b, ...recents.filter(x => x !== b)].slice(0, 5);
    setRecents(next);
    if (Platform.OS === 'web') { try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {} }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ALL_IMPLANT_BRANDS;
    return ALL_IMPLANT_BRANDS.filter(b => b.toLowerCase().includes(q));
  }, [search]);

  return (
    <View style={{ overflow: 'visible' as any }}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={({ hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 7,
          paddingHorizontal: 10, paddingVertical: 9,
          borderRadius: 10,
          backgroundColor: T.cardSoft,
          borderWidth: 1, borderColor: open ? accent : hovered ? accent + '40' : NO.borderSoft,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' as any, transition: 'all 0.15s ease' } as any : {}),
        })}
      >
        <AppIcon name={'magnify' as any} size={13} color={NO.inkSoft} />
        <Text style={{ flex: 1, fontSize: 13, fontFamily: value ? F.semibold : F.regular, color: value ? NO.inkStrong : NO.inkMute }} numberOfLines={1}>
          {value || 'Marka ara veya seç…'}
        </Text>
        {!!value && !!IMPLANT_LIBRARY_LINKS[value] && (
          <AppIcon name={'shield-check-outline' as any} size={12} color={NO.success} />
        )}
        <AppIcon name={(open ? 'chevron-up' : 'chevron-down') as any} size={13} color={NO.inkSoft} />
      </Pressable>

      {open && (
        <View style={{
          position: 'absolute' as any,
          top: '100%',
          left: 0, right: 0,
          marginTop: 6,
          maxHeight: 280,
          borderRadius: 12,
          borderWidth: 1, borderColor: NO.borderSoft,
          backgroundColor: T.card,
          overflow: 'hidden' as any,
          zIndex: 200,
          ...(Platform.OS === 'web'
            ? { boxShadow: '0 16px 40px rgba(0,0,0,0.16)' } as any
            : { elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 10 } }),
        }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: NO.borderSoft, backgroundColor: T.cardSoft }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Marka filtrele…"
              placeholderTextColor={NO.inkMute}
              autoFocus
              style={{
                fontSize: 12.5, color: NO.inkStrong,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              }}
            />
          </View>

          {/* Recent selections */}
          {!search && recents.length > 0 && (
            <View style={{ paddingTop: 6 }}>
              <Text style={{ fontSize: 9, fontFamily: F.bold, color: NO.inkMute, letterSpacing: 0.6, paddingHorizontal: 12, paddingVertical: 4 }}>
                SON KULLANILANLAR
              </Text>
              {recents.map(r => (
                <Pressable
                  key={'recent-' + r}
                  onPress={() => { onChange(r); pushRecent(r); setOpen(false); setSearch(''); }}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 12, paddingVertical: 7,
                    backgroundColor: hovered ? '#F8FAFC' : 'transparent',
                  })}
                >
                  <AppIcon name={'history' as any} size={12} color={NO.inkMute} />
                  <Text style={{ marginStart: 8, flex: 1, fontSize: 12.5, color: NO.inkStrong }}>{r}</Text>
                  {IMPLANT_LIBRARY_LINKS[r] && (
                    <AppIcon name={'check-decagram' as any} size={11} color={NO.success} />
                  )}
                </Pressable>
              ))}
              <View style={{ height: 1, backgroundColor: NO.borderSoft, marginTop: 4 }} />
            </View>
          )}

          <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            {filtered.map(b => {
              const active = b === value;
              const verified = !!IMPLANT_LIBRARY_LINKS[b];
              return (
                <Pressable
                  key={b}
                  onPress={() => { onChange(b); pushRecent(b); setOpen(false); setSearch(''); }}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 12, paddingVertical: 8.5,
                    backgroundColor: active ? accent + '14' : hovered ? '#F8FAFC' : 'transparent',
                  })}
                >
                  <Text style={{
                    flex: 1, fontSize: 12.5,
                    color: active ? accent : NO.inkStrong,
                    fontFamily: active ? F.semibold : F.regular,
                  }}>
                    {b}
                  </Text>
                  {verified && (
                    <AppIcon name={'check-decagram' as any} size={12} color={active ? accent : NO.success} />
                  )}
                  {active && (
                    <AppIcon name={'check' as any} size={13} color={accent} style={{ marginStart: 6 }} />
                  )}
                </Pressable>
              );
            })}
            {filtered.length === 0 && (
              <View style={{ padding: 18, alignItems: 'center' }}>
                <Text style={{ fontSize: 11.5, color: NO.inkMute }}>Sonuç yok</Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function ImplantBrandPicker({
  value, onChange, accent,
}: { value: string; onChange: (v: string) => void; accent: string }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  // Viewport-fixed dropdown konumu — trigger'ın getBoundingClientRect'ından
  // hesaplanır. Portal ile document.body'ye render edildiğinden hiçbir parent
  // overflow/transform clip'leyemez.
  const triggerRef = useRef<any>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ALL_IMPLANT_BRANDS;
    return ALL_IMPLANT_BRANDS.filter(b => b.toLowerCase().includes(q));
  }, [search]);

  const openDropdown = () => {
    if (Platform.OS === 'web' && triggerRef.current && triggerRef.current.getBoundingClientRect) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    setOpen(true);
  };
  const closeDropdown = () => { setOpen(false); setPos(null); };

  return (
    <View style={{
      flex: 1,
      // Scan Body STL kartı ile aynı yükseklik ve görsel stil
      minHeight: 118,
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderStyle: (value ? 'solid' : 'dashed') as any,
      borderColor: value ? accent + '40' : '#CBD5E1',
      padding: 10,
      gap: 8,
      overflow: 'visible' as any,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
        <Text style={{ fontSize: 10, fontFamily: F.bold, color: NO.inkStrong, letterSpacing: 0.5 }}>
          İMPLANT MARKA
        </Text>
      </View>

      {/* Combobox trigger — direkt yazılabilir (searchable). Tıklayınca veya yazınca dropdown açılır. */}
      <View
        ref={triggerRef}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: NO.bgInput,
          borderRadius: 8,
          borderWidth: 1, borderColor: open ? accent : NO.borderSoft,
          paddingHorizontal: 8, paddingVertical: 7,
        }}
      >
        <AppIcon name={'magnify' as any} size={13} color={NO.inkSoft} />
        <TextInput
          value={open ? search : value}
          onChangeText={(t) => {
            setSearch(t);
            if (!open) openDropdown();
          }}
          onFocus={() => { if (!open) openDropdown(); }}
          placeholder={value || 'Marka ara…'}
          placeholderTextColor={value ? NO.inkStrong : NO.inkMute}
          style={{
            flex: 1, fontSize: 12, color: NO.inkStrong,
            padding: 0,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
          }}
        />
        {!!value && !open && (
          <Pressable onPress={() => onChange('')} hitSlop={6}>
            <AppIcon name={'close' as any} size={12} color={NO.inkMute} />
          </Pressable>
        )}
        <Pressable onPress={() => (open ? closeDropdown() : openDropdown())} hitSlop={6}>
          <AppIcon name={(open ? 'chevron-up' : 'chevron-down') as any} size={13} color={NO.inkSoft} />
        </Pressable>
      </View>

      {/* Dropdown — web'de body portalına, native'de absolute. Hiçbir parent overflow'una takılmaz. */}
      {open && Platform.OS === 'web' && pos && (
        <WebPortal>
          <View
            style={{
              position: 'fixed' as any,
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: 280,
              borderRadius: 10,
              borderWidth: 1, borderColor: NO.borderSoft,
              backgroundColor: '#FFFFFF',
              overflow: 'hidden' as any,
              zIndex: 10000,
              ...(Platform.OS === 'web' ? { boxShadow: '0 16px 40px rgba(0,0,0,0.18)' } as any : {}),
            }}
          >
            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={(Platform.OS as string) === 'ios'}>
              {filtered.map(brand => {
                const active = brand === value;
                return (
                  <Pressable
                    key={brand}
                    onPress={() => { onChange(brand); closeDropdown(); setSearch(''); }}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 12, paddingVertical: 9,
                      backgroundColor: active ? accent + '14' : hovered ? '#F8FAFC' : 'transparent',
                    })}
                  >
                    <Text style={{
                      flex: 1, fontSize: 13,
                      color: active ? accent : NO.inkStrong,
                      fontFamily: active ? F.semibold : F.regular,
                    }}>
                      {brand}
                    </Text>
                    {active && <AppIcon name={'check' as any} size={14} color={accent} />}
                  </Pressable>
                );
              })}
              {filtered.length === 0 && (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: NO.inkMute }}>Sonuç yok</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </WebPortal>
      )}

      {/* Native fallback */}
      {open && Platform.OS !== 'web' && (
        <View style={{
          position: 'absolute' as any,
          top: '100%' as any,
          left: 0, right: 0,
          marginTop: 6,
          maxHeight: 260,
          borderRadius: 10,
          borderWidth: 1, borderColor: NO.borderSoft,
          backgroundColor: '#FFFFFF',
          overflow: 'hidden' as any,
          zIndex: 200,
          elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 8 },
        }}>
          {/* İçeride mini search input */}
          <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: NO.borderSoft }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Marka filtrele…"
              placeholderTextColor={NO.inkMute}
              autoFocus
              style={{
                fontSize: 13, color: NO.inkStrong,
                ...((Platform.OS as string) === 'web' ? { outlineStyle: 'none' } as any : {}),
              }}
            />
          </View>
          <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            {filtered.map(brand => {
              const active = brand === value;
              return (
                <Pressable
                  key={brand}
                  onPress={() => { onChange(brand); setOpen(false); setSearch(''); }}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 12, paddingVertical: 9,
                    backgroundColor: active ? accent + '14' : hovered ? '#F8FAFC' : 'transparent',
                  })}
                >
                  <Text style={{
                    flex: 1, fontSize: 13,
                    color: active ? accent : NO.inkStrong,
                    fontFamily: active ? F.semibold : F.regular,
                  }}>
                    {brand}
                  </Text>
                  {active && <AppIcon name={'check' as any} size={14} color={accent} />}
                </Pressable>
              );
            })}
            {filtered.length === 0 && (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: NO.inkMute }}>Sonuç yok</Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}

    </View>
  );
}

function NewOrderSuccess({
  accent, orderNumber, patientName, panel,
  onNewOrder, onViewOrder, onClose,
}: {
  accent: string;
  orderNumber: string;
  patientName: string;
  panel: 'doctor' | 'clinic' | 'lab' | 'admin' | 'station';
  onNewOrder: () => void;
  onViewOrder: () => void;
  onClose: () => void;
}) {
  void accent; // panel accent yerine başarı durumu için sabit yeşil kullanılıyor
  const SUCCESS_GREEN = '#2D9A6B';
  const handleShare = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const text = `Sipariş #${orderNumber} · ${patientName}`;
      // @ts-ignore web navigator
      if (typeof navigator !== 'undefined' && navigator.share) {
        // @ts-ignore
        await navigator.share({ title: 'Sipariş', text, url: typeof window !== 'undefined' ? window.location.href : undefined });
      } else if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(text);
        toast.success('Sipariş bilgisi kopyalandı');
      }
    } catch { /* user cancelled */ }
  };

  // Panel'e göre primary metin label (hekim → klinik akışı vb. değişebilir)
  const primaryLabel = panel === 'doctor' || panel === 'clinic' ? 'Vakayı gör' : 'Detayı aç';

  return (
    <View
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 200,
        backgroundColor: 'rgba(15,23,42,0.55)',
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 24,
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } as any : {}),
      } as any}
    >
      {/* Backdrop click closes */}
      <Pressable
        onPress={onClose}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as any}
      />

      {/* Centered popup card */}
      <View style={{
        width: '100%', maxWidth: 460, borderRadius: 24,
        backgroundColor: SUCCESS_GREEN,
        paddingVertical: 40, paddingHorizontal: 32,
        alignItems: 'center',
        ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(15,23,42,0.35)' } as any : {}),
      } as any}>
        {/* Close (X) top-right of card */}
        <Pressable
          onPress={onClose}
          accessibilityLabel="Kapat"
          style={{
            position: 'absolute', top: 16, end: 16, zIndex: 10,
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center', justifyContent: 'center',
          } as any}
        >
          <AppIcon name={'close' as any} size={16} color="#FFFFFF" />
        </Pressable>

        {/* Büyük check yuvarlağı */}
        <View style={{
          width: 96, height: 96, borderRadius: 48,
          backgroundColor: '#FFFFFF',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 22,
        }}>
          <AppIcon name={'check' as any} size={48} color={SUCCESS_GREEN} />
        </View>

        {/* Başlık */}
        <Text style={{
          fontSize: 22, fontWeight: '600', color: '#FFFFFF',
          textAlign: 'center', letterSpacing: -0.3,
          ...(Platform.OS === 'web' ? { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' } : {}),
        }}>
          Sipariş gönderildi
        </Text>

        {/* Açıklama */}
        <Text style={{
          fontSize: 13, color: 'rgba(255,255,255,0.9)',
          textAlign: 'center', marginTop: 10, lineHeight: 19,
        }}>
          {patientName ? `${patientName} için ` : ''}sipariş başarıyla kaydedildi.
          {orderNumber ? '\n' : ''}
          {orderNumber ? (
            <Text style={{ fontWeight: '600' }}>Sipariş no #{orderNumber}</Text>
          ) : null}
        </Text>

        <Text style={{
          fontSize: 12, color: 'rgba(255,255,255,0.75)',
          textAlign: 'center', marginTop: 10, lineHeight: 17,
        }}>
          Vakanızın durumunu <Text style={{ fontWeight: '600', color: '#FFFFFF' }}>Vakalar</Text> sayfasından takip edebilirsiniz.
        </Text>

        {/* CTA butonları */}
        <View style={{ width: '100%', maxWidth: 340, marginTop: 26, gap: 10 }}>
        <Pressable
          onPress={onViewOrder}
          style={({ pressed }: any) => ({
            paddingVertical: 16, borderRadius: 999,
            backgroundColor: '#FFFFFF',
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.92 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: SUCCESS_GREEN }}>
            {primaryLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={onNewOrder}
          style={({ pressed }: any) => ({
            paddingVertical: 16, borderRadius: 999,
            backgroundColor: 'transparent',
            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
            Yeni sipariş oluştur
          </Text>
        </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── File helpers ─────────────────────────────────────────────────────────────

function resolveFileKind(name: string): FileKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'].includes(ext)) return 'photo';
  if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return 'video';
  if (ext === 'stl') return 'stl';
  if (ext === 'ply') return 'ply';
  if (ext === 'pdf') return 'pdf';
  return 'other';
}

function kindLabel(kind: FileKind): string {
  switch (kind) {
    case 'photo': return 'Fotoğraf';
    case 'video': return 'Video';
    case 'stl':   return 'STL';
    case 'ply':   return 'PLY';
    case 'pdf':   return 'PDF';
    default:      return 'Dosya';
  }
}

/** İstenilen dosya türünün başlığını döndürür (asıl filename yerine). */
function fileDisplayTitle(file: AttachedFile): string {
  const n = file.name;
  // Yeni etiketler (yeni yüklemeler)
  if (n.startsWith('Ekartörlü Fotoğraf')) return 'Ekartörlü Fotoğraf';
  if (n.startsWith('Gülüş Fotoğrafı'))    return 'Gülüş Fotoğrafı';
  if (n.startsWith('Gülüş Videosu'))      return 'Gülüş Videosu';
  if (n.startsWith('Alt Çene Taraması'))  return 'Alt Çene Taraması';
  if (n.startsWith('Üst Çene Taraması'))  return 'Üst Çene Taraması';
  if (n.startsWith('Kapanış Taraması'))   return 'Kapanış Taraması';
  if (n.startsWith('Diş Eti Taraması'))   return 'Diş Eti Taraması';
  if (n.startsWith('Scan Body Taraması')) return 'Scan Body Taraması';
  if (n.startsWith('PDF Belgesi'))        return 'PDF Belgesi';
  if (n.startsWith('Referans Fotoğrafı')) return 'Referans Fotoğrafı';
  // Legacy fallback
  if (n.startsWith('Ekartörlü Resim'))    return 'Ekartörlü Fotoğraf';
  if (n.startsWith('Gülüş Resmi'))        return 'Gülüş Fotoğrafı';
  if (n.startsWith('Alt Çene'))           return 'Alt Çene Taraması';
  if (n.startsWith('Üst Çene'))           return 'Üst Çene Taraması';
  if (n.startsWith('Bite (Kapanış)'))     return 'Kapanış Taraması';
  if (n.startsWith('Bite'))               return 'Kapanış Taraması';
  if (n.startsWith('Scan Body STL'))      return 'Scan Body Taraması';
  if (n.startsWith('Referans Fotoğraf'))  return 'Referans Fotoğrafı';
  switch (file.kind) {
    case 'photo': return 'Hasta Fotoğrafı';
    case 'stl':   return 'STL Tarama Dosyası';
    case 'ply':   return 'PLY Tarama Dosyası';
    case 'pdf':   return 'PDF Belgesi';
    default:      return 'Dosya';
  }
}

function kindIcon(kind: FileKind): string {
  switch (kind) {
    case 'photo': return 'image-outline';
    case 'video': return 'video-outline';
    case 'stl':   return 'cube-outline';
    case 'ply':   return 'cube-scan';
    case 'pdf':   return 'file-pdf-box';
    default:      return 'paperclip';
  }
}

function kindColor(kind: FileKind): string {
  switch (kind) {
    case 'photo': return '#8B5CF6';
    case 'stl':   return '#32BB78';
    case 'ply':   return '#06B6D4';
    case 'pdf':   return '#EF4444';
    default:      return '#64748B';
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)            return `${bytes} B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── FileRow ──────────────────────────────────────────────────────────────────

function FileRow({ file, onRemove, onPreview }: { file: AttachedFile; onRemove: () => void; onPreview?: () => void }) {
  const color = kindColor(file.kind);
  // Dosyayı orijinal adıyla indir (kontrol/hata ayıklama için). fetch→blob→objectURL
  // → yerel blob URL de uzak URL de çalışır.
  const downloadFile = async () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !file.uri) return;
    try {
      const res = await fetch(file.uri);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = file.name || 'dosya';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[new-order] download failed', file.name, e);
    }
  };
  return (
    <View style={_fusStatic.fileRow}>
      {/* Thumbnail for photos, icon for others */}
      {file.kind === 'photo' && file.uri ? (
        <TouchableOpacity onPress={onPreview} activeOpacity={0.85} style={_fusStatic.fileThumbWrap}>
          <Image source={{ uri: file.uri }} style={_fusStatic.fileThumb} resizeMode="cover" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onPreview}
          activeOpacity={onPreview ? 0.7 : 1}
          style={[_fusStatic.fileIconWrap, { backgroundColor: color + '18' }]}
        >
          <AppIcon name={kindIcon(file.kind) as any} size={16} color={color} />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={_fusStatic.fileName} numberOfLines={1}>{fileDisplayTitle(file)}</Text>
        <Text style={_fusStatic.fileMeta} numberOfLines={1}>
          {file.name}{file.size > 0 ? ` · ${formatBytes(file.size)}` : ''}
        </Text>
      </View>
      {onPreview && (
        <TouchableOpacity onPress={onPreview} style={_fusStatic.filePreviewBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <AppIcon name={'eye-outline' as any} size={16} color="#64748B" />
        </TouchableOpacity>
      )}
      {!!file.uri && (
        <TouchableOpacity onPress={downloadFile} style={_fusStatic.filePreviewBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Dosyayı indir">
          <AppIcon name={'download' as any} size={16} color="#64748B" />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onRemove} style={_fusStatic.fileRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <AppIcon name={'close' as any} size={14} color="#94A3B8" />
      </TouchableOpacity>
    </View>
  );
}

// ── File Upload Section styles ────────────────────────────────────────────────
const makeFusStyles = (P: string) => StyleSheet.create({
  /* Two-column layout */
  twoCol: {
    flexDirection: 'row', gap: 0, alignItems: 'flex-start',
  },
  twoColLeft: {
    flex: 1, paddingEnd: 16,
  },
  twoColDivider: {
    width: 1, backgroundColor: '#F1F5F9', alignSelf: 'stretch',
  },
  twoColRight: {
    flex: 1, paddingStart: 16,
  },
  /* Empty state for right column */
  emptyState: {
    alignItems: 'center', paddingVertical: 32, gap: 6,
  },
  emptyStateText: {
    fontSize: 13, fontFamily: F.medium, color: '#94A3B8',
  },
  emptyStateHint: {
    fontSize: 11, fontFamily: F.regular, color: '#CBD5E1', textAlign: 'center',
  },

  subHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  subLabel:  { fontSize: 10, fontFamily: F.semibold, color: '#94A3B8', letterSpacing: 0.8 },
  subHint:   { fontSize: 11, fontFamily: F.regular,  color: '#CBD5E1' },

  sectionDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 14 },

  /* ── Dosya yükleme tetikleyicisi ── */
  uploadTrigger: {
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 24, flex: 1,
  },
  uploadTriggerIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  uploadTriggerTitle: { fontSize: 15, fontFamily: F.semibold },
  uploadTriggerSub:   { fontSize: 12, fontFamily: F.regular, color: '#94A3B8', marginTop: 2 },
  uploadTriggerBadge: {
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  uploadTriggerBadgeText: { fontSize: 11, fontFamily: F.bold, color: '#FFFFFF' },

  /* ── Upload Modal — NO design system ── */
  umOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  umCard: {
    backgroundColor: NO.bgStage, borderRadius: NORadius.xl,
    width: '100%', maxWidth: 1000, maxHeight: '95%' as any,
    overflow: 'hidden',
  },
  umHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: NO.borderSoft,
  },
  umHeaderIcon: {
    width: 34, height: 34, borderRadius: NORadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  umHeaderTitle: { fontSize: 15, fontFamily: F.bold, color: NO.inkStrong },
  umCloseBtn: {
    width: 32, height: 32, borderRadius: NORadius.sm,
    backgroundColor: NO.bgInput, alignItems: 'center', justifyContent: 'center',
  },
  umSectionLabel: {
    fontSize: 10, fontFamily: F.semibold, color: NO.inkMute,
    letterSpacing: 0.8, marginBottom: 10,
  },
  umFileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: NORadius.md, borderWidth: 1.5,
    borderStyle: 'dashed' as any, borderColor: NO.borderMedium,
    backgroundColor: NO.bgInput,
  },
  umFileBtnText: { fontSize: 13, fontFamily: F.semibold, flex: 1 },
  umFileBtnHint: { fontSize: 11, fontFamily: F.regular, color: NO.inkMute },
  umFooter: {
    padding: 14, borderTopWidth: 1, borderTopColor: NO.borderSoft,
    alignItems: 'flex-end',
  },
  umOkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 22,
    borderRadius: NORadius.md,
  },
  umOkBtnText: { fontSize: 13, fontFamily: F.semibold, color: '#FFFFFF' },

  /* 2×2 grid layout */
  umGrid: {
    flexDirection: 'row' as any, flexWrap: 'wrap' as any, gap: 12,
  },
  umCol: { flex: 1, minWidth: 0 },

  /* Grup — each takes ~half width so 2 per row */
  umGroup: {
    flexBasis: 'calc(50% - 6px)' as any,
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: NORadius.xl,
    padding: 14,
  },
  umGroupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  umGroupDot: {
    width: 7, height: 7, borderRadius: 4,
  },
  umGroupTitle: {
    fontSize: 13, fontFamily: F.bold, color: NO.inkStrong,
  },

  /* ── Kare yükleme kartları ── */
  uploadCardRow: {
    flexDirection: 'row' as any, flexWrap: 'wrap' as any, gap: 8,
  },
  uploadCard: {
    width: 100, height: 118, borderRadius: NORadius.md,
    backgroundColor: NO.bgInput,
    borderWidth: 1, borderColor: NO.borderSoft,
    overflow: 'hidden' as any,
    position: 'relative' as any,
  },
  uploadCardDashed: {
    borderStyle: 'dashed' as any,
    borderColor: NO.borderMedium,
    backgroundColor: NO.bgInput,
  },
  uploadCardTab: {
    height: 8, width: '50%', alignSelf: 'center' as any,
    borderBottomStartRadius: 5, borderBottomEndRadius: 5,
    marginBottom: 0,
  },
  uploadCardBody: {
    paddingHorizontal: 8, paddingTop: 6, paddingBottom: 36,
    alignItems: 'center' as any,
  },
  uploadCardIcon: {
    alignItems: 'center' as any, justifyContent: 'center' as any,
    width: '100%', paddingVertical: 6,
  },
  uploadCardThumbWrap: {
    width: '100%', height: 54,
    borderRadius: 8, overflow: 'hidden' as any,
    position: 'relative' as any, marginBottom: 4,
  },
  uploadCardThumbImg: { width: '100%', height: 54 },
  uploadCardThumbOverlay: {
    position: 'absolute' as any, inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },
  uploadCardLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6,
  },
  uploadCardLabel: {
    fontSize: 11, fontFamily: F.semibold, color: NO.inkStrong, textAlign: 'center' as any,
  },
  uploadCardFileName: {
    fontSize: 10, fontFamily: F.regular, color: NO.success,
    marginTop: 3, width: '100%',
  },
  uploadCardBtn: {
    position: 'absolute' as any, bottom: 8, end: 8,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },
  uploadCardDel: {
    position: 'absolute' as any, top: 16, end: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },

  /* İmplant brand search dropdown card */
  implantBrandCard: {
    flex: 1,
    borderRadius: NORadius.md, backgroundColor: NO.bgInput,
    borderWidth: 1, borderColor: NO.borderSoft,
    overflow: 'visible' as any,
  },
  implantSearchRow: {
    flexDirection: 'row' as any, alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: NORadius.sm,
    borderWidth: 1, borderColor: NO.borderSoft,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  implantSearchInput: {
    flex: 1, fontSize: 13, fontFamily: F.regular, color: NO.inkStrong,
    // @ts-ignore
    outlineStyle: 'none' as any,
  },
  implantDropList: {
    borderRadius: NORadius.md,
    borderWidth: 1, borderColor: NO.borderSoft,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden' as any,
    // @ts-ignore
    boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
  },
  implantDropItem: {
    flexDirection: 'row' as any, alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: NO.borderSoft,
  },
  implantDropItemActive: {
    backgroundColor: NO.saffronSoft,
  },
  implantDropItemText: {
    fontSize: 13, fontFamily: F.regular, color: NO.inkMedium, flex: 1,
  },
  implantDropItemTextActive: {
    fontFamily: F.semibold, color: '#8B5CF6',
  },

  /* Legacy (kept for type-safety, no longer rendered) */
  photoRow:          { flexDirection: 'row' as any },
  photoIcon:         { width: 40, height: 40 },
  photoThumb:        { width: 40, height: 40 },
  photoThumbImg:     { width: 40, height: 40 },
  photoThumbOverlay: { position: 'absolute' as any },
  photoLabel:        { fontSize: 13 },
  photoFileName:     { fontSize: 11 },
  cameraBtn:         { width: 38, height: 38 },
  emptyRow:  {
    paddingVertical: 10, paddingHorizontal: 4,
    marginBottom: 8,
  },
  emptyText: { fontSize: 12, fontFamily: F.regular, color: '#CBD5E1' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1.5,
    borderStyle: 'dashed' as any,
    borderColor: '#CBD5E1',
    backgroundColor: '#F0F9FF',
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  addBtnText: { fontSize: 12, fontFamily: F.semibold, color: P },
  addBtnHint: { fontSize: 11, fontFamily: F.regular,  color: '#93C5FD' },
  divider:    { height: 1, backgroundColor: '#F1F5F9', marginVertical: 14 },
  /* Tooth chips in file section */
  toothChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1.5,
    borderColor: '#F1F5F9', backgroundColor: '#F8FAFC',
  },
  toothChipActive:    { borderColor: P, backgroundColor: P },
  toothChipHasFiles:  { borderColor: '#93C5FD', backgroundColor: '#F1F5F9' },
  toothChipText:      { fontSize: 12, fontFamily: F.semibold, color: '#64748B' },
  toothChipTextActive:{ color: '#FFFFFF' },
  fileDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: P,
  },
  fileDotActive: { backgroundColor: 'rgba(255,255,255,0.75)' },
  /* File row */
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  fileIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  fileThumbWrap: {
    width: 32, height: 32, borderRadius: 6,
    overflow: 'hidden', backgroundColor: '#F1F5F9',
  },
  fileThumb: { width: 32, height: 32 },
  fileName:       { fontSize: 13, fontFamily: F.medium, color: '#1E293B' },
  fileMeta:       { fontSize: 11, fontFamily: F.regular, color: '#94A3B8', marginTop: 1 },
  filePreviewBtn: { padding: 4 },
  fileRemove:     { padding: 4 },
  /* File groups */
  fileGroup: {
    marginBottom: 10,
  },
  fileGroupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginBottom: 4, marginTop: 2,
  },
  fileGroupLabel: {
    fontSize: 10, fontFamily: F.semibold, color: '#94A3B8', letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  /* Total */
  totalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  totalText: { fontSize: 11, fontFamily: F.regular, color: '#64748B' },
});
// Static instance for FileRow (no P-dependent styles used there)
const _fusStatic = makeFusStyles(C.primary);

// ── Çene etiketi yardımcısı ──────────────────────────────────────
const UPPER_TEETH = [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28];
const LOWER_TEETH = [31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48];

function getJawLabel(teeth: number[]): string | null {
  if (teeth.length === 0) return null;
  const set = new Set(teeth);
  const allUpper = UPPER_TEETH.every(t => set.has(t)) && teeth.every(t => UPPER_TEETH.includes(t));
  const allLower = LOWER_TEETH.every(t => set.has(t)) && teeth.every(t => LOWER_TEETH.includes(t));
  const fullMouth = UPPER_TEETH.every(t => set.has(t)) && LOWER_TEETH.every(t => set.has(t)) && teeth.length === 32;
  if (fullMouth) return 'Tam Ağız';
  if (allUpper)  return 'Üst Çene';
  if (allLower)  return 'Alt Çene';
  return null;
}

// Tooth ops'ları iş türüne göre gruplayıp çene etiketlerini hesapla
type ToothGroup = { key: string; label: string; ops: ToothOp[] };
function groupToothOps(tooth_ops: ToothOp[]): ToothGroup[] {
  const map: Record<string, ToothOp[]> = {};
  tooth_ops.forEach(op => {
    const k = op.work_type || '__none__';
    if (!map[k]) map[k] = [];
    map[k].push(op);
  });
  return Object.entries(map).map(([k, ops]) => {
    const jawLabel = getJawLabel(ops.map(o => o.tooth));
    const typeLabel = k === '__none__' ? 'Operasyon yok' : k;
    return {
      key: k,
      label: jawLabel ? `${jawLabel} · ${typeLabel}` : typeLabel,
      ops,
    };
  });
}

// ── LiveSummaryPanel (full-width horizontal card) ────────────────────────────

interface SummaryPanelProps {
  form: FormData;
  selectedDoctor: Doctor | undefined;
  selectedClinic: Clinic | undefined;
  currentStep: Step;
  onOpenChat?: () => void;
  accentColor?: string;
}


function LiveSummaryPanel({ form, selectedDoctor, selectedClinic, currentStep, onOpenChat, accentColor }: SummaryPanelProps) {
  const P = accentColor ?? C.primary;
  const lsp = useMemo(() => makeLspStyles(P), [P]);
  const itemTotal = form.pending_items.reduce((s, i) => s + i.price * i.quantity, 0);
  const sortedOps = [...form.tooth_ops].sort((a, b) => a.tooth - b.tooth);
  const noOpCount = form.tooth_ops.filter(o => !o.work_type).length;

  return (
    <View style={lsp.panel}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      {/* ── Column row ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={lsp.colScroll}
        style={{ flex: 1 }}
      >
        {/* HEKİM */}
        <View style={lsp.col}>
          <Text style={lsp.colLabel}>HEKİM</Text>
          <Text style={lsp.colValue} numberOfLines={1}>
            {selectedDoctor?.full_name || <Text style={lsp.colEmpty}>—</Text>}
          </Text>
          {selectedClinic && (
            <Text style={lsp.colSub} numberOfLines={1}>{selectedClinic.name}</Text>
          )}
        </View>

        <View style={lsp.sep} />

        {/* HASTA */}
        <View style={lsp.col}>
          <Text style={lsp.colLabel}>HASTA</Text>
          <Text style={(form.patient_first_name || form.patient_last_name) ? lsp.colValue : lsp.colEmpty} numberOfLines={1}>
            {[form.patient_first_name, form.patient_last_name].filter(Boolean).join(' ') || '—'}
          </Text>
        </View>

        <View style={lsp.sep} />


        <View style={lsp.sep} />

        {/* DİŞLER */}
        <View style={[lsp.col, { minWidth: 120, maxWidth: 260 }]}>
          <Text style={lsp.colLabel}>
            Dişler{sortedOps.length > 0 ? ` (${sortedOps.length})` : ''}
          </Text>
          {sortedOps.length === 0 ? (
            <Text style={lsp.colEmpty}>—</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 1 }}>
              {groupToothOps(sortedOps).map(group => {
                const jLabel = getJawLabel(group.ops.map(o => o.tooth));
                const filled = group.key !== '__none__';
                if (jLabel) {
                  return (
                    <View key={group.key} style={[lsp.toothPill, filled ? lsp.toothPillFilled : lsp.toothPillEmpty]}>
                      <Text style={[lsp.toothPillText, filled && lsp.toothPillTextFilled]}>{jLabel}</Text>
                    </View>
                  );
                }
                return group.ops.map((op, i) => (
                  <View key={op.__uid ?? `t-${op.tooth}-${i}`} style={[lsp.toothPill, op.work_type ? lsp.toothPillFilled : lsp.toothPillEmpty]}>
                    <Text style={[lsp.toothPillText, op.work_type && lsp.toothPillTextFilled]}>{op.tooth}</Text>
                  </View>
                ));
              })}
            </View>
          )}
        </View>

        {/* TOPLAM — conditional */}
        {itemTotal > 0 && (
          <>
            <View style={lsp.sep} />
            <View style={lsp.col}>
              <Text style={lsp.colLabel}>TOPLAM</Text>
              <Text style={[lsp.colValue, lsp.colValuePrimary]}>
                {itemTotal.toFixed(0)} TRY
              </Text>
            </View>
          </>
        )}

        {/* DOSYALAR — conditional */}
        {form.attachments.length > 0 && (
          <>
            <View style={lsp.sep} />
            <View style={lsp.col}>
              <Text style={lsp.colLabel}>DOSYALAR</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                <AppIcon name={'paperclip' as any} size={12} color="#64748B" />
                <Text style={lsp.colValue}>{form.attachments.length}</Text>
              </View>
            </View>
          </>
        )}

      </ScrollView>

      {/* ── Chat button ── */}
      <View style={lsp.chatBtnWrap}>
        <TouchableOpacity onPress={onOpenChat} style={lsp.chatBtn} activeOpacity={0.8}>
          <AppIcon name={'forum' as any} size={15} color="#fff" />
          <Text style={lsp.chatBtnLabel}>Mesaj kutusu</Text>
        </TouchableOpacity>
      </View>
      </View>{/* end row */}

    </View>
  );
}

// ── LiveSummaryPanel styles ───────────────────────────────────────────────────
const makeLspStyles = (P: string) => StyleSheet.create({
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  colScroll: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 0,
  },
  col: {
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
    minWidth: 90,
  },
  colLabel: {
    fontSize: 9, fontFamily: F.semibold, color: '#94A3B8',
    letterSpacing: 0.8, marginBottom: 4,
  },
  colValue: {
    fontSize: 13, fontFamily: F.medium, color: '#0F172A',
  },
  colValuePrimary: { fontSize: 13, fontFamily: F.medium, color: P },
  colSub: {
    fontSize: 11, fontFamily: F.regular, color: '#64748B', marginTop: 2,
  },
  colEmpty: {
    fontSize: 13, fontFamily: F.regular, color: '#CBD5E1',
  },
  sep: {
    width: 1, alignSelf: 'stretch',
    backgroundColor: '#F1F5F9',
    marginVertical: 2,
  },
  /* Tooth pills */
  toothPill: {
    paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 6, borderWidth: 1,
  },
  toothPillFilled: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  toothPillEmpty:  { backgroundColor: '#F8FAFC', borderColor: '#F1F5F9' },
  toothPillText:   { fontSize: 10, fontFamily: F.semibold, color: '#94A3B8' },
  toothPillTextFilled: { color: P },
  /* Warning badge (in column) */
  warnBadge: {
    backgroundColor: '#FFFBEB', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#FDE68A',
    alignSelf: 'flex-start',
  },
  warnBadgeText: { fontSize: 11, fontFamily: F.medium, color: '#92400E' },
  /* Warning detail strip */
  warnStrip: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#FFFBEB',
    borderTopWidth: 1, borderTopColor: '#FDE68A',
  },
  warnItem: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1, borderColor: '#FDE68A',
  },
  warnStripText: { fontSize: 11, fontFamily: F.medium, color: '#B45309' },
  chatBtnWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: P,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  chatBtnLabel: { fontSize: 12, fontFamily: F.medium, color: '#fff' },
});

// ── Chat modal styles ─────────────────────────────────────────────────────────
const chatModal = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  sheet:       { width: '90%', maxWidth: 620, height: '78%', backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', flexDirection: 'column' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#FAFCFF' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#1E293B', fontFamily: F.bold },
  headerSub:   { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  closeBtn:    { padding: 4, borderRadius: 8 },
});

// ── ClinicAddModal ──────────────────────────────────────────────

interface ClinicFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  contact_person: string;
  notes: string;
}

function ClinicAddModal({
  visible, prefillName, saving, onClose, onSave, accentColor,
}: {
  visible: boolean;
  prefillName: string;
  saving: boolean;
  onClose: () => void;
  onSave: (data: { name: string; phone?: string; email?: string; address?: string; contact_person?: string; notes?: string }) => Promise<void>;
  accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const cm = useMemo(() => makeCmStyles(P), [P]);
  const [form, setForm] = useState<ClinicFormData>({
    name: '', phone: '', email: '', address: '', contact_person: '', notes: '',
  });

  // Pre-fill name when modal opens
  useEffect(() => {
    if (visible) {
      setForm({ name: prefillName, phone: '', email: '', address: '', contact_person: '', notes: '' });
    }
  }, [visible, prefillName]);

  const setField = (key: keyof ClinicFormData) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    await onSave({
      name: form.name.trim(),
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      contact_person: form.contact_person || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={cm.overlay}>
        <View style={cm.sheet}>
          {/* Header */}
          <View style={cm.header}>
            <View>
              <Text style={cm.title}>Yeni Klinik</Text>
              <Text style={cm.subtitle}>Klinik bilgilerini doldurun</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={cm.closeBtn}>
              <AppIcon name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={cm.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Klinik Adı */}
            <Text style={cm.label}>Klinik Adı *</Text>
            <TextInput style={cm.input} value={form.name} onChangeText={setField('name')}
              placeholder="Klinik adı" placeholderTextColor="#B0BAC9"
              // @ts-ignore
              outlineStyle="none" />

            {/* Telefon + E-posta */}
            <View style={cm.row}>
              <View style={{ flex: 1 }}>
                <Text style={cm.label}>Telefon</Text>
                <TextInput style={cm.input} value={form.phone} onChangeText={setField('phone')}
                  placeholder="05XX XXX XX XX" placeholderTextColor="#B0BAC9" keyboardType="phone-pad"
                  // @ts-ignore
                  outlineStyle="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={cm.label}>E-posta</Text>
                <TextInput style={cm.input} value={form.email} onChangeText={setField('email')}
                  placeholder="ornek@klinik.com" placeholderTextColor="#B0BAC9" keyboardType="email-address"
                  autoCapitalize="none"
                  // @ts-ignore
                  outlineStyle="none" />
              </View>
            </View>

            {/* Adres */}
            <Text style={cm.label}>Adres</Text>
            <TextInput style={[cm.input, cm.inputMulti]} value={form.address} onChangeText={setField('address')}
              placeholder="Klinik adresi" placeholderTextColor="#B0BAC9"
              multiline textAlignVertical="top"
              // @ts-ignore
              outlineStyle="none" />

            {/* İletişim Kişisi */}
            <Text style={cm.label}>İletişim Kişisi</Text>
            <TextInput style={cm.input} value={form.contact_person} onChangeText={setField('contact_person')}
              placeholder="Sekreter, yönetici adı..." placeholderTextColor="#B0BAC9"
              // @ts-ignore
              outlineStyle="none" />

            {/* Notlar */}
            <Text style={cm.label}>Notlar</Text>
            <TextInput style={[cm.input, cm.inputMulti]} value={form.notes} onChangeText={setField('notes')}
              placeholder="Ek bilgiler..." placeholderTextColor="#B0BAC9"
              multiline textAlignVertical="top"
              // @ts-ignore
              outlineStyle="none" />
          </ScrollView>

          {/* Footer */}
          <View style={cm.footer}>
            <TouchableOpacity style={cm.cancelBtn} onPress={onClose}>
              <Text style={cm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cm.saveBtn, (!form.name.trim() || saving) && cm.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!form.name.trim() || saving}
            >
              <Text style={cm.saveText}>{saving ? 'Kaydediliyor...' : 'Klinik Ekle'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeCmStyles = (P: string) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: '90%' as any,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title:    { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: '#0F172A' },
  subtitle: { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: '#94A3B8', marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  body: { paddingHorizontal: 24, paddingTop: 16 },
  row: { flexDirection: 'row', gap: 12 },
  label: {
    fontSize: 11, fontWeight: '500', fontFamily: F.medium, color: '#64748B',
    marginBottom: 6, marginTop: 14, letterSpacing: 0.4, textTransform: 'none',
  },
  input: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#0F172A', backgroundColor: '#FFFFFF',
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#64748B' },
  saveBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 12,
    backgroundColor: P, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: '#FFFFFF' },
});

// ── DoctorAddModal ──────────────────────────────────────────────

interface DoctorFormData {
  full_name: string;
  phone: string;
  specialty: string;
  notes: string;
}

function DoctorAddModal({
  visible, prefillName, clinicId, clinics, saving, onClose, onSave, onClinicAdded, accentColor,
}: {
  visible: boolean;
  prefillName: string;
  clinicId: string | null;
  clinics: Clinic[];
  saving: boolean;
  onClose: () => void;
  onSave: (data: { full_name: string; clinic_id?: string | null; phone?: string; specialty?: string; notes?: string }) => Promise<void>;
  onClinicAdded?: (clinic: Clinic) => void;
  accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const cm = useMemo(() => makeCmStyles(P), [P]);
  const [form, setForm] = useState<DoctorFormData>({
    full_name: '', phone: '', specialty: '', notes: '',
  });
  const [selectedClinicId, setSelectedClinicId] = useState<string>('');
  const [localClinics, setLocalClinics] = useState<Clinic[]>([]);

  // Nested clinic add modal
  const [nestedClinicModal, setNestedClinicModal] = useState({ visible: false, prefill: '' });
  const [nestedClinicSaving, setNestedClinicSaving] = useState(false);

  useEffect(() => { setLocalClinics(clinics); }, [clinics]);

  useEffect(() => {
    if (visible) {
      setForm({ full_name: prefillName, phone: '', specialty: '', notes: '' });
      setSelectedClinicId(clinicId || '');
    }
  }, [visible, prefillName, clinicId]);

  const setField = (key: keyof DoctorFormData) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.full_name.trim()) return;
    await onSave({
      full_name: form.full_name.trim(),
      clinic_id: selectedClinicId || null,
      phone: form.phone || undefined,
      specialty: form.specialty || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={cm.overlay}>
          <View style={cm.sheet}>
            <View style={cm.header}>
              <View>
                <Text style={cm.title}>Yeni diş hekimi</Text>
                <Text style={cm.subtitle}>Diş hekimi bilgilerini doldurun</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={cm.closeBtn}>
                <AppIcon name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={cm.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={cm.label}>Ad Soyad *</Text>
              <TextInput style={cm.input} value={form.full_name} onChangeText={setField('full_name')}
                placeholder="Diş hekimi adı soyadı" placeholderTextColor="#B0BAC9"
                // @ts-ignore
                outlineStyle="none" />

              {/* Klinik / Muayenehane */}
              <Text style={cm.label}>Klinik / Muayenehane</Text>
              <SearchableDropdown
                label=""
                placeholder="Klinik ara veya ekle..."
                options={localClinics.filter(c => c.is_active).map(c => ({
                  id: c.id, label: c.name, sublabel: c.phone ?? undefined,
                  imageUrl: (c as any).logo_url ?? undefined,
                }))}
                selectedId={selectedClinicId}
                onSelect={setSelectedClinicId}
                onAddNew={async (name) => {
                  setNestedClinicModal({ visible: true, prefill: name });
                }}
                addNewLabel="Yeni klinik ekle"
              />

              <View style={[cm.row, { marginTop: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={cm.label}>Telefon</Text>
                  <TextInput style={cm.input} value={form.phone} onChangeText={setField('phone')}
                    placeholder="05XX XXX XX XX" placeholderTextColor="#B0BAC9" keyboardType="phone-pad"
                    // @ts-ignore
                    outlineStyle="none" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={cm.label}>Uzmanlık</Text>
                  <TextInput style={cm.input} value={form.specialty} onChangeText={setField('specialty')}
                    placeholder="Diş hekimi, ortodontist..." placeholderTextColor="#B0BAC9"
                    // @ts-ignore
                    outlineStyle="none" />
                </View>
              </View>

              <Text style={cm.label}>Notlar</Text>
              <TextInput style={[cm.input, cm.inputMulti]} value={form.notes} onChangeText={setField('notes')}
                placeholder="Ek bilgiler..." placeholderTextColor="#B0BAC9"
                multiline textAlignVertical="top"
                // @ts-ignore
                outlineStyle="none" />
            </ScrollView>

            <View style={cm.footer}>
              <TouchableOpacity style={cm.cancelBtn} onPress={onClose}>
                <Text style={cm.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[cm.saveBtn, (!form.full_name.trim() || saving) && cm.saveBtnDisabled]}
                onPress={handleSave}
                disabled={!form.full_name.trim() || saving}
              >
                <Text style={cm.saveText}>{saving ? 'Kaydediliyor...' : 'Diş hekimi ekle'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Nested clinic add modal — canonical, opens on top of doctor modal */}
      <CanonicalClinicModal
        visible={nestedClinicModal.visible}
        editingClinic={null}
        existingClinics={localClinics as any}
        accentColor={P}
        onClose={() => setNestedClinicModal({ visible: false, prefill: '' })}
        onSuccess={() => setNestedClinicModal({ visible: false, prefill: '' })}
        onCreated={(clinic) => {
          const newClinic = clinic as Clinic;
          setLocalClinics(prev => [...prev, newClinic]);
          setSelectedClinicId(newClinic.id);
          onClinicAdded?.(newClinic);
        }}
      />
    </>
  );
}

const makeDobStyles = (P: string) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  sheet: {
    backgroundColor: '#F2F2F7',
    borderTopStartRadius: 16,
    borderTopEndRadius: 16,
    overflow: 'hidden',
    paddingBottom: 24,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#F2F2F7',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  toolbarTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  clearBtn: { fontSize: 15, color: '#8E8E93' },
  doneBtn:  { fontSize: 15, fontWeight: '700', color: P },
});

// ── InlinePicker ───────────────────────────────────────────────
function InlinePicker({
  value,
  options,
  onSelect,
  placeholder = '—',
  disabled = false,
  accentColor,
}: {
  value: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const ip = useMemo(() => makeIpStyles(P, T, isDark), [P, T, isDark]);
  const [open, setOpen] = useState(false);
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<any>(null);
  const sel = options.find(o => o.value === value);

  const openDrop = () => {
    if (disabled) return;
    if (Platform.OS === 'web' && btnRef.current) {
      const r = (btnRef.current as any).getBoundingClientRect?.();
      if (r) setDropRect({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 160) });
    }
    setOpen(true);
  };

  // Ortak option satırları (web portal + native modal aynı görünüm)
  const OptionRows = () => (
    <>
      {value !== '' && (
        <TouchableOpacity onPress={() => { onSelect(''); setOpen(false); }} style={ip.optClear}>
          <Text style={ip.optClearText}>Temizle</Text>
        </TouchableOpacity>
      )}
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => { onSelect(opt.value); setOpen(false); }}
            style={[ip.opt, active && ip.optActive]}
          >
            <Text style={[ip.optText, active && ip.optTextActive]} numberOfLines={1}>
              {opt.label}
            </Text>
            {active && (
              <View style={ip.optCheck}>
                <AppIcon name={'check' as any} size={12} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </>
  );

  return (
    <>
      <TouchableOpacity ref={btnRef} onPress={openDrop} style={[ip.btn, disabled && ip.btnDisabled]}>
        <Text style={[ip.val, !sel && ip.placeholder]} numberOfLines={1}>
          {sel?.label ?? placeholder}
        </Text>
        <AppIcon name={'chevron-down' as any} size={11} color={disabled ? T.ink3 : T.ink2} />
      </TouchableOpacity>

      {/* Web: input altına çapalı portal */}
      {Platform.OS === 'web' && open && dropRect && (
        <WebPortal>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} activeOpacity={1}>
            <View style={[ip.drop, { top: dropRect.top, left: dropRect.left, minWidth: dropRect.width }]}>
              <OptionRows />
            </View>
          </TouchableOpacity>
        </WebPortal>
      )}

      {/* Native: alttan açılan bottom-sheet modal */}
      {Platform.OS !== 'web' && (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={ip.backdrop} onPress={() => setOpen(false)}>
            <Pressable style={ip.sheet} onPress={(e: any) => e.stopPropagation?.()}>
              <View style={ip.sheetHandle} />
              {placeholder && placeholder !== '—' && (
                <Text style={ip.sheetTitle}>{placeholder}</Text>
              )}
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                <OptionRows />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const makeIpStyles = (P: string, T: any, isDark: boolean) => StyleSheet.create({
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: T.cardSoft, borderRadius: 8, borderWidth: 1, borderColor: T.hairline,
    paddingHorizontal: 8, paddingVertical: 6, minWidth: 70,
  },
  btnDisabled: { opacity: 0.35 },
  val: { flex: 1, fontSize: 11, fontFamily: F.medium, color: T.ink },
  placeholder: { color: T.ink3 },
  // Web anchored dropdown
  drop: {
    position: 'fixed' as any, backgroundColor: T.card, borderRadius: 14,
    borderWidth: 1, borderColor: T.hairline,
    shadowColor: '#000', shadowOpacity: isDark ? 0.45 : 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
    zIndex: 9999, maxHeight: 280, overflow: 'scroll' as any,
  },
  // Native bottom-sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: T.card, borderTopStartRadius: 24, borderTopEndRadius: 24,
    paddingTop: 10, paddingBottom: 28, paddingHorizontal: 8,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8,
    backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.18)',
  },
  sheetTitle: {
    fontSize: 11, fontFamily: F.semibold, color: T.ink3, letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 12, paddingBottom: 8,
  },
  opt: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12,
  },
  optActive: { backgroundColor: `${P}14` },
  optText: { flex: 1, fontSize: 14, fontFamily: F.regular, color: T.ink },
  optTextActive: { fontFamily: F.semibold, color: P },
  optCheck: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: P, alignItems: 'center', justifyContent: 'center',
  },
  optClear: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: T.hairline2, marginBottom: 4 },
  optClearText: { fontSize: 12, fontFamily: F.regular, color: T.ink3 },
});

// ── ToothOpRow ─────────────────────────────────────────────────
function ToothOpRow({ op, onChange, materialPrices = {}, accentColor }: { op: ToothOp; onChange: (patch: Partial<Omit<ToothOp, 'tooth'>>) => void; materialPrices?: Record<string, number>; accentColor?: string }) {
  const P = accentColor ?? C.primary;
  const tor = useMemo(() => makeTorStyles(P), [P]);
  const derivedMainCat = WORK_TYPE_MAIN[op.work_type] ?? '';
  const [localMainCat, setLocalMainCat] = useState(derivedMainCat);

  useEffect(() => {
    if (derivedMainCat && derivedMainCat !== localMainCat) setLocalMainCat(derivedMainCat);
    if (!derivedMainCat && !op.work_type) setLocalMainCat('');
  }, [op.work_type]);

  const activeCat = op.work_type ? derivedMainCat : localMainCat;
  const mainNode  = WORK_TYPE_TREE.find(n => n.label === activeCat);
  const subtypes  = mainNode ? mainNode.subtypes : [];

  const isImplant  = activeCat === 'İmplant';
  const isProtez   = activeCat === 'Protez';
  const hasWorkType = !!op.work_type;

  const mainOpts    = WORK_TYPE_TREE.map(n => ({ value: n.label, label: n.label }));
  const shadeOpts   = ALL_SHADES.map(s => ({ value: s, label: s }));
  const crownMOpts  = CROWN_MATERIALS.map(m => ({ value: m, label: m }));
  const removeMOpts = REMOVABLE_MATS.map(m => ({ value: m, label: m }));
  const impOpts     = IMPLANT_SYSTEMS.map(s => ({ value: s, label: s }));
  const abutOpts    = ABUTMENT_TYPES.map(a => ({ value: a, label: a }));
  const screwOpts   = SCREW_TYPES.map(sc => ({ value: sc, label: sc }));

  const subLabel = activeCat === 'Kron' ? 'Kron türü'
    : activeCat === 'Köprü'   ? 'Köprü türü'
    : activeCat === 'İmplant' ? 'İmplant türü'
    : activeCat === 'Veneer'  ? 'Veneer türü'
    : activeCat === 'Protez'  ? 'Protez türü'
    : 'Alt tür';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={tor.rowScroll}
      contentContainerStyle={tor.row}
    >
      {/* Diş numarası rozeti */}
      <View style={tor.badge}>
        <Text style={tor.badgeNum}>{op.tooth}</Text>
      </View>

      {/* İş türü (ana kategori) */}
      <InlinePicker
        value={activeCat}
        options={mainOpts}
        onSelect={(v) => { setLocalMainCat(v); onChange({ work_type: '', shade: '', material: '', implant_system: '', implant_type: '', abutment: '', screw: '', material_price: 0 }); }}
        placeholder="İş türü"
        accentColor={P}
      />

      {/* Alt tür */}
      <InlinePicker
        value={op.work_type}
        options={subtypes}
        onSelect={(v) => {
          const autoPrice = materialPrices[v] ?? 0;
          onChange({ work_type: v, shade: '', material: '', implant_system: '', implant_type: '', abutment: '', screw: '', material_price: autoPrice });
        }}
        placeholder={activeCat ? subLabel : '—'}
        disabled={!activeCat}
        accentColor={P}
      />

      {/* İmplant'a özel alanlar */}
      {isImplant && hasWorkType && (
        <>
          <InlinePicker value={op.implant_system} options={impOpts} onSelect={(v) => onChange({ implant_system: v })} placeholder="İmplant sistemi" accentColor={P} />
          <InlinePicker value={op.abutment} options={abutOpts} onSelect={(v) => onChange({ abutment: v })} placeholder="Abutment tipi" accentColor={P} />
          <InlinePicker value={op.screw} options={screwOpts} onSelect={(v) => onChange({ screw: v })} placeholder="Vida tipi" accentColor={P} />
          <InlinePicker value={op.shade} options={shadeOpts} onSelect={(v) => onChange({ shade: v })} placeholder="Renk" accentColor={P} />
        </>
      )}

      {/* Kron / Köprü */}
      {(activeCat === 'Kron' || activeCat === 'Köprü') && hasWorkType && (
        <>
          <InlinePicker value={op.material} options={crownMOpts} onSelect={(v) => {
            const autoPrice = materialPrices[v] ?? materialPrices[op.work_type] ?? op.material_price ?? 0;
            onChange({ material: v, material_price: autoPrice });
          }} placeholder="Materyal" accentColor={P} />
          <InlinePicker value={op.shade} options={shadeOpts} onSelect={(v) => onChange({ shade: v })} placeholder="Renk" accentColor={P} />
        </>
      )}

      {/* Veneer / Diğer */}
      {(activeCat === 'Veneer' || activeCat === 'Diğer') && hasWorkType && (
        <InlinePicker value={op.shade} options={shadeOpts} onSelect={(v) => onChange({ shade: v })} placeholder="Renk" accentColor={P} />
      )}

      {/* Protez */}
      {isProtez && hasWorkType && (
        <InlinePicker value={op.material} options={removeMOpts} onSelect={(v) => {
          const autoPrice = materialPrices[v] ?? materialPrices[op.work_type] ?? op.material_price ?? 0;
          onChange({ material: v, material_price: autoPrice });
        }} placeholder="Materyal" accentColor={P} />
      )}

      {/* Materyal ücreti */}
      <View style={tor.priceBox}>
        <TextInput
          style={tor.priceInput}
          value={(op.material_price ?? 0) > 0 ? String(op.material_price) : ''}
          onChangeText={(t) => {
            const n = parseFloat(t.replace(',', '.'));
            onChange({ material_price: isNaN(n) ? 0 : n });
          }}
          keyboardType="decimal-pad"
          placeholder="₺ Mat."
          placeholderTextColor="#94A3B8"
        />
      </View>

      {/* İşçilik ücreti */}
      <View style={tor.priceBox}>
        <TextInput
          style={tor.priceInput}
          value={op.price > 0 ? String(op.price) : ''}
          onChangeText={(t) => {
            const n = parseFloat(t.replace(',', '.'));
            onChange({ price: isNaN(n) ? 0 : n });
          }}
          keyboardType="decimal-pad"
          placeholder="₺ İşçilik"
          placeholderTextColor="#94A3B8"
        />
      </View>
    </ScrollView>
  );
}

const makeTorStyles = (P: string) => StyleSheet.create({
  rowScroll: {
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 7, paddingHorizontal: 4,
  },
  badge: {
    width: 36, height: 28, borderRadius: 8,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeNum: { fontSize: 12, fontFamily: F.bold, color: P },
  priceBox: {
    height: 30, minWidth: 80, borderRadius: 8,
    borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC',
    justifyContent: 'center', paddingHorizontal: 8,
  },
  priceInput: {
    fontSize: 12, fontFamily: F.medium, color: P,
    outlineWidth: 0,
  } as any,
});

// ── WorkTypeSelector ───────────────────────────────────────────

function WorkTypeSelector({
  op,
  updateToothOp,
  selectedTeeth,
  onNightGuard,
  accentColor,
  onAutoConfirm,
  services = [],
  showPrices = true,
}: {
  op: ToothOp;
  updateToothOp: (patch: Partial<Omit<ToothOp, 'tooth'>>) => void;
  selectedTeeth: number[];
  onNightGuard: (jaw: 'upper' | 'lower' | 'both') => void;
  accentColor?: string;
  /** Called when the last detail field is filled — auto-adds to list.
   *  opOverride: seçimle aynı anda geçilen taze op (stale closure'ı önler). */
  onAutoConfirm?: (opOverride?: Partial<ToothOp>) => void;
  /** Fiyat listesindeki servisler — İş Türü seçeneklerini bu liste oluşturur */
  services?: LabService[];
  /** Fiyat görme yetkisi — false ise servis fiyatı gizlenir */
  showPrices?: boolean;
}) {
  const P = accentColor ?? C.primary;
  const _T_wts = useMobileTokens();
  const _isDark_wts = useThemeModeStore(s => s.resolvedDark);
  const wts = useMemo(() => makeWtsStyles(P, _T_wts, _isDark_wts), [P, _T_wts, _isDark_wts]);
  const styles = useMemo(() => makeStyles(P, _T_wts, _isDark_wts), [P, _T_wts, _isDark_wts]);
  // Fiyat listesini kategoriye göre grupla (Active + sort_order)
  const servicesByCategory = useMemo(() => {
    const active = (services ?? []).filter(s => s.is_active !== false);
    const grouped = new Map<string, LabService[]>();
    active.forEach(s => {
      const cat = (s.category ?? 'Diğer').trim() || 'Diğer';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(s);
    });
    return Array.from(grouped.entries())
      .map(([label, items]) => ({
        label,
        items: items.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'tr')),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [services]);

  // Seçili op'un kategorisini servis listesinden çıkar (kategoriye göre filtre breadcrumb için)
  const selectedService = useMemo(
    () => (services ?? []).find(s => s.name === op.work_type) ?? null,
    [services, op.work_type],
  );
  const derivedMain = op.work_type
    ? (selectedService?.category ?? WORK_TYPE_MAIN[op.work_type] ?? null)
    : null;
  const [pendingMain, setPendingMain]         = React.useState<string | null>(null);
  const [showNightGuard, setShowNightGuard]   = React.useState(false);

  const activeMain = derivedMain ?? pendingMain;
  const activeCategoryServices = servicesByCategory.find(g => g.label === activeMain)?.items ?? [];
  const activeNode = WORK_TYPE_TREE.find(n => n.label === activeMain) ?? null;
  const cat = op.work_type ? (OP_CATEGORY[op.work_type] ?? null) : null;
  // İmplant alanları yalnız OP_CATEGORY değil, fiyat-listesi servisleri için de
  // çıksın — ad, kategori ya da üst kategori "implant" içeriyorsa implant kabul et.
  // Türkçe "İ" (U+0130) için locale-aware küçültme şart (ASCII /i/ yakalamaz).
  const implantHay = `${op.work_type} ${selectedService?.category ?? ''} ${derivedMain ?? ''}`
    .toLocaleLowerCase('tr-TR');
  const isImplantOp = !!op.work_type && (
    cat === 'implant' || isImplantWorkType(op.work_type) || implantHay.includes('implant')
  );
  const useServiceCatalog = servicesByCategory.length > 0;

  // Seçili dişlerden çene tespiti
  const hasUpper = selectedTeeth.some(t => (t >= 11 && t <= 18) || (t >= 21 && t <= 28));
  const hasLower = selectedTeeth.some(t => (t >= 31 && t <= 38) || (t >= 41 && t <= 48));
  const suggestedJaw: 'upper' | 'lower' | 'both' | null =
    hasUpper && hasLower ? 'both' : hasUpper ? 'upper' : hasLower ? 'lower' : null;

  const selectMain = (label: string) => {
    setShowNightGuard(false);
    if (label === activeMain) {
      setPendingMain(null);
      updateToothOp({ work_type: '', shade: '', implant_system: '', implant_type: '', abutment: '', screw: '', material: '' });
      return;
    }
    setPendingMain(label);
    if (op.work_type) {
      updateToothOp({ work_type: '', shade: '', implant_system: '', implant_type: '', abutment: '', screw: '', material: '' });
    }
    // Tek subtype'lı ana (Cerrahi Şablon, Diğer) — alt seçim sormadan otomatik seç
    const node = WORK_TYPE_TREE.find(n => n.label === label);
    if (node && node.subtypes.length === 1) {
      const only = node.subtypes[0];
      setTimeout(() => selectSub(only.value), 0);
    }
  };

  const selectSub = (value: string) => {
    const next = op.work_type === value ? '' : value;
    setPendingMain(null);
    updateToothOp({ work_type: next, shade: '', implant_system: '', implant_type: '', abutment: '', screw: '', material: '' });
    // Auto-confirm for surgical/other — no detail fields needed
    if (next) {
      const subCat = OP_CATEGORY[next] ?? null;
      if (subCat === 'surgical' || subCat === 'other') {
        setTimeout(() => onAutoConfirm?.(), 0);
      }
    }
  };

  // Diş rengi gerekmeyen servisler için heuristic (ad ve kategori bazlı)
  // Bu listeye uymayan, OP_CATEGORY'de de olmayan tüm servisler için renk picker'ı çıkar.
  const NO_SHADE_KEYWORDS = [
    'gece pla', 'gece plağı', 'gece plagi', 'splint', 'snore', 'koruyucu pla', 'retainer',
    'cerrahi şablon', 'cerrahi sablon', 'surgical guide', 'guide', 'rehber', 'cerrahi',
    'scan body', 'scanbody',
    'model', 'baskı', 'baski', 'print', 'arch baski', 'arch baskı', 'arch print', 'tarayıcı', 'tarayici',
    'try-in plak', 'try in plak', 'wax-up', 'wax up', 'mock-up', 'mock up',
    'çalışma modeli', 'calisma modeli', 'sx plak', 'baz plak', 'esnek alt yapı',
  ];
  const serviceNeedsShade = (name: string): boolean => {
    const n = (name || '').toLowerCase();
    return !NO_SHADE_KEYWORDS.some(kw => n.includes(kw));
  };

  // Servis kataloğundan seçim — fiyat listesindeki bir servisi tıklayınca
  // Diş rengi (shade) sadece kuron/veneer/protez gibi renge bağlı servisler için
  // sorulur. Gece plağı, model, baskı vs. için otomatik liste'ye ekler.
  const selectService = (svc: LabService) => {
    const isSame = op.work_type === svc.name;
    setPendingMain(null);
    if (isSame) {
      updateToothOp({ work_type: '', shade: '', implant_system: '', implant_type: '', abutment: '', screw: '', material: '', price: 0, price_unit: null });
      return;
    }
    const fresh: Partial<ToothOp> = {
      work_type: svc.name,
      shade: '', implant_system: '', implant_type: '', abutment: '', screw: '', material: '',
      price: Number(svc.price) || 0,
      currency: svc.currency,
      price_unit: svc.unit ?? null,   // Çene/Vaka/Seans → fiyat çarpanını belirler
    };
    updateToothOp(fresh);
    // OP_CATEGORY'de surgical/other ise (yerleşik harita) auto-confirm
    const subCat = OP_CATEGORY[svc.name] ?? null;
    if (subCat === 'surgical' || subCat === 'other') {
      setTimeout(() => onAutoConfirm?.(fresh), 0);
      return;
    }
    // Katalogdan gelen ve renk gerektirmeyen servis (gece plağı, model, baskı, vs.)
    if (subCat === null && !serviceNeedsShade(svc.name)) {
      setTimeout(() => onAutoConfirm?.(fresh), 0);
      return;
    }
    // cat === null + renk gerekiyor (kuron/veneer/protez) → shade picker görünür
  };

  const FAVORITES: { label: string; value: string; nightGuard?: true }[] = [
    { label: 'Zirkonyum Kron', value: 'Zirkonyum Kron' },
    { label: 'Veneer',         value: 'Veneer' },
    { label: 'E.max Kron',     value: 'Tam Seramik Kron (e.max)' },
    { label: 'Gece Plağı 🌙',  value: 'Gece Plağı', nightGuard: true },
  ];

  const selectFavorite = (f: typeof FAVORITES[0]) => {
    if (f.nightGuard) {
      setShowNightGuard(true);
      return;
    }
    setShowNightGuard(false);
    setPendingMain(null);
    const fresh: Partial<ToothOp> = { work_type: f.value, shade: '', implant_system: '', implant_type: '', abutment: '', screw: '', material: '' };
    updateToothOp(fresh);
    // Auto-confirm for surgical/other favorites
    const favCat = OP_CATEGORY[f.value] ?? null;
    if (favCat === 'surgical' || favCat === 'other') {
      setTimeout(() => onAutoConfirm?.(fresh), 0);
    }
  };

  return (
    <>
      {/* ── Gece Plağı çene seçici ── */}
      {showNightGuard && !activeMain && (
        <View style={wts.jawBox}>
          <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Çene Seçimi</Text>
          <View style={wts.jawRow}>
            {([
              { jaw: 'upper' as const, label: 'Üst Çene' },
              { jaw: 'lower' as const, label: 'Alt Çene' },
              { jaw: 'both'  as const, label: 'Her İki Çene' },
            ]).map(({ jaw, label }) => (
              <TouchableOpacity
                key={jaw}
                style={[wts.jawBtn, suggestedJaw === jaw && wts.jawBtnSuggested]}
                onPress={() => { onNightGuard(jaw); setShowNightGuard(false); }}
                activeOpacity={0.75}
              >
                <Text style={[wts.jawBtnText, suggestedJaw === jaw && wts.jawBtnTextSuggested]}>
                  {label}
                  {suggestedJaw === jaw ? '  ✓' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setShowNightGuard(false)}>
            <Text style={{ fontSize: 11, color: '#94A3B8', fontFamily: F.regular, marginTop: 6 }}>İptal</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Breadcrumb Chips ── */}
      {activeMain && (
        <View style={wts.crumbRow}>
          {/* Ana tip chip — tıklayınca ana seçime döner */}
          <TouchableOpacity
            style={[wts.crumbChip, !op.work_type && wts.crumbChipActive]}
            onPress={() => {
              setPendingMain(null);
              updateToothOp({ work_type: '', shade: '', implant_system: '', implant_type: '', abutment: '', screw: '', material: '' });
            }}
            activeOpacity={0.75}
          >
            <Text style={[wts.crumbChipText, !op.work_type && wts.crumbChipTextActive]}>{activeMain}</Text>
            <AppIcon name={'chevron-down' as any} size={13} color={!op.work_type ? P : '#94A3B8'} />
          </TouchableOpacity>

          {/* Sub tip chip — sadece seçildiyse göster, tıklayınca sub seçime döner */}
          {!!op.work_type && (
            <>
              <Text style={wts.crumbSep}>›</Text>
              <TouchableOpacity
                style={[wts.crumbChip, wts.crumbChipActive]}
                onPress={() => updateToothOp({ work_type: '', shade: '', implant_system: '', implant_type: '', abutment: '', screw: '', material: '' })}
                activeOpacity={0.75}
              >
                <Text style={[wts.crumbChipText, wts.crumbChipTextActive]}>
                  {activeNode?.subtypes.find(s => s.value === op.work_type)?.label ?? op.work_type}
                </Text>
                <AppIcon name={'chevron-down' as any} size={13} color={P} />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── ADIM 1: Ana Tip (Kategori) ── */}
      {!activeMain && (
        <>
          <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>İş Türü</Text>
          {useServiceCatalog ? (
            <View style={wts.mainRow}>
              {servicesByCategory.map(g => (
                <TouchableOpacity
                  key={g.label}
                  style={wts.mainBtn}
                  onPress={() => setPendingMain(g.label)}
                  activeOpacity={0.75}
                >
                  <Text style={wts.mainBtnLabel}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={wts.mainRow}>
              {WORK_TYPE_TREE.map(node => (
                <TouchableOpacity
                  key={node.label}
                  style={wts.mainBtn}
                  onPress={() => selectMain(node.label)}
                  activeOpacity={0.75}
                >
                  <Text style={wts.mainBtnLabel}>{node.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {useServiceCatalog && servicesByCategory.length === 0 && (
            <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
              Fiyat listesinde aktif hizmet yok — Mali İşler → Fiyat Listesi'nden ekleyin.
            </Text>
          )}
        </>
      )}

      {/* ── ADIM 2: Alt Tip (Servis) ── */}
      {activeMain && !op.work_type && (useServiceCatalog ? activeCategoryServices.length > 0 : activeNode) && (
        <>
          <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>{activeMain} — Hizmet Seç</Text>
          <View style={wts.subRow}>
            {useServiceCatalog
              ? activeCategoryServices.map(svc => (
                  <TouchableOpacity
                    key={svc.id}
                    style={wts.subBtn}
                    onPress={() => selectService(svc)}
                    activeOpacity={0.75}
                  >
                    <Text style={wts.subBtnLabel}>
                      {svc.name}
                      {showPrices && svc.price > 0 ? `  ·  ${curSym(svc.currency)}${Number(svc.price).toLocaleString('tr-TR')}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))
              : (activeNode?.subtypes ?? []).map(sub => (
                  <TouchableOpacity
                    key={sub.value}
                    style={wts.subBtn}
                    onPress={() => selectSub(sub.value)}
                    activeOpacity={0.75}
                  >
                    <Text style={wts.subBtnLabel}>{sub.label}</Text>
                  </TouchableOpacity>
                ))}
          </View>
        </>
      )}

      {/* ── ADIM 3: Detay Alanları ── */}
      {!!op.work_type && (
        <View style={wts.detailBox}>

          {/* CROWN / BRIDGE / AESTHETIC → materyal + shade */}
          {(cat === 'crown_bridge' || cat === 'aesthetic') && (
            <>
              <Text style={styles.fieldLabel}>Materyal</Text>
              <View style={[styles.chipRow, { marginBottom: 12 }]}>
                {CROWN_MATERIALS.map(m => (
                  <TouchableOpacity key={m}
                    onPress={() => updateToothOp({ material: op.material === m ? '' : m })}
                    style={[styles.chip, op.material === m && styles.chipActive]}>
                    <Text style={[styles.chipText, op.material === m && styles.chipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Renk (Shade)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4 }}>
                  {ALL_SHADES.map(s => (
                    <TouchableOpacity key={s}
                      onPress={() => {
                        const next = op.shade === s ? '' : s;
                        updateToothOp({ shade: next });
                        if (next) setTimeout(() => onAutoConfirm?.(), 0);
                      }}
                      style={[styles.shadeChip, op.shade === s && styles.shadeChipActive]}>
                      <Text style={[styles.shadeText, op.shade === s && styles.shadeTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          {/* IMPLANT → marka + tür + abutment + screw + shade */}
          {isImplantOp && (
            <>
              <Text style={styles.fieldLabel}>İmplant Markası</Text>
              <View style={{ marginBottom: 12, zIndex: 50 }}>
                <ImplantBrandCombobox
                  value={op.implant_system}
                  onChange={(v) => updateToothOp({ implant_system: v })}
                  accent={P}
                />
              </View>

              <Text style={styles.fieldLabel}>İmplant Türü</Text>
              <View style={[styles.chipRow, { marginBottom: 12 }]}>
                {IMPLANT_TYPES.map(t => (
                  <TouchableOpacity key={t}
                    onPress={() => updateToothOp({ implant_type: op.implant_type === t ? '' : t })}
                    style={[styles.chip, op.implant_type === t && styles.chipActive]}>
                    <Text style={[styles.chipText, op.implant_type === t && styles.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Abutment Tipi</Text>
              <View style={[styles.chipRow, { marginBottom: 12 }]}>
                {ABUTMENT_TYPES.map(a => (
                  <TouchableOpacity key={a}
                    onPress={() => updateToothOp({ abutment: op.abutment === a ? '' : a })}
                    style={[styles.chip, op.abutment === a && styles.chipActive]}>
                    <Text style={[styles.chipText, op.abutment === a && styles.chipTextActive]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Vida Tipi</Text>
              <View style={[styles.chipRow, { marginBottom: 12 }]}>
                {SCREW_TYPES.map(sc => (
                  <TouchableOpacity key={sc}
                    onPress={() => updateToothOp({ screw: op.screw === sc ? '' : sc })}
                    style={[styles.chip, op.screw === sc && styles.chipActive]}>
                    <Text style={[styles.chipText, op.screw === sc && styles.chipTextActive]}>{sc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Renk (Shade)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4 }}>
                  {ALL_SHADES.map(s => (
                    <TouchableOpacity key={s}
                      onPress={() => {
                        const next = op.shade === s ? '' : s;
                        updateToothOp({ shade: next });
                        if (next) setTimeout(() => onAutoConfirm?.(), 0);
                      }}
                      style={[styles.shadeChip, op.shade === s && styles.shadeChipActive]}>
                      <Text style={[styles.shadeText, op.shade === s && styles.shadeTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          {/* REMOVABLE → materyal */}
          {cat === 'removable' && (
            <>
              <Text style={styles.fieldLabel}>Materyal</Text>
              <View style={styles.chipRow}>
                {REMOVABLE_MATS.map(m => (
                  <TouchableOpacity key={m}
                    onPress={() => {
                      const next = op.material === m ? '' : m;
                      updateToothOp({ material: next });
                      if (next) setTimeout(() => onAutoConfirm?.(), 0);
                    }}
                    style={[styles.chip, op.material === m && styles.chipActive]}>
                    <Text style={[styles.chipText, op.material === m && styles.chipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* SURGICAL / OTHER → bilgi notu */}
          {(cat === 'surgical' || cat === 'other') && (
            <View style={{ padding: 10, backgroundColor: '#F8FAFC', borderRadius: 8 }}>
              <Text style={{ fontSize: 12, color: '#94A3B8', fontFamily: F.regular }}>
                Bu iş türü için ek alan gerekmez.
              </Text>
            </View>
          )}

          {/* Fiyat listesinden gelen ama OP_CATEGORY'de olmayan servisler için:
              Son adım olarak diş rengi (shade) sor — sadece renk gerektiren servisler */}
          {cat === null && !isImplantOp && useServiceCatalog && serviceNeedsShade(op.work_type) && (
            <>
              <Text style={styles.fieldLabel}>Diş Rengi (Shade)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 4 }}>
                  {ALL_SHADES.map(s => (
                    <TouchableOpacity key={s}
                      onPress={() => {
                        const next = op.shade === s ? '' : s;
                        updateToothOp({ shade: next });
                        if (next) setTimeout(() => onAutoConfirm?.(), 0);
                      }}
                      style={[styles.shadeChip, op.shade === s && styles.shadeChipActive]}>
                      <Text style={[styles.shadeText, op.shade === s && styles.shadeTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 6 }}>
                Renk seçtikten sonra iş otomatik listeye eklenir. Renk gerekmiyorsa direkt "Listeye ekle" butonuyla devam edin.
              </Text>
            </>
          )}
        </View>
      )}
    </>
  );
}

const makeWtsStyles = (P: string, T: any, isDark: boolean) => StyleSheet.create({
  favRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: 6, marginBottom: 12,
  },
  favTitle: { fontSize: 11, fontFamily: F.medium, color: '#64748B', letterSpacing: 0.3 },
  favChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
    borderColor: '#FCD34D', backgroundColor: '#FFFBEB',
  },
  favChipActive: { borderColor: '#F59E0B', backgroundColor: '#FEF3C7' },
  favChipText: { fontSize: 11, fontFamily: F.medium, color: '#92400E' },

  jawBox: {
    marginBottom: 12, padding: 12,
    borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  jawRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  jawBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#DDE3ED', backgroundColor: '#FFFFFF',
  },
  jawBtnSuggested: { borderColor: P, backgroundColor: '#F1F5F9' },
  jawBtnText: { fontSize: 12, fontFamily: F.medium, color: '#64748B' },
  jawBtnTextSuggested: { color: P },

  crumbRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    gap: 4, marginBottom: 12,
  },
  crumbChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#DDE3ED',
    backgroundColor: 'transparent',
  },
  // Active = sadece accent stroke (renkli border), transparent fill kalır
  crumbChipActive: {
    borderColor: P,
    backgroundColor: 'transparent',
  },
  crumbChipText: { fontSize: 12, fontWeight: '500' as any, fontFamily: F.regular, color: T.ink2 },
  crumbChipTextActive: { color: P, fontWeight: '600' as any, fontFamily: F.medium },
  crumbSep: { fontSize: 13, color: T.ink3, marginHorizontal: 1 },

  mainRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4,
  },
  mainBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#DDE3ED',
    backgroundColor: 'transparent',
  },
  mainBtnLabel: { fontSize: 12, fontWeight: '500', fontFamily: F.regular, color: T.ink2 },

  subRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4,
  },
  subBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#DDE3ED',
    backgroundColor: 'transparent',
  },
  subBtnLabel: { fontSize: 12, fontWeight: '500', fontFamily: F.regular, color: T.ink2 },

  detailBox: {
    marginTop: 4, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: T.hairline,
  },
});

// ── Sub-components ─────────────────────────────────────────────

// ── ChatBox ───────────────────────────────────────────────────────────────────

function VoicePlayer({ uri, duration, accentColor }: { uri: string; duration: number; accentColor?: string }) {
  const P  = accentColor ?? C.primary;
  const _T_cb = useMobileTokens();
  const _isDark_cb = useThemeModeStore(s => s.resolvedDark);
  const cb = useMemo(() => makeCbStyles(P, _T_cb, _isDark_cb), [P, _T_cb, _isDark_cb]);
  const [playing, setPlaying]     = React.useState(false);
  const [pos, setPos]             = React.useState(0);
  const [elapsed, setElapsed]     = React.useState(0);
  const audioRef                  = React.useRef<any>(null);
  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const toggle = () => {
    if (!audioRef.current) {
      const a = new (window as any).Audio(uri);
      a.ontimeupdate = () => { if (a.duration) { setPos(a.currentTime / a.duration); setElapsed(Math.floor(a.currentTime)); } };
      a.onended = () => { setPlaying(false); setPos(0); setElapsed(0); };
      audioRef.current = a;
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true); }
  };
  React.useEffect(() => () => { audioRef.current?.pause(); }, []);

  return (
    <View style={cb.vpWrap}>
      <TouchableOpacity onPress={toggle} style={cb.vpPlayBtn} activeOpacity={0.8}>
        <AppIcon name={playing ? ('pause' as any) : ('play' as any)} size={16} color="#fff" />
      </TouchableOpacity>
      <View style={cb.vpBars}>
        {WAVE_BARS.map((h, i) => (
          <View key={i} style={[cb.vpBar, {
            height: Math.max(3, h * 22),
            backgroundColor: i / WAVE_BARS.length < pos ? '#fff' : 'rgba(255,255,255,0.4)',
          }]} />
        ))}
      </View>
      <Text style={cb.vpDur}>{fmt(playing ? elapsed : duration)}</Text>
    </View>
  );
}

const fmtSize = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

function MessageBubble({ msg, onDelete, accentColor }: { msg: ChatMessage; onDelete: () => void; accentColor?: string }) {
  const P  = accentColor ?? C.primary;
  const _T_cb = useMobileTokens();
  const _isDark_cb = useThemeModeStore(s => s.resolvedDark);
  const cb = useMemo(() => makeCbStyles(P, _T_cb, _isDark_cb), [P, _T_cb, _isDark_cb]);
  const isSelf = true; // new order form — always self (right side, blue)
  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const time = new Date(msg.ts).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={isSelf ? cb.msgRow : cb.msgRowLeft}>
      <View style={[cb.bubble, !isSelf && cb.bubbleLeft]}>
        {msg.type === 'text' && (
          <Text style={[cb.bubbleTxt, !isSelf && cb.bubbleTxtLeft]}>{msg.text}</Text>
        )}
        {msg.type === 'voice' && msg.uri && (
          <VoicePlayer uri={msg.uri} duration={msg.duration ?? 0} accentColor={accentColor} />
        )}
        {msg.type === 'image' && msg.uri && (
          // @ts-ignore
          <img src={msg.uri} style={{ width: 180, height: 130, borderRadius: 10, objectFit: 'cover', display: 'block' }} alt={msg.fileName} />
        )}
        {msg.type === 'file' && (
          <View style={cb.fileRow}>
            <View style={cb.fileIcon}>
              <AppIcon name={'file-document-outline' as any} size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cb.fileName} numberOfLines={1}>{msg.fileName}</Text>
              {msg.fileSize != null && <Text style={cb.fileSize}>{fmtSize(msg.fileSize)}</Text>}
            </View>
          </View>
        )}
        <View style={cb.bubbleMeta}>
          <Text style={[cb.bubbleTime, !isSelf && cb.bubbleTimeLeft]}>{time}</Text>
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <AppIcon name={'close' as any} size={10} color={isSelf ? 'rgba(255,255,255,0.6)' : '#CBD5E1'} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function ChatBox({ messages, onAdd, onDelete, hideHeader, accentColor }: {
  messages: ChatMessage[];
  onAdd: (msg: ChatMessage) => void;
  onDelete: (id: string) => void;
  hideHeader?: boolean;
  accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const _T_cb = useMobileTokens();
  const _isDark_cb = useThemeModeStore(s => s.resolvedDark);
  const cb = useMemo(() => makeCbStyles(P, _T_cb, _isDark_cb), [P, _T_cb, _isDark_cb]);
  const [text, setText]               = React.useState('');
  const [recording, setRec]           = React.useState(false);
  const [elapsed, setElapsed]         = React.useState(0);
  const [attachMenuOpen, setAttachMenuOpen] = React.useState(false);
  const [pendingFile, setPendingFile]  = React.useState<File | null>(null);
  const [pendingCaption, setPendingCaption] = React.useState('');
  const mrRef       = React.useRef<any>(null);
  const chunksRef   = React.useRef<Blob[]>([]);
  const timerRef    = React.useRef<any>(null);
  const streamRef   = React.useRef<any>(null);
  const imageInputRef = React.useRef<any>(null);
  const scanInputRef  = React.useRef<any>(null);
  const docInputRef   = React.useRef<any>(null);
  const scrollRef   = React.useRef<any>(null);
  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  React.useEffect(() => {
    scrollRef.current?.scrollToEnd?.({ animated: true });
  }, [messages.length]);

  // Gün ayracı etiketi — Bugün / Dün / "12 Haziran"
  const dayLabel = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Bugün';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return 'Dün';
    return d.toLocaleDateString(localeTag(), { day: 'numeric', month: 'long' });
  };

  const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed) { console.log('[ChatBox.sendText] empty, skip'); return; }
    const newMsg: ChatMessage = { id: newId(), type: 'text', text: trimmed, ts: new Date().toISOString() };
    console.log('[ChatBox.sendText] adding message', newMsg, 'prev messages count:', messages.length);
    onAdd(newMsg);
    setText('');
  };

  const startRec = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const stream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new (window as any).MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e: any) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onAdd({ id: newId(), type: 'voice', uri: URL.createObjectURL(blob), duration: elapsed, ts: new Date().toISOString() });
        clearInterval(timerRef.current); setElapsed(0);
        streamRef.current?.getTracks().forEach((t: any) => t.stop());
      };
      mr.start(); mrRef.current = mr; setRec(true); setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(v => v + 1), 1000);
    } catch { alert('Mikrofon erişimi reddedildi.'); }
  };

  const stopRec = () => {
    mrRef.current?.stop(); mrRef.current = null;
    clearInterval(timerRef.current); setRec(false);
  };

  const handleFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { alert('Dosya 100 MB sınırını aşıyor.'); e.target.value = ''; return; }
    setPendingFile(file);
    setPendingCaption('');
    e.target.value = '';
  };

  const handleSendFile = () => {
    if (!pendingFile) return;
    const type: ChatMessage['type'] = pendingFile.type.startsWith('image/') ? 'image' : 'file';
    onAdd({
      id: newId(),
      type,
      uri: URL.createObjectURL(pendingFile),
      fileName: pendingFile.name,
      fileSize: pendingFile.size,
      text: pendingCaption.trim() || undefined,
      ts: new Date().toISOString(),
    });
    setPendingFile(null);
    setPendingCaption('');
  };

  return (
    <View style={cb.wrap}>
      {/* ── Header ── */}
      {!hideHeader && (
      <View style={cb.header}>
        <View style={cb.headerIcon}>
          <AppIcon name={'forum' as any} size={16} color={P} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cb.headerTitle}>Mesaj kutusu</Text>
          <Text style={cb.headerSub} numberOfLines={2}>
            Bu vakaya özel notlar, sesli mesajlar ve dosyalar
          </Text>
        </View>
        {messages.length > 0 && (
          <View style={cb.headerCount}>
            <Text style={cb.headerCountTxt}>{messages.length}</Text>
          </View>
        )}
      </View>
      )}

      {/* ── Message list ── */}
      <ScrollView
        ref={scrollRef}
        style={cb.msgList}
        contentContainerStyle={cb.msgContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={cb.emptyWrap}>
            <View style={cb.emptyIcon}>
              <AppIcon name={'message-outline' as any} size={26} color={P} />
            </View>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text style={cb.emptyTitle}>Henüz mesaj yok</Text>
              <Text style={cb.emptySub}>İlk notu yaz, sesli mesaj bırak ya da dosya ekle — bu vakaya özel kalır.</Text>
            </View>
            <View style={cb.emptyChips}>
              {Platform.OS === 'web' && (
                <TouchableOpacity style={cb.emptyChip} activeOpacity={0.8} onPress={() => startRec()}>
                  <AppIcon name={'microphone' as any} size={14} color={P} />
                  <Text style={cb.emptyChipTxt}>Sesli not</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={cb.emptyChip}
                activeOpacity={0.8}
                onPress={() => { if (Platform.OS === 'web') docInputRef.current?.click(); else setAttachMenuOpen(true); }}
              >
                <AppIcon name={'paperclip' as any} size={14} color={P} />
                <Text style={cb.emptyChipTxt}>Dosya ekle</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          messages.map((msg, i) => {
            const prev = messages[i - 1];
            const showSep = !prev || new Date(prev.ts).toDateString() !== new Date(msg.ts).toDateString();
            return (
              <React.Fragment key={msg.id}>
                {showSep && (
                  <View style={cb.daySep}>
                    <View style={cb.daySepLine} />
                    <Text style={cb.daySepTxt}>{dayLabel(msg.ts)}</Text>
                    <View style={cb.daySepLine} />
                  </View>
                )}
                <MessageBubble msg={msg} onDelete={() => onDelete(msg.id)} accentColor={accentColor} />
              </React.Fragment>
            );
          })
        )}
      </ScrollView>

      {/* ── Recording indicator ── */}
      {recording && (
        <View style={cb.recBar}>
          <View style={cb.recDot} />
          <Text style={cb.recTxt}>Kaydediliyor  {fmt(elapsed)}</Text>
          <TouchableOpacity onPress={stopRec} style={cb.recStop}>
            <AppIcon name={'stop-circle-outline' as any} size={18} color="#EF4444" />
            <Text style={cb.recStopTxt}>Durdur ve gönder</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Hidden file inputs (web only) ── */}
      {Platform.OS === 'web' && (
        <>
          {/* @ts-ignore */}
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          {/* @ts-ignore */}
          <input ref={scanInputRef} type="file" accept=".stl,.ply,.obj,.step,.stp,.dcm" style={{ display: 'none' }} onChange={handleFileChange} />
          {/* @ts-ignore */}
          <input ref={docInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />
        </>
      )}

      {/* ── File preview modal ── */}
      {pendingFile ? (
        <Modal transparent animationType="fade" onRequestClose={() => setPendingFile(null)}>
          <Pressable style={cb.previewOverlay} onPress={() => setPendingFile(null)}>
            <Pressable style={cb.previewCard} onPress={(e: any) => e.stopPropagation()}>
              {/* Header */}
              <View style={cb.previewHeader}>
                <Text style={cb.previewTitle}>Dosya Gönder</Text>
                <TouchableOpacity onPress={() => setPendingFile(null)}>
                  <AppIcon name={'close' as any} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Preview area */}
              {pendingFile.type.startsWith('image/') ? (
                // @ts-ignore
                <Image
                  source={{ uri: URL.createObjectURL(pendingFile) }}
                  style={cb.previewImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={cb.previewFileIcon}>
                  <AppIcon
                    name={
                      pendingFile.name.match(/\.(stl|ply|obj|step|stp)$/i)
                        ? ('cube-outline' as any)
                        : ('file-document-outline' as any)
                    }
                    size={48}
                    color="#0F172A"
                  />
                  <Text style={cb.previewFileName} numberOfLines={2}>{pendingFile.name}</Text>
                  <Text style={cb.previewFileSize}>{fmtSize(pendingFile.size)}</Text>
                </View>
              )}

              {/* Caption input */}
              <View style={cb.previewCaptionRow}>
                <TextInput
                  style={cb.previewCaption}
                  placeholder="Başlık ekle (isteğe bağlı)..."
                  placeholderTextColor="#94A3B8"
                  value={pendingCaption}
                  onChangeText={setPendingCaption}
                />
              </View>

              {/* Actions */}
              <View style={cb.previewActions}>
                <TouchableOpacity style={cb.previewCancelBtn} onPress={() => setPendingFile(null)}>
                  <Text style={cb.previewCancelTxt}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={cb.previewSendBtn} onPress={handleSendFile}>
                  <AppIcon name={'send' as any} size={16} color="#FFFFFF" />
                  <Text style={cb.previewSendTxt}>Gönder</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* ── Input bar — pill (input + ataç + mic) + yanında gönder ── */}
      <View style={cb.inputBar}>
        <View style={cb.inputPill}>
          {/* Text input — Enter sends, Shift+Enter newline */}
          <TextInput
            style={cb.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Mesajınızı yazın..."
            placeholderTextColor={_T_cb.ink3}
            multiline
            // @ts-ignore web only
            onKeyDown={Platform.OS === 'web' ? (e: any) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                sendText();
              }
            } : undefined}
            // @ts-ignore
            outlineStyle="none"
          />

          {/* Ataç — menü aç/kapa (pill içinde) */}
          {Platform.OS === 'web' && (
            <View style={{ position: 'relative' }}>
              {attachMenuOpen && (
                <>
                  <Pressable style={cb.attachBackdrop} onPress={() => setAttachMenuOpen(false)} />
                  <View style={cb.attachMenu}>
                    <TouchableOpacity
                      style={cb.attachItem}
                      onPress={() => { setAttachMenuOpen(false); imageInputRef.current?.click(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={cb.attachItemLabel}>Fotoğraf</Text>
                      <View style={[cb.attachIconCircle, { backgroundColor: '#0F172A' }]}>
                        <AppIcon name={'image-outline' as any} size={22} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={cb.attachItem}
                      onPress={() => { setAttachMenuOpen(false); scanInputRef.current?.click(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={cb.attachItemLabel}>Dijital Tarama</Text>
                      <View style={[cb.attachIconCircle, { backgroundColor: '#0891B2' }]}>
                        <AppIcon name={'cube-scan' as any} size={22} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={cb.attachItem}
                      onPress={() => { setAttachMenuOpen(false); docInputRef.current?.click(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={cb.attachItemLabel}>Dosya</Text>
                      <View style={[cb.attachIconCircle, { backgroundColor: '#7C3AED' }]}>
                        <AppIcon name={'file-document-outline' as any} size={22} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              <TouchableOpacity style={cb.pillIconBtn} onPress={() => setAttachMenuOpen(v => !v)} activeOpacity={0.7}>
                <AppIcon
                  name={attachMenuOpen ? ('close' as any) : ('paperclip' as any)}
                  size={19}
                  color={attachMenuOpen ? _T_cb.ink : _T_cb.ink3}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Sesli mesaj — pill içinde */}
          <TouchableOpacity style={cb.pillIconBtn} onPress={recording ? stopRec : startRec} activeOpacity={0.7}>
            <AppIcon
              name={recording ? ('stop' as any) : ('microphone' as any)}
              size={19}
              color={recording ? '#EF4444' : _T_cb.ink3}
            />
          </TouchableOpacity>
        </View>

        {/* Gönder — pill'in yanındaki yuvarlak buton */}
        <TouchableOpacity
          style={[cb.sendCircle, !text.trim() && cb.sendCircleOff]}
          onPress={sendText}
          disabled={!text.trim()}
          activeOpacity={0.85}
        >
          <AppIcon name={'send' as any} size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeCbStyles = (P: string, T: any, isDark: boolean) => StyleSheet.create({
  // Container
  wrap: { borderRadius: NORadius.xl, overflow: 'hidden', backgroundColor: T.card, flex: 1 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
                  paddingVertical: 12, backgroundColor: T.card,
                  borderBottomWidth: 1, borderBottomColor: T.hairline },
  headerIcon:  { width: 32, height: 32, borderRadius: NORadius.sm, backgroundColor: P + '16',
                  alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 13, fontWeight: '700' as any, color: T.ink, marginBottom: 1 },
  headerSub:   { fontSize: 10, color: T.ink3, lineHeight: 14 },
  // Mesaj sayacı rozeti (mesaj varken) — eski anlamsız yeşil nokta yerine
  headerCount:    { minWidth: 22, paddingHorizontal: 7, height: 20, borderRadius: 999,
                     backgroundColor: P + '16', alignItems: 'center', justifyContent: 'center' },
  headerCountTxt: { fontSize: 11, fontWeight: '700' as any, color: P },

  // Messages
  msgList:    { flex: 1, minHeight: 200, backgroundColor: T.card },
  msgContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 6, flexGrow: 1 },

  // Empty state — panel-aware, yönlendirici
  emptyWrap:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 12 },
  emptyIcon:   { width: 60, height: 60, borderRadius: 20, backgroundColor: P + '14',
                  alignItems: 'center', justifyContent: 'center' },
  emptyTitle:  { fontSize: 14, fontWeight: '600' as any, color: T.ink },
  emptySub:    { fontSize: 12, color: T.ink3, textAlign: 'center', lineHeight: 17, maxWidth: 280 },
  emptyChips:  { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' },
  emptyChip:   { flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  borderWidth: 1, borderColor: T.hairline, backgroundColor: T.card },
  emptyChipTxt:{ fontSize: 12, fontWeight: '600' as any, color: T.ink2 },

  // Gün ayracı
  daySep:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8, paddingHorizontal: 4 },
  daySepLine:{ flex: 1, height: 1, backgroundColor: T.hairline },
  daySepTxt: { fontSize: 10, fontWeight: '600' as any, color: T.ink3, letterSpacing: 0.4,
                textTransform: 'uppercase' as any },
  emptyTxt:   { fontSize: 12, color: T.ink3 },

  // Bubble — sent right (accent), received left (cardSoft)
  msgRow:      { alignItems: 'flex-end', marginBottom: 4 },
  msgRowLeft:  { alignItems: 'flex-start', marginBottom: 4 },
  bubble:      { maxWidth: '78%', backgroundColor: P,
                  borderRadius: 20, borderBottomEndRadius: 4,
                  paddingVertical: 10, paddingHorizontal: 14,
                  shadowColor: P, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  bubbleLeft:  { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#fff', borderBottomEndRadius: 20, borderBottomStartRadius: 4,
                  shadowColor: '#000', shadowOpacity: isDark ? 0.25 : 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  bubbleTxt:     { fontSize: 13, color: '#fff', lineHeight: 20 },
  bubbleTxtLeft: { color: T.ink },
  bubbleMeta:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 3 },
  bubbleTime:    { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  bubbleTimeLeft:{ color: T.ink3 },

  // File
  fileRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 160 },
  fileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.18)',
               alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 12, color: '#fff', fontWeight: '600' as any },
  fileSize: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  // Voice player
  vpWrap:    { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 190 },
  vpPlayBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.22)',
                alignItems: 'center', justifyContent: 'center' },
  vpBars:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 22 },
  vpBar:     { width: 3, borderRadius: 2 },
  vpDur:     { fontSize: 11, color: 'rgba(255,255,255,0.75)', minWidth: 30 },

  // Recording bar
  recBar:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
                 paddingVertical: 8, backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : '#FFF5F5',
                 borderTopWidth: 1, borderTopColor: isDark ? 'rgba(239,68,68,0.30)' : '#FCA5A5' },
  recDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  recTxt:     { fontSize: 12, color: '#EF4444', flex: 1 },
  recStop:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recStopTxt: { fontSize: 12, color: '#EF4444' },

  // Input bar — flat, theme-aware
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8,
               paddingHorizontal: 12, paddingVertical: 10,
               borderTopWidth: 1, borderTopColor: T.hairline, backgroundColor: T.card },
  flatBtn:     { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  flatBtnActive: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9', borderRadius: 22 },
  // Pill input — input + ataç + mic hepsi içinde (referans WhatsApp tarzı)
  inputPill:   { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44,
                  paddingStart: 16, paddingEnd: 4, borderRadius: 22,
                  backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline },
  textInput:   { flex: 1, fontSize: 13, color: T.ink, minHeight: 44, maxHeight: 110,
                  paddingHorizontal: 0, paddingVertical: 11, backgroundColor: 'transparent',
                  // @ts-ignore
                  outlineStyle: 'none' as any },
  pillIconBtn: { width: 34, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // Gönder — pill'in yanındaki yuvarlak buton
  sendCircle:    { width: 44, height: 44, borderRadius: 22, backgroundColor: P,
                    alignItems: 'center', justifyContent: 'center' },
  sendCircleOff: { opacity: 0.4 },
  micBtn:    { width: 44, height: 44, borderRadius: 22, backgroundColor: P,
                alignItems: 'center', justifyContent: 'center',
                shadowColor: P, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  micBtnRec: { backgroundColor: '#EF4444' },

  // Attach menu
  attachBackdrop: {
    position: 'absolute',
    // @ts-ignore
    top: -2000, left: -2000, right: -2000, bottom: -2000,
    zIndex: 98,
  },
  attachMenu: {
    position: 'absolute',
    bottom: 46,
    start: 0,
    flexDirection: 'column',
    gap: 6,
    // @ts-ignore
    zIndex: 99,
  },
  attachItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  attachItemLabel: {
    backgroundColor: '#1E293B', color: '#FFFFFF',
    fontSize: 12, fontWeight: '600' as any,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, overflow: 'hidden',
    // @ts-ignore
    userSelect: 'none',
  },
  attachIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    // @ts-ignore
    boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
  },

  // File preview modal
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  previewCard:    { backgroundColor: '#FFFFFF', borderRadius: 20, width: '100%', maxWidth: 420, overflow: 'hidden' },
  previewHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  previewTitle:   { fontSize: 16, fontWeight: '700' as any, color: '#0F172A' },
  previewImage:   { width: '100%', height: 240, backgroundColor: '#F8FAFC' },
  previewFileIcon:{ alignItems: 'center', justifyContent: 'center', paddingVertical: 32, gap: 8, backgroundColor: '#F8FAFC' },
  previewFileName:{ fontSize: 14, fontWeight: '600' as any, color: '#1E293B', textAlign: 'center', maxWidth: 280 },
  previewFileSize:{ fontSize: 12, color: '#94A3B8' },
  previewCaptionRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  previewCaption: { fontSize: 14, color: '#0F172A', paddingVertical: 8, paddingHorizontal: 12,
                    backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9',
                    // @ts-ignore
                    outlineStyle: 'none' as any },
  previewActions: { flexDirection: 'row', gap: 10, padding: 16, justifyContent: 'flex-end' },
  previewCancelBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F5F9' },
  previewCancelTxt: { fontSize: 14, fontWeight: '600' as any, color: '#64748B' },
  previewSendBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0F172A' },
  previewSendTxt:   { fontSize: 14, fontWeight: '700' as any, color: '#FFFFFF' },

  // legacy — keep to avoid ref errors
  circleBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F5F9',
                alignItems: 'center', justifyContent: 'center' },
  circleBtnRec: { backgroundColor: '#FFF5F5' },
  sendBtn:    { width: 34, height: 34, borderRadius: 17, backgroundColor: P,
                 alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: '#CBD5E1' },
});

// ── VoiceNoteInput (web only) ─────────────────────────────────────────────────
const WAVE_BARS = [0.3,0.5,0.8,0.6,0.9,0.4,0.7,1.0,0.5,0.6,0.3,0.8,0.9,0.5,
                   0.7,0.4,1.0,0.6,0.8,0.3,0.5,0.9,0.6,0.4,0.7,0.5,0.8,0.4];

function VoiceNotePill({
  label, note, isPlaying, onPress, onDelete, accentColor,
}: {
  label: string;
  note: { uri: string; duration: number };
  isPlaying: boolean;
  onPress: () => void;
  onDelete: () => void;
  accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const vni = useMemo(() => makeVniStyles(P), [P]);
  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  return (
    <View style={vni.pill}>
      <TouchableOpacity onPress={onPress} style={[vni.pillPlayBtn, isPlaying && vni.pillPlayBtnActive]} activeOpacity={0.8}>
        <AppIcon name={isPlaying ? ('pause' as any) : ('play' as any)} size={12} color="#fff" />
      </TouchableOpacity>
      <Text style={[vni.pillLabel, isPlaying && vni.pillLabelActive]}>{label}</Text>
      <Text style={vni.pillDur}>{fmt(note.duration)}</Text>
      <TouchableOpacity onPress={onDelete} style={vni.pillDel} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
        <AppIcon name={'close' as any} size={10} color="#94A3B8" />
      </TouchableOpacity>
    </View>
  );
}

function VoiceNoteInput({
  notes, onAdd, onDelete, accentColor,
}: {
  notes: { uri: string; duration: number }[];
  onAdd: (uri: string, dur: number) => void;
  onDelete: (index: number) => void;
  accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const vni = useMemo(() => makeVniStyles(P), [P]);
  const [recording, setRecording] = React.useState(false);
  const [elapsed, setElapsed]     = React.useState(0);
  const [activeIdx, setActiveIdx] = React.useState<number | null>(null);
  const [playPos, setPlayPos]     = React.useState(0);
  const [playElapsed, setPlayElapsed] = React.useState(0);
  const mrRef     = React.useRef<any>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef  = React.useRef<any>(null);
  const streamRef = React.useRef<any>(null);
  const audioRef  = React.useRef<any>(null);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setActiveIdx(null);
    setPlayPos(0);
    setPlayElapsed(0);
  };

  const toggleNote = (idx: number) => {
    if (activeIdx === idx) { stopAudio(); return; }
    stopAudio();
    const a = new (window as any).Audio(notes[idx].uri);
    a.ontimeupdate = () => {
      if (a.duration) { setPlayPos(a.currentTime / a.duration); setPlayElapsed(Math.floor(a.currentTime)); }
    };
    a.onended = () => { setActiveIdx(null); setPlayPos(0); setPlayElapsed(0); };
    audioRef.current = a;
    a.play();
    setActiveIdx(idx);
  };

  const start = async () => {
    if (Platform.OS !== 'web') return;
    try {
      const stream = await (navigator as any).mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new (window as any).MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e: any) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onAdd(URL.createObjectURL(blob), elapsed);
        clearInterval(timerRef.current);
        setElapsed(0);
        streamRef.current?.getTracks().forEach((t: any) => t.stop());
      };
      mr.start(); mrRef.current = mr;
      setRecording(true); setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(v => v + 1), 1000);
    } catch { alert('Mikrofon erişimi reddedildi. Tarayıcı ayarlarından izin verin.'); }
  };

  const stop = () => {
    mrRef.current?.stop(); mrRef.current = null;
    clearInterval(timerRef.current); setRecording(false);
  };

  React.useEffect(() => () => stopAudio(), []);

  if (Platform.OS !== 'web') return null;

  const hasNotes = notes.length > 0;

  return (
    <View style={vni.wrap}>
      {/* ── Saved notes row (left) + record button (right) ── */}
      <View style={vni.row}>
        {/* Notes list */}
        <View style={vni.notesRow}>
          {notes.map((n, i) => (
            <VoiceNotePill
              key={i}
              label={`Not ${i + 1}`}
              note={n}
              isPlaying={activeIdx === i}
              onPress={() => toggleNote(i)}
              onDelete={() => { if (activeIdx === i) stopAudio(); onDelete(i); }}
              accentColor={P}
            />
          ))}
        </View>

        {/* Record button */}
        <TouchableOpacity
          style={[vni.recBtn, recording && vni.recBtnActive]}
          onPress={recording ? stop : start}
          activeOpacity={0.75}
        >
          {recording ? (
            <View style={vni.stopIcon}><View style={vni.stopSquare} /></View>
          ) : (
            <View style={vni.micIcon}>
              <AppIcon name={'microphone' as any} size={13} color="#fff" />
            </View>
          )}
          <Text style={[vni.recTxt, recording && vni.recTxtActive]}>
            {recording ? fmt(elapsed) : hasNotes ? '+' : 'Sesli not'}
          </Text>
          {recording && <View style={vni.recDot} />}
        </TouchableOpacity>
      </View>

      {/* ── Expanded player for active note ── */}
      {activeIdx !== null && notes[activeIdx] && (
        <View style={vni.bubble}>
          <TouchableOpacity onPress={() => toggleNote(activeIdx)} style={vni.playBtn} activeOpacity={0.8}>
            <AppIcon name={'pause' as any} size={18} color="#fff" />
          </TouchableOpacity>
          <View style={vni.waveWrap}>
            <View style={vni.barsRow}>
              {WAVE_BARS.map((h, i) => (
                <View key={i} style={[vni.bar, {
                  height: Math.max(4, h * 26),
                  backgroundColor: i / WAVE_BARS.length < playPos ? '#0F172A' : '#CBD5E1',
                }]} />
              ))}
            </View>
            <View style={vni.timeRow}>
              <Text style={vni.timeElapsed}>{fmt(playElapsed)}</Text>
              <Text style={vni.timeDur}>{fmt(notes[activeIdx].duration)}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const makeVniStyles = (P: string) => StyleSheet.create({
  wrap:     { marginTop: 8, marginEnd: 6, marginBottom: 4 },
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  notesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },

  // ── Note pill ──
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5,
          paddingVertical: 4, paddingHorizontal: 8, borderRadius: 16,
          backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1' },
  pillPlayBtn:       { width: 18, height: 18, borderRadius: 9, backgroundColor: P,
                        alignItems: 'center', justifyContent: 'center' },
  pillPlayBtnActive: { backgroundColor: '#0F172A' },
  pillLabel:         { fontSize: 11, color: '#0F172A', fontWeight: '600' as any },
  pillLabelActive:   { color: '#0F172A' },
  pillDur:           { fontSize: 10, color: '#94A3B8' },
  pillDel:           { padding: 2 },

  // ── Record button ──
  recBtn: { flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingVertical: 5, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1,
            borderColor: '#F1F5F9', borderStyle: 'dashed' as any,
            alignSelf: 'flex-end', backgroundColor: '#F8FAFC' },
  recBtnActive: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5', borderStyle: 'solid' as any },
  micIcon:  { width: 20, height: 20, borderRadius: 10, backgroundColor: P,
               alignItems: 'center', justifyContent: 'center' },
  stopIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444',
               alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 7, height: 7, borderRadius: 2, backgroundColor: '#fff' },
  recTxt:      { fontSize: 11, color: '#475569', fontWeight: '500' as any },
  recTxtActive:{ color: '#EF4444' },
  recDot:      { width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },

  // ── Expanded waveform bubble ──
  bubble: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8,
            paddingVertical: 9, paddingHorizontal: 12, borderRadius: 18,
            backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1',
            alignSelf: 'flex-start', maxWidth: 320 },
  playBtn:  { width: 32, height: 32, borderRadius: 16, backgroundColor: P,
               alignItems: 'center', justifyContent: 'center' },
  waveWrap: { flex: 1, gap: 3 },
  barsRow:  { flexDirection: 'row', alignItems: 'center', gap: 2, height: 26 },
  bar:      { width: 3, borderRadius: 2, minHeight: 4 },
  timeRow:  { flexDirection: 'row', justifyContent: 'space-between' },
  timeElapsed: { fontSize: 10, color: '#0F172A' },
  timeDur:     { fontSize: 10, color: '#94A3B8' },
  delBtn:      { padding: 4 },
});

// SectionCard, FieldError, Field → imported from ../components/FormPrimitives

// ── Drum-roll Wheel Picker ──────────────────────────────────────

const WHEEL_ITEM_H = 36;
const WHEEL_VISIBLE = 5;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;

function WheelPickerColumn({
  items, selectedIndex, onChange, width = 80,
}: {
  items: string[]; selectedIndex: number; onChange: (i: number) => void; width?: number;
}) {
  const scrollRef = useRef<any>(null);
  const [displayIdx, setDisplayIdx] = useState(selectedIndex);
  const debounceRef = useRef<any>(null);

  // Scroll to position on mount / external change
  useEffect(() => {
    const offset = selectedIndex * WHEEL_ITEM_H;
    if (Platform.OS === 'web') {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = offset;
      });
    } else {
      scrollRef.current?.scrollTo({ y: offset, animated: false });
    }
    setDisplayIdx(selectedIndex);
  }, [selectedIndex]);

  const handleScroll = (e: any) => {
    const top = Platform.OS === 'web'
      ? (e.target as HTMLElement).scrollTop
      : e.nativeEvent.contentOffset.y;
    const raw = Math.round(top / WHEEL_ITEM_H);
    const idx = Math.max(0, Math.min(raw, items.length - 1));
    setDisplayIdx(idx);
    if (Platform.OS === 'web') {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(idx), 120);
    }
  };

  const handleNativeScrollEnd = (e: any) => {
    const top = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(Math.round(top / WHEEL_ITEM_H), items.length - 1));
    onChange(idx);
  };

  if (Platform.OS === 'web') {
    return (
      <div style={{ position: 'relative', width, height: WHEEL_H, flexShrink: 0 }}>
        {/* Selection indicator lines */}
        <div style={{
          position: 'absolute', top: WHEEL_ITEM_H * 2, left: 6, right: 6,
          height: WHEEL_ITEM_H,
          borderTop: '1.5px solid #F1F5F9',
          borderBottom: '1.5px solid #F1F5F9',
          pointerEvents: 'none', zIndex: 2,
        }} />
        {/* Fade gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, white 0%, transparent 30%, transparent 70%, white 100%)',
          pointerEvents: 'none', zIndex: 3,
        }} />
        {/* Scroll column */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            height: WHEEL_H, overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            scrollbarWidth: 'none' as any,
            // @ts-ignore
            msOverflowStyle: 'none',
          }}
        >
          <div style={{ height: WHEEL_ITEM_H * 2 }} />
          {items.map((item, i) => {
            const dist = Math.abs(i - displayIdx);
            return (
              <div
                key={i}
                onClick={() => {
                  onChange(i);
                  scrollRef.current?.scrollTo({ top: i * WHEEL_ITEM_H, behavior: 'smooth' });
                }}
                style={{
                  scrollSnapAlign: 'center',
                  height: WHEEL_ITEM_H,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: dist === 0 ? 15 : 13,
                  fontWeight: dist === 0 ? '600' : '400',
                  fontFamily: "'Zilla Slab', serif",
                  color: '#0F172A',
                  opacity: dist === 0 ? 1 : dist === 1 ? 0.38 : 0.14,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'opacity 0.12s, font-size 0.12s',
                } as any}
              >
                {item}
              </div>
            );
          })}
          <div style={{ height: WHEEL_ITEM_H * 2 }} />
        </div>
      </div>
    );
  }

  // Native ScrollView-based picker
  return (
    <View style={{ width, height: WHEEL_H }}>
      <View style={{
        position: 'absolute', top: WHEEL_ITEM_H * 2, left: 4, right: 4, height: 1, backgroundColor: '#F1F5F9',
      }} />
      <View style={{
        position: 'absolute', top: WHEEL_ITEM_H * 3, left: 4, right: 4, height: 1, backgroundColor: '#F1F5F9',
      }} />
      <ScrollView
        ref={scrollRef}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleNativeScrollEnd}
        style={{ height: WHEEL_H }}
      >
        <View style={{ height: WHEEL_ITEM_H * 2 }} />
        {items.map((item, i) => {
          const dist = Math.abs(i - displayIdx);
          return (
            <View key={i} style={{ height: WHEEL_ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{
                fontSize: dist === 0 ? 15 : 13,
                fontFamily: dist === 0 ? F.semibold : F.regular,
                fontWeight: dist === 0 ? '600' : '400',
                color: '#0F172A',
                opacity: dist === 0 ? 1 : dist === 1 ? 0.38 : 0.14,
              }}>
                {item}
              </Text>
            </View>
          );
        })}
        <View style={{ height: WHEEL_ITEM_H * 2 }} />
      </ScrollView>
    </View>
  );
}

// ── Date Wheel Picker Modal ──────────────────────────────────────

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Modern calendar date picker — matches shared core/ui/DatePicker design
// (month + year dropdowns, accent-aware, Patterns §13)
function DateWheelPickerModal({
  visible, value, onChange, onClose, minDate, maxDate, title, anchorPos, accentColor,
}: {
  visible: boolean;
  value: Date | null;
  onChange: (d: Date) => void;
  onClose: () => void;
  minDate?: Date;
  maxDate?: Date;
  title?: string;
  anchorPos?: { x: number; y: number; w: number; h: number };
  accentColor?: string;
}) {
  const accent = accentColor ?? C.primary;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { width: SW, height: SH } = useWindowDimensions();
  const now = new Date();

  const initial = value ?? now;
  const [viewYear,  setViewYear]  = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const [monthDropOpen, setMonthDropOpen] = useState(false);
  const [yearDropOpen,  setYearDropOpen]  = useState(false);

  useEffect(() => {
    if (visible) {
      const d = value ?? now;
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setMonthDropOpen(false);
      setYearDropOpen(false);
    }
  }, [visible]);

  const MONTHS_TR   = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const WEEKDAYS_TR = (() => {
    const base = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];   // Pazartesi tabanlı
    const shift = (weekStartsOn() - 1 + 7) % 7;
    return base.slice(shift).concat(base.slice(0, shift));
  })();

  // Varsayılan alt sınır 100 yıl geriye: bu seçici doğum tarihi için de
  // kullanılıyor ve `minDate` verilmediğinde 60 yıl geriye kapanıyordu —
  // 1966'dan yaşlı hasta seçilemiyordu. İleri tarihli alanlar (teslim) zaten
  // kendi `minDate`'ini geçiyor, bu varsayılan onları etkilemez.
  const minY = minDate ? minDate.getFullYear() : new Date().getFullYear() - 100;
  const maxY = maxDate ? maxDate.getFullYear() : new Date().getFullYear() + 10;
  const yearList: number[] = [];
  for (let y = maxY; y >= minY; y--) yearList.push(y);

  // Calendar grid (Mon-start)
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Hafta başlangıcı bölgeye bağlı: TR/AB Pazartesi, İran Cumartesi (weekdayOffset).
  const startWeekday = weekdayOffset(firstOfMonth.getDay());

  const cells: Array<{ day: number; date: Date } | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: new Date(viewYear, viewMonth, d, 12, 0, 0) });
  }
  while (cells.length < 42) cells.push(null);

  const isSameDay = (a: Date | null, b: Date | null) =>
    !!a && !!b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth()    === b.getMonth()
    && a.getDate()     === b.getDate();

  const isDisabled = (d: Date) => {
    if (minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && d > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59)) return true;
    return false;
  };

  const goPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const pickDay = (d: Date) => { onChange(d); onClose(); };

  // Hex color → soft tint (e.g. accent + '14' is too web-only). Use rgba.
  const tintBg = (() => {
    // Accept hex like #RRGGBB
    const m = accent.match(/^#([0-9a-f]{6})$/i);
    if (!m) return 'rgba(0,0,0,0.06)';
    const r = parseInt(m[1].slice(0,2), 16);
    const g = parseInt(m[1].slice(2,4), 16);
    const b = parseInt(m[1].slice(4,6), 16);
    return `rgba(${r},${g},${b},0.10)`;
  })();

  const POPOVER_W = 300;
  const POPOVER_H = 360;
  const cardTop = anchorPos
    ? (anchorPos.y + anchorPos.h + 6 + POPOVER_H > SH
        ? Math.max(8, anchorPos.y - POPOVER_H - 6)
        : anchorPos.y + anchorPos.h + 6)
    : undefined;
  const cardLeft = anchorPos
    ? Math.max(8, Math.min(anchorPos.x, SW - POPOVER_W - 8))
    : undefined;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : 'rgba(0,0,0,0.20)' }}
        onPress={onClose}
      >
        <View
          onStartShouldSetResponder={() => true}
          style={[
            {
              width: POPOVER_W,
              backgroundColor: T.card,
              borderRadius: 18,
              padding: 14,
              borderWidth: 1,
              borderColor: T.hairline,
              ...Platform.select({
                web:     { boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.6)' : '0 16px 40px rgba(0,0,0,0.15)' } as any,
                default: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.5 : 0.14, shadowRadius: 24, elevation: 8 },
              }),
            },
            anchorPos
              ? { position: 'absolute', top: cardTop, left: cardLeft }
              : { alignSelf: 'center', marginTop: 80 },
          ]}
        >
          {/* Header — prev / month-trigger / year-trigger / next */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Pressable
              onPress={goPrev}
              style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft }}
            >
              <AppIcon name={dirIcon('chevron-left') as any} size={15} color={T.ink2} />
            </Pressable>

            <Pressable
              onPress={() => { setMonthDropOpen(v => !v); setYearDropOpen(false); }}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
                backgroundColor: monthDropOpen ? T.cardSoft : 'transparent',
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', fontFamily: F.semibold, color: T.ink, letterSpacing: -0.2 }}>
                {MONTHS_TR[viewMonth]}
              </Text>
              <AppIcon name={'chevron-down' as any} size={12} color={T.ink3} />
            </Pressable>

            <Pressable
              onPress={() => { setYearDropOpen(v => !v); setMonthDropOpen(false); }}
              style={{
                width: 80,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
                backgroundColor: yearDropOpen ? T.cardSoft : 'transparent',
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', fontFamily: F.semibold, color: T.ink, letterSpacing: -0.2 }}>
                {viewYear}
              </Text>
              <AppIcon name={'chevron-down' as any} size={12} color={T.ink3} />
            </Pressable>

            <Pressable
              onPress={goNext}
              style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft }}
            >
              <AppIcon name={dirIcon('chevron-right') as any} size={15} color={T.ink2} />
            </Pressable>
          </View>

          {/* Weekday header */}
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {WEEKDAYS_TR.map(w => (
              <Text
                key={w}
                style={{
                  flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600',
                  letterSpacing: 0.7, textTransform: 'uppercase', color: T.ink3,
                }}
              >
                {w}
              </Text>
            ))}
          </View>

          {/* Day grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((c, i) => {
              if (!c) return <View key={i} style={{ width: '14.2857%', aspectRatio: 1 }} />;
              const selected = isSameDay(c.date, value);
              const today    = isSameDay(c.date, now);
              const dis      = isDisabled(c.date);
              return (
                <View key={i} style={{ width: '14.2857%', aspectRatio: 1, padding: 2 }}>
                  <Pressable
                    onPress={() => !dis && pickDay(c.date)}
                    disabled={dis}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: selected ? accent : 'transparent',
                      borderWidth: today && !selected ? 1 : 0,
                      borderColor: today && !selected ? accent : 'transparent',
                      opacity: dis ? 0.3 : 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: selected ? '700' : today ? '600' : '500',
                        fontFamily: selected || today ? F.semibold : F.medium,
                        color: selected ? '#FFFFFF' : today ? accent : T.ink,
                      }}
                    >
                      {c.day}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* Footer — Bugün + Kapat */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 10, paddingTop: 10,
            borderTopWidth: 1, borderTopColor: T.hairline,
          }}>
            <Pressable
              onPress={() => {
                const t = new Date();
                if (!isDisabled(t)) pickDay(t);
                else { setViewYear(t.getFullYear()); setViewMonth(t.getMonth()); }
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: T.cardSoft }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', fontFamily: F.semibold, color: accent }}>Bugün</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', fontFamily: F.medium, color: T.ink2 }}>Kapat</Text>
            </Pressable>
          </View>

          {/* Month dropdown — overlay */}
          {monthDropOpen && (
            <Pressable
              onPress={() => setMonthDropOpen(false)}
              style={{
                position: 'absolute', top: 56, start: 50, width: 140, maxHeight: 240,
                backgroundColor: T.card, borderRadius: 12,
                borderWidth: 1, borderColor: T.hairline,
                paddingVertical: 4, overflow: 'hidden',
                ...Platform.select({
                  web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
                  default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 10 },
                }),
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false}>
                {MONTHS_TR.map((m, idx) => {
                  const active = idx === viewMonth;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => { setViewMonth(idx); setMonthDropOpen(false); }}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 9,
                        backgroundColor: active ? tintBg : T.card,
                      }}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: active ? '700' : '500',
                        fontFamily: active ? F.semibold : F.medium,
                        color: active ? accent : T.ink,
                      }}>
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          )}

          {/* Year dropdown — overlay */}
          {yearDropOpen && (
            <Pressable
              onPress={() => setYearDropOpen(false)}
              style={{
                position: 'absolute', top: 56, end: 50, width: 100, maxHeight: 240,
                backgroundColor: T.card, borderRadius: 12,
                borderWidth: 1, borderColor: T.hairline,
                paddingVertical: 4, overflow: 'hidden',
                ...Platform.select({
                  web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
                  default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 10 },
                }),
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false}>
                {yearList.map(y => {
                  const active = y === viewYear;
                  return (
                    <Pressable
                      key={y}
                      onPress={() => { setViewYear(y); setYearDropOpen(false); }}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: active ? tintBg : T.card,
                      }}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: active ? '700' : '500',
                        fontFamily: active ? F.semibold : F.medium,
                        color: active ? accent : T.ink,
                      }}>
                        {y}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const makeDpStyles = (P: string) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: 280,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 14,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8,
  },
  navBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center', justifyContent: 'center',
  },
  monthLabel: {
    flex: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 6, borderRadius: 8,
  },
  monthText: {
    fontSize: 14, fontWeight: '600', fontFamily: F.semibold,
    color: '#0F172A',
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  weekLabel: {
    flex: 1, textAlign: 'center',
    fontSize: 10, fontWeight: '600', fontFamily: F.semibold,
    color: '#94A3B8', letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 6,
  },
  cell: {
    width: `${100/7}%`,
    aspectRatio: 1,
    padding: 2,
  },
  cellInner: {
    alignItems: 'center', justifyContent: 'center',
  },
  dayPill: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  dayPillToday: {
    borderWidth: 1.2,
    borderColor: P,
  },
  dayPillSelected: {
    backgroundColor: P,
  },
  dayText: {
    fontSize: 13, fontWeight: '500', fontFamily: F.medium,
    color: '#1E293B',
  },
  dayTextDisabled: {
    color: '#CBD5E1',
  },
  dayTextToday: {
    color: P, fontWeight: '700', fontFamily: F.semibold,
  },
  dayTextSelected: {
    color: '#FFFFFF', fontWeight: '700', fontFamily: F.semibold,
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4,
  },
  todayBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, backgroundColor: '#F1F5F9',
  },
  todayText: {
    fontSize: 11, fontWeight: '600', fontFamily: F.semibold,
    color: P, letterSpacing: 0.2,
  },
  yearList: {
    maxHeight: 240,
    paddingHorizontal: 10,
  },
  yearItem: {
    paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8,
    alignItems: 'center',
  },
  yearItemActive: {
    backgroundColor: P,
  },
  yearText: {
    fontSize: 13, fontWeight: '500', fontFamily: F.medium,
    color: '#1E293B',
  },
  yearTextActive: {
    color: '#FFFFFF', fontWeight: '700', fontFamily: F.semibold,
  },
});

// ── DateField ────────────────────────────────────────────────────

function DateField({ label, value, onChange, minDate, maxDate, placeholder, flex, required, error, accentColor }: {
  label?: string;
  value: Date | null;
  onChange: (d: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  flex?: boolean;
  required?: boolean;
  error?: string;
  accentColor?: string;
}) {
  const accent = accentColor ?? C.primary;
  const NO = useNOTokens();
  const [showPicker, setShowPicker] = useState(false);
  const [focused,    setFocused]    = useState(false);
  const [textValue,  setTextValue]  = useState('');
  const [pos,        setPos]        = useState({ x: 0, y: 0, w: 0, h: 0 });
  const fieldRef = useRef<any>(null);

  // Sync text when value changes externally (from picker or parent)
  useEffect(() => {
    if (value) {
      const d = value.getDate().toString().padStart(2, '0');
      const m = (value.getMonth() + 1).toString().padStart(2, '0');
      const y = value.getFullYear();
      setTextValue(`${d}.${m}.${y}`);
    } else {
      setTextValue('');
    }
  }, [value]);

  // Auto-format as user types: GG.AA.YYYY
  const handleTextChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let fmt = digits;
    if (digits.length > 4) fmt = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
    else if (digits.length > 2) fmt = digits.slice(0, 2) + '.' + digits.slice(2);
    setTextValue(fmt);

    if (digits.length === 8) {
      const day   = parseInt(digits.slice(0, 2), 10);
      const month = parseInt(digits.slice(2, 4), 10) - 1;
      const year  = parseInt(digits.slice(4, 8), 10);
      const date  = new Date(year, month, day, 12, 0, 0);
      if (!isNaN(date.getTime()) && day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 1900) {
        onChange(date);
      }
    }
  };

  const handleOpenPicker = () => {
    fieldRef.current?.measure((_fx: number, _fy: number, w: number, h: number, px: number, py: number) => {
      setPos({ x: px, y: py, w, h });
      setShowPicker(true);
    });
  };

  return (
    <View style={[_staticStyles.fieldWrap, flex && { flex: 1 }]}>
      {label && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 }}>
          {required && <Text style={{ fontSize: 13, color: error ? '#EF4444' : '#0F172A', fontWeight: '700', lineHeight: 16 }}>*</Text>}
          <Text style={[_staticStyles.fieldLabel, { marginBottom: 0 }, error && { color: '#EF4444' }]}>{label}</Text>
        </View>
      )}
      <View
        ref={fieldRef}
        style={[
          _staticStyles.dateInputRow,
          { backgroundColor: NO.bgInput, borderColor: NO.borderSoft },
          (focused || showPicker) && { borderColor: accent, backgroundColor: NO.bgInput },
          error && { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.05)' },
        ]}
      >
        <TextInput
          style={[_staticStyles.dateTextInput, { color: NO.inkStrong }]}
          value={textValue}
          onChangeText={handleTextChange}
          placeholder={placeholder ?? 'GG.AA.YYYY'}
          placeholderTextColor={NO.inkMute}
          keyboardType="numeric"
          maxLength={10}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <TouchableOpacity onPress={handleOpenPicker} style={[_staticStyles.calIconBtn, { backgroundColor: 'transparent', borderStartColor: NO.borderSoft }]} activeOpacity={0.7}>
          <AppIcon name="calendar-outline" size={16} color={value || focused || showPicker ? accent : NO.inkMute} />
        </TouchableOpacity>
      </View>
      <DateWheelPickerModal
        visible={showPicker}
        value={value}
        onChange={(d) => { onChange(d); setShowPicker(false); }}
        onClose={() => setShowPicker(false)}
        minDate={minDate}
        maxDate={maxDate}
        title={label}
        anchorPos={pos}
        accentColor={accent}
      />
    </View>
  );
}

function SummaryGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={_staticStyles.summaryGroup}>
      <Text style={_staticStyles.summaryGroupTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={_staticStyles.summaryRow}>
      <Text style={_staticStyles.summaryLabel}>{label}</Text>
      <Text style={_staticStyles.summaryValue}>{value}</Text>
    </View>
  );
}

// ── InlineSelect ────────────────────────────────────────────────

function InlineSelect({ label, icon, value, options, onSelect, error, accentColor }: {
  label: string;
  icon: string;
  value: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
  error?: string;
  accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const isel = useMemo(() => makeIselStyles(P, T, isDark), [P, T, isDark]);
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ x: 0, y: 0, w: 0, h: 0 });
  const triggerRef = useRef<any>(null);
  const selected   = options.find(o => o.value === value);
  const hasValue   = !!selected;

  const handleOpen = () => {
    // measure() returns viewport-relative coords on web (getBoundingClientRect)
    // and screen-relative coords on native — both match Modal's coordinate space
    triggerRef.current?.measure((_fx: number, _fy: number, w: number, h: number, px: number, py: number) => {
      setPos({ x: px, y: py, w, h });
      setOpen(true);
    });
  };

  return (
    <View style={isel.wrap}>
      {/* Trigger — layout hiç değişmez */}
      <TouchableOpacity
        ref={triggerRef}
        style={[isel.card, hasValue && isel.cardActive, open && isel.cardOpen, !!error && isel.cardError]}
        onPress={open ? () => setOpen(false) : handleOpen}
        activeOpacity={0.75}
      >
        <AppIcon name={icon} size={14} color="#94A3B8" />
        <View style={{ flex: 1 }}>
          <Text style={[isel.cardLabel, !!error && isel.cardLabelError]}>{label}</Text>
          <Text style={[isel.cardValue, !hasValue && isel.cardPlaceholder]}>
            {selected ? selected.label : 'Seçiniz'}
          </Text>
        </View>
        <AppIcon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={15} color="#94A3B8"
        />
      </TouchableOpacity>

      {/* Modal — ScrollView dışında render edilir, layout etkilenmez */}
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1 }}>
          {/* Şeffaf backdrop — dışarı tıklayınca kapat (liste ile iç içe değil, kardeş eleman) */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} />
          {/* Liste — trigger'ın tam altında, backdrop'ın üzerinde */}
          <View style={[isel.list, { position: 'absolute', top: pos.y + pos.h, left: pos.x, width: pos.w }]}>
            {options.map((opt, i) => {
              const active = opt.value === value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[isel.option, active && isel.optionActive, i < options.length - 1 && isel.optionBorder]}
                  onPress={() => { onSelect(opt.value); setOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[isel.optionText, active && isel.optionTextActive]}>{opt.label}</Text>
                  {active && <AppIcon name="check" size={13} color={P} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeIselStyles = (P: string, T: ReturnType<typeof useMobileTokens>, isDark: boolean) => {
  const bgCard    = isDark ? T.cardSoft : '#FFFFFF';
  const borderCol = isDark ? 'rgba(255,255,255,0.10)' : '#F1F5F9';
  const listBg    = isDark ? T.card : '#FFFFFF';
  const optActive = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const optText   = isDark ? T.ink2 : '#334155';
  const valueText = isDark ? T.ink : '#0F172A';
  const placeholder = isDark ? T.ink3 : '#CBD5E1';
  return StyleSheet.create({
    wrap: { flex: 1 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      padding: 10, borderRadius: 10,
      borderWidth: 1, borderColor: borderCol, backgroundColor: bgCard,
    },
    cardActive: { borderColor: borderCol, backgroundColor: bgCard },
    cardOpen:   { borderColor: borderCol, borderBottomStartRadius: 0, borderBottomEndRadius: 0 },
    cardError:  { borderColor: '#FCA5A5', backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : '#FFF5F5' },

    cardLabel:        { fontSize: 10, fontFamily: F.medium, color: '#94A3B8', letterSpacing: 0.3 },
    cardLabelError:   { color: '#EF4444' },
    cardLabelActive:  { color: P },
    cardValue:        { fontSize: 13, fontFamily: F.medium, fontWeight: '500', color: valueText, marginTop: 2 },
    cardValueActive:  { color: P },
    cardPlaceholder:  { color: placeholder, fontFamily: F.regular, fontWeight: '400' },

    list: {
      backgroundColor: listBg,
      borderWidth: 1, borderTopWidth: 0,
      borderColor: borderCol,
      borderBottomStartRadius: 10, borderBottomEndRadius: 10,
      overflow: 'hidden',
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.10,
      shadowRadius: 12,
      elevation: 12,
    },
    option: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 12, paddingVertical: 11,
    },
    optionBorder:     { borderBottomWidth: 1, borderBottomColor: borderCol },
    optionActive:     { backgroundColor: optActive },
    optionText:       { fontSize: 13, fontFamily: F.regular, color: optText },
    optionTextActive: { color: P, fontFamily: F.medium },
  });
};

// ── InlineDateSelect — same look as InlineSelect, opens date wheel ────────────
function InlineDateSelect({ label, value, onChange, minDate, error, accentColor }: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  minDate?: Date;
  error?: string;
  accentColor?: string;
}) {
  const P    = accentColor ?? C.primary;
  const T    = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const isel = useMemo(() => makeIselStyles(P, T, isDark), [P, T, isDark]);
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ x: 0, y: 0, w: 0, h: 0 });
  const triggerRef = useRef<any>(null);

  const formatted = value
    ? `${value.getDate().toString().padStart(2,'0')}.${(value.getMonth()+1).toString().padStart(2,'0')}.${value.getFullYear()}`
    : null;

  const handleOpen = () => {
    triggerRef.current?.measure((_fx: number, _fy: number, w: number, h: number, px: number, py: number) => {
      setPos({ x: px, y: py, w, h });
      setOpen(true);
    });
  };

  return (
    <View style={isel.wrap}>
      <TouchableOpacity
        ref={triggerRef}
        style={[isel.card, !!formatted && isel.cardActive, open && isel.cardOpen, !!error && isel.cardError]}
        onPress={open ? () => setOpen(false) : handleOpen}
        activeOpacity={0.75}
      >
        <AppIcon name={'calendar-outline' as any} size={14} color={(formatted || open) ? P : '#94A3B8'} />
        <View style={{ flex: 1 }}>
          <Text style={[isel.cardLabel, !!error && isel.cardLabelError]}>{label}</Text>
          <Text style={[isel.cardValue, !formatted && isel.cardPlaceholder]}>
            {formatted ?? 'Tarih seçin'}
          </Text>
        </View>
        <AppIcon name={open ? 'chevron-up' : 'chevron-down'} size={15} color={open ? P : '#94A3B8'} />
      </TouchableOpacity>
      <DateWheelPickerModal
        visible={open}
        value={value}
        onChange={(d) => { onChange(d); setOpen(false); }}
        onClose={() => setOpen(false)}
        minDate={minDate}
        title={label}
        anchorPos={pos}
        accentColor={P}
      />
    </View>
  );
}

// SearchableDropdown, DropdownOption → imported from ../components/FormPrimitives

// ── Step Sidebar (desktop) ──────────────────────────────────────

const STEP_DEFS = [
  { num: 1 as Step, label: 'Klinik & hasta',    sub: 'Klinik, hekim, hasta bilgileri', icon: 'account-multiple-outline'  as any },
  { num: 2 as Step, label: 'Diş & protez',      sub: 'Diş seçimi, iş detayları',      icon: 'tooth-outline'             as any },
  { num: 3 as Step, label: 'Vaka detayları',    sub: 'Ölçüm, teslim tarihi, notlar',  icon: 'clipboard-text-outline'    as any },
  { num: 4 as Step, label: 'Özet & gönder',     sub: 'Kontrol et ve kaydet',           icon: 'send-check-outline'        as any },
];

function StepSidebar({ currentStep, accentColor }: { currentStep: Step; accentColor?: string }) {
  const P = accentColor ?? C.primary;
  const sb = useMemo(() => makeSbStyles(P), [P]);
  return (
    <View style={sb.sidebar}>
      <View style={sb.stepsWrap}>
        {STEP_DEFS.map((s, i) => {
          const done   = currentStep > s.num;
          const active = currentStep === s.num;
          const isLast = i === STEP_DEFS.length - 1;
          return (
            <View key={s.num} style={sb.stepItem}>
              {/* Circle — number inside, checkmark when done */}
              <View style={[sb.ring, done && sb.ringDone, active && sb.ringActive]}>
                {done
                  ? <Text style={sb.ringCheck}>✓</Text>
                  : <Text style={[sb.ringNum, active && sb.ringNumActive]}>{s.num}</Text>
                }
              </View>

              {/* Label */}
              <Text style={[sb.stepLabel, active && sb.stepLabelActive, done && sb.stepLabelDone]}>
                {s.label}
              </Text>
              {(active || done) && (
                <Text style={[sb.stepSub, done && sb.stepSubDone]}>{s.sub}</Text>
              )}

              {/* Connecting line — after label, before next step */}
              {!isLast && (
                <View style={sb.lineSegment}>
                  <View style={[sb.line, done && sb.lineDone]} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeSbStyles = (P: string) => StyleSheet.create({
  sidebar: {
    width: 100,
    backgroundColor: '#FFFFFF',
    borderEndWidth: 1,
    borderEndColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingTop: 24,
    paddingBottom: 16,
  },
  stepsWrap: { flex: 1 },

  // Each step: vertical stack, centered
  stepItem: {
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Line after label — before next step circle
  lineSegment: {
    alignItems: 'center',
    width: '100%',
    minHeight: 18,
    paddingVertical: 2,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: '#F1F5F9',
    borderRadius: 1,
  },
  lineDone: { backgroundColor: P },

  // Ring — grey border, white fill, number inside
  ring: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  ringDone:   { borderColor: P, backgroundColor: P },
  ringActive: { borderColor: P, backgroundColor: '#FFFFFF' },

  // Number label inside ring
  ringNum: {
    fontSize: 15, fontFamily: F.semibold, color: '#94A3B8',
  },
  ringNumActive: { color: P },

  // Checkmark inside ring when done
  ringCheck: {
    fontSize: 16, fontFamily: F.semibold, color: '#FFFFFF',
  },

  // Label + icon row below ring — centered
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 },
  stepIcon: { opacity: 0.85 },
  stepLabel: {
    fontSize: 13, fontWeight: '400', fontFamily: F.regular,
    color: '#94A3B8', textAlign: 'center',
  },
  stepLabelActive: { color: C.textPrimary, fontWeight: '600', fontFamily: F.semibold },
  stepLabelDone:   { color: P,     fontWeight: '500', fontFamily: F.medium },
  stepSub: {
    fontSize: 11, fontWeight: '400', fontFamily: F.regular,
    color: '#B0BAC9', textAlign: 'center', marginTop: 2, marginBottom: 4,
  },
  stepSubDone: { color: '#93C5FD' },
});

// ── Styles ──────────────────────────────────────────────────────

const makeStyles = (P: string, T: any, isDark: boolean) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F2EA' },

  /* Outer layout */
  outerWrap:        { flex: 1, backgroundColor: '#FFFFFF' },
  outerWrapDesktop: { flexDirection: 'row' },
  mainCol:          { flex: 1 },

  /* Mobile step header */
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#EEF2F7',
  },
  headerTitle: { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: '#0F172A', marginBottom: 14 },
  steps: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  stepWrap: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#DDE3ED',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive:  { backgroundColor: '#F1F5F9', borderWidth: 2, borderColor: P },
  stepDotCurrent: { backgroundColor: P, borderColor: P },
  stepNum:       { fontSize: 11, fontWeight: '600', fontFamily: F.semibold, color: '#94A3B8' },
  stepNumActive: { color: P },
  stepLine:       { width: 40, height: 2, backgroundColor: '#DDE3ED', marginHorizontal: 4 },
  stepLineActive: { backgroundColor: P },
  stepLabel: { fontSize: 13, color: '#64748B', fontWeight: '500', fontFamily: F.medium },

  /* Form content area — light background so cards pop.
     Bottom padding leaves room for the floating nav buttons (Geri/İleri)
     + the floating glass tab bar on mobile. */
  content: { padding: 20, paddingBottom: 140, gap: 16 },

  /* Section cards — real cards with shadow */
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    marginBottom: 0,
    padding: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionCardHeader: {
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sectionCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionCardIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionCardTitle: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: '#1E293B', letterSpacing: 0.1 },
  sectionCardSub:   { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: C.textMuted, marginTop: 4, marginStart: 36 },
  sectionCardError: {
    borderColor: '#FEE2E2',
    borderWidth: 1.5,
  },
  sectionCardErrBadge: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    marginStart: 4,
  },
  sectionCardErrBadgeText: {
    fontSize: 9, fontFamily: F.semibold, color: '#FFFFFF',
  },

  /* Legacy clinic card selectors (unused but kept for type safety) */
  cardRow: { flexDirection: 'row', gap: 10, paddingVertical: 12 },
  selectCard: { width: 148, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF', alignItems: 'center', gap: 6 },
  selectCardActive: { borderColor: P, backgroundColor: '#F1F5F9' },
  selectCardEmoji: { fontSize: 22 },
  selectCardName: { fontSize: 12, fontWeight: '600', fontFamily: F.semibold, color: C.textPrimary, textAlign: 'center' },
  selectCardNameActive: { color: P },
  selectCardSub: { fontSize: 11, fontFamily: F.regular, color: C.textMuted },
  emptyNote: { paddingVertical: 14, fontSize: 13, fontFamily: F.regular, color: C.textMuted, fontStyle: 'italic' },
  doctorGrid: { paddingVertical: 10, gap: 8 },
  doctorCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1.5, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF', gap: 12 },
  doctorCardActive: { borderColor: P, backgroundColor: '#F1F5F9' },
  doctorAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  doctorAvatarActive: { backgroundColor: P },
  doctorAvatarText: { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: '#FFFFFF' },
  doctorName: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: C.textPrimary },
  doctorNameActive: { color: P },
  doctorClinic: { fontSize: 12, fontFamily: F.regular, color: C.textSecondary, marginTop: 1 },
  checkMark: { fontSize: 16, color: P, fontWeight: '600', fontFamily: F.semibold },

  /* Form fields */
  twoCol: { flexDirection: 'row', gap: 12, overflow: 'visible', marginBottom: 14 },
  twoColStack: { flexDirection: 'column', gap: 14, overflow: 'visible', marginBottom: 14 },
  fieldWrap: { marginBottom: 0 },
  fieldLabel: {
    fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: '#475569',
    marginBottom: 7, letterSpacing: 0.2, textTransform: 'none',
  },
  fieldSub: { fontSize: 12, fontFamily: F.regular, color: C.textMuted },
  fieldInput: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, fontWeight: '400', fontFamily: F.regular, color: '#0F172A', backgroundColor: '#FFFFFF',
    // @ts-ignore
    outlineStyle: 'none' as any,
  },
  fieldInputMulti: { minHeight: 88, textAlignVertical: 'top' },

  /* Toggles and chips */
  urgentRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: '#E9EEF4',
    backgroundColor: '#FAFBFC', marginBottom: 14,
  },
  rowBetween: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: '#E9EEF4',
    backgroundColor: '#FAFBFC', marginBottom: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingTop: 2 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#DDE3ED',
    backgroundColor: 'transparent',
  },
  chipActive:     { borderColor: P, backgroundColor: 'transparent' },
  chipText:       { fontSize: 13, fontWeight: '500', fontFamily: F.regular, color: T.ink2 },
  chipTextActive: { color: P, fontWeight: '600', fontFamily: F.semibold },
  tagChipActive:     { borderColor: C.warning, backgroundColor: C.warningBg },
  tagChipTextActive: { color: C.warning, fontWeight: '500', fontFamily: F.medium },

  /* Date buttons — consistent with field inputs */
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 14, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  dateBtnText: { fontSize: 15, fontWeight: '400', fontFamily: F.regular, color: '#0F172A', flex: 1 },

  // New date input styles
  dateInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingStart: 14, overflow: 'hidden',
  },
  dateTextInput: {
    flex: 1, fontSize: 14, fontFamily: F.regular, color: '#0F172A',
    paddingVertical: 11, paddingEnd: 8,
    outlineStyle: 'none',
  } as any,
  calIconBtn: {
    paddingHorizontal: 12, paddingVertical: 11,
    borderStartWidth: 1, borderStartColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },

  /* Shade + machine chips */
  shadeChip:       { borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#DDE3ED', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: 'transparent' },
  shadeChipActive: { borderColor: P, backgroundColor: 'transparent' },
  shadeText:       { fontSize: 12, fontWeight: '500', fontFamily: F.regular, color: T.ink2 },
  shadeTextActive: { color: P, fontFamily: F.medium },
  machineRow: { flexDirection: 'row', gap: 10, paddingBottom: 14 },
  machineCard: {
    flex: 1, borderWidth: 1.5, borderColor: '#DDE3ED',
    borderRadius: 12, padding: 16, alignItems: 'center', backgroundColor: '#FAFBFC',
  },
  machineCardActive: { borderColor: P, backgroundColor: '#F1F5F9' },
  machineEmoji:      { fontSize: 18, marginBottom: 6 },
  machineDesc:       { fontSize: 11, fontFamily: F.regular, color: C.textSecondary, textAlign: 'center' },
  machineDescActive: { color: P, fontFamily: F.medium },

  /* Step 2 layout */
  step2Container:        { flex: 1, backgroundColor: '#FFFFFF' },
  step2ContainerDesktop: { flexDirection: 'row' },
  step2Left:             { flex: 1, backgroundColor: '#FFFFFF' },
  step2LeftDesktop:      { flex: 1, borderEndWidth: 1, borderEndColor: '#EEF2F7' },
  step2LeftContent:      { padding: 16, paddingBottom: 24, gap: 0 },
  step2Right:            { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEF2F7', maxHeight: 380 },
  step2RightDesktop:     { width: 300, borderTopWidth: 0, maxHeight: undefined },
  catalogHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  catalogTitle:      { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: '#0F172A' },
  totalBadge:        { backgroundColor: P, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  totalBadgeText:    { color: '#FFFFFF', fontSize: 11, fontWeight: '500', fontFamily: F.medium },
  pendingItems:      { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pendingRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pendingName:       { flex: 1, fontSize: 13, fontFamily: F.regular, color: C.textPrimary },
  pendingPrice:      { fontSize: 13, fontWeight: '500', fontFamily: F.medium, color: P },
  removeBtn:         { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  removeBtnText:     { fontSize: 11, color: '#DC2626', fontWeight: '600', fontFamily: F.semibold },
  pendingTotal:      { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#F1F5F9' },
  pendingTotalLabel: { fontSize: 13, fontWeight: '500', fontFamily: F.medium, color: P },
  pendingTotalValue: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: P },
  catalogSearch: {
    margin: 12, backgroundColor: '#FAFBFC', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 13, fontWeight: '400', fontFamily: F.regular, color: '#0F172A',
    borderWidth: 1, borderColor: '#DDE3ED',
    // @ts-ignore
    outlineStyle: 'none' as any,
  },
  catalogScroll:    { flex: 1 },
  catalogEmpty:     { padding: 28, alignItems: 'center' },
  catalogEmptyText: { fontSize: 13, fontFamily: F.regular, color: C.textMuted, textAlign: 'center' },
  catGroupLabel: {
    fontSize: 10, fontWeight: '500', fontFamily: F.medium, color: C.textMuted,
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6, letterSpacing: 0.8, textTransform: 'none',
  },
  catalogItem:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 10 },
  addCircle:           { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#86EFAC', alignItems: 'center', justifyContent: 'center' },
  addCircleActive:     { backgroundColor: P, borderColor: P },
  addCircleText:       { fontSize: 14, color: '#16A34A', fontWeight: '600', fontFamily: F.semibold, lineHeight: 20 },
  addCircleTextActive: { color: '#FFFFFF' },
  catalogItemName:  { flex: 1, fontSize: 13, fontFamily: F.regular, color: C.textPrimary },
  catalogItemPrice: { fontSize: 12, fontWeight: '500', fontFamily: F.medium, color: P },

  /* Step 3 summary */
  summaryCard: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  summaryTitle: {
    fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: '#0F172A',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  urgentBanner:     { backgroundColor: '#FEF2F2', padding: 10, margin: 14, borderRadius: 8, alignItems: 'center' },
  urgentBannerText: { color: '#DC2626', fontWeight: '600', fontFamily: F.semibold, fontSize: 13, letterSpacing: 0.3 },
  summaryGroup:      { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  summaryGroupTitle: { fontSize: 10, fontWeight: '500', fontFamily: F.medium, color: '#94A3B8', letterSpacing: 0.8, marginBottom: 10, textTransform: 'none' },
  summaryRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  summaryLabel:      { fontSize: 13, fontWeight: '400', fontFamily: F.regular, color: C.textSecondary, flex: 1 },
  summaryValue:      { fontSize: 13, fontWeight: '500', fontFamily: F.medium, color: '#0F172A', flex: 2, textAlign: 'end' as any },
  summaryTotal:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, marginTop: 4 },
  summaryTotalLabel: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: P },
  summaryTotalValue: { fontSize: 16, fontWeight: '600', fontFamily: F.semibold, color: P },
  noteText:          { fontSize: 13, fontFamily: F.regular, color: C.textPrimary, lineHeight: 20, paddingBottom: 8 },

  /* Navigation bar */
  errorBanner: { backgroundColor: '#FEF2F2', borderTopWidth: 1, borderTopColor: '#FECACA', paddingHorizontal: 20, paddingVertical: 10 },
  errorText:   { fontSize: 13, color: '#DC2626', fontWeight: '500', fontFamily: F.medium },
  navBar: {
    flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#EEF2F7',
    backgroundColor: '#FFFFFF', alignItems: 'center', gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 6,
  },
  backBtn: {
    paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#DDE3ED', backgroundColor: '#FAFBFC',
  },
  backBtnText: { fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#64748B' },
  nextBtn: {
    paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12,
    backgroundColor: P,
    shadowColor: P,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtn:   { backgroundColor: '#059669', shadowColor: '#059669' },
  nextBtnText: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: '#FFFFFF', letterSpacing: 0.3 },
});

// ── Step 2 styles ────────────────────────────────────────────────
const makeS2Styles = (P: string) => StyleSheet.create({
  /* Acil + Onay yan yana togglelar */
  toggleRow: {
    flexDirection: 'row', gap: 8,
  },
  toggleItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF',
  },
  toggleItemUrgent:   { borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  toggleItemApproval: { borderColor: '#CBD5E1', backgroundColor: '#F1F5F9' },
  toggleItemLabel: {
    fontSize: 10, fontFamily: F.medium, color: '#94A3B8', letterSpacing: 0.3,
  },
  toggleItemLabelActive: { color: P },
  toggleItemDesc: {
    fontSize: 13, fontFamily: F.medium, fontWeight: '500', color: '#0F172A', marginTop: 2,
  },

  /* Rows */
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 3,
  },
  rowLabel: {
    flex: 1, fontSize: 13, fontFamily: F.regular, color: '#334155',
  },
  rowSwitch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },
  separator: {
    height: 1, backgroundColor: '#F1F5F9', marginVertical: 7,
  },

  /* Ölçüm + Model yan yana select */
  selectRow: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
  },

  /* Chips inline (sağa hizalı, row içinde) */
  chipRowInline: {
    flexDirection: 'row', gap: 5,
  },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  chipActive: {
    borderColor: P, backgroundColor: '#F1F5F9',
  },
  chipText: {
    fontSize: 12, fontFamily: F.regular, color: '#64748B',
  },
  chipTextActive: {
    color: P, fontFamily: F.medium, fontWeight: '500',
  },

  /* Teslim tarihi — dateBtn marginBottom'ı row içinde iptal */
  dateWrap: { marginBottom: -14 },

  /* Notlar — yan yana */
  notesRow: {
    flexDirection: 'row', gap: 10,
  },
  noteBox: {
    flex: 1, borderRadius: 10, borderWidth: 1,
    borderColor: '#F1F5F9', overflow: 'hidden',
  },
  noteBoxLab:     { borderColor: '#FCD34D' },
  noteBoxVisible: { borderColor: '#93C5FD' },

  noteHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 36, paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  noteHeaderLab:     { backgroundColor: '#FFFBEB', borderBottomColor: '#FCD34D' },
  noteHeaderVisible: { backgroundColor: '#F1F5F9', borderBottomColor: '#93C5FD' },
  noteHeaderText: {
    fontSize: 12, fontFamily: F.medium, fontWeight: '500', color: '#475569',
  },

  noteVisBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, backgroundColor: '#FEF3C7',
  },
  noteVisBadgeOn: { backgroundColor: '#F1F5F9' },
  noteVisBadgeText: {
    fontSize: 10, fontFamily: F.medium, color: '#92400E',
  },
  noteVisBadgeTextOn: { color: P },

  noteInput: {
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10,
    fontSize: 13, fontFamily: F.regular, color: '#0F172A',
    backgroundColor: '#FFFFFF', minHeight: 80,
    textAlignVertical: 'top',
  },
});
// Static instance for helper components that don't receive accentColor (Field, DateField, etc.)
// Uses light-mode fallback tokens — components that need theme-aware styling use the hook-driven `styles`.
const _STATIC_T_FALLBACK = {
  ink: '#0E0E0E', ink2: 'rgba(20,16,12,0.78)', ink3: 'rgba(20,16,12,0.5)',
  card: '#FFFFFF', cardSoft: '#FAF6EE', bg: '#F2EDE3',
  hairline: 'rgba(20,16,12,0.08)', hairline2: 'rgba(20,16,12,0.04)',
};
const _staticStyles = makeStyles(C.primary, _STATIC_T_FALLBACK, false);

// ── File Preview Modal styles ─────────────────────────────────────────────────
const fpv = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    width: '100%', maxWidth: 1100,
    overflow: 'hidden' as any,
    maxHeight: '92vh' as any,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginEnd: 8 },
  kindBadge: {
    width: 26, height: 26, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  title: { fontSize: 12, fontWeight: '700', color: '#0F172A', fontFamily: F.bold },
  meta:  { fontSize: 10, color: '#94A3B8', fontFamily: F.regular, marginTop: 1 },

  /* Photo */
  image: {
    width: '100%', aspectRatio: 4 / 3,
    backgroundColor: '#0F172A', maxHeight: 420,
  },

  /* 3D model viewer */
  viewerWrap: {
    width: '100%', height: 640,
    minHeight: 480,
  },

  /* Generic file info */
  fileInfo: {
    alignItems: 'center', padding: 32, gap: 10,
  },
  fileIconBig: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  fileInfoTitle: {
    fontSize: 15, fontWeight: '700', fontFamily: F.bold, color: '#0F172A',
  },
  fileInfoSub: {
    fontSize: 12, fontFamily: F.regular, color: '#94A3B8',
    textAlign: 'center', lineHeight: 18, maxWidth: 320,
  },
  fileInfoMeta: { gap: 5, alignItems: 'center', marginTop: 4 },
  fileMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fileMetaText: { fontSize: 12, fontFamily: F.regular, color: '#94A3B8' },

  openBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 18,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#32BB78',
    marginTop: 6,
  },
  openBtnText: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: '#32BB78' },
});
