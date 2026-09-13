// modules/tv/api.ts — TV izle-only pano + istasyon kiosk verisi.
// RLS zaten lab izolasyonu yapar → ayrıca lab_id filtrelemeye gerek yok.
// Tüm sorgular savunmacı (hata → boş), pano asla çökmesin.

import { supabase } from '../../core/api/supabase';

// ── İstasyon kiosk (Faz 2): teknisyenin işleri ──────────────────────
export type KioskJob = {
  stageId: string;
  workOrderId: string;
  orderNumber: string;
  patient: string | null;
  deliveryDate: string | null;
  station: string;
  status: string;
  startedAt: string | null;
  teeth: number[];
  workType: string | null;
  notes: string | null;
  isUrgent: boolean;
};

const KIOSK_STATUSES = ['aktif', 'bekliyor', 'durakladi', 'makine_bekliyor', 'onay_bekliyor', 'bloklu', 'yeniden'];

export async function fetchMyStationJobs(technicianId: string): Promise<KioskJob[]> {
  const { data } = await supabase
    .from('order_stages')
    .select('id, status, started_at, sequence_order, station:lab_stations(name), work_order:work_orders!work_order_id(id, order_number, patient_name, delivery_date, tooth_numbers, work_type, notes, is_urgent)')
    .eq('technician_id', technicianId)
    .in('status', KIOSK_STATUSES)
    .order('status', { ascending: true })
    .order('sequence_order', { ascending: true })
    .limit(80);

  return ((data ?? []) as any[]).map(r => ({
    stageId:      r.id,
    workOrderId:  r.work_order?.id ?? '',
    orderNumber:  r.work_order?.order_number ?? '—',
    patient:      r.work_order?.patient_name ?? null,
    deliveryDate: r.work_order?.delivery_date ?? null,
    station:      r.station?.name ?? '—',
    status:       r.status,
    startedAt:    r.started_at ?? null,
    teeth:        Array.isArray(r.work_order?.tooth_numbers) ? r.work_order.tooth_numbers : [],
    workType:     r.work_order?.work_type ?? null,
    notes:        r.work_order?.notes ?? null,
    isUrgent:     !!r.work_order?.is_urgent,
  }));
}

// ── İzle-only PANO ───────────────────────────────────────────────────
// Veri: v_active_orders_kanban → SİPARİŞ BAŞINA TEK SATIR (güncel aşama hazır),
// böylece aşama-sayımı çift saymaz. current_station_name → sabit 9-aşama akışına
// eşlenir (aşağıdaki FLOW). Hasta adı + hold nedeni view'da yok → küçük ek sorgu.

/** Sabit üretim hattı — 9 aşama, sıra sabit (kullanıcı IA'sı). */
export const FLOW: { key: string; label: string }[] = [
  { key: 'design',  label: 'CAD Tasarım' },
  { key: 'cam',     label: 'CAM Hazırlık' },
  { key: 'milling', label: 'Frezeleme' },
  { key: 'sinter',  label: 'Sinterleme' },
  { key: 'polish',  label: 'Polisaj' },
  { key: 'implant', label: 'İmplant Montajı' },
  { key: 'qc',      label: 'Kalite Kontrol' },
  { key: 'packing', label: 'Paketleme' },
  { key: 'ready',   label: 'Teslime Hazır' },
];
const FLOW_INDEX: Record<string, number> = Object.fromEntries(FLOW.map((f, i) => [f.key, i]));

/** Gerçek istasyon adı → 9-aşama akış anahtarı. TÜM istasyonları kapsar (hiçbir iş
 *  düşmez): tarama/alçı/modelaj → design; porselen/glaze/make-up → polish; vb. */
export function stationToFlow(name: string | null | undefined): string {
  const u = (name ?? '').toLocaleUpperCase('tr');
  if (!u) return 'ready';                                   // aşaması bitmiş → hatın sonu
  if (u.includes('TESLİM') || u.includes('TESLIM')) return 'ready';
  if (u.includes('PAKET')) return 'packing';
  if (u.includes('KALİTE') || u.includes('KALITE')) return 'qc';
  if (u.includes('İMPLANT') || u.includes('IMPLANT')) return 'implant';
  if (u.includes('POLİSAJ') || u.includes('POLISAJ') || u.includes('PORSELEN') || u.includes('MAKE') || u.includes('GLAZE')) return 'polish';
  if (u.includes('SİNTER') || u.includes('SINTER') || u.includes('WASH') || u.includes('CURE')) return 'sinter';
  if (u.includes('FREZE') || u.includes('DÖKÜM') || u.includes('DOKUM') || u.includes('3D')) return 'milling';
  if (u.includes('CAM') || u.includes('HAZIRLIK')) return 'cam';
  return 'design';                                          // CAD Tasarım / Tarama / Alçı / Modelaj
}

export type FlowStage = { key: string; label: string; count: number; active: number };

export type ActiveJob = {
  id: string; orderNumber: string; patient: string | null; caseType: string | null;
  stage: string; stageIndex: number; technician: string | null; startedAt: string | null;
};

export type AttentionKind = 'overdue' | 'blocked' | 'approval' | 'paused' | 'urgent';
export type AttentionItem = {
  id: string; orderNumber: string; patient: string | null; caseType: string | null;
  kind: AttentionKind; daysLate: number; reason: string | null;
};

export type BoardData = {
  flow: FlowStage[];
  activeJobs: ActiveJob[];
  attention: AttentionItem[];
  kpi: { active: number; waiting: number; delayed: number; deliveredToday: number };
};

const todayStartISO = (): string => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };

const OPEN_STATUSES = ['aktif', 'bekliyor', 'durakladi', 'makine_bekliyor', 'onay_bekliyor', 'bloklu', 'yeniden'];
const IN_PROGRESS   = ['aktif', 'durakladi', 'makine_bekliyor', 'onay_bekliyor', 'bloklu', 'yeniden']; // bekliyor HARİÇ
const READY_WO      = ['teslimata_hazir', 'kurye_bekleniyor', 'kuryede'];                              // üretim bitti, teslim bekliyor

// Açık order_stages olmayan siparişler (lab çoğu siparişi work_orders.status yaşam
// döngüsüyle sürüyor) → wo.status'tan KABA akış konumu. İstasyon verisi varsa o
// önceliklidir; bu yalnız fallback.
const STATUS_FLOW: Record<string, string> = {
  alindi: 'design', kutu_atandi: 'design', atama_bekleniyor: 'design', tasarim_onayi_bekleniyor: 'design',
  uretimde: 'milling', asamada: 'milling',
  kalite_kontrol: 'qc',
  teslimata_hazir: 'ready', kurye_bekleniyor: 'ready', kuryede: 'ready',
};

// Bu lab çoğunlukla order_stages'i 'aktif' yapmadan work_orders.status ile üretim
// sürüyor → in-production statüleri de "çalışılıyor" say (aksi halde aktif iş hiç
// görünmez). order_stages='aktif' hâlâ en güçlü sinyal; bu onun status-tabanlı tamamlayıcısı.
const WORKING_WO = ['uretimde', 'asamada', 'kalite_kontrol'];
const WO_STATUS_LABEL: Record<string, string> = {
  uretimde: 'Üretimde', asamada: 'Üretimde', kalite_kontrol: 'Kalite Kontrol',
};

/**
 * v_active_orders_kanban güncel-aşama kolonlarını NULL döndürüyor (bozuk) → order_stages'i
 * doğrudan gruplayıp her siparişin GÜNCEL aşamasını hesaplıyoruz. Çift sayım yok: her
 * sipariş yalnız güncel aşamasında sayılır.
 */
export async function fetchBoard(): Promise<BoardData> {
  const todayISO = todayStartISO();
  const todayDate = todayISO.slice(0, 10);

  const [woRes, stageRes, deliveredRes] = await Promise.all([
    supabase.from('work_orders')
      .select('id, order_number, patient_name, work_type, delivery_date, is_urgent, status, hold_reason, delay_reason')
      .not('status', 'in', '(teslim_edildi,iptal)')
      .limit(700),
    supabase.from('order_stages')
      .select('work_order_id, status, sequence_order, started_at, technician_id, station:lab_stations(name)')
      .in('status', OPEN_STATUSES)
      .limit(1500),
    supabase.from('deliveries').select('id', { count: 'exact', head: true }).eq('status', 'teslim_edildi').gte('delivered_at', todayISO),
  ]);

  const wos = (woRes.data ?? []) as any[];
  const rawStages = (stageRes.data ?? []) as any[];

  // Aşamaları siparişe göre grupla
  const stagesByWo = new Map<string, any[]>();
  for (const s of rawStages) {
    if (!s.work_order_id) continue;
    (stagesByWo.get(s.work_order_id) ?? stagesByWo.set(s.work_order_id, []).get(s.work_order_id)!).push(s);
  }

  // Teknisyen adları
  const techIds = Array.from(new Set(rawStages.map(s => s.technician_id).filter(Boolean)));
  let techMap: Record<string, string> = {};
  if (techIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', techIds);
    techMap = Object.fromEntries(((profs ?? []) as any[]).map(p => [p.id, p.full_name]));
  }

  // Her sipariş → GÜNCEL aşama (in-progress varsa o, yoksa en erken bekliyor, yoksa wo.status'a göre)
  type Cur = {
    wo: any; flowKey: string; stageStatus: string; stationName: string | null; stageLabel: string;
    technician: string | null; startedAt: string | null; overdue: boolean;
  };
  const overdueOf = (dd: string | null) => !!dd && dd < todayDate;
  const flowLabel = (key: string) => FLOW.find(f => f.key === key)?.label ?? '—';

  const current: Cur[] = wos.map(wo => {
    const st = stagesByWo.get(wo.id) ?? [];
    const cur: any = st.find(x => x.status === 'aktif')
      ?? st.find(x => IN_PROGRESS.includes(x.status))
      ?? st.filter(x => x.status === 'bekliyor').sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))[0]
      ?? null;

    let flowKey: string, stageStatus: string, stationName: string | null, stageLabel: string, technician: string | null, startedAt: string | null;
    if (cur) {
      // En güçlü sinyal: gerçek order_stage (aktif / durakladi / bloklu ...)
      stationName = cur.station?.name ?? null;
      flowKey = stationToFlow(stationName);
      stageStatus = cur.status;
      stageLabel = stationName ?? flowLabel(flowKey);
      technician = cur.technician_id ? (techMap[cur.technician_id] ?? null) : null;
      startedAt = cur.started_at ?? null;
    } else if (READY_WO.includes(wo.status)) {
      flowKey = 'ready'; stageStatus = 'ready'; stationName = null; stageLabel = flowLabel('ready');
      technician = null; startedAt = null;
    } else if (WORKING_WO.includes(wo.status)) {
      // Açık aşama yok ama üretimde → ÇALIŞILIYOR (status-tabanlı). Etiket = yaşam döngüsü durumu.
      flowKey = STATUS_FLOW[wo.status] ?? 'milling'; stageStatus = 'aktif';
      stationName = null; stageLabel = WO_STATUS_LABEL[wo.status] ?? 'Üretimde';
      technician = null; startedAt = null;
    } else {
      // İntake / tasarım / onay-öncesi → sırada
      flowKey = STATUS_FLOW[wo.status] ?? 'design'; stageStatus = 'queued';
      stationName = null; stageLabel = flowLabel(flowKey); technician = null; startedAt = null;
    }
    return { wo, flowKey, stageStatus, stationName, stageLabel, technician, startedAt, overdue: overdueOf(wo.delivery_date) };
  });

  // ── Zone 2: üretim hattı (her sipariş güncel aşamasında) ──
  const flow: FlowStage[] = FLOW.map(f => {
    const own = current.filter(c => c.flowKey === f.key);
    return { key: f.key, label: f.label, count: own.length, active: own.filter(c => c.stageStatus === 'aktif').length };
  });

  // ── Zone 1: KPI ──
  const kpi = {
    active:  current.filter(c => c.stageStatus === 'aktif').length,
    waiting: current.filter(c => c.stageStatus === 'bekliyor' || c.stageStatus === 'queued').length,
    delayed: current.filter(c => c.overdue).length,
    deliveredToday: deliveredRes.count ?? 0,
  };

  const reasonOf = (wo: any) => (wo.hold_reason?.trim() || wo.delay_reason?.trim() || null);
  const daysLate = (dd: string) => {
    const d = new Date(dd + 'T00:00:00'); const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.max(1, Math.round((t.getTime() - d.getTime()) / 86400000));
  };

  // ── Zone 3 sol: şu an çalışılan (aktif) — SABİT sıra (order_number) ki tazelemede zıplamasın ──
  const activeJobs: ActiveJob[] = current.filter(c => c.stageStatus === 'aktif')
    .sort((a, b) => String(a.wo.order_number ?? '').localeCompare(String(b.wo.order_number ?? '')))
    .map(c => ({
    id: c.wo.id,
    orderNumber: c.wo.order_number ?? '—',
    patient: c.wo.patient_name ?? null,
    caseType: c.wo.work_type ?? null,
    stage: c.stageLabel,
    stageIndex: FLOW_INDEX[c.flowKey] ?? 0,
    technician: c.technician,
    startedAt: c.startedAt,
  }));

  // ── Zone 3 sağ: DİKKAT — sadece gerçek istisnalar ──
  const kindOf = (c: Cur): AttentionKind | null => {
    if (c.overdue) return 'overdue';
    if (c.stageStatus === 'bloklu') return 'blocked';
    if (c.stageStatus === 'onay_bekliyor' || c.wo.status === 'tasarim_onayi_bekleniyor') return 'approval';
    if (c.stageStatus === 'durakladi') return 'paused';
    if (c.wo.is_urgent) return 'urgent';
    return null;
  };
  const KIND_RANK: Record<AttentionKind, number> = { overdue: 0, blocked: 1, approval: 2, paused: 3, urgent: 4 };
  const attention: AttentionItem[] = current
    .map(c => ({ c, kind: kindOf(c) }))
    .filter(x => x.kind)
    // Önce aciliyet türü, sonra SABİT ikincil sıra (order_number) → tazelemede zıplama yok
    .sort((a, b) => (KIND_RANK[a.kind!] - KIND_RANK[b.kind!])
      || String(a.c.wo.order_number ?? '').localeCompare(String(b.c.wo.order_number ?? '')))
    .slice(0, 6)
    .map(({ c, kind }) => ({
      id: c.wo.id,
      orderNumber: c.wo.order_number ?? '—',
      patient: c.wo.patient_name ?? null,
      caseType: c.wo.work_type ?? null,
      kind: kind!,
      daysLate: c.overdue ? daysLate(c.wo.delivery_date) : 0,
      reason: reasonOf(c.wo),
    }));

  return { flow, activeJobs, attention, kpi };
}
