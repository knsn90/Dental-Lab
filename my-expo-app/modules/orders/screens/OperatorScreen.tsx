// modules/orders/screens/OperatorScreen.tsx
// Operator (teknisyen) ekranı — sadece ATAMA YAPILMIŞ aktif işler.
// Her iş için: checklist + büyük "STAGE TAMAMLANDI" butonu.
// Cards diline uygun: beyaz pill kart, standart 0 8px 24px gölge.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';
import { useAuthStore } from '../../../core/store/authStore';
import { completeStage } from '../../station/api';
import { STAGE_CHECKLIST, STAGE_LABEL, STAGE_COLOR, type Stage } from '../stages';
import { WasteReportModal } from '../../stock/components/WasteReportModal';

interface AssignedJob {
  stage_id:        string;
  work_order_id:   string;
  order_number:    string;
  patient_name:    string | null;
  doctor_name:     string | null;
  delivery_date:   string | null;
  station_name:    string | null;
  assigned_at:     string | null;
}

function stationNameToStage(name: string | null): Stage {
  const upper = (name ?? '').toUpperCase();
  const all: Stage[] = ['TRIAGE','MANAGER_REVIEW','DESIGN','CAM','MILLING','SINTER','FINISH','QC'];
  return all.find(s => upper.includes(s)) ?? 'TRIAGE';
}

function humanIdle(ms: number): string {
  if (ms < 60_000) return Math.floor(ms / 1000) + 's';
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'd';
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}s ${m}d`;
  }
  return Math.floor(ms / 86_400_000) + 'g';
}

export function OperatorScreen() {
  const { profile } = useAuthStore();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [jobs, setJobs] = useState<AssignedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wasteOpen, setWasteOpen]   = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Idle ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Atama yapılmış aktif iş listesi
  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('order_stages')
      .select(`
        id, assigned_at,
        station:lab_stations(name),
        work_order:work_orders!inner(
          id, order_number, patient_name, delivery_date, doctor_id
        )
      `)
      .eq('technician_id', profile.id)
      .eq('status', 'aktif')
      .order('assigned_at', { ascending: true });

    const list: AssignedJob[] = ((data ?? []) as any[]).map(r => ({
      stage_id:      r.id,
      work_order_id: r.work_order?.id,
      order_number:  r.work_order?.order_number,
      patient_name:  r.work_order?.patient_name ?? null,
      doctor_name:   null,
      delivery_date: r.work_order?.delivery_date ?? null,
      station_name:  r.station?.name ?? null,
      assigned_at:   r.assigned_at,
    })).filter(j => j.work_order_id);

    setJobs(list);
    if (!selectedId && list[0]) setSelectedId(list[0].stage_id);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile?.id]);

  // Realtime — atanan stage değişimleri
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`operator-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_stages', filter: `technician_id=eq.${profile.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  const selected = useMemo(() => jobs.find(j => j.stage_id === selectedId) ?? null, [jobs, selectedId]);
  const stage    = selected ? stationNameToStage(selected.station_name) : null;
  const items    = stage ? STAGE_CHECKLIST[stage] : [];
  const allChecked = items.length === 0 || items.every(i => checks[i.key]);
  const stageColor = stage ? STAGE_COLOR[stage] : '#94A3B8';

  // Stage değişince checks reset
  useEffect(() => { setChecks({}); }, [selectedId]);

  async function handleComplete() {
    if (!selected || !stage) return;
    if (!allChecked) {
      toast.error('Tüm kontrol maddelerini işaretle');
      return;
    }
    setSubmitting(true);
    const { error } = await completeStage(selected.stage_id);
    setSubmitting(false);
    if (error) { toast.error('Tamamlanamadı: ' + error.message); return; }

    // checklist_log — her item için (audit)
    if (profile) {
      const rows = items.map(i => ({
        work_order_id: selected.work_order_id,
        stage,
        item_key:      i.key,
        checked:       checks[i.key],
        checked_by:    profile.id,
        checked_at:    new Date().toISOString(),
      }));
      if (rows.length > 0) {
        await supabase.from('checklist_log').upsert(rows, { onConflict: 'work_order_id,stage,item_key' });
      }
    }
    toast.success('Aşama tamamlandı, manager onay bekliyor');
    setSelectedId(null);
    load();
  }

  if (!profile) {
    return <SafeAreaView style={s.center}><Text>Giriş gerekli</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={[s.container, isWide && { flexDirection: 'row', gap: 16 }]}>
        {/* SOL — Atanmış işler */}
        <View style={[s.listCard, isWide && { width: 340, flexShrink: 0 }]}>
          <View style={s.listHeader}>
            <Text style={s.listTitle}>İşlerim</Text>
            <View style={s.countBadge}><Text style={s.countText}>{jobs.length}</Text></View>
          </View>
          {loading ? (
            <View style={{ padding: 30 }}><ActivityIndicator size="small" color="#7C3AED" /></View>
          ) : jobs.length === 0 ? (
            <View style={s.empty}>
              <AppIcon name="check" size={28} color="#CBD5E1" />
              <Text style={s.emptyText}>Aktif işin yok</Text>
              <Text style={s.emptyHint}>Yeni atama geldiğinde burada görünür.</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: isWide ? undefined : 280 }} showsVerticalScrollIndicator={false}>
              {jobs.map(j => {
                const stg = stationNameToStage(j.station_name);
                const color = STAGE_COLOR[stg];
                const isActive = j.stage_id === selectedId;
                const idleMs = j.assigned_at ? now - new Date(j.assigned_at).getTime() : 0;
                return (
                  <TouchableOpacity
                    key={j.stage_id}
                    onPress={() => setSelectedId(j.stage_id)}
                    activeOpacity={0.7}
                    style={[s.jobRow, isActive && { borderColor: color, backgroundColor: color + '10' }]}
                  >
                    <View style={[s.stageDot, { backgroundColor: color }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.jobLine1} numberOfLines={1}>
                        {STAGE_LABEL[stg]} · #{j.order_number}
                      </Text>
                      <Text style={s.jobLine2} numberOfLines={1}>
                        {j.patient_name ?? '—'} · {humanIdle(idleMs)} idle
                      </Text>
                    </View>
                    <AppIcon name="chevron-right" size={14} color="#CBD5E1" />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* SAĞ — Detay + checklist + büyük buton */}
        <View style={[s.detailCard, !isWide && { marginTop: 12 }]}>
          {selected && stage ? (
            <>
              {/* Header */}
              <View style={s.detailHeader}>
                <View style={[s.stageBig, { backgroundColor: stageColor }]}>
                  <Text style={s.stageBigText}>{STAGE_LABEL[stage]}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.detailTitle} numberOfLines={1}>{selected.patient_name ?? '—'}</Text>
                  <Text style={s.detailMeta}>
                    #{selected.order_number}
                    {selected.delivery_date ? `  ·  Teslim: ${selected.delivery_date}` : ''}
                  </Text>
                </View>
              </View>

              {/* Checklist */}
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {items.length === 0 ? (
                  <Text style={s.emptyText}>Bu aşama için checklist yok</Text>
                ) : (
                  <View style={{ gap: 6, marginVertical: 14 }}>
                    {items.map(it => {
                      const checked = !!checks[it.key];
                      return (
                        <TouchableOpacity
                          key={it.key}
                          onPress={() => setChecks(c => ({ ...c, [it.key]: !c[it.key] }))}
                          activeOpacity={0.7}
                          style={[s.checkItem, checked && { borderColor: stageColor, backgroundColor: stageColor + '14' }]}
                        >
                          <View style={[s.checkbox, checked && { backgroundColor: stageColor, borderColor: stageColor }]}>
                            {checked && <AppIcon name="check" size={12} color="#FFFFFF" strokeWidth={3} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.checkLabel, checked && { color: '#0F172A' }]}>{it.label}</Text>
                            {it.hint && <Text style={s.checkHint}>{it.hint}</Text>}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Action row — Complete + Fire Bildir */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={handleComplete}
                  disabled={!allChecked || submitting}
                  style={[s.bigBtn, { flex: 1, backgroundColor: stageColor }, (!allChecked || submitting) && { opacity: 0.5 }]}
                  activeOpacity={0.85}
                >
                  {submitting
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <>
                        <AppIcon name="check" size={18} color="#FFFFFF" strokeWidth={3} />
                        <Text style={s.bigBtnText}>{STAGE_LABEL[stage].toUpperCase()} TAMAMLANDI</Text>
                      </>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setWasteOpen(true)}
                  style={{
                    paddingHorizontal: 14,
                    height: 52,
                    borderRadius: 12,
                    backgroundColor: '#FEE2E2',
                    borderWidth: 1, borderColor: '#FCA5A5',
                    alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'row', gap: 6,
                  }}
                  activeOpacity={0.85}
                >
                  <AppIcon name="alert-triangle" size={16} color="#DC2626" />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626' }}>Fire Bildir</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={s.empty}>
              <AppIcon name="clipboard-list" size={28} color="#CBD5E1" />
              <Text style={s.emptyText}>Bir iş seç</Text>
              <Text style={s.emptyHint}>Soldan aktif işlerinden birini seçerek devam et.</Text>
            </View>
          )}
        </View>
      </View>

      {/* Fire bildirim modalı — order ile ilişkili */}
      {profile && selected && (
        <WasteReportModal
          visible={wasteOpen}
          labId={(profile as any).lab_id ?? profile.id}
          userId={profile.id}
          orderId={selected.work_order_id}
          onClose={() => setWasteOpen(false)}
          onSaved={() => { /* operator listesi otomatik canlıdır */ }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#F1F5F9' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  container: { flex: 1, padding: 20 },

  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    ...Platform.select({ web: { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any, default: {} }),
  },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  listTitle:  { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  countBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  countText:  { fontSize: 11, fontWeight: '700', color: '#64748B' },

  empty: { padding: 30, alignItems: 'center', gap: 6 },
  emptyText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  emptyHint: { fontSize: 11, color: '#94A3B8', textAlign: 'center' },

  jobRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 12, borderWidth: 1, borderColor: 'transparent',
    marginBottom: 4,
  },
  stageDot:  { width: 8, height: 8, borderRadius: 4 },
  jobLine1:  { fontSize: 13, fontWeight: '700', color: '#0F172A', letterSpacing: -0.1 },
  jobLine2:  { fontSize: 11, color: '#64748B', marginTop: 2 },

  detailCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    ...Platform.select({ web: { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any, default: {} }),
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  stageBig: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  stageBigText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.6 },
  detailTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  detailMeta:  { fontSize: 11, color: '#64748B', marginTop: 2 },

  checkItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
  checkHint:  { fontSize: 10, fontWeight: '500', color: '#94A3B8', marginTop: 2 },

  bigBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 14,
    marginTop: 8,
  },
  bigBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.6 },
});

export default OperatorScreen;
