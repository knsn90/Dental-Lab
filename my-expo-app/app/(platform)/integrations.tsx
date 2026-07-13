import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Plug, ToggleLeft, ToggleRight } from 'lucide-react-native';
import { listIntegrations, setIntegration, type Integration } from '../../modules/platform/api';
import { C, PageHeader, Panel, Chip, IconChip } from '../../modules/platform/ui';

const stTone = (s: string) => (s === 'ok' ? C.green : s === 'error' ? C.red : C.amber);
const CYCLE: Record<string, string> = { ok: 'error', error: 'unknown', unknown: 'ok' };

export default function PlatformIntegrations() {
  const [rows, setRows] = useState<Integration[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => { try { setRows(await listIntegrations()); } catch { setRows([]); } }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (key: string, fn: () => Promise<any>) => { setBusy(key); try { await fn(); await load(); } finally { setBusy(null); } };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Sistem" title="Entegrasyonlar"
          description="Platform sağlayıcıları. Durum şimdilik manuel; canlı health-check webhook'ları sonraki adımda bağlanır." />

        {rows === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <Panel padding={0}>
            {rows.map((it, i) => (
              <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                <IconChip icon={Plug} tone={it.enabled ? C.accent : C.ink3} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 }}>{it.name}</Text>
                  <Text style={{ color: C.ink3, fontSize: 12 }}>{it.category}{it.note ? ` · ${it.note}` : ''}</Text>
                </View>
                <Pressable disabled={busy === it.key} onPress={() => act(it.key, () => setIntegration(it.key, it.enabled, CYCLE[it.status] ?? 'unknown', it.note))}>
                  <Chip tone={stTone(it.status)} dot>{it.status.toUpperCase()}</Chip>
                </Pressable>
                <Pressable disabled={busy === it.key} onPress={() => act(it.key, () => setIntegration(it.key, !it.enabled, it.status, it.note))}
                  style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}>
                  {it.enabled ? <ToggleRight size={28} color={C.green} strokeWidth={1.8} /> : <ToggleLeft size={28} color={C.ink3} strokeWidth={1.8} />}
                </Pressable>
              </View>
            ))}
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}
