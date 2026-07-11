// modules/orders/components/ReassignModal.tsx
// Manager: aktif stage'i farklı bir teknisyene devret.
// Skill-match listesi (user_stage_skills) — işyükü en azdan başlar.

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View, Text, ScrollView, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { fetchStationAuthorizedUserIds } from '../../../core/api/stationSkills';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';
import type { Stage } from '../stages';
import { STAGE_LABEL, STAGE_COLOR } from '../stages';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface Candidate {
  user_id:    string;
  full_name:  string;
  active_jobs: number;
  qualified:  boolean; // bu istasyona yetkili mi (user_station_skills)
}

interface Props {
  visible:     boolean;
  stageId:     string;
  stage:       Stage;
  /** Devredilen aşamanın gerçek istasyonu — yetki istasyon bazlı kontrol edilir. */
  stationId?:  string | null;
  labId:       string;
  currentOwnerId?: string | null;
  onClose:     () => void;
  onReassigned: () => void;
}

export function ReassignModal({ visible, stageId, stage, stationId, labId, currentOwnerId, onClose, onReassigned }: Props) {
  const [list, setList] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setLoading(true);
      // 1) Bu istasyona yetkili teknisyenler (user_station_skills).
      //    null = bilinmiyor (tablo yok / istasyon yok) → herkes yetkili sayılır (fallback).
      const authorizedIds = stationId ? await fetchStationAuthorizedUserIds(stationId) : null;
      const authSet = authorizedIds ? new Set(authorizedIds) : null;

      // 2) Lab'in TÜM aktif teknisyenleri (yetkili olmayanlar da listede — müdür override edebilir).
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, lab_id, is_active, user_type, role')
        .eq('user_type', 'lab')
        .eq('role', 'technician');
      const cands: Candidate[] = ((profs ?? []) as any[])
        .filter(p => p.is_active !== false)
        .filter(p => !labId || p.lab_id === labId || p.id === labId)
        .map(p => ({
          user_id: p.id as string,
          full_name: p.full_name as string,
          active_jobs: 0,
          qualified: authSet ? authSet.has(p.id) : true,
        }));

      // Workload — her kullanıcının aktif stage sayısı
      const ids = cands.map(c => c.user_id);
      if (ids.length > 0) {
        const { data: jobs } = await supabase
          .from('order_stages')
          .select('technician_id')
          .in('technician_id', ids)
          .eq('status', 'aktif');
        const counts: Record<string, number> = {};
        for (const j of (jobs ?? []) as any[]) {
          counts[j.technician_id] = (counts[j.technician_id] || 0) + 1;
        }
        for (const c of cands) c.active_jobs = counts[c.user_id] || 0;
      }
      // Önce yetkili (azından çok yüke), sonra yetkisiz.
      cands.sort((a, b) =>
        (a.qualified === b.qualified ? a.active_jobs - b.active_jobs : (a.qualified ? -1 : 1)),
      );
      setList(cands);
      setLoading(false);
    })();
  }, [visible, stationId, labId]);

  async function handleAssign(userId: string) {
    setSubmitting(true);
    const { error } = await supabase
      .from('order_stages')
      .update({ technician_id: userId, assigned_at: new Date().toISOString() })
      .eq('id', stageId);
    setSubmitting(false);
    if (error) { toast.error('Devir hatası: ' + error.message); return; }
    toast.success('Teknisyen güncellendi');
    onReassigned();
    onClose();
  }

  if (!visible) return null;
  const stageColor = STAGE_COLOR[stage];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation?.()}>
          <View style={s.header}>
            <View style={[s.iconWrap, { backgroundColor: stageColor + '22' }]}>
              <AppIcon name="users" size={20} color={stageColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Yeniden Ata</Text>
              <Text style={s.subtitle}>{STAGE_LABEL[stage]} aşaması</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <AppIcon name="x" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ padding: 40 }}>
            </View>
          ) : list.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>Bu labda aktif teknisyen yok.</Text>
              <Text style={s.emptyHint}>İş Akışları → Personel'den teknisyen/yetki ekleyin.</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {list.map((c, i) => {
                const isCurrent = c.user_id === currentOwnerId;
                // Yetkili → yetkisiz geçişinde ayraç başlığı
                const showDivider = !c.qualified && (i === 0 || list[i - 1].qualified);
                return (
                  <React.Fragment key={c.user_id}>
                    {showDivider && (
                      <Text style={s.sectionLabel}>Diğer teknisyenler · bu istasyona yetkisiz</Text>
                    )}
                    <TouchableOpacity
                      onPress={() => !isCurrent && handleAssign(c.user_id)}
                      activeOpacity={isCurrent ? 1 : 0.7}
                      disabled={isCurrent || submitting}
                      style={[s.row, isCurrent && s.rowCurrent, !c.qualified && { opacity: 0.85 }]}
                    >
                      <View style={[s.avatar, { backgroundColor: (c.qualified ? stageColor : '#94A3B8') + '22' }]}>
                        <Text style={[s.avatarText, { color: c.qualified ? stageColor : '#64748B' }]}>
                          {c.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.name} numberOfLines={1}>{c.full_name}</Text>
                        <Text style={s.workload}>{c.active_jobs} aktif iş</Text>
                      </View>
                      {isCurrent ? (
                        <View style={s.currentBadge}><Text style={s.currentText}>Mevcut</Text></View>
                      ) : !c.qualified ? (
                        <View style={s.unqBadge}><Text style={s.unqText}>yetkisiz</Text></View>
                      ) : (
                        <AppIcon name="chevron-right" size={16} color="#94A3B8" />
                      )}
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
      default: {},
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  subtitle: { fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 1 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },

  empty: { padding: 30, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#475569', textAlign: 'center' },
  emptyHint: { fontSize: 11, color: '#94A3B8', marginTop: 4 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
  rowCurrent: { backgroundColor: '#F8FAFC' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800' },
  name:   { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  workload: { fontSize: 11, color: '#64748B', marginTop: 1 },
  currentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#F1F5F9' },
  currentText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 12, marginBottom: 4, paddingHorizontal: 8 },
  unqBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#F1F5F9' },
  unqText: { fontSize: 9.5, fontWeight: '700', color: '#94A3B8' },
});

export default ReassignModal;
