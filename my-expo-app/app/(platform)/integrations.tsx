import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Plug, ToggleLeft, ToggleRight } from 'lucide-react-native';
import { listIntegrations, setIntegration, type Integration } from '../../modules/platform/api';
import { C, FONT, PlatformNav } from '../../modules/platform/ui';

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
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="integrations" />
        <Text style={{ fontFamily: FONT, fontSize: 26, fontWeight: '300', letterSpacing: -0.8, color: C.ink, marginBottom: 4 }}>Entegrasyonlar</Text>
        <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 20 }}>Platform sağlayıcıları. Durum şimdilik manuel; canlı health-check webhook'ları sonraki adımda bağlanır.</Text>

        {rows === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
            {rows.map((it, i) => (
              <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                <Plug size={16} color={C.ink3} strokeWidth={1.8} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{it.name}</Text>
                  <Text style={{ color: C.ink3, fontSize: 12 }}>{it.category}{it.note ? ` · ${it.note}` : ''}</Text>
                </View>
                <Pressable disabled={busy === it.key} onPress={() => act(it.key, () => setIntegration(it.key, it.enabled, CYCLE[it.status] ?? 'unknown', it.note))}
                  style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: stTone(it.status) + '22', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: stTone(it.status), fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{it.status}</Text>
                </Pressable>
                <Pressable disabled={busy === it.key} onPress={() => act(it.key, () => setIntegration(it.key, !it.enabled, it.status, it.note))}>
                  {it.enabled ? <ToggleRight size={26} color={C.green} strokeWidth={1.8} /> : <ToggleLeft size={26} color={C.ink3} strokeWidth={1.8} />}
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
