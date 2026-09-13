/**
 * logDetail — aktivite kaydının AYRINTISI.
 *
 * NEDEN: `activity_logs.metadata` (jsonb) her satırda dolu geliyordu ama hiçbir
 * ekranda GÖSTERİLMİYORDU. Log sayfası yalnız "kim · ne yaptı · ne zaman"
 * satırını basıyor, "hangi siparişte, hangi aşamada, ne kadar malzeme, hangi
 * durumdan hangi duruma" bilgisi veritabanında durup ekrana çıkmıyordu.
 *
 * Burası ham jsonb'yi OKUNUR gerçeklere çevirir:
 *   • bilinen anahtarlar Türkçe etiketle ve biçimlenmiş değerle,
 *   • durum kodları (`teslimata_hazir`) insan diline (`Kuryeye Teslim Edildi`),
 *   • miktar + birim, eski → yeni gibi çiftler TEK satırda,
 *   • sipariş düzenlemesindeki `fields` anlık görüntüsü kendi bloğunda,
 *   • eşlenmemiş her anahtar yine de listelenir → hiçbir veri gizlenmez.
 */
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { STATUS_TONES } from '../../core/theme/mobileTheme';
import { localeTag } from '../../core/i18n';
import { autoT } from '../../core/i18n/autoTranslate';
import { useInkUI } from '../../core/theme/inkScale';

export interface ActivityLogLike {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface LogFact { label: string; value: string; wide?: boolean }

// ─── Sözlükler ───────────────────────────────────────────────────────────────

/** Kayıt türü → okunur ad. */
export const ENTITY_LABEL: Record<string, string> = {
  auth:             'Oturum',
  work_order:       'Sipariş',
  stage:            'Aşama',
  order_stage:      'Aşama',
  material:         'Malzeme',
  stock_movement:   'Stok hareketi',
  photo:            'Dosya',
  message:          'Mesaj',
  profile:          'Kullanıcı',
  clinic:           'Klinik',
  doctor:           'Hekim',
  whatsapp_session: 'WhatsApp',
};

/** Aşama/iş durumu kodları — STATUS_TONES'ta olmayan teknik değerler. */
const EXTRA_STATUS: Record<string, string> = {
  aktif:        'Aktif',
  bekliyor:     'Bekliyor',
  durakladi:    'Duraklatıldı',
  tamamlandi:   'Tamamlandı',
  iptal:        'İptal',
  asamada:      'Aşamada',
  planlandi:    'Planlandı',
  makine_bekliyor: 'Makine bekliyor',
};

/** Durum kodunu insan diline çevirir; bilinmiyorsa kodu olduğu gibi verir. */
export function statusLabel(code: any): string {
  if (code == null || code === '') return '—';
  const k = String(code);
  return STATUS_TONES[k]?.label ?? EXTRA_STATUS[k] ?? k;
}

/** metadata anahtarı → Türkçe etiket. Listede olmayan anahtar da gösterilir. */
const KEY_LABEL: Record<string, string> = {
  order_no:      'Sipariş no',
  patient:       'Hasta',
  work_type:     'İş tipi',
  station:       'İstasyon',
  stage:         'Aşama',
  item:          'Malzeme',
  note:          'Not',
  caption:       'Dosya',
  phone:         'Telefon',
  basis:         'Dayanak',
  target_user:   'Hedef kullanıcı',
  target_type:   'Hedef rol',
  order_id:      'Sipariş kaydı',
  reversed_movement_id: 'Geri alınan hareket',
};

/** Sipariş düzenlemesindeki `fields` anlık görüntüsünün alan adları. */
const FIELD_LABEL: Record<string, string> = {
  patient_name:        'Hasta adı',
  patient_id:          'Hasta no',
  patient_dob:         'Doğum tarihi',
  patient_city:        'Şehir',
  patient_gender:      'Cinsiyet',
  patient_nationality: 'Uyruk',
  work_type:           'İş tipi',
  shade:               'Renk',
  tooth_numbers:       'Dişler',
  delivery_date:       'Teslim tarihi',
  delivery_method:     'Teslim yöntemi',
  is_urgent:           'Acil',
  notes:               'Notlar',
};

const ROLE_TR: Record<string, string> = {
  lab: 'Lab', admin: 'Yönetici', technician: 'Teknisyen', doctor: 'Hekim',
  clinic: 'Klinik', clinic_admin: 'Klinik yöneticisi', clinic_secretary: 'Klinik sekreteri',
  courier: 'Kurye',
};

// ─── Değer biçimleme ─────────────────────────────────────────────────────────

/** 0.01250000 → "0,0125" · 3.0 → "3" — ham ondalık kuyruğu okunmaz. */
function fmtNum(n: any): string {
  const v = typeof n === 'string' ? Number(n) : n;
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(n);
  const s = v.toLocaleString(localeTag(), { maximumFractionDigits: 4 });
  return s;
}

function fmtValue(key: string, v: any): string {
  if (v == null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // ISO tarih → yerel gün.ay.yıl
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00');
    if (!isNaN(d.getTime())) return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'long', year: 'numeric' });
  }
  if (key === 'type') return s === 'OUT' ? 'Çıkış' : s === 'IN' ? 'Giriş' : s;
  if (key === 'target_type') return ROLE_TR[s] ?? s;
  return s;
}

/** UUID'yi kısaltır — teknik referans lazım ama satırı doldurmasın. */
function shortId(v: any): string {
  const s = String(v ?? '');
  return s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s;
}

// ─── Gerçek listesi ──────────────────────────────────────────────────────────

/**
 * Bir log satırının TÜM ayrıntısını sıralı "etiket → değer" çiftlerine çevirir.
 * `fields` (sipariş anlık görüntüsü) ayrı döner: kendi başlığı altında çizilir.
 */
export function buildLogFacts(log: ActivityLogLike): { facts: LogFact[]; fields: LogFact[] } {
  const m: Record<string, any> = log.metadata ?? {};
  const used = new Set<string>();
  const facts: LogFact[] = [];
  const push = (label: string, value: string, wide?: boolean) => {
    if (value && value !== '—') facts.push({ label, value, wide });
  };

  // 1) Bağlam — hangi iş, kim için
  if (m.order_no)  { used.add('order_no');  push('Sipariş no', String(m.order_no)); }
  if (m.patient)   { used.add('patient');   push('Hasta', String(m.patient)); }
  if (m.work_type) { used.add('work_type'); push('İş tipi', String(m.work_type)); }
  if (m.station)   { used.add('station');   push('İstasyon', String(m.station)); }
  if (m.stage)     { used.add('stage');     push('Aşama', String(m.stage)); }

  // 2) Durum geçişleri — "önceki → yeni" TEK satırda, kodlar çevrilerek
  if (m.old_status || m.new_status) {
    used.add('old_status'); used.add('new_status');
    push('Durum', `${statusLabel(m.old_status)} → ${statusLabel(m.new_status)}`);
  }
  if (m.from || m.status) {
    used.add('from'); used.add('status');
    push('Aşama durumu', m.from && m.status
      ? `${statusLabel(m.from)} → ${statusLabel(m.status)}`
      : statusLabel(m.from ?? m.status));
  }

  // 3) Malzeme / stok
  if (m.item) { used.add('item'); push('Malzeme', String(m.item), true); }
  if (m.qty != null) {
    used.add('qty'); used.add('unit');
    push('Miktar', `${fmtNum(m.qty)}${m.unit ? ' ' + m.unit : ''}`);
  }
  if (m.type) { used.add('type'); push('Hareket', fmtValue('type', m.type)); }
  if (m.old_qty != null || m.new_qty != null) {
    used.add('old_qty'); used.add('new_qty'); used.add('old_unit'); used.add('new_unit');
    const a = m.old_qty != null ? `${fmtNum(m.old_qty)}${m.old_unit ? ' ' + m.old_unit : ''}` : '—';
    const b = m.new_qty != null ? `${fmtNum(m.new_qty)}${m.new_unit ? ' ' + m.new_unit : ''}` : '—';
    push('Miktar', `${a} → ${b}`);
  }

  // 4) Diğer bilinen anahtarlar
  for (const k of ['caption', 'note', 'phone', 'basis', 'target_user', 'target_type']) {
    if (m[k] != null && m[k] !== '') { used.add(k); push(KEY_LABEL[k] ?? k, fmtValue(k, m[k]), k === 'note' || k === 'caption'); }
  }
  if (m.has_attachment != null) { used.add('has_attachment'); push('Ek dosya', m.has_attachment ? 'Var' : 'Yok'); }
  if (m.items_changed != null)  { used.add('items_changed');  push('Sipariş kalemleri', m.items_changed ? 'Değişti' : 'Değişmedi'); }
  if (m.item_changed != null)   { used.add('item_changed');   push('Kalem', m.item_changed ? 'Değişti' : 'Değişmedi'); }
  if (m.stage_changed != null)  { used.add('stage_changed');  push('Aşama', m.stage_changed ? 'Değişti' : 'Değişmedi'); }
  for (const k of ['order_id', 'reversed_movement_id']) {
    if (m[k]) { used.add(k); push(KEY_LABEL[k] ?? k, shortId(m[k])); }
  }

  // 5) Eşlenmemiş her anahtar — hiçbir veri gizlenmesin
  used.add('fields');
  for (const k of Object.keys(m)) {
    if (used.has(k)) continue;
    push(KEY_LABEL[k] ?? k, fmtValue(k, m[k]), typeof m[k] === 'object');
  }

  // 6) Sipariş düzenlemesi anlık görüntüsü
  const fields: LogFact[] = [];
  const f = m.fields;
  if (f && typeof f === 'object' && !Array.isArray(f)) {
    const order = Object.keys(FIELD_LABEL).filter(k => k in f).concat(
      Object.keys(f).filter(k => !(k in FIELD_LABEL)),
    );
    for (const k of order) {
      const val = fmtValue(k, (f as any)[k]);
      if (val && val !== '—') fields.push({ label: FIELD_LABEL[k] ?? k, value: val, wide: k === 'notes' });
    }
  }

  return { facts, fields };
}

/** Saniyeli tam zaman damgası — "ne zaman" sorusunun kesin cevabı. */
export function fullTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(localeTag(), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─── Görsel ──────────────────────────────────────────────────────────────────

function FactGrid({ items }: { items: LogFact[] }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((f, i) => (
        <View
          key={`${f.label}-${i}`}
          style={{
            minWidth: f.wide ? '100%' : 132,
            flexGrow: f.wide ? 1 : 0,
            maxWidth: '100%',
            paddingHorizontal: 10, paddingVertical: 7,
            borderRadius: 10,
            backgroundColor: U.surfaceSoft,
            borderWidth: 1, borderColor: U.hairline,
          }}
        >
          <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: U.ink[400] }}>
            {autoT(f.label)}
          </Text>
          <Text style={{ fontSize: 12.5, color: U.ink[900], marginTop: 2 }} selectable>
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Genişletilmiş satırın ayrıntı gövdesi: bağlam gerçekleri + sipariş anlık
 * görüntüsü + teknik künye (kayıt/aktör kimlikleri, tam zaman).
 */
export function LogDetail({ log }: { log: ActivityLogLike }) {
  const U = useInkUI();
  const { facts, fields } = buildLogFacts(log);
  const entity = log.entity_type ? (ENTITY_LABEL[log.entity_type] ?? log.entity_type) : null;

  const tech: LogFact[] = [
    { label: 'Zaman', value: fullTimestamp(log.created_at) },
    ...(entity ? [{ label: 'Kayıt türü', value: autoT(entity) }] : []),
    ...(log.entity_label ? [{ label: 'Kayıt', value: log.entity_label, wide: log.entity_label.length > 28 }] : []),
    { label: 'Yapan', value: `${log.actor_name} · ${ROLE_TR[log.actor_type] ?? log.actor_type}` },
    ...(log.entity_id ? [{ label: 'Kayıt kimliği', value: shortId(log.entity_id) }] : []),
    ...(log.actor_id ? [{ label: 'Kullanıcı kimliği', value: shortId(log.actor_id) }] : []),
    { label: 'Log kimliği', value: shortId(log.id) },
  ];

  const Section = ({ title, items }: { title: string; items: LogFact[] }) =>
    items.length === 0 ? null : (
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[400] }}>
          {autoT(title)}
        </Text>
        <FactGrid items={items} />
      </View>
    );

  return (
    <View style={{ gap: 12, paddingTop: 10 }}>
      <Section title="Ayrıntı" items={facts} />
      <Section title="Sipariş bilgileri" items={fields} />
      <Section title="Künye" items={tech} />
      {Platform.OS === 'web' && log.metadata && Object.keys(log.metadata).length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[400] }}>
            {autoT('Ham kayıt')}
          </Text>
          <Text
            selectable
            style={{
              fontSize: 11, lineHeight: 16, color: U.ink[500],
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              backgroundColor: U.surfaceSoft, borderRadius: 10,
              borderWidth: 1, borderColor: U.hairline,
              paddingHorizontal: 10, paddingVertical: 8,
            } as any}
          >
            {JSON.stringify(log.metadata, null, 2)}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Satırın ALTINDA tek satırlık özet — genişletmeden de bağlam görünsün.
 * Örn: "NEX-2026-0175 · Gözde Ateş · Glaze / Polisaj · 0,0125 Adet".
 */
export function logSummaryLine(log: ActivityLogLike): string | null {
  const { facts } = buildLogFacts(log);
  if (facts.length === 0) return null;
  return facts.slice(0, 4).map(f => f.value).join(' · ');
}
