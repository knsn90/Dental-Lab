// modules/orders/stations/registry.ts
// İstasyon kayıt defteri — her standartlaştırılmış lab_stations.name'ini
// bir StationKind'a, eyebrow + dinamik CTA + ikona map'ler.
//
// Yeni istasyon (DB seviyesinde) eklendiğinde kind ekle + STATION_REGISTRY'e
// satır ekle. UI workspace katmanı buradan okur.

import type { LucideIcon } from '../../../core/ui/icons';
import {
  ScanLine, Cpu, Cog, Printer, Flame, Paintbrush, Sparkles, ShieldCheck,
  Box, CircleCheck, Hammer, Droplets, Wrench, Layers, Brush,
} from '../../../core/ui/icons';

/** Standardize edilmiş istasyon türleri (16 kanonik istasyon + GENERIC). */
export type StationKind =
  | 'SCAN'           // Tarama
  | 'MODEL_PREP'     // Model Hazırlık
  | 'CAD'            // CAD Tasarım
  | 'CAM'            // CAM Hazırlık
  | 'MILLING'        // Frezeleme
  | 'PRINT_3D'       // 3D Baskı
  | 'METAL_CAST'     // Metal Döküm
  | 'WASH_CURE'      // Wash / Cure
  | 'SINTER'         // Sinterleme
  | 'PORCELAIN'      // Porselen & Make-up
  | 'GLAZE'          // Glaze
  | 'POLISH'         // Polisaj
  | 'IMPLANT_MOUNT'  // İmplant Montajı
  | 'QC'             // Kalite Kontrol
  | 'PACKAGING'      // Paketleme
  | 'READY'          // Teslime Hazır
  | 'GENERIC';       // bilinmeyen istasyon

export interface ValidationItem {
  key:       string;
  label:     string;
  hint?:     string;
  /** Zorunlu (default true). false = atlanabilir. */
  required?: boolean;
}

/** Aşama-spesifik dosya kategorisi (FilesUploadModal extra group'a yansır). */
export interface FileCategoryItem {
  label: string;
  // 'any' = her dosya türü (görsel + STL/PLY 3D + HTML + belge); önizleme
  // slotları için — DocumentPicker '*/*' ile açılır, göz ikonuyla gösterilir.
  kind:  'image' | 'video' | 'scan' | 'pdf' | 'any';
}

export interface FileCategoryGroup {
  title: string;
  color: string;
  items: FileCategoryItem[];
}

export interface StationDescriptor {
  kind:           StationKind;
  /** İstasyon kategorisi — timeline'da renk grupları için. */
  phase:          'PREPARATION' | 'PRODUCTION' | 'POST_PROCESS' | 'FINALIZATION';
  /** Üst-yazı (eyebrow). */
  eyebrow:        string;
  /** "Tamamla & ilerlet" yerine kullanılacak dinamik CTA. */
  ctaLabel:       string;
  /** Bekleme durumundayken footer açıklaması. */
  waitingHint?:   string;
  /** Workspace ikonu. */
  icon:           LucideIcon;
  /** Fallback workspace kullansın mı (true), yoksa özel workspace (false) */
  hasCustomWorkspace?: boolean;
  /** Aşamayı kapatmadan önce işaretlenmesi gereken kontrol listesi. */
  validation:     ValidationItem[];
  /** Aşamaya özel dosya kategorileri — modal'da extra group olarak çıkar. */
  fileCategories?: FileCategoryGroup[];
  /** true → Tamamla butonu en az 1 dosya yüklenmeden açılmaz (CAD, SCAN gibi). */
  requiresFileUpload?: boolean;
}

/** name → kind eşlemesi. DB ismi tam eşleşmeli. */
const NAME_TO_KIND: Record<string, StationKind> = {
  'Tarama':              'SCAN',
  'Model Hazırlık':      'MODEL_PREP',
  'CAD Tasarım':         'CAD',
  'CAM Hazırlık':        'CAM',
  'Frezeleme':           'MILLING',
  '3D Baskı':            'PRINT_3D',
  'Metal Döküm':         'METAL_CAST',
  'Wash / Cure':         'WASH_CURE',
  'Sinterleme':          'SINTER',
  'Porselen & Make-up':  'PORCELAIN',
  'Glaze':               'GLAZE',
  'Polisaj':             'POLISH',
  'Polisaj/Glaze':       'POLISH',   // birleşik istasyon (Glaze, Polisaj'a katıldı)
  'Polisaj / Glaze':     'POLISH',   // boşluklu varyant da tanınsın
  'İmplant Montajı':     'IMPLANT_MOUNT',
  'Kalite Kontrol':      'QC',
  'Paketleme':           'PACKAGING',
  'Teslime Hazır':       'READY',
};

export function getStationKind(name?: string | null): StationKind {
  if (!name) return 'GENERIC';
  return NAME_TO_KIND[name] ?? 'GENERIC';
}

export const STATION_REGISTRY: Record<StationKind, StationDescriptor> = {
  SCAN: {
    kind: 'SCAN', phase: 'PREPARATION',
    eyebrow: '3D Tarama İstasyonu', ctaLabel: 'Taramayı Tamamla',
    waitingHint: 'Tarayıcıdan veri akışı başlamadı.',
    icon: ScanLine, hasCustomWorkspace: false,
    requiresFileUpload: true,  // en az 1 tasarım/STL dosyası şart
    validation: [
      { key: 'stl_uploaded',   label: 'STL/PLY dosyası yüklendi' },
      { key: 'quality_ok',     label: 'Tarama kalitesi onaylı', hint: 'Boşluk, gürültü, eksik yüzey yok' },
      { key: 'doctor_note_ok', label: 'Hekim notu kontrol edildi', required: false },
    ],
    // Standart "Tarama Verileri" grubu zaten Üst/Alt/Bite/Diş Eti'ni kapsıyor.
  },
  MODEL_PREP: {
    kind: 'MODEL_PREP', phase: 'PREPARATION',
    eyebrow: 'Model Hazırlık', ctaLabel: 'Modeli Onayla',
    icon: Layers, hasCustomWorkspace: false,
    validation: [
      { key: 'die_separated', label: 'Die ayrımı yapıldı' },
      { key: 'margin_clean',  label: 'Margin temiz ve net' },
      { key: 'occlusion_ok',  label: 'Oklüzyon kaydı uygun' },
    ],
  },
  CAD: {
    kind: 'CAD', phase: 'PREPARATION',
    eyebrow: 'CAD Tasarım', ctaLabel: 'İşlemi Tamamla',
    waitingHint: 'Önceki aşama bitince tasarım dosyaları açılacak.',
    icon: Cpu, hasCustomWorkspace: false,
    requiresFileUpload: true,  // CAM'e gönderilecek tasarım dosyası şart
    validation: [
      { key: 'margin_drawn',   label: 'Margin çizimi doğru' },
      { key: 'die_spacing',    label: 'Die spacing uygun', hint: '30–50 µm' },
      { key: 'contacts_ok',    label: 'Kontaklar (mesial/distal) ayarlı' },
      { key: 'occlusion_ok',   label: 'Oklüzyon clearance uygun' },
      { key: 'anatomy_ok',     label: 'Anatomi / emergence profile uygun' },
      { key: 'stl_export',     label: 'STL export kontrol edildi' },
    ],
    fileCategories: [{
      title: 'Tasarım Çıktıları',
      color: '#3B82F6',
      items: [
        { label: 'Frezeye Gönderilen Tasarım (STL)', kind: 'scan' },
        { label: '3D Yazıcıya Gönderilen Tasarım (STL)', kind: 'scan' },
        { label: 'Metal Döküm Pattern (STL)', kind: 'scan' },
        { label: 'Tasarım Önizleme', kind: 'any' },
        { label: 'Margin / Kontak Detay', kind: 'image' },
        { label: 'Hekim Onay PDF', kind: 'pdf' },
      ],
    }],
  },
  CAM: {
    kind: 'CAM', phase: 'PRODUCTION',
    eyebrow: 'CAM Hazırlık', ctaLabel: 'Üretime Gönder',
    icon: Cpu, hasCustomWorkspace: false,
    validation: [
      { key: 'block_size',  label: 'Blok boyutu uygun' },
      { key: 'sprue_ok',    label: 'Sprue konumu doğru' },
      { key: 'nesting_ok',  label: 'Nesting onaylandı' },
      { key: 'simulation',  label: 'Simülasyon başarılı' },
    ],
    fileCategories: [{
      title: 'CAM Hazırlık',
      color: '#8B5CF6',
      items: [
        { label: 'Nesting Görüntüsü', kind: 'image' },
        { label: 'CAM Job Dosyası', kind: 'scan' },
        { label: 'Simülasyon Çıktısı', kind: 'image' },
      ],
    }],
  },
  MILLING: {
    kind: 'MILLING', phase: 'PRODUCTION',
    eyebrow: 'Frezeleme', ctaLabel: 'Frezeyi Tamamla',
    waitingHint: 'CAM hazır olunca makine kuyruğuna düşecek.',
    icon: Cog, hasCustomWorkspace: false,
    validation: [
      { key: 'tool_set',     label: 'Frez seti doğru takılı' },
      { key: 'block_loaded', label: 'Blok makineye yüklü' },
      { key: 'mill_done',    label: 'Frezeleme tamamlandı' },
      { key: 'visual_ok',    label: 'Görsel kontrol — kırık/çatlak yok' },
    ],
    fileCategories: [{
      title: 'Frezeleme Çıktıları',
      color: '#F59E0B',
      items: [
        { label: 'Frezeleme Sonu Foto', kind: 'image' },
        { label: 'Makine Log Dosyası', kind: 'pdf' },
        { label: 'Sorun / Hata Görseli', kind: 'image' },
      ],
    }],
  },
  PRINT_3D: {
    kind: 'PRINT_3D', phase: 'PRODUCTION',
    eyebrow: '3D Baskı', ctaLabel: 'Baskıyı Tamamla',
    icon: Printer, hasCustomWorkspace: false,
    validation: [
      { key: 'resin_ok',      label: 'Reçine seçimi doğru' },
      { key: 'plate_clean',   label: 'Plaka temiz, kalibrasyon ok' },
      { key: 'print_done',    label: 'Baskı başarıyla tamamlandı' },
      { key: 'support_clean', label: 'Destekler temizlendi' },
    ],
    fileCategories: [{
      title: '3D Baskı',
      color: '#EC4899',
      items: [
        { label: 'Baskı Sonu Foto', kind: 'image' },
        { label: 'Slicer Çıktısı', kind: 'scan' },
      ],
    }],
  },
  METAL_CAST: {
    kind: 'METAL_CAST', phase: 'PRODUCTION',
    eyebrow: 'Metal Döküm', ctaLabel: 'Dökümü Tamamla',
    icon: Hammer, hasCustomWorkspace: false,
    validation: [
      { key: 'wax_ok',     label: 'Mum modelaj kontrol edildi' },
      { key: 'cast_ok',    label: 'Döküm gözeneksiz, temiz' },
      { key: 'fit_ok',     label: 'Model üstü uyum kontrol' },
    ],
  },
  WASH_CURE: {
    kind: 'WASH_CURE', phase: 'POST_PROCESS',
    eyebrow: 'Wash / Cure', ctaLabel: 'Yıkama & Cure Tamam',
    icon: Droplets, hasCustomWorkspace: false,
    validation: [
      { key: 'washed',     label: 'Yıkama tamamlandı', hint: 'IPA / temizlik' },
      { key: 'cured',      label: 'Cure süresi tamam' },
      { key: 'no_residue', label: 'Yüzeyde reçine kalıntısı yok' },
    ],
  },
  SINTER: {
    kind: 'SINTER', phase: 'POST_PROCESS',
    eyebrow: 'Sinterleme', ctaLabel: 'Sinteri Tamamla',
    waitingHint: 'Fırın programı önceki aşamadan sonra çalışacak.',
    icon: Flame, hasCustomWorkspace: false,
    validation: [
      { key: 'cleaned',      label: 'Yapılar temizlendi' },
      { key: 'furnace_set',  label: 'Fırın programı doğru' },
      { key: 'sinter_done',  label: 'Sinterleme tamamlandı' },
      { key: 'shrinkage_ok', label: 'Çekme kontrol edildi' },
    ],
  },
  PORCELAIN: {
    kind: 'PORCELAIN', phase: 'POST_PROCESS',
    eyebrow: 'Porselen & Make-up', ctaLabel: 'Porseleni Tamamla',
    icon: Brush, hasCustomWorkspace: false,
    validation: [
      { key: 'porcelain_applied', label: 'Porselen uygulandı' },
      { key: 'anatomy_ok',        label: 'Form anatomik' },
      { key: 'shade_match',       label: 'Renk uyumu doğru' },
    ],
  },
  GLAZE: {
    kind: 'GLAZE', phase: 'POST_PROCESS',
    eyebrow: 'Glaze', ctaLabel: 'Glaze Tamamla',
    icon: Sparkles, hasCustomWorkspace: false,
    validation: [
      { key: 'glaze_applied', label: 'Glazür uygulandı' },
      { key: 'surface_ok',    label: 'Yüzey parlak ve homojen' },
    ],
  },
  POLISH: {
    kind: 'POLISH', phase: 'POST_PROCESS',
    eyebrow: 'Polisaj', ctaLabel: 'Cilayı Tamamla',
    icon: Paintbrush, hasCustomWorkspace: false,
    validation: [
      { key: 'polish_applied', label: 'Cila uygulandı' },
      { key: 'surface_smooth', label: 'Yüzey pürüzsüz' },
    ],
  },
  IMPLANT_MOUNT: {
    kind: 'IMPLANT_MOUNT', phase: 'POST_PROCESS',
    eyebrow: 'İmplant Montajı', ctaLabel: 'Montajı Onayla',
    icon: Wrench, hasCustomWorkspace: false,
    validation: [
      { key: 'abutment_ok', label: 'Abutman bağlantı doğru' },
      { key: 'torque_ok',   label: 'Tork değeri uygun' },
      { key: 'screw_ok',    label: 'Vida sıkı, oturmuş' },
    ],
  },
  QC: {
    kind: 'QC', phase: 'FINALIZATION',
    eyebrow: 'Kalite Kontrol', ctaLabel: "QC'yi Onayla",
    icon: ShieldCheck, hasCustomWorkspace: true,
    validation: [
      { key: 'visual',     label: 'Görsel — yüzey, renk, kırık' },
      { key: 'fit',        label: 'Uyum testi (oklüzyon + kontak)' },
      { key: 'shade',      label: 'Renk eşleşmesi' },
      { key: 'packaging',  label: 'Paketleme tamam', required: false },
    ],
    fileCategories: [{
      title: 'Kalite Kontrol',
      color: '#0F172A',
      items: [
        { label: 'QC Önce Foto', kind: 'image' },
        { label: 'QC Sonra Foto', kind: 'image' },
        { label: 'Renk Eşleşme Foto', kind: 'image' },
        { label: 'QC Raporu', kind: 'pdf' },
      ],
    }],
  },
  PACKAGING: {
    kind: 'PACKAGING', phase: 'FINALIZATION',
    eyebrow: 'Paketleme', ctaLabel: 'Paketlemeyi Tamamla',
    icon: Box, hasCustomWorkspace: false,
    validation: [
      { key: 'label_ok',    label: 'Etiket doğru basıldı' },
      { key: 'documents',   label: 'Belgeler kutuya konuldu' },
      { key: 'box_ok',      label: 'Kutu kapalı, temiz' },
    ],
  },
  READY: {
    kind: 'READY', phase: 'FINALIZATION',
    eyebrow: 'Teslime Hazır', ctaLabel: 'Teslime Hazırla',
    icon: CircleCheck, hasCustomWorkspace: false,
    validation: [
      { key: 'logged',     label: 'Çıkış kaydı oluşturuldu' },
      { key: 'notified',   label: 'Kurye/hekim bilgilendirildi', required: false },
    ],
  },
  GENERIC: {
    kind: 'GENERIC', phase: 'PRODUCTION',
    eyebrow: 'İş İstasyonu', ctaLabel: 'Tamamla & İlerlet',
    icon: Wrench, hasCustomWorkspace: false,
    validation: [
      { key: 'done', label: 'İşlem tamamlandı' },
    ],
  },
};

export function getStationDescriptor(name?: string | null): StationDescriptor {
  return STATION_REGISTRY[getStationKind(name)];
}

/**
 * Tüm istasyonların aşama-çıktısı dosya kategorilerinin birleşimi (başlığa göre
 * deduped). Sipariş-detayı dosya modalında kullanılır — belirli bir aşamaya bağlı
 * olmadan tüm üretim çıktısı yükleme slotları (Tasarım Çıktıları, Frezeleme, 3D
 * Baskı, QC vb.) her zaman erişilebilir olsun diye.
 */
export function allStationFileCategories(): FileCategoryGroup[] {
  const seen = new Set<string>();
  const out: FileCategoryGroup[] = [];
  for (const d of Object.values(STATION_REGISTRY)) {
    for (const g of (d.fileCategories ?? [])) {
      if (!seen.has(g.title)) { seen.add(g.title); out.push(g); }
    }
  }
  return out;
}
