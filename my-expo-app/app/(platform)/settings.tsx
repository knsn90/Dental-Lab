import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { ToggleLeft, ToggleRight, AlertTriangle } from '../../core/ui/icons';
import { getSettings, setSetting, type PlatformSettings } from '../../modules/platform/api';
import { C, PageHeader, SectionLabel, hexA } from '../../modules/platform/ui';
import { autoT } from '../../core/i18n/autoTranslate';

type Field = { key: string; label: string; type: 'text' | 'number' | 'bool'; hint?: string; danger?: boolean };
const GROUPS: { title: string; fields: Field[] }[] = [
  { title: 'Marka', fields: [
    { key: 'app_name', label: 'Uygulama adı', type: 'text' },
    { key: 'support_email', label: 'Destek e-postası', type: 'text' },
    { key: 'default_language', label: 'Varsayılan dil (tr/en/de/fa)', type: 'text' },
  ]},
  { title: 'Kayıt & deneme', fields: [
    { key: 'registration_open', label: 'Kayıt açık', type: 'bool', hint: 'Kapalıysa yeni kayıt alınmaz' },
    { key: 'default_trial_days', label: 'Varsayılan deneme süresi (gün)', type: 'number' },
  ]},
  { title: 'Güvenlik politikası', fields: [
    { key: 'password_min_length', label: 'Min. şifre uzunluğu', type: 'number' },
    { key: 'mfa_required', label: 'MFA zorunlu', type: 'bool' },
    { key: 'data_retention_days', label: 'Veri saklama süresi (gün)', type: 'number' },
  ]},
  { title: 'Bakım modu', fields: [
    { key: 'maintenance_mode', label: 'Bakım modu açık', type: 'bool', danger: true, hint: 'Açıkken platform admin dışındaki kullanıcılar bakım ekranı görür' },
    { key: 'maintenance_message', label: 'Bakım mesajı', type: 'text' },
  ]},
];

export default function PlatformSettings() {
  const [s, setS] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => { try { setS(await getSettings()); setDraft({}); } catch { setS({}); } }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (key: string, value: any) => { setBusy(key); try { await setSetting(key, value); await load(); } finally { setBusy(null); } };
  const saveText = (f: Field) => {
    const raw = draft[f.key]; if (raw == null) return;
    save(f.key, f.type === 'number' ? (parseInt(raw, 10) || 0) : raw);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 820, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Sistem" title="Ayarlar"
          description="Platform genelinde marka, kayıt, güvenlik politikası ve bakım modu." />

        {!s ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          GROUPS.map((g) => {
            const maintOn = g.title === 'Bakım modu' && !!s.maintenance_mode;
            return (
              <View key={g.title} style={{ marginBottom: 24 }}>
                <SectionLabel tone={maintOn ? C.red : undefined}>{autoT(g.title)}</SectionLabel>
                <View style={{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: maintOn ? hexA(C.red, 0.4) : C.line, overflow: 'hidden' }}>
                  {g.fields.map((f, i) => {
                    const val = s[f.key];
                    return (
                      <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{autoT(f.label)}</Text>
                          {f.hint ? <Text style={{ color: f.danger ? C.amber : C.ink3, fontSize: 12, marginTop: 2 }}>{autoT(f.hint)}</Text> : null}
                        </View>
                        {f.type === 'bool' ? (
                          <Pressable disabled={busy === f.key} onPress={() => save(f.key, !val)}>
                            {val ? <ToggleRight size={28} color={f.danger ? C.red : C.green} strokeWidth={1.8} /> : <ToggleLeft size={28} color={C.ink3} strokeWidth={1.8} />}
                          </Pressable>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TextInput
                              value={draft[f.key] ?? String(val ?? '')}
                              onChangeText={(t) => setDraft((d) => ({ ...d, [f.key]: t }))}
                              keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                              style={{ width: f.type === 'number' ? 90 : 220, height: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.cardHover, borderWidth: 1, borderColor: draft[f.key] != null ? C.accent : C.line, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
                            {draft[f.key] != null && (
                              <Pressable disabled={busy === f.key} onPress={() => saveText(f)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                                <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Kaydet</Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
                {maintOn ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <AlertTriangle size={14} color={C.red} strokeWidth={2} />
                    <Text style={{ color: C.red, fontSize: 12.5, fontWeight: '600' }}>Bakım modu AÇIK — platform admin dışındaki kullanıcılar uygulamaya giremiyor.</Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
