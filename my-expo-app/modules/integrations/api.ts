/**
 * Integrations API — provider_credentials yönetimi
 *
 * - fetchCredentials(type)    → bir lab'ın belirli tipteki tüm sağlayıcıları
 * - upsertCredential          → ekle/güncelle
 * - activateCredential        → aktif yap (trigger diğerlerini pasif yapar)
 * - deleteCredential          → sil
 * - testCredential            → bağlantı test et + DB'ye sonuç kaydet
 * - getActiveProvider(type)   → şu anki aktif sağlayıcı (config + key)
 */
import { supabase } from '../../core/api/supabase';

export type IntegrationType = 'efatura' | 'payment';

export interface ProviderCredential {
  id:                string;
  lab_id:            string;
  type:              IntegrationType;
  provider:          string;
  display_name:      string | null;
  environment:       'sandbox' | 'production';
  credentials:       Record<string, any>;
  is_active:         boolean;
  last_test_at:      string | null;
  last_test_ok:      boolean | null;
  last_test_message: string | null;
  notes:             string | null;
  created_at:        string;
  updated_at:        string;
}

export interface ProviderDefinition {
  /** İç provider key (db'de provider sütununa yazılır) */
  key:         string;
  /** UI'da gösterilen ad */
  label:       string;
  /** Açıklama */
  description: string;
  /** Kullanıcının dolduracağı alanlar */
  fields:      ProviderField[];
  /** Ücret/komisyon bilgisi (kullanıcıya bilgi) */
  pricing?:    string;
  /** Resmi web sitesi */
  website?:    string;
  /** Implementasyon hazır mı? Hazır değilse "Yakında" gösterilir */
  implemented?: boolean;
}

export interface ProviderField {
  key:         string;        // credentials JSONB içinde tutulur
  label:       string;
  type:        'text' | 'password' | 'url' | 'select';
  required?:   boolean;
  placeholder?:string;
  helpText?:   string;
  options?:    { value: string; label: string }[];
}

// ─── Provider katalogları ────────────────────────────────────────────────
export const EFATURA_PROVIDERS: ProviderDefinition[] = [
  {
    key:   'demo',
    label: 'Demo (Sandbox)',
    description: 'Sahte e-Fatura sağlayıcısı. UI test ve geliştirme için.',
    fields: [],
    implemented: true,
  },
  {
    key:   'nilvera',
    label: 'Nilvera',
    description: 'REST API, modern, sandbox kolay. Önerilen.',
    pricing: '~₺500/ay',
    website: 'https://nilvera.com',
    fields: [
      { key: 'username', label: 'Kullanıcı Adı', type: 'text',     required: true },
      { key: 'password', label: 'Şifre',          type: 'password', required: true },
      { key: 'customer_id', label: 'Müşteri ID',  type: 'text', helpText: 'Nilvera panelinde Profil sayfasında' },
    ],
    implemented: false,
  },
  {
    key:   'efinans',
    label: 'eFinans (QNB)',
    description: 'QNB Finansbank entegratörü. Bankacılık ile entegre.',
    pricing: '~₺400/ay',
    website: 'https://www.efinans.com.tr',
    fields: [
      { key: 'username', label: 'Kullanıcı Adı', type: 'text',     required: true },
      { key: 'password', label: 'Şifre',          type: 'password', required: true },
      { key: 'language', label: 'Dil',            type: 'select', options: [
        { value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'İngilizce' },
      ]},
    ],
    implemented: false,
  },
  {
    key:   'foriba',
    label: 'Foriba (eLogo)',
    description: 'Pazar lideri, SOAP+REST hibrit. Kurumsal.',
    pricing: '~₺600/ay',
    website: 'https://www.foriba.com',
    fields: [
      { key: 'username', label: 'Kullanıcı Adı', type: 'text',     required: true },
      { key: 'password', label: 'Şifre',          type: 'password', required: true },
      { key: 'vkn',      label: 'Lab VKN',        type: 'text',     required: true, helpText: '10 haneli' },
    ],
    implemented: false,
  },
  {
    key:   'uyumsoft',
    label: 'Uyumsoft',
    description: 'Geniş muhasebe entegrasyonu, SOAP.',
    pricing: '~₺500/ay',
    website: 'https://www.uyumsoft.com.tr',
    fields: [
      { key: 'username', label: 'Kullanıcı Adı', type: 'text',     required: true },
      { key: 'password', label: 'Şifre',          type: 'password', required: true },
    ],
    implemented: false,
  },
];

export const PAYMENT_PROVIDERS: ProviderDefinition[] = [
  {
    key:   'demo',
    label: 'Demo POS (Sandbox)',
    description: 'Sahte ödeme sağlayıcısı. Test için.',
    fields: [],
    implemented: true,
  },
  {
    key:   'iyzico',
    label: 'iyzico',
    description: 'Türkiye\'de en yaygın. Modern REST, sandbox güzel. Önerilen.',
    pricing: '%2.49 + ₺0.25/işlem',
    website: 'https://www.iyzico.com',
    fields: [
      { key: 'api_key',    label: 'API Key',     type: 'password', required: true },
      { key: 'secret_key', label: 'Secret Key',  type: 'password', required: true },
      { key: 'base_url',   label: 'Base URL',    type: 'url', placeholder: 'https://sandbox-api.iyzipay.com', helpText: 'Sandbox veya prod URL' },
    ],
    implemented: false,
  },
  {
    key:   'paytr',
    label: 'PayTR',
    description: 'Düşük komisyon, kolay entegrasyon.',
    pricing: '%1.99+',
    website: 'https://www.paytr.com',
    fields: [
      { key: 'merchant_id',   label: 'Merchant ID',  type: 'text',     required: true },
      { key: 'merchant_key',  label: 'Merchant Key', type: 'password', required: true },
      { key: 'merchant_salt', label: 'Merchant Salt',type: 'password', required: true },
    ],
    implemented: false,
  },
  {
    key:   'param',
    label: 'Param (Garanti BBVA)',
    description: 'SOAP, kurumsal. Bankacılık ile entegre.',
    pricing: '%1.5-2',
    website: 'https://param.com.tr',
    fields: [
      { key: 'client_code', label: 'Client Code', type: 'text',     required: true },
      { key: 'client_username', label: 'Client Username', type: 'text', required: true },
      { key: 'client_password', label: 'Client Password', type: 'password', required: true },
      { key: 'guid',        label: 'GUID',        type: 'text',     required: true },
    ],
    implemented: false,
  },
  {
    key:   'sipay',
    label: 'Sipay',
    description: 'REST API, alternatif sağlayıcı.',
    pricing: '%2-2.5',
    website: 'https://sipay.com.tr',
    fields: [
      { key: 'app_key',     label: 'App Key',    type: 'password', required: true },
      { key: 'app_secret',  label: 'App Secret', type: 'password', required: true },
      { key: 'merchant_key',label: 'Merchant Key',type: 'password', required: true },
    ],
    implemented: false,
  },
];

// ─── CRUD ────────────────────────────────────────────────────────────────
export async function fetchCredentials(type?: IntegrationType) {
  let q = supabase
    .from('provider_credentials')
    .select('*')
    .order('created_at', { ascending: true });
  if (type) q = q.eq('type', type);
  return q.returns<ProviderCredential[]>();
}

export async function upsertCredential(input: {
  id?:           string;
  type:          IntegrationType;
  provider:      string;
  display_name?: string;
  environment:   'sandbox' | 'production';
  credentials:   Record<string, any>;
  is_active?:    boolean;
  notes?:        string;
}) {
  if (input.id) {
    return supabase.from('provider_credentials')
      .update({
        display_name:  input.display_name ?? null,
        environment:   input.environment,
        credentials:   input.credentials,
        is_active:     input.is_active ?? false,
        notes:         input.notes ?? null,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', input.id)
      .select().single();
  }
  return supabase.from('provider_credentials')
    .insert({
      type:          input.type,
      provider:      input.provider,
      display_name:  input.display_name ?? null,
      environment:   input.environment,
      credentials:   input.credentials,
      is_active:     input.is_active ?? false,
      notes:         input.notes ?? null,
    })
    .select().single();
}

export async function activateCredential(id: string) {
  // Trigger diğerlerini pasif yapar
  return supabase.from('provider_credentials')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function deleteCredential(id: string) {
  return supabase.from('provider_credentials').delete().eq('id', id);
}

// ─── Aktif sağlayıcı sorgusu (provider katmanı bunu kullanır) ────────────
export async function getActiveCredential(type: IntegrationType) {
  const { data } = await supabase.rpc('get_active_provider', { p_type: type });
  const row = Array.isArray(data) ? data[0] : data;
  return row as { id: string; provider: string; environment: string; credentials: Record<string, any> } | null;
}

// ─── Test bağlantı (Demo için her zaman OK) ──────────────────────────────
export async function testCredential(id: string, type: IntegrationType, provider: string, _credentials: Record<string, any>) {
  // Şimdilik basit sandbox: provider 'demo' ise her zaman ok.
  // Gerçek provider eklenince provider'ın kendi test endpoint'i çağrılır.
  if (provider === 'demo') {
    await supabase.rpc('record_provider_test', { p_id: id, p_ok: true, p_message: 'Demo provider — bağlantı simüle edildi' });
    return { ok: true, message: 'Demo provider — başarılı' };
  }

  // TODO: Edge Function çağır → "test connection" endpoint'i
  // await supabase.functions.invoke(`${type}-test`, { body: { provider, credentials } })
  await supabase.rpc('record_provider_test', {
    p_id: id, p_ok: false,
    p_message: 'Bu provider için test endpoint\'i henüz aktif değil (Edge Function gerekli)',
  });
  return { ok: false, message: 'Test endpoint\'i Edge Function ile etkinleştirilecek' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────
export function findProviderDef(type: IntegrationType, key: string): ProviderDefinition | undefined {
  return (type === 'efatura' ? EFATURA_PROVIDERS : PAYMENT_PROVIDERS).find(p => p.key === key);
}
