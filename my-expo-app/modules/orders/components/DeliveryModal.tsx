// modules/orders/components/DeliveryModal.tsx
// "Kuryeye Gönder" — manager/admin bir siparişi internal kurye veya external firmaya gönderir.

import React, { useEffect, useState } from 'react';
import {
  View, Text, Pressable, Modal, TextInput, Platform, ScrollView,
} from 'react-native';
import { Truck, User, Building2, X, Check, Search, MapPin, Calendar, Package, Shield, Bike, CreditCard, Banknote, ChevronDown } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { createDelivery, DELIVERY_PURPOSE_LABELS, type DeliveryPurpose, type DeliveryDirection } from '../api';
import { useBaseCurrency, CURRENCY_META } from '../../../core/money/currency';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { searchPlaces, getPlaceDetails, type PlaceSuggestion } from '../../auth/api/places';
import { BanaBiKuryeLogo } from './BanaBiKuryeLogo';
import { FilterMenu } from '../../../core/ui/FilterMenu';

interface CourierOption { id: string; full_name: string; }

interface Props {
  visible:     boolean;
  workOrderId: string;
  labId:       string;
  onClose:     () => void;
  onCreated:   (deliveryId: string) => void;
  accentColor?: string;
  /** Teslim şekli "kargo" → sadece dış kargo; iç kurye seçeneği gizlenir. */
  lockExternal?: boolean;
  /** Verilirse: BanaBiKurye DÜZENLEME modu — mevcut siparişin adresi/notu /edit-order ile güncellenir. */
  editDelivery?: { id: string; orderId: string } | null;
  /**
   * true → ARA kurye hareketi (eksik parça, model alma, prova, iade...).
   * Amaç + yön seçimi açılır. false/verilmezse klasik final teslimat akışı.
   */
  extraLeg?: boolean;
  /** Çağrı anındaki üretim aşaması adı — kayda snapshot olarak yazılır. */
  stageSnapshot?: string | null;
}

const PROVIDERS = ['MNG Kargo', 'Aras Kargo', 'Sürat Kargo', 'Yurtiçi Kargo', 'PTT Kargo', 'UPS', 'Diğer'];

// ── BanaBiKurye gönderi seçenekleri (panel formunun karşılığı) ──
// NOT: Sağlayıcının tüketici panelindeki "60 Dakika / 1-2 saat" hız kartları
// Business API 1.8'de AYRI bir alan DEĞİL. API'nin desteklediği gerçek seçenekler:
// type (standard | endofday) + zaman penceresi (required_*_datetime). Kartlar bunlara maplenir.
const BBK_SERVICES = [
  { id: 'standard'  as const, label: 'Standart',      desc: 'Yakındaki kurye en kısa sürede teslim alır ve götürür.' },
  { id: 'endofday'  as const, label: 'Gün sonu',      desc: 'Aynı gün içinde otomatik rota ile daha ekonomik teslim.', badge: 'Ekonomik' },
  { id: 'scheduled' as const, label: 'İleri zamanlı', desc: 'Belirlediğin tarih-saatte teslim edilir.' },
];
type BbkService = typeof BBK_SERVICES[number]['id'];
const BBK_WEIGHTS = [2, 5, 10, 15, 20];
const BBK_CONTENT_TAGS = ['Lab sarf malzemesi', 'Model', 'Ölçü', 'Diğer'];
// vehicle_type_id: 8 = motor (belgeli). Araba id'si henüz doğrulanmadı → devre dışı.
const BBK_VEHICLES = [
  { id: 8,  label: 'Motor', cap: '20 kg’a kadar',  enabled: true },
  { id: -1, label: 'Araba', cap: '200 kg’a kadar', enabled: false },
];

/** Edge fonksiyonun debug gövdesini okunabilir metne çevirir (yoksa null). */
function fmtDebug(data: any): string | null {
  const d = data?.debug;
  if (!d) return null;
  try {
    return [
      d.status != null ? 'HTTP ' + d.status : null,
      d.resp ? 'Cevap: ' + JSON.stringify(d.resp) : null,
      d.sent ? 'Gönderilen: ' + JSON.stringify(d.sent) : null,
    ].filter(Boolean).join('\n\n');
  } catch { return null; }
}

/** "YYYY-MM-DDTHH:mm" (datetime-local) → ISO 8601 +03:00; opsiyonel saat ekle. */
function trIso(local: string, addHours = 0): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]) + addHours, Number(m[5]));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00+03:00`;
}

interface BbkBreakdown {
  delivery: number | null; weight: number | null; insurance: number | null; loading: number | null;
  money_transfer: number | null; cod: number | null; return: number | null; waiting: number | null;
}

const SECTION_LBL = { fontSize: 11, fontWeight: '700' as const, color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' as const };

/**
 * Kurye çağırma nedenleri.
 *
 * 'teslimat' ÖNCEDEN bu listede yoktu — "final akışa ait" diye çıkarılmıştı.
 * Ama Lojistik kartındaki giriş noktası genel bir "Kurye çağır"; en sık sebep
 * olan "biten işi kliniğe gönder" oradan hiç seçilemiyordu. Artık listenin
 * başında ve varsayılan seçim.
 *
 * Seçilmesinin karşılığı var: sipariş detayı `purpose='teslimat'` olan bacağı
 * siparişin FİNAL teslimatı sayar (zaman çizelgesindeki Kurye aşamasını besler).
 * O yüzden ara hareketlerden ayrı bir grupta duruyor ve ne yaptığını yazıyor.
 */
const FINAL_PURPOSE: DeliveryPurpose = 'teslimat';
const EXTRA_PURPOSES: DeliveryPurpose[] = ['eksik_parca', 'model_alma', 'prova_gidis', 'prova_donus', 'iade', 'diger'];

/** Her amacın doğal yönü — kullanıcı yine de değiştirebilir. */
const DEFAULT_DIRECTION: Record<DeliveryPurpose, DeliveryDirection> = {
  teslimat:    'lab_to_clinic',
  prova_gidis: 'lab_to_clinic',
  eksik_parca: 'clinic_to_lab',
  model_alma:  'clinic_to_lab',
  prova_donus: 'clinic_to_lab',
  iade:        'clinic_to_lab',
  diger:       'lab_to_clinic',
};

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
// Teknik detay bloğu: hizalı JSON için tek-aralıklı yüz.
const FONT_MONO = Platform.OS === 'ios' ? 'Menlo' : Platform.OS === 'android' ? 'monospace' : 'ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * Tek seçimli büyük kart — başlık + açıklama + tik.
 * Seçili durum yalnız renkle değil TİKLE de anlatılır; renk körlüğünde ve
 * düşük kontrastlı ekranda da okunur.
 */
function SelectCard({ selected, accent, icon: Icon, title, desc, onPress }: {
  selected: boolean; accent: string; icon: any; title: string; desc: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        padding: 14, borderRadius: 16,
        borderWidth: 1.5, borderColor: selected ? accent : 'rgba(0,0,0,0.10)',
        backgroundColor: selected ? `${accent}0F` : '#FFF',
        opacity: pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
        ...webCursor,
      })}
    >
      <View style={{
        width: 34, height: 34, borderRadius: 999,
        backgroundColor: selected ? `${accent}1F` : 'rgba(0,0,0,0.05)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color={selected ? accent : '#6B6B6B'} strokeWidth={1.9} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#0A0A0A' }}>{title}</Text>
        <Text style={{ fontSize: 11.5, color: '#6B6B6B', lineHeight: 16 }}>{desc}</Text>
      </View>
      <View style={{
        width: 20, height: 20, borderRadius: 999,
        borderWidth: selected ? 0 : 1.5, borderColor: 'rgba(0,0,0,0.15)',
        backgroundColor: selected ? accent : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {selected ? <Check size={12} color="#FFF" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

/** İki/üç seçenekli raylı segment — modal genelinde tek "seçim" dili. */
function SegmentRow({ items, value, onChange, accent }: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  accent: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, padding: 3, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.05)' }}>
      {items.map(it => {
        const on = it.id === value;
        return (
          <Pressable
            key={it.id}
            onPress={() => onChange(it.id)}
            style={({ pressed }: any) => ({
              flex: 1, alignItems: 'center', justifyContent: 'center',
              paddingVertical: 9, borderRadius: 999,
              backgroundColor: on ? '#FFF' : 'transparent',
              // @ts-ignore web
              boxShadow: on ? '0 1px 3px rgba(0,0,0,0.10)' : undefined,
              opacity: pressed && !on ? 0.55 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              ...webCursor,
            })}
          >
            <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', color: on ? accent : '#6B6B6B' }}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Katlanabilir bölüm — başlıkta seçili değerlerin özeti durur.
 *
 * Kapalıyken bilgi KAYBOLMAZ: "Motor · 2 kg · Lab sarf malzemesi · Nakit"
 * satırı ne ayarlandığını söyler, açmak yalnız değiştirmek için gerekir.
 * Sık kullanılan yol önce, ayrıntı bir seviye geride.
 */
function Disclosure({ open, onToggle, title, summary, accent, children }: {
  open: boolean; onToggle: () => void; title: string; summary: string;
  accent: string; children: React.ReactNode;
}) {
  return (
    <View style={{
      borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
      backgroundColor: '#FFF', overflow: 'hidden',
    }}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 14, paddingVertical: 12,
          backgroundColor: pressed ? 'rgba(0,0,0,0.03)' : 'transparent',
          ...webCursor,
        })}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0A0A0A' }}>{title}</Text>
          {!open ? (
            <Text numberOfLines={1} style={{ fontSize: 11, color: '#6B6B6B' }}>{summary}</Text>
          ) : null}
        </View>
        <Text style={{ fontSize: 11.5, fontWeight: '600', color: accent }}>
          {open ? 'Gizle' : 'Değiştir'}
        </Text>
        <ChevronDown
          size={15}
          color={accent}
          strokeWidth={2.2}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] } as any}
        />
      </Pressable>
      {open ? (
        <View style={{ padding: 14, paddingTop: 4, gap: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** Kurye sağlayıcı kartı — üçü de aynı anatomi: ikon yuvası + etiket. */
function ModeCard({ selected, accent, icon: Icon, label, brand, onPress }: {
  selected: boolean; accent: string; icon?: any; label: string;
  brand?: React.ReactNode; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: any) => ({
        flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 14,
        borderWidth: 1.5, borderColor: selected ? accent : 'rgba(0,0,0,0.10)',
        backgroundColor: selected ? `${accent}0F` : '#FFF',
        alignItems: 'center', justifyContent: 'center', gap: 6,
        opacity: pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        ...webCursor,
      })}
    >
      <View style={{ height: 20, alignItems: 'center', justifyContent: 'center' }}>
        {brand
          ? <View style={{ opacity: selected ? 1 : 0.4 }}>{brand}</View>
          : <Icon size={18} color={selected ? accent : '#6B6B6B'} strokeWidth={1.8} />}
      </View>
      <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: selected ? '700' : '500', color: selected ? accent : '#6B6B6B' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function DeliveryModal({ visible, workOrderId, labId, onClose, onCreated, accentColor = '#0A0A0A', lockExternal = false, editDelivery = null, extraLeg = false, stageSnapshot = null }: Props) {
  const [mode, setMode]         = useState<'internal' | 'external' | 'banabikurye'>('external');
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [courierId, setCourierId] = useState<string | null>(null);
  const [provider, setProvider]   = useState<string>('');
  const [tracking, setTracking]   = useState<string>('');
  const [notes, setNotes]         = useState<string>('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  // BanaBiKurye akışı: önce fiyat hesapla, sonra onayla & çağır
  const [bbkPrice, setBbkPrice]   = useState<string | null>(null);
  const [bbkBusy, setBbkBusy]     = useState(false);
  const [bbkBreakdown, setBbkBreakdown] = useState<BbkBreakdown | null>(null);
  // BanaBiKurye gönderi seçenekleri (panel formu)
  // Edge fonksiyonu hata durumunda { debug: { status, resp, sent } } döndürür.
  // Kullanıcıya "unexpected_error" gibi ham API metni gösterildiğinde hangi
  // alanın reddedildiği görünmüyordu → istek üzerine açılan detay bloğu.
  const [errDetail, setErrDetail] = useState<string | null>(null);
  const [errOpen, setErrOpen]     = useState(false);
  const [bbkService, setBbkService]   = useState<BbkService>('standard');
  const [bbkVehicleId, setBbkVehicleId] = useState<number>(8);
  const [bbkWeight, setBbkWeight]     = useState<number>(2);
  const [bbkContent, setBbkContent]   = useState<string>('Lab sarf malzemesi');
  const [bbkInsurance, setBbkInsurance] = useState<string>('');
  const [bbkPromo, setBbkPromo]       = useState<string>('');
  const [bbkSched, setBbkSched]       = useState<string>(''); // "YYYY-MM-DDTHH:mm"
  const [bbkRecipient, setBbkRecipient] = useState<string>('');   // alıcı adı override
  const [bbkRecPhone, setBbkRecPhone] = useState<string>('');     // alıcı telefon override
  const [bbkBuildingNo, setBbkBuildingNo] = useState<string>('');
  const [bbkFloor, setBbkFloor]       = useState<string>('');
  const [bbkApartment, setBbkApartment] = useState<string>('');
  const [bbkIntercom, setBbkIntercom] = useState<string>('');
  const [bbkLoaders, setBbkLoaders]   = useState<boolean>(false); // yükleme/boşaltma gerekiyor
  const [bbkNotify, setBbkNotify]     = useState<boolean>(true);  // SMS ile alıcıyı bildir
  // Ödeme şekli — BİLİNÇLİ olarak varsayılansız (null).
  // Eskiden 'cash' varsayılanıyla ve katlanmış "Gönderi ayrıntıları" içinde
  // duruyordu; kullanıcı bölümü hiç açmadan gönderdiğinde ücret sessizce
  // nakde yazılıyordu. Para hareketi olan bir alanın sessiz varsayılanı olmamalı.
  const [bbkPayment, setBbkPayment]   = useState<'cash' | 'bank_card' | null>(null);
  const [bbkBankCards, setBbkBankCards] = useState<{ id: number; name: string | null; last4: string | null; brand: string | null }[]>([]);
  const [bbkBankCardId, setBbkBankCardId] = useState<number | null>(null);
  const [bbkCardsLoading, setBbkCardsLoading] = useState<boolean>(false);
  // Ayrıntılar varsayılan KAPALI — çoğu gönderide hiç dokunulmuyor.
  const [bbkMoreOpen, setBbkMoreOpen] = useState(false);
  // Aynı kuryeyle gruplama: aynı hekime ait, teslime hazır diğer işler (aynı klinik → tek durak, tek ücret)
  const [siblings, setSiblings] = useState<{ id: string; order_number: string | null; patient_name: string | null; status: string }[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  // Google Places adres arama + onay (BanaBiKurye teslim adresi) — client-side places modülü
  const [addrQuery, setAddrQuery]       = useState('');
  const [addrResults, setAddrResults]   = useState<PlaceSuggestion[]>([]);
  const [addrSelected, setAddrSelected] = useState<{ name: string; address: string; lat: string | null; lng: string | null; phone: string } | null>(null);
  const [addrSearching, setAddrSearching] = useState(false);
  // Ara hareket: amaç + yön + ücret (masraf her zaman lab gideri, işe yazılır)
  const [purpose, setPurpose]     = useState<DeliveryPurpose>('teslimat');
  const [direction, setDirection] = useState<DeliveryDirection>('lab_to_clinic');
  const [fee, setFee]             = useState<string>('');
  const baseCurrency = useBaseCurrency();
  const feeSymbol = CURRENCY_META[baseCurrency]?.symbol ?? baseCurrency;

  /** Katlanmış "Gönderi ayrıntıları" başlığında görünen özet — hiçbir ayar saklı kalmasın. */
  const bbkSummary = [
    BBK_VEHICLES.find(v => v.id === bbkVehicleId)?.label ?? 'Motor',
    `${bbkWeight} kg`,
    bbkContent,
    // Ödeme şekli bilerek burada YOK — katlanır özetin değil, kendi zorunlu
    // bloğunun konusu (aşağıya taşındı).
    bbkInsurance.trim() ? `Güvence ${bbkInsurance.trim()}` : null,
    bbkPromo.trim() ? `Kod ${bbkPromo.trim()}` : null,
    bbkLoaders ? 'Yükleme yardımı' : null,
    bbkNotify ? null : 'SMS kapalı',
  ].filter(Boolean).join(' · ');

  /** "1.250,50" / "1250.5" → 1250.5 ; boş/geçersiz → null */
  function parseFee(raw: string): number | null {
    const s = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return isNaN(n) || n < 0 ? null : n;
  }

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBbkPrice(null);
    setBbkBreakdown(null);
    setBbkService('standard'); setBbkVehicleId(8); setBbkWeight(2);
    setBbkContent('Lab sarf malzemesi'); setBbkInsurance(''); setBbkPromo(''); setBbkSched('');
    setBbkRecipient(''); setBbkRecPhone(''); setBbkBuildingNo(''); setBbkFloor('');
    setBbkApartment(''); setBbkIntercom(''); setBbkLoaders(false); setBbkNotify(true);
    setBbkPayment('cash'); setBbkBankCards([]); setBbkBankCardId(null); setBbkCardsLoading(false);
    setBbkMoreOpen(false);
    setFee('');
    // Varsayılan her iki akışta da 'teslimat' — en sık sebep bu.
    setPurpose('teslimat');
    setDirection('lab_to_clinic');
    setAddrQuery(''); setAddrResults([]); setAddrSelected(null);
    setSiblings([]); setGroupIds([]);
    if (editDelivery) setMode('banabikurye');        // düzenleme → BanaBiKurye modu sabit
    else if (lockExternal) setMode('external');      // kargo → iç kurye kapalı
    // Adres aramasını siparişin klinik ünvanıyla ön-doldur
    (async () => {
      const { data: wo } = await supabase.from('work_orders').select('doctor_id').eq('id', workOrderId).maybeSingle();
      if (!wo?.doctor_id) return;
      const { data: doc } = await supabase.from('doctors').select('full_name, clinic_id').eq('id', wo.doctor_id).maybeSingle();
      let label = (doc as any)?.full_name ?? '';
      const clinicId = (doc as any)?.clinic_id;
      if (clinicId) {
        const { data: cl } = await supabase.from('clinics').select('name').eq('id', clinicId).maybeSingle();
        if ((cl as any)?.name) label = (cl as any).name;
      }
      if (label) setAddrQuery(label);
    })();
    // Aynı kuryeyle gruplama: aynı hekime ait, teslime hazır, aktif teslimatı olmayan
    // diğer işleri getir (final teslimat akışı; ara hareket/düzenleme'de gizli).
    if (!extraLeg && !editDelivery) {
      (async () => {
        const { data: wo } = await supabase.from('work_orders').select('doctor_id').eq('id', workOrderId).maybeSingle();
        if (!(wo as any)?.doctor_id) return;
        const { data: cand } = await supabase
          .from('work_orders')
          .select('id, order_number, patient_name, status')
          .eq('doctor_id', (wo as any).doctor_id)
          .in('status', ['teslimata_hazir', 'kurye_bekleniyor'])
          .neq('id', workOrderId)
          .order('created_at', { ascending: false })
          .limit(20);
        const list = ((cand ?? []) as any[]);
        if (!list.length) return;
        // Zaten aktif teslimatı (yolda/atanmış) olanları çıkar
        const { data: dels } = await supabase.from('deliveries').select('work_order_id, status').in('work_order_id', list.map((x) => x.id));
        const busy = new Set(((dels ?? []) as any[]).filter((d) => d.status !== 'teslim_edildi' && d.status !== 'iptal').map((d) => d.work_order_id));
        setSiblings(list.filter((x) => !busy.has(x.id)));
      })();
    }
    // Internal kurye listesi
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('user_type', 'lab')
      .eq('role', 'courier')
      .or(`id.eq.${labId},lab_id.eq.${labId}`)
      .then(({ data }) => setCouriers((data ?? []) as CourierOption[]));
  }, [visible, labId]);

  async function handleSubmit() {
    setError(null);
    if (mode === 'banabikurye') return; // BanaBiKurye kendi akışını kullanır (handleBbkCreate)
    if (mode === 'internal' && !courierId) { setError('Kurye seçin'); return; }
    if (mode === 'external' && !provider && !tracking) { setError('Firma veya takip no girin'); return; }
    setSaving(true);
    const res = await createDelivery({
      workOrderId,
      mode,
      courierId:          mode === 'internal' ? courierId ?? undefined : undefined,
      externalProvider:   mode === 'external' ? (provider || undefined) : undefined,
      externalTrackingNo: mode === 'external' ? (tracking || undefined) : undefined,
      notes:              notes.trim() || undefined,
      purpose,
      direction,
      feeAmount:     parseFee(fee),
      feeCurrency:   parseFee(fee) != null ? baseCurrency : null,
      feeSource:     'manuel',
      stageSnapshot: stageSnapshot ?? undefined,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'Oluşturulamadı'); return; }
    onCreated(res.deliveryId!);
    onClose();
  }

  // Google Places — klinik ünvanından adres ara (client-side, mevcut anahtar)
  async function handleAddrSearch() {
    const q = addrQuery.trim();
    if (q.length < 3) { setError('Arama için en az 3 karakter yaz.'); return; }
    setError(null); setAddrSearching(true);
    const results = await searchPlaces(q);
    setAddrSearching(false);
    setAddrResults(results);
    if (results.length === 0) setError('Eşleşen adres bulunamadı — ünvanı değiştir veya kayıtlı klinik adresi kullanılacak.');
  }

  // Aday seçildi → detay (adres+konum+telefon) çek
  async function handleSelectPlace(s: PlaceSuggestion) {
    setError(null); setAddrSearching(true);
    const det = await getPlaceDetails(s.placeId);
    setAddrSearching(false);
    if (!det || !det.formattedAddress) { setError('Adres detayı alınamadı, tekrar dene.'); return; }
    setAddrSelected({
      name: det.name || s.mainText,
      address: det.formattedAddress,
      lat: det.lat != null ? String(det.lat) : null,
      lng: det.lng != null ? String(det.lng) : null,
      phone: det.phone || '',
    });
    setAddrResults([]); setBbkPrice(null);
  }

  // Seçilen adres override'ını calculate/create body'sine ekler
  function destOverride() {
    if (!addrSelected) return {};
    return {
      dest_address: addrSelected.address,
      dest_lat: addrSelected.lat ?? undefined,
      dest_lng: addrSelected.lng ?? undefined,
      dest_phone: addrSelected.phone || undefined,
    };
  }

  // Gönderi seçeneklerini API body'sine çevirir. 'scheduled' UI kavramı →
  // API'de type:'standard' + zaman penceresi. Fiyatı etkileyen her alan değişince
  // önceki hesap geçersiz olur → çağıran taraf yeniden "Fiyat Hesapla" ister.
  function bbkOptions() {
    const svc = bbkService === 'scheduled' ? 'standard' : bbkService;
    const opts: Record<string, any> = {
      service_type: svc,
      vehicle_type_id: bbkVehicleId,
      total_weight_kg: bbkWeight,
      content_note: bbkContent || undefined,
    };
    const ins = parseFee(bbkInsurance);
    if (ins != null) opts.insurance_amount = ins;
    if (bbkPromo.trim()) opts.promo_code = bbkPromo.trim();
    if (bbkService === 'scheduled' && bbkSched) {
      const start = trIso(bbkSched);
      if (start) { opts.required_start_datetime = start; opts.required_finish_datetime = trIso(bbkSched, 2); }
    }
    if (bbkRecipient.trim()) opts.dest_name = bbkRecipient.trim();
    if (bbkRecPhone.trim())  opts.dest_phone = bbkRecPhone.trim(); // adres override'ın üstüne yazar
    if (bbkBuildingNo.trim()) opts.dest_building_no = bbkBuildingNo.trim();
    if (bbkFloor.trim())      opts.dest_floor = bbkFloor.trim();
    if (bbkApartment.trim())  opts.dest_apartment = bbkApartment.trim();
    if (bbkIntercom.trim())   opts.dest_intercom = bbkIntercom.trim();
    if (bbkLoaders) opts.loaders_count = 1;
    opts.notify_recipient = bbkNotify;
    opts.direction = direction; // alım/teslim ucunu belirler (klinikten alımda ters)
    if (bbkPayment === 'bank_card') {
      opts.payment_method = 'bank_card';
      if (bbkBankCardId != null) opts.bank_card_id = bbkBankCardId;
    }
    return opts;
  }

  // BanaBiKurye hesabının kayıtlı banka kartlarını çeker (bank_card ödemesi için).
  async function loadBankCards() {
    setBbkCardsLoading(true);
    try {
      const { data } = await supabase.functions.invoke('banabikurye-dispatch', { body: { action: 'bank_cards' } });
      const cards = (data as any)?.ok ? ((data as any).cards ?? []) : [];
      setBbkBankCards(cards);
      if (cards.length && bbkBankCardId == null) setBbkBankCardId(cards[0].id);
      if (!cards.length) setError('Kayıtlı banka kartı bulunamadı — BanaBiKurye hesabınızdan kart ekleyin.');
    } catch (e: any) { setError('Kartlar alınamadı: ' + (e?.message ?? '')); }
    setBbkCardsLoading(false);
  }

  // BanaBiKurye — fiyat hesapla (gerçek kurye çağrılmaz)
  async function handleBbkCalculate() {
    if (bbkService === 'scheduled' && !trIso(bbkSched)) { setError('İleri zamanlı için tarih-saat seçin.'); return; }
    // Ödeme şekli fiyat hesabına giriyor ve varsayılanı yok — seçilmeden geçilmez.
    if (bbkPayment == null) { setError('Ödeme şeklini seçin (nakit veya banka kartı).'); return; }
    if (bbkPayment === 'bank_card' && bbkBankCardId == null) {
      setError('Banka kartı ödemesi için kayıtlı bir kart seçin.'); return;
    }
    setError(null); setErrDetail(null); setErrOpen(false); setBbkBusy(true);
    const { data, error: err } = await supabase.functions.invoke('banabikurye-dispatch', {
      body: { action: 'calculate', work_order_id: workOrderId, extra_work_order_ids: groupIds.length ? groupIds : undefined, notes: notes.trim() || undefined, ...destOverride(), ...bbkOptions() },
    });
    setBbkBusy(false);
    if (err || !(data as any)?.ok) { setError((data as any)?.message ?? err?.message ?? 'Fiyat alınamadı'); setErrDetail(fmtDebug(data)); return; }
    setBbkPrice(String((data as any)?.price ?? '—'));
    setBbkBreakdown((data as any)?.breakdown ?? null);
  }

  // BanaBiKurye — çağrılmış siparişi düzenle (/edit-order): teslim adresi + not
  async function handleBbkEdit() {
    if (!editDelivery) return;
    setError(null); setErrDetail(null); setErrOpen(false); setBbkBusy(true);
    const { data, error: err } = await supabase.functions.invoke('banabikurye-dispatch', {
      body: { action: 'edit', order_id: editDelivery.orderId, notes: notes.trim() || undefined, ...destOverride() },
    });
    if (err || !(data as any)?.ok) { setBbkBusy(false); setError((data as any)?.message ?? err?.message ?? 'Düzenlenemedi'); setErrDetail(fmtDebug(data)); return; }
    // Yerel teslimat kaydının adresini güncelle (varsa)
    if (addrSelected) {
      await supabase.from('deliveries').update({ destination_address: addrSelected.address }).eq('id', editDelivery.id);
    }
    setBbkBusy(false);
    onCreated(editDelivery.id);
    onClose();
  }

  // BanaBiKurye — onayla & kurye çağır (gerçek/ücretli işlem)
  async function handleBbkCreate() {
    // İkinci kapı: "Fiyat Hesapla"dan sonra ödeme şekli sıfırlanmış olabilir.
    if (bbkPayment == null) { setError('Ödeme şeklini seçin (nakit veya banka kartı).'); return; }
    setError(null); setErrDetail(null); setErrOpen(false); setBbkBusy(true);
    const { data, error: err } = await supabase.functions.invoke('banabikurye-dispatch', {
      body: { action: 'create', work_order_id: workOrderId, extra_work_order_ids: groupIds.length ? groupIds : undefined, notes: notes.trim() || undefined, ...destOverride(), ...bbkOptions() },
    });
    if (err || !(data as any)?.ok) { setBbkBusy(false); setError((data as any)?.message ?? err?.message ?? 'Kurye çağrılamadı'); setErrDetail(fmtDebug(data)); return; }
    const orderId = (data as any)?.order_id ?? (data as any)?.order_name ?? null;
    // Ücret: create yanıtı fiyat döndürürse onu, yoksa hesaplanan fiyatı kaydet.
    // BanaBiKurye ₺ ile çalışır — para birimi TRY sabit, lab base'i değil.
    // API fiyatı ZATEN sayı (ör. 241.16) — parseFee TR-formatı ("1.234,56") için;
    // noktayı binlik sanıp siler → 241.16'yı 24116 yapardı (100× şişme bug'ı). Number kullan.
    const apiPrice = (data as any)?.price ?? bbkPrice;
    const apiPriceNum = apiPrice != null ? Number(apiPrice) : NaN;
    const bbkFee = (!isNaN(apiPriceNum) && apiPriceNum >= 0) ? apiPriceNum : null;
    // Teslimat kaydı — external (banabikurye) + takip no = BanaBiKurye order_id
    const res = await createDelivery({
      workOrderId,
      mode: 'external',
      externalProvider: 'BanaBiKurye',
      externalTrackingNo: orderId ? String(orderId) : undefined,
      notes: notes.trim() || undefined,
      purpose,
      direction,
      feeAmount:     bbkFee,
      feeCurrency:   bbkFee != null ? 'TRY' : null,
      feeSource:     bbkFee != null ? 'banabikurye' : undefined,
      stageSnapshot: stageSnapshot ?? undefined,
    });
    if (!res.ok) { setBbkBusy(false); setError('Kurye çağrıldı ama teslimat kaydı oluşmadı: ' + (res.error ?? '')); return; }
    // Aynı kuryeyle giden ek işler: her biri için AYRI teslimat satırı — aynı takip no
    // (kurye/durum takip handler'ında external_tracking_no ile hepsine yayılır),
    // ÜCRET YOK (fee null → gider trigger'ı satır oluşturmaz, tek gider birincilde kalır).
    if (groupIds.length) {
      for (const wid of groupIds) {
        await createDelivery({
          workOrderId: wid,
          mode: 'external',
          externalProvider: 'BanaBiKurye',
          externalTrackingNo: orderId ? String(orderId) : undefined,
          notes: notes.trim() || undefined,
          purpose,
          direction,
          feeAmount: null,
          feeCurrency: null,
          stageSnapshot: stageSnapshot ?? undefined,
        });
      }
    }
    setBbkBusy(false);
    onCreated(res.deliveryId!);
    onClose();
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={() => { /* swallow */ }}
          style={{
            width: '100%', maxWidth: 520,
            backgroundColor: '#FFFFFF', borderRadius: 20,
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(15,23,42,0.20)' } as any : {}),
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(234,122,76,0.12)' }}>
              <Truck size={18} color={accentColor} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1, textTransform: 'uppercase' }}>
                {/* Başlık üstü artık seçilen nedeni yansıtır — "Ara kurye
                    hareketi" sabitti, teslimat seçilince yanlış oluyordu. */}
                {editDelivery ? 'Teslimat'
                  : extraLeg ? (purpose === FINAL_PURPOSE ? 'Final teslimat' : 'Ara kurye hareketi')
                  : 'Teslimat'}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#0A0A0A' }}>
                {editDelivery ? 'Teslimatı Düzenle' : extraLeg ? 'Kurye Çağır' : 'Kuryeye Gönder'}
              </Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
              <X size={14} color="#6B6B6B" />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ padding: 22, paddingBottom: 28, gap: 18 }}>
            {/* Ara hareket — amaç + yön (final teslimatta gizli) */}
            {extraLeg && !editDelivery && (
              <View style={{ gap: 14 }}>
                <View style={{ gap: 8 }}>
                  <Text style={SECTION_LBL}>Neden</Text>

                  {/* En sık sebep önce, tek başına ve ne yaptığını yazarak.
                      Diğerleri altında kompakt ızgarada — hiçbiri gizlenmiyor,
                      yalnız sıra doğru. */}
                  <SelectCard
                    selected={purpose === FINAL_PURPOSE}
                    accent={accentColor}
                    icon={Package}
                    title="Teslimat"
                    desc="Biten işi kliniğe gönder · siparişin final teslimatı olarak kaydedilir"
                    onPress={() => { setPurpose(FINAL_PURPOSE); setDirection(DEFAULT_DIRECTION.teslimat); setBbkPrice(null); setBbkBreakdown(null); }}
                  />

                  <Text style={{ fontSize: 10.5, color: '#9A9A9A', marginTop: 2 }}>Ara hareket</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {EXTRA_PURPOSES.map(p => {
                      const on = purpose === p;
                      return (
                        <Pressable
                          key={p}
                          onPress={() => { setPurpose(p); setDirection(DEFAULT_DIRECTION[p]); setBbkPrice(null); setBbkBreakdown(null); }}
                          style={({ pressed }: any) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            paddingLeft: on ? 9 : 12, paddingRight: 12, paddingVertical: 8,
                            borderRadius: 999,
                            borderWidth: 1, borderColor: on ? accentColor : 'rgba(0,0,0,0.10)',
                            backgroundColor: on ? `${accentColor}14` : '#FFF',
                            opacity: pressed ? 0.6 : 1,
                            transform: [{ scale: pressed ? 0.97 : 1 }],
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          })}
                        >
                          {on ? <Check size={12} color={accentColor} strokeWidth={3} /> : null}
                          <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? accentColor : '#3C3C3C' }}>
                            {DELIVERY_PURPOSE_LABELS[p]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={SECTION_LBL}>Yön</Text>
                  <SegmentRow
                    accent={accentColor}
                    value={direction}
                    onChange={(v) => { setDirection(v as DeliveryDirection); setBbkPrice(null); setBbkBreakdown(null); }}
                    items={[
                      { id: 'lab_to_clinic', label: 'Lab → Klinik' },
                      { id: 'clinic_to_lab', label: 'Klinik → Lab' },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* Mode segment — Bizim Kurye (lockExternal ise gizli) / Dış Kargo / BanaBiKurye */}
            {!editDelivery && (
            <View style={{ gap: 8 }}>
              <Text style={SECTION_LBL}>Kim götürsün</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {!lockExternal && (
                  <ModeCard
                    selected={mode === 'internal'}
                    accent={accentColor}
                    icon={User}
                    label="Bizim Kurye"
                    onPress={() => { setMode('internal'); setBbkPrice(null); setError(null); }}
                  />
                )}
                <ModeCard
                  selected={mode === 'external'}
                  accent={accentColor}
                  icon={Building2}
                  label="Dış Kargo"
                  onPress={() => { setMode('external'); setBbkPrice(null); setError(null); }}
                />
                {/* BanaBiKurye kardeşleriyle aynı anatomiyi taşır (ikon yuvası +
                    etiket satırı). Marka sözcük-işareti seçili değilken sönük,
                    seçilince tam renkli — sessiz seçenek, canlanan seçim. */}
                <ModeCard
                  selected={mode === 'banabikurye'}
                  accent={accentColor}
                  label="Entegre"
                  brand={<BanaBiKuryeLogo width={84} height={16} />}
                  onPress={() => { setMode('banabikurye'); setBbkPrice(null); setError(null); }}
                />
              </View>
            </View>
            )}

            {/* Internal — courier list */}
            {mode === 'internal' && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>Kurye</Text>
                {couriers.length === 0 ? (
                  <Text style={{ fontSize: 12, color: '#9A9A9A', padding: 12, backgroundColor: '#F4F8FC', borderRadius: 10 }}>
                    Tanımlı kurye yok. Ayarlar → Kullanıcılar'dan rolü "Kurye" olan kullanıcı ekleyin.
                  </Text>
                ) : (
                  couriers.map(c => (
                    <Pressable
                      key={c.id}
                      onPress={() => setCourierId(c.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        padding: 12, borderRadius: 12,
                        borderWidth: 1, borderColor: courierId === c.id ? accentColor : 'rgba(0,0,0,0.06)',
                        backgroundColor: courierId === c.id ? `${accentColor}08` : '#FFF',
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '22' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: accentColor }}>{c.full_name?.[0] ?? '?'}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#0A0A0A' }}>{c.full_name}</Text>
                      {courierId === c.id && <Check size={16} color={accentColor} strokeWidth={2.4} />}
                    </Pressable>
                  ))
                )}
              </View>
            )}

            {/* External — provider + tracking */}
            {mode === 'external' && (
              <View style={{ gap: 12 }}>
                {/* 7 firma pill olarak iki satır kaplıyordu. Seçili firma
                    tetikleyicide okunur, liste bir tık geride. */}
                <View style={{ gap: 8 }}>
                  <Text style={SECTION_LBL}>Kargo Firması</Text>
                  <View style={{ alignSelf: 'flex-start' }}>
                    <FilterMenu
                      label="Firma"
                      items={[{ key: '', label: 'Seçilmedi' }, ...PROVIDERS.map(p => ({ key: p, label: p }))]}
                      active={provider}
                      onChange={setProvider}
                      accent={accentColor}
                    />
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <Text style={SECTION_LBL}>Takip No (opsiyonel)</Text>
                  <TextInput
                    value={tracking}
                    onChangeText={setTracking}
                    placeholder="örn. 1234567890"
                    style={{
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)', borderRadius: 14,
                      paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
                      // @ts-ignore web
                      outlineWidth: 0,
                    }}
                  />
                </View>
              </View>
            )}

            {/* BanaBiKurye — fiyat hesapla → onayla → çağır */}
            {mode === 'banabikurye' && (
              <View style={{ gap: 10 }}>
                <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#F4F8FC', gap: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0A0A0A' }}>BanaBiKurye ile kurye çağır</Text>
                  <Text style={{ fontSize: 11.5, color: '#6B6B6B', lineHeight: 17 }}>
                    {direction === 'clinic_to_lab'
                      ? 'Alış hekim/klinik adresinden, teslim lab adresine. '
                      : 'Alış lab adresinden, teslim hekim/klinik adresine. '}
                    Önce fiyat hesaplanır; onayladığında gerçek kurye çağrılır (ücret lab'a aittir).
                  </Text>
                </View>

                {/* ── Aynı kuryeyle gönder: aynı hekime ait teslime hazır diğer işler ── */}
                {!editDelivery && siblings.length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Text style={SECTION_LBL}>Aynı Kuryeyle Gönder</Text>
                    <Text style={{ fontSize: 11, color: '#6B6B6B', lineHeight: 16 }}>
                      Aynı hekime ait teslime hazır işleri seç — tek kurye, tek ücret. Her iş kendi kaydında bu kuryeyi gösterir.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {siblings.map((sb) => {
                        const on = groupIds.includes(sb.id);
                        return (
                          <Pressable
                            key={sb.id}
                            onPress={() => setGroupIds((prev) => on ? prev.filter((x) => x !== sb.id) : [...prev, sb.id])}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 6,
                              paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10,
                              borderWidth: 1.5, borderColor: on ? accentColor : 'rgba(0,0,0,0.08)',
                              backgroundColor: on ? `${accentColor}0C` : '#FFF',
                            }}
                          >
                            {on
                              ? <Check size={13} color={accentColor} strokeWidth={2.6} />
                              : <Package size={13} color="#9A9A9A" strokeWidth={1.8} />}
                            <Text style={{ fontSize: 12, fontWeight: '700', color: on ? accentColor : '#0A0A0A' }}>
                              #{sb.order_number ?? '—'}
                            </Text>
                            {!!sb.patient_name && (
                              <Text style={{ fontSize: 11, color: '#6B6B6B' }}>· {sb.patient_name}</Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                    {groupIds.length > 0 && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: accentColor }}>
                        {groupIds.length + 1} iş tek gönderide birleştirilecek.
                      </Text>
                    )}
                  </View>
                )}

                {/* ── Gönderi seçenekleri (düzenlemede gizli) ── */}
                {!editDelivery && (
                  <>
                    {/* Servis / hız */}
                    <View style={{ gap: 8 }}>
                      <Text style={SECTION_LBL}>Gönderi Türü</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {BBK_SERVICES.map(s => {
                          const on = bbkService === s.id;
                          return (
                            <Pressable
                              key={s.id}
                              onPress={() => { setBbkService(s.id); setBbkPrice(null); setBbkBreakdown(null); }}
                              style={{
                                flexGrow: 1, flexBasis: '30%', minWidth: 130, padding: 11, borderRadius: 12, gap: 4,
                                borderWidth: 1.5, borderColor: on ? accentColor : 'rgba(0,0,0,0.08)',
                                backgroundColor: on ? `${accentColor}0C` : '#FFF',
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 12.5, fontWeight: '800', color: on ? accentColor : '#0A0A0A' }}>{s.label}</Text>
                                {s.badge && (
                                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: '#16A34A18' }}>
                                    <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#16A34A' }}>{s.badge}</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={{ fontSize: 10.5, color: '#6B6B6B', lineHeight: 14 }}>{s.desc}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* İleri zamanlı → tarih-saat */}
                    {bbkService === 'scheduled' && (
                      <View style={{ gap: 6 }}>
                        <Text style={SECTION_LBL}>Teslim Zamanı</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accentColor}10` }}>
                            <Calendar size={16} color={accentColor} strokeWidth={1.8} />
                          </View>
                          {Platform.OS === 'web'
                            ? React.createElement('input', {
                                type: 'datetime-local',
                                value: bbkSched,
                                onChange: (e: any) => { setBbkSched(e.target.value); setBbkPrice(null); setBbkBreakdown(null); },
                                style: { flex: 1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit' },
                              })
                            : (
                              <TextInput
                                value={bbkSched}
                                onChangeText={(t) => { setBbkSched(t); setBbkPrice(null); setBbkBreakdown(null); }}
                                placeholder="2026-07-24T15:30"
                                style={{ flex: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, /* @ts-ignore */ outlineWidth: 0 }}
                              />
                            )}
                        </View>
                        <Text style={{ fontSize: 10.5, color: '#9A9A9A' }}>Kurye bu saatten itibaren ~2 saatlik pencerede teslim eder.</Text>
                      </View>
                    )}

                  </>
                )}

                {/* Teslim adresi — Google Places'ten ünvanla ara + onay (doğru adres) */}
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>{direction === 'clinic_to_lab' ? 'Alış Adresi (Klinik)' : 'Teslim Adresi'}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      value={addrQuery}
                      onChangeText={setAddrQuery}
                      placeholder="Klinik ünvanı / adres ara…"
                      onSubmitEditing={handleAddrSearch}
                      style={{ flex: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, /* @ts-ignore */ outlineWidth: 0 }}
                    />
                    <Pressable
                      onPress={handleAddrSearch}
                      disabled={addrSearching}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, borderRadius: 10, backgroundColor: `${accentColor}14`, borderWidth: 1, borderColor: `${accentColor}30`, opacity: addrSearching ? 0.6 : 1 }}
                    >
                      <Search size={14} color={accentColor} strokeWidth={2} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>{addrSearching ? '…' : 'Ara'}</Text>
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 10.5, color: '#9A9A9A' }}>Boş bırakırsan siparişin kliniği aranır. Seçmezsen kayıtlı klinik adresi kullanılır.</Text>

                  {/* Aday adresler (Google Places autocomplete) */}
                  {addrResults.map((rsp) => (
                    <Pressable
                      key={rsp.placeId}
                      onPress={() => handleSelectPlace(rsp)}
                      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF' }}
                    >
                      <MapPin size={14} color={accentColor} strokeWidth={1.8} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        {!!rsp.mainText && <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#0A0A0A' }}>{rsp.mainText}</Text>}
                        {!!rsp.secondaryText && <Text style={{ fontSize: 11.5, color: '#6B6B6B', lineHeight: 16 }}>{rsp.secondaryText}</Text>}
                      </View>
                    </Pressable>
                  ))}

                  {/* Seçili adres */}
                  {addrSelected && (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0C` }}>
                      <Check size={14} color={accentColor} strokeWidth={2.4} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: accentColor, letterSpacing: 0.4, textTransform: 'uppercase' }}>Seçili teslim adresi</Text>
                        <Text style={{ fontSize: 12, color: '#0A0A0A', lineHeight: 16, marginTop: 2 }}>{addrSelected.address}</Text>
                      </View>
                      <Pressable onPress={() => { setAddrSelected(null); setBbkPrice(null); }} hitSlop={8}>
                        <X size={14} color="#9A9A9A" />
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* ── Gönderi ayrıntıları ───────────────────────────────
                    Bu 9 grubun hepsinin makul bir varsayılanı var ve çoğu
                    nadiren değişir (motor, 2 kg, lab sarf malzemesi, nakit).
                    Hepsi açıkta dururken form 12 bloğa çıkıyor ve asıl iş olan
                    ADRES kalabalıkta kayboluyordu. Katlandı; mevcut değerler
                    başlıkta özetlendiği için hiçbir bilgi gizlenmiş olmuyor. ── */}
                {/* ── Ödeme şekli — ZORUNLU, katlanmaz ────────────────────
                    Kurye ücretinin nasıl ödeneceği para hareketi doğurur ve
                    fiyat hesabına girer; bu yüzden ne varsayılanı var ne de
                    "Gönderi ayrıntıları"nın içinde saklanıyor. Seçilmeden
                    "Fiyat Hesapla" çalışmaz. ── */}
                {!editDelivery && (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={SECTION_LBL}>Ödeme Şekli</Text>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#D94B4B' }}>zorunlu</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {([['cash', 'Nakit', Banknote], ['bank_card', 'Banka Kartı', CreditCard]] as const).map(([val, label, Ico]) => {
                        const on = bbkPayment === val;
                        return (
                          <Pressable
                            key={val}
                            onPress={() => {
                              setBbkPayment(val); setBbkPrice(null); setBbkBreakdown(null);
                              if (val === 'bank_card' && bbkBankCards.length === 0) loadBankCards();
                            }}
                            style={({ pressed }: any) => ({
                              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                              paddingVertical: 11, borderRadius: 12,
                              borderWidth: 1.5,
                              borderColor: on ? accentColor : bbkPayment == null ? 'rgba(217,75,75,0.45)' : 'rgba(0,0,0,0.08)',
                              backgroundColor: on ? `${accentColor}0C` : '#FFF',
                              opacity: pressed ? 0.7 : 1,
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                            })}
                          >
                            <Ico size={15} color={on ? accentColor : '#6B6B6B'} strokeWidth={1.8} />
                            <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '600', color: on ? accentColor : '#3C3C3C' }}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {bbkPayment == null ? (
                      <Text style={{ fontSize: 11, color: '#D94B4B' }}>
                        Kurye ücretinin nasıl ödeneceğini seçin — fiyat buna göre hesaplanır.
                      </Text>
                    ) : null}
                    {bbkPayment === 'bank_card' && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                        {bbkCardsLoading ? (
                          <Text style={{ fontSize: 11.5, color: '#9A9A9A' }}>Kartlar yükleniyor…</Text>
                        ) : bbkBankCards.length === 0 ? (
                          <Text style={{ fontSize: 11.5, color: '#9A9A9A' }}>Kayıtlı kart yok — BanaBiKurye hesabınızdan ekleyin.</Text>
                        ) : bbkBankCards.map((c) => {
                          const on = bbkBankCardId === c.id;
                          const lbl = [c.brand, c.last4 ? '•••• ' + c.last4 : (c.name ?? ('Kart ' + c.id))].filter(Boolean).join(' ');
                          return (
                            <Pressable
                              key={c.id}
                              onPress={() => { setBbkBankCardId(c.id); setBbkPrice(null); setBbkBreakdown(null); }}
                              style={{
                                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                                borderWidth: 1, borderColor: on ? accentColor : 'rgba(0,0,0,0.08)',
                                backgroundColor: on ? `${accentColor}10` : '#FFF',
                              }}
                            >
                              <Text style={{ fontSize: 11, fontWeight: '600', color: on ? accentColor : '#6B6B6B' }}>{lbl}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}

                {!editDelivery && (
                  <Disclosure
                    open={bbkMoreOpen}
                    onToggle={() => setBbkMoreOpen(v => !v)}
                    accent={accentColor}
                    title="Gönderi ayrıntıları"
                    summary={bbkSummary}
                  >
                    {/* Araç tipi */}
                    <View style={{ gap: 6 }}>
                      <Text style={SECTION_LBL}>Araç Tipi</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {BBK_VEHICLES.map(v => {
                          const on = bbkVehicleId === v.id && v.enabled;
                          return (
                            <Pressable
                              key={v.id}
                              disabled={!v.enabled}
                              onPress={() => { if (v.enabled) { setBbkVehicleId(v.id); setBbkPrice(null); setBbkBreakdown(null); } }}
                              style={{
                                flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 12,
                                borderWidth: 1.5, borderColor: on ? accentColor : 'rgba(0,0,0,0.08)',
                                backgroundColor: on ? `${accentColor}0C` : '#FFF',
                                opacity: v.enabled ? 1 : 0.5,
                              }}
                            >
                              {v.id === 8 ? <Bike size={18} color={on ? accentColor : '#6B6B6B'} strokeWidth={1.8} /> : <Truck size={18} color="#9A9A9A" strokeWidth={1.8} />}
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? accentColor : '#0A0A0A' }}>{v.label}</Text>
                                <Text style={{ fontSize: 10, color: '#9A9A9A' }}>{v.enabled ? v.cap : 'Yakında'}</Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    <View style={{ gap: 6 }}>
                      <Text style={SECTION_LBL}>Ağırlık</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {BBK_WEIGHTS.map(w => {
                          const on = bbkWeight === w;
                          return (
                            <Pressable
                              key={w}
                              onPress={() => { setBbkWeight(w); setBbkPrice(null); setBbkBreakdown(null); }}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                                borderWidth: 1, borderColor: on ? accentColor : 'rgba(0,0,0,0.08)',
                                backgroundColor: on ? `${accentColor}10` : '#FFF',
                              }}
                            >
                              <Text style={{ fontSize: 11.5, fontWeight: '700', color: on ? accentColor : '#6B6B6B' }}>{w} kg</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={{ gap: 6 }}>
                      <Text style={SECTION_LBL}>İçerik</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {BBK_CONTENT_TAGS.map(t => {
                          const on = bbkContent === t;
                          return (
                            <Pressable
                              key={t}
                              onPress={() => { setBbkContent(t); setBbkPrice(null); }}
                              style={{
                                flexDirection: 'row', alignItems: 'center', gap: 5,
                                paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
                                borderWidth: 1, borderColor: on ? accentColor : 'rgba(0,0,0,0.08)',
                                backgroundColor: on ? `${accentColor}10` : '#FFF',
                              }}
                            >
                              <Package size={12} color={on ? accentColor : '#9A9A9A'} strokeWidth={1.8} />
                              <Text style={{ fontSize: 11.5, fontWeight: '600', color: on ? accentColor : '#6B6B6B' }}>{t}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={SECTION_LBL}>Güvence Bedeli</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Shield size={15} color="#9A9A9A" strokeWidth={1.8} />
                          <TextInput
                            value={bbkInsurance}
                            onChangeText={(t) => { setBbkInsurance(t); setBbkPrice(null); setBbkBreakdown(null); }}
                            placeholder="0 (₺)"
                            keyboardType="decimal-pad"
                            style={{ flex: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, /* @ts-ignore */ outlineWidth: 0 }}
                          />
                        </View>
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={SECTION_LBL}>İndirim Kodu</Text>
                        <TextInput
                          value={bbkPromo}
                          onChangeText={(t) => { setBbkPromo(t); setBbkPrice(null); setBbkBreakdown(null); }}
                          placeholder="Opsiyonel"
                          autoCapitalize="characters"
                          style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, /* @ts-ignore */ outlineWidth: 0 }}
                        />
                      </View>
                    </View>

                    {/* Alıcı override + adres detayı (opsiyonel — boşsa kayıtlı bilgi kullanılır) */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={SECTION_LBL}>{direction === 'clinic_to_lab' ? 'Gönderen Adı' : 'Alıcı Adı'}</Text>
                        <TextInput
                          value={bbkRecipient}
                          onChangeText={setBbkRecipient}
                          placeholder="Kayıtlı ad"
                          style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, /* @ts-ignore */ outlineWidth: 0 }}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={SECTION_LBL}>{direction === 'clinic_to_lab' ? 'Gönderen Telefon' : 'Alıcı Telefon'}</Text>
                        <TextInput
                          value={bbkRecPhone}
                          onChangeText={setBbkRecPhone}
                          placeholder="Kayıtlı telefon"
                          keyboardType="phone-pad"
                          style={{ borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, /* @ts-ignore */ outlineWidth: 0 }}
                        />
                      </View>
                    </View>

                    <View style={{ gap: 6 }}>
                      <Text style={SECTION_LBL}>Adres Detayı (opsiyonel)</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {([
                          { v: bbkBuildingNo, set: setBbkBuildingNo, ph: 'Bina No' },
                          { v: bbkFloor, set: setBbkFloor, ph: 'Kat' },
                          { v: bbkApartment, set: setBbkApartment, ph: 'Daire No' },
                          { v: bbkIntercom, set: setBbkIntercom, ph: 'Kapı/Zil kodu' },
                        ]).map((f, i) => (
                          <TextInput
                            key={i}
                            value={f.v}
                            onChangeText={f.set}
                            placeholder={f.ph}
                            style={{ flexGrow: 1, flexBasis: '45%', minWidth: 120, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, /* @ts-ignore */ outlineWidth: 0 }}
                          />
                        ))}
                      </View>
                    </View>

                    {/* Yükleme + SMS toggle'ları */}
                    {([
                      { on: bbkLoaders, set: () => { setBbkLoaders(v => !v); setBbkPrice(null); setBbkBreakdown(null); }, label: 'Yükleme / boşaltma gerekiyor', hint: 'Kuryeye yardımcı talep edilir (ücreti artırır).' },
                      { on: bbkNotify, set: () => setBbkNotify(v => !v), label: 'SMS ile alıcıyı bilgilendir', hint: 'Kurye yola çıkınca alıcıya SMS gider.' },
                    ]).map((t, i) => (
                      <Pressable
                        key={i}
                        onPress={t.set}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}
                      >
                        <View style={{
                          width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                          borderWidth: 1.5, borderColor: t.on ? accentColor : 'rgba(0,0,0,0.18)',
                          backgroundColor: t.on ? accentColor : '#FFF',
                        }}>
                          {t.on && <Check size={13} color="#FFF" strokeWidth={3} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#0A0A0A' }}>{t.label}</Text>
                          <Text style={{ fontSize: 10.5, color: '#9A9A9A' }}>{t.hint}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </Disclosure>
                )}

                {bbkPrice != null && (
                  <View style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0C`, gap: 6 }}>
                    {bbkBreakdown && (
                      <View style={{ gap: 3, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: `${accentColor}22` }}>
                        {([
                          ['Teslim', bbkBreakdown.delivery],
                          ['Ağırlık', bbkBreakdown.weight],
                          ['Güvence', bbkBreakdown.insurance],
                          ['Yükleme', bbkBreakdown.loading],
                          ['Bekleme', bbkBreakdown.waiting],
                        ] as [string, number | null][])
                          .filter(([, v]) => v != null && v > 0)
                          .map(([lbl, v]) => (
                            <View key={lbl} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 11, color: '#6B6B6B' }}>{lbl}</Text>
                              <Text style={{ fontSize: 11, fontWeight: '600', color: '#3C3C3C' }}>₺{Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                            </View>
                          ))}
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B6B6B' }}>Toplam</Text>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: accentColor }}>₺{bbkPrice}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Ücret — BanaBiKurye'de fiyat API'den gelir, elle sorulmaz */}
            {mode !== 'banabikurye' && !editDelivery && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  Kurye Ücreti (opsiyonel)
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${accentColor}10` }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: accentColor }}>{feeSymbol}</Text>
                  </View>
                  <TextInput
                    value={fee}
                    onChangeText={setFee}
                    placeholder="0,00"
                    keyboardType="decimal-pad"
                    style={{
                      flex: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
                      // @ts-ignore web
                      outlineWidth: 0,
                    }}
                  />
                </View>
                <Text style={{ fontSize: 10.5, color: '#9A9A9A' }}>
                  Bu siparişin maliyetine eklenir. Sonradan da girilebilir.
                </Text>
              </View>
            )}

            {/* Notes */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B', letterSpacing: 0.6, textTransform: 'uppercase' }}>Not (opsiyonel)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Teslimat notu, adres tarifi, vb."
                multiline
                style={{
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 13,
                  minHeight: 70, textAlignVertical: 'top',
                  // @ts-ignore
                  outlineWidth: 0,
                }}
              />
            </View>

            {error && (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '500' }}>{error}</Text>
                {errDetail && (
                  <>
                    <Pressable onPress={() => setErrOpen(v => !v)} hitSlop={6}>
                      <Text style={{ fontSize: 11, color: '#991B1B', textDecorationLine: 'underline' }}>
                        {errOpen ? 'Teknik detayı gizle' : 'Teknik detay'}
                      </Text>
                    </Pressable>
                    {errOpen && (
                      <Text selectable style={{ fontSize: 10, lineHeight: 15, color: '#7F1D1D', backgroundColor: '#FEF2F2', borderRadius: 8, padding: 10, fontFamily: FONT_MONO }}>
                        {errDetail}
                      </Text>
                    )}
                  </>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FFFFFF', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
            {/* İptal ikincil bir çıkış — kutulu olduğunda asıl eylemle eşit
                ağırlıkta görünüyordu. Metin butonu olarak geri çekildi. */}
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={({ pressed }: any) => ({
                paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999,
                opacity: pressed ? 0.55 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#6B6B6B' }}>İptal</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {mode === 'banabikurye' ? (
              <Pressable
                onPress={editDelivery ? handleBbkEdit : (bbkPrice == null ? handleBbkCalculate : handleBbkCreate)}
                disabled={bbkBusy || (!editDelivery && bbkPayment == null)}
                style={({ pressed }: any) => ({
                  flex: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  paddingVertical: 13, borderRadius: 999, backgroundColor: accentColor,
                  opacity: (bbkBusy || (!editDelivery && bbkPayment == null)) ? 0.45 : pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                {bbkBusy
                  ? <ActivityIndicator color="#FFF" />
                  : <Truck size={14} color="#FFF" strokeWidth={2} />}
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>
                  {bbkBusy ? 'İşleniyor…'
                    : editDelivery ? 'Düzenle & Kaydet'
                    : bbkPrice == null ? 'Fiyat Hesapla'
                    : `Onayla & Çağır (₺${bbkPrice})`}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSubmit}
                disabled={saving}
                style={({ pressed }: any) => ({
                  flex: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  paddingVertical: 13, borderRadius: 999, backgroundColor: accentColor,
                  opacity: saving ? 0.6 : pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Truck size={14} color="#FFF" strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>
                  {saving ? 'Kaydediliyor…' : extraLeg ? 'Kurye Çağır' : 'Kuryeye Gönder'}
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
