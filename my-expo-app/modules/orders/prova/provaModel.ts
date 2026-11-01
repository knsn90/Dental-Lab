/**
 * Prova takibi — saf model (2. dalga 4, spec docs/superpowers/specs/2026-10-27-prova-takibi-design.md).
 *
 * Veri sunucudan gelir: order_prova_snapshot (popup) ve order_prova_flags (liste). Bu dosya yalnız
 * "ekranda ne yazacak" kararını verir; React, Supabase ya da i18n modülü içe aktarmaz (node --test).
 * Metinler Türkçe üretilir; çağıran `t` olarak autoT verir, sayılar ve tarihler araya yerleşir.
 */

export type ProvaStatus = 'planlandı' | 'gönderildi' | 'onay_bekliyor' | 'döndü' | 'tamamlandı';
export type RiskLevel = 'yetismiyor' | 'yaklasiyor' | 'yetisir';
type T = (s: string) => string;
const id: T = (s) => s;

export interface ProvaRow {
  id: string;
  number: number;
  type?: string | null;
  item_name?: string | null;
  status: ProvaStatus;
  sent_date?: string | null;
  return_date?: string | null;
  return_by?: string | null;
  late_days?: number;
  days_at_clinic?: number | null;
  client_returned_at?: string | null;
  doctor_notes?: string | null;
  lab_notes?: string | null;
  can_undo?: boolean;
}

export interface ApptRow {
  id: string;
  kind: 'prova' | 'takma';
  appt_date: string | null;
  appt_time: string | null;
  pending_action: 'ekle' | 'degistir' | 'sil' | null;
  pending_date: string | null;
  pending_time: string | null;
  pending_by_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  removed: boolean;
}

export interface ProvaRisk {
  level: RiskLevel | null;
  takma_date: string;
  effective_delivery: string | null;
  projected: boolean;
}

export interface ProvaSnapshot {
  viewer: 'lab' | 'client';
  can_manage: boolean;
  can_propose: boolean;
  today: string;
  delivery_date: string | null;
  risk: ProvaRisk | null;
  provas: ProvaRow[];
  appointments: ApptRow[];
  counter_paused?: boolean;
}

/** order_prova_flags satırı; 'döndü' yalnız snapshot'tan türer (liste "provada" saymaz). */
export interface ProvaFlag {
  work_order_id: string;
  prova_state: 'klinikte' | 'onay_bekliyor' | 'döndü' | null;
  prova_days: number | null;
  prova_late_days: number;
  risk_level: RiskLevel | null;
  effective_delivery: string | null;
}

export type NowTone = 'plan' | 'clinic' | 'late' | 'pending' | 'done' | 'empty';
export type NowAction = 'send' | 'return' | 'clientReturned' | 'confirm' | 'note' | 'createSend';
export interface NowCard {
  tone: NowTone;
  eyebrow: string;
  big: string;
  days: string;
  fill: [number, number, number];
  steps: [string, string, string];
  lines: { icon: 'cal' | 'pause' | 'bell' | 'play' | 'shift'; text: string }[];
  primary: { label: string; action: NowAction } | null;
  secondary: { label: string; purpose: 'prova_gidis' | 'prova_donus' } | null;
}

const PROVA_TYPE_LABEL: Record<string, string> = {
  bisküvi: 'Bisküvi prova', metal: 'Metal prova', seramik: 'Seramik prova', bitmek: 'Bitmek prova', teslim: 'Teslim',
};

// ── Tarih ──────────────────────────────────────────────────────────────────────────────────────
function utc(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}
function dayDiff(a: string, b: string): number {
  return Math.round((utc(a).getTime() - utc(b).getTime()) / 86400000);
}
/** "30 Eki" */
export function fmtDayMonth(iso: string, locale = 'tr'): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utc(iso));
}
/** "Cum 30 Eki" */
export function fmtShortDay(iso: string, locale = 'tr'): string {
  const wd = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utc(iso));
  return `${wd} ${fmtDayMonth(iso, locale)}`;
}
function hhmm(t: string | null | undefined): string {
  return t ? String(t).slice(0, 5) : '';
}

// ── Aktif prova ───────────────────────────────────────────────────────────────────────────────
const AT_CLINIC: ProvaStatus[] = ['gönderildi', 'onay_bekliyor'];

/** En erken gönderilen klinikteki prova; yoksa en küçük numaralı planlanan; yoksa null. */
export function activeProva(s: ProvaSnapshot): ProvaRow | null {
  const out = s.provas.filter((p) => AT_CLINIC.includes(p.status))
    .sort((a, b) => (a.sent_date ?? '9999').localeCompare(b.sent_date ?? '9999') || a.number - b.number);
  if (out.length) return out[0];
  const plan = s.provas.filter((p) => p.status === 'planlandı').sort((a, b) => a.number - b.number);
  return plan[0] ?? null;
}

function lastReturned(s: ProvaSnapshot): ProvaRow | null {
  const r = s.provas.filter((p) => p.status === 'döndü' || p.status === 'tamamlandı')
    .sort((a, b) => (b.return_date ?? '').localeCompare(a.return_date ?? '') || b.number - a.number);
  return r[0] ?? null;
}

function nextAppt(s: ProvaSnapshot, kind: 'prova' | 'takma'): ApptRow | null {
  const a = s.appointments.filter((x) => x.kind === kind && !x.removed && x.appt_date && x.appt_date >= s.today)
    .sort((x, y) => (x.appt_date ?? '').localeCompare(y.appt_date ?? ''));
  return a[0] ?? null;
}

function provaName(p: ProvaRow, t: T): string {
  const typ = p.type ? (PROVA_TYPE_LABEL[p.type] ?? p.type) : 'Prova';
  return `${p.number}. ${t(typ)}`;
}

// ── "Şu an" kartı ─────────────────────────────────────────────────────────────────────────────
export function nowCard(s: ProvaSnapshot, t: T = id, locale = 'tr'): NowCard {
  const lab = s.viewer === 'lab';
  const mgr = lab && s.can_manage;
  const day = (iso: string) => fmtShortDay(iso, locale);
  const dm = (iso: string) => fmtDayMonth(iso, locale);
  const p = activeProva(s);

  if (!p) {
    const done = lastReturned(s);
    if (done && done.return_date) {
      const lines: NowCard['lines'] = lab ? [{ icon: 'play', text: t('Teslim sayacı yeniden işliyor') }] : [];
      return {
        tone: 'done',
        eyebrow: `${t('Döndü')} · ${provaName(done, t)}`,
        big: t('Döndü'),
        days: done.return_date === s.today ? t('bugün') : dm(done.return_date),
        fill: [1, 1, 1],
        steps: [done.sent_date ? `${t('Gönderildi')} ${dm(done.sent_date)}` : t('Gönderildi'), t('Klinikte'), `${t('Döndü')} ${dm(done.return_date)}`],
        lines,
        primary: mgr ? { label: `+ ${t('Hekim notu')}`, action: 'note' } : null,
        secondary: null,
      };
    }
    const nx = nextAppt(s, 'prova');
    return {
      tone: 'empty',
      eyebrow: t('Prova'),
      big: t('Prova yok'),
      days: '',
      fill: [0, 0, 0],
      steps: [t('Gönderilecek'), t('Klinikte'), t('Dönüş')],
      lines: nx ? [{ icon: 'cal', text: `${t('Prova randevusu')} ${day(nx.appt_date!)}${nx.appt_time ? ` · ${hhmm(nx.appt_time)}` : ''}` }] : [],
      primary: mgr ? { label: t('Prova gönder'), action: 'createSend' } : null,
      secondary: null,
    };
  }

  if (p.status === 'planlandı') {
    const nx = nextAppt(s, 'prova');
    return {
      tone: 'plan',
      eyebrow: `${t('Sıradaki')} · ${provaName(p, t)}`,
      big: t('Hazırlanıyor'),
      days: '',
      fill: [0, 0, 0],
      steps: [t('Gönderilecek'), t('Klinikte'), t('Dönüş')],
      lines: nx ? [{ icon: 'cal', text: `${t('Prova randevusu')} ${day(nx.appt_date!)}${nx.appt_time ? ` · ${hhmm(nx.appt_time)}` : ''}` }] : [],
      primary: mgr ? { label: t('Gönderildi olarak işaretle'), action: 'send' } : null,
      secondary: mgr ? { label: t('Prova kuryesi'), purpose: 'prova_gidis' } : null,
    };
  }

  const late = Number(p.late_days) || 0;
  const sentStep = p.sent_date ? `${t('Gönderildi')} ${dm(p.sent_date)}` : t('Gönderildi');
  const endStep = p.return_by ? `${t('Son gün')} ${dm(p.return_by)}` : t('Dönüş');
  const hasApptDeadline = !!p.return_by && s.appointments.some((a) => a.kind === 'prova' && !a.removed && a.appt_date === p.return_by);
  const deadline: NowCard['lines'][number] | null = p.return_by
    ? { icon: 'cal', text: `${t('Dönüş için son gün')} ${day(p.return_by)} · ${t(hasApptDeadline ? 'prova randevusu' : 'gönderimden 2 gün sonra')}` }
    : null;
  const pause: NowCard['lines'][number] | null = lab ? { icon: 'pause', text: t('Teslim sayacı duruyor · iş klinikte bekliyor') } : null;

  if (p.status === 'onay_bekliyor') {
    const lines: NowCard['lines'] = lab
      ? [{ icon: 'bell', text: t('Hekim provayı geri gönderdiğini bildirdi') }, ...(pause ? [pause] : [])]
      : [{ icon: 'cal', text: t('Lab onayı bekliyor') }];
    return {
      tone: 'pending',
      eyebrow: `${t('Lab onayı bekliyor')} · ${provaName(p, t)}`,
      big: t('Geri gönderildi'),
      days: '',
      fill: [1, 1, 0.5],
      steps: [sentStep, t('Klinikte'), endStep],
      lines,
      primary: mgr ? { label: t('Teslim aldım'), action: 'confirm' } : null,
      secondary: null,
    };
  }

  const total = p.return_by && p.sent_date ? Math.max(1, dayDiff(p.return_by, p.sent_date) + 1) : 3;
  const frac = Math.min(0.95, Math.max(0.15, (Number(p.days_at_clinic) || 1) / total));
  const lines = [deadline, pause].filter(Boolean) as NowCard['lines'];
  const primary: NowCard['primary'] = mgr
    ? { label: t('Döndü olarak işaretle'), action: 'return' }
    : (!lab && s.can_propose ? { label: t('Provayı geri gönderdim'), action: 'clientReturned' } : null);
  const secondary: NowCard['secondary'] = mgr ? { label: t('Dönüş kuryesi'), purpose: 'prova_donus' } : null;

  if (late > 0) {
    return {
      tone: 'late',
      eyebrow: `${t('Gecikti')} · ${provaName(p, t)}`,
      big: `${late} ${t('gün')}`,
      days: t('gecikti'),
      fill: [1, 1, 0.12],
      steps: [sentStep, t('Klinikte'), endStep],
      lines, primary, secondary,
    };
  }
  return {
    tone: 'clinic',
    eyebrow: `${t('Şu an')} · ${provaName(p, t)}`,
    big: t('Klinikte'),
    days: p.days_at_clinic ? `${p.days_at_clinic}. ${t('gün')}` : '',
    fill: [1, frac, 0],
    steps: [sentStep, t('Klinikte'), endStep],
    lines, primary, secondary,
  };
}

// ── Hero, bayrak, risk, rozet ─────────────────────────────────────────────────────────────────
export function flagFromSnapshot(s: ProvaSnapshot | null): ProvaFlag | null {
  if (!s) return null;
  const p = activeProva(s);
  const risk = s.risk?.level ?? null;
  let state: ProvaFlag['prova_state'] = null;
  if (p && p.status === 'gönderildi') state = 'klinikte';
  else if (p && p.status === 'onay_bekliyor') state = 'onay_bekliyor';
  else if (!p && lastReturned(s)) state = 'döndü';
  if (!state && !risk) return null;
  return {
    work_order_id: '',
    prova_state: state,
    prova_days: state === 'klinikte' || state === 'onay_bekliyor' ? (p?.days_at_clinic ?? null) : null,
    prova_late_days: state === 'klinikte' || state === 'onay_bekliyor' ? (Number(p?.late_days) || 0) : 0,
    risk_level: risk,
    effective_delivery: s.risk?.effective_delivery ?? null,
  };
}

export function heroLabel(f: ProvaFlag | null, t: T = id): { text: string; dot: 'none' | 'amber' | 'red' | 'green' } {
  const base = t('Prova');
  if (!f) return { text: base, dot: 'none' };
  const riskDot = f.risk_level === 'yetismiyor' ? 'red' : f.risk_level === 'yaklasiyor' ? 'amber' : null;
  const late = Number(f.prova_late_days) || 0;
  if ((f.prova_state === 'klinikte' || f.prova_state === 'onay_bekliyor') && late > 0) {
    return { text: `${base} · ${late} ${t('gün gecikti')}`, dot: 'red' };
  }
  if (f.prova_state === 'klinikte') {
    return { text: f.prova_days ? `${base} · ${t('Klinikte')} ${f.prova_days}. ${t('gün')}` : `${base} · ${t('Klinikte')}`, dot: riskDot === 'red' ? 'red' : 'amber' };
  }
  if (f.prova_state === 'onay_bekliyor') return { text: `${base} · ${t('Lab onayı bekliyor')}`, dot: riskDot === 'red' ? 'red' : 'amber' };
  if (f.prova_state === 'döndü') return { text: `${base} · ${t('Döndü')}`, dot: riskDot ?? 'green' };
  return { text: base, dot: riskDot ?? 'none' };
}

export function riskChip(r: ProvaRisk | null | undefined, t: T = id, locale = 'tr'): { label: string; tone: 'ok' | 'warn' | 'bad' } | null {
  if (!r || !r.level) return null;
  const base = r.level === 'yetismiyor' ? { label: t('Randevuya yetişmiyor'), tone: 'bad' as const }
    : r.level === 'yaklasiyor' ? { label: t('Randevu yaklaşıyor'), tone: 'warn' as const }
      : { label: t('Yetişir'), tone: 'ok' as const };
  if (r.projected && r.effective_delivery) {
    return { ...base, label: `${base.label} · ${t('tahmini')} ${fmtDayMonth(r.effective_delivery, locale)}` };
  }
  return base;
}

export function listBadge(f: ProvaFlag | null | undefined, t: T = id): { label: string; tone: 'warn' | 'bad' } | null {
  if (!f) return null;
  const late = Number(f.prova_late_days) || 0;
  const atClinic = f.prova_state === 'klinikte' || f.prova_state === 'onay_bekliyor';
  if (atClinic && late > 0) return { label: `${t('Prova')} ${late} ${t('gün gecikti')}`, tone: 'bad' };
  if (f.risk_level === 'yetismiyor') return { label: t('Randevuya yetişmiyor'), tone: 'bad' };
  if (f.risk_level === 'yaklasiyor') return { label: t('Randevu yaklaşıyor'), tone: 'warn' };
  if (f.prova_state === 'klinikte') {
    return { label: f.prova_days ? `${t('Provada')} · ${f.prova_days}. ${t('gün')}` : t('Provada'), tone: 'warn' };
  }
  if (f.prova_state === 'onay_bekliyor') return { label: `${t('Provada')} · ${t('Lab onayı bekliyor')}`, tone: 'warn' };
  return null;
}

export function matchesProvaFilter(f: ProvaFlag | null | undefined, which: 'prova' | 'risk'): boolean {
  if (!f) return false;
  if (which === 'prova') return f.prova_state === 'klinikte' || f.prova_state === 'onay_bekliyor';
  return f.risk_level === 'yetismiyor' || f.risk_level === 'yaklasiyor';
}

// ── Randevu satırı ve sihirbaz uyarısı ────────────────────────────────────────────────────────
export function apptLine(a: ApptRow, t: T = id, locale = 'tr'): { title: string; when: string; pending: string | null; note: string | null } {
  const at = (d: string | null, tm: string | null) => (d ? `${fmtShortDay(d, locale)}${tm ? ` · ${hhmm(tm)}` : ''}` : '');
  let pending: string | null = null;
  if (a.pending_action === 'ekle' || a.pending_action === 'degistir') {
    pending = `${t('önerilen')} ${at(a.pending_date, a.pending_time)} · ${t('onay bekliyor')}`;
  } else if (a.pending_action === 'sil') {
    pending = `${t('silinmesi önerildi')} · ${t('onay bekliyor')}`;
  }
  return {
    title: t(a.kind === 'prova' ? 'Prova' : 'Takma'),
    when: at(a.appt_date, a.appt_time),
    pending,
    note: a.review_note ? a.review_note : null,
  };
}

/** Teslim tarihi takma randevusuyla aynı gün ya da sonrasında mı (sihirbaz uyarısı). */
export function takmaBeforeDelivery(deliveryISO: string | null | undefined, appts: { kind: string; date: string | null | undefined }[]): boolean {
  if (!deliveryISO) return false;
  const d = deliveryISO.slice(0, 10);
  return appts.some((a) => a.kind === 'takma' && !!a.date && d >= a.date.slice(0, 10));
}
