// modules/settings/sections/SkillsSection.tsx
// Manager: lab kullanıcılarına stage yetkilerini (skill) atar.
// Her satır = bir kullanıcı, satırda 7 stage chip → toggle on/off
// user_stage_skills tablosu — AUTO_ASSIGN bu listeden seçer.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';
import { useAuthStore } from '../../../core/store/authStore';
import { STAGE_LABEL, STAGE_COLOR, type Stage } from '../../orders/stages';

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

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Text style={s.title}>Kullanıcı Yetkileri</Text>
        <Text style={s.subtitle}>
          Hangi kullanıcı hangi aşamayı yapabilir — AUTO_ASSIGN bu yetkiye göre dağıtır
        </Text>
      </View>

      {loading ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#7C3AED" />
        </View>
      ) : rows.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>Bu lab'a kayıtlı kullanıcı yok.</Text>
        </View>
      ) : rows.map(u => (
        <View key={u.id} style={s.card}>
          <View style={s.userRow}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>
                {u.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.userName} numberOfLines={1}>{u.full_name}</Text>
              <Text style={s.userRole}>
                {u.role === 'manager' ? 'Mesul Müdür' : u.role === 'technician' ? 'Teknisyen' : 'Lab'}
              </Text>
            </View>
            <View style={s.skillCount}>
              <Text style={s.skillCountText}>{u.skills.size}/{SKILL_STAGES.length}</Text>
            </View>
          </View>

          <View style={s.chipsRow}>
            {SKILL_STAGES.map(st => {
              const has = u.skills.has(st);
              const busy = pending.has(`${u.id}:${st}`);
              const color = STAGE_COLOR[st];
              return (
                <TouchableOpacity
                  key={st}
                  onPress={() => !busy && toggleSkill(u.id, st, has)}
                  disabled={busy}
                  style={[
                    s.chip,
                    has && { backgroundColor: color, borderColor: color },
                    busy && { opacity: 0.5 },
                  ]}
                  activeOpacity={0.7}
                >
                  {has && <AppIcon name="check" size={11} color="#FFFFFF" strokeWidth={3} />}
                  <Text style={[s.chipText, has && { color: '#FFFFFF' }]}>
                    {STAGE_LABEL[st]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
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
