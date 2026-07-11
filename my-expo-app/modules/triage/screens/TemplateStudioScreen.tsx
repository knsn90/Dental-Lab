// modules/triage/screens/TemplateStudioScreen.tsx
// Şablon Stüdyosu — lab kendi iş akışı şablonlarını kurar (biz varsayılan vermeyiz).
// Mevcut workflow_templates tablosunu kullanır (RLS: lab manager + admin yazabilir).
// Panel-aware (usePanelTheme).

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Platform } from 'react-native';
import {
  Layers, Plus, X, ChevronUp, ChevronDown, Save, Trash2, Star, Check, AlertTriangle,
  Cpu, UserCheck, Zap, Sparkles,
} from 'lucide-react-native';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DS } from '../../../core/theme/dsTokens';
import { useAuthStore } from '../../../core/store/authStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { toast } from '../../../core/ui/Toast';
import {
  fetchStudioData, createTemplate, updateTemplate, deleteTemplate,
  fetchSkillsData, updateStationSkills, updateTechSkills, updateStationTiming, fmtDuration,
  fetchAutoTriage, setAutoTriage, generateTemplatesFromServices,
  type StudioTemplate, type TriageStation, type TriageTech, type TemplateInput, type SkillsData,
} from '../api';

const INK = DS.ink;
const DISPLAY = Platform.select({ web: 'Inter Tight, Inter, sans-serif', default: 'InterTight_300Light' }) as string;
const PANEL_BGPAGE: Record<string, string> = { lab: '#F5F1EB', clinic: '#F9FAFB', exec: '#F7F9FC', tech: '#F5F9FD' };
// Hazır yetkinlik kataloğu — diş lab. için yaygın beceriler. Tıkla-ekle (elle yazmaya gerek yok).
const DEFAULT_SKILLS = [
  'CAD Tasarım', 'CAM / Frezeleme', 'Metal Döküm', 'Seramik / Porselen', 'Zirkonyum',
  'Model / Day Hazırlama', 'Akrilik / Kaide', 'Total Protez', 'İskelet (Bölümlü) Döküm',
  'Lehim', 'Renk / Boyama', 'Bitirme / Polisaj', 'Ortodonti Apareyleri', '3D Baskı',
];
function tint(hex: string, a: number) {
  try { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; } catch { return hex; }
}

interface Draft {
  id: string | null;
  name: string;
  caseTypesText: string;
  stationIds: string[];
  isDefault: boolean;
  isActive: boolean;
}
const EMPTY: Draft = { id: null, name: '', caseTypesText: '', stationIds: [], isDefault: false, isActive: true };

export function TemplateStudioScreen() {
  const theme = usePanelTheme();
  const A = theme.primary, A_DEEP = theme.primaryDeep, PAGE = PANEL_BGPAGE[theme.key] ?? theme.bg;
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? null;

  const [tab, setTab] = useState<'templates' | 'skills'>('templates');
  const [stations, setStations] = useState<TriageStation[]>([]);
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!labId) { setLoading(false); return; }
    setLoading(true);
    const d = await fetchStudioData(labId);
    setStations(d.stations);
    setTemplates(d.templates);
    setLoading(false);
  }, [labId]);
  useEffect(() => { load(); }, [load]);

  // Fiyat listesindeki her hizmet için (şablonu yoksa) otomatik akış üret.
  const genFromServices = useCallback(async () => {
    if (!labId || generating) return;
    setGenerating(true);
    try {
      const res = await generateTemplatesFromServices(labId);
      if (res.noStations) {
        toast.error('Önce istasyon tanımlamalısın (lab_stations boş).');
      } else if (res.created === 0) {
        toast.success(res.skipped > 0 ? 'Tüm hizmetlerin şablonu zaten var.' : 'Üretilecek hizmet bulunamadı.');
      } else {
        toast.success(`${res.created} şablon üretildi${res.skipped ? ` · ${res.skipped} atlandı` : ''}.`);
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Şablon üretilemedi');
    } finally {
      setGenerating(false);
    }
  }, [labId, generating, load]);

  const stationById = useMemo(() => new Map(stations.map(s => [s.id, s])), [stations]);

  const openNew = () => setDraft({ ...EMPTY });
  const openEdit = (t: StudioTemplate) => setDraft({
    id: t.id, name: t.name, caseTypesText: t.case_types.join(', '),
    stationIds: [...t.station_ids], isDefault: t.is_default, isActive: t.is_active,
  });

  const patch = (p: Partial<Draft>) => setDraft(d => d ? { ...d, ...p } : d);
  const addStation = (id: string) => patch({ stationIds: [...(draft?.stationIds ?? []), id] });
  const removeStation = (idx: number) => patch({ stationIds: (draft?.stationIds ?? []).filter((_, i) => i !== idx) });
  const moveStation = (idx: number, dir: -1 | 1) => {
    const arr = [...(draft?.stationIds ?? [])]; const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]]; patch({ stationIds: arr });
  };

  const save = async () => {
    if (!draft || !labId) return;
    setError('');
    if (!draft.name.trim()) { setError('Şablon adı gerekli'); return; }
    if (draft.stationIds.length === 0) { setError('En az 1 aşama ekle'); return; }
    setSaving(true);
    const payload: TemplateInput = {
      name: draft.name.trim(),
      case_types: draft.caseTypesText.split(',').map(s => s.trim()).filter(Boolean),
      station_ids: draft.stationIds,
      is_default: draft.isDefault,
      is_active: draft.isActive,
    };
    const res = draft.id ? await updateTemplate(draft.id, payload) : await createTemplate(labId, payload);
    setSaving(false);
    if ((res as any)?.error) { setError((res as any).error.message ?? 'Kayıt hatası'); return; }
    setDraft(null);
    load();
  };

  const remove = async () => {
    if (!draft?.id) { setDraft(null); return; }
    setSaving(true);
    await deleteTemplate(draft.id);
    setSaving(false);
    setDraft(null);
    load();
  };

  const poolStations = stations.filter(s => !(draft?.stationIds ?? []).includes(s.id));

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: PAGE, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={A} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: PAGE }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 80, width: '100%' }}>
      {/* Başlık */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: A_DEEP, letterSpacing: 1, textTransform: 'uppercase' }}>Şablon Stüdyosu</Text>
          <Text style={{ fontSize: 28, color: INK[900], fontFamily: DISPLAY, letterSpacing: -0.7 }}>İş Akışı Şablonları</Text>
          <Text style={{ fontSize: 12.5, color: INK[500], marginTop: 2 }}>Her vaka tipi için üretim akışını bir kez tasarla — siparişlerde otomatik uygulanır.</Text>
        </View>
        {!draft && tab === 'templates' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Pressable
              onPress={genFromServices}
              disabled={generating}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: tint(A, 0.4), backgroundColor: tint(A, 0.10), opacity: generating ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <Sparkles size={15} color={A_DEEP} strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: A_DEEP }}>{generating ? 'Üretiliyor…' : 'Fiyat listesinden üret'}</Text>
            </Pressable>
            <Pressable onPress={openNew} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: A, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Plus size={15} color={theme.accent} strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.accent }}>Yeni Şablon</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Sekme: Şablonlar / Yetkinlikler */}
      {!draft && (
        <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', alignSelf: 'flex-start', marginBottom: 18 }}>
          {([['templates', 'Şablonlar'], ['skills', 'Yetkinlikler']] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: tab === k ? A : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: tab === k ? theme.accent : INK[500] }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {!draft && tab === 'templates' && <AutoTriageToggle labId={labId} accent={A} accentDeep={A_DEEP} pageBg={PAGE} />}

      {tab === 'skills' && !draft ? (
        <SkillsManager labId={labId} accent={A} accentDeep={A_DEEP} onAccent={theme.accent} pageBg={PAGE} />
      ) : (
      <>
      {/* Editör */}
      {draft ? (
        <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 20, gap: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: INK[900] }}>{draft.id ? 'Şablonu Düzenle' : 'Yeni Şablon'}</Text>

          {error ? (
            <View style={{ padding: 10, borderRadius: 10, backgroundColor: tint('#D94B4B', 0.08), borderWidth: 1, borderColor: tint('#D94B4B', 0.2) }}>
              <Text style={{ fontSize: 12, color: '#9C2E2E', fontWeight: '600' }}>{error}</Text>
            </View>
          ) : null}

          <Field label="Şablon adı">
            <TextInput value={draft.name} onChangeText={t => patch({ name: t })} placeholder="ör. Zirkonyum Köprü" placeholderTextColor={INK[400]}
              style={{ fontSize: 14, color: INK[900], backgroundColor: PAGE, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any} />
          </Field>

          <Field label="Vaka tipleri (virgülle ayır — sipariş tipi eşleşince otomatik uygulanır)">
            <TextInput value={draft.caseTypesText} onChangeText={t => patch({ caseTypesText: t })} placeholder="zirkonyum, köprü" placeholderTextColor={INK[400]}
              style={{ fontSize: 14, color: INK[900], backgroundColor: PAGE, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any} />
          </Field>

          {/* Aşama sırası */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 0.8, textTransform: 'uppercase' }}>Akış (sürükle yerine ↑↓ ile sırala)</Text>
            {draft.stationIds.length === 0 && <Text style={{ fontSize: 12, color: INK[400], fontStyle: 'italic' }}>Aşama eklenmedi.</Text>}
            {draft.stationIds.map((sid, i) => {
              const st = stationById.get(sid); if (!st) return null;
              const last = i === draft.stationIds.length - 1;
              return (
                <View key={sid + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: PAGE, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
                  <View style={{ alignItems: 'center' }}>
                    <Pressable onPress={() => moveStation(i, -1)} disabled={i === 0} style={{ opacity: i === 0 ? 0.25 : 1 }}><ChevronUp size={14} color={INK[400]} strokeWidth={2} /></Pressable>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: A_DEEP, fontFamily: DISPLAY }}>{i + 1}</Text>
                    <Pressable onPress={() => moveStation(i, 1)} disabled={last} style={{ opacity: last ? 0.25 : 1 }}><ChevronDown size={14} color={INK[400]} strokeWidth={2} /></Pressable>
                  </View>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.color }} />
                  <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: INK[900] }}>{st.name}</Text>
                  {st.is_critical && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tint('#D94B4B', 0.12) }}>
                      <AlertTriangle size={9} color="#9C2E2E" strokeWidth={2} /><Text style={{ fontSize: 9, fontWeight: '800', color: '#9C2E2E' }}>KRİTİK</Text>
                    </View>
                  )}
                  <Pressable onPress={() => removeStation(i)} style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}><X size={13} color={INK[400]} strokeWidth={2} /></Pressable>
                </View>
              );
            })}
            {poolStations.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {poolStations.map(st => (
                  <Pressable key={st.id} onPress={() => addStation(st.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Plus size={13} color={INK[500]} strokeWidth={2} />
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.color }} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: INK[700] }}>{st.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Varsayılan toggle */}
          <Pressable onPress={() => patch({ isDefault: !draft.isDefault })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: draft.isDefault ? A : '#FFFFFF', borderWidth: 1, borderColor: draft.isDefault ? A : 'rgba(0,0,0,0.15)' }}>
              {draft.isDefault && <Check size={14} color={theme.accent} strokeWidth={3} />}
            </View>
            <Text style={{ fontSize: 13, color: INK[800], fontWeight: '600' }}>Varsayılan şablon (eşleşme yoksa bu kullanılır)</Text>
          </Pressable>

          {/* Aksiyonlar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
            {draft.id && (
              <Pressable onPress={remove} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: tint('#D94B4B', 0.10), borderWidth: 1, borderColor: tint('#D94B4B', 0.25) }}>
                <Trash2 size={14} color="#9C2E2E" strokeWidth={2} /><Text style={{ fontSize: 13, fontWeight: '700', color: '#9C2E2E' }}>Sil</Text>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setDraft(null)} style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: INK[500] }}>Vazgeç</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: A, opacity: saving ? 0.5 : 1 }}>
              <Save size={15} color={theme.accent} strokeWidth={2.1} /><Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.accent }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        /* Şablon listesi */
        templates.length === 0 ? (
          <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 40, alignItems: 'center', gap: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.12) }}>
              <Layers size={24} color={A_DEEP} strokeWidth={1.8} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: INK[900] }}>Henüz şablon yok</Text>
            <Text style={{ fontSize: 13, color: INK[500], textAlign: 'center', maxWidth: 360 }}>İlk iş akışı şablonunu oluştur — vaka tipini ve aşama sırasını belirle, siparişlerde otomatik uygulansın.</Text>
            <Pressable onPress={openNew} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, backgroundColor: A, marginTop: 4 }}>
              <Plus size={15} color={theme.accent} strokeWidth={2.2} /><Text style={{ fontSize: 13.5, fontWeight: '800', color: theme.accent }}>İlk Şablonu Oluştur</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {templates.map(t => (
              <Pressable key={t.id} onPress={() => openEdit(t)} style={({ hovered }: any) => ({ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: hovered ? tint(A, 0.4) : 'rgba(0,0,0,0.07)', padding: 16, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: INK[900] }}>{t.name}</Text>
                  {t.is_default && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tint(A, 0.16) }}>
                      <Star size={9} color={A_DEEP} strokeWidth={2} /><Text style={{ fontSize: 9, fontWeight: '800', color: A_DEEP }}>VARSAYILAN</Text>
                    </View>
                  )}
                  {!t.is_active && (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.06)' }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: INK[500] }}>PASİF</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontSize: 11, color: INK[400] }}>{t.station_ids.length} aşama</Text>
                </View>
                {t.case_types.length > 0 && (
                  <Text style={{ fontSize: 11.5, color: INK[500], marginBottom: 8 }}>Vaka: {t.case_types.join(', ')}</Text>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
                  {t.station_ids.map((sid, i) => {
                    const st = stationById.get(sid); if (!st) return null;
                    return (
                      <View key={sid + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {i > 0 && <Text style={{ fontSize: 11, color: INK[300] }}>→</Text>}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tint(st.color, 0.10) }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.color }} />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: INK[700] }}>{st.name}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Pressable>
            ))}
          </View>
        )
      )}
      </>
      )}
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: INK[700] }}>{label}</Text>
      {children}
    </View>
  );
}

// ─── Yetkinlik yöneticisi: istasyon gereksinimleri + teknisyen yetkinlikleri ──
function SkillsManager({ labId, accent, accentDeep, onAccent, pageBg }: {
  labId: string | null; accent: string; accentDeep: string; onAccent: string; pageBg: string;
}) {
  const [data, setData] = useState<SkillsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!labId) { setLoading(false); return; }
    setLoading(true);
    setData(await fetchSkillsData(labId));
    setLoading(false);
  }, [labId]);
  useEffect(() => { load(); }, [load]);

  const onStationSkills = async (st: TriageStation, skills: string[]) => {
    setSavingId(st.id);
    await updateStationSkills(st.id, skills);
    setData(d => d ? { ...d, stations: d.stations.map(s => s.id === st.id ? { ...s, required_skills: skills } : s) } : d);
    setSavingId(null);
  };
  const onTechSkills = async (t: TriageTech, skills: string[]) => {
    setSavingId(t.id);
    await updateTechSkills(t.id, skills, t.capacity);
    setData(d => d ? { ...d, technicians: d.technicians.map(x => x.id === t.id ? { ...x, skills } : x) } : d);
    setSavingId(null);
  };
  const onStationTiming = async (st: TriageStation, dur: number | null, sla: number | null) => {
    if (st.est_duration_min === dur && st.sla_hours === sla) return;
    setSavingId(st.id);
    await updateStationTiming(st.id, dur, sla);
    setData(d => d ? { ...d, stations: d.stations.map(s => s.id === st.id ? { ...s, est_duration_min: dur, sla_hours: sla } : s) } : d);
    setSavingId(null);
  };

  if (loading) return <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={accent} /></View>;
  if (!data) return null;

  const subLabel = { fontSize: 10.5, fontWeight: '700' as const, color: INK[400], letterSpacing: 0.5, textTransform: 'uppercase' as const };
  const hairline = { height: 1, backgroundColor: 'rgba(0,0,0,0.06)' };
  // Öneriler: önce labda zaten kullanılanlar, sonra hazır katalog (tıkla-ekle).
  const skillCatalog = Array.from(new Set([...data.allSkills, ...DEFAULT_SKILLS]));

  return (
    <View style={{ gap: 22 }}>
      {/* Sayfa açıklaması */}
      <View style={{ borderRadius: 14, backgroundColor: tint(accent, 0.06), borderWidth: 1, borderColor: tint(accent, 0.18), padding: 14, gap: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: INK[900] }}>Bu sayfa ne işe yarar?</Text>
        <Text style={{ fontSize: 12, color: INK[500], lineHeight: 18 }}>
          Her <Text style={{ fontWeight: '700' }}>istasyon</Text> için gereken yetkinlikleri ve tahmini süreyi; her <Text style={{ fontWeight: '700' }}>teknisyen</Text> için yetkinlikleri tanımlarsın.
          Plan Önizleme bunlarla otomatik atama yapar ve teslim süresini hesaplar.
        </Text>
      </View>

      {/* ── 1) İstasyonlar ─────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Cpu size={15} color={accentDeep} strokeWidth={2} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: INK[900] }}>İstasyonlar</Text>
          <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: tint(accent, 0.14) }}>
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: accentDeep }}>{data.stations.length}</Text>
          </View>
        </View>
        {data.stations.map(st => (
          <View key={st.id} style={{ borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, gap: 12 }}>
            {/* başlık */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: st.color || accent }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900] }}>{st.name}</Text>
              {st.is_critical && (
                <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: tint('#D94B4B', 0.12) }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#9C2E2E', letterSpacing: 0.4 }}>KRİTİK</Text>
                </View>
              )}
            </View>
            {/* gerekli yetkinlikler */}
            <View style={{ gap: 6 }}>
              <Text style={subLabel}>Gerekli yetkinlikler</Text>
              <ChipEditor values={st.required_skills} suggestions={skillCatalog} accent={accent} accentDeep={accentDeep} onAccent={onAccent} pageBg={pageBg} busy={savingId === st.id}
                onChange={(skills) => onStationSkills(st, skills)} placeholder="yetkinlik ekle (ör. CAD)" />
              <Text style={{ fontSize: 10.5, color: INK[400] }}>Boşsa: herkes uygun. Doluysa: atama yalnız bu yetkinliğe sahip teknisyenlere yapılır.</Text>
            </View>
            <View style={hairline} />
            {/* süre & sla */}
            <View style={{ gap: 6 }}>
              <Text style={subLabel}>Tahmini süre & teslim (SLA)</Text>
              <StationTiming st={st} accent={accentDeep} pageBg={pageBg} onSave={(dur, sla) => onStationTiming(st, dur, sla)} />
            </View>
          </View>
        ))}
      </View>

      {/* ── 2) Teknisyenler ────────────────────────────── */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <UserCheck size={15} color={accentDeep} strokeWidth={2} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: INK[900] }}>Teknisyenler</Text>
          <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: tint(accent, 0.14) }}>
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: accentDeep }}>{data.technicians.length}</Text>
          </View>
        </View>
        {data.technicians.map(t => (
          <View key={t.id} style={{ borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900] }}>{t.full_name}</Text>
            <View style={{ gap: 6 }}>
              <Text style={subLabel}>Yetkinlikler</Text>
              <ChipEditor values={t.skills} suggestions={skillCatalog} accent={accent} accentDeep={accentDeep} onAccent={onAccent} pageBg={pageBg} busy={savingId === t.id}
                onChange={(skills) => onTechSkills(t, skills)} placeholder="yetkinlik ekle" />
            </View>
          </View>
        ))}
        {data.technicians.length === 0 && <Text style={{ fontSize: 12, color: INK[400], fontStyle: 'italic' }}>Teknisyen yok.</Text>}
      </View>
    </View>
  );
}

// Faz 5c: lab geneli sıfır-tıkla oto-triaj anahtarı (opt-in).
function AutoTriageToggle({ labId, accent, accentDeep, pageBg }: {
  labId: string | null; accent: string; accentDeep: string; pageBg: string;
}) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!labId) return;
    let cancel = false;
    fetchAutoTriage(labId).then(v => { if (!cancel) setOn(v); }).catch(() => {});
    return () => { cancel = true; };
  }, [labId]);
  const toggle = async () => {
    if (!labId || busy) return;
    const next = !on;
    setOn(next); setBusy(true);
    const res = await setAutoTriage(labId, next);
    if ((res as any)?.error) setOn(!next); // geri al
    setBusy(false);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginBottom: 16 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(accent, 0.12) }}>
        <Zap size={17} color={accentDeep} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK[900] }}>Sıfır-tıkla oto-triaj</Text>
        <Text style={{ fontSize: 11.5, color: INK[500], marginTop: 1 }}>
          Açıkken: planlama bekleyen sipariş bir şablonla güvenle eşleşirse plan otomatik uygulanır ve onaylanır.
        </Text>
      </View>
      <Pressable
        onPress={toggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        style={{ width: 46, height: 28, borderRadius: 999, padding: 3, justifyContent: 'center', backgroundColor: on ? accent : INK[200], opacity: busy ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', alignSelf: on ? 'flex-end' : 'flex-start', ...(Platform.OS === 'web' ? { transition: 'all 140ms ease' } as any : {}) }} />
      </Pressable>
    </View>
  );
}

// Faz 3: aşama varsayılan süre (dk) + SLA (saat) düzenleyici. Blur/submit ile kaydeder.
function StationTiming({ st, accent, pageBg, onSave }: {
  st: TriageStation; accent: string; pageBg: string;
  onSave: (dur: number | null, sla: number | null) => void;
}) {
  const [dur, setDur] = useState(st.est_duration_min != null ? String(st.est_duration_min) : '');
  const [sla, setSla] = useState(st.sla_hours != null ? String(st.sla_hours) : '');
  useEffect(() => { setDur(st.est_duration_min != null ? String(st.est_duration_min) : ''); }, [st.est_duration_min]);
  useEffect(() => { setSla(st.sla_hours != null ? String(st.sla_hours) : ''); }, [st.sla_hours]);

  const parse = (v: string): number | null => {
    const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const commit = () => onSave(parse(dur), parse(sla));

  const field = (label: string, value: string, set: (v: string) => void, suffix: string, hint?: string) => (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: INK[500], letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: pageBg, borderRadius: 9, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 10, paddingVertical: 6 }}>
        <TextInput
          value={value}
          onChangeText={set}
          onBlur={commit}
          onSubmitEditing={commit}
          placeholder="—"
          placeholderTextColor={INK[300]}
          keyboardType="numeric"
          style={{ flex: 1, fontSize: 14, fontWeight: '700', color: INK[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) } as any}
        />
        <Text style={{ fontSize: 11.5, fontWeight: '600', color: INK[400] }}>{suffix}</Text>
      </View>
      {hint ? <Text style={{ fontSize: 10, color: INK[400] }}>{hint}</Text> : null}
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
      {field('Tahmini Süre', dur, setDur, 'dk', dur ? fmtDuration(parse(dur) ?? 0) : 'işlem süresi')}
      {field('SLA / Hedef', sla, setSla, 'saat', 'teslim hedefi')}
    </View>
  );
}

function ChipEditor({ values, suggestions, accent, accentDeep, onAccent, pageBg, busy, onChange, placeholder }: {
  values: string[]; suggestions: string[]; accent: string; accentDeep: string; onAccent: string; pageBg: string;
  busy: boolean; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || values.includes(v)) { setText(''); return; }
    onChange([...values, v]); setText('');
  };
  const remove = (v: string) => onChange(values.filter(x => x !== v));
  const unusedSugg = suggestions.filter(s => !values.includes(s)).slice(0, 12);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {values.map(v => (
          <View key={v} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: tint(accent, 0.14) }}>
            <Text style={{ fontSize: 11.5, fontWeight: '700', color: accentDeep }}>{v}</Text>
            <Pressable onPress={() => remove(v)} style={{ ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}><X size={11} color={accentDeep} strokeWidth={2.4} /></Pressable>
          </View>
        ))}
        {values.length === 0 && <Text style={{ fontSize: 11.5, color: INK[400], fontStyle: 'italic' }}>Yetkinlik yok — herkes uygun.</Text>}
        {busy && <ActivityIndicator size="small" color={accent} />}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={() => add(text)} placeholder={placeholder} placeholderTextColor={INK[400]}
          style={{ flex: 1, fontSize: 13, color: INK[900], backgroundColor: pageBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' } as any} />
        <Pressable onPress={() => add(text)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <Plus size={15} color={onAccent} strokeWidth={2.4} />
        </Pressable>
      </View>
      {unusedSugg.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 0.4, textTransform: 'uppercase' }}>Öneriler — eklemek için tıkla</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {unusedSugg.map(s => (
            <Pressable key={s} onPress={() => add(s)} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ fontSize: 11, color: INK[500], fontWeight: '600' }}>+ {s}</Text>
            </Pressable>
          ))}
          </View>
        </View>
      )}
    </View>
  );
}
