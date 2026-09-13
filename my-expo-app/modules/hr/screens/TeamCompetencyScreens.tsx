// Ekip (İK & Depo hub) — Yetkinlikler + Personel sekmeleri.
// İş Akışları stüdyosundan taşındı; gerçek alan bileşenlerini (SkillsArea/PeopleArea)
// reuse eder, kendi verisini yükler. Tek kanonik yetkinlik yönetimi artık burada.
import React, { useState, useEffect, useCallback } from 'react';
import { View } from 'react-native';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useAuthStore } from '../../../core/store/authStore';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { fetchStationSkillsMap, toggleUserStationSkill } from '../../../core/api/stationSkills';
import {
  fetchSkillsData, fetchLabSkills,
  type TriageStation, type TriageTech, type LabSkill,
} from '../../triage/api';
import {
  SkillsArea, PeopleArea, onPrimaryText, PANEL_BGPAGE,
} from '../../triage/screens/WorkflowStudioScreen';

function usePanelChrome() {
  const theme = usePanelTheme();
  const A = theme.primary, A_DEEP = theme.primaryDeep;
  // WorkflowStudioScreen ile aynı kural: koyu temada PAGE sayfa zemini olur
  // (SkillsArea/PeopleArea input+chip zeminlerini PAGE'den alıyor).
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const PAGE = isDark ? '#0E0E0E' : (PANEL_BGPAGE[theme.key] ?? theme.bg);
  const onA = onPrimaryText(A, theme.accent);
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? null;
  return { themeObj: { A, A_DEEP, onA, PAGE }, A, labId };
}

// ── Yetkinlikler · Beceri kataloğu ──────────────────────────────────────────
export function SkillCatalogScreen() {
  const { themeObj, A, labId } = usePanelChrome();
  const [stations, setStations] = useState<TriageStation[]>([]);
  const [techs, setTechs] = useState<TriageTech[]>([]);
  const [labSkills, setLabSkills] = useState<LabSkill[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!labId) { setLoading(false); return; }
    setLoading(true);
    const [sd, ls] = await Promise.all([fetchSkillsData(labId), fetchLabSkills(labId)]);
    setStations(sd.stations);
    setTechs(sd.technicians);
    setLabSkills(((ls as any).data ?? []) as LabSkill[]);
    setLoading(false);
  }, [labId]);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={A} /></View>;
  }
  return (
    <View style={{ paddingVertical: 16 }}>
      <SkillsArea theme={themeObj} labId={labId} labSkills={labSkills} stations={stations} techs={techs} onReload={load} />
    </View>
  );
}

// ── Personel · Teknisyen istasyon yetkileri ─────────────────────────────────
export function StationPermissionsScreen() {
  const { themeObj, A, labId } = usePanelChrome();
  const [stations, setStations] = useState<TriageStation[]>([]);
  const [techs, setTechs] = useState<TriageTech[]>([]);
  const [stationSkills, setStationSkills] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!labId) { setLoading(false); return; }
    setLoading(true);
    const [sd, st] = await Promise.all([fetchSkillsData(labId), fetchStationSkillsMap()]);
    setStations(sd.stations);
    setTechs(sd.technicians);
    setStationSkills(st);
    setLoading(false);
  }, [labId]);
  useEffect(() => { load(); }, [load]);

  const onToggleStation = useCallback(async (techId: string, stationId: string, currentlyHas: boolean) => {
    setStationSkills(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(techId) ?? []);
      if (currentlyHas) set.delete(stationId); else set.add(stationId);
      next.set(techId, set);
      return next;
    });
    const r = await toggleUserStationSkill(techId, stationId, currentlyHas, labId);
    if (!r.ok) load();
  }, [labId, load]);

  if (loading) {
    return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={A} /></View>;
  }
  return (
    <View style={{ paddingVertical: 16 }}>
      <PeopleArea theme={themeObj} techs={techs} stations={stations} stationSkills={stationSkills} onToggleStation={onToggleStation} />
    </View>
  );
}
