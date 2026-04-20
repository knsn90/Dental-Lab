import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable,
  TextInput, ActivityIndicator, Platform, useWindowDimensions,
  Modal, FlatList, Image,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { ClinicIcon } from '../../../core/ui/ClinicIcon';
import QRCode from 'react-native-qrcode-svg';
import { useAuthStore } from '../../../core/store/authStore';
import { createWorkOrder, addOrderItem } from '../api';
import { supabase } from '../../../core/api/supabase';
import { fetchClinics, fetchAllDoctors, createClinic, createDoctor } from '../../clinics/api';
import { fetchLabServices } from '../../services/api';
import { MachineType, PendingItem } from '../types';
import { Clinic, Doctor } from '../../clinics/types';
import { LabService } from '../../services/types';
import { ToothNumberPicker } from '../components/ToothNumberPicker';
import { WORK_TYPES, ALL_SHADES, ORDER_TAGS, OP_CATEGORY, IMPLANT_SYSTEMS, ABUTMENT_TYPES, SCREW_TYPES, REMOVABLE_MATS, CROWN_MATERIALS, WORK_TYPE_TREE, WORK_TYPE_MAIN, deriveDepartment } from '../constants';
import { TOOTH_PATHS, TOOTH_LABEL_POS } from '../assets/toothPaths';
import { GEO_COUNTRIES, GEO_BY_LABEL } from '../data/geo';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { EkartorluIcon } from '../../../components/icons/EkartorluIcon';
import { GulushIcon } from '../../../components/icons/GulushIcon';
import { ModelViewer } from '../../../src/components/viewer/ModelViewer';
import { OcclusionAnalysisModal } from '../../occlusion/components/OcclusionAnalysisModal';
import type { OcclusionAnalysisResult } from '../../occlusion/types/occlusion';

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
type FileKind = 'photo' | 'video' | 'stl' | 'ply' | 'pdf' | 'other';

interface AttachedFile {
  id: string;
  name: string;
  uri: string;           // object URL (web) — local URI (native)
  kind: FileKind;
  size: number;          // bytes
  scope: 'case' | 'tooth';
  tooth?: number;        // defined only when scope === 'tooth'
}

interface ToothOp {
  tooth: number;
  work_type: string;
  // crown_bridge / aesthetic
  shade: string;
  // implant
  implant_system: string;
  abutment: string;
  screw: string;
  // removable
  material: string;
  // pricing
  price: number;
  material_price: number;
}

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
}

const BLANK_OP: Omit<ToothOp, 'tooth'> = {
  work_type: '', shade: '',
  implant_system: '', abutment: '', screw: '',
  material: '', price: 0, material_price: 0,
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
};

const ALL_IMPLANT_BRANDS = [
  'Straumann','Nobel Biocare','Osstem','Zimmer Biomet','Dentsply Sirona',
  'Megagen','Neodent','BioHorizons','Camlog','Astra Tech (Dentsply)',
  'Ankylos','Bicon','Biomet 3i','Blue Sky Bio','Dentium','DIO Implant',
  'Hi-Sen','IMZ','Keystone Dental','Lifecore','MIS Implants','Neway',
  'OsteoCare','Phibo','Replace (Nobel)','Seven Implant','SPI Element',
  'Touareg','Xive (Dentsply)','Southern Implants','Bredent','Cortex',
  'Alpha-Bio Tec','Biohorizons','Euroteknika','Implant Direct','Adin',
  'Thommen Medical','Bionika','T-Plus','Diğer',
];

const MODEL_TYPES = [
  { value: 'dijital', label: '💻 Dijital Tarama' },
  { value: 'fiziksel', label: '📦 Fiziksel Model' },
  { value: 'cad', label: '🖥️ CAD Dosyası' },
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
  'Alt Çene':         'Alt dişlerin 3D taraması gereklidir.',
  'Üst Çene':         'Üst dişlerin 3D taraması gereklidir.',
  'Bite (Kapanış)':   'Bite (kapanış) kaydı, dişlerin doğru temasını belirler.\nEksik olursa oklüzyon hatası riski oluşur.',
  'Diş Eti Taraması': 'Diş eti dokusunun 3D taraması. İmplant ve gingival kontur planlaması için kullanılır.',
  'Scan Body STL':    'İmplant pozisyonunu doğru belirlemek için gereklidir.',
  'Gülüş Videosu':    'Dinamik gülüş ve dudak hareketlerini görmek için önerilir.',
  'PDF Belgesi':      'Ek talimat, reçete veya detay bilgileri içeren belgeyi yükleyin.',
  'Referans Fotoğraf':'İstenen estetik ve formu göstermek için örnek görsel yükleyin.',
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
  const wrapRef = useRef<any>(null);

  const show = () => {
    const el = wrapRef.current;
    if (!el) return;
    const node: Element = typeof el.getBoundingClientRect === 'function'
      ? el : (el as any)._nativeTag;
    if (!node?.getBoundingClientRect) return;
    const rect = node.getBoundingClientRect();
    const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'right' : 'left';
    setPos({ top: rect.top + rect.height / 2, left: rect.left + rect.width / 2, side });
  };
  const hide = () => setPos(null);

  const TIP_W = image ? 300 : 240;

  // Web: raw div event handlers — RN Pressable, tooltip + embedded TouchableOpacity
  // ile birleşince Safari'de click yutabiliyor. Raw div onMouseEnter/Leave ve
  // child click'i eventini doğal olarak iletir.
  if (Platform.OS === 'web') {
    return (
      <div
        ref={wrapRef as any}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{ alignSelf: 'flex-start', display: 'inline-block' } as any}
      >
        {children}
        {pos && (
          <WebPortal>
            <View style={{
              // @ts-ignore
              position: 'fixed',
              top: pos.top,
              left: pos.side === 'right' ? pos.left + 12 : pos.left - TIP_W - 12,
              transform: [{ translateY: -40 }],
              backgroundColor: '#0F172A',
              borderRadius: 12,
              overflow: 'hidden',
              width: TIP_W,
              zIndex: 99999,
              // @ts-ignore
              boxShadow: '0 6px 24px rgba(0,0,0,0.32)',
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
                <Text style={{ color: '#F8FAFC', fontSize: 11, lineHeight: 17 }}>{text}</Text>
              </View>
            </View>
          </WebPortal>
        )}
      </div>
    );
  }

  return (
    <Pressable
      ref={wrapRef}
      // @ts-ignore
      onHoverIn={show}
      onHoverOut={hide}
      style={{ alignSelf: 'flex-start' }}
    >
      {children}
      {pos && (
        <WebPortal>
          <View style={{
            // @ts-ignore
            position: 'fixed',
            top: pos.top,
            left: pos.side === 'right' ? pos.left + 12 : pos.left - TIP_W - 12,
            transform: [{ translateY: -40 }],
            backgroundColor: '#0F172A',
            borderRadius: 12,
            overflow: 'hidden',
            width: TIP_W,
            zIndex: 99999,
            // @ts-ignore
            boxShadow: '0 6px 24px rgba(0,0,0,0.32)',
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
              <Text style={{ color: '#F8FAFC', fontSize: 11, lineHeight: 17 }}>{text}</Text>
            </View>
          </View>
        </WebPortal>
      )}
    </Pressable>
  );
}

// InfoTooltip artık kullanılmıyor — WithTooltip ile değiştirildi
function InfoTooltip(_props: { text: string; color?: string }) { return null; }

export function NewOrderScreen({ accentColor }: { accentColor?: string }) {
  const P     = accentColor ?? C.primary;
  const PBg   = accentColor ? '#F1F5F9' : C.primaryBg;
  const PLight = accentColor ? '#1E293B' : C.primaryLight;
  const styles = useMemo(() => makeStyles(P), [P]);
  const fus    = useMemo(() => makeFusStyles(P), [P]);
  const s2     = useMemo(() => makeS2Styles(P), [P]);

  const router = useRouter();
  const { profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;

  const [step, setStep] = useState<Step>(() => {
    if (Platform.OS === 'web') {
      try {
        const s = sessionStorage.getItem('new_order_step');
        if (s === '1' || s === '2' || s === '3' || s === '4') return Number(s) as Step;
      } catch {}
    }
    return 1;
  });

  const goToStep = (s: Step) => {
    if (Platform.OS === 'web') {
      try { sessionStorage.setItem('new_order_step', String(s)); } catch {}
    }
    setStep(s);
  };

  // Her step değişiminde sessionStorage'ı güncelle (HMR/reload sonrası kaldığı yerden devam)
  useEffect(() => {
    if (Platform.OS === 'web') {
      try { sessionStorage.setItem('new_order_step', String(step)); } catch {}
    }
  }, [step]);

  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  // selectedTeeth: the "edit group" — changes in the panel apply to ALL of these
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([]);

  const [form, setForm] = useState<FormData>(() => {
    if (Platform.OS === 'web') {
      try {
        const saved = sessionStorage.getItem('new_order_form');
        if (saved) {
          const parsed = JSON.parse(saved);
          // Restore Date fields
          if (parsed.patient_dob)  parsed.patient_dob  = new Date(parsed.patient_dob);
          if (parsed.delivery_date) parsed.delivery_date = new Date(parsed.delivery_date);
          // Ensure all array fields are arrays (null-safe)
          const arrFields = ['tooth_ops','pending_items','attachments','tags','voice_notes','lab_voice_notes','chat_messages'] as const;
          arrFields.forEach(k => { if (!Array.isArray(parsed[k])) parsed[k] = (INITIAL_FORM as any)[k]; });
          return { ...INITIAL_FORM, ...parsed };
        }
      } catch {}
    }
    return INITIAL_FORM;
  });
  const [loading, setLoading] = useState(false);

  // Form değiştiğinde sessionStorage'a kaydet (HMR/reload'da kaybolmasın)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try { sessionStorage.setItem('new_order_form', JSON.stringify(form)); } catch {}
  }, [form]);

  // Clinic add modal
  const [clinicModal, setClinicModal] = useState<{ visible: boolean; prefill: string }>({ visible: false, prefill: '' });
  const [clinicSaving, setClinicSaving] = useState(false);

  // Doctor add modal
  const [doctorModal, setDoctorModal] = useState<{ visible: boolean; prefill: string }>({ visible: false, prefill: '' });
  const [doctorSaving, setDoctorSaving] = useState(false);

  // Chat modal
  const [chatModalVisible, setChatModalVisible] = useState(false);


  // Step 3 — confirmed teeth (shown in bottom list after "Listeye ekle")
  const [confirmedTeeth, setConfirmedTeeth] = useState<number[]>([]);
  const lastConfirmedOpRef = useRef<Omit<ToothOp, 'tooth'>>({ ...BLANK_OP });
  const [opResetKey, setOpResetKey] = useState(0);

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

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [allDoctors, setAllDoctors] = useState<Doctor[]>([]);
  const [services, setServices] = useState<LabService[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [dataLoading, setDataLoading] = useState(true);
  const [materialPrices, setMaterialPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all([
      fetchClinics(),
      fetchAllDoctors(),
      fetchLabServices(),
      supabase.from('materials').select('name,price').eq('is_active', true),
    ]).then(([clinicsRes, doctorsRes, servicesRes, matsRes]) => {
      setClinics((clinicsRes.data as Clinic[]) ?? []);
      setAllDoctors((doctorsRes.data as Doctor[]) ?? []);
      setServices((servicesRes.data as LabService[]) ?? []);
      const priceMap: Record<string, number> = {};
      ((matsRes.data ?? []) as { name: string; price: number }[]).forEach(m => {
        priceMap[m.name] = m.price;
      });
      setMaterialPrices(priceMap);
      setDataLoading(false);
    });
  }, []);

  const set = <K extends keyof FormData>(key: K) =>
    (val: FormData[K]) => {
      setForm((f) => ({ ...f, [key]: val }));
    };

  // ── Reactive validation ───────────────────────────────────────────────────
  const [stepAttempted, setStepAttempted] = useState<Record<Step, boolean>>({
    1: false, 2: false, 3: false, 4: false,
  });
  const [submitError, setSubmitError] = useState('');

  const errors = useMemo((): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.doctor_id)                        e.doctor_id      = 'Diş hekimi seçin';
    if (!form.patient_first_name.trim())        e.patient_first_name = 'Ad zorunlu';
    if (!form.patient_last_name.trim())         e.patient_last_name  = 'Soyad zorunlu';
    if (!form.patient_dob)                      e.patient_dob        = 'Doğum tarihi zorunlu';
    if (form.patient_gender === 'belirtilmedi') e.patient_gender = 'Cinsiyet seçin';
    if (!form.patient_id?.trim())               e.patient_id     = 'TC kimlik zorunlu';
    if (!form.patient_nationality)              e.patient_nationality = 'Uyruk seçin';
    if (!form.measurement_type)  e.measurement_type  = 'Ölçüm yöntemi seçin';
    if (!form.model_type)        e.model_type        = 'Model tipi seçin';
    if (!form.delivery_date)     e.delivery_date     = 'Teslim tarihi seçin';
    if (!form.delivery_method)   e.delivery_method   = 'Teslim yöntemi seçin';
    if (form.tooth_ops.length === 0)
      e.tooth_ops = 'En az 1 diş seçin';
    else if (!form.tooth_ops.some(o => o.work_type) && form.pending_items.length === 0)
      e.tooth_ops = 'En az 1 diş için işlem belirleyin';
    return e;
  }, [form]);

  const STEP_FIELDS: Record<Step, string[]> = {
    1: ['doctor_id', 'patient_first_name', 'patient_last_name', 'patient_gender', 'patient_dob', 'patient_id', 'patient_nationality'],
    2: ['measurement_type', 'model_type', 'delivery_date', 'delivery_method'],
    3: ['tooth_ops'],
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

  const addPendingItem = (service: LabService) => {
    const existing = form.pending_items.find((i) => i.service_id === service.id);
    if (existing) {
      set('pending_items')(
        form.pending_items.map((i) =>
          i.service_id === service.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      set('pending_items')([
        ...form.pending_items,
        { service_id: service.id, name: service.name, price: service.price, quantity: 1 },
      ]);
    }
  };

  const removePendingItem = (idx: number) => {
    set('pending_items')(form.pending_items.filter((_, i) => i !== idx));
  };

  // ── File attachments ──────────────────────────────────────────────────────
  const [fileActiveTooth, setFileActiveTooth] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<AttachedFile | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  // Track whether preview was opened from inside the upload modal so we can reopen it on close
  const [previewFromUpload, setPreviewFromUpload] = useState(false);

  // ── Oklüzyon analizi modal state ─────────────────────────────────────────
  const [occlusionModalOpen,   setOcclusionModalOpen]   = useState(false);
  const [occlusionResult,      setOcclusionResult]      = useState<OcclusionAnalysisResult | null>(null);
  const [occlusionScreenshot,  setOcclusionScreenshot]  = useState<string | null>(null);
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
    setTimeout(() => setPreviewFile(file), 150);
  };

  const closePreview = () => {
    setPreviewFile(null);
    if (previewFromUpload) {
      setPreviewFromUpload(false);
      setTimeout(() => setUploadModalOpen(true), 150);
    }
  };

  const openFilePicker = (scope: 'case' | 'tooth', tooth?: number) => {
    if (Platform.OS !== 'web') return;
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

  // ── Specific photo picker (ekartörlü / gülüş) ─────────────────────────────
  const openSpecificPhotoPicker = (photoLabel: string) => {
    if (Platform.OS !== 'web') return;
    // @ts-ignore
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.jpg,.jpeg,.png,.heic,.webp';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop() ?? 'jpg';
      const newFile: AttachedFile = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: `${photoLabel}.${ext}`,
        // @ts-ignore
        uri: URL.createObjectURL(file),
        kind: 'photo',
        size: file.size,
        scope: 'case',
      };
      // Replace existing photo with same label if exists
      setForm(f => ({
        ...f,
        attachments: [
          ...f.attachments.filter(a => !a.name.startsWith(photoLabel)),
          newFile,
        ],
      }));
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  // ── Specific scan picker (kesim öncesi / alt çene / üst çene / ek tarama) ──
  const openSpecificScanPicker = (scanLabel: string) => {
    if (Platform.OS !== 'web') return;
    // @ts-ignore
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.stl,.ply,.obj,.dcm,.zip';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'stl';
      const kind: FileKind = ext === 'ply' ? 'ply' : 'stl';
      const newFile: AttachedFile = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: `${scanLabel}.${ext}`,
        // @ts-ignore
        uri: URL.createObjectURL(file),
        kind,
        size: file.size,
        scope: 'case',
      };
      setForm(f => ({
        ...f,
        attachments: [
          ...f.attachments.filter(a => !a.name.startsWith(scanLabel)),
          newFile,
        ],
      }));
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  // ── Video picker (gülüş videosu) ──────────────────────────────────────────
  const openSpecificVideoPicker = (videoLabel: string) => {
    if (Platform.OS !== 'web') return;
    // @ts-ignore
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,.mp4,.mov,.avi,.webm';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp4';
      const newFile: AttachedFile = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: `${videoLabel}.${ext}`,
        // @ts-ignore
        uri: URL.createObjectURL(file),
        kind: 'video',
        size: file.size,
        scope: 'case',
      };
      setForm(f => ({
        ...f,
        attachments: [
          ...f.attachments.filter(a => !a.name.startsWith(videoLabel)),
          newFile,
        ],
      }));
    };
    // @ts-ignore
    document.body.appendChild(input);
    input.click();
    // @ts-ignore
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  const removeAttachment = (id: string) =>
    setForm(f => ({ ...f, attachments: f.attachments.filter(a => a.id !== id) }));

  // Apply patch to every tooth in the current edit group — confirmed teeth are locked
  const updateToothOp = (patch: Partial<Omit<ToothOp, 'tooth'>>) => {
    setForm(f => ({
      ...f,
      tooth_ops: f.tooth_ops.map(o =>
        selectedTeeth.includes(o.tooth) && !confirmedTeeth.includes(o.tooth)
          ? { ...o, ...patch } : o
      ),
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

  const handleSubmit = async () => {
    if (!profile) return;
    setLoading(true);

    const toothNumbers = form.tooth_ops.map(o => o.tooth);
    const workType =
      form.tooth_ops.map(o => o.work_type).filter(Boolean).join(', ') ||
      (form.pending_items.length > 0 ? form.pending_items.map(i => i.name).join(', ') : 'Belirtilmedi');
    const shade = form.tooth_ops.find(o => o.shade)?.shade || undefined;
    // Auto-derive department from the dominant work type (not shown to user)
    const department = deriveDepartment(form.tooth_ops.find(o => o.work_type)?.work_type ?? '');

    const { data: order, error } = await createWorkOrder({
      doctor_id: form.doctor_id,
      patient_name: [form.patient_first_name, form.patient_last_name].filter(Boolean).join(' ') || undefined,
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
      measurement_type: form.measurement_type,
      doctor_approval_required: form.doctor_approval_required,
      patient_nationality: form.patient_nationality || undefined,
      patient_country: form.patient_country || undefined,
      patient_city: form.patient_city || undefined,
      lab_notes_visible: form.lab_notes_visible,
    });

    if (error || !order) {
      setSubmitError((error as any)?.message ?? 'İş emri oluşturulamadı.');
      setLoading(false);
      return;
    }

    // Create order items
    for (const item of form.pending_items) {
      await addOrderItem({
        work_order_id: order.id,
        service_id: item.service_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      });
    }

    // ─── Kapanış analizi varsa iş emrine bağla ──────────────────────────
    if (occlusionResult) {
      try {
        let screenshotUrl: string | null = null;
        if (occlusionScreenshot) {
          const blob = await fetch(occlusionScreenshot).then(r => r.blob());
          const path = `occlusion/${order.id}/${Date.now()}.png`;
          const { data: up } = await supabase.storage
            .from('occlusion-screenshots')
            .upload(path, blob, { contentType: 'image/png', upsert: true });
          if (up) {
            const { data: urlData } = supabase.storage
              .from('occlusion-screenshots')
              .getPublicUrl(path);
            screenshotUrl = urlData.publicUrl;
          }
        }
        await supabase.from('occlusion_analyses').insert({
          work_order_id: order.id,
          result_json: {
            statistics: occlusionResult.statistics,
            penetrationPoints: occlusionResult.penetrationPoints.map((p) => ({
              id: p.id, depth: p.depth, area: p.area, severity: p.severity,
              position: { x: p.position.x, y: p.position.y, z: p.position.z },
            })),
          },
          heatmap_screenshot_url: screenshotUrl,
          analysis_duration_ms: occlusionResult.durationMs,
        });
      } catch (e) {
        // Analiz kaydı zorunlu değil — order başarılı sayılır
        console.warn('[occlusion] analiz kaydı başarısız', e);
      }
    }

    setLoading(false);
    setForm(INITIAL_FORM);
    setOcclusionResult(null);
    setOcclusionScreenshot(null);
    if (Platform.OS === 'web') { try { sessionStorage.removeItem('new_order_step'); sessionStorage.removeItem('new_order_form'); } catch {} }
    setStep(1);
    router.push('/(lab)');
  };

  const selectedClinic = clinics.find((c) => c.id === form.clinic_id);
  const selectedDoctor = allDoctors.find((d) => d.id === form.doctor_id);

  // QR content & print
  const qrValue = useMemo(() => [
    'DENTAL LAB VAKA',
    selectedClinic  ? `Klinik: ${selectedClinic.name}` : '',
    selectedDoctor  ? `Hekim: ${selectedDoctor.full_name}` : '',
    (form.patient_first_name || form.patient_last_name) ? `Hasta: ${[form.patient_first_name, form.patient_last_name].filter(Boolean).join(' ')}` : '',
    form.tooth_ops.length > 0
      ? `Dişler: ${form.tooth_ops.map(o => o.tooth).sort((a,b)=>a-b).join(', ')}`
      : '',
    `Tarih: ${new Date().toLocaleDateString('tr-TR')}`,
  ].filter(Boolean).join('\n'), [selectedClinic, selectedDoctor, form.patient_first_name, form.patient_last_name, form.tooth_ops]);

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
      const det = [op.work_type, op.shade, op.material, op.implant_system, op.abutment, op.screw].filter(Boolean).join(' · ') || '—';
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

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dijital Vaka Özeti</title>
<style>
@page{size:A5;margin:12mm 13mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#111;background:#fff;font-size:10px;line-height:1.4}
.hdr{margin-bottom:10px}
.ttl{font-size:19px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;color:#0a0a0a}
.dte{font-size:8px;color:#999;margin-top:2px}
.urg{background:#111;color:#fff;text-align:center;padding:7px 10px;border-radius:5px;font-size:10px;font-weight:700;letter-spacing:1.5px;margin-bottom:9px}
.card{border:1px solid #e0e0e0;border-radius:7px;margin-bottom:8px;overflow:hidden}
.ch{background:#f6f6f6;padding:5px 10px;font-size:8px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:#444;border-bottom:1px solid #e5e5e5}
.cr{display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid #f2f2f2;gap:7px}
.cr:last-child{border-bottom:none}
.ci{width:16px;flex-shrink:0;display:flex;align-items:center}
.cl{color:#777;flex:1;font-size:9.5px}.cv{font-weight:600;font-size:9.5px;text-align:right}
.tb{display:flex;flex-direction:column;padding:8px 10px;gap:8px;align-items:flex-start}
.tl{width:100%}
.ti{display:flex;align-items:baseline;padding:4px 8px;border-bottom:1px solid #f5f5f5;gap:4px}
.ti:last-child{border-bottom:none}
.tn{font-weight:700;font-size:9.5px;white-space:nowrap;min-width:44px}
.td{font-size:9px;color:#555;flex:1}
.tq{color:#ccc;font-size:9px;margin-left:auto;flex-shrink:0}
.qc{border:1px dashed #ccc;border-radius:7px;padding:12px 10px;text-align:center}
.qt{font-size:8px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#444;margin-bottom:8px}
.qt span{color:#aaa;font-weight:400;text-transform:none}
.qc svg{width:118px;height:118px}
.qs{font-size:7.5px;color:#bbb;margin-top:5px}
@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
</style></head><body>
<div class="hdr">
  <div class="ttl">Dijital Vaka Özeti</div>
  <div class="dte">Oluşturma tarihi: ${new Date().toLocaleString('tr-TR')}</div>
</div>
${form.is_urgent ? '<div class="urg">&#9888;&nbsp;&nbsp;DURUM: ACİL VAKA</div>' : ''}
<div class="card">
  <div class="ch">Klinik &amp; Diş Hekimi</div>
  ${selectedClinic  ? row(icoClinic, 'Klinik', selectedClinic.name)       : ''}
  ${selectedDoctor  ? row(icoDoctor, 'Diş Hekimi', selectedDoctor.full_name) : ''}
</div>
<div class="card">
  <div class="ch">Hasta Bilgileri</div>
  ${(form.patient_first_name || form.patient_last_name) ? row(icoPerson, 'Ad Soyad', [form.patient_first_name, form.patient_last_name].filter(Boolean).join(' ')) : ''}
  ${form.patient_gender !== 'belirtilmedi' ? row(genderIco, 'Cinsiyet', form.patient_gender === 'erkek' ? 'Erkek' : 'Kadın') : ''}
  ${form.patient_dob    ? row(icoCal,    'Doğum Tarihi', form.patient_dob.toLocaleDateString('tr-TR')) : ''}
  ${form.patient_phone  ? row(icoPhone,  'Telefon', form.patient_phone) : ''}
</div>
${ops.length > 0 ? `<div class="card">
  <div class="ch">Dişler ve İşlemler</div>
  <div class="tb">
    <div>${archSVG}</div>
    <div class="tl">${teethListHtml}</div>
  </div>
</div>` : ''}
${form.notes ? `<div class="card">
  <div class="ch">Hekim Talimatları</div>
  <div style="padding:7px 10px;font-size:9.5px;color:#374151">${form.notes}</div>
</div>` : ''}
<div class="qc">
  <div class="qt">Veri Doğrulama (Digital Verification) <span>— Vaka detayları için tara</span></div>
  ${qrSvgHtml}
  <div class="qs">QR kodu okutarak vaka bilgilerine ulaşabilirsiniz</div>
</div>
</body></html>`;

    const w = (window as any).open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
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
    <SafeAreaView style={styles.safe}>
      <ActivityIndicator color={P} style={{ flex: 1 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.outerWrap, isDesktop && styles.outerWrapDesktop]}>

        {/* ── Vertical step sidebar (desktop only) ── */}
        {isDesktop && <StepSidebar currentStep={step} accentColor={P} />}

        {/* ── Main content column ── */}
        <View style={styles.mainCol}>

      {/* ── Live Summary Panel — full-width top card ── */}
      <LiveSummaryPanel
        form={form}
        selectedDoctor={selectedDoctor}
        selectedClinic={selectedClinic}
        currentStep={step}
        onOpenChat={() => setChatModalVisible(true)}
        accentColor={P}
      />

      {/* Step 1 — Clinic & Patient */}
      {step === 1 && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Clinic & Doctor */}
          <SectionCard title="Klinik & diş hekimi" iconNode={<ClinicIcon size={14} color={stepAttempted[1] && errors.doctor_id ? '#EF4444' : P} />} errorCount={stepAttempted[1] && errors.doctor_id ? 1 : 0} accentColor={P}>
            <View style={styles.twoCol}>
              <SearchableDropdown
                label="Klinik"
                placeholder="Klinik seçin veya ekleyin"
                options={clinics.filter(c => c.is_active).map(c => ({ id: c.id, label: c.name, sublabel: c.phone ?? undefined }))}
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
                options={filteredDoctors.map(d => ({ id: d.id, label: d.full_name, sublabel: d.clinic?.name ?? undefined }))}
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
          </SectionCard>

          {/* Patient info */}
          <SectionCard title="Hasta bilgileri" icon={'account-outline' as any}
            errorCount={stepAttempted[1] ? ['patient_first_name','patient_last_name','patient_gender','patient_dob','patient_id','patient_nationality'].filter(k => errors[k]).length : 0}
            accentColor={P}
          >

            {/* Satır 1: Ad + Soyad */}
            <View style={styles.twoCol}>
              <Field label="Ad" value={form.patient_first_name}
                onChangeText={set('patient_first_name')} placeholder="Ad" flex
                required error={fe('patient_first_name')} />
              <Field label="Soyad" value={form.patient_last_name}
                onChangeText={set('patient_last_name')} placeholder="Soyad" flex
                required error={fe('patient_last_name')} />
            </View>

            {/* Satır 2: TC / Pasaport + Doğum tarihi */}
            <View style={styles.twoCol}>
              <Field label="TC / Pasaport No" value={form.patient_id}
                onChangeText={set('patient_id')} placeholder="TC veya Pasaport No" flex
                required error={fe('patient_id')} />
              <DateField
                label="Doğum tarihi"
                value={form.patient_dob}
                onChange={set('patient_dob')}
                maxDate={new Date()}
                placeholder="Tarih seçin"
                flex
                required
                error={fe('patient_dob')}
              />
            </View>

            {/* Satır 3: Uyruk + Cinsiyet */}
            <View style={styles.twoCol}>
              <SearchableDropdown
                label="Uyruk"
                placeholder="Ülke ara..."
                options={GEO_COUNTRIES.map(c => ({ id: c.label, label: c.label }))}
                selectedId={form.patient_nationality}
                onSelect={set('patient_nationality')}
                required
                error={fe('patient_nationality')}
              />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 }}>
                  <Text style={{ fontSize: 13, color: fe('patient_gender') ? '#EF4444' : '#0F172A', fontWeight: '700', lineHeight: 16 }}>*</Text>
                  <Text style={[styles.fieldLabel, { marginBottom: 0 }, fe('patient_gender') ? { color: '#EF4444' } : undefined]}>Cinsiyet</Text>
                </View>
                <View style={styles.chipRow}>
                  {GENDERS.map((g) => (
                    <TouchableOpacity key={g.value} onPress={() => set('patient_gender')(g.value as any)}
                      style={[styles.chip, form.patient_gender === g.value && styles.chipActive]}>
                      <Text style={[styles.chipText, form.patient_gender === g.value && styles.chipTextActive]}>
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Satır 4: İkamet ülkesi + İkamet şehri */}
            <View style={styles.twoCol}>
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

            {/* Satır 5: İletişim + boş */}
            <View style={styles.twoCol}>
              <Field label="İletişim" value={form.patient_phone}
                onChangeText={set('patient_phone')} placeholder="05XX XXX XX XX" flex />
              <View style={{ flex: 1 }} />
            </View>

          </SectionCard>

        </ScrollView>
      )}

      {/* Step 2 — Case Details */}
      {step === 2 && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* ── Split: Vaka detayları (sol) + Mesaj kutusu (sağ) ── */}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
          <View style={{ flex: 1 }}>
          <SectionCard title="Vaka detayları" icon={'tune-variant' as any} style={{ flex: 1, marginBottom: 0 }} accentColor={P}>

            {/* Acil vaka + Tasarım onayı — yan yana */}
            <View style={s2.toggleRow}>

              {/* Acil vaka */}
              <TouchableOpacity
                style={[s2.toggleItem, form.is_urgent && s2.toggleItemUrgent]}
                onPress={() => set('is_urgent')(!form.is_urgent)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name={'alarm' as any} size={14} color={form.is_urgent ? P : '#94A3B8'} />
                <View style={{ flex: 1 }}>
                  <Text style={[s2.toggleItemLabel, form.is_urgent && s2.toggleItemLabelActive]}>Acil vaka</Text>
                  <Text style={s2.toggleItemDesc}>Öncelikli, ek ücretlidir.</Text>
                </View>
                <AppSwitch value={form.is_urgent} onValueChange={set('is_urgent')}
                  accentColor={P} style={s2.rowSwitch} />
              </TouchableOpacity>

              {/* Tasarım onayı */}
              <TouchableOpacity
                style={[s2.toggleItem, form.doctor_approval_required && s2.toggleItemApproval]}
                onPress={() => set('doctor_approval_required')(!form.doctor_approval_required)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name={'check-decagram-outline' as any} size={14}
                  color={form.doctor_approval_required ? P : '#94A3B8'} />
                <View style={{ flex: 1 }}>
                  <Text style={[s2.toggleItemLabel, form.doctor_approval_required && s2.toggleItemLabelActive]}>Tasarım onayı</Text>
                  <Text style={s2.toggleItemDesc}>Diş hekimi onayı sonrası üretilir.</Text>
                </View>
                <AppSwitch value={form.doctor_approval_required} onValueChange={set('doctor_approval_required')}
                  accentColor={P} style={s2.rowSwitch} />
              </TouchableOpacity>

            </View>

            <View style={s2.separator} />

            {/* Ölçüm Yöntemi + Model Tipi — yan yana dropdown */}
            <View style={s2.selectRow}>
              <InlineSelect
                label="* Ölçüm yöntemi"
                icon={'ruler-square' as any}
                value={form.measurement_type}
                options={[
                  { value: 'manual',  label: 'Manuel' },
                  { value: 'digital', label: 'Dijital' },
                ]}
                onSelect={(v) => set('measurement_type')(v as 'manual' | 'digital')}
                error={fe('measurement_type')}
                accentColor={P}
              />
              <InlineSelect
                label="* Model tipi"
                icon={'cube-outline' as any}
                value={form.model_type}
                options={[
                  { value: 'dijital',  label: 'Dijital Tarama' },
                  { value: 'fiziksel', label: 'Fiziksel Model' },
                  { value: 'cad',      label: 'CAD Dosyası' },
                ]}
                onSelect={(v) => set('model_type')(form.model_type === v ? '' : v)}
                error={fe('model_type')}
                accentColor={P}
              />
            </View>

            <View style={s2.separator} />

            {/* En geç teslim tarihi + Teslim yöntemi */}
            <View style={s2.selectRow}>
              <InlineDateSelect
                label="* En geç teslim tarihi"
                value={form.delivery_date}
                onChange={set('delivery_date')}
                minDate={new Date()}
                error={fe('delivery_date')}
                accentColor={P}
              />
              <InlineSelect
                label="* Teslim yöntemi"
                icon={'truck-delivery-outline' as any}
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
            </View>

          </SectionCard>
          </View>{/* sol kolon sonu */}

          {/* Sağ kolon: Mesaj kutusu */}
          <View style={{ flex: 1 }}>
            <ChatBox
              messages={form.chat_messages}
              onAdd={(msg) => set('chat_messages')([...form.chat_messages, msg])}
              onDelete={(id) => set('chat_messages')(form.chat_messages.filter(m => m.id !== id))}
              accentColor={P}
            />
          </View>
          </View>{/* split row sonu */}

          {/* ── Dosyalar ── */}
          <SectionCard title="Dosyalar" icon={'paperclip' as any} accentColor={P}>

            <View style={fus.twoCol}>

              {/* ── Sol: Yükleme butonu ── */}
              <View style={fus.twoColLeft}>
                <TouchableOpacity
                  style={fus.uploadTrigger}
                  onPress={() => setUploadModalOpen(true)}
                  activeOpacity={0.75}
                >
                  <View style={[fus.uploadTriggerIcon, { backgroundColor: P + '14' }]}>
                    <MaterialCommunityIcons name={'cloud-upload-outline' as any} size={28} color={P} />
                  </View>
                  <Text style={[fus.uploadTriggerTitle, { color: P }]}>Dosya Yükleme</Text>
                  <Text style={[fus.uploadTriggerSub, { textAlign: 'center' }]}>
                    {form.attachments.length === 0
                      ? 'Fotoğraf, STL, PLY, PDF eklemek için tıklayın'
                      : `${form.attachments.length} dosya yüklendi — düzenlemek için tıklayın`}
                  </Text>
                  {form.attachments.length > 0 && (
                    <View style={[fus.uploadTriggerBadge, { backgroundColor: P }]}>
                      <Text style={fus.uploadTriggerBadgeText}>{form.attachments.length} dosya</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Dikey ayırıcı */}
              <View style={fus.twoColDivider} />

              {/* ── Sağ: Dosya listesi ── */}
              <View style={fus.twoColRight}>
                <View style={fus.subHeader}>
                  <Text style={fus.subLabel}>YÜKLENEN DOSYALAR</Text>
                  <Text style={fus.subHint}>Tüm ekler ve ön izleme</Text>
                </View>
                {form.attachments.length === 0 ? (
                  <View style={fus.emptyState}>
                    <MaterialCommunityIcons name={'tray-outline' as any} size={28} color="#CBD5E1" />
                    <Text style={fus.emptyStateText}>Henüz dosya eklenmedi</Text>
                    <Text style={fus.emptyStateHint}>Sol taraftaki butona tıklayarak{'\n'}dosya ve fotoğraf ekleyebilirsiniz</Text>
                  </View>
                ) : (
                  <>
                    {([
                      { label: 'Gülüş Tasarımı', icon: 'image-outline', prefixes: ['Ekartörlü Resim', 'Gülüş Resmi', 'Gülüş Videosu'] },
                      { label: 'Tarama Verileri', icon: 'tooth-outline', prefixes: ['Alt Çene', 'Üst Çene', 'Bite (Kapanış)', 'Diş Eti Taraması'] },
                      { label: 'İmplant Bilgileri', icon: 'screw-machine-flat-top', prefixes: ['Scan Body STL'] },
                      { label: 'Ek Dosyalar', icon: 'paperclip', prefixes: ['PDF Belgesi', 'Referans Fotoğraf'] },
                    ] as const).map(group => {
                      const groupFiles = form.attachments.filter(a =>
                        group.prefixes.some(p => a.name.startsWith(p))
                      );
                      if (groupFiles.length === 0) return null;
                      return (
                        <View key={group.label} style={fus.fileGroup}>
                          <View style={fus.fileGroupHeader}>
                            <MaterialCommunityIcons name={group.icon as any} size={11} color="#94A3B8" />
                            <Text style={fus.fileGroupLabel}>{group.label}</Text>
                          </View>
                          {groupFiles.map(a => (
                            <FileRow key={a.id} file={a} onRemove={() => removeAttachment(a.id)} onPreview={() => setPreviewFile(a)} />
                          ))}
                        </View>
                      );
                    })}
                    {/* Files that don't match any group */}
                    {(() => {
                      const allGroupPrefixes = ['Ekartörlü Resim', 'Gülüş Resmi', 'Gülüş Videosu', 'Alt Çene', 'Üst Çene', 'Bite (Kapanış)', 'Diş Eti Taraması', 'Scan Body STL', 'PDF Belgesi', 'Referans Fotoğraf'];
                      const others = form.attachments.filter(a => !allGroupPrefixes.some(p => a.name.startsWith(p)));
                      if (others.length === 0) return null;
                      return (
                        <View style={fus.fileGroup}>
                          <View style={fus.fileGroupHeader}>
                            <MaterialCommunityIcons name={'folder-outline' as any} size={11} color="#94A3B8" />
                            <Text style={fus.fileGroupLabel}>Diğer Dosyalar</Text>
                          </View>
                          {others.map(a => (
                            <FileRow key={a.id} file={a} onRemove={() => removeAttachment(a.id)} onPreview={() => setPreviewFile(a)} />
                          ))}
                        </View>
                      );
                    })()}
                    <View style={fus.totalRow}>
                      <MaterialCommunityIcons name={'paperclip' as any} size={12} color="#64748B" />
                      <Text style={fus.totalText}>Toplam {form.attachments.length} dosya</Text>
                    </View>
                  </>
                )}
              </View>

            </View>

          </SectionCard>

          {/* ── Dosya Yükleme Modal ── */}
          <Modal
            visible={uploadModalOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setUploadModalOpen(false)}
          >
            <View style={fus.umOverlay}>
              <View style={fus.umCard}>

                {/* Header */}
                <View style={fus.umHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={[fus.umHeaderIcon, { backgroundColor: P + '18' }]}>
                      <MaterialCommunityIcons name={'cloud-upload-outline' as any} size={20} color={P} />
                    </View>
                    <Text style={fus.umHeaderTitle}>Dosya Yükleme</Text>
                  </View>
                  <TouchableOpacity onPress={() => setUploadModalOpen(false)} style={fus.umCloseBtn}>
                    <MaterialCommunityIcons name={'close' as any} size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
                  <View style={fus.umGrid}>

                  {/* ── Grup 1: Gülüş Tasarımı ── */}
                  <View style={fus.umGroup}>
                    <View style={fus.umGroupHeader}>
                      <View style={[fus.umGroupDot, { backgroundColor: P }]} />
                      <Text style={fus.umGroupTitle}>Gülüş Tasarımı</Text>
                    </View>
                    <View style={fus.uploadCardRow}>
                      {(['Ekartörlü Resim', 'Gülüş Resmi'] as const).map((label) => {
                        const existing = form.attachments.find(a => a.name.startsWith(label));
                        const card = (
                          <TouchableOpacity
                              style={fus.uploadCard}
                              onPress={() => existing ? openPreviewFromUpload(existing) : openSpecificPhotoPicker(label)}
                              activeOpacity={0.8}
                            >
                              <View style={[fus.uploadCardTab, { backgroundColor: existing ? '#22C55E' : P }]} />
                              <View style={fus.uploadCardBody}>
                                {existing ? (
                                  <View style={fus.uploadCardThumbWrap}>
                                    <Image source={{ uri: existing.uri }} style={fus.uploadCardThumbImg} resizeMode="cover" />
                                    <View style={fus.uploadCardThumbOverlay}>
                                      <MaterialCommunityIcons name={'eye-outline' as any} size={18} color="#FFFFFF" />
                                    </View>
                                  </View>
                                ) : (
                                  <View style={fus.uploadCardIcon}>
                                    <MaterialCommunityIcons
                                      name={'image-outline' as any}
                                      size={28} color={P}
                                    />
                                  </View>
                                )}
                                <Text style={fus.uploadCardLabel} numberOfLines={2}>{label}</Text>
                                {existing && <Text style={fus.uploadCardFileName} numberOfLines={1}>{existing.name}</Text>}
                              </View>
                              <View style={[fus.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : P }]}>
                                <MaterialCommunityIcons name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
                              </View>
                              {existing && (
                                <TouchableOpacity
                                  style={fus.uploadCardDel}
                                  onPress={(e) => { e.stopPropagation?.(); removeAttachment(existing.id); }}
                                  activeOpacity={0.8}
                                >
                                  <MaterialCommunityIcons name={'close' as any} size={12} color="#EF4444" />
                                </TouchableOpacity>
                              )}
                            </TouchableOpacity>
                        );
                        return existing ? (
                          <React.Fragment key={label}>{card}</React.Fragment>
                        ) : (
                          <WithTooltip key={label} text={PHOTO_GUIDE_TEXT} image={PHOTO_GUIDE_IMG}>{card}</WithTooltip>
                        );
                      })}
                      {/* Video card */}
                      {(() => {
                        const videoLabel = 'Gülüş Videosu';
                        const existing = form.attachments.find(a => a.name.startsWith(videoLabel));
                        const card = (
                          <TouchableOpacity
                            key={videoLabel}
                            style={[fus.uploadCard, !existing && fus.uploadCardDashed]}
                            onPress={() => openSpecificVideoPicker(videoLabel)}
                            activeOpacity={0.8}
                          >
                            <View style={[fus.uploadCardTab, { backgroundColor: existing ? '#22C55E' : P }]} />
                            <View style={fus.uploadCardBody}>
                              <View style={fus.uploadCardIcon}>
                                <MaterialCommunityIcons
                                  name={'video-outline' as any}
                                  size={28} color={existing ? '#22C55E' : P}
                                />
                              </View>
                              <Text style={fus.uploadCardLabel} numberOfLines={2}>{videoLabel}</Text>
                              {existing && (
                                <Text style={[fus.uploadCardFileName, { color: '#22C55E' }]} numberOfLines={1}>
                                  {existing.name.split('.').pop()?.toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <View style={[fus.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : P }]}>
                              <MaterialCommunityIcons name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
                            </View>
                            {existing && (
                              <TouchableOpacity
                                style={fus.uploadCardDel}
                                onPress={(e) => { (e as any).stopPropagation?.(); removeAttachment(existing.id); }}
                                activeOpacity={0.8}
                              >
                                <MaterialCommunityIcons name={'close' as any} size={12} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>
                        );
                        return existing ? card : <WithTooltip text={UPLOAD_TIPS[videoLabel]}>{card}</WithTooltip>;
                      })()}
                    </View>
                  </View>

                  {/* ── Grup 2: Tarama Verileri ── */}
                  <View style={fus.umGroup}>
                    <View style={fus.umGroupHeader}>
                      <View style={[fus.umGroupDot, { backgroundColor: '#0EA5E9' }]} />
                      <Text style={fus.umGroupTitle}>Tarama Verileri</Text>
                    </View>
                    <View style={fus.uploadCardRow}>
                      {(['Alt Çene', 'Üst Çene', 'Bite (Kapanış)', 'Diş Eti Taraması'] as const).map((label) => {
                        const existing = form.attachments.find(a => a.name.startsWith(label));
                        const card = (
                          <TouchableOpacity
                            key={label}
                            style={[fus.uploadCard, !existing && fus.uploadCardDashed]}
                            onPress={() => existing ? openPreviewFromUpload(existing) : openSpecificScanPicker(label)}
                            activeOpacity={0.8}
                          >
                            <View style={[fus.uploadCardTab, { backgroundColor: existing ? '#22C55E' : '#0EA5E9' }]} />
                            <View style={fus.uploadCardBody}>
                              <View style={fus.uploadCardIcon}>
                                <MaterialCommunityIcons
                                  name={'cube-outline' as any}
                                  size={28}
                                  color={existing ? '#22C55E' : '#0EA5E9'}
                                />
                              </View>
                              <Text style={[fus.uploadCardLabel, { color: existing ? '#0F172A' : '#64748B' }]} numberOfLines={2}>
                                {label}
                              </Text>
                              {existing && (
                                <Text style={[fus.uploadCardFileName, { color: '#22C55E' }]} numberOfLines={1}>
                                  {existing.name.split('.').pop()?.toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <View style={[fus.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : '#0EA5E9' }]}>
                              <MaterialCommunityIcons name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
                            </View>
                            {existing && (
                              <TouchableOpacity
                                style={fus.uploadCardDel}
                                onPress={(e) => { (e as any).stopPropagation?.(); removeAttachment(existing.id); }}
                                activeOpacity={0.8}
                              >
                                <MaterialCommunityIcons name={'close' as any} size={12} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>
                        );
                        return existing ? (
                          <React.Fragment key={label}>{card}</React.Fragment>
                        ) : (
                          <WithTooltip key={label} text={UPLOAD_TIPS[label] ?? ''} image={label === 'Bite (Kapanış)' ? BITE_GUIDE_IMG : undefined}>
                            {card}
                          </WithTooltip>
                        );
                      })}
                    </View>

                    {/* ── Kapanış Analizi (Alt + Üst + Bite yüklüyse) ── */}
                    {(() => {
                      const lower = form.attachments.find(a => a.name.startsWith('Alt Çene'));
                      const upper = form.attachments.find(a => a.name.startsWith('Üst Çene'));
                      const bite  = form.attachments.find(a => a.name.startsWith('Bite (Kapanış)'));
                      if (!lower || !upper || !bite) return null;

                      return (
                        <TouchableOpacity
                          style={fus.occlusionCta}
                          onPress={() => setOcclusionModalOpen(true)}
                          activeOpacity={0.85}
                        >
                          <View style={fus.occlusionCtaIcon}>
                            <MaterialCommunityIcons name={'cube-scan' as any} size={18} color="#FFFFFF" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={fus.occlusionCtaTitle}>
                              Kapanış Analizi
                              {occlusionResult && <Text style={fus.occlusionCtaBadge}>  ✓ tamamlandı</Text>}
                            </Text>
                            <Text style={fus.occlusionCtaSub}>
                              {occlusionResult
                                ? `Temas %${occlusionResult.statistics.contactPercentage} · ${occlusionResult.penetrationPoints.length} penetrasyon noktası`
                                : '3D ısı haritası, penetrasyon ve mesafe ölçümü'}
                            </Text>
                          </View>
                          <MaterialCommunityIcons
                            name={(occlusionResult ? 'refresh' : 'arrow-right') as any}
                            size={18}
                            color="#FFFFFF"
                          />
                        </TouchableOpacity>
                      );
                    })()}
                  </View>

                  {/* ── Grup 3: İmplant Bilgileri ── */}
                  <View style={fus.umGroup}>
                    <View style={fus.umGroupHeader}>
                      <View style={[fus.umGroupDot, { backgroundColor: '#8B5CF6' }]} />
                      <Text style={fus.umGroupTitle}>İmplant Bilgileri</Text>
                    </View>
                    <View style={fus.uploadCardRow}>
                      {/* Scan Body STL */}
                      {(() => {
                        const scanLabel = 'Scan Body STL';
                        const existing = form.attachments.find(a => a.name.startsWith(scanLabel));
                        const card = (
                          <TouchableOpacity
                            key={scanLabel}
                            style={[fus.uploadCard, !existing && fus.uploadCardDashed]}
                            onPress={() => existing ? openPreviewFromUpload(existing) : openSpecificScanPicker(scanLabel)}
                            activeOpacity={0.8}
                          >
                            <View style={[fus.uploadCardTab, { backgroundColor: existing ? '#22C55E' : '#8B5CF6' }]} />
                            <View style={fus.uploadCardBody}>
                              <View style={fus.uploadCardIcon}>
                                <MaterialCommunityIcons
                                  name={'tooth-outline' as any}
                                  size={28}
                                  color={existing ? '#22C55E' : '#8B5CF6'}
                                />
                              </View>
                              <Text style={[fus.uploadCardLabel, { color: existing ? '#0F172A' : '#64748B' }]} numberOfLines={2}>
                                Scan Body STL
                              </Text>
                              {existing && (
                                <Text style={[fus.uploadCardFileName, { color: '#22C55E' }]} numberOfLines={1}>
                                  {existing.name.split('.').pop()?.toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <View style={[fus.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : '#8B5CF6' }]}>
                              <MaterialCommunityIcons name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
                            </View>
                            {existing && (
                              <TouchableOpacity
                                style={fus.uploadCardDel}
                                onPress={(e) => { (e as any).stopPropagation?.(); removeAttachment(existing.id); }}
                                activeOpacity={0.8}
                              >
                                <MaterialCommunityIcons name={'close' as any} size={12} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>
                        );
                        return existing ? card : <WithTooltip text={UPLOAD_TIPS[scanLabel]}>{card}</WithTooltip>;
                      })()}
                      {/* İmplant Marka search dropdown card */}
                      {(() => {
                        const filtered = ALL_IMPLANT_BRANDS.filter(b =>
                          b.toLowerCase().includes(implantBrandSearch.toLowerCase())
                        );
                        return (
                          <View style={[fus.implantBrandCard, form.implant_brand ? undefined : fus.uploadCardDashed]}>
                            <View style={[fus.uploadCardTab, { backgroundColor: form.implant_brand ? '#22C55E' : '#8B5CF6', marginBottom: 12 }]} />
                            <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <MaterialCommunityIcons name={'office-building-marker-outline' as any} size={20} color={form.implant_brand ? '#22C55E' : '#8B5CF6'} />
                                <Text style={[fus.uploadCardLabel, { color: form.implant_brand ? '#0F172A' : '#64748B', flex: 1 }]}>
                                  İmplant Marka{form.implant_brand ? ': ' : ''}
                                  {form.implant_brand ? <Text style={{ color: '#8B5CF6' }}>{form.implant_brand}</Text> : null}
                                </Text>
                                {form.implant_brand && (
                                  <TouchableOpacity onPress={() => { setForm(f => ({ ...f, implant_brand: '' })); setImplantBrandSearch(''); setImplantBrandDropOpen(false); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <MaterialCommunityIcons name={'close-circle' as any} size={16} color="#CBD5E1" />
                                  </TouchableOpacity>
                                )}
                              </View>
                              {/* Search input + dropdown container */}
                              <View style={{ position: 'relative' as any }}>
                              <View
                                ref={implantInputRef}
                                style={fus.implantSearchRow}
                              >
                                <MaterialCommunityIcons name={'magnify' as any} size={16} color="#94A3B8" />
                                <TextInput
                                  style={fus.implantSearchInput}
                                  placeholder="Marka ara..."
                                  placeholderTextColor="#94A3B8"
                                  value={implantBrandSearch}
                                  onChangeText={(t) => { setImplantBrandSearch(t); measureImplantInput(); setImplantBrandDropOpen(true); }}
                                  onFocus={() => { measureImplantInput(); setImplantBrandDropOpen(true); }}
                                />
                              </View>
                              </View>{/* end search row */}
                              {implantBrandDropOpen && implantDropPos && (
                                <WebPortal>
                                  {/* Backdrop to close on outside click */}
                                  <Pressable
                                    style={{ position: 'fixed' as any, inset: 0, zIndex: 99998 }}
                                    onPress={() => { setImplantBrandDropOpen(false); setImplantBrandSearch(''); }}
                                  />
                                  <View style={[fus.implantDropList, {
                                    position: 'fixed' as any,
                                    zIndex: 99999,
                                    left: implantDropPos.left,
                                    width: implantDropPos.width,
                                    ...(implantDropPos.top !== undefined ? { top: implantDropPos.top } : { bottom: implantDropPos.bottom }),
                                  }]}>
                                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                      {filtered.length === 0 ? (
                                        <Text style={{ fontSize: 12, color: '#94A3B8', padding: 10, textAlign: 'center' }}>Sonuç bulunamadı</Text>
                                      ) : filtered.map((brand) => (
                                        <TouchableOpacity
                                          key={brand}
                                          style={[fus.implantDropItem, form.implant_brand === brand && fus.implantDropItemActive]}
                                          onPress={() => { setForm(f => ({ ...f, implant_brand: brand })); setImplantBrandSearch(''); setImplantBrandDropOpen(false); }}
                                          activeOpacity={0.75}
                                        >
                                          <Text style={[fus.implantDropItemText, form.implant_brand === brand && fus.implantDropItemTextActive]} numberOfLines={1}>
                                            {brand}
                                          </Text>
                                          {form.implant_brand === brand && (
                                            <MaterialCommunityIcons name={'check' as any} size={14} color="#8B5CF6" />
                                          )}
                                        </TouchableOpacity>
                                      ))}
                                    </ScrollView>
                                  </View>
                                </WebPortal>
                              )}
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  {/* ── Grup 4: Ek Dosyalar ── */}
                  <View style={fus.umGroup}>
                    <View style={fus.umGroupHeader}>
                      <View style={[fus.umGroupDot, { backgroundColor: '#F59E0B' }]} />
                      <Text style={fus.umGroupTitle}>Ek Dosyalar</Text>
                    </View>
                    <View style={fus.uploadCardRow}>
                      {/* PDF */}
                      {(() => {
                        const pdfLabel = 'PDF Belgesi';
                        const existing = form.attachments.find(a => a.name.startsWith(pdfLabel));
                        const card = (
                          <TouchableOpacity
                            key={pdfLabel}
                            style={[fus.uploadCard, !existing && fus.uploadCardDashed]}
                            onPress={() => {
                              if (existing) { openPreviewFromUpload(existing); return; }
                              if (Platform.OS !== 'web') return;
                              // @ts-ignore
                              const input = document.createElement('input');
                              input.type = 'file'; input.accept = '.pdf,application/pdf';
                              input.onchange = (e: any) => {
                                const file = e.target.files?.[0]; if (!file) return;
                                const newFile: AttachedFile = {
                                  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                                  name: `${pdfLabel}.pdf`,
                                  // @ts-ignore
                                  uri: URL.createObjectURL(file),
                                  kind: 'pdf', size: file.size, scope: 'case',
                                };
                                setForm(f => ({ ...f, attachments: [...f.attachments.filter(a => !a.name.startsWith(pdfLabel)), newFile] }));
                              };
                              // @ts-ignore
                              document.body.appendChild(input); input.click();
                              // @ts-ignore
                              setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
                            }}
                            activeOpacity={0.8}
                          >
                            <View style={[fus.uploadCardTab, { backgroundColor: existing ? '#22C55E' : '#F59E0B' }]} />
                            <View style={fus.uploadCardBody}>
                              <View style={fus.uploadCardIcon}>
                                <MaterialCommunityIcons name={'file-pdf-box' as any} size={28} color={existing ? '#22C55E' : '#F59E0B'} />
                              </View>
                              <Text style={[fus.uploadCardLabel, { color: existing ? '#0F172A' : '#64748B' }]} numberOfLines={2}>
                                PDF (Reçete vb.)
                              </Text>
                            </View>
                            <View style={[fus.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : '#F59E0B' }]}>
                              <MaterialCommunityIcons name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
                            </View>
                            {existing && (
                              <TouchableOpacity
                                style={fus.uploadCardDel}
                                onPress={(e) => { (e as any).stopPropagation?.(); removeAttachment(existing.id); }}
                                activeOpacity={0.8}
                              >
                                <MaterialCommunityIcons name={'close' as any} size={12} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>
                        );
                        return existing ? card : <WithTooltip text={UPLOAD_TIPS[pdfLabel]}>{card}</WithTooltip>;
                      })()}
                      {/* Referans Fotoğraf */}
                      {(() => {
                        const photoLabel = 'Referans Fotoğraf';
                        const existing = form.attachments.find(a => a.name.startsWith(photoLabel));
                        const card = (
                          <TouchableOpacity
                            key={photoLabel}
                            style={[fus.uploadCard, !existing && fus.uploadCardDashed]}
                            onPress={() => existing ? openPreviewFromUpload(existing) : openSpecificPhotoPicker(photoLabel)}
                            activeOpacity={0.8}
                          >
                            <View style={[fus.uploadCardTab, { backgroundColor: existing ? '#22C55E' : '#F59E0B' }]} />
                            <View style={fus.uploadCardBody}>
                              {existing ? (
                                <View style={fus.uploadCardThumbWrap}>
                                  <Image source={{ uri: existing.uri }} style={fus.uploadCardThumbImg} resizeMode="cover" />
                                  <View style={fus.uploadCardThumbOverlay}>
                                    <MaterialCommunityIcons name={'eye-outline' as any} size={18} color="#FFFFFF" />
                                  </View>
                                </View>
                              ) : (
                                <View style={fus.uploadCardIcon}>
                                  <MaterialCommunityIcons name={'image-outline' as any} size={28} color={'#F59E0B'} />
                                </View>
                              )}
                              <Text style={[fus.uploadCardLabel, { color: existing ? '#0F172A' : '#64748B' }]} numberOfLines={2}>
                                Referans Fotoğraf
                              </Text>
                            </View>
                            <View style={[fus.uploadCardBtn, { backgroundColor: existing ? '#22C55E' : '#F59E0B' }]}>
                              <MaterialCommunityIcons name={existing ? 'check' : 'arrow-up'} size={16} color="#FFFFFF" />
                            </View>
                            {existing && (
                              <TouchableOpacity
                                style={fus.uploadCardDel}
                                onPress={(e) => { (e as any).stopPropagation?.(); removeAttachment(existing.id); }}
                                activeOpacity={0.8}
                              >
                                <MaterialCommunityIcons name={'close' as any} size={12} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </TouchableOpacity>
                        );
                        return existing ? card : <WithTooltip text={UPLOAD_TIPS[photoLabel]}>{card}</WithTooltip>;
                      })()}
                    </View>
                  </View>

                  </View>{/* end umGrid */}

                </ScrollView>

                {/* Footer — Tamam butonu */}
                <View style={fus.umFooter}>
                  <TouchableOpacity
                    style={[fus.umOkBtn, { backgroundColor: P }]}
                    onPress={() => setUploadModalOpen(false)}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name={'check' as any} size={18} color="#FFFFFF" />
                    <Text style={fus.umOkBtnText}>Tamam</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </View>
          </Modal>

          {/* ── Kapanış Analizi Modal ── */}
          <OcclusionAnalysisModal
            visible={occlusionModalOpen}
            upperUri={form.attachments.find(a => a.name.startsWith('Üst Çene'))?.uri ?? null}
            upperName={form.attachments.find(a => a.name.startsWith('Üst Çene'))?.name}
            lowerUri={form.attachments.find(a => a.name.startsWith('Alt Çene'))?.uri ?? null}
            lowerName={form.attachments.find(a => a.name.startsWith('Alt Çene'))?.name}
            biteUri={form.attachments.find(a => a.name.startsWith('Bite (Kapanış)'))?.uri ?? null}
            onResult={(res) => setOcclusionResult(res)}
            onClose={(snap) => {
              if (snap) setOcclusionScreenshot(snap);
              setOcclusionModalOpen(false);
            }}
          />

        </ScrollView>
      )}

      {/* Step 3 — Teeth & Dentures */}
      {step === 3 && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Split row: Diş Seçimi | Operasyon Detayı */}
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>

            {/* Left — Diş Seçimi */}
            <View style={{ flex: 1 }}>
              <SectionCard
                title="Diş Seçimi"
                icon={'tooth-outline' as any}
                errorCount={stepAttempted[3] && errors.tooth_ops ? 1 : 0}
                accentColor={P}
                headerRight={
                  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                    {([
                      { label: 'Üst çene', teeth: [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28] },
                      { label: 'Alt çene', teeth: [31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48] },
                      { label: 'Full ağız', teeth: [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48] },
                    ] as { label: string; teeth: number[] }[]).map(({ label, teeth }) => (
                      <TouchableOpacity
                        key={label}
                        onPress={() => {
                          setForm(f => {
                            const existing = f.tooth_ops.map(o => o.tooth);
                            const toAdd = teeth.filter(t => !existing.includes(t));
                            const newOps = [...f.tooth_ops, ...toAdd.map(t => ({ tooth: t, ...BLANK_OP }))];
                            return { ...f, tooth_ops: newOps };
                          });
                          setSelectedTeeth([teeth[0]]);
                          setActiveTooth(teeth[0]);
                        }}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F1F5F9' }}
                      >
                        <Text style={{ fontSize: 10, fontFamily: F.medium, color: P }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                    {form.tooth_ops.length > 0 && (
                      <TouchableOpacity
                        onPress={() => { setForm(f => ({ ...f, tooth_ops: [] })); setSelectedTeeth([]); setActiveTooth(null); setConfirmedTeeth([]); }}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF5F5' }}
                      >
                        <Text style={{ fontSize: 10, fontFamily: F.medium, color: '#EF4444' }}>Temizle</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
              >
                <ToothNumberPicker
                  selected={form.tooth_ops.map(o => o.tooth)}
                  colorMap={toothColorMap}
                  accentColor={P}
                  onChange={(newTeeth) => {
                    const prevTeeth = form.tooth_ops.map(o => o.tooth);
                    const added   = newTeeth.filter(t => !prevTeeth.includes(t));
                    const removed = prevTeeth.filter(t => !newTeeth.includes(t));
                    setForm(f => {
                      let ops = f.tooth_ops.filter(o => !removed.includes(o.tooth));
                      added.forEach(t => { ops = [...ops, { tooth: t, ...BLANK_OP }]; });
                      return { ...f, tooth_ops: ops };
                    });
                    // Remove deselected teeth from confirmed list
                    if (removed.length > 0) setConfirmedTeeth(prev => prev.filter(t => !removed.includes(t)));
                    // Yeni diş seçilince gruba ekle (toplu düzenleme için birikimli seçim)
                    const nextSelected = selectedTeeth.filter(t => !removed.includes(t));
                    if (added.length > 0) {
                      setSelectedTeeth([...nextSelected, ...added]);
                      setActiveTooth(added[added.length - 1]);
                    } else {
                      setSelectedTeeth(nextSelected);
                      if (activeTooth !== null && removed.includes(activeTooth)) {
                        setActiveTooth(nextSelected.length > 0 ? nextSelected[nextSelected.length - 1] : null);
                      }
                    }
                  }}
                  containerWidth={(width - (isDesktop ? 100 : 0)) / 2 - 64}
                />

                <FieldError msg={fe('tooth_ops')} />
              </SectionCard>
            </View>

            {/* Right — Operasyon Detayı */}
            <View style={{ flex: 1 }}>
              {(() => {
                const validTooth = activeTooth !== null && selectedTeeth.includes(activeTooth) ? activeTooth : null;
                const op = form.tooth_ops.find(o => o.tooth === validTooth) ?? { tooth: 0, ...BLANK_OP };
                const groupLabel = selectedTeeth.length > 1
                  ? `Dişler ${[...selectedTeeth].sort((a, b) => a - b).join(', ')} — Toplu Atama`
                  : validTooth ? `Diş ${validTooth} — Operasyon` : 'Operasyon Detayı';
                const isAlreadyConfirmed = selectedTeeth.length > 0 && selectedTeeth.every(t => confirmedTeeth.includes(t));
                const hasLastOp = lastConfirmedOpRef.current.work_type !== '';

                return (
                  <SectionCard title={groupLabel} icon={'cog-outline' as any} accentColor={P}>
                    {!validTooth ? (
                      <View style={{ paddingVertical: 16, alignItems: 'center', opacity: 0.45 }}>
                        <Svg width={28} height={28} viewBox="0 0 48 48" fill="none">
                          <SvgPath
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M22.2544 12.6476C22.9806 13.2696 24.0452 13.2905 24.7952 12.6981L24.7976 12.6962L24.8031 12.692C24.8124 12.6848 24.8293 12.6719 24.8535 12.6537C24.9019 12.6172 24.9794 12.5601 25.0831 12.4869C25.291 12.3402 25.6017 12.1308 25.9936 11.8956C26.7857 11.42 27.8673 10.8638 29.0724 10.4904C31.4653 9.74886 34.0017 9.78507 36.0662 12.1789C37.3116 13.6229 37.8315 15.0193 37.9642 16.3899C38.0606 17.3856 37.9581 18.4265 37.7077 19.5311C36.3868 18.5682 34.7598 18 33 18C28.5817 18 25 21.5817 25 26C25 30.3582 28.485 33.9025 32.8203 33.998C32.4952 34.9239 32.201 35.57 31.8929 36.0853C31.5294 36.6934 31.1093 37.1824 30.4615 37.7681C30.1349 37.4586 29.7219 36.9638 29.1767 36.2629C29.0908 36.1525 29.0018 36.0371 28.9099 35.9182L28.9098 35.918L28.9098 35.918C28.3478 35.1901 27.6819 34.3276 27.003 33.6389C26.2861 32.9118 25.0796 31.8649 23.5038 31.8697C21.9352 31.8745 20.7255 32.9047 19.9937 33.6369C19.3048 34.3262 18.6294 35.1885 18.0593 35.9164C17.9666 36.0348 17.8766 36.1497 17.7899 36.2597C17.2333 36.965 16.8126 37.4619 16.48 37.7712C14.8687 36.1971 13.9804 33.9629 12.9592 29.8058C12.7283 28.8661 12.3756 27.7341 12.0112 26.5651L12.0112 26.565C11.9067 26.2298 11.8013 25.8915 11.6976 25.5539C11.2167 23.9892 10.7392 22.3418 10.4119 20.7151C9.72465 17.2994 9.85439 14.6849 11.1291 13.1373C12.8241 11.0794 14.5088 10.1432 16.1308 10.0157C17.7598 9.88754 19.7916 10.5379 22.2544 12.6476ZM35.0116 33.745C33.9903 36.9793 33.1461 38.1311 31.2874 39.701C30.0886 40.7135 28.7366 38.9646 27.3138 37.1239C26.0812 35.5293 24.7954 33.8658 23.5098 33.8697C22.203 33.8737 20.8965 35.5398 19.6465 37.1338C18.2048 38.9724 16.8383 40.715 15.6331 39.701C13.1996 37.6532 12.1324 34.8237 11.0169 30.2829C10.8022 29.4087 10.4755 28.3602 10.1153 27.2039C8.60445 22.3544 6.50278 15.6083 9.58534 11.8657C13.4029 7.23082 18.1474 6.49593 23.5556 11.1286C23.5556 11.1286 32.0135 4.41755 37.5808 10.8727C40.4801 14.2345 40.3596 17.7171 39.3536 21.138C40.3863 22.4856 41 24.1711 41 26C41 29.7235 38.4562 32.8529 35.0116 33.745ZM39 26C39 29.3137 36.3137 32 33 32C29.6863 32 27 29.3137 27 26C27 22.6863 29.6863 20 33 20C36.3137 20 39 22.6863 39 26ZM33 22C32.4477 22 32 22.4477 32 23V25H30C29.4477 25 29 25.4477 29 26C29 26.5523 29.4477 27 30 27H32V29C32 29.5523 32.4477 30 33 30C33.5523 30 34 29.5523 34 29V27H36C36.5523 27 37 26.5523 37 26C37 25.4477 36.5523 25 36 25H34V23C34 22.4477 33.5523 22 33 22Z"
                            fill="#94A3B8"
                          />
                        </Svg>
                        <Text style={{ marginTop: 6, color: '#64748B', fontSize: 12, fontFamily: F.medium, textAlign: 'center' }}>
                          Önce bir diş seçin
                        </Text>
                      </View>
                    ) : (
                      <>
                        <WorkTypeSelector
                          key={opResetKey}
                          op={op}
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
                                  : { tooth: t, ...BLANK_OP, work_type: 'Gece Plağı' }
                              );
                              return { ...f, tooth_ops: [...kept, ...updated] };
                            });
                            setSelectedTeeth(teeth);
                            setActiveTooth(teeth[0]);
                          }}
                        />

                        {/* ── Aksiyon butonları ── */}
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                          {/* Önceki dişi kopyala */}
                          {hasLastOp && !isAlreadyConfirmed && (
                            <TouchableOpacity
                              onPress={() => updateToothOp({ ...lastConfirmedOpRef.current })}
                              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC' }}
                            >
                              <MaterialCommunityIcons name={'content-copy' as any} size={14} color="#64748B" />
                              <Text style={{ fontSize: 12, fontFamily: F.medium, color: '#64748B' }}>Önceki dişi kopyala</Text>
                            </TouchableOpacity>
                          )}

                          {/* Listeye ekle */}
                          <TouchableOpacity
                            onPress={() => {
                              if (!op.work_type) return;
                              const { tooth: _t, ...rest } = op as ToothOp;
                              lastConfirmedOpRef.current = rest;
                              selectedTeeth.forEach(t => {
                                setConfirmedTeeth(prev => prev.includes(t) ? prev : [...prev, t]);
                              });
                              // Formu temizle — bir sonraki diş seçimi için
                              setSelectedTeeth([]);
                              setActiveTooth(null);
                              setOpResetKey(k => k + 1);
                            }}
                            disabled={!op.work_type}
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: op.work_type ? P : '#F1F5F9' }}
                          >
                            <MaterialCommunityIcons name={isAlreadyConfirmed ? 'check-circle' : 'plus-circle-outline' as any} size={14} color={op.work_type ? '#fff' : '#94A3B8'} />
                            <Text style={{ fontSize: 12, fontFamily: F.semibold, color: op.work_type ? '#fff' : '#94A3B8' }}>
                              {isAlreadyConfirmed ? 'Güncelle' : selectedTeeth.length > 1 ? `${selectedTeeth.length} diş ekle` : 'Listeye ekle'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </SectionCard>
                );
              })()}


            {/* İş listesi — operasyon kartının altında */}
            {(() => {
              const confirmed = [...form.tooth_ops].filter(o => confirmedTeeth.includes(o.tooth)).sort((a, b) => a.tooth - b.tooth);
              return (
                <SectionCard
                  title={`İş listesi${confirmed.length > 0 ? ` (${confirmed.length} diş)` : ''}`}
                  icon={'format-list-bulleted-square' as any}
                  style={{ overflow: 'visible' } as any}
                  accentColor={P}
                >
                  {confirmed.length === 0 ? (
                    <View style={{ paddingVertical: 28, alignItems: 'center', gap: 6, opacity: 0.5 }}>
                      <MaterialCommunityIcons name={'clipboard-list-outline' as any} size={28} color="#94A3B8" />
                      <Text style={{ color: '#94A3B8', fontSize: 12, fontFamily: F.medium, textAlign: 'center' }}>
                        Diş seçin, işlemleri doldurun ve "Listeye ekle" butonuna basın
                      </Text>
                    </View>
                  ) : (
                    <View>
                      {confirmed.map(op => (
                        <ToothOpRow key={op.tooth} op={op} onChange={(patch) => updateOneTooth(op.tooth, patch)} materialPrices={materialPrices} accentColor={P} />
                      ))}
                    </View>
                  )}
                </SectionCard>
              );
            })()}

            </View>{/* end right column */}

          </View>{/* end split row */}

        </ScrollView>
      )}

      {/* Step 4 — Summary */}
      {step === 4 && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 80 }}>
          <View style={styles.summaryCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
              <Text style={[styles.summaryTitle, { paddingHorizontal: 0, paddingVertical: 0, borderBottomWidth: 0 }]}>Vaka Özeti</Text>
              {Platform.OS === 'web' && (
                <TouchableOpacity onPress={printSummary} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 12, paddingVertical: 6,
                  backgroundColor: '#F1F5F9', borderRadius: 20,
                  borderWidth: 1, borderColor: '#CBD5E1',
                }}>
                  <MaterialCommunityIcons name={'printer-outline' as any} size={14} color={P} />
                  <Text style={{ fontSize: 12, color: P, fontFamily: F.medium }}>Çıktı Al</Text>
                </TouchableOpacity>
              )}
            </View>

            {form.is_urgent && (
              <View style={styles.urgentBanner}>
                <Text style={styles.urgentBannerText}>🔴 ACİL VAKA</Text>
              </View>
            )}

            <SummaryGroup title="Klinik & diş hekimi">
              {selectedClinic && <SummaryRow label="Klinik" value={selectedClinic.name} />}
              {selectedDoctor && <SummaryRow label="Diş hekimi" value={selectedDoctor.full_name} />}
            </SummaryGroup>

            <SummaryGroup title="Hasta">
              {(form.patient_first_name || form.patient_last_name) && <SummaryRow label="Ad Soyad" value={[form.patient_first_name, form.patient_last_name].filter(Boolean).join(' ')} />}
              {form.patient_id && <SummaryRow label="TC Kimlik" value={form.patient_id} />}
              {form.patient_gender !== 'belirtilmedi' && <SummaryRow label="Cinsiyet" value={form.patient_gender === 'erkek' ? '♂ Erkek' : '♀ Kadın'} />}
              {form.patient_dob && <SummaryRow label="Doğum tarihi" value={form.patient_dob.toLocaleDateString('tr-TR')} />}
              {form.patient_phone && <SummaryRow label="İletişim" value={form.patient_phone} />}
            </SummaryGroup>

            <SummaryGroup title="Vaka">
              {form.model_type && <SummaryRow label="Model tipi" value={MODEL_TYPES.find((m) => m.value === form.model_type)?.label ?? form.model_type} />}
              <SummaryRow label="Makine" value={form.machine_type === 'milling' ? '⚙️ Frezeleme' : '🖨️ 3D Baskı'} />
            </SummaryGroup>

            {form.tooth_ops.length > 0 && (
              <SummaryGroup title={`Dişler & Operasyonlar (${form.tooth_ops.length} diş)`}>
                {groupToothOps(form.tooth_ops).map(group => {
                  const jLabel = getJawLabel(group.ops.map(o => o.tooth));
                  const repOp  = group.ops[0];
                  const detail = [repOp.work_type, repOp.shade, repOp.implant_system, repOp.abutment, repOp.screw, repOp.material].filter(Boolean).join(' · ') || 'Operasyon belirtilmedi';
                  if (jLabel) {
                    return <SummaryRow key={group.key} label={jLabel} value={detail} />;
                  }
                  return group.ops.sort((a, b) => a.tooth - b.tooth).map(op => (
                    <SummaryRow
                      key={op.tooth}
                      label={`Diş ${op.tooth}`}
                      value={[op.work_type, op.shade, op.implant_system, op.abutment, op.screw, op.material].filter(Boolean).join(' · ') || 'Operasyon belirtilmedi'}
                    />
                  ));
                })}
              </SummaryGroup>
            )}

            {form.pending_items.length > 0 && (
              <SummaryGroup title={`Protez Listesi (${form.pending_items.length} kalem)`}>
                {form.pending_items.map((item, i) => (
                  <SummaryRow key={i} label={item.name}
                    value={`${(item.price * item.quantity).toFixed(2)} TRY${item.quantity > 1 ? ` (x${item.quantity})` : ''}`} />
                ))}
                <View style={styles.summaryTotal}>
                  <Text style={styles.summaryTotalLabel}>Toplam Tutar</Text>
                  <Text style={styles.summaryTotalValue}>{itemTotal.toFixed(2)} TRY</Text>
                </View>
              </SummaryGroup>
            )}

            {form.notes ? (
              <SummaryGroup title="Diş hekimi talimatları">
                <Text style={styles.noteText}>{form.notes}</Text>
              </SummaryGroup>
            ) : null}
            {form.lab_notes ? (
              <SummaryGroup title="🔒 Lab iç notu">
                <Text style={[styles.noteText, { color: '#92400E' }]}>{form.lab_notes}</Text>
              </SummaryGroup>
            ) : null}

            {form.attachments.length > 0 && (
              <SummaryGroup title={`Dosyalar (${form.attachments.length})`}>
                {form.attachments.filter(a => a.scope === 'case').map(a => (
                  <SummaryRow key={a.id} label={kindLabel(a.kind)} value={a.name} />
                ))}
                {form.attachments.filter(a => a.scope === 'tooth').map(a => (
                  <SummaryRow key={a.id} label={`Diş ${a.tooth} · ${kindLabel(a.kind)}`} value={a.name} />
                ))}
              </SummaryGroup>
            )}

            {/* QR Kodu */}
            <View style={{ alignItems: 'center', paddingVertical: 24,
              borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 8 }}>
              <View nativeID="dental-qr-container">
                <QRCode value={qrValue} size={130} color="#0F172A" backgroundColor="#FFFFFF" />
              </View>
              <Text style={{ marginTop: 10, fontSize: 11, color: '#94A3B8', fontFamily: F.regular, textAlign: 'center' }}>
                QR kodu ile vaka bilgileri
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* API / submit error */}
      {submitError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {submitError}</Text>
        </View>
      ) : null}

      {/* Navigation — floating, transparent — her iki buton sağda yan yana */}
      <View style={{
        position: 'absolute', bottom: 16, right: 16,
        flexDirection: 'row', gap: 8,
        pointerEvents: 'box-none',
      }}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => goToStep((step - 1) as Step)}>
            <Text style={styles.backBtnText}>← Geri</Text>
          </TouchableOpacity>
        )}
        {step < 4 ? (
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>İleri →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, styles.submitBtn, (!isFormValid || loading) && { opacity: 0.45 }]}
            onPress={handleSubmit}
            disabled={!isFormValid || loading}
          >
            <Text style={styles.nextBtnText}>{loading ? 'Kaydediliyor...' : '✓ İş Emrini Kaydet'}</Text>
          </TouchableOpacity>
        )}
      </View>

        </View>{/* mainCol */}

      </View>{/* outerWrap */}

{/* Clinic add modal */}
      <ClinicAddModal
        visible={clinicModal.visible}
        prefillName={clinicModal.prefill}
        saving={clinicSaving}
        onClose={() => setClinicModal({ visible: false, prefill: '' })}
        onSave={async (data) => {
          setClinicSaving(true);
          const { data: created } = await createClinic(data);
          setClinicSaving(false);
          if (created) {
            setClinics(prev => [...prev, created as any]);
            set('clinic_id')((created as any).id);
            set('doctor_id')('');
          }
          setClinicModal({ visible: false, prefill: '' });
        }}
        accentColor={P}
      />

      <DoctorAddModal
        visible={doctorModal.visible}
        prefillName={doctorModal.prefill}
        clinicId={form.clinic_id || null}
        clinics={clinics}
        saving={doctorSaving}
        onClose={() => setDoctorModal({ visible: false, prefill: '' })}
        onSave={async (data) => {
          setDoctorSaving(true);
          const { data: created } = await createDoctor(data);
          setDoctorSaving(false);
          if (created) {
            setAllDoctors(prev => [...prev, created as any]);
            set('doctor_id')((created as any).id);
          }
          setDoctorModal({ visible: false, prefill: '' });
        }}
        onClinicAdded={(clinic) => {
          setClinics(prev => [...prev, clinic]);
        }}
        accentColor={P}
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
                  <MaterialCommunityIcons
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
                <MaterialCommunityIcons name={'close' as any} size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {previewFile?.kind === 'photo' ? (
              <Image
                source={{ uri: previewFile.uri }}
                style={fpv.image}
                resizeMode="contain"
              />
            ) : (previewFile?.kind === 'stl' || previewFile?.kind === 'ply') ? (
              <View style={fpv.viewerWrap}>
                {/* key forces a full remount (new Three.js scene) for each unique file */}
                <ModelViewer
                  key={previewFile.id}
                  initialModels={[{
                    id: previewFile.id,
                    label: previewFile.name,
                    color: previewFile.kind === 'ply' ? '#b0d4e8' : '#e8d5c4',
                    url: previewFile.uri,
                    format: previewFile.kind as 'stl' | 'ply',
                  }]}
                />
              </View>
            ) : previewFile?.kind === 'pdf' ? (
              <View style={fpv.fileInfo}>
                <View style={fpv.fileIconBig}>
                  <MaterialCommunityIcons name={'file-pdf-box' as any} size={52} color="#EF4444" />
                </View>
                <Text style={fpv.fileInfoTitle}>PDF Belgesi</Text>
                <View style={fpv.fileInfoMeta}>
                  <View style={fpv.fileMetaRow}>
                    <MaterialCommunityIcons name={'file-outline' as any} size={13} color="#94A3B8" />
                    <Text style={fpv.fileMetaText}>{previewFile.name}</Text>
                  </View>
                  {previewFile.size > 0 && (
                    <View style={fpv.fileMetaRow}>
                      <MaterialCommunityIcons name={'database-outline' as any} size={13} color="#94A3B8" />
                      <Text style={fpv.fileMetaText}>{formatBytes(previewFile.size)}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[fpv.openBtn, { borderColor: '#EF4444' }]}
                  onPress={() => {
                    if (typeof window !== 'undefined' && previewFile.uri) {
                      window.open(previewFile.uri, '_blank');
                    }
                  }}
                >
                  <MaterialCommunityIcons name={'open-in-new' as any} size={14} color="#EF4444" />
                  <Text style={[fpv.openBtnText, { color: '#EF4444' }]}>PDF'yi aç</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={fpv.fileInfo}>
                <View style={fpv.fileIconBig}>
                  <MaterialCommunityIcons name={'file-outline' as any} size={52} color="#64748B" />
                </View>
                <Text style={fpv.fileInfoTitle}>{previewFile?.name ?? 'Dosya'}</Text>
                {(previewFile?.size ?? 0) > 0 && (
                  <Text style={fpv.fileMetaText}>{formatBytes(previewFile!.size)}</Text>
                )}
                <TouchableOpacity
                  style={fpv.openBtn}
                  onPress={() => {
                    if (typeof window !== 'undefined' && previewFile?.uri) {
                      window.open(previewFile.uri, '_blank');
                    }
                  }}
                >
                  <MaterialCommunityIcons name={'open-in-new' as any} size={14} color="#64748B" />
                  <Text style={[fpv.openBtnText, { color: '#64748B' }]}>Yeni sekmede aç</Text>
                </TouchableOpacity>
              </View>
            )}

          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Chat popup modal ── */}
      <Modal
        visible={chatModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChatModalVisible(false)}
      >
        <Pressable style={chatModal.overlay} onPress={() => setChatModalVisible(false)}>
          <Pressable style={chatModal.sheet} onPress={(e: any) => e.stopPropagation()}>
            <View style={chatModal.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialCommunityIcons name={'forum' as any} size={18} color={P} />
                <View>
                  <Text style={chatModal.headerTitle}>Mesaj kutusu</Text>
                  <Text style={chatModal.headerSub}>Bu vakaya özel notlar, sesli mesajlar ve dosyalar</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setChatModalVisible(false)} style={chatModal.closeBtn}>
                <MaterialCommunityIcons name={'close' as any} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ChatBox
              messages={form.chat_messages}
              onAdd={(msg) => set('chat_messages')([...form.chat_messages, msg])}
              onDelete={(id) => set('chat_messages')(form.chat_messages.filter(m => m.id !== id))}
              hideHeader
              accentColor={P}
            />
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
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
  if (n.startsWith('Ekartörlü Resim')) return 'Ekartörlü Resim';
  if (n.startsWith('Gülüş Resmi'))     return 'Gülüş Resmi';
  if (n.startsWith('Gülüş Videosu'))   return 'Gülüş Videosu';
  if (n.startsWith('Alt Çene'))        return 'Alt Çene Taraması';
  if (n.startsWith('Üst Çene'))        return 'Üst Çene Taraması';
  if (n.startsWith('Bite (Kapanış)'))  return 'Bite (Kapanış) Taraması';
  if (n.startsWith('Diş Eti Taraması')) return 'Diş Eti Taraması';
  if (n.startsWith('Scan Body STL'))   return 'Scan Body STL';
  if (n.startsWith('PDF Belgesi'))     return 'PDF Belgesi';
  if (n.startsWith('Referans Fotoğraf')) return 'Referans Fotoğraf';
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
    case 'stl':   return '#0EA5E9';
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
          <MaterialCommunityIcons name={kindIcon(file.kind) as any} size={16} color={color} />
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
          <MaterialCommunityIcons name={'eye-outline' as any} size={16} color="#64748B" />
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={onRemove} style={_fusStatic.fileRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialCommunityIcons name={'close' as any} size={14} color="#94A3B8" />
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
    flex: 1, paddingRight: 16,
  },
  twoColDivider: {
    width: 1, backgroundColor: '#F1F5F9', alignSelf: 'stretch',
  },
  twoColRight: {
    flex: 1, paddingLeft: 16,
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

  /* ── Upload Modal ── */
  umOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  umCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    width: '100%', maxWidth: 1000, maxHeight: '95%' as any,
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  umHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  umHeaderIcon: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  umHeaderTitle: { fontSize: 16, fontFamily: F.bold, color: '#0F172A' },
  umCloseBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center',
  },
  umSectionLabel: {
    fontSize: 10, fontFamily: F.semibold, color: '#94A3B8',
    letterSpacing: 0.8, marginBottom: 10,
  },
  umFileBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 12, borderWidth: 1.5,
    borderStyle: 'dashed' as any, borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  umFileBtnText: { fontSize: 13, fontFamily: F.semibold, flex: 1 },
  umFileBtnHint: { fontSize: 11, fontFamily: F.regular, color: '#94A3B8' },
  umFooter: {
    padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9',
    alignItems: 'flex-end',
  },
  umOkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 28,
    borderRadius: 12,
  },
  umOkBtnText: { fontSize: 14, fontFamily: F.semibold, color: '#FFFFFF' },

  /* 2×2 grid layout */
  umGrid: {
    flexDirection: 'row' as any, flexWrap: 'wrap' as any, gap: 14,
  },
  umCol: { flex: 1, minWidth: 0 }, // unused but kept for TS

  /* Grup — each takes ~half width so 2 per row */
  umGroup: {
    flexBasis: 'calc(50% - 7px)' as any,
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    padding: 14,
  },
  umGroupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  umGroupDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  umGroupTitle: {
    fontSize: 13, fontFamily: F.bold, color: '#0F172A',
  },

  /* ── Kapanış Analizi CTA (3 scan yüklüyse görünür) ── */
  occlusionCta: {
    flexDirection: 'row' as any, alignItems: 'center' as any,
    gap: 12, marginTop: 10, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: '#2563EB',
    shadowColor: '#2563EB', shadowOpacity: 0.18,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  occlusionCtaIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center' as any, justifyContent: 'center' as any,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  occlusionCtaTitle: {
    fontSize: 13, fontFamily: F.bold, color: '#FFFFFF',
  },
  occlusionCtaBadge: {
    fontSize: 11, fontFamily: F.semibold, color: '#BBF7D0',
  },
  occlusionCtaSub: {
    fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2,
  },

  /* ── Kare yükleme kartları ── */
  uploadCardRow: {
    flexDirection: 'row' as any, flexWrap: 'wrap' as any, gap: 8,
  },
  uploadCard: {
    width: 100, height: 118, borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0',
    overflow: 'hidden' as any,
    position: 'relative' as any,
  },
  uploadCardDashed: {
    borderStyle: 'dashed' as any,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  uploadCardTab: {
    height: 10, width: '55%', alignSelf: 'center' as any,
    borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
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
    fontSize: 11, fontFamily: F.semibold, color: '#0F172A', textAlign: 'center' as any,
  },
  uploadCardFileName: {
    fontSize: 10, fontFamily: F.regular, color: '#059669',
    marginTop: 3, width: '100%',
  },
  uploadCardBtn: {
    position: 'absolute' as any, bottom: 8, right: 8,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },
  uploadCardDel: {
    position: 'absolute' as any, top: 18, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center' as any, justifyContent: 'center' as any,
  },

  /* İmplant brand search dropdown card */
  implantBrandCard: {
    flex: 1,
    borderRadius: 14, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#E2E8F0',
    overflow: 'visible' as any,
  },
  implantSearchRow: {
    flexDirection: 'row' as any, alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 10, paddingVertical: 8,
  },
  implantSearchInput: {
    flex: 1, fontSize: 13, fontFamily: F.regular, color: '#0F172A',
    // @ts-ignore
    outlineStyle: 'none',
  },
  implantDropList: {
    borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden' as any,
    // @ts-ignore
    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
  },
  implantDropItem: {
    flexDirection: 'row' as any, alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
  },
  implantDropItemActive: {
    backgroundColor: '#F5F3FF',
  },
  implantDropItemText: {
    fontSize: 13, fontFamily: F.regular, color: '#334155', flex: 1,
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
                return group.ops.map(op => (
                  <View key={op.tooth} style={[lsp.toothPill, op.work_type ? lsp.toothPillFilled : lsp.toothPillEmpty]}>
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
                <MaterialCommunityIcons name={'paperclip' as any} size={12} color="#64748B" />
                <Text style={lsp.colValue}>{form.attachments.length}</Text>
              </View>
            </View>
          </>
        )}

      </ScrollView>

      {/* ── Chat button ── */}
      <View style={lsp.chatBtnWrap}>
        <TouchableOpacity onPress={onOpenChat} style={lsp.chatBtn} activeOpacity={0.8}>
          <MaterialCommunityIcons name={'forum' as any} size={15} color="#fff" />
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
              <MaterialCommunityIcons name="close" size={20} color="#64748B" />
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
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
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
                options={localClinics.filter(c => c.is_active).map(c => ({ id: c.id, label: c.name, sublabel: c.phone ?? undefined }))}
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

      {/* Nested clinic add modal — opens on top of doctor modal */}
      <ClinicAddModal
        visible={nestedClinicModal.visible}
        prefillName={nestedClinicModal.prefill}
        saving={nestedClinicSaving}
        onClose={() => setNestedClinicModal({ visible: false, prefill: '' })}
        onSave={async (data) => {
          setNestedClinicSaving(true);
          const { data: created } = await createClinic(data);
          setNestedClinicSaving(false);
          if (created) {
            const newClinic = created as Clinic;
            setLocalClinics(prev => [...prev, newClinic]);
            setSelectedClinicId(newClinic.id);
            onClinicAdded?.(newClinic);
          }
          setNestedClinicModal({ visible: false, prefill: '' });
        }}
        accentColor={P}
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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
  const ip = useMemo(() => makeIpStyles(P), [P]);
  const [open, setOpen] = useState(false);
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<any>(null);
  const sel = options.find(o => o.value === value);

  const openDrop = () => {
    if (disabled || !btnRef.current) return;
    if (Platform.OS === 'web') {
      const r = (btnRef.current as any).getBoundingClientRect?.();
      if (r) setDropRect({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 160) });
    }
    setOpen(true);
  };

  return (
    <>
      <TouchableOpacity ref={btnRef} onPress={openDrop} style={[ip.btn, disabled && ip.btnDisabled]}>
        <Text style={[ip.val, !sel && ip.placeholder]} numberOfLines={1}>
          {sel?.label ?? placeholder}
        </Text>
        <MaterialCommunityIcons name={'chevron-down' as any} size={11} color={disabled ? '#CBD5E1' : '#64748B'} />
      </TouchableOpacity>

      {open && dropRect && (
        <WebPortal>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} activeOpacity={1}>
            <View style={[ip.drop, { top: dropRect.top, left: dropRect.left, minWidth: dropRect.width }]}>
              {value !== '' && (
                <TouchableOpacity onPress={() => { onSelect(''); setOpen(false); }} style={ip.optClear}>
                  <Text style={ip.optClearText}>Temizle</Text>
                </TouchableOpacity>
              )}
              {options.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => { onSelect(opt.value); setOpen(false); }}
                  style={[ip.opt, opt.value === value && ip.optActive]}
                >
                  <Text style={[ip.optText, opt.value === value && ip.optTextActive]} numberOfLines={1}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </WebPortal>
      )}
    </>
  );
}

const makeIpStyles = (P: string) => StyleSheet.create({
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F8FAFC', borderRadius: 7, borderWidth: 1, borderColor: '#F1F5F9',
    paddingHorizontal: 7, paddingVertical: 5, minWidth: 70,
  },
  btnDisabled: { opacity: 0.35 },
  val: { flex: 1, fontSize: 11, fontFamily: F.medium, color: '#1E293B' },
  placeholder: { color: '#CBD5E1' },
  drop: {
    position: 'fixed' as any, backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    zIndex: 9999, maxHeight: 260, overflow: 'scroll' as any,
  },
  opt: { paddingHorizontal: 12, paddingVertical: 8 },
  optActive: { backgroundColor: '#F1F5F9' },
  optText: { fontSize: 12, fontFamily: F.regular, color: '#334155' },
  optTextActive: { fontFamily: F.semibold, color: P },
  optClear: { paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  optClearText: { fontSize: 11, fontFamily: F.regular, color: '#94A3B8' },
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
        onSelect={(v) => { setLocalMainCat(v); onChange({ work_type: '', shade: '', material: '', implant_system: '', abutment: '', screw: '', material_price: 0 }); }}
        placeholder="İş türü"
        accentColor={P}
      />

      {/* Alt tür */}
      <InlinePicker
        value={op.work_type}
        options={subtypes}
        onSelect={(v) => {
          const autoPrice = materialPrices[v] ?? 0;
          onChange({ work_type: v, shade: '', material: '', implant_system: '', abutment: '', screw: '', material_price: autoPrice });
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
}: {
  op: ToothOp;
  updateToothOp: (patch: Partial<Omit<ToothOp, 'tooth'>>) => void;
  selectedTeeth: number[];
  onNightGuard: (jaw: 'upper' | 'lower' | 'both') => void;
  accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const wts = useMemo(() => makeWtsStyles(P), [P]);
  const styles = useMemo(() => makeStyles(P), [P]);
  const derivedMain = op.work_type ? (WORK_TYPE_MAIN[op.work_type] ?? null) : null;
  const [pendingMain, setPendingMain]         = React.useState<string | null>(null);
  const [showNightGuard, setShowNightGuard]   = React.useState(false);

  const activeMain = derivedMain ?? pendingMain;
  const activeNode = WORK_TYPE_TREE.find(n => n.label === activeMain) ?? null;
  const cat = op.work_type ? (OP_CATEGORY[op.work_type] ?? null) : null;

  // Seçili dişlerden çene tespiti
  const hasUpper = selectedTeeth.some(t => (t >= 11 && t <= 18) || (t >= 21 && t <= 28));
  const hasLower = selectedTeeth.some(t => (t >= 31 && t <= 38) || (t >= 41 && t <= 48));
  const suggestedJaw: 'upper' | 'lower' | 'both' | null =
    hasUpper && hasLower ? 'both' : hasUpper ? 'upper' : hasLower ? 'lower' : null;

  const selectMain = (label: string) => {
    setShowNightGuard(false);
    if (label === activeMain) {
      setPendingMain(null);
      updateToothOp({ work_type: '', shade: '', implant_system: '', abutment: '', screw: '', material: '' });
    } else {
      setPendingMain(label);
      if (op.work_type) {
        updateToothOp({ work_type: '', shade: '', implant_system: '', abutment: '', screw: '', material: '' });
      }
    }
  };

  const selectSub = (value: string) => {
    const next = op.work_type === value ? '' : value;
    setPendingMain(null);
    updateToothOp({ work_type: next, shade: '', implant_system: '', abutment: '', screw: '', material: '' });
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
    updateToothOp({ work_type: f.value, shade: '', implant_system: '', abutment: '', screw: '', material: '' });
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
              updateToothOp({ work_type: '', shade: '', implant_system: '', abutment: '', screw: '', material: '' });
            }}
            activeOpacity={0.75}
          >
            <Text style={[wts.crumbChipText, !op.work_type && wts.crumbChipTextActive]}>{activeMain}</Text>
            <MaterialCommunityIcons name={'chevron-down' as any} size={13} color={!op.work_type ? P : '#94A3B8'} />
          </TouchableOpacity>

          {/* Sub tip chip — sadece seçildiyse göster, tıklayınca sub seçime döner */}
          {op.work_type && (
            <>
              <Text style={wts.crumbSep}>›</Text>
              <TouchableOpacity
                style={[wts.crumbChip, wts.crumbChipActive]}
                onPress={() => updateToothOp({ work_type: '', shade: '', implant_system: '', abutment: '', screw: '', material: '' })}
                activeOpacity={0.75}
              >
                <Text style={[wts.crumbChipText, wts.crumbChipTextActive]}>
                  {activeNode?.subtypes.find(s => s.value === op.work_type)?.label ?? op.work_type}
                </Text>
                <MaterialCommunityIcons name={'chevron-down' as any} size={13} color={P} />
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── ADIM 1: Ana Tip ── */}
      {!activeMain && (
        <>
          <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>İş Türü</Text>
          <View style={wts.mainRow}>
            {WORK_TYPE_TREE.map(node => (
              <TouchableOpacity
                key={node.label}
                style={wts.mainBtn}
                onPress={() => selectMain(node.label)}
                activeOpacity={0.75}
              >
                <Text style={wts.mainBtnLabel}>{node.label === 'Diğer' ? 'Devamı...' : node.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* ── ADIM 2: Alt Tip ── */}
      {activeMain && !op.work_type && activeNode && (
        <>
          <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>{activeMain} — Tür Seç</Text>
          <View style={wts.subRow}>
            {activeNode.subtypes.map(sub => (
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
      {op.work_type && (
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
                      onPress={() => updateToothOp({ shade: op.shade === s ? '' : s })}
                      style={[styles.shadeChip, op.shade === s && styles.shadeChipActive]}>
                      <Text style={[styles.shadeText, op.shade === s && styles.shadeTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}

          {/* IMPLANT → system + abutment + screw + shade */}
          {cat === 'implant' && (
            <>
              <Text style={styles.fieldLabel}>İmplant Sistemi</Text>
              <View style={[styles.chipRow, { marginBottom: 12 }]}>
                {IMPLANT_SYSTEMS.map(s => (
                  <TouchableOpacity key={s}
                    onPress={() => updateToothOp({ implant_system: op.implant_system === s ? '' : s })}
                    style={[styles.chip, op.implant_system === s && styles.chipActive]}>
                    <Text style={[styles.chipText, op.implant_system === s && styles.chipTextActive]}>{s}</Text>
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
                      onPress={() => updateToothOp({ shade: op.shade === s ? '' : s })}
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
                    onPress={() => updateToothOp({ material: op.material === m ? '' : m })}
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
        </View>
      )}
    </>
  );
}

const makeWtsStyles = (P: string) => StyleSheet.create({
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
    borderColor: '#DDE3ED', backgroundColor: '#FAFBFC',
  },
  crumbChipActive: {
    borderColor: P, backgroundColor: '#F1F5F9',
  },
  crumbChipText: { fontSize: 12, fontWeight: '400' as any, fontFamily: F.regular, color: '#64748B' },
  crumbChipTextActive: { color: P, fontWeight: '500' as any, fontFamily: F.medium },
  crumbSep: { fontSize: 13, color: '#CBD5E1', marginHorizontal: 1 },

  mainRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4,
  },
  mainBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#DDE3ED', backgroundColor: '#FAFBFC',
  },
  mainBtnLabel: { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: '#64748B' },

  subRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4,
  },
  subBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#DDE3ED', backgroundColor: '#FAFBFC',
  },
  subBtnLabel: { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: '#64748B' },

  detailBox: {
    marginTop: 4, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
});

// ── Sub-components ─────────────────────────────────────────────

// ── ChatBox ───────────────────────────────────────────────────────────────────

function VoicePlayer({ uri, duration, accentColor }: { uri: string; duration: number; accentColor?: string }) {
  const P  = accentColor ?? C.primary;
  const cb = useMemo(() => makeCbStyles(P), [P]);
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
        <MaterialCommunityIcons name={playing ? ('pause' as any) : ('play' as any)} size={16} color="#fff" />
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
  const cb = useMemo(() => makeCbStyles(P), [P]);
  const isSelf = true; // new order form — always self (right side, blue)
  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  const time = new Date(msg.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

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
              <MaterialCommunityIcons name={'file-document-outline' as any} size={20} color="#fff" />
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
            <MaterialCommunityIcons name={'close' as any} size={10} color={isSelf ? 'rgba(255,255,255,0.6)' : '#CBD5E1'} />
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
  const cb = useMemo(() => makeCbStyles(P), [P]);
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

  const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const sendText = () => {
    if (!text.trim()) return;
    onAdd({ id: newId(), type: 'text', text: text.trim(), ts: new Date().toISOString() });
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
          <MaterialCommunityIcons name={'forum' as any} size={16} color={P} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cb.headerTitle}>Mesaj kutusu</Text>
          <Text style={cb.headerSub} numberOfLines={2}>
            Bu vakaya özel notlar, sesli mesajlar ve dosyalar
          </Text>
        </View>
        <View style={cb.headerDot} />
      </View>
      )}

      {/* ── Message list ── */}
      <ScrollView
        ref={scrollRef}
        style={cb.msgList}
        contentContainerStyle={cb.msgContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={cb.emptyWrap}>
            <MaterialCommunityIcons name={'message-outline' as any} size={28} color="#CBD5E1" />
            <Text style={cb.emptyTxt}>Henüz mesaj yok</Text>
          </View>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} onDelete={() => onDelete(msg.id)} accentColor={accentColor} />
        ))}
      </ScrollView>

      {/* ── Recording indicator ── */}
      {recording && (
        <View style={cb.recBar}>
          <View style={cb.recDot} />
          <Text style={cb.recTxt}>Kaydediliyor  {fmt(elapsed)}</Text>
          <TouchableOpacity onPress={stopRec} style={cb.recStop}>
            <MaterialCommunityIcons name={'stop-circle-outline' as any} size={18} color="#EF4444" />
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
                  <MaterialCommunityIcons name={'close' as any} size={20} color="#64748B" />
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
                  <MaterialCommunityIcons
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
                  <MaterialCommunityIcons name={'send' as any} size={16} color="#FFFFFF" />
                  <Text style={cb.previewSendTxt}>Gönder</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* ── Input bar ── */}
      <View style={cb.inputBar}>
        {/* Attach menu — web only */}
        {Platform.OS === 'web' && (
          <View style={{ position: 'relative' }}>
            {attachMenuOpen && (
              <>
                {/* Backdrop */}
                <Pressable style={cb.attachBackdrop} onPress={() => setAttachMenuOpen(false)} />
                {/* Menu */}
                <View style={cb.attachMenu}>
                  <TouchableOpacity
                    style={cb.attachItem}
                    onPress={() => { setAttachMenuOpen(false); imageInputRef.current?.click(); }}
                    activeOpacity={0.85}
                  >
                    <Text style={cb.attachItemLabel}>Fotoğraf</Text>
                    <View style={[cb.attachIconCircle, { backgroundColor: '#0F172A' }]}>
                      <MaterialCommunityIcons name={'image-outline' as any} size={22} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={cb.attachItem}
                    onPress={() => { setAttachMenuOpen(false); scanInputRef.current?.click(); }}
                    activeOpacity={0.85}
                  >
                    <Text style={cb.attachItemLabel}>Dijital Tarama</Text>
                    <View style={[cb.attachIconCircle, { backgroundColor: '#0891B2' }]}>
                      <MaterialCommunityIcons name={'cube-scan' as any} size={22} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={cb.attachItem}
                    onPress={() => { setAttachMenuOpen(false); docInputRef.current?.click(); }}
                    activeOpacity={0.85}
                  >
                    <Text style={cb.attachItemLabel}>Dosya</Text>
                    <View style={[cb.attachIconCircle, { backgroundColor: '#7C3AED' }]}>
                      <MaterialCommunityIcons name={'file-document-outline' as any} size={22} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Paperclip / close toggle */}
            <TouchableOpacity
              style={[cb.flatBtn, attachMenuOpen && cb.flatBtnActive]}
              onPress={() => setAttachMenuOpen(v => !v)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={attachMenuOpen ? ('close' as any) : ('paperclip' as any)}
                size={20}
                color={attachMenuOpen ? '#0F172A' : '#94A3B8'}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Text input — Enter sends, Shift+Enter newline */}
        <TextInput
          style={cb.textInput}
          value={text}
          onChangeText={setText}
          placeholder="Mesajınızı yazın..."
          placeholderTextColor="#B0BAC9"
          multiline
          // @ts-ignore
          outlineStyle="none"
          onKeyPress={(e: any) => {
            if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
              e.preventDefault?.();
              sendText();
            }
          }}
        />

        {/* Mic — large blue circle (primary action) */}
        <TouchableOpacity
          style={[cb.micBtn, recording && cb.micBtnRec]}
          onPress={recording ? stopRec : startRec}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name={recording ? ('stop' as any) : ('microphone' as any)}
            size={20} color="#fff"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeCbStyles = (P: string) => StyleSheet.create({
  // Container
  wrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFFFFF', flex: 1,
          shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
          borderWidth: 1, borderColor: '#E8EDF2' },

  // Header — white, clean, like reference
  header:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16,
                  paddingVertical: 12, backgroundColor: '#fff',
                  borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  headerIcon:  { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9',
                  alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '700' as any, color: '#1E293B', marginBottom: 1 },
  headerSub:   { fontSize: 10, color: '#94A3B8', lineHeight: 14 },
  headerDot:   { width: 9, height: 9, borderRadius: 5, backgroundColor: '#22C55E',
                  borderWidth: 1.5, borderColor: '#fff' },

  // Messages
  msgList:    { flex: 1, minHeight: 200, backgroundColor: '#F8FAFC' },
  msgContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  emptyWrap:  { alignItems: 'center', justifyContent: 'center', paddingTop: 50, gap: 8 },
  emptyTxt:   { fontSize: 12, color: '#CBD5E1' },

  // Bubble — right side blue (sent), left side white (received)
  msgRow:      { alignItems: 'flex-end', marginBottom: 4 },
  msgRowLeft:  { alignItems: 'flex-start', marginBottom: 4 },
  bubble:      { maxWidth: '78%', backgroundColor: P,
                  borderRadius: 20, borderBottomRightRadius: 4,
                  paddingVertical: 10, paddingHorizontal: 14,
                  shadowColor: P, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  bubbleLeft:  { backgroundColor: '#fff', borderBottomRightRadius: 20, borderBottomLeftRadius: 4,
                  shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  bubbleTxt:     { fontSize: 13, color: '#fff', lineHeight: 20 },
  bubbleTxtLeft: { color: '#1E293B' },
  bubbleMeta:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 3 },
  bubbleTime:    { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  bubbleTimeLeft:{ color: '#94A3B8' },

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
                 paddingVertical: 8, backgroundColor: '#FFF5F5',
                 borderTopWidth: 1, borderTopColor: '#FCA5A5' },
  recDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  recTxt:     { fontSize: 12, color: '#EF4444', flex: 1 },
  recStop:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recStopTxt: { fontSize: 12, color: '#EF4444' },

  // Input bar — flat, clean like reference
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 4,
               paddingHorizontal: 12, paddingVertical: 10,
               borderTopWidth: 1, borderTopColor: '#F0F4F8', backgroundColor: '#fff' },
  flatBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  flatBtnActive: { backgroundColor: '#F1F5F9', borderRadius: 18 },
  textInput:   { flex: 1, fontSize: 13, color: '#1E293B', maxHeight: 90,
                  paddingHorizontal: 4, paddingVertical: 6,
                  // @ts-ignore
                  outlineStyle: 'none' },
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
    left: 0,
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
                    outlineStyle: 'none' },
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
        <MaterialCommunityIcons name={isPlaying ? ('pause' as any) : ('play' as any)} size={12} color="#fff" />
      </TouchableOpacity>
      <Text style={[vni.pillLabel, isPlaying && vni.pillLabelActive]}>{label}</Text>
      <Text style={vni.pillDur}>{fmt(note.duration)}</Text>
      <TouchableOpacity onPress={onDelete} style={vni.pillDel} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
        <MaterialCommunityIcons name={'close' as any} size={10} color="#94A3B8" />
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
              <MaterialCommunityIcons name={'microphone' as any} size={13} color="#fff" />
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
            <MaterialCommunityIcons name={'pause' as any} size={18} color="#fff" />
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
  wrap:     { marginTop: 8, marginRight: 6, marginBottom: 4 },
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

function SectionCard({ title, subtitle, icon, iconNode, children, errorCount, headerRight, style, accentColor }: {
  title: string; subtitle?: string; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name']; iconNode?: React.ReactNode; children: React.ReactNode; errorCount?: number; headerRight?: React.ReactNode; style?: any; accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const sc = _staticStyles;
  return (
    <View style={[sc.sectionCard, errorCount ? sc.sectionCardError : undefined, style]}>
      <View style={sc.sectionCardHeader}>
        <View style={[sc.sectionCardTitleRow, { flex: 1 }]}>
          {(icon || iconNode) && (
            <View style={sc.sectionCardIconWrap}>
              {iconNode ?? <MaterialCommunityIcons name={icon!} size={14} color={errorCount ? '#EF4444' : P} />}
            </View>
          )}
          <Text style={[sc.sectionCardTitle, errorCount ? { color: '#EF4444' } : undefined]}>{title}</Text>
          {!!errorCount && (
            <View style={sc.sectionCardErrBadge}>
              <Text style={sc.sectionCardErrBadgeText}>{errorCount}</Text>
            </View>
          )}
          {headerRight && <View style={{ marginLeft: 'auto' }}>{headerRight}</View>}
        </View>
        {subtitle && <Text style={sc.sectionCardSub}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, marginBottom: 2 }}>
      <MaterialCommunityIcons name={'alert-circle-outline' as any} size={12} color="#EF4444" />
      <Text style={{ fontSize: 11, fontFamily: F.medium, color: '#EF4444' }}>{msg}</Text>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, multiline, flex, style, required, error }: any) {
  return (
    <View style={[_staticStyles.fieldWrap, flex && { flex: 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 }}>
        {required && <Text style={{ fontSize: 13, color: error ? '#EF4444' : '#0F172A', fontWeight: '700', lineHeight: 16 }}>*</Text>}
        <Text style={[_staticStyles.fieldLabel, { marginBottom: 0 }, error && { color: '#EF4444' }]}>{label}</Text>
      </View>
      <TextInput
        style={[
          _staticStyles.fieldInput,
          multiline && _staticStyles.fieldInputMulti,
          error && { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.05)' },
          style,
        ]}
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        multiline={multiline} textAlignVertical={multiline ? 'top' : 'auto'}
      />
    </View>
  );
}

// ── Drum-roll Wheel Picker ──────────────────────────────────────

const WHEEL_ITEM_H = 44;
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
                  fontSize: dist === 0 ? 17 : 15,
                  fontWeight: dist === 0 ? '600' : '400',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
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
                fontSize: dist === 0 ? 17 : 15,
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
  const P = accentColor ?? C.primary;
  const dp = useMemo(() => makeDpStyles(P), [P]);
  const { width: SW, height: SH } = useWindowDimensions();
  const now = new Date();
  const minY = minDate ? minDate.getFullYear() : 1930;
  const maxY = maxDate ? maxDate.getFullYear() : now.getFullYear();

  const [selYear,  setSelYear]  = useState(value ? value.getFullYear() : now.getFullYear());
  const [selMonth, setSelMonth] = useState(value ? value.getMonth()    : now.getMonth());
  const [selDay,   setSelDay]   = useState(value ? value.getDate()     : now.getDate());

  useEffect(() => {
    if (visible) {
      const d = value ?? now;
      setSelYear(d.getFullYear());
      setSelMonth(d.getMonth());
      setSelDay(d.getDate());
    }
  }, [visible]);

  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => String(minY + i));
  const daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const clampedDay = Math.min(selDay, daysInMonth);

  const handleSubmit = () => {
    onChange(new Date(selYear, selMonth, clampedDay, 12, 0, 0));
    onClose();
  };

  const yearIdx  = Math.max(0, years.indexOf(String(selYear)));
  const dayIdx   = Math.max(0, clampedDay - 1);

  // Card dimensions (approximate)
  const CARD_W = 260;
  const CARD_H = 330;

  // Positioned below the anchor; flip above if too close to bottom
  const cardTop = anchorPos
    ? (anchorPos.y + anchorPos.h + 6 + CARD_H > SH
        ? anchorPos.y - CARD_H - 6
        : anchorPos.y + anchorPos.h + 6)
    : undefined;
  const cardLeft = anchorPos
    ? Math.max(8, Math.min(anchorPos.x, SW - CARD_W - 8))
    : undefined;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={dp.overlay} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[dp.card, anchorPos && { position: 'absolute', top: cardTop, left: cardLeft }]}
        >
          {/* Header */}
          <View style={dp.header}>
            <Text style={dp.headerTitle}>{(title ?? 'Tarih Seç').toUpperCase()}</Text>
            <TouchableOpacity style={dp.closeBtn} onPress={onClose}>
              <Text style={dp.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Column labels */}
          <View style={dp.colLabels}>
            <Text style={[dp.colLabel, { width: 88 }]}>YIL</Text>
            <Text style={[dp.colLabel, { width: 72 }]}>AY</Text>
            <Text style={[dp.colLabel, { width: 64 }]}>GÜN</Text>
          </View>

          {/* Three scroll columns */}
          <View style={dp.columns}>
            <WheelPickerColumn
              items={years}
              selectedIndex={yearIdx}
              onChange={(i) => setSelYear(parseInt(years[i]))}
              width={88}
            />
            <WheelPickerColumn
              items={TR_MONTHS}
              selectedIndex={selMonth}
              onChange={setSelMonth}
              width={72}
            />
            <WheelPickerColumn
              items={days}
              selectedIndex={dayIdx}
              onChange={(i) => setSelDay(i + 1)}
              width={64}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity style={dp.submitBtn} onPress={handleSubmit}>
            <Text style={dp.submitText}>KAYDET</Text>
          </TouchableOpacity>
        </TouchableOpacity>
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
    width: 260,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 11, fontWeight: '500', fontFamily: F.medium,
    color: '#94A3B8', letterSpacing: 0.3,
  },
  closeBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  closeX: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  colLabels: {
    flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 4, gap: 0,
  },
  colLabel: {
    fontSize: 9, fontWeight: '500', fontFamily: F.medium,
    color: '#CBD5E1', letterSpacing: 0.2, textAlign: 'center', textTransform: 'none',
  },
  columns: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  submitBtn: {
    margin: 14,
    backgroundColor: P,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: {
    color: '#FFFFFF', fontSize: 12,
    fontWeight: '600', fontFamily: F.semibold,
    letterSpacing: 0.3,
  },
});

// ── DateField ────────────────────────────────────────────────────

function DateField({ label, value, onChange, minDate, maxDate, placeholder, flex, required, error }: {
  label?: string;
  value: Date | null;
  onChange: (d: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  flex?: boolean;
  required?: boolean;
  error?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
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
      <View ref={fieldRef} style={[_staticStyles.dateInputRow, error && { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.05)' }]}>
        <TextInput
          style={_staticStyles.dateTextInput}
          value={textValue}
          onChangeText={handleTextChange}
          placeholder={placeholder ?? 'GG.AA.YYYY'}
          placeholderTextColor="#94A3B8"
          keyboardType="numeric"
          maxLength={10}
        />
        <TouchableOpacity onPress={handleOpenPicker} style={_staticStyles.calIconBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="calendar-outline" size={16} color="#64748B" />
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
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  value: string;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
  error?: string;
  accentColor?: string;
}) {
  const P = accentColor ?? C.primary;
  const isel = useMemo(() => makeIselStyles(P), [P]);
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
        <MaterialCommunityIcons name={icon} size={14} color="#94A3B8" />
        <View style={{ flex: 1 }}>
          <Text style={[isel.cardLabel, !!error && isel.cardLabelError]}>{label}</Text>
          <Text style={[isel.cardValue, !hasValue && isel.cardPlaceholder]}>
            {selected ? selected.label : 'Seçiniz'}
          </Text>
        </View>
        <MaterialCommunityIcons
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
                  {active && <MaterialCommunityIcons name="check" size={13} color={P} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeIselStyles = (P: string) => StyleSheet.create({
  /* Wrapper: flex:1 + overflow visible — sadece kendi kolonunu büyütür */
  wrap: { flex: 1 },

  /* Trigger kartı */
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF',
  },
  cardActive: { borderColor: '#F1F5F9', backgroundColor: '#FFFFFF' },
  cardOpen:   { borderColor: '#F1F5F9', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  cardError:  { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },

  cardLabel:        { fontSize: 10, fontFamily: F.medium, color: '#94A3B8', letterSpacing: 0.3 },
  cardLabelError:   { color: '#EF4444' },
  cardLabelActive:  { color: P },
  cardValue:        { fontSize: 13, fontFamily: F.medium, fontWeight: '500', color: '#0F172A', marginTop: 2 },
  cardValueActive:  { color: P },
  cardPlaceholder:  { color: '#CBD5E1', fontFamily: F.regular, fontWeight: '400' },

  /* Seçenek listesi — trigger'a yapışık görünür */
  list: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1, borderTopWidth: 0,
    borderColor: '#F1F5F9',
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
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
  optionBorder:     { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  optionActive:     { backgroundColor: '#F1F5F9' },
  optionText:       { fontSize: 13, fontFamily: F.regular, color: '#334155' },
  optionTextActive: { color: P, fontFamily: F.medium },
});

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
  const isel = useMemo(() => makeIselStyles(P), [P]);
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
        <MaterialCommunityIcons name={'calendar-outline' as any} size={14} color="#94A3B8" />
        <View style={{ flex: 1 }}>
          <Text style={[isel.cardLabel, !!error && isel.cardLabelError]}>{label}</Text>
          <Text style={[isel.cardValue, !formatted && isel.cardPlaceholder]}>
            {formatted ?? 'Tarih seçin'}
          </Text>
        </View>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={15} color="#94A3B8" />
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

// ── SearchableDropdown ──────────────────────────────────────────

interface DropdownOption { id: string; label: string; sublabel?: string; }

function SearchableDropdown({
  label, placeholder, options, selectedId, onSelect, onAddNew, addNewLabel,
  disabled, disabledHint, required, error,
}: {
  label: string;
  placeholder: string;
  options: DropdownOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddNew?: (name: string) => Promise<void>;
  addNewLabel?: string;
  disabled?: boolean;
  disabledHint?: string;
  required?: boolean;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery]     = useState('');
  const [adding, setAdding]   = useState(false);
  const [dropPos, setDropPos] = React.useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const wrapRef = React.useRef<View>(null);

  const DROP_MAX_H = 260; // dropdown panel max-height + add-row

  const measureWrap = React.useCallback(() => {
    if (Platform.OS !== 'web' || !wrapRef.current) return;
    const el = wrapRef.current as any;
    if (el?.getBoundingClientRect) {
      const rect = el.getBoundingClientRect();
      const vh = (typeof window !== 'undefined' ? window.innerHeight : 800);
      const spaceBelow = vh - rect.bottom;
      if (spaceBelow < DROP_MAX_H + 8) {
        // Yukarı aç: dropdown'un alt kenarı trigger'ın üstüne hizalanır
        setDropPos({ bottom: vh - rect.top + 4, left: rect.left, width: rect.width });
      } else {
        // Aşağı aç (normal)
        setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    }
  }, []);

  const selected = options.find(o => o.id === selectedId);

  // Keep input text in sync with external selection changes (e.g. clinic reset clears doctor)
  useEffect(() => {
    if (!focused) {
      setQuery(selected ? selected.label : '');
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Türkçe karakter normalizasyonu: İ→i, Ş→s vb. harmanlama sorunlarını giderir
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');

  const filtered = query.trim()
    ? options.filter(o => norm(o.label).includes(norm(query)))
    : options;

  const exactMatch = options.some(o => norm(o.label) === norm(query.trim()));
  // Web'de dropPos hazır olmadan paneli açma (overflow:hidden parent tarafından kırpılır)
  const showList   = focused && (Platform.OS !== 'web' || dropPos !== null);
  const showAdd    = !!onAddNew && showList && !exactMatch;

  const handleSelect = (id: string, itemLabel: string) => {
    onSelect(id);
    setQuery(itemLabel);
    setFocused(false);
  };

  const handleClear = () => {
    onSelect('');
    setQuery('');
    setFocused(false);
  };

  const handleAdd = async () => {
    if (!onAddNew || adding) return;
    setAdding(true);
    await onAddNew(query.trim());
    setAdding(false);
    setFocused(false);
  };

  // Disabled — must be after all hooks
  if (disabled) {
    return (
      <View style={[dd.wrap, { flex: 1 }]}>
        {label ? <Text style={dd.label}>{label}</Text> : null}
        <View style={[dd.inputWrap, { backgroundColor: '#F1F5F9', borderColor: '#F1F5F9' }]}>
          <MaterialCommunityIcons name="lock-outline" size={14} color="#B0BAC9" />
          <Text style={[dd.input, { color: '#B0BAC9' } as any]} numberOfLines={1}>
            {disabledHint ?? placeholder}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View ref={wrapRef} style={[dd.wrap, { flex: 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5 }}>
        {required && <Text style={{ fontSize: 13, color: error ? '#EF4444' : '#0F172A', fontWeight: '700', lineHeight: 16 }}>*</Text>}
        <Text style={[dd.label, { marginBottom: 0 }, error && { color: '#EF4444' }]}>{label}</Text>
      </View>

      {/* Text input — always visible, acts as both search & display */}
      <View style={[dd.inputWrap, focused && dd.inputWrapFocused, error && { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.05)' }]}>
        <MaterialCommunityIcons name="magnify" size={15} color="#94A3B8" />
        <TextInput
          style={dd.input}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            if (!text) onSelect('');
          }}
          onFocus={() => { setFocused(true); measureWrap(); }}
          onBlur={() => setTimeout(() => setFocused(false), 250)}
          placeholder={placeholder}
          placeholderTextColor="#B0BAC9"
          // @ts-ignore
          outlineStyle="none"
        />
        {selectedId ? (
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="close-circle-outline" size={16} color="#B0BAC9" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Dropdown list — portal to document.body (bypasses transform containing block) */}
      {showList && (
        <WebPortal>
          <View
            style={[
              dd.panel,
              dropPos
                ? { position: 'fixed' as any, top: dropPos.top, bottom: dropPos.bottom, left: dropPos.left, width: dropPos.width, marginTop: 0, zIndex: 9999 }
                : { display: 'none' as any },
            ]}
            {...(Platform.OS === 'web' ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
          >
            <ScrollView
              style={dd.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {filtered.length === 0 && !showAdd && (
                <Text style={dd.emptyText}>Sonuç bulunamadı</Text>
              )}
              {filtered.map(item => {
                const active = item.id === selectedId;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[dd.item, active && dd.itemActive]}
                    onPress={() => handleSelect(item.id, item.label)}
                  >
                    <View style={dd.itemLeft}>
                      <Text style={[dd.itemLabel, active && dd.itemLabelActive]}>{item.label}</Text>
                      {item.sublabel && <Text style={dd.itemSub}>{item.sublabel}</Text>}
                    </View>
                    {active && <MaterialCommunityIcons name="check" size={16} color="#0F172A" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {showAdd && (
              <TouchableOpacity style={dd.addRow} onPress={handleAdd} disabled={adding}>
                <View style={dd.addIcon}>
                  <MaterialCommunityIcons name="plus" size={16} color="#0F172A" />
                </View>
                <Text style={dd.addText}>
                  {adding ? 'Ekleniyor...' : query.trim() ? `${addNewLabel ?? 'Ekle'}: "${query.trim()}"` : (addNewLabel ?? 'Yeni ekle')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </WebPortal>
      )}
    </View>
  );
}

const dd = StyleSheet.create({
  wrap:  { position: 'relative' },
  label: { fontSize: 11, fontWeight: '500', fontFamily: F.medium, color: '#64748B', marginBottom: 7, letterSpacing: 0.5, textTransform: 'none' },

  /* Direct text input */
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: '#FFFFFF',
  },
  inputWrapFocused: { borderColor: '#0F172A' },
  input: {
    flex: 1, fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#0F172A',
  },

  /* Overlay panel — fixed position on web, doesn't push content */
  panel: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 4px 16px rgba(15,23,42,0.10)',
  },

  list:      { maxHeight: 240 },
  emptyText: { textAlign: 'center', fontFamily: F.regular, color: '#94A3B8', paddingVertical: 24, fontSize: 13 },

  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F8FAFC', gap: 10,
  },
  itemActive:      { backgroundColor: '#F1F5F9' },
  itemLeft:        { flex: 1 },
  itemLabel:       { fontSize: 14, fontWeight: '400', fontFamily: F.regular, color: '#0F172A' },
  itemLabelActive: { color: '#0F172A', fontWeight: '500', fontFamily: F.medium },
  itemSub:         { fontSize: 12, fontFamily: F.regular, color: '#94A3B8', marginTop: 1 },

  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    backgroundColor: '#F8FAFF',
  },
  addIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  addText: { fontSize: 14, fontWeight: '500', fontFamily: F.medium, color: '#0F172A' },
});

// ── Step Sidebar (desktop) ──────────────────────────────────────

const STEP_DEFS = [
  { num: 1 as Step, label: 'Klinik & hasta',    sub: 'Klinik, hekim, hasta bilgileri', icon: 'account-multiple-outline'  as any },
  { num: 2 as Step, label: 'Vaka detayları',    sub: 'Ölçüm, teslim tarihi, notlar',  icon: 'clipboard-text-outline'    as any },
  { num: 3 as Step, label: 'Diş & protez',      sub: 'Diş seçimi, iş detayları',      icon: 'tooth-outline'             as any },
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
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
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

const makeStyles = (P: string) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },

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

  /* Form content area — light background so cards pop */
  content: { padding: 20, paddingBottom: 80, gap: 16 },

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
  sectionCardSub:   { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: C.textMuted, marginTop: 4, marginLeft: 36 },
  sectionCardError: {
    borderColor: '#FEE2E2',
    borderWidth: 1.5,
  },
  sectionCardErrBadge: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
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
    outlineStyle: 'none',
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
    borderWidth: 1.5, borderColor: '#DDE3ED', backgroundColor: '#FAFBFC',
  },
  chipActive:     { borderColor: P, backgroundColor: '#F1F5F9' },
  chipText:       { fontSize: 13, fontWeight: '400', fontFamily: F.regular, color: '#64748B' },
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
    paddingLeft: 14, overflow: 'hidden',
  },
  dateTextInput: {
    flex: 1, fontSize: 14, fontFamily: F.regular, color: '#0F172A',
    paddingVertical: 11, paddingRight: 8,
    outlineStyle: 'none',
  } as any,
  calIconBtn: {
    paddingHorizontal: 12, paddingVertical: 11,
    borderLeftWidth: 1, borderLeftColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },

  /* Shade + machine chips */
  shadeChip:       { borderWidth: 1, borderColor: '#DDE3ED', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11, backgroundColor: '#FAFBFC' },
  shadeChipActive: { borderColor: P, backgroundColor: '#F1F5F9' },
  shadeText:       { fontSize: 12, fontWeight: '400', fontFamily: F.regular, color: C.textSecondary },
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
  step2LeftDesktop:      { flex: 1, borderRightWidth: 1, borderRightColor: '#EEF2F7' },
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
    outlineStyle: 'none',
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
  summaryValue:      { fontSize: 13, fontWeight: '500', fontFamily: F.medium, color: '#0F172A', flex: 2, textAlign: 'right' },
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
const _staticStyles = makeStyles(C.primary);

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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
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
    borderRadius: 10, borderWidth: 1.5, borderColor: '#0EA5E9',
    marginTop: 6,
  },
  openBtnText: { fontSize: 13, fontWeight: '600', fontFamily: F.semibold, color: '#0EA5E9' },
});
