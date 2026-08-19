/**
 * Onboarding API — Lab kurulum wizard verilerini Supabase'e yazar
 *
 * Tüm veriler toplu olarak tek seferde yazılır (deferred save).
 * Böylece geri-ileri navigasyonda duplike kayıt oluşmaz.
 */
import { supabase } from '../../core/api/supabase';
import { getBaseCurrency } from '../../core/money/baseCurrency';

// ── Types ──────────────────────────────────────────────────────────
export interface LabSetupData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface ClinicSetupData {
  name: string;
  phone?: string;
  contact_person?: string;
  category?: string;
}

export interface DoctorSetupData {
  full_name: string;
  phone?: string;
  specialty?: string;
}

export interface EmployeeSetupData {
  full_name: string;
  role: string;
  phone?: string;
}

export interface ServiceTemplate {
  name: string;
  category: string;
  price: number;
}

export interface WizardPayload {
  ownerName?: string;          // Kullanıcının kendi adı (profiles.full_name güncellenir)
  lab: LabSetupData;
  clinic?: ClinicSetupData;
  doctor?: DoctorSetupData;
  employee?: EmployeeSetupData;
  serviceCategories: string[];
}

// ── Mevcut lab bilgilerini yükle (admin varsa doldurur) ────────────
export interface ExistingData {
  lab: LabSetupData | null;
  ownerName: string;
}

export async function loadExistingData(): Promise<ExistingData> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { lab: null, ownerName: '' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('lab_id, full_name')
    .eq('id', user.id)
    .single();

  const ownerName = profile?.full_name ?? '';

  // Platform konsolundan kurulmuş ve bu e-postaya bırakılmış bir lab var mı?
  // Varsa devral — sihirbaz sıfırdan kurulum yerine hazır labı düzenlemeye
  // düşer (ad/bölge/para birimi zaten dolu gelir). Eşleşme yoksa null döner
  // ve normal "yeni lab" akışı aynen çalışır.
  let labId = profile?.lab_id ?? null;
  if (!labId) {
    try {
      const { data: claimed } = await supabase.rpc('claim_pending_lab');
      if (claimed) labId = claimed as string;
    } catch { /* devralma başarısızsa normal akış sürer */ }
  }

  if (!labId) return { lab: null, ownerName };

  const { data: lab } = await supabase
    .from('labs')
    .select('name, phone, email, address')
    .eq('id', labId)
    .single();

  return { lab: lab ?? null, ownerName };
}

/** @deprecated Use loadExistingData instead */
export async function loadExistingLab(): Promise<LabSetupData | null> {
  const result = await loadExistingData();
  return result.lab;
}

// ── Toplu kaydet — tek seferde tüm wizard verisini yazar ──────────
export async function saveWizardData(payload: WizardPayload) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Oturum bulunamadı');

  // 0) Kullanıcının kendi adını güncelle
  if (payload.ownerName?.trim()) {
    await supabase
      .from('profiles')
      .update({ full_name: payload.ownerName.trim() })
      .eq('id', user.id);
  }

  // 1) Lab oluştur veya güncelle
  const { data: profile } = await supabase
    .from('profiles')
    .select('lab_id')
    .eq('id', user.id)
    .single();

  let labId = profile?.lab_id;

  if (labId) {
    // Mevcut lab'ı güncelle
    const { error } = await supabase
      .from('labs')
      .update({
        name: payload.lab.name,
        phone: payload.lab.phone || null,
        email: payload.lab.email || null,
        address: payload.lab.address || null,
      })
      .eq('id', labId);
    if (error) throw error;
  } else {
    // Yeni lab — sunucu-tarafı ATOMİK RPC: labs INSERT + profiles.lab_id UPDATE
    // tek transaction'da; owner_id/lab_id'yi sunucu atar (client spoof edemez),
    // slug + benzersizlik sunucuda üretilir. (bkz. migration create_lab_tenant)
    const { data: newLabId, error } = await supabase.rpc('create_lab_tenant', {
      p_name: payload.lab.name,
      p_phone: payload.lab.phone || null,
      p_email: payload.lab.email || null,
      p_address: payload.lab.address || null,
    });
    if (error) throw error;
    labId = newLabId as string;
  }

  // 2) Klinik (atlanmadıysa)
  let clinicId: string | null = null;
  if (payload.clinic && payload.clinic.name.trim()) {
    const { data: clinic, error } = await supabase
      .from('clinics')
      .insert({
        name: payload.clinic.name,
        phone: payload.clinic.phone || null,
        contact_person: payload.clinic.contact_person || null,
        category: payload.clinic.category || 'klinik',
        lab_id: labId,
      })
      .select()
      .single();
    if (error) throw error;
    clinicId = clinic.id;
  }

  // 3) Hekim (atlanmadıysa + klinik varsa)
  if (payload.doctor && payload.doctor.full_name.trim() && clinicId) {
    const { error } = await supabase
      .from('doctors')
      .insert({
        full_name: payload.doctor.full_name,
        phone: payload.doctor.phone || null,
        specialty: payload.doctor.specialty || null,
        clinic_id: clinicId,
        lab_id: labId,
      });
    if (error) throw error;
  }

  // 4) Personel (atlanmadıysa)
  if (payload.employee && payload.employee.full_name.trim()) {
    const { error } = await supabase
      .from('employees')
      .insert({
        full_name: payload.employee.full_name,
        role: payload.employee.role,
        phone: payload.employee.phone || null,
        lab_id: labId,
      });
    if (error) throw error;
  }

  // 5) Hizmet listesi
  if (payload.serviceCategories.length > 0) {
    const services = payload.serviceCategories.flatMap(
      cat => SERVICE_TEMPLATES[cat] || []
    );
    if (services.length > 0) {
      const rows = services.map((s, i) => ({
        name: s.name,
        category: s.category,
        // Şablon rakamları TRY pazarına ait — baz para birimi başkaysa fiyatsız aç.
        price: templatePricesApply() ? s.price : 0,
        currency: getBaseCurrency(),
        is_active: true,
        sort_order: i,
        lab_id: labId,
      }));
      const { error } = await supabase.from('lab_services').insert(rows);
      if (error) throw error;
    }
  }

  // Kurulum tamamlandı — bir daha sihirbaza düşmesin.
  // (Yönlendirme `labs.setup_completed_at` NULL mü diye bakıyor.)
  try {
    await supabase.from('labs')
      .update({ setup_completed_at: new Date().toISOString() })
      .eq('id', labId);
  } catch { /* işaretleme başarısızsa kurulum yine kaydedildi */ }

  return { labId };
}

/**
 * Sihirbazı yarıda bırakma çıkışı. Bayrağı işaretler ki route guard kullanıcıyı
 * tekrar sihirbaza fırlatmasın — kurulum ekranına sonradan `/(admin)/setup-wizard`
 * adresinden dönülebilir.
 */
export async function dismissSetupWizard(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: prof } = await supabase.from('profiles').select('lab_id').eq('id', user.id).maybeSingle();
  const labId = prof?.lab_id;
  if (!labId) return;
  await supabase.from('labs')
    .update({ setup_completed_at: new Date().toISOString() })
    .eq('id', labId);
}

// ── Hazır hizmet şablonları ────────────────────────────────────────
export const SERVICE_TEMPLATES: Record<string, ServiceTemplate[]> = {
  'Zirkonyum': [
    { name: 'Monolitik Zirkonyum Kron', category: 'Zirkonyum', price: 1800 },
    { name: 'Katmanlı Zirkonyum Kron', category: 'Zirkonyum', price: 2400 },
    { name: 'Zirkonyum Köprü (birim)', category: 'Zirkonyum', price: 2000 },
    { name: 'Zirkonyum İnley/Onley', category: 'Zirkonyum', price: 1500 },
    { name: 'Zirkonyum Veneer', category: 'Zirkonyum', price: 2200 },
  ],
  'Metal Seramik': [
    { name: 'Metal Destekli Porselen Kron', category: 'Metal Seramik', price: 1200 },
    { name: 'Metal Destekli Köprü (birim)', category: 'Metal Seramik', price: 1300 },
    { name: 'Metal Koping', category: 'Metal Seramik', price: 600 },
  ],
  'Protez': [
    { name: 'Tam Protez (tek çene)', category: 'Protez', price: 3500 },
    { name: 'Bölümlü Protez', category: 'Protez', price: 3000 },
    { name: 'İskelet Protez', category: 'Protez', price: 4500 },
    { name: 'Geçici Protez', category: 'Protez', price: 1500 },
  ],
  'İmplant': [
    { name: 'İmplant Üstü Kron (vidalı)', category: 'İmplant', price: 2800 },
    { name: 'İmplant Üstü Kron (siman)', category: 'İmplant', price: 2600 },
    { name: 'İmplant Üstü Köprü (birim)', category: 'İmplant', price: 3000 },
    { name: 'İmplant Bar (birim)', category: 'İmplant', price: 3500 },
    { name: 'Locator Abutment', category: 'İmplant', price: 2000 },
  ],
  'Ortodonti': [
    { name: 'Şeffaf Plak (tek çene)', category: 'Ortodonti', price: 800 },
    { name: 'Essix Plak', category: 'Ortodonti', price: 500 },
    { name: 'Ortodontik Model', category: 'Ortodonti', price: 300 },
  ],
  'Estetik': [
    { name: 'Laminat Veneer', category: 'Estetik', price: 2500 },
    { name: 'E-max Kron', category: 'Estetik', price: 2200 },
    { name: 'E-max İnley/Onley', category: 'Estetik', price: 1800 },
    { name: 'Kompozit Veneer', category: 'Estetik', price: 800 },
  ],
};

// ── Fiyat formatla ─────────────────────────────────────────────────
/**
 * Şablon fiyatları TÜRKİYE pazarına göre TRY cinsindendir. Baz para birimi
 * başka bir şeyse (ör. İran labı → تومان) bu rakamları o sembolle göstermek
 * yanlış olur — 1.800 tümen bir zirkonyum kron değildir. O yüzden TRY dışı
 * labda fiyat gösterilmez; hizmetler fiyatsız açılır ve lab kendi fiyat
 * listesini girer (ekran zaten "fiyatları sonra düzenleyebilirsiniz" diyor).
 */
export function templatePricesApply(): boolean {
  return getBaseCurrency() === 'TRY';
}

export function fmtPrice(n: number) {
  if (!templatePricesApply()) return '—';
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency', currency: 'TRY', maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `₺${(Number(n) || 0).toLocaleString('tr-TR')}`;
  }
}
