/**
 * Sipariş "Geçmiş" sekmesinin saf modeli (import yok → node --test ile sınanır).
 *
 * Satırlar `order_history(p_order)` RPC'sinden gelir (20261027100000 / 110000): her satır
 * zaman + tür kodu + kategori + kişi + ayrıntı. Başlıklar burada SABİT Türkçe metindir; ekran
 * `autoT()` ile çevirir (sözlük birebir eşleşir). Değişken değerler başlığa gömülmez, `historyParts`
 * ile türlü parçalar olarak döner: ekran tarihi lab saat diliminde, durumu `statusLabel`, alanı
 * `FIELD_LABELS` + `autoT`, bekleme nedenini `holdCategoryLabel` ile yazar.
 */

export type HistoryCategory = 'teslim' | 'notlar_sohbet' | 'uretim' | 'diger';
export type HistoryChip = 'all' | 'teslim' | 'notlar_sohbet' | 'uretim';

export type HistoryRow = {
  at: string;
  kind: string;
  category: HistoryCategory;
  actor_name: string | null;
  detail: Record<string, any>;
  link_order_id: string | null;
  link_order_no: string | null;
};

/** Ayrıntı satırının parçaları:
 *  text = çevrilecek sabit Türkçe · raw = olduğu gibi · date = gün/zaman (fmtDay) ·
 *  status = durum kodu · field = alan kodu (FIELD_LABELS) · holdCat = bekleme kategorisi ·
 *  money = "tutar PARA" · arrow = → · sep = ayraç */
export type Part =
  | { t: 'text'; v: string }
  | { t: 'raw'; v: string }
  | { t: 'date'; v: string }
  | { t: 'status'; v: string }
  | { t: 'field'; v: string }
  | { t: 'holdCat'; v: string }
  | { t: 'money'; v: string }
  | { t: 'arrow'; v: string }
  | { t: 'sep'; v: string };

export const HISTORY_CHIPS: { key: HistoryChip; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'teslim', label: 'Teslim' },
  { key: 'notlar_sohbet', label: 'Notlar ve sohbet' },
  { key: 'uretim', label: 'Üretim' },
];

export const HISTORY_KINDS = [
  'created', 'doctor_note', 'delivery_date_changed', 'field_changed', 'items_changed', 'status_changed',
  'order_cancelled', 'stage_assigned', 'stage_started', 'stage_completed', 'stage_approved', 'stage_skipped',
  'stage_reassigned', 'stage_rejected', 'material_used', 'hold_started', 'hold_ended', 'delivery_assigned',
  'delivery_picked_up', 'delivery_delivered', 'delivery_cancelled', 'message', 'photo', 'change_request',
  'cancel_request', 'prova_sent', 'prova_returned', 'prova_client_returned', 'appointment', 'approval_requested', 'approval_decided', 'implant_part',
  'review', 'invoice_issued', 'payment', 'revision_opened', 'revision_of', 'continuation_opened', 'continuation_of',
  'scan',
] as const;

/** Randevu kaydının eylem adı (log action) → geçmiş başlığı. */
export const APPOINTMENT_TITLES: Record<string, string> = {
  'Randevu ekledi': 'Randevu eklendi',
  'Randevu değiştirdi': 'Randevu değişti',
  'Randevu sildi': 'Randevu silindi',
  'Randevu önerdi': 'Randevu önerildi',
  'Randevu önerisini onayladı': 'Randevu önerisi onaylandı',
  'Randevu önerisini reddetti': 'Randevu önerisi reddedildi',
};

export const FIELD_LABELS: Record<string, string> = {
  patient_name: 'Hasta adı',
  patient_age: 'Hasta yaşı',
  work_type: 'İş tipi',
  tooth_numbers: 'Diş numaraları',
  shade: 'Renk',
  measurement_type: 'Ölçü türü',
  model_type: 'Model türü',
  delivery_method: 'Teslim yöntemi',
  delivery_date: 'Teslim tarihi',
  doctor_id: 'Hekim',
  is_urgent: 'Acil',
  notes: 'Hekim notu',
  lab_notes: 'Lab notu',
  implant_brand: 'İmplant markası',
  implant_teeth: 'İmplant dişleri',
  implant_details: 'İmplant ayrıntısı',
  status: 'Durum',
};

export const PURPOSE_LABELS: Record<string, string> = {
  teslimat: 'Teslimat',
  eksik_parca: 'Eksik parça',
  model_alma: 'Model alma',
  prova_donus: 'Prova dönüşü',
  diger: 'Diğer gidiş',
};

export const DIRECTION_LABELS: Record<string, string> = {
  lab_to_clinic: 'Lab → Klinik',
  clinic_to_lab: 'Klinik → Lab',
  lab_to_other: 'Lab → Diğer',
  other_to_lab: 'Diğer → Lab',
};

const DEFAULT_TZ = 'Europe/Istanbul';
const SEP: Part = { t: 'sep', v: ' · ' };
const ARROW: Part = { t: 'arrow', v: '→' };

function partsOf(d: Date, tz: string, locale: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  let fmt: Intl.DateTimeFormat;
  try { fmt = new Intl.DateTimeFormat(locale, { ...opts, timeZone: tz }); }
  catch { fmt = new Intl.DateTimeFormat(locale, { ...opts, timeZone: DEFAULT_TZ }); }
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

function gregYear(d: Date, tz: string): string {
  return partsOf(d, tz, 'en-US', { year: 'numeric' }).year ?? '';
}

/** "12 Eki 14:32" — lab saat diliminde; başka yıldaysa "30 Ara 2025 13:00". */
export function fmtStamp(iso: string, tz: string | null | undefined, locale: string, nowIso?: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const zone = tz || DEFAULT_TZ;
  const p = partsOf(d, zone, locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const now = nowIso ? new Date(nowIso) : new Date();
  const year = gregYear(d, zone) !== gregYear(now, zone) ? ` ${p.year ?? ''}` : '';
  return `${p.day} ${p.month}${year} ${p.hour}:${p.minute}`;
}

/** Gün: "18 Eki". YYYY-MM-DD takvim günü olarak (kaydırılmaz); zaman damgası lab gününe çevrilir. */
export function fmtDay(v: string, tz: string | null | undefined, locale: string, nowIso?: string): string {
  if (!v) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v);
  const d = dateOnly ? new Date(`${v}T12:00:00Z`) : new Date(v);
  if (isNaN(d.getTime())) return v;
  const zone = dateOnly ? 'UTC' : (tz || DEFAULT_TZ);
  const p = partsOf(d, zone, locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const now = nowIso ? new Date(nowIso) : new Date();
  const year = gregYear(d, zone) !== gregYear(now, tz || DEFAULT_TZ) ? ` ${p.year ?? ''}` : '';
  return `${p.day} ${p.month}${year}`;
}

/** Popup satırı: yalnız saat "14:32" (gün, grup başlığında). */
export function fmtTime(iso: string, tz: string | null | undefined, locale: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = partsOf(d, tz || DEFAULT_TZ, locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}:${p.minute}`;
}

/** Gün başlığı: "12 Ekim, Pazartesi"; başka yıldaysa "30 Aralık 2025, Salı". */
export function fmtDayHeader(iso: string, tz: string | null | undefined, locale: string, nowIso?: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const zone = tz || DEFAULT_TZ;
  const p = partsOf(d, zone, locale, { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
  const now = nowIso ? new Date(nowIso) : new Date();
  const year = gregYear(d, zone) !== gregYear(now, zone) ? ` ${p.year ?? ''}` : '';
  return `${p.day} ${p.month}${year}, ${p.weekday}`;
}

/** Lab gününe göre gruplar (anahtar YYYY-MM-DD); satır sırası korunur. */
export function groupByDay(rows: HistoryRow[], tz: string | null | undefined): { key: string; rows: HistoryRow[] }[] {
  const out: { key: string; rows: HistoryRow[] }[] = [];
  const zone = tz || DEFAULT_TZ;
  for (const r of rows) {
    const d = new Date(r.at);
    const p = isNaN(d.getTime()) ? null : partsOf(d, zone, 'en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const key = p ? `${p.year}-${p.month}-${p.day}` : '';
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else out.push({ key, rows: [r] });
  }
  return out;
}

/** Çiplerdeki sayılar. */
export function chipCounts(rows: HistoryRow[]): Record<HistoryChip, number> {
  const c: Record<HistoryChip, number> = { all: rows.length, teslim: 0, notlar_sohbet: 0, uretim: 0 };
  for (const r of rows) if (r.category !== 'diger') c[r.category] += 1;
  return c;
}

export function filterRows(rows: HistoryRow[], chip: HistoryChip): HistoryRow[] {
  if (chip === 'all') return rows;
  return rows.filter((r) => r.category === chip);
}

/** Sabit Türkçe başlık; ekran autoT() uygular. */
export function historyTitle(row: HistoryRow): string {
  const d = row.detail ?? {};
  switch (row.kind) {
    case 'created': return 'Sipariş oluşturuldu';
    case 'doctor_note': return 'Hekim notu';
    case 'delivery_date_changed': return 'Teslim tarihi değişti';
    case 'field_changed': return 'Sipariş düzenlendi';
    case 'items_changed': return 'Kalemler düzenlendi';
    case 'status_changed': return 'Durum değişti';
    case 'order_cancelled': return 'Sipariş iptal edildi';
    case 'stage_assigned': return 'Aşama atandı';
    case 'stage_started': return 'Aşama başladı';
    case 'stage_completed': return 'Aşama tamamlandı';
    case 'stage_approved': return 'Aşama onaylandı';
    case 'stage_skipped': return 'Aşama atlandı';
    case 'stage_reassigned': return 'Aşama devredildi';
    case 'stage_rejected': return 'Kalite kontrolde reddedildi';
    case 'material_used': return 'Malzeme kullanıldı';
    case 'hold_started': return 'Beklemeye alındı';
    case 'hold_ended': return 'Devam ettirildi';
    case 'delivery_assigned': return 'Kurye atandı';
    case 'delivery_picked_up': return 'Kurye teslim aldı';
    case 'delivery_delivered': return 'Kurye teslim etti';
    case 'delivery_cancelled': return 'Kurye gönderimi iptal edildi';
    case 'message': return 'Mesaj';
    case 'photo': return 'Dosya yüklendi';
    case 'change_request': return d.step === 'decided' ? 'Değişiklik talebi yanıtlandı' : 'Değişiklik talebi';
    case 'cancel_request': return d.step === 'decided' ? 'İptal talebi yanıtlandı' : 'İptal talebi';
    case 'prova_sent': return 'Prova gönderildi';
    case 'prova_returned': return 'Prova döndü';
    case 'prova_client_returned': return 'Hekim provayı geri gönderdi';
    case 'appointment': return APPOINTMENT_TITLES[String(d.action ?? '')] ?? 'Randevu';
    case 'approval_requested': return 'Hekim onayı istendi';
    case 'approval_decided':
      if (d.status === 'approved') return 'Hekim onayladı';
      if (d.status === 'rejected' || d.status === 'revision_requested' || d.status === 'changes_requested') return 'Hekim düzeltme istedi';
      return 'Hekim onayı yanıtlandı';
    case 'implant_part':
      switch (d.step) {
        case 'ordered': return 'İmplant parçası sipariş edildi';
        case 'received': return 'İmplant parçası geldi';
        case 'returned': return 'İmplant parçası iade edildi';
        case 'cancelled': return 'İmplant parçası talebi iptal edildi';
        default: return 'İmplant parçası istendi';
      }
    case 'review': return 'Değerlendirme yapıldı';
    case 'invoice_issued': return 'Fatura kesildi';
    case 'payment': return 'Tahsilat alındı';
    case 'revision_opened': return 'Revizyon açıldı';
    case 'revision_of': return 'Revizyon olarak açıldı';
    case 'continuation_opened': return 'Devam siparişi açıldı';
    case 'continuation_of': return 'Devam siparişi olarak açıldı';
    // Tarama randevusu kararı (yalnız lab görür; order_history 20261028143000)
    case 'scan': {
      const a = String(d.action ?? '');
      if (a.startsWith('Tarama yeniden karar bekliyor')) return 'Tarama yeniden karar bekliyor';
      if (a === 'Tarama kararını geri aldı') return 'Tarama kararı geri alındı';
      return d.decision === 'yeni_siparis' ? 'Taramadan sipariş açıldı' : 'Tarama siparişe bağlandı';
    }
    default: return 'Kayıt';
  }
}

const has = (v: unknown) => v !== null && v !== undefined && v !== '';
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const money = (amount: unknown, cur: unknown): Part => ({ t: 'money', v: `${Number(amount) || 0}${has(cur) ? ` ${cur}` : ''}` });

function join(groups: Part[][]): Part[] {
  const out: Part[] = [];
  for (const g of groups) {
    if (!g.length) continue;
    if (out.length) out.push(SEP);
    out.push(...g);
  }
  return out;
}

function fieldValue(field: string, v: unknown): Part {
  if (!has(v)) return { t: 'raw', v: '—' };
  if (field === 'delivery_date') return { t: 'date', v: String(v) };
  if (field === 'status') return { t: 'status', v: String(v) };
  if (field === 'is_urgent') return { t: 'text', v: v === true || v === 'true' ? 'Evet' : 'Hayır' };
  if (Array.isArray(v)) return { t: 'raw', v: v.join(', ') };
  return { t: 'raw', v: clip(String(v), 60) };
}

function fieldParts(f: any): Part[] {
  const field = String(f?.field ?? '');
  if (!field) return [];
  const label: Part = { t: 'field', v: field };
  const isObj = (x: unknown) => x !== null && typeof x === 'object' && !Array.isArray(x);
  if (f.changed || isObj(f.old) || isObj(f.new) || !('old' in f || 'new' in f)) return [label];
  return [label, fieldValue(field, f.old), ARROW, fieldValue(field, f.new)];
}

function itemParts(it: any): Part[] {
  const op = it?.op;
  const out: Part[] = [
    { t: 'text', v: op === 'added' ? 'Eklendi' : op === 'removed' ? 'Çıkarıldı' : 'Değişti' },
    { t: 'raw', v: String(it?.service ?? '') },
  ];
  if (op === 'changed') {
    if (has(it.qty_old) && has(it.qty_new) && it.qty_old !== it.qty_new) out.push({ t: 'text', v: 'Adet' }, { t: 'raw', v: String(it.qty_old) }, ARROW, { t: 'raw', v: String(it.qty_new) });
    if ((it.teeth_old ?? '') !== (it.teeth_new ?? '')) out.push({ t: 'text', v: 'Diş' }, { t: 'raw', v: it.teeth_old || '—' }, ARROW, { t: 'raw', v: it.teeth_new || '—' });
    if (has(it.price_old) && has(it.price_new) && Number(it.price_old) !== Number(it.price_new)) out.push(money(it.price_old, it.currency), ARROW, money(it.price_new, it.currency));
  } else if (op === 'added') {
    if (has(it.qty_new)) out.push({ t: 'text', v: 'Adet' }, { t: 'raw', v: String(it.qty_new) });
    if (has(it.teeth_new)) out.push({ t: 'text', v: 'Diş' }, { t: 'raw', v: String(it.teeth_new) });
    if (has(it.price_new)) out.push(money(it.price_new, it.currency));
  } else if (op === 'removed') {
    if (has(it.price_old)) out.push(money(it.price_old, it.currency));
  }
  return out;
}

/** Depolama adı "<zaman>-<zaman>-<rastgele>-<asıl ad>" → asıl ad. */
function fileLabel(name: unknown): string {
  const s = String(name ?? '');
  const out = s.replace(/^(?:\d{10,}[-_])+(?:[a-z0-9]{6,16}[-_])?/i, '');
  return out || s;
}

function decision(status: unknown): Part {
  if (status === 'approved') return { t: 'text', v: 'Onaylandı' };
  if (status === 'rejected') return { t: 'text', v: 'Reddedildi' };
  return { t: 'raw', v: String(status ?? '') };
}

/** Ayrıntı satırı (başlığın altı). */
export function historyParts(row: HistoryRow): Part[] {
  const d = row.detail ?? {};
  const raw = (v: unknown): Part[] => (has(v) ? [{ t: 'raw', v: String(v) }] : []);
  switch (row.kind) {
    case 'created':
      return join([
        has(d.delivery_date) ? [{ t: 'text', v: 'Söz verilen teslim:' }, { t: 'date', v: String(d.delivery_date) }] : [],
        d.is_urgent ? [{ t: 'text', v: 'Acil' }] : [],
      ]);
    case 'doctor_note':
    case 'message':
      return join([raw(d.text), has(d.attachment_name) ? [{ t: 'text', v: 'Ek:' }, { t: 'raw', v: String(d.attachment_name) }] : []]);
    case 'delivery_date_changed':
      return [{ t: 'date', v: String(d.old ?? '') }, ARROW, { t: 'date', v: String(d.new ?? '') }];
    case 'field_changed':
      return join((Array.isArray(d.fields) ? d.fields : []).map(fieldParts));
    case 'items_changed':
      return join((Array.isArray(d.items) ? d.items : []).map(itemParts));
    case 'status_changed':
      return has(d.old) && !d.derived
        ? [{ t: 'status', v: String(d.old) }, ARROW, { t: 'status', v: String(d.new ?? '') }]
        : [{ t: 'status', v: String(d.new ?? '') }];
    case 'stage_assigned':
      return join([raw(d.station), raw(d.technician)]);
    case 'stage_started':
    case 'stage_completed':
    case 'stage_approved':
    case 'stage_rejected':
      return raw(d.station);
    case 'stage_skipped':
      return join([raw(d.station), raw(d.reason)]);
    case 'stage_reassigned':
      return join([raw(d.station), [...raw(d.from ?? '—'), ARROW, ...raw(d.to ?? '—')]]);
    case 'material_used':
      return join([raw(d.item), has(d.qty) ? [{ t: 'raw', v: `${d.qty}${has(d.unit) ? ` ${d.unit}` : ''}` }] : []]);
    case 'hold_started':
      // Klinik/hekim lab kaynaklı beklemede kaynağı da almaz (detay boş) → yalnız başlık.
      return join([
        d.responsible === 'client' ? [{ t: 'text', v: 'Klinik kaynaklı' }]
          : d.responsible === 'lab' ? [{ t: 'text', v: 'Lab kaynaklı' }] : [],
        has(d.category) ? [{ t: 'holdCat', v: String(d.category) }] : [],
        raw(d.reason),
      ]);
    case 'hold_ended':
      return Number(d.extended_days) > 0
        ? [{ t: 'text', v: 'Teslim süresi uzatıldı:' }, { t: 'raw', v: `+${d.extended_days}` }, { t: 'text', v: 'gün' }]
        : [];
    case 'delivery_assigned':
    case 'delivery_picked_up':
    case 'delivery_delivered':
    case 'delivery_cancelled':
      return join([
        has(d.purpose) ? [{ t: 'text', v: PURPOSE_LABELS[d.purpose] ?? String(d.purpose) }] : [],
        has(d.direction) && DIRECTION_LABELS[d.direction] ? [{ t: 'text', v: DIRECTION_LABELS[d.direction] }] : [],
        raw(d.provider),
        row.kind === 'delivery_delivered' && has(d.recipient_name) ? [{ t: 'text', v: 'Teslim alan:' }, { t: 'raw', v: String(d.recipient_name) }] : [],
        row.kind === 'delivery_cancelled' ? raw(d.reason) : [],
      ]);
    case 'photo':
      return join([raw(fileLabel(d.name)), raw(d.caption)]);
    case 'change_request':
      if (d.step === 'decided') return join([[decision(d.status)], raw(d.note)]);
      return join([
        ...(Array.isArray(d.fields) ? d.fields.map((f: string) => [{ t: 'field', v: String(f) } as Part]) : []),
        d.items ? [{ t: 'text', v: 'Kalemler' }] : [],
      ]);
    case 'cancel_request':
      if (d.step === 'decided') return join([[decision(d.status)], raw(d.note)]);
      return raw(d.reason);
    case 'prova_sent':
    case 'prova_returned':
    case 'prova_client_returned':
      return join([has(d.number) ? [{ t: 'text', v: 'Prova' }, { t: 'raw', v: `#${d.number}` }] : [], raw(d.item)]);
    case 'appointment': {
      // appt_save / appt_remove / appt_review güvenilir log'u (20261027162000): tür · eski → yeni gün · saat
      const day: Part[] = has(d.old_date) && has(d.date) && d.old_date !== d.date
        ? [{ t: 'date', v: String(d.old_date) }, ARROW, { t: 'date', v: String(d.date) }]
        : has(d.date) ? [{ t: 'date', v: String(d.date) }] : [];
      return join([
        has(d.kind) ? [{ t: 'text', v: d.kind === 'prova' ? 'Prova randevusu' : 'Takma randevusu' }] : [],
        day,
        has(d.time) ? [{ t: 'raw', v: String(d.time).slice(0, 5) }] : [],
        d.proposal === 'sil' ? [{ t: 'text', v: 'Silinmesi önerildi' }] : [],
      ]);
    }
    case 'approval_requested':
      return raw(d.step);
    case 'approval_decided':
      return join([raw(d.step), raw(d.reason)]);
    case 'implant_part':
      return join([
        has(d.tooth) ? [{ t: 'text', v: 'Diş' }, { t: 'raw', v: String(d.tooth) }] : [],
        raw(d.part_type),
        has(d.quantity) && Number(d.quantity) > 1 ? [{ t: 'text', v: 'Adet' }, { t: 'raw', v: String(d.quantity) }] : [],
      ]);
    case 'review':
      return join([has(d.overall) ? [{ t: 'text', v: 'Puan:' }, { t: 'raw', v: `${d.overall}/5` }] : [], raw(d.comment)]);
    case 'invoice_issued':
      return join([raw(d.invoice_number), has(d.total) ? [money(d.total, d.currency)] : []]);
    case 'payment':
      return join([has(d.amount) ? [money(d.amount, d.currency)] : [], raw(d.method)]);
    case 'revision_opened':
    case 'revision_of':
      return raw(d.reason);
    case 'scan':
      return raw(d.label);
    default:
      return [];
  }
}
