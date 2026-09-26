// Ekip (İK & Depo hub) — Yetkinlikler + Personel sekmeleri.
// İş Akışları stüdyosundan taşındı; gerçek alan bileşenlerini (SkillsArea/PeopleArea)
// reuse eder, kendi verisini yükler. Tek kanonik yetkinlik yönetimi artık burada.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import { Plus } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
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
  const { width } = useWindowDimensions();
  const { themeObj, A, labId } = usePanelChrome();
  const heroInk = useWhiteHeroInk(A);
  const [stations, setStations] = useState<TriageStation[]>([]);
  const [techs, setTechs] = useState<TriageTech[]>([]);
  const [labSkills, setLabSkills] = useState<LabSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSkillSignal, setNewSkillSignal] = useState(0);

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
  // Hero özeti — katalogda kaç yetkinlik var, kaçı bir istasyona bağlı.
  // "Bağsız" yetkinlik otomatik atamada işe yaramaz; sayısı görünür olmalı.
  const linked = labSkills.filter(sk => (sk as any).station_id).length;

  return (
    // Hub başlığı ile hero arası 16px: hub zaten 8 (başlık altı) + 8 (kaydırma üstü)
    // veriyor → masaüstünde üst dolgu 0. Mobilde başlık çubuğu yok, 16 kalır.
    <View style={{ paddingTop: width >= 900 ? 0 : 16, paddingBottom: 16, gap: 14 }}>
      {/* ── Hero — "BEYAZ HERO" (core/ui/WhiteHero) ───────────────── */}
      <WhiteHero
        kicker="Ekip · Yetkinlik Kataloğu"
        accent={A}
        title={<><Text style={{ color: heroInk.accentInk }}>{labSkills.length}</Text> yetkinlik</>}
        description={
          `${stations.length} istasyon · ${techs.length} kişi` +
          (labSkills.length - linked > 0 ? ` · ${labSkills.length - linked} yetkinlik hiçbir istasyona bağlı değil` : '')
        }
        stats={[
          { value: String(labSkills.length), label: 'Yetkinlik' },
          { value: String(stations.length),  label: 'İstasyon' },
          { value: String(techs.length),     label: 'Kişi' },
        ]}
        // "Yeni Yetkinlik" hero'nun ALT SAĞ köşesinde (kullanıcı isteği); form
        // SkillsArea içinde açılır (newSignal).
        actionsAlign="end"
        actions={
          <GlassTooltip title={autoT('Yeni yetkinlik')} text={autoT('Kataloğa yeni bir beceri ekle; istasyonlara ve teknisyenlere atanabilir')}>
            <Pressable
              onPress={() => setNewSkillSignal(n => n + 1)}
              style={({ pressed }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10,
                borderRadius: 9999, backgroundColor: A, opacity: pressed ? 0.85 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Plus size={15} color={themeObj.onA} strokeWidth={2.2} />
              <Text style={{ fontSize: 13, fontWeight: '800', color: themeObj.onA }}>Yeni Yetkinlik</Text>
            </Pressable>
          </GlassTooltip>
        }
      />

      <SkillsArea theme={themeObj} labId={labId} labSkills={labSkills} stations={stations} techs={techs} onReload={load}
        newSignal={newSkillSignal} hideNewButton />
    </View>
  );
}

// ── Personel · Teknisyen istasyon yetkileri ─────────────────────────────────
export function StationPermissionsScreen() {
  const { width } = useWindowDimensions();
  const { themeObj, A, labId } = usePanelChrome();
  const heroInk = useWhiteHeroInk(A);
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
  // Hero özeti — PeopleArea ile AYNI filtre (kurye hariç, pasif hariç);
  // iki yerde farklı sayı göstermek güveni kırar.
  const eligible = techs.filter(t => (t.role ?? 'technician') !== 'courier' && t.is_active !== false);
  const noSkill = eligible.filter(t => (stationSkills.get(t.id)?.size ?? 0) === 0).length;

  return (
    // Hub başlığı ile hero arası 16px: hub zaten 8 (başlık altı) + 8 (kaydırma üstü)
    // veriyor → masaüstünde üst dolgu 0. Mobilde başlık çubuğu yok, 16 kalır.
    <View style={{ paddingTop: width >= 900 ? 0 : 16, paddingBottom: 16, gap: 14 }}>
      {/* ── Hero — "BEYAZ HERO" (core/ui/WhiteHero) ─────────────────
          Sayfa doğrudan filtre satırıyla açılıyordu; kaç kişinin kaç
          istasyonda yetkili olduğu ancak listeyi sayarak anlaşılıyordu. */}
      <WhiteHero
        kicker="Ekip · İstasyon Yetkileri"
        accent={A}
        title={<><Text style={{ color: heroInk.accentInk }}>{eligible.length}</Text> kişi</>}
        description={
          `${stations.length} istasyon` +
          (noSkill > 0 ? ` · ${noSkill} kişinin hiç yetkisi yok` : ' · herkesin en az bir yetkisi var')
        }
        stats={[
          { value: String(eligible.length),  label: 'Kişi' },
          { value: String(stations.length),  label: 'İstasyon' },
          { value: String(noSkill),          label: 'Yetkisiz' },
        ]}
      />

      <PeopleArea theme={themeObj} techs={techs} stations={stations} stationSkills={stationSkills} onToggleStation={onToggleStation} />
    </View>
  );
}
