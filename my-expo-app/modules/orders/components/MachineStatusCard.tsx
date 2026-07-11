import { localeTag } from '../../../core/i18n';
// modules/orders/components/MachineStatusCard.tsx
// Workstation içinde — istasyona bağlı makine varsa canlı durumu gösterir.
// machine_live_status view'inden okur, realtime bağlanır.

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Cog, Activity, AlertOctagon, Wifi, WifiOff, Play, Square, Hammer } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useStationTheme, hexA, type StationPalette } from '../../../core/theme/stationPalette';
import { formatDuration } from '../stations/stageStates';
import { toast } from '../../../core/ui/Toast';
import { getMachineAdapter, isAdapterAvailable } from '../machines/registry';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

interface MachineLive {
  equipment_id:                  string;
  station_id:                    string | null;
  name:                          string;
  brand:                         string | null;
  model:                         string | null;
  category:                      string | null;
  integration_kind:              string | null;
  live_status:                   string;
  last_heartbeat_at:             string | null;
  current_stage_id:              string | null;
  current_job_started_at:        string | null;
  current_job_estimate_seconds:  number | null;
  current_runtime_seconds:       number | null;
  estimated_completion_at:       string | null;
  heartbeat_freshness:           'never' | 'fresh' | 'stale' | 'offline';
  last_error_message:            string | null;
}

function makeStatusMeta(p: StationPalette): Record<string, { color: string; bg: string; label: string; icon: any }> {
  return {
    idle:        { color: '#059669', bg: '#D1FAE5', label: 'Boşta',        icon: Cog },
    running:     { color: '#3B82F6', bg: '#EAF2FA', label: 'Çalışıyor',    icon: Hammer },
    error:       { color: '#DC2626', bg: '#FEE2E2', label: 'Hata',         icon: AlertOctagon },
    maintenance: { color: '#B5752A', bg: '#FEF3C7', label: 'Bakımda',      icon: Cog },
    offline:     { color: p.ink400,  bg: p.ink50,   label: 'Bağlantı Yok', icon: WifiOff },
    unknown:     { color: p.ink400,  bg: p.ink50,   label: 'Bilinmiyor',   icon: WifiOff },
  };
}

export function MachineStatusCard({
  stationId, currentStageId, accentColor,
}: {
  stationId:       string;
  currentStageId?: string | null;
  accentColor?:    string;
}) {
  const P = useStationTheme();
  const accent = accentColor ?? P.accent;
  const [machine, setMachine] = useState<MachineLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Saniye sayacı (canlı runtime gösterimi için)
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('machine_live_status')
        .select('*')
        .eq('station_id', stationId)
        .maybeSingle();
      if (!alive) return;
      setMachine(data as MachineLive | null);
      setLoading(false);
    })();

    // Realtime — equipment update'lerinde yeniden çek
    const ch = supabase
      .channel(`machine-${stationId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'equipment', filter: `station_id=eq.${stationId}` },
        async () => {
          const { data } = await supabase
            .from('machine_live_status')
            .select('*')
            .eq('station_id', stationId)
            .maybeSingle();
          if (alive) setMachine(data as MachineLive | null);
        },
      )
      .subscribe();

    return () => { alive = false; supabase.removeChannel(ch); };
  }, [stationId]);

  if (loading) {
    return (
      <View style={{ borderWidth: 1, borderColor: P.ink100, borderRadius: 14, backgroundColor: P.surface, padding: 18, alignItems: 'center' }}>
      </View>
    );
  }
  if (!machine) return null;  // Bu istasyon için kayıtlı entegre makine yok

  const statusMeta = makeStatusMeta(P);
  const meta = statusMeta[machine.live_status] ?? statusMeta.unknown;
  const Icon = meta.icon;
  const isFresh = machine.heartbeat_freshness === 'fresh';
  const adapterReady = isAdapterAvailable(machine.integration_kind);

  // Canlı runtime — current_job_started_at + tick
  const liveRuntime = machine.current_job_started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(machine.current_job_started_at).getTime()) / 1000))
    : null;
  const estimate = machine.current_job_estimate_seconds ?? null;
  const progress = liveRuntime != null && estimate != null && estimate > 0
    ? Math.min(100, Math.round((liveRuntime / estimate) * 100))
    : null;

  async function handleStartJob() {
    if (!machine || !currentStageId || !adapterReady || busy) return;
    setBusy(true);
    try {
      const adapter = getMachineAdapter(machine.integration_kind, {
        equipmentId:    machine.equipment_id,
        endpointUrl:    null,
        credentialsRef: null,
      });
      if (!adapter) {
        toast.error('Adapter bulunamadı');
        return;
      }
      const res = await adapter.startJob({
        stageId:         currentStageId,
        estimateSeconds: 1800,
        options:         { source: 'workstation' },
      });
      if (!res.ok) {
        toast.error('Makine işi başlatılamadı: ' + (res.error ?? ''));
        return;
      }
      toast.success(`İş ${machine.name}'e gönderildi`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteJob() {
    if (!machine || busy) return;
    setBusy(true);
    try {
      const adapter = getMachineAdapter(machine.integration_kind, { equipmentId: machine.equipment_id });
      if (!adapter || machine.integration_kind !== 'mock') return;
      // Mock adapter expose ediyor — gerçek adapterlerde otomatik gelir
      const mockAdapter = adapter as any;
      const res = await mockAdapter.completeJob?.();
      if (res?.ok) toast.success('Mock: makine işi tamamlandı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{
      borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
      backgroundColor: P.surface, overflow: 'hidden',
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 11,
        borderBottomWidth: 1, borderBottomColor: P.ink100,
        backgroundColor: P.surfaceAlt,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            width: 22, height: 22, borderRadius: 7,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hexA(meta.color, 0.14),
          }}>
            <Icon size={12} color={meta.color} strokeWidth={1.8} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink900, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Makine Durumu
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {isFresh ? <Wifi size={11} color={P.success} strokeWidth={2} /> : <WifiOff size={11} color={P.ink400} strokeWidth={2} />}
          <Text style={{ fontSize: 9.5, fontWeight: '700', color: isFresh ? P.success : P.ink400, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {machine.heartbeat_freshness === 'fresh'   ? 'CANLI'
              : machine.heartbeat_freshness === 'stale' ? 'GECİKMİŞ'
              : machine.heartbeat_freshness === 'offline' ? 'OFFLINE'
              : 'PASİF'}
          </Text>
        </View>
      </View>

      {/* Body */}
      <View style={{ padding: 16, gap: 12 }}>
        {/* Machine name + status pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: P.ink900 }} numberOfLines={1}>
              {machine.name}
            </Text>
            <Text style={{ fontSize: 11, color: P.ink500, marginTop: 1 }} numberOfLines={1}>
              {[machine.brand, machine.model].filter(Boolean).join(' · ') || machine.category}
              {machine.integration_kind && (
                <Text style={{ color: P.ink400 }}>{` · ${machine.integration_kind}`}</Text>
              )}
            </Text>
          </View>
          <View style={{
            paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
            backgroundColor: meta.bg,
            borderWidth: 1, borderColor: hexA(meta.color, 0.30),
          }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: meta.color, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {meta.label}
            </Text>
          </View>
        </View>

        {/* Running progress */}
        {machine.live_status === 'running' && liveRuntime !== null && (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, color: P.ink500 }}>
                Geçen: <Text style={{ color: P.ink900, fontWeight: '700' }}>{formatDuration(liveRuntime + tick * 0)}</Text>
              </Text>
              {estimate && (
                <Text style={{ fontSize: 11, color: P.ink500 }}>
                  Tahmini: <Text style={{ color: P.ink900, fontWeight: '700' }}>{formatDuration(estimate)}</Text>
                </Text>
              )}
            </View>
            {progress !== null && (
              <View style={{ height: 6, borderRadius: 999, backgroundColor: P.ink100, overflow: 'hidden' }}>
                <View style={{
                  width: `${progress}%`, height: '100%',
                  backgroundColor: meta.color, borderRadius: 999,
                }} />
              </View>
            )}
          </View>
        )}

        {/* Error banner */}
        {machine.live_status === 'error' && machine.last_error_message && (
          <View style={{
            padding: 10, borderRadius: 10,
            backgroundColor: hexA('#DC2626', 0.06),
            borderWidth: 1, borderColor: hexA('#DC2626', 0.25),
            flexDirection: 'row', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertOctagon size={12} color="#DC2626" strokeWidth={2} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 11.5, color: '#7F1D1D', lineHeight: 16 }}>
              {machine.last_error_message}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        {currentStageId && machine.live_status === 'idle' && adapterReady && (
          <Pressable
            onPress={handleStartJob}
            disabled={busy}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
              paddingVertical: 10, borderRadius: 10,
              backgroundColor: hexA(accent, 0.10),
              borderWidth: 1, borderColor: hexA(accent, 0.28),
              opacity: busy ? 0.5 : 1,
              ...(Platform.OS === 'web' ? { cursor: busy ? 'wait' : 'pointer' } as any : {}),
            }}
          >
            <Play size={11} color={accent} strokeWidth={2.2} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: accent, letterSpacing: 0.3 }}>
              İşi Makineye Gönder
            </Text>
          </Pressable>
        )}

        {/* Mock adapter helper — gerçek makinede yok */}
        {machine.live_status === 'running' && machine.integration_kind === 'mock' && (
          <Pressable
            onPress={handleCompleteJob}
            disabled={busy}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
              paddingVertical: 9, borderRadius: 10,
              backgroundColor: P.ink50,
              borderWidth: 1, borderColor: P.ink100,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Square size={11} color={P.ink500} strokeWidth={2} />
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: P.ink500 }}>
              Mock: İşi Tamamla (sim.)
            </Text>
          </Pressable>
        )}

        {/* Heartbeat info */}
        {machine.last_heartbeat_at && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 4 }}>
            <Activity size={9} color={P.ink400} strokeWidth={1.8} />
            <Text style={{ fontSize: 10, color: P.ink400 }}>
              Son sinyal: {new Date(machine.last_heartbeat_at).toLocaleTimeString(localeTag())}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
