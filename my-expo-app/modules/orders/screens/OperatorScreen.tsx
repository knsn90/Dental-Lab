import { localeTag, isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
/**
 * OperatorScreen — Teknisyen istasyon paneli
 *
 * Sol: "İşlerim" — atanan aktif aşamalar (kart listesi)
 * Sağ: Aktif workstation paneli — istasyona özel başlık, mini timeline,
 *      bağlam, dinamik CTA. İleriki fazlarda istasyon-spesifik araçlar
 *      (STAGE_REGISTRY) bu kabuğun içine plug-in olur.
 */

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Platform, useWindowDimensions, Modal, findNodeHandle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check, ChevronRight, ChevronLeft, ChevronDown, Clock, Calendar,
  Inbox, Flame, Play,
} from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { useAppResume } from '../../../core/hooks/useAppResume';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { fetchStageMaterialContext, confirmStageMaterials, resolveDoctorClinicNames } from '../api';
import { recordStageActivity, completeStageResilient, startStage } from '../api/timing';
import { StageMaterialModal } from '../components/StageMaterialModal';
import { ValidationChecklistModal } from '../components/ValidationChecklistModal';
import { LivingToothChart } from '../components/LivingToothChart';
import { useStationTheme, hexA, type StationPalette } from '../../../core/theme/stationPalette';
import { getStationDescriptor } from '../stations/registry';
import type { TimelineStage } from '../components/WorkflowTimeline';
import { StageValidationChecklist, isValidationReady } from '../components/StageValidationChecklist';
import { getStationWorkspace } from '../stations/workspaces';
import { ActiveJobHero, type ActiveJobHeroData } from '../components/ActiveJobHero';
import { TimingBreakdown } from '../components/TimingBreakdown';
import { WorkstationActionBar } from '../components/WorkstationActionBar';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { Activity, MessageSquare, Paperclip, FileText } from '../../../core/ui/icons';
import { ChatDetail } from '../components/MessagesPopup';
import { ActivityFeed } from '../components/ActivityFeed';
import { MachineStatusCard } from '../components/MachineStatusCard';
import { TimingAuditHistory } from '../components/TimingAuditHistory';
import { StageFileUpload } from '../components/StageFileUpload';
import { FilesList } from '../components/FilesList';
import { getSignedUrls } from '../../../lib/photos';
import type { WorkOrderPhoto } from '../../../lib/types';
import { RecentCompletedList } from '../components/RecentCompletedList';
import { StageCompletionPopup, type StageCompletionInfo } from '../components/StageCompletionPopup';
import { deriveMasterStep } from '../components/MasterWorkflowTimeline';
import type { StageStatus } from '../stations/stageStates';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { mobileTopPad } from '../../../core/ui/pageMetrics';

const DISPLAY_FONT =
  Platform.OS === 'web'
    ? 'Inter Tight, Inter, system-ui, sans-serif'
    : 'InterTight_300Light';

function humanIdle(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)} sn`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} dk`;
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return m > 0 ? `${h} ${autoT('saat')} ${m}${autoT('dk')}` : `${h} ${autoT('saat')}`;
  }
  return `${Math.floor(ms / 86_400_000)} ${autoT('gün')}`;
}

interface AssignedJob {
  stage_id:        string;
  work_order_id:   string;
  order_number:    string;
  patient_name:    string | null;
  delivery_date:   string | null;
  station_id:      string | null;
  station_name:    string | null;
  station_color:   string | null;
  station_critical:boolean;
  is_critical:     boolean;
  sequence_order:  number;
  assigned_at:     string | null;
  started_at:      string | null;
  status:          StageStatus;
  // Job context
  is_urgent:       boolean;
  tooth_count:     number;
  tooth_numbers:   number[];
  work_type:       string | null;
  shade:           string | null;
  machine_type:    string | null;
  model_type:      string | null;
  notes:           string | null;
  lab_notes:       string | null;
  doctor_id:       string | null;
  doctor_name:     string | null;
  clinic_name:     string | null;
  // Phase A timing fields
  active_work_seconds:     number;
  machine_runtime_seconds: number;
  queue_waiting_seconds:   number;
  paused_seconds_total:    number;
  operator_setup_seconds:  number;
  last_active_started_at:  string | null;
  paused_at:               string | null;
  first_activity_at:       string | null;
  last_activity_at:        string | null;
}

// work_type → kısa label
const WORK_TYPE_LABEL: Record<string, string> = {
  crown_bridge: 'Kron-Köprü',
  aesthetic:    'Estetik',
  removable:    'Hareketli',
  implant:      'İmplant',
  surgical:     'Cerrahi',
  temporary:    'Geçici',
};

function workTypeLabel(t?: string | null): string | null {
  if (!t) return null;
  // DB diş başına value gönderdiği için comma-separated tekrar gelebilir.
  // Önce parçala → her parçayı map'e bak → tekrarları çıkar (Set) → birleştir.
  const parts = t.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const labels = parts.map(p => WORK_TYPE_LABEL[p] ?? p);
  const uniq = Array.from(new Set(labels));
  // Tek tip ise sadece etiket; birden fazla varsa birleştir
  if (uniq.length === 1 && labels.length > 1) {
    return `${uniq[0]} ×${labels.length}`;
  }
  return uniq.join(', ');
}

// ── Standart panel card stili — palete (gece moduna) duyarlı factory ──
const panelCardStyle = (p: StationPalette) => ({
  backgroundColor: p.surface,
  borderRadius:    14,
  overflow:        'hidden' as const,
  ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' } as any : {}),
});

// Standart panel header (uppercase eyebrow + sayı/aksiyon sağda)
// Arka plan ve alt çizgi YOK — gövdeyle akışkan, ferah görünüm.
const PANEL_HEADER_STYLE = {
  flexDirection:  'row' as const,
  alignItems:     'center' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: 14,
  paddingTop:        12,
  paddingBottom:     6,
};
const panelHeaderLabel = (p: StationPalette) => ({
  fontSize: 11, fontWeight: '700' as const,
  color: p.ink900, letterSpacing: 1.2, textTransform: 'uppercase' as const,
});

interface SlaInfo {
  days: number;        // -ve = gecikti
  late: boolean;
  risky: boolean;      // ≤ 1 gün kaldı veya geç
  formatted: string;
  tone: 'neutral' | 'warning' | 'danger';
}

function computeSla(deliveryDate: string | null): SlaInfo | null {
  if (!deliveryDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(deliveryDate + 'T00:00:00');
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  const late = diff < 0;
  const risky = diff <= 1;
  let formatted: string;
  if (late) formatted = `${Math.abs(diff)} ${autoT('gün gecikti')}`;
  else if (diff === 0) formatted = autoT('Bugün');
  else if (diff === 1) formatted = autoT('Yarın');
  else formatted = `${diff} ${autoT('gün kaldı')}`;
  return {
    days: diff,
    late,
    risky,
    formatted,
    tone: late ? 'danger' : risky ? 'warning' : 'neutral',
  };
}

export function OperatorScreen() {
  const P = useStationTheme();
  const { profile } = useAuthStore();
  const isManager = profile?.user_type === 'admin'
    || (profile?.user_type === 'lab' && profile?.role === 'manager');
  const { width } = useWindowDimensions();
  const isWide = width >= 1024;
  const { setTitle, clear } = usePageTitleStore();

  const [jobs, setJobs] = useState<AssignedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [materialModalStageId, setMaterialModalStageId] = useState<string | null>(null);
  const [completionInfo, setCompletionInfo] = useState<StageCompletionInfo | null>(null);
  const [now, setNow] = useState(Date.now());
  const [timelineStages, setTimelineStages] = useState<TimelineStage[]>([]);

  // Validation checklist state — Hero'daki "Tamamla" CTA'sını gate'lemek için
  // burada tutulur (önceden SelectedJobDetail içindeydi).
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Tamamla popup
  const [checklistOpen, setChecklistOpen] = useState(false);
  // İşlerim kuyruğu collapse — varsayılan kapalı: yalnız aktif iş görünür
  const [queueExpanded, setQueueExpanded] = useState(false);
  // selected stage değişince sıfırla
  useEffect(() => { setChecked(new Set()); }, [selectedId]);
  const toggleCheck = (key: string) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  useEffect(() => {
    setTitle(null, null);
    return clear;
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    if (!profile) return;

    // Status filtresi — Faz A migration uygulandıysa yeni state'ler de dahil,
    // değilse Postgres "invalid input value for enum" döner. Bu yüzden her ikisi
    // için de ayrı bir array tutuyoruz.
    const NEW_STATUSES   = ['aktif','bekliyor','durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden'];
    const LEGACY_STATUSES = ['aktif','bekliyor'];

    // Faz A öncesi şema dayanıklı select (timing kolonları yok)
    const LEGACY_SELECT = `
        id, sequence_order, is_critical, assigned_at, started_at, status, work_order_id,
        station_id,
        station:lab_stations(name, color, is_critical),
        work_order:work_orders!work_order_id(
          id, order_number, patient_name, delivery_date,
          is_urgent, tooth_numbers, work_type, shade,
          machine_type, model_type, notes, lab_notes,
          doctor_id
        )
    `;

    // Faz A sonrası genişletilmiş select
    const FULL_SELECT = `
        id, sequence_order, is_critical, assigned_at, started_at, status, work_order_id,
        station_id,
        active_work_seconds, machine_runtime_seconds, queue_waiting_seconds,
        paused_seconds_total, operator_setup_seconds,
        last_active_started_at, paused_at,
        first_activity_at, last_activity_at,
        station:lab_stations(name, color, is_critical),
        work_order:work_orders!work_order_id(
          id, order_number, patient_name, delivery_date,
          is_urgent, tooth_numbers, work_type, shade,
          machine_type, model_type, notes, lab_notes,
          doctor_id
        )
    `;

    // 1) Önce yeni şema dene
    let { data, error } = await supabase
      .from('order_stages')
      .select(FULL_SELECT)
      .eq('technician_id', profile.id)
      .in('status', NEW_STATUSES)
      .order('status', { ascending: true })
      .order('sequence_order', { ascending: true });

    // 2) Hata varsa eski şemaya fallback (timing kolonları/yeni statelar yok)
    if (error) {
      console.warn('[operator] full schema query failed, falling back:', error.message);
      const fallback = await supabase
        .from('order_stages')
        .select(LEGACY_SELECT)
        .eq('technician_id', profile.id)
        .in('status', LEGACY_STATUSES)
        .order('status', { ascending: true })
        .order('sequence_order', { ascending: true });
      data  = fallback.data as any;
      error = fallback.error;
      if (error) console.warn('[operator] legacy fallback also failed:', error.message);
    }

    const stageRows = (data ?? []) as any[];
    const missingOrderIds = new Set<string>();
    const stageOrderMap = new Map<string, string>();
    for (const r of stageRows) {
      const woId = r.work_order?.id ?? r.work_order_id ?? null;
      if (!woId) missingOrderIds.add(r.id);
      else stageOrderMap.set(r.id, woId);
    }
    if (missingOrderIds.size > 0) {
      const { data: stageOrders } = await supabase
        .from('order_stages')
        .select('id, work_order_id')
        .in('id', Array.from(missingOrderIds));
      for (const so of stageOrders ?? []) {
        if (so.work_order_id) stageOrderMap.set(so.id, so.work_order_id);
      }
    }

    const list: AssignedJob[] = stageRows.map(r => {
      const woId = r.work_order?.id ?? stageOrderMap.get(r.id) ?? '';
      const teeth: number[] = Array.isArray(r.work_order?.tooth_numbers) ? r.work_order.tooth_numbers : [];
      return {
        stage_id:        r.id,
        work_order_id:   woId,
        order_number:    r.work_order?.order_number ?? '—',
        patient_name:    r.work_order?.patient_name ?? null,
        delivery_date:   r.work_order?.delivery_date ?? null,
        station_id:      r.station_id ?? null,
        station_name:    r.station?.name ?? null,
        station_color:   r.station?.color ?? P.accent,
        station_critical: !!r.station?.is_critical,
        is_critical:     !!r.is_critical,
        sequence_order:  r.sequence_order ?? 0,
        assigned_at:     r.assigned_at ?? null,
        started_at:      r.started_at ?? null,
        status:          (r.status as StageStatus) ?? 'bekliyor',
        is_urgent:       !!r.work_order?.is_urgent,
        tooth_count:     teeth.length,
        tooth_numbers:   teeth,
        work_type:       r.work_order?.work_type ?? null,
        shade:           r.work_order?.shade ?? null,
        machine_type:    r.work_order?.machine_type ?? null,
        model_type:      r.work_order?.model_type ?? null,
        notes:           r.work_order?.notes ?? null,
        lab_notes:       r.work_order?.lab_notes ?? null,
        // doctor_id raw — adı/klinik adı aşağıda tek batch'te çözülür
        doctor_id:       r.work_order?.doctor_id ?? null,
        doctor_name:     null,
        clinic_name:     null,
        // Timing
        active_work_seconds:     r.active_work_seconds ?? 0,
        machine_runtime_seconds: r.machine_runtime_seconds ?? 0,
        queue_waiting_seconds:   r.queue_waiting_seconds ?? 0,
        paused_seconds_total:    r.paused_seconds_total ?? 0,
        operator_setup_seconds:  r.operator_setup_seconds ?? 0,
        last_active_started_at:  r.last_active_started_at ?? null,
        paused_at:               r.paused_at ?? null,
        first_activity_at:       r.first_activity_at ?? null,
        last_activity_at:        r.last_activity_at ?? null,
      };
    });

    // Hekim + klinik adlarını tek batch'te çöz (doctor_id polimorfik: doctors.id
    // VEYA profiles.id). Teknisyen user_type='lab' olduğundan is_lab_user() TRUE
    // → doctors/clinics/profiles okuma izni var.
    const docIds = list.map(j => j.doctor_id).filter(Boolean) as string[];
    if (docIds.length) {
      try {
        const nameMap = await resolveDoctorClinicNames(docIds);
        for (const j of list) {
          const info = j.doctor_id ? nameMap.get(j.doctor_id) : null;
          if (info) { j.doctor_name = info.doctorName; j.clinic_name = info.clinicName; }
        }
      } catch (e) {
        console.warn('[operator] doctor/clinic name resolve failed:', (e as any)?.message);
      }
    }

    // Sıralama: aktif → sonra sequence_order. Aktif iş her zaman en üstte.
    const statusRank: Record<string, number> = {
      aktif: 0, durakladi: 1, makine_bekliyor: 2, onay_bekliyor: 3,
      bloklu: 4, yeniden: 5, bekliyor: 6, tamamlandi: 7, onaylandi: 8,
    };
    list.sort((a, b) => {
      const ra = statusRank[a.status] ?? 99;
      const rb = statusRank[b.status] ?? 99;
      if (ra !== rb) return ra - rb;
      return (a.sequence_order ?? 0) - (b.sequence_order ?? 0);
    });

    setJobs(list);
    if (selectedId && !list.some(j => j.stage_id === selectedId)) {
      setSelectedId(list[0]?.stage_id ?? null);
    } else if (!selectedId && list[0]) {
      setSelectedId(list[0].stage_id);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [profile?.id]);

  // ── Selected job timeline yükle ──
  const selected = useMemo(
    () => jobs.find(j => j.stage_id === selectedId) ?? null,
    [jobs, selectedId],
  );

  useEffect(() => {
    if (!selected?.work_order_id) { setTimelineStages([]); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('order_stages')
        .select('id, sequence_order, status, station:lab_stations(name)')
        .eq('work_order_id', selected.work_order_id)
        .order('sequence_order', { ascending: true });
      if (!alive) return;
      const ts: TimelineStage[] = ((data ?? []) as any[]).map(r => ({
        id: r.id,
        sequence: r.sequence_order ?? 0,
        status: r.status,
        station_name: r.station?.name ?? null,
      }));
      setTimelineStages(ts);
    })();
    return () => { alive = false; };
  }, [selected?.work_order_id]);

  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`operator-${profile.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'order_stages', filter: `technician_id=eq.${profile.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  // Ön plana dönünce işleri tazele — askıdayken kaçan atamaları/aşama değişimlerini telafi eder.
  useAppResume(() => { void load(); }, { enabled: !!profile?.id });

  async function handleComplete() {
    if (!selected || submitting) return;
    if (selectedDesc?.requiresFileUpload && stageFileCount === 0) {
      toast.error('Önce tasarım dosyasını yükleyin');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await fetchStageMaterialContext(selected.stage_id);
      if (error || !data) {
        toast.error('Aşama bilgisi alınamadı');
        return;
      }
      if (!data.station.consumes_materials) {
        const res = await completeStageResilient(selected.stage_id, []);
        if (!res.ok) {
          toast.error('Aşama tamamlanamadı: ' + (res.error ?? ''));
          return;
        }
        void recordStageActivity(selected.stage_id, 'stage_completed', 'system', {
          station_name: data.station.name,
          consumes_materials: false,
        });

        // Sıradaki aşama + sipariş durumunu sorgula → popup için
        const [{ data: nextStage }, { data: woRow }] = await Promise.all([
          supabase
            .from('order_stages')
            .select('station:lab_stations(name)')
            .eq('work_order_id', selected.work_order_id)
            .eq('status', 'aktif')
            .order('sequence_order')
            .limit(1)
            .maybeSingle(),
          supabase
            .from('work_orders')
            .select('status')
            .eq('id', selected.work_order_id)
            .maybeSingle(),
        ]);

        setCompletionInfo({
          stationName:    data.station.name ?? selected.station_name,
          orderNumber:    selected.order_number,
          patientName:    selected.patient_name,
          sequenceOrder:  selected.sequence_order,
          completedAt:    new Date(),
          nextStationName: (nextStage as any)?.station?.name ?? null,
          isOrderDone:    woRow?.status === 'kalite_kontrol',
        });
        setSelectedId(null);
        load();
      } else {
        setMaterialModalStageId(selected.stage_id);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // NOT: profile null kontrolü tüm useMemo'lardan SONRA aşağıda yapılır.
  // Hook sırasının render'lar arasında değişmemesi için kritik.

  // Hero data — seçili iş için
  const heroData = useMemo<ActiveJobHeroData | null>(() => {
    if (!selected) return null;
    return {
      stage_id:        selected.stage_id,
      sequence_order:  selected.sequence_order,
      station_name:    selected.station_name,
      patient_name:    selected.patient_name,
      order_number:    selected.order_number,
      work_type_label: workTypeLabel(selected.work_type),
      is_critical:     selected.station_critical || selected.is_critical,
      is_urgent:       selected.is_urgent,
      status:          selected.status,
      assigned_at:     selected.assigned_at,
      started_at:      selected.started_at,
      delivery_date:   selected.delivery_date,
      doctor_name:     selected.doctor_name,
      clinic_name:     selected.clinic_name,
      tooth_count:     selected.tooth_count,
      shade:           selected.shade,
      // Pause-aware timer
      active_work_seconds:    selected.active_work_seconds,
      paused_seconds_total:   selected.paused_seconds_total,
      last_active_started_at: selected.last_active_started_at,
      paused_at:              selected.paused_at,
    };
  }, [selected]);

  const heroIdle = useMemo(() => {
    if (!selected?.assigned_at) return null;
    const ms = now - new Date(selected.assigned_at).getTime();
    return `${humanIdle(ms)} bekliyor`;
  }, [selected?.assigned_at, now]);

  const heroDue = useMemo(() => {
    if (!selected?.delivery_date) return null;
    const sla = computeSla(selected.delivery_date);
    if (!sla) return null;
    return { text: sla.formatted, tone: sla.tone };
  }, [selected?.delivery_date]);

  const totalActive = useMemo(
    () => jobs.filter(j => j.status === 'aktif').length,
    [jobs],
  );

  // Collapse kapalıyken görünecek işler: aktif iş(ler); yoksa seçili; o da yoksa ilk iş
  const collapsedJobs = useMemo(() => {
    const active = jobs.filter(j => j.status === 'aktif');
    if (active.length) return active;
    const sel = jobs.find(j => j.stage_id === selectedId);
    if (sel) return [sel];
    return jobs.slice(0, 1);
  }, [jobs, selectedId]);

  // Hero CTA için descriptor + validation gate
  const selectedDesc = useMemo(
    () => selected ? getStationDescriptor(selected.station_name) : null,
    [selected?.station_name],
  );
  const validationReady = useMemo(
    () => selectedDesc ? isValidationReady(selectedDesc.validation, checked) : false,
    [selectedDesc, checked],
  );
  // Stage'in started_at sonrası yüklenmiş dosya sayısı (CAD/SCAN gibi requiresFileUpload
  // istasyonlarda Tamamla'yı gate'lemek için).
  const [stageFileCount, setStageFileCount] = useState(0);
  const [fileRefreshTick, setFileRefreshTick] = useState(0);
  useEffect(() => {
    if (!selected?.work_order_id) {
      setStageFileCount(0);
      return;
    }
    let alive = true;
    (async () => {
      // Stage başladıysa stage başlangıcından sonra yüklenen dosyaları say,
      // başlamadıysa tüm work_order dosyalarını say (kullanıcı henüz başlatmamış
      // olabilir ama dosyayı önceden yüklemiş olabilir).
      let q = supabase
        .from('work_order_photos')
        .select('id', { count: 'exact', head: true })
        .eq('work_order_id', selected.work_order_id);
      if (selected.started_at) {
        q = q.gte('created_at', selected.started_at);
      }
      const { count } = await q;
      if (alive) setStageFileCount(count ?? 0);
    })();
    return () => { alive = false; };
  }, [selected?.work_order_id, selected?.started_at, fileRefreshTick]);

  // requiresFileUpload kontrolü: aktif istasyon dosya bekliyor mu, yüklendi mi?
  // (canComplete'a gate KOYMUYORUZ — buton tıklanabilir kalsın, hata toast'ta verilir)
  const fileGate = !selectedDesc?.requiresFileUpload || stageFileCount > 0;

  // CTA butonu popup açar — gate'leri burada koymuyoruz; tıklamada hata toast verilir.
  const canComplete = !!selected && !submitting && selected.status === 'aktif' && !!selected.started_at;

  // Hero araç çubuğu — chat state + bölüm ref'leri bu seviyede (hero ile SelectedJobDetail'in ortak parent'ı).
  const scrollRef = useRef<ScrollView>(null);
  const notesRef  = useRef<View>(null);
  const filesRef  = useRef<View>(null);
  const [chatOpen, setChatOpen] = useState(false);
  useEffect(() => { setChatOpen(false); }, [selected?.stage_id]);
  const scrollToEl = (r: React.RefObject<View | null>) => {
    const el: any = r.current;
    if (!el) return;
    // WEB: findNodeHandle desteklenmiyor → RNW ref'i DOM node'una scrollIntoView uygula.
    if (Platform.OS === 'web') {
      const domNode = typeof el.scrollIntoView === 'function' ? el : (el.getNode?.() ?? null);
      domNode?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      return;
    }
    // NATIVE: measureLayout ile ScrollView'a göre y bul, oraya kaydır.
    const node = scrollRef.current ? findNodeHandle(scrollRef.current) : null;
    if (node == null) return;
    el.measureLayout?.(
      node,
      (_x: number, y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }),
      () => {},
    );
  };

  // Hero'nun action slot'u — birincil aksiyon (İşe Başla / Tamamla)
  /**
   * Bu işi bekleten aşama: seçilinin sıra numarasından ÖNCE gelen, henüz
   * tamamlanmamış (ve atlanmamış) ilk aşama. Teknisyen kimi beklediğini
   * bilmeden ne yapacağını da bilemiyordu.
   */
  const blockedBy = useMemo(() => {
    if (!selected || selected.status !== 'bekliyor') return null;
    const prior = timelineStages
      .filter(t => t.sequence < (selected.sequence_order ?? 0))
      .filter(t => !['tamamlandi', 'skipped', 'onaylandi'].includes(String(t.status)))
      .sort((a, b) => a.sequence - b.sequence);
    return prior[0]?.station_name ?? null;
  }, [selected?.stage_id, selected?.status, selected?.sequence_order, timelineStages]);

  const heroActionSlot = useMemo(() => {
    if (!selected || !selectedDesc) return null;
    const hasNotes = !!(selected.notes && selected.notes.trim()) || !!((selected as any).lab_notes && (selected as any).lab_notes.trim());
    return (
      <View style={{ gap: 12 }}>
        <WorkstationActionBar
          stageId={selected.stage_id}
          status={selected.status}
          startedAt={selected.started_at}
          ctaLabel={selectedDesc.ctaLabel}
          canComplete={canComplete}
          validationReady={true}
          submitting={submitting}
          onComplete={async () => {
            // Dosya zorunluysa → tıklama anında canlı sorgu yap (state stale olabilir)
            if (selectedDesc.requiresFileUpload && selected.started_at) {
              const { count, error } = await supabase
                .from('work_order_photos')
                .select('id', { count: 'exact', head: true })
                .eq('work_order_id', selected.work_order_id);
              if (error) {
                toast.error('Dosya kontrolü başarısız: ' + error.message);
                return;
              }
              if (!count || count === 0) {
                toast.error('Tasarım dosyası yüklenmedi');
                return;
              }
            }
            setChecklistOpen(true);
          }}
          onStarted={() => load()}
          onStateChanged={() => load()}
          waitingHint={selectedDesc.waitingHint}
          blockedBy={blockedBy}
        />
        {/* Hero araç çubuğu — mavi alanda: Dosyalar / Hekim Notu ilgili bölüme kaydırır, Mesajlar sohbeti açar. */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            { Icon: Paperclip, label: autoT('Dosyalar'), onPress: () => scrollToEl(filesRef) },
            ...(hasNotes ? [{ Icon: FileText, label: autoT('Hekim Notu'), onPress: () => scrollToEl(notesRef) }] : []),
            { Icon: MessageSquare, label: autoT('Mesajlar'), onPress: () => setChatOpen(true) },
          ]).map((x, i) => (
            <Pressable
              key={i}
              onPress={x.onPress}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <x.Icon size={15} color="#FFFFFF" strokeWidth={2} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' }}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.stage_id, selected?.status, selected?.started_at, selectedDesc, canComplete, submitting, stageFileCount, blockedBy]);

  // Üst-seviye macro adım — teknisyen için hep uretim/qc/hazir aralığında
  const masterStep = useMemo(() => {
    if (!selected) return undefined;
    return deriveMasterStep(
      null,                          // work_order.status fetch'lemiyoruz şimdilik
      selected.station_name,
      selected.status,
      'set',                         // triagedAt — teknisyen iş aldıysa zaten triajlanmış
    );
  }, [selected]);

  // Tüm hook'lardan SONRA early return — hook sırası tutarlı kalır
  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: P.pageBg }}>
        <Text style={{ fontSize: 14, color: P.ink500 }}>Giriş gerekli</Text>
      </View>
    );
  }

  // Edge-to-edge: mobil safe-area insets'i içerik paddingTop'una uygulanır (status bar altında başla)
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: P.pageBg }}
      contentContainerStyle={{
        paddingStart: 16,
        paddingEnd: 16,
        // Yüzen üst başlık (logo + aksiyon düğmeleri) 72px kaplıyor;
        // 16 yetmiyordu ve "İşlerim" logonun altına giriyordu.
        paddingTop: isWide ? 16 : mobileTopPad(insets.top),
        // Mobile'da yüzen tab bar (~76px) + alt safe-area için ekstra padding (içerik arkaya girmesin)
        paddingBottom: isWide ? 16 : insets.bottom + 96,
      }}
    >
      {/* iOS native büyük sayfa başlığı — sadece mobilde, kartların üstünde */}
      {!isWide && (
        <View style={{ paddingHorizontal: 4, paddingBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: P.ink400, letterSpacing: 1, textTransform: 'uppercase' }}>
            İSTASYON
          </Text>
          <Text style={{
            fontFamily: DISPLAY_FONT, fontWeight: '300', fontSize: 34, color: P.ink900,
            letterSpacing: -1.2, lineHeight: 38, marginTop: 4,
          }}>
            İşlerim
          </Text>
        </View>
      )}

      <View style={[{ flexDirection: 'column', gap: 16 }, isWide && { flexDirection: 'row' }]}>
        {/* ═══ SOL KOLON: İşlerim + Son Tamamlananlar ═══ */}
        <View style={{
          width: isWide ? 360 : '100%',
          flexShrink: 0,
          gap: 8,
          alignSelf: 'flex-start',
        }}>
        {/* ── Section header — kartın DIŞINDA (iOS grouped-list deseni).
              Yuvarlak köşe artık metni kırpamaz; tekrar eden sayı kaldırıldı
              (rozet zaten "N AKTİF" diyor). ── */}
        {jobs.length > 0 && (
          <Pressable
            onPress={() => (jobs.length > 1 ? setQueueExpanded(v => !v) : undefined)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              paddingHorizontal: 4,
              paddingBottom: 2,
              ...(Platform.OS === 'web' ? { cursor: jobs.length > 1 ? 'pointer' : 'default' } as any : {}),
            }}
          >
            {/* Başlık gerçeği söylesin: hiç aktif iş yokken "AKTİF KUYRUK"
                yazmak yanıltıyordu — Test Tek'in 5 aşamasının hepsi bekliyor
                durumdayken de aynı başlık çıkıyordu. */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink500, letterSpacing: 0.8, textTransform: 'uppercase', lineHeight: 16 }}>
              {totalActive > 0 ? 'Şu an çalışılan' : 'Sıradaki işler'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Aktif varsa canlı nokta + "N AKTİF"; yoksa sessiz "N iş" —
                  eskiden aktif yokken rozet hiç çıkmıyordu ve teknisyen kaç iş
                  beklediğini ancak listeyi açınca görüyordu. */}
              {(totalActive > 0 || jobs.length > 0) && (
                <View style={{
                  paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999,
                  backgroundColor: totalActive > 0 ? hexA(P.accent, 0.10) : hexA(P.ink500, 0.07),
                  borderWidth: 1, borderColor: totalActive > 0 ? hexA(P.accent, 0.22) : 'transparent',
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                }}>
                  {totalActive > 0 && (
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: P.accent }} />
                  )}
                  <Text style={{
                    fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4,
                    color: totalActive > 0 ? P.accentDeep : P.ink500,
                  }}>
                    {totalActive > 0 ? `${totalActive} AKTİF` : `${jobs.length} İŞ`}
                  </Text>
                </View>
              )}
              {jobs.length > 1 && (
                <ChevronDown
                  size={18}
                  color={P.ink400}
                  strokeWidth={2}
                  style={Platform.OS === 'web' ? ({ transform: [{ rotate: queueExpanded ? '180deg' : '0deg' }] } as any) : undefined}
                />
              )}
            </View>
          </Pressable>
        )}

        <View style={{
          backgroundColor: P.surface,
          borderRadius: 24,
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any : {}),
        }}>
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: P.ink400, marginTop: 10 }}>Yükleniyor…</Text>
            </View>
          ) : jobs.length === 0 ? (
            <View style={{ paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', gap: 8 }}>
              <Inbox size={28} color={P.ink300} strokeWidth={1.5} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: P.ink700 }}>
                Aktif işin yok
              </Text>
              <Text style={{ fontSize: 11, color: P.ink500, textAlign: 'center', maxWidth: 240 }}>
                Yeni atama geldiğinde burada görünür.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: isWide ? undefined : 320 }}
              showsVerticalScrollIndicator={false}
            >
              {(queueExpanded ? jobs : collapsedJobs).map(j => (
                <QueueCard
                  key={j.stage_id}
                  job={j}
                  isSelected={j.stage_id === selectedId}
                  now={now}
                  onPress={() => setSelectedId(j.stage_id)}
                  onStart={async () => {
                    const res = await startStage(j.stage_id);
                    if (!res.ok) {
                      toast.error(`Başlatılamadı: ${res.error ?? ''}`);
                      return;
                    }
                    toast.success('İşe başlandı ✓');
                    setSelectedId(j.stage_id);
                    load();
                  }}
                />
              ))}
            </ScrollView>
          )}

          {/* Collapsed iken kalan işleri göster ipucu */}
          {!loading && !queueExpanded && jobs.length > collapsedJobs.length && (
            <Pressable
              onPress={() => setQueueExpanded(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: P.ink100,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: P.accentDeep }}>
                {jobs.length - collapsedJobs.length} iş daha
              </Text>
              <ChevronDown size={15} color={P.accentDeep} strokeWidth={2} />
            </Pressable>
          )}

          {/* Son tamamlananlar — MASAÜSTÜNDE kuyruğun altında (sol kolon boş kalmasın).
              Mobilde buraya konunca kuyruk ile asıl işin arasına giriyor ve hero'yu
              ekranın altına itiyordu: bitmiş işler, yapılacak işin önüne geçemez.
              Mobil sürümü sayfanın en altına taşındı. */}
          {isWide && <RecentCompletedList accentColor={P.accent} limit={5} embedded collapsible />}
        </View>
        </View>

        {/* ═══ SAĞ KOLON: Hero + Workstation ═══
            Mobilde: hiç iş yoksa bu kolonu komple gizle (tek boş durum yukarıdaki
            "Aktif işin yok" kartında kalsın). Masaüstünde her zaman göster. */}
        {(isWide || jobs.length > 0) && (
        <View style={{ flex: 1, flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* Hero — seçili işin animasyonlu özeti */}
          <ActiveJobHero
            job={heroData}
            timeline={timelineStages}
            totalActive={totalActive}
            idleLabel={heroIdle}
            dueLabel={heroDue}
            masterStep={masterStep}
            actionSlot={heroActionSlot}
          />

          {/* Workstation içeriği — DIŞ KART YOK. İç kartlar (notlar/dosyalar/diş/workspace/detaylar)
             Hero ile aynı sayfa zemininde sıralanır, iç içe kart hissi vermez.
             Boş placeholder kartı SADECE masaüstünde — mobilde hero'nun kendi boş
             durumu yeterli (gereksiz çift "Bir iş seç" kartını engeller). */}
          {selected ? (
            <SelectedJobDetail
              job={selected}
              isManager={isManager}
              onTimingChanged={() => load()}
              checked={checked}
              onToggleCheck={toggleCheck}
              onFilesChanged={() => setFileRefreshTick(t => t + 1)}
              filesRef={filesRef}
              notesRef={notesRef}
              chatOpen={chatOpen}
              onChatOpen={setChatOpen}
            />
          ) : isWide ? (
            <View style={{
              backgroundColor: P.surface, borderRadius: 24,
              alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8,
              minHeight: 280,
              ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any : {}),
            }}>
              <View style={{
                width: 56, height: 56, borderRadius: 16,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: hexA(P.accent, 0.10),
                borderWidth: 1, borderColor: hexA(P.accent, 0.20),
                marginBottom: 4,
              }}>
                <Inbox size={24} color={P.accent} strokeWidth={1.6} />
              </View>
              <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: '300', fontSize: 22, color: P.ink900, letterSpacing: -0.4 }}>
                Bir iş seç
              </Text>
              <Text style={{ fontSize: 12, color: P.ink500, textAlign: 'center', maxWidth: 320 }}>
                Soldan aktif işlerinden birini seçerek workstation'ı aç.
              </Text>
            </View>
          ) : null}
        </View>
        )}
      </View>

      {/* Son tamamlananlar (mobil) — asıl işten SONRA, sayfanın en altında */}
      {!isWide && jobs.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <RecentCompletedList accentColor={P.accent} limit={5} embedded collapsible />
        </View>
      )}

      {/* Aşama Kontrol Listesi popup — Tamamla CTA'ya basıldığında */}
      {selected && selectedDesc && (
        <ValidationChecklistModal
          visible={checklistOpen}
          items={selectedDesc.validation}
          checked={checked}
          onToggle={toggleCheck}
          onClose={() => setChecklistOpen(false)}
          stationName={selected.station_name}
          ctaLabel={selectedDesc.ctaLabel}
          submitting={submitting}
          onConfirm={() => {
            setChecklistOpen(false);
            void handleComplete();
          }}
        />
      )}

      <StageMaterialModal
        visible={!!materialModalStageId}
        stageId={materialModalStageId}
        accentColor={P.accent}
        onClose={() => setMaterialModalStageId(null)}
        onConfirmed={async () => {
          const stageId = materialModalStageId;
          if (stageId) {
            void recordStageActivity(stageId, 'material_confirmed', 'system');
            void recordStageActivity(stageId, 'stage_completed', 'system', { via: 'material_modal' });
          }
          setMaterialModalStageId(null);

          // Bu stage'in info'sunu yakala (closures sonrası selected null olabilir)
          const snap = selected;
          if (snap) {
            const [{ data: nextStage }, { data: woRow }] = await Promise.all([
              supabase
                .from('order_stages')
                .select('station:lab_stations(name)')
                .eq('work_order_id', snap.work_order_id)
                .eq('status', 'aktif')
                .order('sequence_order')
                .limit(1)
                .maybeSingle(),
              supabase
                .from('work_orders')
                .select('status')
                .eq('id', snap.work_order_id)
                .maybeSingle(),
            ]);
            setCompletionInfo({
              stationName:    snap.station_name,
              orderNumber:    snap.order_number,
              patientName:    snap.patient_name,
              sequenceOrder:  snap.sequence_order,
              completedAt:    new Date(),
              nextStationName: (nextStage as any)?.station?.name ?? null,
              isOrderDone:    woRow?.status === 'kalite_kontrol',
            });
          }

          setSelectedId(null);
          load();
        }}
      />

      {/* Aşama tamamlandı popup — kapatıldığında işler listesine geri döner */}
      <StageCompletionPopup
        visible={!!completionInfo}
        info={completionInfo}
        onClose={() => {
          setCompletionInfo(null);
          // Zaten İşlerim sayfasındayız (OperatorScreen = /(station)/jobs)
          // Selection sıfırlandı, kuyruk yeniden yüklenecek
        }}
      />
    </ScrollView>
  );
}

// ── SelectedJobDetail subcomponent ───────────────────────────────────
function SelectedJobDetail({
  job, isManager, onTimingChanged, checked, onToggleCheck, onFilesChanged, filesRef, notesRef, chatOpen, onChatOpen,
}: {
  job: AssignedJob;
  isManager: boolean;
  onTimingChanged?: () => void;
  checked: Set<string>;
  onToggleCheck: (key: string) => void;
  onFilesChanged?: () => void;
  /** Hero araç çubuğundaki "Dosyalar" bu bölüme kaydırsın diye ref (parent'ta). */
  filesRef?: React.RefObject<View | null>;
  /** Hero araç çubuğundaki "Hekim Notu" bu bölüme kaydırsın diye ref (parent'ta). */
  notesRef?: React.RefObject<View | null>;
  /** Mesaj kutusu görünürlüğü — hero araç çubuğundan kontrol edilir (parent state). */
  chatOpen?: boolean;
  onChatOpen?: (v: boolean) => void;
}) {
  const P = useStationTheme();
  const desc = getStationDescriptor(job.station_name);
  const { profile } = useAuthStore();

  const dueLabel = useMemo(() => {
    if (!job.delivery_date) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(job.delivery_date + 'T00:00:00');
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
    return {
      formatted: due.toLocaleDateString(localeTag()),
      days: diff,
      late: diff < 0,
    };
  }, [job.delivery_date]);

  const Workspace = getStationWorkspace(desc.kind);
  const hasNotes = !!(job.notes && job.notes.trim()) || !!(job.lab_notes && job.lab_notes.trim());

  // Detaylar collapsible — varsa makine veya non-zero timing ya da workspace ipucu
  const hasTimingData = (job.active_work_seconds + job.machine_runtime_seconds + job.queue_waiting_seconds + job.paused_seconds_total) > 0;

  return (
    <View style={{ gap: 16 }}>
      {/* Birincil aksiyon (İşe Başla / Tamamla) artık Hero kartında — burada
         sadece destekleyici içerik: notlar / dosyalar / workspace / checklist.
         DIŞ KART YOK — her bölüm bağımsız. */}

        {/* ═══ Sipariş dosyaları — hero araç çubuğundaki "Dosyalar" buraya kaydırır ═══ */}
        <View ref={filesRef}>
          <FilesAndToothSplit job={job} onFilesChanged={onFilesChanged} />
        </View>

        {/* ═══ Notlar (sadece varsa) ═══ */}
        {hasNotes && (
          <View ref={notesRef} style={panelCardStyle(P)}>
            {job.notes && job.notes.trim() && (
              <View style={{
                paddingHorizontal: 14, paddingVertical: 11,
                backgroundColor: hexA(P.accent, 0.05),
                flexDirection: 'row', gap: 9, alignItems: 'flex-start',
                borderBottomWidth: (job.lab_notes && job.lab_notes.trim()) ? 1 : 0,
                borderBottomColor: P.ink100,
              }}>
                <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: P.accent, borderRadius: 2 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.accentDeep, letterSpacing: 0.9, textTransform: 'uppercase' }}>
                    Hekim Notu
                  </Text>
                  <Text style={{ fontSize: 12.5, color: P.ink700, lineHeight: 17 }}>
                    {job.notes.trim()}
                  </Text>
                </View>
              </View>
            )}
            {job.lab_notes && job.lab_notes.trim() && (
              <View style={{
                paddingHorizontal: 14, paddingVertical: 11,
                backgroundColor: P.ink50,
                flexDirection: 'row', gap: 9, alignItems: 'flex-start',
              }}>
                <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: P.ink300, borderRadius: 2 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink500, letterSpacing: 0.9, textTransform: 'uppercase' }}>
                    Lab İç Notu
                  </Text>
                  <Text style={{ fontSize: 12.5, color: P.ink700, lineHeight: 17 }}>
                    {job.lab_notes.trim()}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ═══ 4. İstasyon-spesifik workspace (varsa) ═══ */}
        {Workspace && (
          <Workspace
            stageId={job.stage_id}
            workOrderId={job.work_order_id}
            stationName={job.station_name}
            toothNumbers={job.tooth_numbers}
            shade={job.shade}
            workType={job.work_type}
            notes={job.notes}
            labNotes={job.lab_notes}
            patientName={job.patient_name}
            checkedKeys={checked}
            isActive={job.status === 'aktif'}
          />
        )}

        {/* ═══ Mesaj kutusu ═══
            Eskiden hero'nun hemen altında accent dolgulu KALIN bir banner'dı ve
            hekim notunun ÜSTÜNDE duruyordu. Teknisyenin işi yapmak için önce
            talimata, sonra dosyalara, sonra tezgâha ihtiyacı var; yazışma
            destekleyici bir eylem. Sıralama düzeltildi, ağırlık hafifletildi. */}
        <Pressable
          onPress={() => onChatOpen?.(true)}
          style={({ pressed }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14,
            backgroundColor: P.surface, borderWidth: 1, borderColor: P.ink100,
            opacity: pressed ? 0.7 : 1,
            transform: [{ scale: pressed ? 0.99 : 1 }],
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <MessageSquare size={16} color={P.ink400} strokeWidth={1.9} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: P.ink700 }}>
            Bu iş hakkında yazış
          </Text>
          {isRTL()
            ? <ChevronLeft size={15} color={P.ink400} strokeWidth={2} />
            : <ChevronRight size={15} color={P.ink400} strokeWidth={2} />}
        </Pressable>

        {/* Validation checklist artık popup'a taşındı — Tamamla butonuna basınca açılır */}

        {/* ═══ 5. Detaylar — collapsible (timing + makine + aktivite) ═══ */}
        <CollapsibleSection
          title="Detaylar"
          subtitle="Zaman dağılımı, makine durumu, aktivite"
          icon={Activity}
          defaultOpen={false}
          accent={P.accent}
        >
          <View style={{ padding: 14, gap: 12, backgroundColor: P.surfaceAlt }}>
            <TimingBreakdown
              timing={{
                active_work_seconds:     job.active_work_seconds,
                machine_runtime_seconds: job.machine_runtime_seconds,
                queue_waiting_seconds:   job.queue_waiting_seconds,
                paused_seconds_total:    job.paused_seconds_total,
                operator_setup_seconds:  job.operator_setup_seconds,
              }}
              stageId={job.stage_id}
              canEdit={isManager}
              onChanged={onTimingChanged}
            />
            {job.station_id && (
              <MachineStatusCard
                stationId={job.station_id}
                currentStageId={job.stage_id}
              />
            )}
            <ActivityFeed stageId={job.stage_id} />
          </View>
        </CollapsibleSection>

        {/* ═══ 6. Audit (manager-only collapsible) ═══ */}
        {isManager && (
          <TimingAuditHistory stageId={job.stage_id} />
        )}

        {/* ═══ Mesaj kutusu modal'ı — teknisyen bu iş hakkında yazışabilir ═══ */}
        <Modal visible={!!chatOpen} transparent animationType="fade" onRequestClose={() => onChatOpen?.(false)}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,14,26,0.52)', ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any) : {}) }}>
            <View style={{ width: '94%', maxWidth: 720, height: '88%', maxHeight: 880, backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' }}>
              <ChatDetail
                selectedOrder={{
                  work_order_id: job.work_order_id,
                  order_number:  job.order_number,
                  patient_name:  job.patient_name,
                  status:        job.status,
                }}
                accentColor={P.accent}
                currentUserId={profile?.id ?? null}
                viewerType={(profile as any)?.user_type ?? null}
                onBack={() => onChatOpen?.(false)}
              />
            </View>
          </View>
        </Modal>
    </View>
  );
}

// ── FilesAndToothSplit — dosyalar (sol) + diş şeması (sağ) ──
function FilesAndToothSplit({ job, onFilesChanged }: { job: AssignedJob; onFilesChanged?: () => void }) {
  const P = useStationTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 1100;
  const hasTeeth = (job.tooth_numbers?.length ?? 0) > 0;

  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  // job değişince seçimi sıfırla
  useEffect(() => { setActiveTooth(null); }, [job.stage_id]);

  // Sipariş dosyaları + imzalı URL'ler — FilesList (kategori+galeri) için
  // (sipariş detayındaki dosya bölümünün AYNISI). Yükleme sonrası fileTick ile tazelenir.
  const [jobPhotos, setJobPhotos] = useState<WorkOrderPhoto[]>([]);
  const [jobUrls, setJobUrls]     = useState<Record<string, string>>({});
  const [fileTick, setFileTick]   = useState(0);
  useEffect(() => {
    if (!job.work_order_id) { setJobPhotos([]); setJobUrls({}); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('work_order_photos')
        .select('*')
        .eq('work_order_id', job.work_order_id)
        .order('created_at', { ascending: false });
      const ph = (data ?? []) as WorkOrderPhoto[];
      const urls = await getSignedUrls(ph.map(p => p.storage_path));
      if (alive) { setJobPhotos(ph); setJobUrls(urls); }
    })();
    return () => { alive = false; };
  }, [job.work_order_id, fileTick]);

  // Tooth chart için minimal "order" payload
  const toothOrder = useMemo(() => ({
    id:             job.work_order_id,
    tooth_numbers:  job.tooth_numbers ?? [],
    photos:         [] as any[],
    work_type:      job.work_type ?? null,
    shade:          job.shade ?? null,
  }), [job.work_order_id, job.tooth_numbers, job.work_type, job.shade]);

  const toothJaw = activeTooth
    ? (activeTooth >= 11 && activeTooth <= 28 ? 'Üst çene' : 'Alt çene')
    : null;
  const toothSide = activeTooth
    ? (activeTooth >= 11 && activeTooth <= 18 ? 'Sağ' :
       activeTooth >= 21 && activeTooth <= 28 ? 'Sol' :
       activeTooth >= 31 && activeTooth <= 38 ? 'Sol' : 'Sağ')
    : null;

  return (
    <View style={{
      flexDirection: isWide && hasTeeth ? 'row' : 'column',
      gap: 16, alignItems: 'stretch',
    }}>
      {/* Sol — Sipariş dosyaları: kategori + galeri (sipariş detayı ile AYNI FilesList) */}
      <View style={[panelCardStyle(P), { flex: 1, minWidth: 0, alignSelf: 'stretch' }]}>
        <View style={PANEL_HEADER_STYLE}>
          <Text style={panelHeaderLabel(P)}>{autoT('Sipariş Dosyaları')}</Text>
          {jobPhotos.length > 0 && (
            <Text style={{ fontSize: 11, fontWeight: '600', color: P.accentDeep }}>
              {jobPhotos.length} {autoT('dosya')}
            </Text>
          )}
        </View>
        <View style={{ padding: 12 }}>
          <FilesList
            photos={jobPhotos}
            signedUrls={jobUrls}
            workOrderId={job.work_order_id}
            accentColor={P.accent}
            stageId={job.stage_id ?? undefined}
            stationName={job.station_name ?? undefined}
            onUploaded={() => { setFileTick(t => t + 1); onFilesChanged?.(); }}
          />
        </View>
      </View>

      {/* Sağ — Diş şeması (büyütüldü, üst kart ile aynı dikey hizada) */}
      {hasTeeth && (
        <View style={[panelCardStyle(P), {
          width: isWide ? 380 : '100%',
          flexShrink: 0,
        }]}>
          {/* Header */}
          <View style={PANEL_HEADER_STYLE}>
            <Text style={panelHeaderLabel(P)}>
              Diş Şeması
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: P.accentDeep }}>
              {job.tooth_numbers.length} diş
            </Text>
          </View>

          {/* Chart */}
          <View style={{ padding: 14, alignItems: 'center', justifyContent: 'center' }}>
            <LivingToothChart
              order={toothOrder as any}
              containerWidth={isWide ? 340 : Math.max(200, Math.min(320, width - 76))}
              accentColor={P.accent}
              activeTooth={activeTooth}
              onToothPress={(fdi) => setActiveTooth(prev => (prev === fdi ? null : fdi))}
              frameless
            />
          </View>

          {/* Tıklanan dişin detayları — seçili dişlerin mavi accent'i ile uyumlu */}
          {activeTooth ? (
            <View style={{
              marginHorizontal: 12, marginBottom: 12,
              padding: 12, borderRadius: 12,
              backgroundColor: hexA(P.accent, 0.06),
              borderWidth: 1, borderColor: hexA(P.accent, 0.18),
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 11,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: P.accent,
                  }}>
                    <Text style={{
                      fontSize: 13, fontWeight: '700', color: '#FFFFFF',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}>
                      {activeTooth}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13.5, fontWeight: '600', color: P.ink900 }}>
                      Diş #{activeTooth}
                    </Text>
                    <Text style={{ fontSize: 10.5, color: P.ink400 }}>
                      {toothJaw} · {toothSide}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setActiveTooth(null)}
                  style={{
                    width: 26, height: 26, borderRadius: 999,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: P.ink100,
                  }}
                >
                  <Text style={{ fontSize: 11, color: P.ink500 }}>✕</Text>
                </Pressable>
              </View>

              <ToothDetailRow label="Çalışma" value={workTypeLabel(job.work_type) ?? job.work_type ?? '—'} />
              {job.shade && <ToothDetailRow label="Renk" value={job.shade} />}
              <ToothDetailRow label="Hasta" value={job.patient_name ?? '—'} />
              {job.doctor_name && <ToothDetailRow label="Hekim" value={job.doctor_name} />}
              {job.clinic_name && <ToothDetailRow label="Klinik" value={job.clinic_name} />}
              {job.machine_type && <ToothDetailRow label="Makine" value={job.machine_type} />}
              <ToothDetailRow label="İstasyon" value={job.station_name ?? '—'} />
              <ToothDetailRow
                label="Durum"
                value={
                  job.status === 'aktif' && job.started_at ? 'Çalışılıyor'
                  : job.status === 'aktif'                  ? 'Kuyrukta'
                  : job.status === 'tamamlandi'             ? 'Tamamlandı'
                  : job.status
                }
              />
            </View>
          ) : (
            <View style={{
              marginHorizontal: 12, marginBottom: 12,
              padding: 10, borderRadius: 10,
              backgroundColor: P.surfaceAlt,
              borderWidth: 1, borderColor: P.ink100,
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 11, color: P.ink500, textAlign: 'center' }}>
                Detayları görmek için bir dişe dokun
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// Diş detay panelinde kullanılan satır
function ToothDetailRow({ label, value }: { label: string; value: string }) {
  const P = useStationTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 6,
      borderTopWidth: 1, borderTopColor: hexA(P.accent, 0.14),
    }}>
      <Text style={{ fontSize: 11.5, color: P.ink500, flexShrink: 0 }}>{label}</Text>
      <Text
        style={{ fontSize: 11.5, fontWeight: '600', color: P.ink900, flex: 1, minWidth: 0, textAlign: 'end' as any }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

// ── JobDetailsPanel — kompakt iş bağlamı (sağ panel içinde) ──────────
function JobDetailsPanel({
  job, dueLabel,
}: {
  job: AssignedJob;
  dueLabel: { formatted: string; days: number; late: boolean } | null;
}) {
  const P = useStationTheme();
  const wtLabel = workTypeLabel(job.work_type);
  const machineLabel = job.machine_type === 'milling' ? 'Frezeleme'
                     : job.machine_type === '3d_printing' ? '3D Baskı'
                     : null;
  const modelLabel = job.model_type === 'dijital' ? 'Dijital Model'
                   : job.model_type === 'fiziksel' ? 'Fiziksel Model'
                   : job.model_type === 'fotograf' ? 'Fotoğraf'
                   : job.model_type === 'cad' ? 'CAD Dosyası'
                   : null;

  const dueText = dueLabel
    ? (dueLabel.late
        ? `${Math.abs(dueLabel.days)} ${autoT('gün geçti')} · ${dueLabel.formatted}`
        : dueLabel.days === 0 ? `${autoT('Bugün')} · ${dueLabel.formatted}`
        : dueLabel.days === 1 ? `${autoT('Yarın')} · ${dueLabel.formatted}`
        : `${dueLabel.days} ${autoT('gün kaldı')} · ${dueLabel.formatted}`)
    : null;
  const dueTone: 'neutral' | 'warning' | 'danger' = !dueLabel
    ? 'neutral'
    : dueLabel.late ? 'danger'
    : dueLabel.days <= 1 ? 'warning'
    : 'neutral';

  return (
    <View style={{
      backgroundColor: P.surfaceAlt,
      borderRadius: 14,
      borderWidth: 1, borderColor: P.ink100,
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: P.ink100,
        backgroundColor: P.surface,
      }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          İş Bağlamı
        </Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink400, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          #{job.order_number}
        </Text>
      </View>

      {/* Teeth row — full width */}
      {job.tooth_numbers.length > 0 && (
        <DetailRow label="Diş Numaraları">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {job.tooth_numbers.map(n => (
              <View
                key={n}
                style={{
                  minWidth: 28, height: 24, paddingHorizontal: 6,
                  borderRadius: 6,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: hexA(P.accent, 0.10),
                  borderWidth: 1, borderColor: hexA(P.accent, 0.22),
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: P.accentDeep }}>
                  {n}
                </Text>
              </View>
            ))}
            <Text style={{ fontSize: 10, color: P.ink400, alignSelf: 'center', marginStart: 4 }}>
              · {job.tooth_numbers.length} diş
            </Text>
          </View>
        </DetailRow>
      )}

      {/* 2-column grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {wtLabel && (
          <DetailCell label="Restorasyon" value={wtLabel} />
        )}
        {machineLabel && (
          <DetailCell label="Üretim" value={machineLabel} />
        )}
        {job.shade && (
          <DetailCell label="Renk" value={job.shade} />
        )}
        {modelLabel && (
          <DetailCell label="Model" value={modelLabel} />
        )}
        {dueText && (
          <DetailCell label="Teslim" value={dueText} tone={dueTone} />
        )}
        {job.started_at && (
          <DetailCell label="Başladı" value={new Date(job.started_at).toLocaleDateString(localeTag())} />
        )}
      </View>

      {/* Doktor notu */}
      {job.notes && job.notes.trim() && (
        <NoteBlock label="Hekim Notu" tone="info" body={job.notes} />
      )}

      {/* Lab iç notu */}
      {job.lab_notes && job.lab_notes.trim() && (
        <NoteBlock label="Lab İç Notu" tone="muted" body={job.lab_notes} />
      )}
    </View>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  const P = useStationTheme();
  return (
    <View style={{
      paddingHorizontal: 16, paddingVertical: 11,
      borderBottomWidth: 1, borderBottomColor: P.ink100,
      gap: 6,
    }}>
      <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink400, letterSpacing: 0.9, textTransform: 'uppercase' }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function DetailCell({
  label, value, tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  const P = useStationTheme();
  const fg = tone === 'danger' ? P.danger : tone === 'warning' ? P.warning : P.ink900;
  return (
    <View style={{
      width: '50%',
      paddingHorizontal: 16, paddingVertical: 10,
      borderEndWidth: 1, borderEndColor: P.ink100,
      borderBottomWidth: 1, borderBottomColor: P.ink100,
      gap: 3,
    }}>
      <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink400, letterSpacing: 0.9, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: fg }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function NoteBlock({
  label, body, tone,
}: {
  label: string;
  body: string;
  tone: 'info' | 'muted';
}) {
  const P = useStationTheme();
  const bg = tone === 'info' ? hexA(P.accent, 0.06) : P.ink50;
  const accentBar = tone === 'info' ? P.accent : P.ink300;
  return (
    <View style={{
      paddingHorizontal: 16, paddingVertical: 12,
      borderTopWidth: 1, borderTopColor: P.ink100,
      backgroundColor: bg,
      flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    }}>
      <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: accentBar, borderRadius: 2 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: tone === 'info' ? P.accentDeep : P.ink500, letterSpacing: 0.9, textTransform: 'uppercase' }}>
          {label}
        </Text>
        <Text style={{ fontSize: 12.5, color: P.ink700, lineHeight: 18 }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

// ── Queue card — enriched job tile (left list) ───────────────────────
function QueueCard({
  job, isSelected, now, onPress, onStart,
}: {
  job: AssignedJob;
  isSelected: boolean;
  now: number;
  onPress: () => void;
  onStart?: () => Promise<void> | void;
}) {
  const P = useStationTheme();
  const [starting, setStarting] = useState(false);
  const isWaiting  = job.status === 'bekliyor';
  const isCritical = job.station_critical || job.is_critical;
  const idleMs     = job.assigned_at ? now - new Date(job.assigned_at).getTime() : 0;
  const sla        = computeSla(job.delivery_date);
  const slaRisk    = !!sla && (sla.late || sla.risky);
  const wtLabel    = workTypeLabel(job.work_type);

  // Sol kenar şerit rengi: gecikti=danger, riskli=warning, kritik=warning, seçili=accent
  const stripeColor = sla?.late
    ? P.danger
    : (sla?.risky || isCritical)
      ? P.warning
      : isSelected
        ? P.accent
        : 'transparent';

  const isActive    = job.status === 'aktif';
  const isStarted   = isActive && !!job.started_at;
  const notStartedYet = isActive && !job.started_at;

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: P.ink100,
        backgroundColor: isSelected
          ? hexA(P.accent, 0.08)
          : isActive
            ? hexA(P.accent, 0.04)
            : P.surface,
        opacity: isWaiting ? 0.6 : 1,
        ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s, opacity 0.15s' } as any : {}),
      }}
    >
      {/* Sequence badge */}
      <View style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: isActive
          ? P.accent
          : hexA(P.accent, isSelected ? 0.16 : 0.10),
        borderWidth: 1,
        borderColor: isActive
          ? P.accent
          : hexA(P.accent, isSelected ? 0.30 : 0.18),
      }}>
        <Text style={{
          fontSize: 13, fontWeight: '700',
          color: isActive ? '#FFFFFF' : P.accentDeep,
          fontFamily: DISPLAY_FONT,
        }}>
          {job.sequence_order || '·'}
        </Text>
      </View>

      {/* Body — iki satır: başlık (istasyon) + alt (hasta · no) */}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          style={{ fontSize: 14.5, fontWeight: '600', color: P.ink900, letterSpacing: -0.2 }}
          numberOfLines={1}
        >
          {job.station_name ?? '—'}
        </Text>
        <Text style={{ fontSize: 12, color: P.ink500 }} numberOfLines={1}>
          {job.patient_name ?? '—'}
          {job.order_number ? `  ·  ${job.order_number}` : ''}
        </Text>
        {(job.doctor_name || job.clinic_name) && (
          <Text style={{ fontSize: 11.5, color: P.ink400 }} numberOfLines={1}>
            {[job.doctor_name, job.clinic_name].filter(Boolean).join('  ·  ')}
          </Text>
        )}
      </View>

      {/* Sağ küme — durum göstergesi + chevron, TEK satır, asla sıkışmaz/sarmaz */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {notStartedYet ? (
          <Pressable
            onPress={async (e: any) => {
              e?.stopPropagation?.();
              if (starting || !onStart) return;
              setStarting(true);
              try { await onStart(); } finally { setStarting(false); }
            }}
            disabled={starting}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 11, paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: hovered ? P.accentDeep : P.accent,
              opacity: starting ? 0.6 : 1,
              ...(Platform.OS === 'web' ? {
                cursor: starting ? 'wait' : 'pointer',
                boxShadow: `0 2px 8px ${hexA(P.accent, 0.32)}`,
                transition: 'background-color 0.15s, transform 0.15s',
              } as any : {}),
            })}
          >
            <Play size={10} color="#FFFFFF" strokeWidth={2.8} />
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {starting ? '...' : 'Başla'}
            </Text>
          </Pressable>
        ) : isStarted ? (
          // Çalışılan iş: canlı yeşil "Çalışıyor" rozeti
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
            backgroundColor: hexA(P.success, 0.10),
            borderWidth: 1, borderColor: hexA(P.success, 0.24),
          }}>
            <View style={{
              width: 6, height: 6, borderRadius: 3, backgroundColor: P.success,
              ...(Platform.OS === 'web'
                ? { boxShadow: `0 0 0 0 ${hexA("#059669", 0.55)}`, animation: 'queueActiveDot 1.6s ease-out infinite' } as any
                : {}),
            }}>
              {Platform.OS === 'web' && <QueueActiveDotKeyframes />}
            </View>
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.success, letterSpacing: 0.3, textTransform: 'uppercase' }}>
              Aktif
            </Text>
          </View>
        ) : sla?.late ? (
          <Pill bg={P.dangerBg} fg={P.danger}>GECİKTİ</Pill>
        ) : job.is_urgent ? (
          <Pill bg={P.dangerBg} fg={P.danger} icon={<Flame size={9} color={P.danger} strokeWidth={2.2} />}>ACİL</Pill>
        ) : sla?.risky ? (
          <Pill bg={P.warningBg} fg={P.warning}>{sla.formatted.toUpperCase()}</Pill>
        ) : isCritical ? (
          <Pill bg={P.warningBg} fg={P.warning}>KRİTİK</Pill>
        ) : isWaiting ? (
          <Pill bg={P.ink100} fg={P.ink500}>SIRADA</Pill>
        ) : null}

        {isRTL()
          ? <ChevronLeft size={15} color={isSelected ? P.accent : P.ink300} strokeWidth={1.8} />
          : <ChevronRight size={15} color={isSelected ? P.accent : P.ink300} strokeWidth={1.8} />}
      </View>
    </Pressable>
  );
}

// Queue listesindeki aktif iş için yeşil dot pulse keyframe — bir kez inject
let _queueActiveDotInjected = false;
function QueueActiveDotKeyframes() {
  if (typeof document === 'undefined') return null;
  if (!_queueActiveDotInjected) {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes queueActiveDot {
        0%   { box-shadow: 0 0 0 0   ${hexA("#059669", 0.55)}; }
        100% { box-shadow: 0 0 0 8px ${hexA("#059669", 0)}; }
      }
    `;
    document.head.appendChild(style);
    _queueActiveDotInjected = true;
  }
  return null;
}

function Pill({ children, bg, fg, icon }: { children: React.ReactNode; bg: string; fg: string; icon?: React.ReactNode }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 3,
      paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4,
      backgroundColor: bg,
    }}>
      {icon}
      <Text style={{ fontSize: 8.5, fontWeight: '700', color: fg, letterSpacing: 0.4 }}>
        {children}
      </Text>
    </View>
  );
}

function ContextChip({ children }: { children: React.ReactNode }) {
  const P = useStationTheme();
  return (
    <View style={{
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
      backgroundColor: P.ink50,
      borderWidth: 1, borderColor: P.ink100,
    }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: P.ink700 }}>
        {children}
      </Text>
    </View>
  );
}

