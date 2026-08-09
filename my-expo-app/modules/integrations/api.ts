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

export type IntegrationType = 'efatura' | 'payment' | 'ocr' | 'messaging' | 'sms' | 'maps' | 'storage' | 'courier';

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
  type:        'text' | 'password' | 'url' | 'select' | 'address';
  required?:   boolean;
  placeholder?:string;
  helpText?:   string;
  options?:    { value: string; label: string }[];
  /** type='address': seçilen konumun enlem/boylamını yazacağı diğer alan key'leri */
  latKey?:     string;
  lngKey?:     string;
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

// ─── OCR / AI Vision sağlayıcıları ──────────────────────────────────────
// parse-invoice, parse-receipt, parse-work-order Edge Functions tarafından kullanılır.
export const OCR_PROVIDERS: ProviderDefinition[] = [
  {
    key:   'anthropic',
    label: 'Claude Vision (Anthropic)',
    description: 'En doğru OCR — fatura, dekont, kağıt iş emri (Sonnet 4.5 Vision).',
    pricing: '$3 / 1M input, $15 / 1M output token',
    website: 'https://console.anthropic.com',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true,
        placeholder: 'sk-ant-api03-...',
        helpText: 'console.anthropic.com → API Keys. Bu anahtar SADECE Edge Function secrets\'ta saklanmalı; client tarafına asla yazma.' },
      { key: 'model', label: 'Model', type: 'select', options: [
        { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5 (önerilen)' },
        { value: 'claude-opus-4-1',   label: 'Claude Opus 4.1 (en doğru, pahalı)' },
        { value: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5 (hızlı, ucuz)' },
      ]},
    ],
    implemented: true,
  },
  {
    key:   'openai',
    label: 'OpenAI Vision',
    description: 'GPT-4o Vision — alternatif OCR.',
    pricing: '$2.50 / 1M input, $10 / 1M output token',
    website: 'https://platform.openai.com',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'sk-proj-...' },
      { key: 'model', label: 'Model', type: 'select', options: [
        { value: 'gpt-4o',      label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (ucuz)' },
      ]},
    ],
    implemented: false,
  },
  {
    key:   'google-vision',
    label: 'Google Cloud Vision',
    description: 'OCR ve handwriting — Google Cloud bağlantısı.',
    pricing: '$1.50 / 1000 sayfa',
    website: 'https://cloud.google.com/vision',
    fields: [
      { key: 'service_account_json', label: 'Service Account JSON', type: 'password', required: true,
        helpText: 'GCP service account anahtar dosyasının içeriğini tek satır olarak yapıştır.' },
      { key: 'project_id', label: 'Project ID', type: 'text', required: true },
    ],
    implemented: false,
  },
];

// ─── Mesajlaşma sağlayıcıları (Kağıt sipariş inbox webhook) ─────────────
// inbound-paper-order Edge Function buradaki webhook url'lerini bekler.
export const MESSAGING_PROVIDERS: ProviderDefinition[] = [
  {
    key:   'whatsapp-cloud',
    label: 'WhatsApp Business Cloud API (Meta)',
    description: 'Meta resmi WhatsApp Business. Webhook ile fotoğraf alır, OCR yapıp inbox\'a yazar.',
    pricing: 'İlk 1000 konuşma/ay ücretsiz · sonrası ülke bazlı',
    website: 'https://business.facebook.com',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', type: 'text', required: true,
        helpText: 'Meta Business → WhatsApp → API Setup' },
      { key: 'business_account_id', label: 'Business Account ID', type: 'text', required: true },
      { key: 'access_token', label: 'Permanent Access Token', type: 'password', required: true,
        placeholder: 'EAA...',
        helpText: 'System User → permanent token oluştur (whatsapp_business_messaging + whatsapp_business_management izinleri).' },
      { key: 'verify_token', label: 'Webhook Verify Token', type: 'password',
        helpText: 'Kendi belirleyeceğin gizli string. Meta → Webhook setup\'ta AYNISINI gir. '
          + 'Callback URL: https://kjwjxqfdsxkxgcgophdy.supabase.co/functions/v1/whatsapp-webhook '
          + '· "messages" alanına abone ol.' },
    ],
    implemented: true,
  },
  {
    key:   'twilio-whatsapp',
    label: 'Twilio WhatsApp',
    description: 'Twilio üzerinden WhatsApp — kolay setup, sandbox hızlı.',
    pricing: '$0.005 / mesaj + WhatsApp kullanım ücreti',
    website: 'https://www.twilio.com/whatsapp',
    fields: [
      { key: 'account_sid', label: 'Account SID', type: 'text', required: true, placeholder: 'AC...' },
      { key: 'auth_token',  label: 'Auth Token',  type: 'password', required: true },
      { key: 'from_number', label: 'WhatsApp Numarası', type: 'text', required: true,
        placeholder: 'whatsapp:+14155238886', helpText: 'Twilio Sandbox veya doğrulanmış prod numara.' },
    ],
    implemented: false,
  },
  {
    key:   'telegram',
    label: 'Telegram Bot',
    description: 'BotFather ile bot oluştur, kliniklere bot link\'i ver, fotoğrafları otomatik OCR.',
    pricing: 'Ücretsiz',
    website: 'https://core.telegram.org/bots',
    fields: [
      { key: 'bot_token', label: 'Bot Token', type: 'password', required: true,
        placeholder: '123456:ABC-...',
        helpText: '@BotFather → /newbot → token al.' },
      { key: 'webhook_secret', label: 'Webhook Secret', type: 'password',
        helpText: 'X-Telegram-Bot-Api-Secret-Token header doğrulaması için.' },
    ],
    implemented: false,
  },
  {
    key:   '360dialog',
    label: '360dialog WhatsApp',
    description: 'WhatsApp BSP alternatif (Avrupa merkezli).',
    pricing: '€49+/ay',
    website: 'https://www.360dialog.com',
    fields: [
      { key: 'api_key',  label: 'API Key',  type: 'password', required: true },
      { key: 'channel_id', label: 'Channel ID', type: 'text', required: true },
    ],
    implemented: false,
  },
];

// ─── SMS sağlayıcıları ──────────────────────────────────────────────────
// Sipariş hazır bildirimi, vade hatırlatma, tahsilat takibi için.
export const SMS_PROVIDERS: ProviderDefinition[] = [
  {
    key:   'netgsm',
    label: 'Netgsm',
    description: 'Türkiye\'de en yaygın SMS gateway. SOAP/REST.',
    pricing: '~₺0.045 / SMS (hacim bazlı)',
    website: 'https://www.netgsm.com.tr',
    fields: [
      { key: 'username', label: 'Kullanıcı Kodu', type: 'text', required: true,
        helpText: '10 haneli kullanıcı kodu (genelde GSM numaranız).' },
      { key: 'password', label: 'API Şifresi', type: 'password', required: true,
        helpText: 'Panel → Ayarlar → API Bilgileri.' },
      { key: 'sender',   label: 'Gönderici Adı (Başlık)', type: 'text', required: true,
        placeholder: 'DENTALLAB', helpText: 'BTK onaylı 11 karaktere kadar başlık.' },
    ],
    implemented: false,
  },
  {
    key:   'iletimerkezi',
    label: 'İleti Merkezi',
    description: 'Alternatif Türk SMS sağlayıcısı, REST API.',
    pricing: '~₺0.05 / SMS',
    website: 'https://www.iletimerkezi.com',
    fields: [
      { key: 'username', label: 'Kullanıcı Adı', type: 'text',     required: true },
      { key: 'password', label: 'Şifre',         type: 'password', required: true },
      { key: 'sender',   label: 'Gönderici Adı', type: 'text',     required: true },
    ],
    implemented: false,
  },
  {
    key:   'twilio-sms',
    label: 'Twilio SMS',
    description: 'Uluslararası için Twilio. Türkiye için pahalı.',
    pricing: '$0.05+ / SMS',
    website: 'https://www.twilio.com',
    fields: [
      { key: 'account_sid', label: 'Account SID', type: 'text', required: true },
      { key: 'auth_token',  label: 'Auth Token',  type: 'password', required: true },
      { key: 'from_number', label: 'Gönderici Numara', type: 'text', required: true, placeholder: '+15551234567' },
    ],
    implemented: false,
  },
];

// ─── Harita sağlayıcıları (kurye routing) ──────────────────────────────
export const MAPS_PROVIDERS: ProviderDefinition[] = [
  {
    key:   'mapbox',
    label: 'Mapbox',
    description: 'Kurye haritası ve routing — şu anda aktif kullanılan.',
    pricing: '50K istek/ay ücretsiz · sonra istek başı',
    website: 'https://www.mapbox.com',
    fields: [
      { key: 'access_token', label: 'Access Token', type: 'password', required: true,
        placeholder: 'pk.ey...',
        helpText: 'mapbox.com → Account → Tokens. Public token kullan.' },
      { key: 'style_url', label: 'Style URL', type: 'text',
        placeholder: 'mapbox://styles/mapbox/streets-v12',
        helpText: 'Opsiyonel — özel stil URL\'i.' },
    ],
    implemented: true,
  },
  {
    key:   'google-maps',
    label: 'Google Maps / Places',
    description: 'Harita + adres arama (Places). Kurye teslim adresini ünvanla bulmak için.',
    pricing: '$200/ay ücretsiz kredi, sonra istek başı',
    website: 'https://console.cloud.google.com',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true,
        helpText: 'Google Cloud → APIs: Places API (New) açık olmalı (adres arama için). İstersen Maps + Directions de.' },
    ],
    implemented: true,
  },
];

// ─── Storage sağlayıcıları (opsiyonel, default Supabase Storage) ────────
export const STORAGE_PROVIDERS: ProviderDefinition[] = [
  {
    key:   'aws-s3',
    label: 'Amazon S3',
    description: 'Büyük hacimli dosyalar için. Default: Supabase Storage.',
    pricing: '$0.023/GB/ay + transfer',
    website: 'https://aws.amazon.com/s3',
    fields: [
      { key: 'access_key_id',     label: 'Access Key ID',     type: 'password', required: true },
      { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true },
      { key: 'region',            label: 'Region',            type: 'text', required: true, placeholder: 'eu-central-1' },
      { key: 'bucket',            label: 'Bucket',            type: 'text', required: true },
    ],
    implemented: false,
  },
  {
    key:   'cloudflare-r2',
    label: 'Cloudflare R2',
    description: 'S3 uyumlu, transfer ücretsiz. Düşük maliyet.',
    pricing: '$0.015/GB/ay · transfer ücretsiz',
    website: 'https://www.cloudflare.com/products/r2/',
    fields: [
      { key: 'account_id',        label: 'Account ID',        type: 'text', required: true },
      { key: 'access_key_id',     label: 'Access Key ID',     type: 'password', required: true },
      { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true },
      { key: 'bucket',            label: 'Bucket',            type: 'text', required: true },
    ],
    implemented: false,
  },
];

// Kurye entegrasyonları — her lab KENDİ üyeliğiyle bağlanır (lab-bazlı, Siman geneli değil).
export const COURIER_PROVIDERS: ProviderDefinition[] = [
  {
    key:   'banabikurye',
    label: 'BanaBiKurye',
    description: 'Gerçek zamanlı kurye altyapısı. Lab kendi BanaBiKurye üyeliğinin token\'ını girer; kurye çağrısı/ücreti lab\'a aittir.',
    website: 'https://banabikurye.com',
    fields: [
      { key: 'auth_token', label: 'API Token (X-DV-Auth-Token)', type: 'password', required: true,
        helpText: 'BanaBiKurye → Personal Cabinet → API token. Gizli tutun.' },
      { key: 'environment', label: 'Ortam', type: 'select', required: true, options: [
        { value: 'sandbox',    label: 'Test (sandbox)' },
        { value: 'production', label: 'Canlı (production)' },
      ]},
      // Kurye ALIŞ noktası — lab adresi. Her çağrıda buradan kullanılır.
      // type='address': Google Maps (Places) önerili; seçilince enlem/boylam otomatik dolar.
      { key: 'pickup_address', label: 'Alış adresi (lab)', type: 'address', required: true,
        latKey: 'pickup_lat', lngKey: 'pickup_lng',
        placeholder: 'Adres ara — cadde, no, ilçe/il', helpText: 'Google Maps’ten seçin; konum (enlem/boylam) otomatik dolar.' },
      { key: 'pickup_phone', label: 'Alış telefonu', type: 'text', required: true,
        placeholder: '+90 5xx xxx xx xx', helpText: 'Kuryenin arayacağı lab telefonu.' },
      { key: 'pickup_contact_name', label: 'Alış kişi adı', type: 'text',
        placeholder: 'Lab adı / yetkili', helpText: 'Boşsa lab adı kullanılır.' },
      { key: 'pickup_lat', label: 'Alış enlem (opsiyonel)', type: 'text', placeholder: '40.901342' },
      { key: 'pickup_lng', label: 'Alış boylam (opsiyonel)', type: 'text', placeholder: '29.123456' },
    ],
    implemented: true,
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
  // id yoksa: aynı (lab_id, type, provider) kaydı zaten olabilir →
  // düz INSERT unique constraint'i (provider_credentials_lab_id_type_provider_key)
  // ihlal eder. UPSERT ile mevcut kaydı güncelle, yoksa ekle.
  return supabase.from('provider_credentials')
    .upsert({
      type:          input.type,
      provider:      input.provider,
      display_name:  input.display_name ?? null,
      environment:   input.environment,
      credentials:   input.credentials,
      is_active:     input.is_active ?? false,
      notes:         input.notes ?? null,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'lab_id,type,provider' })
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
export async function testCredential(
  id: string,
  type: IntegrationType,
  provider: string,
  _credentials: Record<string, any>,
  /** Kaydın ÜST DÜZEY environment kolonu — yetkili kaynak budur.
   *  Eskiden yalnız credentials sözlüğüne bakılıyordu; o alan formda yoksa
   *  sessizce 'sandbox'a düşüp production token'ıyla test edilince
   *  "Bağlantı reddedildi: invalid_auth_token" veriyordu (ölçüldü: aynı token
   *  production'da ok:true dönüyor). */
  environment?: string | null,
) {
  // Şimdilik basit sandbox: provider 'demo' ise her zaman ok.
  // Gerçek provider eklenince provider'ın kendi test endpoint'i çağrılır.
  if (provider === 'demo') {
    await supabase.rpc('record_provider_test', { p_id: id, p_ok: true, p_message: 'Demo provider — bağlantı simüle edildi' });
    return { ok: true, message: 'Demo provider — başarılı' };
  }

  // BanaBiKurye — edge function ile gerçek bağlantı testi (GET /client).
  // auth_token tarayıcıdan CORS'a takılır → edge function üzerinden server-side çağrı.
  if (type === 'courier' && provider === 'banabikurye') {
    try {
      const { data, error } = await supabase.functions.invoke('banabikurye-dispatch', {
        body: {
          action: 'test',
          auth_token:  _credentials?.auth_token,
          environment: environment ?? _credentials?.environment ?? 'sandbox',
        },
      });
      const ok = !error && (data as any)?.ok === true;
      const msg = ok
        ? `Bağlantı başarılı${(data as any)?.client_name ? ' — ' + (data as any).client_name : ''}`
        : ((data as any)?.message ?? error?.message ?? 'Bağlantı başarısız');
      await supabase.rpc('record_provider_test', { p_id: id, p_ok: ok, p_message: msg });
      return { ok, message: msg };
    } catch (e: any) {
      const msg = 'Test hatası: ' + (e?.message ?? String(e));
      await supabase.rpc('record_provider_test', { p_id: id, p_ok: false, p_message: msg });
      return { ok: false, message: msg };
    }
  }

  // WhatsApp Business Cloud (Meta) — edge function ile Graph API doğrulaması.
  // Token tarayıcıdan Graph API'ye CORS'a takılır → server-side test.
  if (type === 'messaging' && provider === 'whatsapp-cloud') {
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
        body: {
          action:          'test',
          phone_number_id: _credentials?.phone_number_id,
          access_token:    _credentials?.access_token,
        },
      });
      const ok = !error && (data as any)?.ok === true;
      const msg = ok
        ? ((data as any)?.message ?? 'Bağlantı başarılı')
        : ((data as any)?.message ?? error?.message ?? 'Bağlantı başarısız');
      await supabase.rpc('record_provider_test', { p_id: id, p_ok: ok, p_message: msg });
      return { ok, message: msg };
    } catch (e: any) {
      const msg = 'Test hatası: ' + (e?.message ?? String(e));
      await supabase.rpc('record_provider_test', { p_id: id, p_ok: false, p_message: msg });
      return { ok: false, message: msg };
    }
  }

  // Google Maps/Places — anahtar kurye adres aramasında doğrulanır (ayrı test endpoint'i yok)
  if (type === 'maps' && provider === 'google-maps') {
    await supabase.rpc('record_provider_test', { p_id: id, p_ok: true, p_message: 'Anahtar kaydedildi — kurye adres aramasında doğrulanır.' });
    return { ok: true, message: 'Anahtar kaydedildi — kurye adres aramasında kullanılır (Places API açık olmalı).' };
  }

  // TODO: Edge Function çağır → "test connection" endpoint'i
  // await supabase.functions.invoke(`${type}-test`, { body: { provider, credentials } })
  await supabase.rpc('record_provider_test', {
    p_id: id, p_ok: false,
    p_message: 'Bu provider için test endpoint\'i henüz aktif değil (Edge Function gerekli)',
  });
  return { ok: false, message: 'Test endpoint\'i Edge Function ile etkinleştirilecek' };
}

// ─── WhatsApp test mesajı gönder (outbound doğrulama) ────────────────────
// credentials form'dan gelir (phone_number_id + access_token). template=true →
// hello_world onaylı şablonu (ilk temas için güvenli), aksi halde serbest metin
// (yalnız alıcı son 24s içinde yazdıysa çalışır).
export async function sendWhatsAppTest(
  credentials: Record<string, any>,
  to: string,
  opts?: { text?: string; template?: boolean; templateName?: string; templateLang?: string },
): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
      body: {
        action:          'send_test',
        phone_number_id: credentials?.phone_number_id,
        access_token:    credentials?.access_token,
        to,
        text:            opts?.text,
        template:        opts?.template ?? false,
        template_name:   opts?.templateName,
        template_lang:   opts?.templateLang,
      },
    });
    if (error) return { ok: false, message: error.message ?? 'Gönderilemedi' };
    return { ok: (data as any)?.ok === true, message: (data as any)?.message ?? 'Yanıt yok' };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? String(e) };
  }
}

// WhatsApp webhook'u otomatik bağla (subscribed_apps + override_callback_uri).
// Meta UI'ya girmeden callback URL + verify token + messages aboneliğini kurar.
export async function subscribeWhatsAppWebhook(
  credentials: Record<string, any>,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-webhook', {
      body: {
        action:              'subscribe',
        business_account_id: credentials?.business_account_id,
        access_token:        credentials?.access_token,
        verify_token:        credentials?.verify_token,
      },
    });
    if (error) return { ok: false, message: error.message ?? 'Bağlanamadı' };
    return { ok: (data as any)?.ok === true, message: (data as any)?.message ?? 'Yanıt yok' };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? String(e) };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────
export function getProvidersByType(type: IntegrationType): ProviderDefinition[] {
  switch (type) {
    case 'efatura':   return EFATURA_PROVIDERS;
    case 'payment':   return PAYMENT_PROVIDERS;
    case 'ocr':       return OCR_PROVIDERS;
    case 'messaging': return MESSAGING_PROVIDERS;
    case 'sms':       return SMS_PROVIDERS;
    case 'maps':      return MAPS_PROVIDERS;
    case 'storage':   return STORAGE_PROVIDERS;
    default:          return [];
  }
}

export function findProviderDef(type: IntegrationType, key: string): ProviderDefinition | undefined {
  return getProvidersByType(type).find(p => p.key === key);
}
