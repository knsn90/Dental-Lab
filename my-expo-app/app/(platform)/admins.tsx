import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { UserPlus, Trash2, ShieldCheck } from '../../core/ui/icons';
import { listPlatformAdmins, addPlatformAdmin, removePlatformAdmin, type PlatformAdmin } from '../../modules/platform/api';
import { C, PageHeader, Panel, SectionLabel, IconChip, hexA } from '../../modules/platform/ui';

export default function PlatformAdmins() {
  const [admins, setAdmins] = useState<PlatformAdmin[] | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => { try { setAdmins(await listPlatformAdmins()); } catch { setAdmins([]); } }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setBusy(true); setErr(null);
    try { await addPlatformAdmin(email.trim(), note.trim() || undefined); setEmail(''); setNote(''); await load(); }
    catch (e: any) { setErr(e?.message?.includes('user not found') ? 'Bu e-postayla kayıtlı kullanıcı yok (önce hesap oluşturmalı).' : (e?.message ?? 'Eklenemedi')); }
    finally { setBusy(false); }
  };
  const remove = async (u: PlatformAdmin) => {
    setBusy(true); setErr(null);
    try { await removePlatformAdmin(u.user_id); await load(); }
    catch (e: any) { setErr(e?.message?.includes('last platform admin') ? 'Son platform yöneticisi çıkarılamaz.' : (e?.message ?? 'Çıkarılamadı')); }
    finally { setBusy(false); }
  };

  const input: any = { height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.cardHover, borderWidth: 1, borderColor: C.line, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Sistem" title="Yöneticiler"
          description="Platformun tamamını yönetebilen hesaplar. Yalnız kayıtlı bir kullanıcının e-postasıyla eklenebilir." />

        {/* Add */}
        <SectionLabel>Yönetici ekle</SectionLabel>
        <Panel style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <TextInput value={email} onChangeText={setEmail} placeholder="e-posta" placeholderTextColor={C.ink3} autoCapitalize="none"
              style={{ ...input, flex: 2, minWidth: 200 }} />
            <TextInput value={note} onChangeText={setNote} placeholder="not (opsiyonel)" placeholderTextColor={C.ink3}
              style={{ ...input, flex: 1, minWidth: 140 }} />
            <Pressable onPress={add} disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <UserPlus size={16} color="#fff" strokeWidth={2} />}
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Ekle</Text>
            </Pressable>
          </View>
          {err ? <Text style={{ color: C.red, fontSize: 12.5, marginTop: 10, fontWeight: '600' }}>{err}</Text> : null}
        </Panel>

        {/* List */}
        {admins === null ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <Panel padding={0}>
            {admins.map((u, i) => (
              <View key={u.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                <IconChip icon={ShieldCheck} tone={C.accent} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 }}>{u.name || '—'}</Text>
                  <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{u.email || '—'}{u.note ? `  ·  ${u.note}` : ''}</Text>
                </View>
                <Pressable onPress={() => remove(u)} disabled={busy || admins.length <= 1}
                  style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(C.red, 0.1), opacity: admins.length <= 1 ? 0.4 : 1, ...(Platform.OS === 'web' ? { cursor: admins.length <= 1 ? 'default' : 'pointer' } as any : {}) }}>
                  <Trash2 size={16} color={C.red} strokeWidth={1.8} />
                </Pressable>
              </View>
            ))}
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}
