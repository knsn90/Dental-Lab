import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { UserPlus, Trash2, ShieldCheck } from 'lucide-react-native';
import { listPlatformAdmins, addPlatformAdmin, removePlatformAdmin, type PlatformAdmin } from '../../modules/platform/api';
import { C, FONT, PlatformNav } from '../../modules/platform/ui';

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

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="admins" />
        <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 18 }}>Platformun tamamını yönetebilen hesaplar. Yalnız kayıtlı bir kullanıcının e-postasıyla eklenebilir.</Text>

        {/* Add */}
        <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 18, marginBottom: 22 }}>
          <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Yönetici ekle</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <TextInput value={email} onChangeText={setEmail} placeholder="e-posta" placeholderTextColor={C.ink3} autoCapitalize="none"
              style={{ flex: 2, minWidth: 200, height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.line, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
            <TextInput value={note} onChangeText={setNote} placeholder="not (opsiyonel)" placeholderTextColor={C.ink3}
              style={{ flex: 1, minWidth: 140, height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.line, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
            <Pressable onPress={add} disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <UserPlus size={16} color="#fff" strokeWidth={2} />}
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Ekle</Text>
            </Pressable>
          </View>
          {err ? <Text style={{ color: C.red, fontSize: 12.5, marginTop: 10 }}>{err}</Text> : null}
        </View>

        {/* List */}
        {admins === null ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
            {admins.map((u, i) => (
              <View key={u.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                <ShieldCheck size={16} color={C.accent} strokeWidth={1.8} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{u.name || '—'}</Text>
                  <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{u.email || '—'}{u.note ? `  ·  ${u.note}` : ''}</Text>
                </View>
                <Pressable onPress={() => remove(u)} disabled={busy || admins.length <= 1}
                  style={{ padding: 8, borderRadius: 10, backgroundColor: 'rgba(229,100,91,0.10)', opacity: admins.length <= 1 ? 0.4 : 1, ...(Platform.OS === 'web' ? { cursor: admins.length <= 1 ? 'default' : 'pointer' } as any : {}) }}>
                  <Trash2 size={16} color={C.red} strokeWidth={1.8} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
