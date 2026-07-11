// modules/settings/sections/SkillsSection.tsx
// Manager: lab kullanıcılarına stage yetkilerini (skill) atar.
// Her satır = bir kullanıcı, satırda 7 stage chip → toggle on/off
// user_stage_skills tablosu — AUTO_ASSIGN bu listeden seçer.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';
import { useAuthStore } from '../../../core/store/authStore';
import { STAGE_LABEL, STAGE_COLOR, type Stage } from '../../orders/stages';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

const SKILL_STAGES: Stage[] = ['TRIAGE', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC'];

interface UserRow {
  id:        string;
  full_name: string;
  role:      string | null;
  skills:    Set<Stage>;
}

export function SkillsSection() {
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? profile?.id ?? '';
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  const [rows, setRows]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  async function load() {
    if (!labId) return;
    setLoading(true);

    // 1. Lab kullanıcıları (manager + technician)
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('user_type', 'lab')
      .or(`lab_id.eq.${labId},id.eq.${labId}`)
      .eq('is_active', true)
      .order('full_name');

    // 2. Mevcut yetkiler
    const ids = ((users ?? []) as any[]).map(u => u.id);
    const skillsByUser = new Map<string, Set<Stage>>();
    if (ids.length > 0) {
      const { data: skills } = await supabase
        .from('user_stage_skills')
        .select('user_id, stage')
        .in('user_id', ids);
      for (const s of (skills ?? []) as any[]) {
        if (!skillsByUser.has(s.user_id)) skillsByUser.set(s.user_id, new Set());
        skillsByUser.get(s.user_id)!.add(s.stage as Stage);
      }
    }

    setRows(((users ?? []) as any[]).map(u => ({
      id:        u.id,
      full_name: u.full_name ?? '—',
      role:      u.role,
      skills:    skillsByUser.get(u.id) ?? new Set(),
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, [labId]);

  async function toggleSkill(userId: string, stage: Stage, currentlyHas: boolean) {
    const key = `${userId}:${stage}`;
    setPending(p => new Set(p).add(key));

    if (currentlyHas) {
      const { error } = await supabase
        .from('user_stage_skills')
        .delete()
        .eq('user_id', userId)
        .eq('stage', stage);
      if (error) toast.error('Silme: ' + error.message);
    } else {
      const { error } = await supabase
        .from('user_stage_skills')
        .insert({ user_id: userId, stage, lab_id: labId });
      if (error) toast.error('Ekleme: ' + error.message);
    }

    // Optimistic local update
    setRows(prev => prev.map(r => {
      if (r.id !== userId) return r;
      const nx = new Set(r.skills);
      if (currentlyHas) nx.delete(stage);
      else              nx.add(stage);
      return { ...r, skills: nx };
    }));
    setPending(p => {
      const nx = new Set(p);
      nx.delete(key);
      return nx;
    });
  }

  const router = useRouter();
  const segments = useSegments() as string[];
  const group = segments?.[0] && segments[0].startsWith('(') ? segments[0] : '(lab)';

  return (
    <ScrollView style={[s.root, { backgroundColor: T.bg }]} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Text style={[s.title, { color: T.ink }]}>Kullanıcı Yetkileri</Text>
        <Text style={[s.subtitle, { color: T.ink2 }]}>
          Teknisyen yetkinlikleri artık tek yerden — Ekip → Personel'den yönetiliyor
        </Text>
      </View>

      <View style={[s.card, { backgroundColor: T.card, borderColor: T.hairline, gap: 12, alignItems: 'flex-start' }]}>
        <View style={s.avatar}><AppIcon name="users" size={18} color="#FFFFFF" /></View>
        <Text style={[s.userName, { color: T.ink, fontSize: 15 }]}>Yetkinlikler Ekip bölümüne taşındı</Text>
        <Text style={[s.userRole, { color: T.ink2, fontSize: 12.5, lineHeight: 18 }]}>
          Her teknisyenin hangi istasyonlarda çalışabileceği, otomatik atama ve "Yeniden Ata" ile birebir aynı
          kaynağı kullanır. Karışıklığı önlemek için yetkinlikler tek yerden — Ekip → Personel — yönetilir.
        </Text>
        <TouchableOpacity
          onPress={() => router.push(`/${group}/ik-depo?tab=people` as any)}
          activeOpacity={0.8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: '#7C3AED' }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>Ekip → Personel'i aç</Text>
          <AppIcon name="chevron-right" size={15} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1F5F9' },
  content: { padding: 16, gap: 10 },

  header: { paddingHorizontal: 4, marginBottom: 6 },
  title:    { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.4 },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 4 },

  empty: { padding: 30, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#475569' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    gap: 12,
    ...Platform.select({ web: { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any, default: {} }),
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800', color: '#7C3AED' },
  userName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  userRole: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  skillCount: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  skillCountText: { fontSize: 11, fontWeight: '700', color: '#64748B' },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  chipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
});

export default SkillsSection;
