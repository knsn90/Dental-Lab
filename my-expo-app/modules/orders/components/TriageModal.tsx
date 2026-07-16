/**
 * TriageModal — Triaj kabul + dinamik aşama planlama (Patterns §13).
 *
 * Akış:
 *   1. Manager order detail'i açar → TRIAGE aktif & henüz triajlanmamış → modal otomatik.
 *   2. lab_stations'tan dinamik liste gelir.
 *   3. Sipariş tipine göre preset varsa otomatik seçim.
 *   4. Manager her aşamayı Aktif / Atla olarak işaretler (atla → sebep zorunlu).
 *   5. İlk aktif aşamaya teknisyen ataması opsiyonel.
 *   6. Kayıt → triage_order RPC atomic transaction.
 *
 * Tasarım:
 *   • Patterns §13: avatar + eyebrow + Display 300 title + cream footer
 *   • Panel accent rengi tüm interaktif elementlerde (preset chip, toggle, CTA)
 *   • 2 numaralı bölüm: 1·Şablon, 2·Plan
 *   • Hızlı aksiyon chip'leri: Tümü aktif · Hepsi atla · Sadece kritik
 *   • Sticky özet bar: aktif/atlanacak sayısı + tahmini süre
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput, ScrollView} from 'react-native';
import {
  X, Check, ListChecks, AlertCircle, UserCheck, SkipForward,
  Sparkles, Layers, AlertTriangle, ListPlus, Hourglass,
  ArrowRight, ArrowLeft, FileText, ClipboardList,
  Eye, Download, Box, Paperclip, MessageSquare,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { useAuthStore } from '../../../core/store/authStore';
import { ChatDetail } from './MessagesPopup';

// Viewer3D — lazy chunk (three.js sadece STL/PLY/OBJ açılınca yüklenir)
// Default export'u explicit kontrol et — bazı Metro/Hermes durumlarında
// re-export'tan gelen .default undefined olabiliyor.
import { Viewer3DModalLazy as Viewer3DModal } from '../../viewer-3d/Viewer3DLazy';

function detect3DFmt(name: string): 'stl' | 'ply' | 'obj' | null {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'stl') return 'stl';
  if (ext === 'ply') return 'ply';
  if (ext === 'obj') return 'obj';
  return null;
}

// ── Types ────────────────────────────────────────────────────────────
interface Station {
  id: string;
  name: string;
  color: string;
  is_critical: boolean;
  sequence_hint: number;
  applicable_work_types: string[];   // work-type kategorileri (boş = tümü)
}

interface Technician {
  id: string;
  full_name: string;
  role: string | null;
}

interface Preset {
  id: string;
  case_type: string;
  case_type_label: string;
  station_ids: string[];
  is_default: boolean;
}

interface OrderSummary {
  order_number: string;
  patient_name: string | null;
  patient_gender: string | null;
  work_type: string;
  tooth_numbers: number[];
  shade: string | null;
  is_urgent: boolean;
  delivery_date: string;
  model_type: string | null;
  machine_type: string | null;
  notes: string | null;
  lab_notes: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  clinic_name: string | null;
}

interface PhotoFile {
  id: string;
  storage_path: string;
  caption: string | null;
  signed_url?: string;
}

interface DoctorMessage {
  id: string;
  content: string;
  created_at: string;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_url?: string | null;
  sender_name: string | null;
}

type StageDecision = 'aktif' | 'skipped';

interface StageState {
  stationId: string;
  decision: StageDecision;
  skippedReason: string;
  technicianId: string | null;
}

interface Props {
  visible: boolean;
  orderId: string;
  /** Sipariş tipi (preset eşleşmesi için) — örn 'zirconia_crown' */
  caseType?: string | null;
  /** Order'ın iş kategorisi — istasyon filtresi için (örn 'crown_bridge', 'implant') */
  workCategory?: string | null;
  labId: string | null;
  accentColor?: string;
  onClose: () => void;
  onSaved: () => void;
}

// ── Tokens ───────────────────────────────────────────────────────────
const DisplayFont =
  Platform.OS === 'web'
    ? 'Inter Tight, Inter, system-ui, sans-serif'
    : 'InterTight_300Light';

const INK = {
  900: '#0A0A0A',
  700: '#3C3C3C',
  500: '#6B6B6B',
  400: '#9A9A9A',
  300: '#C8C8C8',
  100: '#EFECE5',
  50:  '#FAF8F2',
} as const;

const CREAM = '#FBF9F4';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// HEX (#RRGGBB) → rgba(...)
function tint(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return `rgba(10,10,10,${alpha})`;
  const r = parseInt(m[1].slice(0, 2), 16);
  const g = parseInt(m[1].slice(2, 4), 16);
  const b = parseInt(m[1].slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Component ────────────────────────────────────────────────────────
export function TriageModal({
  visible, orderId, caseType, workCategory, labId, accentColor = '#0A0A0A',
  onClose, onSaved,
}: Props) {
  const { profile } = useAuthStore();
  const [chatOpen, setChatOpen] = useState(false);   // sipariş yazışması modal'ı
  // localStorage cache (per lab) — popup ikinci açılışta anında render.
  const LS_KEY_TRIAGE = labId ? `triage_modal_v1:${labId}` : null;
  const loadTriageCache = (): { stations: Station[]; technicians: Technician[]; presets: Preset[]; wtRaw: any[] } | null => {
    if (!LS_KEY_TRIAGE || typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(LS_KEY_TRIAGE); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveTriageCache = (d: { stations: Station[]; technicians: Technician[]; presets: Preset[]; wtRaw: any[] }) => {
    if (!LS_KEY_TRIAGE || typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(LS_KEY_TRIAGE, JSON.stringify(d)); } catch { /* quota */ }
  };
  const triageCache = loadTriageCache();

  // ── Wizard step (1 = Sipariş özeti, 2 = Planlama) ──
  const [step, setStep] = useState<1 | 2>(1);
  useEffect(() => { if (visible) setStep(1); }, [visible]);

  // ── Order summary (Step 1) ──
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  // 3D viewer state — STL/PLY/OBJ önizleme (tek dosya veya çoklu)
  const [viewer3DFile, setViewer3DFile] = useState<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj' } | null>(null);
  const [viewer3DFiles, setViewer3DFiles] = useState<Array<{ id: string; name: string; url: string; format: 'stl'|'ply'|'obj' }> | null>(null);
  const [doctorMessages, setDoctorMessages] = useState<DoctorMessage[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (!visible || !orderId) return;
    let cancelled = false;
    setSummaryLoading(true);
    (async () => {
      // work_orders.doctor_id polymorphic (doctors VEYA profiles) — FK yok, embed yapamıyoruz.
      const { data: ord, error: ordErr } = await supabase
        .from('work_orders')
        .select(`
          order_number, doctor_id, patient_name, patient_gender,
          work_type, tooth_numbers, shade, is_urgent, delivery_date,
          model_type, machine_type, notes, lab_notes
        `)
        .eq('id', orderId)
        .maybeSingle();

      if (cancelled) return;
      if (ordErr) console.warn('[TriageModal] order fetch error', ordErr);

      let docName: string | null = null;
      let docPhone: string | null = null;
      let clinicName: string | null = null;

      if (ord?.doctor_id) {
        const [extRes, profRes] = await Promise.all([
          supabase.from('doctors').select('full_name, phone, clinic:clinics(name)').eq('id', ord.doctor_id).maybeSingle(),
          supabase.from('profiles').select('full_name, phone, clinic_name').eq('id', ord.doctor_id).maybeSingle(),
        ]);
        if (cancelled) return;
        if (extRes.data) {
          docName = extRes.data.full_name ?? null;
          docPhone = (extRes.data as any).phone ?? null;
          const cl = (extRes.data as any).clinic;
          clinicName = Array.isArray(cl) ? cl[0]?.name ?? null : cl?.name ?? null;
        } else if (profRes.data) {
          docName = profRes.data.full_name ?? null;
          docPhone = (profRes.data as any).phone ?? null;
          clinicName = (profRes.data as any).clinic_name ?? null;
        }
      }

      if (ord) {
        setOrderSummary({
          order_number: ord.order_number,
          patient_name: ord.patient_name,
          patient_gender: ord.patient_gender,
          work_type: ord.work_type,
          tooth_numbers: ord.tooth_numbers ?? [],
          shade: ord.shade,
          is_urgent: !!ord.is_urgent,
          delivery_date: ord.delivery_date,
          model_type: ord.model_type,
          machine_type: ord.machine_type,
          notes: ord.notes,
          lab_notes: ord.lab_notes,
          doctor_name: docName,
          doctor_phone: docPhone,
          clinic_name: clinicName,
        });
      }

      const { data: ph, error: phErr } = await supabase
        .from('work_order_photos')
        .select('id, storage_path, caption')
        .eq('work_order_id', orderId)
        .order('created_at', { ascending: true });

      if (cancelled) return;
      if (phErr) console.warn('[TriageModal] photos fetch error', phErr);

      const list = (ph ?? []) as PhotoFile[];
      // Signed URL'leri paralel topla
      await Promise.all(list.map(async (f) => {
        const { data } = await supabase.storage
          .from('work-order-photos')
          .createSignedUrl(f.storage_path, 60 * 10);
        if (data?.signedUrl) f.signed_url = data.signedUrl;
      }));

      if (cancelled) return;
      setPhotos(list);

      // Klinik tarafı mesajları (sender user_type ∈ doctor | clinic_admin)
      // Klinik sekreterleri (clinic_admin) çoğu zaman hekim adına mesaj/dosya
      // gönderir; bu nedenle ön izlemede ikisini de hekim talepleri olarak
      // gösteriyoruz. Lab tarafı (lab/admin) mesajları burada listelenmez.
      const { data: msgs } = await supabase
        .from('order_messages')
        .select('id, content, created_at, attachment_name, attachment_type, attachment_url, sender:profiles!order_messages_sender_id_fkey(full_name, user_type)')
        .eq('work_order_id', orderId)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      const docMsgs: DoctorMessage[] = (msgs ?? [])
        .filter((m: any) => {
          const s = Array.isArray(m.sender) ? m.sender[0] : m.sender;
          // Sender bilinmiyorsa (FK kopuk veya RLS gizledi) yine de göster —
          // klinik tarafından geldiyse bile lab'a görünmesi gerek. Lab/admin
          // ise filtrele.
          if (!s) return true;
          return s.user_type === 'doctor' || s.user_type === 'clinic_admin';
        })
        .map((m: any) => {
          const s = Array.isArray(m.sender) ? m.sender[0] : m.sender;
          return {
            id: m.id,
            content: m.content,
            created_at: m.created_at,
            attachment_name: m.attachment_name,
            attachment_type: m.attachment_type,
            attachment_url: m.attachment_url ?? null,
            sender_name: s?.full_name ?? null,
          };
        });
      setDoctorMessages(docMsgs);

      setSummaryLoading(false);
    })();
    return () => { cancelled = true; };
  }, [visible, orderId]);

  const [stations, setStations] = useState<Station[]>(triageCache?.stations ?? []);
  const [technicians, setTechnicians] = useState<Technician[]>(triageCache?.technicians ?? []);
  const [presets, setPresets] = useState<Preset[]>(triageCache?.presets ?? []);
  const [stageStates, setStageStates] = useState<StageState[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(triageCache === null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** Manager "Tüm istasyonları göster" toggle */
  const [showAll, setShowAll] = useState(false);

  // ── Load ──
  useEffect(() => {
    if (!visible || !labId) return;
    setError('');
    const cachedNow = loadTriageCache();
    if (cachedNow === null) setLoading(true);
    (async () => {
      const [s, t, p, wt] = await Promise.all([
        supabase.from('lab_stations').select('id, name, color, is_critical, sequence_hint, applicable_work_types').eq('is_active', true).order('sequence_hint'),
        supabase.from('profiles').select('id, full_name, role').eq('lab_id', labId).eq('user_type', 'lab').eq('approval_status', 'approved').order('full_name'),
        supabase.from('case_type_stage_presets').select('*').eq('lab_id', labId),
        // Yeni: workflow_templates — varsa preset listesine eklenir
        supabase.from('workflow_templates')
          .select('id, name, case_types, station_ids, is_default')
          .eq('lab_id', labId).eq('is_active', true),
      ]);

      const stationsData = (s.data ?? []) as Station[];
      setStations(stationsData);
      setTechnicians((t.data ?? []) as Technician[]);

      // Workflow templates → Preset şekline çevir (UI seçici aynı kalsın)
      // case_type alanı: case_types[0] veya name (case_types boşsa)
      const wtPresets: Preset[] = (wt.data ?? []).map((row: any) => ({
        id: `wt:${row.id}`,
        case_type: (row.case_types && row.case_types[0]) || row.name,
        case_type_label: row.name,
        station_ids: row.station_ids ?? [],
        is_default: !!row.is_default,
      }));
      // Mevcut presetleri ve workflow templates'i birleştir (workflow_templates önde)
      const allPresets: Preset[] = [...wtPresets, ...((p.data ?? []) as Preset[])];
      setPresets(allPresets);
      // Cache kaydet (next open instantly renders)
      saveTriageCache({
        stations: stationsData,
        technicians: (t.data ?? []) as Technician[],
        presets: allPresets,
        wtRaw: (wt.data ?? []) as any[],
      });

      // Initial stage states — preset varsa ondan, yoksa hepsi aktif
      let initialStates: StageState[];
      // Eşleşen kullanılırken önce workflow_templates aranır (case_types array → contains)
      const matchedWfTemplate = (wt.data ?? []).find((row: any) =>
        Array.isArray(row.case_types) && caseType && row.case_types.includes(caseType)
      );
      const matchedPreset = matchedWfTemplate
        ? wtPresets.find(pr => pr.id === `wt:${matchedWfTemplate.id}`)
        : (p.data ?? []).find((pr: any) => pr.case_type === caseType);
      const defaultPreset = allPresets.find(pr => pr.is_default);
      const usedPreset = matchedPreset ?? defaultPreset;

      if (usedPreset) {
        // Preset eşleşmesi varsa: preset'teki istasyonlar aktif, gerisi skipped
        setActivePresetId(usedPreset.id);
        initialStates = stationsData.map((st): StageState => ({
          stationId: st.id,
          decision: usedPreset.station_ids.includes(st.id) ? 'aktif' : 'skipped',
          skippedReason: usedPreset.station_ids.includes(st.id) ? '' : 'Bu siparişte gerekli değil',
          technicianId: null,
        }));
      } else {
        // Preset yoksa: hepsi skipped — manager tek tek aktif eder
        initialStates = stationsData.map((st): StageState => ({
          stationId: st.id,
          decision: 'skipped',
          skippedReason: 'Bu siparişte gerekli değil',
          technicianId: null,
        }));
      }
      setStageStates(initialStates);
      setLoading(false);
    })();
  }, [visible, labId, caseType]);

  // ── Apply preset ──
  const applyPreset = (preset: Preset | null) => {
    if (!preset) {
      setActivePresetId(null);
      setStageStates(stations.map((st): StageState => ({
        stationId: st.id, decision: 'aktif', skippedReason: '', technicianId: null,
      })));
      return;
    }
    setActivePresetId(preset.id);
    setStageStates(stations.map((st): StageState => ({
      stationId: st.id,
      decision: preset.station_ids.includes(st.id) ? 'aktif' : 'skipped',
      skippedReason: preset.station_ids.includes(st.id) ? '' : 'Bu siparişte gerekli değil',
      technicianId: null,
    })));
  };

  // ── Quick actions ──
  const setAllActive = () => {
    setActivePresetId(null);
    setStageStates(stations.map((st): StageState => ({
      stationId: st.id, decision: 'aktif', skippedReason: '', technicianId: null,
    })));
  };
  const setAllSkipped = () => {
    setActivePresetId(null);
    setStageStates(stations.map((st): StageState => ({
      stationId: st.id, decision: 'skipped', skippedReason: 'Bu siparişte gerekli değil', technicianId: null,
    })));
  };
  const setOnlyCritical = () => {
    setActivePresetId(null);
    setStageStates(stations.map((st): StageState => ({
      stationId: st.id,
      decision: st.is_critical ? 'aktif' : 'skipped',
      skippedReason: st.is_critical ? '' : 'Bu siparişte gerekli değil',
      technicianId: null,
    })));
  };

  const updateStage = (stationId: string, patch: Partial<StageState>) => {
    setStageStates(prev => prev.map(s => s.stationId === stationId ? { ...s, ...patch } : s));
    setActivePresetId(null);
  };

  // ── Derived: work-type filtresine uyan istasyonlar ──
  // Boş applicable_work_types = "her zaman" → her vakada gösterilir
  // workCategory verilmemişse hepsi gösterilir
  const visibleStations = useMemo(() => {
    if (showAll || !workCategory) return stations;
    return stations.filter(st =>
      !st.applicable_work_types ||
      st.applicable_work_types.length === 0 ||
      st.applicable_work_types.includes(workCategory)
    );
  }, [stations, showAll, workCategory]);

  const hiddenCount = stations.length - visibleStations.length;

  const activeStages = useMemo(() =>
    stageStates.filter(s => s.decision === 'aktif'),
    [stageStates],
  );
  const skippedCount = stageStates.length - activeStages.length;
  const firstActiveStation = useMemo(() => {
    const firstActive = stageStates.find(s => s.decision === 'aktif');
    return firstActive ? stations.find(st => st.id === firstActive.stationId) ?? null : null;
  }, [stageStates, stations]);

  const canSave = !saving && !loading && activeStages.length > 0;

  const handleSave = async () => {
    setError('');

    if (activeStages.length === 0) {
      setError('En az 1 aşama aktif olmalı'); return;
    }

    const skippedWithoutReason = stageStates.find(s => s.decision === 'skipped' && !s.skippedReason.trim());
    if (skippedWithoutReason) {
      setError('Atlanan aşamalar için sebep girilmeli'); return;
    }

    setSaving(true);

    const ordered = stations.map(st => ({
      station: st,
      state: stageStates.find(s => s.stationId === st.id)!,
    }));

    let firstActiveAssigned = false;
    const lines = ordered.map((row, idx) => {
      const isActiveStage = row.state.decision === 'aktif' && !firstActiveAssigned;
      const status = row.state.decision === 'skipped'
        ? 'skipped'
        : isActiveStage ? 'aktif' : 'bekliyor';
      if (isActiveStage) firstActiveAssigned = true;
      return {
        station_id: row.station.id,
        sequence_order: idx + 1,
        status,
        skipped_reason: row.state.decision === 'skipped' ? row.state.skippedReason : null,
        // Tüm aşamalar için teknisyen — boşsa RPC istasyonun default'unu otomatik atar
        technician_id: row.state.technicianId ?? null,
        is_critical: row.station.is_critical,
      };
    });

    const { error: rpcErr } = await supabase.rpc('triage_order', {
      p_order_id: orderId,
      p_lines: lines,
      p_first_tech_id: firstActiveStation
        ? stageStates.find(s => s.stationId === firstActiveStation.id)?.technicianId ?? null
        : null,
    });

    setSaving(false);
    if (rpcErr) { setError(rpcErr.message ?? 'Kayıt hatası'); return; }
    onSaved();
  };

  // ── Subcomponents ──
  const SummaryField = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 9.5, fontWeight: '700', color: INK[400], letterSpacing: 0.8, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: INK[900] }}>{value}</Text>
    </View>
  );

  const CompactField = ({ label, value }: { label: string; value: string }) => (
    <Text style={{ fontSize: 11.5, color: INK[500] }}>
      {label}: <Text style={{ color: INK[900], fontWeight: '600' }}>{value}</Text>
    </Text>
  );

  const SectionHeader = ({ num, title, sub, icon }: { num: number; title: string; sub: string; icon: React.ReactNode }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <View style={{
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: tint(accentColor, 0.10),
        borderWidth: 1, borderColor: tint(accentColor, 0.16),
        alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          {num} · {title}
        </Text>
        <Text style={{ fontSize: 12, color: INK[500], marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 24, width: 760, maxWidth: '100%', maxHeight: '94%',
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.22)' } as any : {}),
        }}>

          {/* ═════ HEADER (Patterns §13) ═════ */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
            paddingHorizontal: 28, paddingTop: 24, paddingBottom: 20, gap: 16,
          }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 14,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: tint(accentColor, 0.12),
                borderWidth: 1, borderColor: tint(accentColor, 0.20),
              }}>
                <ListChecks size={20} color={accentColor} strokeWidth={1.7} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Planlama · İş emri
                </Text>
                <Text style={{
                  fontFamily: DisplayFont, fontWeight: '300', fontSize: 26,
                  letterSpacing: -0.6, color: INK[900], lineHeight: 32, marginTop: 2,
                }}>
                  Aşamaları seç & üretime başlat
                </Text>
                <Text style={{ fontSize: 12, color: INK[500], marginTop: 4, lineHeight: 17 }}>
                  Bu siparişte yapılacak aşamaları işaretle. Atlanan aşamalar için sebep gir.
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => setChatOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 36, paddingHorizontal: 12, borderRadius: 12,
                backgroundColor: tint(accentColor, 0.12),
                borderWidth: 1, borderColor: tint(accentColor, 0.28),
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <MessageSquare size={14} color={accentColor} strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>Mesaj</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 12,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={15} color={INK[500]} strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* ═════ STEPPER ═════ */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 28, paddingBottom: 16,
          }}>
            {[
              { n: 1, label: 'Sipariş özeti', icon: <ClipboardList size={13} color={step === 1 ? '#FFF' : INK[500]} strokeWidth={1.8} /> },
              { n: 2, label: 'Planlama', icon: <ListChecks size={13} color={step === 2 ? '#FFF' : INK[500]} strokeWidth={1.8} /> },
            ].map((s, idx) => {
              const active = step === s.n;
              const done = step > s.n;
              return (
                <React.Fragment key={s.n}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                    backgroundColor: active ? accentColor : done ? tint(accentColor, 0.10) : '#FFFFFF',
                    borderWidth: 1,
                    borderColor: active ? accentColor : done ? tint(accentColor, 0.30) : 'rgba(0,0,0,0.10)',
                  }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 10,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: active ? 'rgba(255,255,255,0.20)' : done ? accentColor : tint(accentColor, 0.10),
                    }}>
                      {done
                        ? <Check size={11} color="#FFF" strokeWidth={2.4} />
                        : <Text style={{ fontSize: 10, fontWeight: '700', color: active ? '#FFF' : INK[500] }}>{s.n}</Text>}
                    </View>
                    <Text style={{
                      fontSize: 11.5, fontWeight: '600',
                      color: active ? '#FFF' : done ? accentColor : INK[500],
                    }}>
                      {s.label}
                    </Text>
                  </View>
                  {idx === 0 && (
                    <View style={{ flex: 1, height: 1, backgroundColor: tint(accentColor, step === 2 ? 0.30 : 0.12) }} />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* ═════ STICKY SUMMARY BAR ═════ */}
          {!loading && step === 2 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              marginHorizontal: 28, marginBottom: 18,
              paddingHorizontal: 16, paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: tint(accentColor, 0.06),
              borderWidth: 1, borderColor: tint(accentColor, 0.14),
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accentColor }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: INK[900] }}>
                  {activeStages.length} aktif aşama
                </Text>
              </View>
              <View style={{ width: 1, height: 16, backgroundColor: 'rgba(0,0,0,0.10)' }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <SkipForward size={11} color={INK[500]} strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: '500', color: INK[500] }}>
                  {skippedCount} atlanacak
                </Text>
              </View>
              {firstActiveStation && (
                <>
                  <View style={{ width: 1, height: 16, backgroundColor: 'rgba(0,0,0,0.10)' }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Hourglass size={11} color={INK[500]} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontWeight: '500', color: INK[500] }} numberOfLines={1}>
                      İlk aşama: <Text style={{ color: INK[900], fontWeight: '600' }}>{firstActiveStation.name}</Text>
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}

          {loading ? (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
              <ActivityIndicator color={accentColor} />
              <Text style={{ fontSize: 12, color: INK[400], marginTop: 12 }}>İstasyonlar yükleniyor…</Text>
            </View>
          ) : step === 1 ? (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 22 }}
              showsVerticalScrollIndicator={false}
            >
              {summaryLoading && !orderSummary ? (
                <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                  <ActivityIndicator color={accentColor} />
                  <Text style={{ fontSize: 12, color: INK[400], marginTop: 12 }}>Sipariş yükleniyor…</Text>
                </View>
              ) : orderSummary ? (
                <View style={{ gap: 14 }}>
                  {/* Preset eşleşme hint'i */}
                  {activePresetId && (() => {
                    const matched = presets.find(p => p.id === activePresetId);
                    if (!matched) return null;
                    return (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        padding: 12, borderRadius: 12,
                        backgroundColor: tint(accentColor, 0.08),
                        borderWidth: 1, borderColor: tint(accentColor, 0.20),
                      }}>
                        <Sparkles size={14} color={accentColor} strokeWidth={1.8} />
                        <Text style={{ flex: 1, fontSize: 12, color: INK[700], lineHeight: 17 }}>
                          Bu sipariş için <Text style={{ color: accentColor, fontWeight: '700' }}>{matched.case_type_label}</Text> şablonu önerildi — planlamada gözden geçirin.
                        </Text>
                      </View>
                    );
                  })()}

                  {/* İş bilgisi — kompakt */}
                  {(() => {
                    const items = (orderSummary.work_type || '')
                      .split(/,\s*/)
                      .map(s => s.trim())
                      .filter(Boolean);
                    const counts = items.reduce<Record<string, number>>((acc, it) => {
                      acc[it] = (acc[it] ?? 0) + 1;
                      return acc;
                    }, {});
                    const uniqueItems = Object.entries(counts);
                    return (
                      <View style={{
                        borderRadius: 14, padding: 12, gap: 10,
                        backgroundColor: tint(accentColor, 0.05),
                        borderWidth: 1, borderColor: tint(accentColor, 0.14),
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Layers size={13} color={accentColor} strokeWidth={1.8} />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                            İş bilgisi
                          </Text>
                          {orderSummary.is_urgent && (
                            <View style={{
                              paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 9999,
                              backgroundColor: 'rgba(217,119,6,0.14)',
                              borderWidth: 1, borderColor: 'rgba(217,119,6,0.24)',
                            }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#92400E', letterSpacing: 0.5 }}>ACİL</Text>
                            </View>
                          )}
                          <View style={{ flex: 1 }} />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: INK[500] }}>
                            {orderSummary.order_number}
                          </Text>
                        </View>

                        {/* Dedupe + count: "İmplant Üstü Kron (Zirkonyum) ×16" */}
                        <View style={{ gap: 3 }}>
                          {uniqueItems.map(([name, n]) => (
                            <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: INK[900], flex: 1 }} numberOfLines={2}>
                                {name}
                              </Text>
                              {n > 1 && (
                                <View style={{
                                  paddingHorizontal: 7, paddingVertical: 1, borderRadius: 9999,
                                  backgroundColor: tint(accentColor, 0.14),
                                  borderWidth: 1, borderColor: tint(accentColor, 0.22),
                                }}>
                                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: accentColor }}>×{n}</Text>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>

                        {/* Tek satır meta */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, rowGap: 4 }}>
                          <CompactField label="Teslim" value={fmtDate(orderSummary.delivery_date)} />
                          {orderSummary.shade && <CompactField label="Renk" value={orderSummary.shade} />}
                          {orderSummary.model_type && <CompactField label="Model" value={orderSummary.model_type} />}
                          {orderSummary.machine_type && <CompactField label="Makine" value={orderSummary.machine_type} />}
                        </View>

                        {orderSummary.tooth_numbers.length > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 9.5, fontWeight: '700', color: INK[500], letterSpacing: 0.8, textTransform: 'uppercase' }}>
                              Dişler ({orderSummary.tooth_numbers.length})
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                              {orderSummary.tooth_numbers.map(t => (
                                <View key={t} style={{
                                  paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6,
                                  backgroundColor: '#FFFFFF',
                                  borderWidth: 1, borderColor: tint(accentColor, 0.20),
                                }}>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor }}>{t}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })()}

                  {/* Hasta + Hekim */}
                  <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                    <View style={{
                      flex: 1, minWidth: 240, borderRadius: 14, padding: 14, gap: 8,
                      backgroundColor: CREAM,
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: INK[500], letterSpacing: 1.2, textTransform: 'uppercase' }}>
                        Hasta
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: INK[900] }}>
                        {orderSummary.patient_name || '—'}
                      </Text>
                      <View style={{ gap: 3 }}>
                        {orderSummary.patient_gender && (
                          <Text style={{ fontSize: 12, color: INK[500] }}>Cinsiyet: <Text style={{ color: INK[700] }}>{orderSummary.patient_gender}</Text></Text>
                        )}
                      </View>
                    </View>

                    <View style={{
                      flex: 1, minWidth: 240, borderRadius: 14, padding: 14, gap: 8,
                      backgroundColor: CREAM,
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: INK[500], letterSpacing: 1.2, textTransform: 'uppercase' }}>
                        Hekim & klinik
                      </Text>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: INK[900] }}>
                        {orderSummary.doctor_name || '—'}
                      </Text>
                      <View style={{ gap: 3 }}>
                        {orderSummary.clinic_name && (
                          <Text style={{ fontSize: 12, color: INK[500] }}>Klinik: <Text style={{ color: INK[700] }}>{orderSummary.clinic_name}</Text></Text>
                        )}
                        {orderSummary.doctor_phone && (
                          <Text style={{ fontSize: 12, color: INK[500] }}>Tel: <Text style={{ color: INK[700] }}>{orderSummary.doctor_phone}</Text></Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Hekim talepleri — sipariş notu + chat mesajları (düz liste, kart yok) */}
                  {(orderSummary.notes || doctorMessages.length > 0) && (
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ClipboardList size={12} color={INK[500]} strokeWidth={1.8} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: INK[500], letterSpacing: 1.2, textTransform: 'uppercase' }}>
                          Hekim talepleri · İş emri
                        </Text>
                      </View>

                      {/* Sipariş notu */}
                      {orderSummary.notes ? (
                        <View style={{
                          flexDirection: 'row', gap: 10, alignItems: 'baseline',
                          paddingVertical: 6,
                          borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
                        }}>
                          <Text style={{ width: 50, fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 0.5 }}>NOT</Text>
                          <Text style={{ flex: 1, fontSize: 13, color: INK[900], lineHeight: 19 }}>
                            {orderSummary.notes}
                          </Text>
                        </View>
                      ) : null}

                      {/* Chat'ten gelen hekim mesajları */}
                      {doctorMessages.map((m, idx) => (
                        <View key={m.id} style={{
                          flexDirection: 'row', gap: 10, alignItems: 'baseline',
                          paddingVertical: 6,
                          borderBottomWidth: idx < doctorMessages.length - 1 ? 1 : 0,
                          borderBottomColor: 'rgba(0,0,0,0.06)',
                        }}>
                          <Text style={{ width: 50, fontSize: 10, color: INK[400], letterSpacing: 0.3 }}>
                            {fmtDateTime(m.created_at).split(' ')[1] ?? ''}
                          </Text>
                          <View style={{ flex: 1, gap: 2 }}>
                            {m.content ? (
                              <Text style={{ fontSize: 13, color: INK[900], lineHeight: 19 }}>{m.content}</Text>
                            ) : null}
                            {m.attachment_name && (
                              <Pressable
                                onPress={() => {
                                  if (m.attachment_url && Platform.OS === 'web') {
                                    window.open(m.attachment_url, '_blank');
                                  }
                                }}
                                style={({ hovered }: any) => ({
                                  flexDirection: 'row', alignItems: 'center', gap: 4,
                                  ...(Platform.OS === 'web' && m.attachment_url
                                    ? { cursor: 'pointer' } as any : {}),
                                  opacity: hovered && m.attachment_url ? 0.7 : 1,
                                })}
                              >
                                <Paperclip size={10} color={m.attachment_url ? accentColor : INK[500]} strokeWidth={1.8} />
                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: m.attachment_url ? accentColor : INK[500],
                                    fontStyle: 'italic',
                                    textDecorationLine: m.attachment_url ? 'underline' : 'none',
                                  }}
                                  numberOfLines={1}
                                >
                                  {m.attachment_name}
                                </Text>
                              </Pressable>
                            )}
                            <Text style={{ fontSize: 10, color: INK[400] }}>
                              {m.sender_name || 'Hekim'} · {fmtDateTime(m.created_at)}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Lab dahili notu */}
                  {orderSummary.lab_notes ? (
                    <View style={{
                      borderRadius: 14, padding: 14, gap: 6,
                      backgroundColor: CREAM,
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <FileText size={12} color={INK[500]} strokeWidth={1.8} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: INK[500], letterSpacing: 1.2, textTransform: 'uppercase' }}>
                          Laboratuvar notu
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, color: INK[700], lineHeight: 19 }}>
                        {orderSummary.lab_notes}
                      </Text>
                    </View>
                  ) : null}

                  {/* Dosyalar */}
                  <View style={{
                    borderRadius: 14, padding: 14, gap: 10,
                    backgroundColor: CREAM,
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <FileText size={12} color={INK[500]} strokeWidth={1.8} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: INK[500], letterSpacing: 1.2, textTransform: 'uppercase' }}>
                        Tarama & dosyalar
                      </Text>
                      <Text style={{ fontSize: 11, color: INK[400] }}>({photos.length})</Text>
                      {/* Çoklu 3D dosya varsa "Tümünü 3D aç" butonu */}
                      {(() => {
                        const all3D = photos
                          .map(f => ({ f, fmt: detect3DFmt(f.storage_path) || detect3DFmt(f.caption || '') }))
                          .filter(x => x.fmt && x.f.signed_url);
                        if (all3D.length < 2 || Platform.OS !== 'web') return null;
                        return (
                          <Pressable
                            onPress={() => {
                              setViewer3DFiles(all3D.map(x => ({
                                id: x.f.id,
                                name: x.f.caption || x.f.storage_path.split('/').pop() || 'Dosya',
                                url: x.f.signed_url!,
                                format: x.fmt!,
                              })));
                            }}
                            style={({ hovered }: any) => ({
                              marginLeft: 'auto' as any,
                              flexDirection: 'row', alignItems: 'center', gap: 5,
                              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                              backgroundColor: hovered ? accentColor : accentColor + 'DD',
                              ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 140ms ease' } as any : {}),
                            })}
                          >
                            <Box size={11} color="#FFFFFF" strokeWidth={2.2} />
                            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
                              Tümünü 3D aç ({all3D.length})
                            </Text>
                          </Pressable>
                        );
                      })()}
                    </View>
                    {photos.length === 0 ? (
                      <Text style={{ fontSize: 12, color: INK[400], fontStyle: 'italic' }}>
                        Hekim henüz dosya yüklemedi.
                      </Text>
                    ) : (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {photos.map(f => {
                          const isImg = /\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(f.storage_path);
                          const filename = f.caption || f.storage_path.split('/').pop() || 'Dosya';
                          // Format'ı storage_path'ten oku (caption sadece label olabilir)
                          const fmt3D = detect3DFmt(f.storage_path) || detect3DFmt(filename);
                          const canPreview = !!f.signed_url && (isImg || (fmt3D && Platform.OS === 'web'));
                          return (
                            <View
                              key={f.id}
                              style={{
                                width: 110, borderRadius: 10, overflow: 'hidden',
                                backgroundColor: '#FFFFFF',
                                borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                              }}
                            >
                              {/* Önizleme alanı — tıklanabilir */}
                              <Pressable
                                onPress={() => {
                                  if (!f.signed_url) return;
                                  if (fmt3D && Platform.OS === 'web') {
                                    setViewer3DFile({ id: f.id, name: filename, url: f.signed_url, format: fmt3D });
                                    return;
                                  }
                                  if (Platform.OS === 'web') window.open(f.signed_url, '_blank');
                                }}
                                style={{
                                  width: 110, height: 80, position: 'relative',
                                  ...(Platform.OS === 'web' ? { cursor: canPreview ? 'pointer' : 'default' } as any : {}),
                                }}
                              >
                                {isImg && f.signed_url ? (
                                  <View style={{ width: '100%', height: '100%', backgroundColor: INK[100] }}>
                                    {Platform.OS === 'web' ? (
                                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                      React.createElement('img' as any, {
                                        src: f.signed_url,
                                        style: { width: '100%', height: '100%', objectFit: 'cover' },
                                        alt: f.caption ?? '',
                                      })
                                    ) : null}
                                  </View>
                                ) : (
                                  <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: INK[100] }}>
                                    {fmt3D
                                      ? <Box size={22} color={accentColor} strokeWidth={1.8} />
                                      : <FileText size={20} color={INK[500]} strokeWidth={1.6} />}
                                  </View>
                                )}
                                {/* 3D format badge */}
                                {fmt3D && (
                                  <View style={{
                                    position: 'absolute', top: 4, left: 4,
                                    paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 999,
                                    backgroundColor: accentColor,
                                  }}>
                                    <Text style={{ color: '#FFFFFF', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.5 }}>
                                      {fmt3D.toUpperCase()}
                                    </Text>
                                  </View>
                                )}
                              </Pressable>
                              <View style={{ paddingHorizontal: 7, paddingTop: 5, paddingBottom: 4 }}>
                                <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '600', color: INK[700] }}>
                                  {filename}
                                </Text>
                              </View>
                              {/* Aksiyon butonları */}
                              <View style={{
                                flexDirection: 'row',
                                borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
                              }}>
                                {canPreview && (
                                  <Pressable
                                    onPress={() => {
                                      if (!f.signed_url) return;
                                      if (fmt3D && Platform.OS === 'web') {
                                        setViewer3DFile({ id: f.id, name: filename, url: f.signed_url, format: fmt3D });
                                        return;
                                      }
                                      if (Platform.OS === 'web') window.open(f.signed_url, '_blank');
                                    }}
                                    style={({ hovered }: any) => ({
                                      flex: 1, paddingVertical: 6, flexDirection: 'row',
                                      alignItems: 'center', justifyContent: 'center', gap: 4,
                                      backgroundColor: hovered ? accentColor + '14' : 'transparent',
                                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                                    })}
                                  >
                                    {fmt3D
                                      ? <Box size={11} color={accentColor} strokeWidth={2} />
                                      : <Eye size={11} color={accentColor} strokeWidth={2} />}
                                    <Text style={{ color: accentColor, fontSize: 9.5, fontWeight: '700' }}>
                                      {fmt3D ? '3D' : 'Aç'}
                                    </Text>
                                  </Pressable>
                                )}
                                <Pressable
                                  onPress={() => {
                                    if (!f.signed_url || Platform.OS !== 'web') return;
                                    const a = document.createElement('a');
                                    a.href = f.signed_url;
                                    a.download = filename;
                                    a.target = '_blank'; a.rel = 'noopener';
                                    document.body.appendChild(a); a.click();
                                    setTimeout(() => { try { document.body.removeChild(a); } catch {} }, 100);
                                  }}
                                  style={({ hovered }: any) => ({
                                    flex: 1, paddingVertical: 6, flexDirection: 'row',
                                    alignItems: 'center', justifyContent: 'center', gap: 4,
                                    borderLeftWidth: canPreview ? 1 : 0,
                                    borderLeftColor: 'rgba(0,0,0,0.06)',
                                    backgroundColor: hovered ? INK[100] : 'transparent',
                                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                                  })}
                                >
                                  <Download size={11} color={INK[500]} strokeWidth={2} />
                                  <Text style={{ color: INK[500], fontSize: 9.5, fontWeight: '700' }}>
                                    İndir
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View style={{ paddingVertical: 60, alignItems: 'center' }}>
                  <AlertCircle size={20} color={INK[400]} strokeWidth={1.6} />
                  <Text style={{ fontSize: 12, color: INK[500], marginTop: 8 }}>Sipariş bulunamadı</Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 22 }}
              showsVerticalScrollIndicator={false}
            >
              {/* ═════ 1 · ŞABLON ═════ */}
              {presets.length > 0 && (
                <View style={{ marginBottom: 22 }}>
                  <SectionHeader
                    num={1}
                    title="Hızlı şablon"
                    sub="Sipariş tipine göre öntanımlı aşama setleri"
                    icon={<Sparkles size={15} color={accentColor} strokeWidth={1.8} />}
                  />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {presets.map(p => {
                      const active = activePresetId === p.id;
                      return (
                        <Pressable
                          key={p.id}
                          onPress={() => applyPreset(p)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                            paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                            borderWidth: 1,
                            borderColor: active ? accentColor : 'rgba(0,0,0,0.10)',
                            backgroundColor: active ? accentColor : '#FFFFFF',
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          }}
                        >
                          {active && <Check size={11} color="#FFF" strokeWidth={2.4} />}
                          <Text style={{
                            fontSize: 12,
                            fontWeight: active ? '600' : '500',
                            color: active ? '#FFF' : INK[700],
                          }}>
                            {p.case_type_label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ═════ 2 · AŞAMALAR ═════ */}
              <SectionHeader
                num={presets.length > 0 ? 2 : 1}
                title="Aşama planı"
                sub={
                  workCategory && hiddenCount > 0
                    ? `${visibleStations.length} ilgili istasyon · ${hiddenCount} alakasız gizli`
                    : `${visibleStations.length} istasyon — her birini "Aktif" veya "Atla" olarak işaretle`
                }
                icon={<Layers size={15} color={accentColor} strokeWidth={1.8} />}
              />

              {/* "Tümünü göster" toggle — workCategory varsa ve gizlenen varsa */}
              {workCategory && hiddenCount > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, marginTop: -6 }}>
                  <Pressable
                    onPress={() => setShowAll(v => !v)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999,
                      backgroundColor: showAll ? tint(accentColor, 0.10) : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: showAll ? tint(accentColor, 0.30) : 'rgba(0,0,0,0.10)',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Text style={{
                      fontSize: 11, fontWeight: '600',
                      color: showAll ? accentColor : INK[500],
                    }}>
                      {showAll ? `Sadece alakalı (${visibleStations.length - hiddenCount})` : `Tüm istasyonları göster (+${hiddenCount})`}
                    </Text>
                  </Pressable>
                  <Text style={{ fontSize: 11, color: INK[400], fontStyle: 'italic' }}>
                    Vaka tipi: <Text style={{ color: accentColor, fontWeight: '600', fontStyle: 'normal' }}>{workCategory}</Text>
                  </Text>
                </View>
              )}

              {/* Hızlı aksiyonlar */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                <Pressable
                  onPress={setAllActive}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <ListPlus size={11} color={INK[500]} strokeWidth={1.8} />
                  <Text style={{ fontSize: 11, fontWeight: '500', color: INK[700] }}>Tümü aktif</Text>
                </Pressable>
                <Pressable
                  onPress={setOnlyCritical}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <AlertTriangle size={11} color="#92400E" strokeWidth={1.8} />
                  <Text style={{ fontSize: 11, fontWeight: '500', color: INK[700] }}>Sadece kritik</Text>
                </Pressable>
                <Pressable
                  onPress={setAllSkipped}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <SkipForward size={11} color={INK[500]} strokeWidth={1.8} />
                  <Text style={{ fontSize: 11, fontWeight: '500', color: INK[700] }}>Hepsini atla</Text>
                </Pressable>
              </View>

              {/* Stage cards — yalnızca uygulanabilir/visible istasyonlar */}
              <View style={{ gap: 8 }}>
                {visibleStations.map((st) => {
                  const state = stageStates.find(s => s.stationId === st.id);
                  if (!state) return null;
                  const isActive = state.decision === 'aktif';
                  const isFirstActive = firstActiveStation?.id === st.id;
                  // Aktif sıra numarası — TÜM stations içinde mutlak sequence kullan
                  const absIdx = stations.findIndex(x => x.id === st.id);
                  const seqNum = isActive
                    ? stageStates.filter(
                        s => s.decision === 'aktif'
                          && stations.findIndex(x => x.id === s.stationId) <= absIdx
                      ).length
                    : null;

                  return (
                    <View
                      key={st.id}
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isActive ? tint(accentColor, 0.30) : 'rgba(0,0,0,0.07)',
                        backgroundColor: isActive ? tint(accentColor, 0.05) : CREAM,
                        overflow: 'hidden',
                        // İstasyonu tanıyan ince renk şeridi (sol kenar)
                        ...(isActive ? {
                          borderLeftWidth: 3,
                          borderLeftColor: st.color,
                        } : {}),
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 }}>
                        {/* Sequence chip — panel accent rengiyle */}
                        <View style={{
                          width: 36, height: 36, borderRadius: 12,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: isActive ? tint(accentColor, 0.14) : '#FFFFFF',
                          borderWidth: 1, borderColor: isActive ? tint(accentColor, 0.28) : 'rgba(0,0,0,0.08)',
                        }}>
                          {isActive ? (
                            <Text style={{ fontSize: 13, fontWeight: '700', color: accentColor, fontFamily: DisplayFont }}>
                              {seqNum}
                            </Text>
                          ) : (
                            <SkipForward size={13} color={INK[400]} strokeWidth={1.8} />
                          )}
                        </View>

                        {/* Name + badges */}
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {/* Tiny station-color dot — istasyonu tanıyan görsel ipucu */}
                          <View style={{
                            width: 8, height: 8, borderRadius: 4,
                            backgroundColor: st.color,
                            opacity: isActive ? 1 : 0.4,
                          }} />
                          <Text style={{
                            fontSize: 14, fontWeight: '600',
                            color: isActive ? INK[900] : INK[500],
                          }} numberOfLines={1}>
                            {st.name}
                          </Text>
                          {st.is_critical && (
                            <View style={{
                              flexDirection: 'row', alignItems: 'center', gap: 3,
                              paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9999,
                              backgroundColor: 'rgba(217,119,6,0.12)',
                              borderWidth: 1, borderColor: 'rgba(217,119,6,0.20)',
                            }}>
                              <AlertTriangle size={9} color="#92400E" strokeWidth={2} />
                              <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#92400E', letterSpacing: 0.4 }}>
                                KRİTİK
                              </Text>
                            </View>
                          )}
                          {isFirstActive && (
                            <View style={{
                              paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9999,
                              backgroundColor: tint(accentColor, 0.14),
                              borderWidth: 1, borderColor: tint(accentColor, 0.22),
                            }}>
                              <Text style={{ fontSize: 9.5, fontWeight: '700', color: accentColor, letterSpacing: 0.4 }}>
                                İLK AŞAMA
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Aktif/Atla segmented control */}
                        <View style={{
                          flexDirection: 'row',
                          backgroundColor: '#FFFFFF',
                          borderRadius: 9999,
                          borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                          padding: 3,
                        }}>
                          <Pressable
                            onPress={() => updateStage(st.id, { decision: 'aktif', skippedReason: '' })}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999,
                              backgroundColor: isActive ? accentColor : 'transparent',
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                            }}
                          >
                            <Text style={{
                              fontSize: 11, fontWeight: '600',
                              color: isActive ? '#FFF' : INK[500],
                            }}>
                              Aktif
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => updateStage(st.id, { decision: 'skipped', skippedReason: state.skippedReason || 'Bu siparişte gerekli değil' })}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 5, borderRadius: 9999,
                              backgroundColor: !isActive ? INK[700] : 'transparent',
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                            }}
                          >
                            <Text style={{
                              fontSize: 11, fontWeight: '600',
                              color: !isActive ? '#FFF' : INK[500],
                            }}>
                              Atla
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {/* Skipped reason input */}
                      {!isActive && (
                        <View style={{
                          paddingHorizontal: 14, paddingBottom: 12, paddingTop: 12,
                          borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
                        }}>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: INK[400], letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                            Atlama sebebi <Text style={{ color: '#9C2E2E' }}>*</Text>
                          </Text>
                          <TextInput
                            value={state.skippedReason}
                            onChangeText={(t) => updateStage(st.id, { skippedReason: t })}
                            placeholder="örn. Bu sipariş tipinde bu aşama gerekmez"
                            placeholderTextColor={INK[400]}
                            style={{
                              backgroundColor: '#FFFFFF',
                              borderRadius: 10,
                              borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                              paddingHorizontal: 12, height: 38,
                              fontSize: 13, color: INK[900],
                              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                            }}
                          />
                        </View>
                      )}

                      {/* Aşamaya teknisyen seçici — tüm aktif stage'ler için */}
                      {state.decision === 'aktif' && (
                        <View style={{
                          paddingHorizontal: 14, paddingBottom: 12,
                          borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
                          paddingTop: 12,
                        }}>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: INK[400], letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
                            Teknisyen ata <Text style={{ color: INK[300] }}>(boşsa otomatik atanır)</Text>
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                            <Pressable
                              onPress={() => updateStage(st.id, { technicianId: null })}
                              style={{
                                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                                backgroundColor: state.technicianId === null ? INK[900] : '#FFFFFF',
                                borderWidth: 1,
                                borderColor: state.technicianId === null ? INK[900] : 'rgba(0,0,0,0.10)',
                                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                              }}
                            >
                              <Text style={{
                                fontSize: 11,
                                fontWeight: state.technicianId === null ? '600' : '500',
                                color: state.technicianId === null ? '#FFF' : INK[500],
                              }}>
                                Otomatik
                              </Text>
                            </Pressable>
                            {technicians.map(tech => {
                              const active = state.technicianId === tech.id;
                              return (
                                <Pressable
                                  key={tech.id}
                                  onPress={() => updateStage(st.id, { technicianId: tech.id })}
                                  style={{
                                    flexDirection: 'row', alignItems: 'center', gap: 5,
                                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                                    backgroundColor: active ? accentColor : '#FFFFFF',
                                    borderWidth: 1,
                                    borderColor: active ? accentColor : 'rgba(0,0,0,0.10)',
                                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                                  }}
                                >
                                  <UserCheck size={11} color={active ? '#FFF' : INK[500]} strokeWidth={1.8} />
                                  <Text style={{
                                    fontSize: 11,
                                    fontWeight: active ? '600' : '500',
                                    color: active ? '#FFF' : INK[700],
                                  }}>
                                    {tech.full_name}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Error banner */}
              {error ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  padding: 12, marginTop: 14,
                  backgroundColor: 'rgba(156,46,46,0.06)',
                  borderRadius: 12,
                  borderWidth: 1, borderColor: 'rgba(156,46,46,0.18)',
                }}>
                  <AlertCircle size={14} color="#9C2E2E" strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>{error}</Text>
                </View>
              ) : null}
            </ScrollView>
          )}

          {/* ═════ FOOTER (cream Patterns §13) ═════ */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
            backgroundColor: CREAM,
          }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={12} color={INK[400]} strokeWidth={1.8} />
              <Text style={{ flex: 1, fontSize: 11, color: INK[500], fontStyle: 'italic' }}>
                {step === 1
                  ? 'Önce siparişi inceleyin, ardından planlamaya geçin.'
                  : 'Planlama bir kez yapılır — kayıttan sonra aşamalar değiştirilemez.'}
              </Text>
            </View>
            {step === 2 && (
              <Pressable
                onPress={() => setStep(1)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <ArrowLeft size={13} color={INK[700]} strokeWidth={1.8} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: INK[700] }}>Geri</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: INK[700] }}>Sonra</Text>
            </Pressable>
            {step === 1 ? (
              <Pressable
                onPress={() => setStep(2)}
                disabled={loading}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                  backgroundColor: accentColor,
                  opacity: loading ? 0.45 : 1,
                  ...(Platform.OS === 'web' ? {
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: !loading ? `0 8px 24px ${tint(accentColor, 0.45)}` : 'none',
                  } as any : {}),
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>
                  Planlamaya geç
                </Text>
                <ArrowRight size={14} color="#FFF" strokeWidth={2.2} />
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSave}
                disabled={!canSave}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 22, paddingVertical: 11, borderRadius: 9999,
                  backgroundColor: accentColor,
                  opacity: canSave ? 1 : 0.45,
                  ...(Platform.OS === 'web' ? {
                    cursor: saving ? 'wait' : canSave ? 'pointer' : 'not-allowed',
                    boxShadow: canSave ? `0 8px 24px ${tint(accentColor, 0.45)}` : 'none',
                  } as any : {}),
                }}
              >
                <Check size={14} color="#FFF" strokeWidth={2.4} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF', letterSpacing: 0.2 }}>
                  {saving ? 'Kaydediliyor…' : 'Planlamayı tamamla & başlat'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* 3D Viewer — STL/PLY/OBJ önizleme için lazy chunk */}
      {viewer3DFile && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModal
            visible={!!viewer3DFile}
            files={[viewer3DFile]}
            title={viewer3DFile.name}
            onClose={() => setViewer3DFile(null)}
          />
        </React.Suspense>
      )}
      {/* Çoklu 3D Viewer — tüm STL/PLY/OBJ dosyaları üst üste */}
      {viewer3DFiles && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModal
            visible={!!viewer3DFiles}
            files={viewer3DFiles}
            title={`${viewer3DFiles.length} dosya birlikte`}
            onClose={() => setViewer3DFiles(null)}
          />
        </React.Suspense>
      )}

      {/* Sipariş yazışması — sorun olursa hekim/klinikle mesajlaş */}
      <Modal visible={chatOpen} transparent animationType="fade" onRequestClose={() => setChatOpen(false)}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,14,26,0.52)', ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any) : {}) }}>
          <View style={{ width: '94%', maxWidth: 720, height: '88%', maxHeight: 880, backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' }}>
            <ChatDetail
              selectedOrder={{
                work_order_id: orderId,
                order_number: orderSummary?.order_number,
                patient_name: orderSummary?.patient_name,
              }}
              accentColor={accentColor}
              currentUserId={profile?.id ?? null}
              viewerType={(profile as any)?.user_type ?? null}
              onBack={() => setChatOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </Modal>
  );
}
