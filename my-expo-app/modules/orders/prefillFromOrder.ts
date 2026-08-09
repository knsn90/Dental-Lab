// modules/orders/prefillFromOrder.ts
// "Bu siparişten yeni oluştur" — mevcut bir iş emrini yeni-sipariş formunun
// başlangıç değerlerine çevirir.
//
// Neden ayrı dosya: NewOrderScreen 4000+ satır ve 5 panelin ortak bileşeni.
// Dönüşüm mantığı burada saf/izole tutulur, ekran sadece sonucu uygular.
//
// KOPYALANMAYAN alanlar (bilinçli):
//   • hasta kimliği (ad/soyad/TC/doğum/telefon/uyruk/şehir) — yeni vaka, yeni hasta
//   • notes / lab_notes — serbest metin hastaya özeldir; yanlış hastaya taşınması
//     klinik olarak riskli, o yüzden taşınmaz
//   • delivery_date, is_urgent — tarihe/aciliyete her vakada yeniden karar verilir
//   • ekler, ses notları, sohbet, scan_bodies_delivered — vakaya özgü fiziksel/dosya durumu

import { supabase } from '../../core/api/supabase';

export interface PrefillToothOp {
  tooth: number;
  work_type: string;
  shade: string;
  implant_system: string;
  implant_type: string;
  abutment: string;
  screw: string;
  material: string;
  price: number;
  material_price: number;
  currency?: string;
}

export interface PrefillPendingItem {
  service_id?: string;
  name: string;
  price: number;
  currency?: string;
  quantity: number;
}

export interface OrderPrefill {
  source_order_id: string;
  source_order_number: string;
  clinic_id: string;
  doctor_id: string;
  model_type: string;
  machine_type: string;
  measurement_type: '' | 'manual' | 'digital';
  delivery_method: '' | 'kurye' | 'elden' | 'kargo';
  tags: string[];
  lab_notes_visible: boolean;
  doctor_approval_required: boolean;
  tooth_ops: PrefillToothOp[];
  pending_items: PrefillPendingItem[];

  // ── Devam siparişi (continuation) — YALNIZ "Devam Siparişi" akışında dolu ──
  // Dolu ise NewOrderScreen: hasta bilgisini forma yazar, dişleri seçili gösterir
  // (iş tipi/materyal boş), ve kaydederken continues_order_id'yi payload'a ekler.
  // Plain "kopyala" / "düzenle" akışlarında bu alanlar undefined → davranış değişmez.
  continues_order_id?: string;
  patient_prefill?: {
    first_name: string; last_name: string; id: string;
    gender: 'erkek' | 'kadın' | 'belirtilmedi'; dob: string;
    nationality: string; country: string; city: string;
  };
  /** Devam siparişinde ASIL işin dosyaları (taramalar) var mı — varsa "dijital
   *  ölçüm → dosya zorunlu" kuralı gevşer (dosyalar miras alınır, yeniden yüklenmez). */
  has_source_files?: boolean;
  /** Devam siparişinde ASIL işin hekim notu. Kopyalama akışında notlar TAŞINMAZ
   *  (başka hastaya taşınması riskli) — ama devam siparişinde hasta AYNI, o yüzden
   *  taşınır: hekimin "geçici için şunu istemiştim" notu nihai işte de gerekiyor. */
  source_notes?: string;
}

/**
 * order_items.notes, yazma tarafında şu biçimde kodlanır:
 *   "Marka: X · Tür: Y · Abutment: Z · Vida: W · Materyal: M · Renk: R"
 * (NewOrderScreen submit → addOrderItem). Burada tersine çevirilir.
 * Biçim bozuksa sessizce boş döner — kopyalama hiçbir zaman çökmez.
 */
export function parseItemNotes(notes?: string | null): {
  implant_system: string; implant_type: string; abutment: string;
  screw: string; material: string; shade: string;
} {
  const out = {
    implant_system: '', implant_type: '', abutment: '',
    screw: '', material: '', shade: '',
  };
  if (!notes) return out;

  const LABELS: Record<string, keyof typeof out> = {
    'marka': 'implant_system',
    'tür': 'implant_type',
    'tur': 'implant_type',
    'abutment': 'abutment',
    'vida': 'screw',
    'materyal': 'material',
    'renk': 'shade',
  };

  for (const part of String(notes).split('·')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const label = part.slice(0, idx).trim().toLocaleLowerCase('tr');
    const value = part.slice(idx + 1).trim();
    const key = LABELS[label];
    if (key && value) out[key] = value;
  }
  return out;
}

type ItemRow = {
  service_id: string | null;
  name: string | null;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  notes: string | null;
  tooth_numbers: number[] | null;
};

/**
 * Kalemleri diş-işlemi ve servis kalemi olarak ayırır.
 * Ayraç: tooth_numbers dolu olan kalem diş işlemidir (yazma tarafı böyle üretir),
 * geri kalan service_id'li kalemler serbest servis kalemidir.
 */
export function splitItems(items: ItemRow[], fallbackShade: string) {
  const tooth_ops: PrefillToothOp[] = [];
  const pending_items: PrefillPendingItem[] = [];

  for (const it of items) {
    const teeth = Array.isArray(it.tooth_numbers) ? it.tooth_numbers.filter(n => Number.isFinite(n)) : [];
    const name = it.name ?? '';

    if (teeth.length > 0) {
      const d = parseItemNotes(it.notes);
      // Kalem fiyatı gruptaki tüm dişlerin toplamı değil, temsili birim fiyattır
      // (yazma tarafında g.price = ilk op'un fiyatı). Aynen geri veriyoruz.
      for (const tooth of teeth) {
        tooth_ops.push({
          tooth,
          work_type: name,
          shade: d.shade || fallbackShade || '',
          implant_system: d.implant_system,
          implant_type: d.implant_type,
          abutment: d.abutment,
          screw: d.screw,
          material: d.material,
          price: Number(it.price) || 0,
          material_price: 0,
          currency: it.currency ?? undefined,
        });
      }
    } else if (it.service_id) {
      pending_items.push({
        service_id: it.service_id,
        name,
        price: Number(it.price) || 0,
        currency: it.currency ?? undefined,
        quantity: Number(it.quantity) || 1,
      });
    }
  }

  return { tooth_ops, pending_items };
}

export interface RecentOrderOption {
  id: string;
  order_number: string;
  label: string;
}

/**
 * "Son siparişlerden seç" şeridi için son N iş emri.
 * RLS kapsamı belirler: hekim kendi siparişlerini, lab kendi lab'ının siparişlerini görür.
 * Hata durumunda boş dizi döner — şerit görünmez, form normal çalışır.
 */
export async function fetchRecentOrdersForCopy(limit = 5): Promise<RecentOrderOption[]> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('id, order_number, work_type, tooth_numbers, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as any[]).map(w => {
    const teeth = Array.isArray(w.tooth_numbers) ? w.tooth_numbers.length : 0;
    const bits = [w.work_type, teeth ? `${teeth} diş` : ''].filter(Boolean);
    return {
      id: w.id,
      order_number: w.order_number ?? '',
      label: bits.join(' · '),
    };
  });
}

/**
 * Bir iş emrini forma doldurulabilir hâle getirir.
 * Sipariş bulunamazsa / RLS engellerse null döner (çağıran taraf sessizce yutar).
 */
export async function fetchOrderPrefill(orderId: string): Promise<OrderPrefill | null> {
  if (!orderId) return null;

  const { data: wo, error } = await supabase
    .from('work_orders')
    .select(
      'id, order_number, doctor_id, model_type, machine_type, measurement_type, ' +
      'delivery_method, tags, lab_notes_visible, doctor_approval_required, ' +
      'work_type, shade, tooth_numbers'
    )
    .eq('id', orderId)
    .maybeSingle();

  if (error || !wo) return null;

  const [{ data: itemRows }, { data: doc }] = await Promise.all([
    supabase
      .from('order_items')
      .select('service_id, name, price, currency, quantity, notes, tooth_numbers')
      .eq('work_order_id', orderId),
    (wo as any).doctor_id
      ? supabase.from('doctors').select('clinic_id').eq('id', (wo as any).doctor_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);

  const w: any = wo;
  const fallbackShade = w.shade ?? '';
  let { tooth_ops, pending_items } = splitItems((itemRows as ItemRow[]) ?? [], fallbackShade);

  // Kalem yoksa (eski/manuel kayıtlar) iş emrinin kendi alanlarından tek tip
  // diş işlemi üret — kopyalama yine de işe yarasın.
  if (tooth_ops.length === 0 && Array.isArray(w.tooth_numbers) && w.work_type) {
    tooth_ops = w.tooth_numbers.filter((n: any) => Number.isFinite(n)).map((tooth: number) => ({
      tooth,
      work_type: w.work_type,
      shade: fallbackShade,
      implant_system: '', implant_type: '', abutment: '', screw: '', material: '',
      price: 0, material_price: 0,
    }));
  }

  const mt = w.measurement_type;
  const dm = w.delivery_method;

  return {
    source_order_id: w.id,
    source_order_number: w.order_number ?? '',
    clinic_id: (doc as any)?.clinic_id ?? '',
    doctor_id: w.doctor_id ?? '',
    model_type: w.model_type ?? '',
    machine_type: w.machine_type ?? 'milling',
    measurement_type: mt === 'manual' || mt === 'digital' ? mt : '',
    delivery_method: dm === 'kurye' || dm === 'elden' || dm === 'kargo' ? dm : '',
    tags: Array.isArray(w.tags) ? w.tags : [],
    lab_notes_visible: !!w.lab_notes_visible,
    doctor_approval_required: !!w.doctor_approval_required,
    tooth_ops,
    pending_items,
  };
}

/**
 * DEVAM SİPARİŞİ prefill'i — teslim edilmiş bir işin planlı devamı (ör. geçici→nihai).
 * Kopyalamadan farkı: HASTA bilgisi taşınır, dişler seçili gelir ama iş tipi/materyal/
 * fiyat BOŞ bırakılır (nihai iş sıfırdan seçilir), ve continues_order_id set edilir.
 * Revizyon DEĞİL — normal (tam ücretli) yeni sipariş olarak oluşur, KPI'a sayılmaz.
 * Kayıt bulunamazsa null döner (çağıran taraf sessizce yutar).
 */
export async function fetchContinuationPrefill(orderId: string): Promise<OrderPrefill | null> {
  if (!orderId) return null;
  const base = await fetchOrderPrefill(orderId);
  if (!base) return null;

  const [{ data: wo }, { count: photoCount }] = await Promise.all([
    supabase
      .from('work_orders')
      .select(
        'patient_name, patient_id, patient_gender, patient_dob, ' +
        'patient_nationality, patient_country, patient_city, notes'
      )
      .eq('id', orderId)
      .maybeSingle(),
    supabase
      .from('work_order_photos')
      .select('id', { count: 'exact', head: true })
      .eq('work_order_id', orderId),
  ]);

  const w: any = wo ?? {};
  const nameParts = String(w.patient_name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : (nameParts[0] ?? '');
  const last  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
  const g = w.patient_gender;

  return {
    ...base,
    continues_order_id: orderId,
    has_source_files: (photoCount ?? 0) > 0,
    patient_prefill: {
      first_name: first,
      last_name: last,
      id: w.patient_id ?? '',
      gender: g === 'erkek' || g === 'kadın' ? g : 'belirtilmedi',
      dob: w.patient_dob ?? '',
      nationality: w.patient_nationality ?? '',
      country: w.patient_country ?? '',
      city: w.patient_city ?? '',
    },
    source_notes: (w.notes ?? '').trim() || undefined,
    // Dişler TAŞINIR (aynı vakanın devamı — hangi dişler olduğu değişmez), ama
    // işlem/materyal/fiyat BOŞ gelir: nihai iş sıfırdan seçilir.
    // Not: bir dönem `tooth_ops: []` yapılmıştı; o zaman devam siparişi hasta
    // dışında tamamen boş açılıyordu. Doğrusu dişi taşıyıp içeriğini boşaltmak.
    tooth_ops: base.tooth_ops.map(op => ({
      tooth: op.tooth,
      work_type: '', shade: '',
      implant_system: '', implant_type: '', abutment: '', screw: '',
      material: '', price: 0, material_price: 0,
    })),
    // Faturalama sıfırdan (nihai zirkon farklı) — serbest servis kalemlerini taşıma.
    pending_items: [],
  };
}

/**
 * DÜZENLEME prefill'i — kopyalamadan farkı: hasta kimliği, teslim tarihi, aciliyet
 * ve notlar da TAŞINIR (aynı siparişi yerinde güncellemek için). `edit_order_id`
 * dolu döner → NewOrderScreen kaydet'te yeni oluşturmaz, bu siparişi günceller.
 */
export interface OrderEditPrefill extends OrderPrefill {
  edit_order_id: string;
  patient_name: string;
  patient_id: string;
  patient_gender: 'erkek' | 'kadın' | 'belirtilmedi';
  patient_dob: string;          // 'YYYY-MM-DD' | ''
  patient_phone: string;
  patient_nationality: string;
  patient_country: string;
  patient_city: string;
  is_urgent: boolean;
  delivery_date: string;        // 'YYYY-MM-DD' | ''
  notes: string;
  lab_notes: string;
  implant_brand: string;
  scan_bodies_delivered: boolean;
  triaged_at: string | null;
  status: string | null;
}

export async function fetchOrderEditPrefill(orderId: string): Promise<OrderEditPrefill | null> {
  if (!orderId) return null;
  const base = await fetchOrderPrefill(orderId);
  if (!base) return null;

  // NOT: patient_phone ve implant_brand work_orders'ta YOK (migration 004 uygulanmadı) —
  // select'e eklenirse tüm sorgu patlar → kimlik/vaka alanları boş gelir ("sıfırdan" görünür).
  const { data: wo } = await supabase
    .from('work_orders')
    .select(
      'patient_name, patient_id, patient_gender, patient_dob, ' +
      'patient_nationality, patient_country, patient_city, is_urgent, delivery_date, ' +
      'notes, lab_notes, scan_bodies_delivered, triaged_at, status'
    )
    .eq('id', orderId)
    .maybeSingle();

  const w: any = wo ?? {};
  const g = w.patient_gender;
  return {
    ...base,
    edit_order_id: orderId,
    triaged_at: w.triaged_at ?? null,
    status: w.status ?? null,
    patient_name: w.patient_name ?? '',
    patient_id: w.patient_id ?? '',
    patient_gender: g === 'erkek' || g === 'kadın' ? g : 'belirtilmedi',
    patient_dob: w.patient_dob ?? '',
    patient_phone: '',
    patient_nationality: w.patient_nationality ?? '',
    patient_country: w.patient_country ?? '',
    patient_city: w.patient_city ?? '',
    is_urgent: !!w.is_urgent,
    delivery_date: w.delivery_date ?? '',
    notes: w.notes ?? '',
    lab_notes: w.lab_notes ?? '',
    implant_brand: '',
    scan_bodies_delivered: !!w.scan_bodies_delivered,
  };
}
