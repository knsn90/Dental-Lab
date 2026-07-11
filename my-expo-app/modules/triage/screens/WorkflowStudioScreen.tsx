// modules/triage/screens/WorkflowStudioScreen.tsx
// Faz 1 — "Üretim Akışı Stüdyosu": İş Akışları modülünün görsel yeniden tasarımı.
// 4 alan: Workflow Builder · Yetkinlikler · Personel · Kurallar.
// Hedef: uzun ayar formu DEĞİL; tek-aşamaya-odaklı görsel pipeline tasarımcısı.
// Mevcut motor/şema KORUNUR — sadece UI katmanı + var olan API'ler.

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Platform, useWindowDimensions, Modal } from 'react-native';
import {
  Workflow, Cpu, Users, SlidersHorizontal, Plus, X, GripVertical, ChevronUp, ChevronDown,
  Save, Trash2, Copy, Star, AlertTriangle, Sparkles, Clock, Layers, Zap, Check, Lightbulb, ArrowRight,
  Pencil, Wrench, Brush, Box, ScanLine, Printer, Gem, Cog,
} from 'lucide-react-native';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DS } from '../../../core/theme/dsTokens';
import { useAuthStore } from '../../../core/store/authStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { fetchStationSkillsMap, toggleUserStationSkill } from '../../../core/api/stationSkills';
import { useLocalSearchParams } from 'expo-router';
import {
  fetchStudioData, fetchSkillsData, createTemplate, updateTemplate, deleteTemplate,
  updateStationSkills, updateStationTiming, updateTechSkills, fetchAutoTriage, setAutoTriage, fmtDuration,
  fetchLabSkills, createLabSkill, updateLabSkill, deleteLabSkill, aiBuildWorkflow,
  generateTemplatesFromServices,
  type StudioTemplate, type TriageStation, type TriageTech, type LabSkill, type AiWorkflowResult,
} from '../api';
import { toast } from '../../../core/ui/Toast';

// Yetkinlik ikon paleti (lucide)
const SKILL_ICONS: Record<string, any> = { cpu: Cpu, layers: Layers, wrench: Wrench, brush: Brush, box: Box, scan: ScanLine, printer: Printer, gem: Gem, cog: Cog, zap: Zap };
const SKILL_ICON_KEYS = Object.keys(SKILL_ICONS);
const SKILL_COLORS = ['#6BA888', '#3B82F6', '#8B5CB8', '#EA7A4C', '#2BA39B', '#E89B2A', '#D94B4B', '#0891B2'];
const CERT_LEVELS: { key: string | null; label: string }[] = [{ key: null, label: 'Yok' }, { key: 'temel', label: 'Temel' }, { key: 'orta', label: 'Orta' }, { key: 'uzman', label: 'Uzman' }];
function SkillIcon({ name, ...p }: { name: string | null; size: number; color: string; strokeWidth?: number }) {
  const C = (name && SKILL_ICONS[name]) || Cpu; return <C {...p} />;
}

const INK = DS.ink;
const DISPLAY = Platform.select({ web: 'Inter Tight, Inter, sans-serif', default: 'InterTight_300Light' }) as string;
export const PANEL_BGPAGE: Record<string, string> = { lab: '#F5F1EB', clinic: '#F9FAFB', exec: '#F7F9FC', tech: '#F5F9FD' };
const DEFAULT_SKILLS = [
  'CAD Tasarım', 'CAM / Frezeleme', 'Metal Döküm', 'Seramik / Porselen', 'Zirkonyum',
  'Model / Day Hazırlama', 'Akrilik / Kaide', 'Total Protez', 'İskelet (Bölümlü) Döküm',
  'Lehim', 'Renk / Boyama', 'Bitirme / Polisaj', 'Ortodonti Apareyleri', '3D Baskı',
];
function tint(hex: string, a: number) {
  try { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; } catch { return hex; }
}
// Primary butonların üstündeki metin rengi: çok açık zemin (saffron) → koyu; orta/koyu (mercan/turuncu/mavi) → beyaz.
export function onPrimaryText(hex: string, darkInk: string) {
  try {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 175 ? darkInk : '#FFFFFF';
  } catch { return '#FFFFFF'; }
}

// Hazır iş akışı presetleri — aşama adları lab'ın mevcut istasyonlarıyla eşleştirilir.
const WORKFLOW_PRESETS: { name: string; caseTypes: string; desc: string; stages: string[] }[] = [
  { name: 'Temel Zirkonya Laboratuvarı', caseTypes: 'zirkonyum, kron, köprü', desc: 'Tarama→CAD→CAM→Sinterleme→Bitirme', stages: ['Tarama', 'CAD', 'CAM', 'Frezeleme', 'Sinterleme', 'Boyama', 'Bitirme', 'Kalite', 'Paketleme'] },
  { name: 'Dijital Laboratuvar', caseTypes: 'dijital', desc: 'Tam dijital üretim hattı', stages: ['Tarama', 'CAD', 'CAM', '3D Baskı', 'Frezeleme', 'Kalite', 'Paketleme'] },
  { name: 'Tam Servis Dental Laboratuvar', caseTypes: '', desc: 'Sabit + hareketli + döküm', stages: ['Tarama', 'Model', 'CAD', 'CAM', 'Frezeleme', 'Sinterleme', 'Döküm', 'Porselen', 'Akrilik', 'Bitirme', 'Kalite', 'Paketleme'] },
  { name: 'İmplant Merkezi', caseTypes: 'implant', desc: 'İmplant üstü protez akışı', stages: ['Tarama', 'İmplant', 'CAD', 'CAM', 'Frezeleme', 'Sinterleme', 'Porselen', 'Kalite', 'Paketleme'] },
  { name: 'Ortodonti Laboratuvarı', caseTypes: 'ortodonti', desc: 'Apareyler + plak', stages: ['Tarama', 'Model', 'CAD', '3D Baskı', 'Aparey', 'Bitirme', 'Kalite', 'Paketleme'] },
  { name: 'Yüksek Hacimli Laboratuvar', caseTypes: '', desc: 'Yüksek hacim seramik hattı', stages: ['Tarama', 'CAD', 'CAM', 'Frezeleme', 'Sinterleme', 'Porselen', 'Glazür', 'Kalite', 'Paketleme', 'Teslim'] },
];
// Aşama adını lab istasyonlarıyla eşleştir (tr-lower, içerir). Eşleşen station_id'leri sırayla döndürür.
function matchPresetStations(stages: string[], stations: TriageStation[]): { ids: string[]; matched: number } {
  const low = (s: string) => s.toLocaleLowerCase('tr-TR');
  const used = new Set<string>();
  const ids: string[] = [];
  for (const stage of stages) {
    const key = low(stage);
    const hit = stations.find(st => !used.has(st.id) && (low(st.name).includes(key) || key.includes(low(st.name))));
    if (hit) { used.add(hit.id); ids.push(hit.id); }
  }
  return { ids, matched: ids.length };
}
function isQualified(st: TriageStation, t: TriageTech) {
  if (!st.required_skills || st.required_skills.length === 0) return true;
  return st.required_skills.every(r => t.skills.includes(r));
}

type AreaKey = 'builder' | 'skills' | 'people' | 'rules';
// Yetkinlikler + Personel alanları Ekip (İK & Depo hub) bölümüne taşındı.
const AREAS: { key: AreaKey; label: string; icon: any; hint: string }[] = [
  { key: 'builder', label: 'Akış Tasarımı',    icon: Workflow,          hint: 'Üretim akışını görsel tasarla' },
  { key: 'rules',   label: 'Kurallar',         icon: SlidersHorizontal, hint: 'Süre · teslim · atama' },
];

// ── Draft (builder'da düzenlenen şablon) ────────────────────────────────────
interface Draft { id: string | null; name: string; caseTypesText: string; stationIds: string[]; isDefault: boolean; isActive: boolean; }
const EMPTY_DRAFT: Draft = { id: null, name: '', caseTypesText: '', stationIds: [], isDefault: false, isActive: true };

export function WorkflowStudioScreen() {
  const theme = usePanelTheme();
  const A = theme.primary, A_DEEP = theme.primaryDeep, PAGE = PANEL_BGPAGE[theme.key] ?? theme.bg;
  const onA = onPrimaryText(A, theme.accent);   // turuncu/mercan zeminde beyaz, açık saffron'da koyu
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? null;
  const { width } = useWindowDimensions();
  const isNarrow = width < 920;

  // Deep-link: ?area=people → doğrudan Personel sekmesi (Ekip'ten "yetki ver" yönlendirmesi)
  const routeParams = useLocalSearchParams<{ area?: string }>();
  const initialArea: AreaKey = (['builder', 'rules'] as const).includes(routeParams.area as 'builder' | 'rules')
    ? (routeParams.area as AreaKey) : 'builder';
  const [area, setArea] = useState<AreaKey>(initialArea);
  const [stations, setStations] = useState<TriageStation[]>([]);
  const [techs, setTechs] = useState<TriageTech[]>([]);
  const [allSkills, setAllSkills] = useState<string[]>([]);
  const [labSkills, setLabSkills] = useState<LabSkill[]>([]);
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [stationSkills, setStationSkills] = useState<Map<string, Set<string>>>(new Map()); // user_id → Set<station_id>
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!labId) { setLoading(false); return; }
    setLoading(true);
    const [skillsData, studio, skillsRes, stSkills] = await Promise.all([
      fetchSkillsData(labId), fetchStudioData(labId), fetchLabSkills(labId), fetchStationSkillsMap(),
    ]);
    setStations(skillsData.stations);
    setTechs(skillsData.technicians);
    setAllSkills(skillsData.allSkills);
    setLabSkills(((skillsRes as any).data ?? []) as LabSkill[]);
    setTemplates(studio.templates);
    setStationSkills(stSkills);
    setLoading(false);
  }, [labId]);

  // Teknisyen ↔ istasyon yetkisini aç/kapat (user_station_skills) — optimistic.
  const onToggleStation = useCallback(async (techId: string, stationId: string, currentlyHas: boolean) => {
    setStationSkills(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(techId) ?? []);
      if (currentlyHas) set.delete(stationId); else set.add(stationId);
      next.set(techId, set);
      return next;
    });
    const r = await toggleUserStationSkill(techId, stationId, currentlyHas, labId);
    if (!r.ok) { /* hata → geri al */ load(); }
  }, [labId, load]);
  useEffect(() => { load(); }, [load]);

  const stationById = useMemo(() => new Map(stations.map(s => [s.id, s])), [stations]);
  // Öneri kataloğu: yönetilen lab_skills + halihazırda kullanılanlar + (lab_skills boşsa) gömülü varsayılanlar.
  const skillCatalog = useMemo(() => {
    const managed = labSkills.map(s => s.name);
    const base = managed.length ? [] : DEFAULT_SKILLS;
    return Array.from(new Set([...managed, ...allSkills, ...base]));
  }, [labSkills, allSkills]);

  // Mutators (station/tech düzenleme → optimistic + persist)
  const patchStation = (id: string, p: Partial<TriageStation>) =>
    setStations(prev => prev.map(s => s.id === id ? { ...s, ...p } : s));
  const onStationSkills = async (st: TriageStation, skills: string[]) => { patchStation(st.id, { required_skills: skills }); await updateStationSkills(st.id, skills); };
  const onStationTiming = async (st: TriageStation, dur: number | null, sla: number | null) => { patchStation(st.id, { est_duration_min: dur, sla_hours: sla }); await updateStationTiming(st.id, dur, sla); };
  const onTechSkills = async (t: TriageTech, skills: string[]) => { setTechs(prev => prev.map(x => x.id === t.id ? { ...x, skills } : x)); await updateTechSkills(t.id, skills, t.capacity); };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: PAGE, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={A} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: PAGE }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 62, paddingBottom: 90, width: '100%' }}>
      {/* ── Hero ── */}
      <View style={{ borderRadius: 22, padding: 20, overflow: 'hidden', backgroundColor: A, marginBottom: 16,
        // @ts-ignore web gradient
        backgroundImage: `linear-gradient(135deg, ${A} 0%, ${A_DEEP} 100%)` }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: -50, right: -40, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.12)' }} />
        <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>Üretim Akışı Stüdyosu</Text>
        <Text style={{ ...({ fontFamily: DISPLAY } as any), fontSize: 28, color: '#FFFFFF', letterSpacing: -0.8, marginTop: 3 }}>İş Akışı Tasarımcısı</Text>
        <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.82)', marginTop: 4 }}>Laboratuvarının üretim hattını tasarla — form doldurmuyorsun, süreç kuruyorsun.</Text>
      </View>

      {/* ── 4 alan navigasyonu ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {AREAS.map(a => {
          const active = area === a.key;
          const Icon = a.icon;
          return (
            <Pressable key={a.key} onPress={() => setArea(a.key)}
              style={{ flexGrow: 1, flexBasis: isNarrow ? '45%' : 0, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14,
                backgroundColor: active ? A : '#FFFFFF', borderWidth: 1, borderColor: active ? A : 'rgba(0,0,0,0.08)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? 'rgba(255,255,255,0.22)' : tint(A, 0.10) }}>
                <Icon size={16} color={active ? '#FFFFFF' : A_DEEP} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#FFFFFF' : INK[900] }} numberOfLines={1}>{a.label}</Text>
                <Text style={{ fontSize: 10.5, color: active ? 'rgba(255,255,255,0.8)' : INK[400] }} numberOfLines={1}>{a.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {area === 'builder' && (
        <BuilderArea
          theme={{ A, A_DEEP, onA, PAGE }} isNarrow={isNarrow}
          stations={stations} techs={techs} templates={templates} stationById={stationById}
          skillNames={skillCatalog} labId={labId} onReload={load}
        />
      )}
      {area === 'rules' && (
        <RulesArea theme={{ A, A_DEEP, onA, PAGE }} labId={labId} stations={stations} techs={techs} skillCatalog={skillCatalog}
          onStationSkills={onStationSkills} onStationTiming={onStationTiming} />
      )}
    </ScrollView>
  );
}

export type Theme = { A: string; A_DEEP: string; onA: string; PAGE: string };

// ════════════════════════════════════════════════════════════════════════════
// AREA 1 — Workflow Builder (görsel pipeline + tek-aşama odak)
// ════════════════════════════════════════════════════════════════════════════
function BuilderArea({ theme, isNarrow, stations, techs, templates, stationById, skillNames, labId, onReload }: {
  theme: Theme; isNarrow: boolean; stations: TriageStation[]; techs: TriageTech[];
  templates: StudioTemplate[]; stationById: Map<string, TriageStation>;
  skillNames: string[]; labId: string | null; onReload: () => void;
}) {
  const { A, A_DEEP, onA, PAGE } = theme;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [selStage, setSelStage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  // AI önerisini uygula: yeni yetkinlikleri oluştur + aşamaları mevcut istasyonlarla eşleştirip builder'a yükle
  const applyAi = async (r: AiWorkflowResult) => {
    if (labId) {
      const existing = new Set(skillNames.map(s => s.toLocaleLowerCase('tr-TR')));
      for (const sk of (r.skills ?? [])) {
        if (sk?.name && !existing.has(sk.name.toLocaleLowerCase('tr-TR'))) {
          await createLabSkill(labId, { name: sk.name, description: sk.description ?? null, color: sk.color ?? null, icon: sk.icon ?? null, cert_level: sk.cert_level ?? null });
        }
      }
    }
    const stageNames = (r.stages ?? []).map(s => s.name);
    const { ids, matched } = matchPresetStations(stageNames, stations);
    setAiOpen(false);
    setPresetNote(`Yapay zeka önerisi: ${matched}/${stageNames.length} aşama mevcut istasyonlarınla eşleşti${r.summary ? ' — ' + r.summary : ''}. Yetkinlikler kataloğa eklendi.`);
    setDraft({ id: null, name: 'Yapay Zeka Önerisi', caseTypesText: '', stationIds: ids, isDefault: false, isActive: true });
    setSelStage(null);
    onReload();
  };

  const openNew = () => { setDraft({ ...EMPTY_DRAFT }); setSelStage(null); setPresetNote(null); };
  const openEdit = (t: StudioTemplate) => { setDraft({ id: t.id, name: t.name, caseTypesText: t.case_types.join(', '), stationIds: [...t.station_ids], isDefault: t.is_default, isActive: t.is_active }); setSelStage(null); setPresetNote(null); };
  const openClone = (t: StudioTemplate) => { setDraft({ id: null, name: `${t.name} (kopya)`, caseTypesText: t.case_types.join(', '), stationIds: [...t.station_ids], isDefault: false, isActive: true }); setSelStage(null); };
  const applyPreset = (p: typeof WORKFLOW_PRESETS[number]) => {
    const { ids, matched } = matchPresetStations(p.stages, stations);
    setPresetNote(matched < p.stages.length ? `${p.name}: ${matched}/${p.stages.length} aşama mevcut istasyonlarınla eşleşti. Kalanları "Aşama ekle"den tamamlayabilirsin.` : null);
    setDraft({ id: null, name: p.name, caseTypesText: p.caseTypes, stationIds: ids, isDefault: false, isActive: true });
    setSelStage(null);
  };

  const patch = (p: Partial<Draft>) => setDraft(d => d ? { ...d, ...p } : d);
  const addStage = (id: string) => patch({ stationIds: [...(draft?.stationIds ?? []), id] });
  const removeStage = (idx: number) => { patch({ stationIds: (draft?.stationIds ?? []).filter((_, i) => i !== idx) }); setSelStage(null); };
  const move = (idx: number, dir: -1 | 1) => { const arr = [...(draft!.stationIds)]; const j = idx + dir; if (j < 0 || j >= arr.length) return; [arr[idx], arr[j]] = [arr[j], arr[idx]]; patch({ stationIds: arr }); };
  const reorder = (from: number, to: number) => { const arr = [...(draft!.stationIds)]; if (from < 0 || to < 0 || from >= arr.length || to >= arr.length || from === to) return; const [m] = arr.splice(from, 1); arr.splice(to, 0, m); patch({ stationIds: arr }); };

  const save = async () => {
    if (!draft || !labId) return;
    setError('');
    if (!draft.name.trim()) { setError('Şablon adı gerekli'); return; }
    if (draft.stationIds.length === 0) { setError('En az 1 aşama ekle'); return; }
    setSaving(true);
    const payload = { name: draft.name.trim(), case_types: draft.caseTypesText.split(',').map(s => s.trim()).filter(Boolean), station_ids: draft.stationIds, is_default: draft.isDefault, is_active: draft.isActive };
    const res = draft.id ? await updateTemplate(draft.id, payload) : await createTemplate(labId, payload);
    setSaving(false);
    if ((res as any)?.error) { setError((res as any).error.message ?? 'Kayıt hatası'); return; }
    setDraft(null); onReload();
  };
  const remove = async () => {
    if (!draft?.id) { setDraft(null); return; }
    setSaving(true);
    const res: any = await deleteTemplate(draft.id);
    setSaving(false);
    if (res?.error) { setError(res.error.message ?? 'Silinemedi'); return; }
    toast.success('İş akışı silindi.');
    setDraft(null); onReload();
  };

  // Kart üzerinden doğrudan sil (onaylı) — Düzenle'ye girmeye gerek yok.
  const removeCard = async (t: StudioTemplate) => {
    const ok = Platform.OS === 'web' ? window.confirm(`"${t.name}" iş akışını silmek istediğine emin misin?`) : true;
    if (!ok) return;
    const res: any = await deleteTemplate(t.id);
    if (res?.error) { toast.error(res.error.message ?? 'Silinemedi'); return; }
    toast.success('İş akışı silindi.');
    onReload();
  };

  // Fiyat listesindeki her hizmet için (akışı yoksa) otomatik üretim akışı oluştur.
  const [generating, setGenerating] = useState(false);
  const genFromServices = async () => {
    if (!labId || generating) return;
    setGenerating(true);
    try {
      const res = await generateTemplatesFromServices(labId);
      if (res.noStations) toast.error('Önce istasyon tanımlamalısın (istasyon havuzu boş).');
      else if (res.created === 0) toast.success(res.skipped > 0 ? 'Tüm hizmetlerin akışı zaten var.' : 'Üretilecek hizmet bulunamadı.');
      else toast.success(`${res.created} iş akışı üretildi${res.skipped ? ` · ${res.skipped} atlandı` : ''}.`);
      onReload();
    } catch (e: any) {
      toast.error(e?.message ?? 'İş akışı üretilemedi');
    } finally {
      setGenerating(false);
    }
  };

  const poolStations = stations.filter(s => !(draft?.stationIds ?? []).includes(s.id));
  const selStation = selStage ? stationById.get(selStage) ?? null : null;
  const insights = useMemo(() => computeInsights(draft, stationById, techs), [draft, stationById, techs]);

  // ── Şablon galerisi (draft yokken) ──
  if (!draft) {
    return (
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: INK[900], flex: 1 }}>İş Akışları</Text>
          <Pressable onPress={genFromServices} disabled={generating}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: tint(A, 0.12), borderWidth: 1, borderColor: tint(A, 0.3), opacity: generating ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <Layers size={14} color={A_DEEP} strokeWidth={2} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: A_DEEP }}>{generating ? 'Üretiliyor…' : 'Fiyat listesinden üret'}</Text>
          </Pressable>
          <Pressable onPress={() => setAiOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: tint(A, 0.12), borderWidth: 1, borderColor: tint(A, 0.3), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <Sparkles size={14} color={A_DEEP} strokeWidth={2} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: A_DEEP }}>Yapay Zeka ile Kur</Text>
          </Pressable>
          <Pressable onPress={openNew} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: A, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <Plus size={15} color={onA} strokeWidth={2.2} /><Text style={{ fontSize: 13, fontWeight: '800', color: onA }}>Yeni Akış</Text>
          </Pressable>
        </View>

        {/* Hazır şablonlar */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: INK[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>Hazır Şablonlar — başlangıç için tıkla</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
            {WORKFLOW_PRESETS.map(p => (
              <Pressable key={p.name} onPress={() => applyPreset(p)} style={{ width: 200, padding: 13, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', gap: 7, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.12) }}><Workflow size={16} color={A_DEEP} strokeWidth={2} /></View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK[900] }}>{p.name}</Text>
                <Text style={{ fontSize: 10.5, color: INK[500] }} numberOfLines={2}>{p.desc}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Layers size={10} color={INK[400]} strokeWidth={2} /><Text style={{ fontSize: 10, color: INK[400] }}>{p.stages.length} aşama</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {templates.length === 0 ? (
          <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 36, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.12) }}><Workflow size={24} color={A_DEEP} strokeWidth={1.8} /></View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: INK[900] }}>Henüz iş akışı yok</Text>
            <Text style={{ fontSize: 13, color: INK[500], textAlign: 'center', maxWidth: 380 }}>İlk üretim akışını tasarla — aşamaları sürükleyerek diz, her aşamanın süre/yetkinlik kuralını belirle.</Text>
            <Pressable onPress={openNew} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, backgroundColor: A, marginTop: 4 }}>
              <Plus size={15} color={onA} strokeWidth={2.2} /><Text style={{ fontSize: 13.5, fontWeight: '800', color: onA }}>İlk Akışı Tasarla</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {templates.map(t => (
              <View key={t.id} style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: INK[900] }}>{t.name}</Text>
                  {t.is_default && <Badge color={A_DEEP} bg={tint(A, 0.16)} icon={<Star size={9} color={A_DEEP} strokeWidth={2} />} label="VARSAYILAN" />}
                  {!t.is_active && <Badge color={INK[500]} bg="rgba(0,0,0,0.06)" label="PASİF" />}
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontSize: 11, color: INK[400] }}>{t.station_ids.length} aşama</Text>
                </View>
                {/* mini pipeline önizleme */}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                  {t.station_ids.map((sid, i) => { const st = stationById.get(sid); if (!st) return null; return (
                    <View key={sid + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {i > 0 && <ArrowRight size={11} color={INK[300]} strokeWidth={2} />}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tint(st.color, 0.10) }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.color }} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: INK[700] }}>{st.name}</Text>
                      </View>
                    </View>
                  ); })}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => openEdit(t)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, backgroundColor: A, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <SlidersHorizontal size={13} color={onA} strokeWidth={2} /><Text style={{ fontSize: 12, fontWeight: '700', color: onA }}>Düzenle</Text>
                  </Pressable>
                  <Pressable onPress={() => openClone(t)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Copy size={13} color={INK[500]} strokeWidth={2} /><Text style={{ fontSize: 12, fontWeight: '700', color: INK[500] }}>Klonla</Text>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => removeCard(t)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, backgroundColor: tint('#D94B4B', 0.10), borderWidth: 1, borderColor: tint('#D94B4B', 0.25), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Trash2 size={13} color="#9C2E2E" strokeWidth={2} /><Text style={{ fontSize: 12, fontWeight: '700', color: '#9C2E2E' }}>Sil</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
        <AiBuilderModal visible={aiOpen} theme={theme} stations={stations} skillNames={skillNames} onClose={() => setAiOpen(false)} onApply={applyAi} />
      </View>
    );
  }

  // ── Builder (sol pipeline · sağ aşama detayı) ──
  const Pipeline = (
    <View style={{ flex: isNarrow ? undefined : 1.1, gap: 12 }}>
      {presetNote && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 11, borderRadius: 12, backgroundColor: tint(A, 0.08), borderWidth: 1, borderColor: tint(A, 0.2) }}>
          <Sparkles size={14} color={A_DEEP} strokeWidth={2} style={{ marginTop: 1 } as any} />
          <Text style={{ fontSize: 11.5, color: A_DEEP, fontWeight: '600', flex: 1, lineHeight: 16 }}>{presetNote}</Text>
          <Pressable onPress={() => setPresetNote(null)}><X size={13} color={A_DEEP} strokeWidth={2} /></Pressable>
        </View>
      )}
      <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', padding: 14, gap: 10 }}>
        <TextInput value={draft.name} onChangeText={t => patch({ name: t })} placeholder="Akış adı (ör. Zirkonyum Köprü)" placeholderTextColor={INK[400]}
          style={{ fontSize: 15, fontWeight: '700', color: INK[900], backgroundColor: PAGE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any} />
        <TextInput value={draft.caseTypesText} onChangeText={t => patch({ caseTypesText: t })} placeholder="Vaka tipleri (virgülle) — eşleşince otomatik uygulanır" placeholderTextColor={INK[400]}
          style={{ fontSize: 12.5, color: INK[800], backgroundColor: PAGE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any} />
      </View>

      {/* pipeline */}
      <View style={{ gap: 0 }}>
        {draft.stationIds.length === 0 && (
          <Text style={{ fontSize: 12, color: INK[400], fontStyle: 'italic', paddingVertical: 8 }}>Aşama yok — aşağıdan ekle.</Text>
        )}
        {draft.stationIds.map((sid, i) => {
          const st = stationById.get(sid); if (!st) return null;
          const last = i === draft.stationIds.length - 1;
          const selected = selStage === sid;
          const isWeb = Platform.OS === 'web';
          const row = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 13,
              backgroundColor: selected ? tint(A, 0.10) : '#FFFFFF',
              borderWidth: 1.5, borderColor: overIdx === i && dragIdx !== null && dragIdx !== i ? A : selected ? tint(A, 0.5) : 'rgba(0,0,0,0.07)',
              opacity: dragIdx === i ? 0.4 : 1 }}>
              {isWeb ? React.createElement('div', {
                draggable: true,
                onDragStart: (e: any) => { try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch {} setDragIdx(i); },
                onDragEnd: () => { setDragIdx(null); setOverIdx(null); },
                style: { cursor: 'grab', display: 'flex', alignItems: 'center' },
              }, <GripVertical size={16} color={INK[400]} strokeWidth={2} />)
              : (
                <View style={{ alignItems: 'center' }}>
                  <Pressable onPress={() => move(i, -1)} disabled={i === 0} style={{ opacity: i === 0 ? 0.25 : 1 }}><ChevronUp size={14} color={INK[400]} strokeWidth={2} /></Pressable>
                  <Pressable onPress={() => move(i, 1)} disabled={last} style={{ opacity: last ? 0.25 : 1 }}><ChevronDown size={14} color={INK[400]} strokeWidth={2} /></Pressable>
                </View>
              )}
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(st.color, 0.16) }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: st.color, fontFamily: DISPLAY }}>{i + 1}</Text>
              </View>
              <Pressable onPress={() => setSelStage(selected ? null : sid)} style={{ flex: 1, ...(isWeb ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK[900] }}>{st.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 10.5, color: INK[400] }}>{st.est_duration_min ? fmtDuration(st.est_duration_min) : 'süre yok'}</Text>
                  {st.required_skills.length > 0 && <Text style={{ fontSize: 10.5, color: A_DEEP, fontWeight: '600' }}>{st.required_skills.length} yetkinlik</Text>}
                  {st.is_critical && <Text style={{ fontSize: 10, fontWeight: '800', color: '#9C2E2E' }}>KRİTİK</Text>}
                </View>
              </Pressable>
              <Pressable onPress={() => removeStage(i)} style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}><X size={13} color={INK[400]} strokeWidth={2} /></Pressable>
            </View>
          );
          return (
            <View key={sid + i}>
              {isWeb ? React.createElement('div', {
                onDragOver: (e: any) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); },
                onDrop: (e: any) => { e.preventDefault(); if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null); setOverIdx(null); },
              }, row) : row}
              {!last && <View style={{ alignItems: 'center', paddingVertical: 2 }}><View style={{ width: 2, height: 12, backgroundColor: tint(A, 0.3) }} /></View>}
            </View>
          );
        })}
      </View>

      {/* aşama ekle */}
      {poolStations.length > 0 && (
        <View style={{ gap: 6, marginTop: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>Aşama ekle</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {poolStations.map(st => (
              <Pressable key={st.id} onPress={() => addStage(st.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Plus size={12} color={INK[500]} strokeWidth={2} /><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: st.color }} /><Text style={{ fontSize: 12, fontWeight: '600', color: INK[700] }}>{st.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {error ? <View style={{ padding: 10, borderRadius: 10, backgroundColor: tint('#D94B4B', 0.08), borderWidth: 1, borderColor: tint('#D94B4B', 0.2) }}><Text style={{ fontSize: 12, color: '#9C2E2E', fontWeight: '600' }}>{error}</Text></View> : null}

      {/* default + aksiyonlar */}
      <Pressable onPress={() => patch({ isDefault: !draft.isDefault })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: draft.isDefault ? A : '#FFFFFF', borderWidth: 1, borderColor: draft.isDefault ? A : 'rgba(0,0,0,0.15)' }}>{draft.isDefault && <Check size={13} color={onA} strokeWidth={3} />}</View>
        <Text style={{ fontSize: 12.5, color: INK[800], fontWeight: '600' }}>Varsayılan akış (eşleşme yoksa bu kullanılır)</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
        {draft.id && <Pressable onPress={remove} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, backgroundColor: tint('#D94B4B', 0.10), borderWidth: 1, borderColor: tint('#D94B4B', 0.25) }}><Trash2 size={14} color="#9C2E2E" strokeWidth={2} /><Text style={{ fontSize: 12.5, fontWeight: '700', color: '#9C2E2E' }}>Sil</Text></Pressable>}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setDraft(null)} style={{ paddingHorizontal: 15, paddingVertical: 10, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' }}><Text style={{ fontSize: 12.5, fontWeight: '700', color: INK[500] }}>Geri</Text></Pressable>
        <Pressable onPress={save} disabled={saving} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 11, backgroundColor: A, opacity: saving ? 0.5 : 1 }}><Save size={15} color={onA} strokeWidth={2.1} /><Text style={{ fontSize: 13, fontWeight: '800', color: onA }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text></Pressable>
      </View>
    </View>
  );

  const SidePanel = (
    <View style={{ flex: isNarrow ? undefined : 1, gap: 12 }}>
      {selStation ? (
        <StageDetailPanel theme={theme} st={selStation} techs={techs} idx={draft.stationIds.indexOf(selStation.id)} total={draft.stationIds.length} stationById={stationById} draftStationIds={draft.stationIds} />
      ) : (
        <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', padding: 16, alignItems: 'center', gap: 8 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.10) }}><Layers size={20} color={A_DEEP} strokeWidth={1.8} /></View>
          <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK[900] }}>Bir aşama seç</Text>
          <Text style={{ fontSize: 12, color: INK[500], textAlign: 'center' }}>Soldaki akıştan bir aşamaya dokun — süresi, yetkinlikleri ve uygun teknisyenleri burada görünür.</Text>
        </View>
      )}
      <InsightsPanel theme={theme} insights={insights} />
    </View>
  );

  return (
    <View style={{ flexDirection: isNarrow ? 'column' : 'row', gap: 14, alignItems: 'flex-start' }}>
      {Pipeline}
      {SidePanel}
    </View>
  );
}

// ── Stage Detail Panel ──
function StageDetailPanel({ theme, st, techs, idx, total, stationById, draftStationIds }: {
  theme: Theme; st: TriageStation; techs: TriageTech[]; idx: number; total: number;
  stationById: Map<string, TriageStation>; draftStationIds: string[];
}) {
  const { A, A_DEEP } = theme;
  const eligible = techs.filter(t => isQualified(st, t));
  const prev = idx > 0 ? stationById.get(draftStationIds[idx - 1]) : null;
  const next = idx >= 0 && idx < total - 1 ? stationById.get(draftStationIds[idx + 1]) : null;
  return (
    <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: tint(A, 0.35), padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: st.color }} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: INK[900], flex: 1 }}>{st.name}</Text>
        {st.is_critical && <Badge color="#9C2E2E" bg={tint('#D94B4B', 0.12)} icon={<AlertTriangle size={9} color="#9C2E2E" strokeWidth={2} />} label="KRİTİK" />}
      </View>

      <DetailRow icon={<Clock size={14} color={A_DEEP} strokeWidth={2} />} label="Tahmini süre"
        value={st.est_duration_min ? fmtDuration(st.est_duration_min) : '— (Kurallar sekmesinden gir)'} />
      <DetailRow icon={<Zap size={14} color={A_DEEP} strokeWidth={2} />} label="Teslim hedefi"
        value={st.sla_hours ? `${st.sla_hours} saat` : '—'} />

      <View style={{ gap: 6 }}>
        <Text style={dlabel}>Gerekli yetkinlikler</Text>
        {st.required_skills.length === 0 ? <Text style={{ fontSize: 12, color: INK[400], fontStyle: 'italic' }}>Yok — herkes uygun</Text> : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {st.required_skills.map(s => <View key={s} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: tint(A, 0.12) }}><Text style={{ fontSize: 11, fontWeight: '700', color: A_DEEP }}>{s}</Text></View>)}
          </View>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={dlabel}>Uygun teknisyenler ({eligible.length})</Text>
        {eligible.length === 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 9, borderRadius: 10, backgroundColor: tint('#D94B4B', 0.08) }}>
            <AlertTriangle size={13} color="#9C2E2E" strokeWidth={2} /><Text style={{ fontSize: 11.5, color: '#9C2E2E', fontWeight: '600' }}>Bu yetkinliğe sahip teknisyen yok!</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {eligible.slice(0, 8).map(t => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: PAGE_SOFT, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.18) }}><Text style={{ fontSize: 8.5, fontWeight: '800', color: A_DEEP }}>{initials(t.full_name)}</Text></View>
                <Text style={{ fontSize: 11.5, color: INK[700], fontWeight: '600' }}>{t.full_name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={dlabel}>Bağımlılıklar</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <DepChip label={prev ? prev.name : 'Başlangıç'} color={prev?.color ?? INK[300]} />
          <ArrowRight size={12} color={INK[300]} strokeWidth={2} />
          <DepChip label={st.name} color={st.color} strong />
          <ArrowRight size={12} color={INK[300]} strokeWidth={2} />
          <DepChip label={next ? next.name : 'Teslim'} color={next?.color ?? INK[300]} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 11, backgroundColor: tint(A, 0.06), borderWidth: 1, borderColor: tint(A, 0.16) }}>
        <Sparkles size={13} color={A_DEEP} strokeWidth={2} />
        <Text style={{ fontSize: 11, color: A_DEEP, fontWeight: '600', flex: 1 }}>Yapay zeka önerileri yakında — bu aşama için süre/atama optimizasyonu.</Text>
      </View>
    </View>
  );
}

// ── AI Workflow Builder sihirbazı ───────────────────────────────────────────
const AI_SERVICES = ['Zirkonyum', 'Metal-Seramik', 'E-max', 'İmplant Üstü', 'Hareketli Protez', 'Ortodonti', 'Geçici Kron'];
function AiBuilderModal({ visible, theme, stations, skillNames, onClose, onApply }: {
  visible: boolean; theme: Theme; stations: TriageStation[]; skillNames: string[];
  onClose: () => void; onApply: (r: AiWorkflowResult) => void | Promise<void>;
}) {
  const { A, A_DEEP, onA, PAGE } = theme;
  const [phase, setPhase] = useState<'form' | 'loading' | 'review' | 'error'>('form');
  const [services, setServices] = useState<string[]>([]);
  const [techCount, setTechCount] = useState('');
  const [monthly, setMonthly] = useState('');
  const [scanners, setScanners] = useState('');
  const [printers, setPrinters] = useState('');
  const [millers, setMillers] = useState('');
  const [ceramic, setCeramic] = useState(false);
  const [implants, setImplants] = useState(false);
  const [fullArch, setFullArch] = useState(false);
  const [result, setResult] = useState<AiWorkflowResult | null>(null);
  const [err, setErr] = useState('');
  const [applying, setApplying] = useState(false);

  const reset = () => { setPhase('form'); setResult(null); setErr(''); };
  const toggleSvc = (s: string) => setServices(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);

  const run = async () => {
    setPhase('loading'); setErr('');
    const answers = {
      hizmetler: services,
      teknisyen_sayisi: techCount || 'belirtilmedi',
      aylik_ortalama_vaka: monthly || 'belirtilmedi',
      tarayicilar: scanners || 'belirtilmedi',
      printerlar: printers || 'belirtilmedi',
      freze_makineleri: millers || 'belirtilmedi',
      seramik_kendi_bunyesinde: ceramic,
      implant_uretiyor: implants,
      full_arch_uretiyor: fullArch,
    };
    const res = await aiBuildWorkflow(answers, stations.map(s => s.name), skillNames);
    if (!res.ok || !res.data) { setErr(res.error ?? 'Yapay zeka önerisi alınamadı. Tekrar dene.'); setPhase('error'); return; }
    setResult(res.data); setPhase('review');
  };
  const apply = async () => { if (!result) return; setApplying(true); await onApply(result); setApplying(false); reset(); };

  const yesNo = (label: string, val: boolean, set: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ flex: 1, fontSize: 13, color: INK[800], fontWeight: '600' }}>{label}</Text>
      {[['Evet', true], ['Hayır', false]].map(([lbl, v]) => { const sel = val === v; return (
        <Pressable key={String(lbl)} onPress={() => set(v as boolean)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, backgroundColor: sel ? A : '#FFFFFF', borderWidth: 1, borderColor: sel ? A : 'rgba(0,0,0,0.12)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? onA : INK[500] }}>{lbl as string}</Text>
        </Pressable>
      ); })}
    </View>
  );
  const txt = (label: string, value: string, set: (v: string) => void, ph: string, numeric?: boolean) => (
    <View style={{ gap: 5 }}>
      <Text style={dlabel}>{label}</Text>
      <TextInput value={value} onChangeText={set} placeholder={ph} placeholderTextColor={INK[400]} keyboardType={numeric ? 'numeric' : 'default'}
        style={{ fontSize: 13.5, color: INK[900], backgroundColor: PAGE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) } as any} />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', maxHeight: '88%', borderRadius: 20, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
          {/* başlık */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.12) }}><Sparkles size={17} color={A_DEEP} strokeWidth={2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: INK[900] }}>Yapay Zeka ile Akış Kur</Text>
              <Text style={{ fontSize: 11.5, color: INK[500] }}>Birkaç soru → önerilen üretim akışı</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}><X size={15} color={INK[500]} strokeWidth={2} /></Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {phase === 'form' && (<>
              <View style={{ gap: 6 }}>
                <Text style={dlabel}>Hangi hizmetleri sunuyorsun?</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {AI_SERVICES.map(s => { const sel = services.includes(s); return (
                    <Pressable key={s} onPress={() => toggleSvc(s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: sel ? tint(A, 0.14) : '#FFFFFF', borderWidth: 1, borderColor: sel ? A : 'rgba(0,0,0,0.12)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                      {sel && <Check size={12} color={A_DEEP} strokeWidth={3} />}<Text style={{ fontSize: 12, fontWeight: '600', color: sel ? A_DEEP : INK[500] }}>{s}</Text>
                    </Pressable>
                  ); })}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>{txt('Teknisyen sayısı', techCount, setTechCount, 'ör. 6', true)}</View>
                <View style={{ flex: 1 }}>{txt('Aylık ortalama vaka', monthly, setMonthly, 'ör. 400', true)}</View>
              </View>
              {txt('Tarayıcılar', scanners, setScanners, 'ör. Medit i700, 3Shape')}
              {txt('3D Printerlar', printers, setPrinters, 'ör. Asiga, Formlabs')}
              {txt('Freze makineleri', millers, setMillers, 'ör. VHF, Roland')}
              <View style={{ gap: 10, marginTop: 2 }}>
                {yesNo('Seramik/porselen kendi bünyende mi?', ceramic, setCeramic)}
                {yesNo('İmplant üstü protez üretiyor musun?', implants, setImplants)}
                {yesNo('Full-arch (tam çene) üretiyor musun?', fullArch, setFullArch)}
              </View>
              <Pressable onPress={run} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 12, backgroundColor: A, marginTop: 4, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Sparkles size={16} color={onA} strokeWidth={2.2} /><Text style={{ fontSize: 14, fontWeight: '800', color: onA }}>Akış Öner</Text>
              </Pressable>
            </>)}

            {phase === 'loading' && (
              <View style={{ alignItems: 'center', gap: 12, paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={A} />
                <Text style={{ fontSize: 13, color: INK[500], fontWeight: '600' }}>Yapay zeka üretim akışını tasarlıyor…</Text>
              </View>
            )}

            {phase === 'error' && (
              <View style={{ alignItems: 'center', gap: 12, paddingVertical: 30 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: tint('#D94B4B', 0.12) }}><AlertTriangle size={22} color="#9C2E2E" strokeWidth={2} /></View>
                <Text style={{ fontSize: 13, color: '#9C2E2E', fontWeight: '600', textAlign: 'center' }}>{err}</Text>
                <Pressable onPress={reset} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 11, backgroundColor: A }}><Text style={{ fontSize: 13, fontWeight: '800', color: onA }}>Tekrar Dene</Text></Pressable>
              </View>
            )}

            {phase === 'review' && result && (<>
              {result.summary ? <View style={{ padding: 12, borderRadius: 12, backgroundColor: tint(A, 0.06), borderWidth: 1, borderColor: tint(A, 0.18) }}><Text style={{ fontSize: 12.5, color: A_DEEP, fontWeight: '600', lineHeight: 18 }}>{result.summary}</Text></View> : null}
              <View style={{ gap: 6 }}>
                <Text style={dlabel}>Önerilen akış ({result.stages?.length ?? 0} aşama)</Text>
                {(result.stages ?? []).map((s, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 11, backgroundColor: PAGE, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: A_DEEP, width: 18 }}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: INK[900] }}>{s.name}</Text>
                      <Text style={{ fontSize: 10.5, color: INK[400] }}>{s.est_duration_min ? fmtDuration(s.est_duration_min) : '—'}{s.sla_hours ? ` · hedef ${s.sla_hours}sa` : ''}{s.required_skills?.length ? ` · ${s.required_skills.join(', ')}` : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
              {(result.skills?.length ?? 0) > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={dlabel}>Önerilen yetkinlikler (kataloğa eklenir)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {result.skills.map((s, i) => <View key={i} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: tint(s.color ?? A, 0.14) }}><Text style={{ fontSize: 11, fontWeight: '700', color: s.color ?? A_DEEP }}>{s.name}</Text></View>)}
                  </View>
                </View>
              )}
              {(result.staffing?.length ?? 0) > 0 && (
                <View style={{ gap: 6 }}>
                  <Text style={dlabel}>Personel önerisi</Text>
                  {result.staffing.map((s, i) => <Text key={i} style={{ fontSize: 12, color: INK[700] }}>• {s.count}× {s.role}{s.skills?.length ? ` (${s.skills.join(', ')})` : ''}</Text>)}
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <Pressable onPress={reset} style={{ paddingHorizontal: 15, paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' }}><Text style={{ fontSize: 12.5, fontWeight: '700', color: INK[500] }}>Baştan</Text></Pressable>
                <View style={{ flex: 1 }} />
                <Pressable onPress={apply} disabled={applying} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 11, backgroundColor: A, opacity: applying ? 0.5 : 1 }}><Check size={15} color={onA} strokeWidth={2.4} /><Text style={{ fontSize: 13, fontWeight: '800', color: onA }}>{applying ? 'Uygulanıyor…' : 'Uygula & Düzenle'}</Text></Pressable>
              </View>
            </>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AREA 2 — Yetkinlikler (yönetilen katalog: ad/açıklama/renk/ikon/sertifika · CRUD)
// ════════════════════════════════════════════════════════════════════════════
type SkillDraft = { id: string | null; name: string; description: string; color: string; icon: string; cert_level: string | null };
export function SkillsArea({ theme, labId, labSkills, stations, techs, onReload }: {
  theme: Theme; labId: string | null; labSkills: LabSkill[]; stations: TriageStation[]; techs: TriageTech[]; onReload: () => void;
}) {
  const { A, A_DEEP, onA, PAGE } = theme;
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const usage = useMemo(() => {
    const m = new Map<string, { stations: number; techs: number }>();
    stations.forEach(st => st.required_skills.forEach(s => { const e = m.get(s) ?? { stations: 0, techs: 0 }; e.stations++; m.set(s, e); }));
    techs.forEach(t => t.skills.forEach(s => { const e = m.get(s) ?? { stations: 0, techs: 0 }; e.techs++; m.set(s, e); }));
    return m;
  }, [stations, techs]);

  const openNew = () => { setError(''); setDraft({ id: null, name: '', description: '', color: SKILL_COLORS[0], icon: 'cpu', cert_level: null }); };
  const openEdit = (s: LabSkill) => { setError(''); setDraft({ id: s.id, name: s.name, description: s.description ?? '', color: s.color ?? SKILL_COLORS[0], icon: s.icon ?? 'cpu', cert_level: s.cert_level }); };

  const save = async () => {
    if (!draft || !labId) return;
    if (!draft.name.trim()) { setError('Yetkinlik adı gerekli'); return; }
    setBusy(true);
    const payload = { name: draft.name.trim(), description: draft.description.trim() || null, color: draft.color, icon: draft.icon, cert_level: draft.cert_level };
    const res = draft.id ? await updateLabSkill(draft.id, payload) : await createLabSkill(labId, payload);
    setBusy(false);
    if ((res as any)?.error) { setError((res as any).error.message?.includes('duplicate') ? 'Bu isimde yetkinlik zaten var.' : (res as any).error.message ?? 'Hata'); return; }
    setDraft(null); onReload();
  };
  const del = async (id: string) => { setBusy(true); await deleteLabSkill(id); setBusy(false); setDraft(null); onReload(); };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: INK[900] }}>Yetkinlik Kataloğu</Text>
          <Text style={{ fontSize: 11.5, color: INK[500] }}>İstasyon ve teknisyen becerileri bu kataloğu kullanır.</Text>
        </View>
        {!draft && (
          <Pressable onPress={openNew} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: A, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <Plus size={15} color={onA} strokeWidth={2.2} /><Text style={{ fontSize: 13, fontWeight: '800', color: onA }}>Yeni Yetkinlik</Text>
          </Pressable>
        )}
      </View>

      {/* Editör */}
      {draft && (
        <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: tint(A, 0.35), padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900] }}>{draft.id ? 'Yetkinliği Düzenle' : 'Yeni Yetkinlik'}</Text>
          {error ? <Text style={{ fontSize: 12, color: '#9C2E2E', fontWeight: '600' }}>{error}</Text> : null}
          <View style={{ gap: 5 }}>
            <Text style={dlabel}>Ad</Text>
            <TextInput value={draft.name} onChangeText={t => setDraft(d => d ? { ...d, name: t } : d)} placeholder="ör. İmplant Tasarımı" placeholderTextColor={INK[400]}
              style={{ fontSize: 14, color: INK[900], backgroundColor: PAGE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any} />
          </View>
          <View style={{ gap: 5 }}>
            <Text style={dlabel}>Açıklama (opsiyonel)</Text>
            <TextInput value={draft.description} onChangeText={t => setDraft(d => d ? { ...d, description: t } : d)} placeholder="kısa açıklama" placeholderTextColor={INK[400]}
              style={{ fontSize: 13, color: INK[800], backgroundColor: PAGE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any} />
          </View>
          <View style={{ gap: 5 }}>
            <Text style={dlabel}>Renk</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SKILL_COLORS.map(c => (
                <Pressable key={c} onPress={() => setDraft(d => d ? { ...d, color: c } : d)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, alignItems: 'center', justifyContent: 'center', borderWidth: draft.color === c ? 3 : 0, borderColor: '#FFFFFF', ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: draft.color === c ? `0 0 0 2px ${c}` : 'none' } as any : {}) }}>
                  {draft.color === c && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ gap: 5 }}>
            <Text style={dlabel}>İkon</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SKILL_ICON_KEYS.map(k => { const sel = draft.icon === k; return (
                <Pressable key={k} onPress={() => setDraft(d => d ? { ...d, icon: k } : d)} style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? tint(draft.color, 0.18) : '#FFFFFF', borderWidth: 1, borderColor: sel ? draft.color : 'rgba(0,0,0,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <SkillIcon name={k} size={17} color={sel ? draft.color : INK[500]} strokeWidth={2} />
                </Pressable>
              ); })}
            </View>
          </View>
          <View style={{ gap: 5 }}>
            <Text style={dlabel}>Sertifika seviyesi (opsiyonel)</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {CERT_LEVELS.map(c => { const sel = draft.cert_level === c.key; return (
                <Pressable key={String(c.key)} onPress={() => setDraft(d => d ? { ...d, cert_level: c.key } : d)} style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: sel ? A : '#FFFFFF', borderWidth: 1, borderColor: sel ? A : 'rgba(0,0,0,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: sel ? onA : INK[500] }}>{c.label}</Text>
                </Pressable>
              ); })}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
            {draft.id && <Pressable onPress={() => del(draft.id!)} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 11, backgroundColor: tint('#D94B4B', 0.10), borderWidth: 1, borderColor: tint('#D94B4B', 0.25) }}><Trash2 size={14} color="#9C2E2E" strokeWidth={2} /><Text style={{ fontSize: 12.5, fontWeight: '700', color: '#9C2E2E' }}>Sil</Text></Pressable>}
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setDraft(null)} style={{ paddingHorizontal: 15, paddingVertical: 10, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' }}><Text style={{ fontSize: 12.5, fontWeight: '700', color: INK[500] }}>Vazgeç</Text></Pressable>
            <Pressable onPress={save} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 11, backgroundColor: A, opacity: busy ? 0.5 : 1 }}><Save size={15} color={onA} strokeWidth={2.1} /><Text style={{ fontSize: 13, fontWeight: '800', color: onA }}>{busy ? '…' : 'Kaydet'}</Text></Pressable>
          </View>
        </View>
      )}

      {/* Liste */}
      {labSkills.length === 0 && !draft ? (
        <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 30, alignItems: 'center', gap: 8 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.12) }}><Cpu size={22} color={A_DEEP} strokeWidth={1.8} /></View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900] }}>Henüz yönetilen yetkinlik yok</Text>
          <Text style={{ fontSize: 12.5, color: INK[500], textAlign: 'center', maxWidth: 340 }}>İlk yetkinliği oluştur — ad, renk, ikon ve sertifika seviyesiyle. Sonra istasyon/teknisyenlere atarsın.</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {labSkills.map(s => { const u = usage.get(s.name) ?? { stations: 0, techs: 0 }; const orphan = u.techs === 0 && u.stations > 0; return (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(s.color ?? A, 0.16) }}><SkillIcon name={s.icon} size={16} color={s.color ?? A_DEEP} strokeWidth={2} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK[900] }}>{s.name}</Text>
                  {s.cert_level && <Badge color={A_DEEP} bg={tint(A, 0.14)} label={s.cert_level.toUpperCase()} />}
                  {orphan && <Badge color="#9C2E2E" bg={tint('#D94B4B', 0.12)} label="KİMSE YOK" />}
                </View>
                {s.description ? <Text style={{ fontSize: 11.5, color: INK[500] }} numberOfLines={1}>{s.description}</Text> : <Text style={{ fontSize: 11, color: INK[400] }}>{u.stations} aşama · {u.techs} kişi</Text>}
              </View>
              <Pressable onPress={() => openEdit(s)} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}><Pencil size={14} color={INK[500]} strokeWidth={2} /></Pressable>
            </View>
          ); })}
        </View>
      )}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AREA 3 — Personel (teknisyen yetkinlikleri)
// ════════════════════════════════════════════════════════════════════════════
export function PeopleArea({ theme, techs, stations, stationSkills, onToggleStation }: {
  theme: Theme; techs: TriageTech[]; stations: TriageStation[];
  stationSkills: Map<string, Set<string>>;
  onToggleStation: (techId: string, stationId: string, currentlyHas: boolean) => void;
}) {
  const { A, A_DEEP } = theme;
  // Yalnız teknisyenleri göster (kurye/yönetici hariç)
  const techList = techs.filter(t => (t.role ?? 'technician') === 'technician');
  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderRadius: 14, backgroundColor: tint(A, 0.06), borderWidth: 1, borderColor: tint(A, 0.18), padding: 14, gap: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: INK[900] }}>Personel yetkinlikleri</Text>
        <Text style={{ fontSize: 12, color: INK[500], lineHeight: 18 }}>Her teknisyenin hangi istasyonlarda çalışabildiğini işaretle. Otomatik atama ve "Yeniden Ata" yalnız yetkili teknisyenlere yapılır. (Tek yetkinlik kaynağı burası.)</Text>
      </View>
      {techList.length === 0 && <Text style={{ fontSize: 12, color: INK[400], fontStyle: 'italic' }}>Teknisyen yok.</Text>}
      {stations.length === 0 && techList.length > 0 && (
        <Text style={{ fontSize: 12, color: INK[400], fontStyle: 'italic' }}>Önce "Akış" alanından istasyon ekleyin.</Text>
      )}
      {techList.map(t => {
        const owned = stationSkills.get(t.id) ?? new Set<string>();
        return (
          <View key={t.id} style={{ borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.18) }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: A_DEEP }}>{initials(t.full_name)}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900] }}>{t.full_name}</Text>
              <Text style={{ fontSize: 11, color: INK[400], marginLeft: 'auto' }}>{owned.size}/{stations.length}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {stations.map(st => {
                const has = owned.has(st.id);
                return (
                  <Pressable
                    key={st.id}
                    onPress={() => onToggleStation(t.id, st.id, has)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                      borderWidth: 1,
                      borderColor: has ? A : 'rgba(0,0,0,0.12)',
                      backgroundColor: has ? tint(A, 0.12) : '#FFFFFF',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    {has && <Check size={12} color={A_DEEP} strokeWidth={3} />}
                    <Text style={{ fontSize: 11.5, fontWeight: '600', color: has ? A_DEEP : INK[500] }}>{st.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AREA 4 — Kurallar (aşama bazlı: süre · SLA · gerekli yetkinlik · oto-triaj)
// ════════════════════════════════════════════════════════════════════════════
function RulesArea({ theme, labId, stations, techs, skillCatalog, onStationSkills, onStationTiming }: {
  theme: Theme; labId: string | null; stations: TriageStation[]; techs: TriageTech[]; skillCatalog: string[];
  onStationSkills: (st: TriageStation, s: string[]) => void; onStationTiming: (st: TriageStation, d: number | null, sla: number | null) => void;
}) {
  const { A, A_DEEP } = theme;
  return (
    <View style={{ gap: 12 }}>
      <AutoTriageToggle labId={labId} theme={theme} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <SlidersHorizontal size={15} color={A_DEEP} strokeWidth={2} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: INK[900] }}>Aşama Kuralları</Text>
      </View>
      {stations.map(st => (
        <View key={st.id} style={{ borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', padding: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: st.color }} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900] }}>{st.name}</Text>
            {st.is_critical && <Badge color="#9C2E2E" bg={tint('#D94B4B', 0.12)} label="KRİTİK" />}
          </View>
          <View style={{ gap: 6 }}>
            <Text style={dlabel}>Gerekli yetkinlikler</Text>
            <ChipEditor values={st.required_skills} suggestions={skillCatalog} theme={theme} onChange={(s) => onStationSkills(st, s)} placeholder="yetkinlik ekle (ör. CAD)" />
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)' }} />
          <View style={{ gap: 6 }}>
            <Text style={dlabel}>Tahmini süre & teslim hedefi</Text>
            <TimingFields st={st} theme={theme} onSave={(d, s) => onStationTiming(st, d, s)} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Smart Insights ──
type Insight = { tone: 'warn' | 'info' | 'bad'; text: string };
function computeInsights(draft: Draft | null, stationById: Map<string, TriageStation>, techs: TriageTech[]): Insight[] {
  if (!draft) return [];
  const out: Insight[] = [];
  const stages = draft.stationIds.map(id => stationById.get(id)).filter(Boolean) as TriageStation[];
  // 1) süresiz aşamalar
  const noDur = stages.filter(s => !s.est_duration_min);
  if (noDur.length) out.push({ tone: 'info', text: `${noDur.length} aşamada tahmini süre yok — teslim tahmini eksik kalır.` });
  // 2) yetkinliği olup uygun teknisyeni olmayan aşama
  stages.forEach(s => {
    if (s.required_skills.length) {
      const q = techs.filter(t => s.required_skills.every(r => t.skills.includes(r)));
      if (q.length === 0) out.push({ tone: 'bad', text: `"${s.name}" için uygun teknisyen yok — darboğaz/durma riski.` });
      else if (q.length === 1) out.push({ tone: 'warn', text: `"${s.name}" yalnız 1 teknisyen yapabilir (${q[0].full_name}) — tek nokta riski.` });
    }
  });
  // 3) toplam süre
  const total = stages.reduce((a, s) => a + (s.est_duration_min ?? 0), 0);
  if (total > 0) out.push({ tone: 'info', text: `Tahmini toplam işlem süresi: ${fmtDuration(total)} (${stages.length} aşama).` });
  if (out.length === 0) out.push({ tone: 'info', text: 'Akış sağlıklı görünüyor — belirgin darboğaz yok.' });
  return out;
}
function InsightsPanel({ theme, insights }: { theme: Theme; insights: Insight[] }) {
  const { A_DEEP } = theme;
  const tones = {
    info: { bg: 'rgba(0,0,0,0.03)', fg: INK[500], dot: A_DEEP },
    warn: { bg: tint('#E89B2A', 0.10), fg: '#9A6710', dot: '#E89B2A' },
    bad:  { bg: tint('#D94B4B', 0.10), fg: '#9C2E2E', dot: '#D94B4B' },
  } as const;
  return (
    <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)', padding: 14, gap: 9 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Lightbulb size={15} color={A_DEEP} strokeWidth={2} />
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK[900] }}>Akıllı İçgörüler</Text>
      </View>
      {insights.map((it, i) => { const t = tones[it.tone]; return (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 9, borderRadius: 10, backgroundColor: t.bg }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.dot, marginTop: 4 }} />
          <Text style={{ fontSize: 11.5, color: t.fg, fontWeight: '600', flex: 1, lineHeight: 16 }}>{it.text}</Text>
        </View>
      ); })}
    </View>
  );
}

// ── Auto-triage toggle ──
function AutoTriageToggle({ labId, theme }: { labId: string | null; theme: Theme }) {
  const { A, A_DEEP } = theme;
  const [on, setOn] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!labId) return; let c = false; fetchAutoTriage(labId).then(v => { if (!c) setOn(v); }).catch(() => {}); return () => { c = true; }; }, [labId]);
  const toggle = async () => { if (!labId || busy) return; const n = !on; setOn(n); setBusy(true); const r = await setAutoTriage(labId, n); if ((r as any)?.error) setOn(!n); setBusy(false); };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)' }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.12) }}><Zap size={16} color={A_DEEP} strokeWidth={2} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: INK[900] }}>Sıfır-tıkla oto-triaj</Text>
        <Text style={{ fontSize: 11.5, color: INK[500] }}>Şablonla güvenle eşleşen sipariş otomatik uygulanır + onaylanır.</Text>
      </View>
      <Pressable onPress={toggle} style={{ width: 46, height: 28, borderRadius: 999, padding: 3, justifyContent: 'center', backgroundColor: on ? A : INK[200], opacity: busy ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </Pressable>
    </View>
  );
}

// ── Küçük yardımcı bileşenler ──
const PAGE_SOFT = '#FAFAFA';
const dlabel = { fontSize: 10.5, fontWeight: '700' as const, color: INK[400], letterSpacing: 0.5, textTransform: 'uppercase' as const };

function Badge({ label, color, bg, icon }: { label: string; color: string; bg: string; icon?: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: bg }}>{icon}<Text style={{ fontSize: 9, fontWeight: '800', color, letterSpacing: 0.3 }}>{label}</Text></View>;
}
function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>{icon}<Text style={{ fontSize: 12, color: INK[500], width: 92 }}>{label}</Text><Text style={{ fontSize: 12.5, fontWeight: '700', color: INK[900], flex: 1 }}>{value}</Text></View>;
}
function DepChip({ label, color, strong }: { label: string; color: string; strong?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tint(color, strong ? 0.18 : 0.10), borderWidth: strong ? 1 : 0, borderColor: tint(color, 0.4) }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} /><Text style={{ fontSize: 11, fontWeight: strong ? '800' : '600', color: INK[700] }}>{label}</Text></View>;
}
function initials(name: string) { return (name || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join(''); }

function ChipEditor({ values, suggestions, theme, onChange, placeholder }: { values: string[]; suggestions: string[]; theme: Theme; onChange: (v: string[]) => void; placeholder: string }) {
  const { A, A_DEEP, onA, PAGE } = theme;
  const [text, setText] = useState('');
  const add = (raw: string) => { const v = raw.trim(); if (!v || values.includes(v)) { setText(''); return; } onChange([...values, v]); setText(''); };
  const remove = (v: string) => onChange(values.filter(x => x !== v));
  const sugg = suggestions.filter(s => !values.includes(s)).slice(0, 12);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {values.map(v => (
          <View key={v} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: tint(A, 0.14) }}>
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: A_DEEP }}>{v}</Text>
            <Pressable onPress={() => remove(v)} style={{ ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}><X size={11} color={A_DEEP} strokeWidth={2.4} /></Pressable>
          </View>
        ))}
        {values.length === 0 && <Text style={{ fontSize: 11.5, color: INK[400], fontStyle: 'italic' }}>Yetkinlik yok — herkes uygun.</Text>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={() => add(text)} placeholder={placeholder} placeholderTextColor={INK[400]}
          style={{ flex: 1, fontSize: 13, color: INK[900], backgroundColor: PAGE, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any} />
        <Pressable onPress={() => add(text)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: A, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}><Plus size={15} color={onA} strokeWidth={2.4} /></Pressable>
      </View>
      {sugg.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 0.4, textTransform: 'uppercase' }}>Öneriler — eklemek için tıkla</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {sugg.map(s => <Pressable key={s} onPress={() => add(s)} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}><Text style={{ fontSize: 11, color: INK[500], fontWeight: '600' }}>+ {s}</Text></Pressable>)}
          </View>
        </View>
      )}
    </View>
  );
}

function TimingFields({ st, theme, onSave }: { st: TriageStation; theme: Theme; onSave: (d: number | null, s: number | null) => void }) {
  const { PAGE } = theme;
  const [dur, setDur] = useState(st.est_duration_min != null ? String(st.est_duration_min) : '');
  const [sla, setSla] = useState(st.sla_hours != null ? String(st.sla_hours) : '');
  useEffect(() => { setDur(st.est_duration_min != null ? String(st.est_duration_min) : ''); }, [st.est_duration_min]);
  useEffect(() => { setSla(st.sla_hours != null ? String(st.sla_hours) : ''); }, [st.sla_hours]);
  const parse = (v: string): number | null => { const n = parseInt(v.replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const commit = () => onSave(parse(dur), parse(sla));
  const field = (label: string, value: string, set: (v: string) => void, suffix: string) => (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={dlabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: PAGE, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 10, paddingVertical: 6 }}>
        <TextInput value={value} onChangeText={set} onBlur={commit} onSubmitEditing={commit} placeholder="—" placeholderTextColor={INK[300]} keyboardType="numeric"
          style={{ flex: 1, fontSize: 14, fontWeight: '700', color: INK[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) } as any} />
        <Text style={{ fontSize: 11.5, fontWeight: '600', color: INK[400] }}>{suffix}</Text>
      </View>
    </View>
  );
  return <View style={{ flexDirection: 'row', gap: 10 }}>{field('Tahmini Süre', dur, setDur, 'dk')}{field('Teslim Hedefi', sla, setSla, 'saat')}</View>;
}

export default WorkflowStudioScreen;
