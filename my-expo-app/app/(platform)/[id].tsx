import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Users, Building2, FileText, ClipboardList, CalendarClock, Save, LogOut, Eye } from 'lucide-react-native';
import { labDetail, setLabStatus, setLabPlan, extendTrial, updateLabMeta, offboardLab, PLANS, type PlatformLabDetail, type Plan } from '../../modules/platform/api';
import { C, FONT, planTone } from '../../modules/platform/ui';

export default function PlatformLabDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<PlatformLabDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ name: string; phone: string; email: string; address: string } | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try { const r = await labDetail(String(id)); setD(r); setEdit(null); } catch { setD(null); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); await load(); } finally { setBusy(false); } };

  if (!d) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>;
  const lab = d.lab;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80, maxWidth: 980, width: '100%', alignSelf: 'center' }}>
        <Pressable onPress={() => router.replace('/(platform)/labs' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <ChevronRight size={16} color={C.ink3} strokeWidth={2} style={{ transform: [{ rotate: '180deg' }] }} />
          <Text style={{ color: C.ink3, fontSize: 13 }}>Laboratuvarlar</Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: lab.is_active ? C.green : C.red }} />
          <Text style={{ fontFamily: FONT, fontSize: 32, fontWeight: '300', letterSpacing: -1.1, color: C.ink }}>{lab.name}</Text>
        </View>
        <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 20 }}>
          {lab.slug} · kayıt {new Date(lab.created_at).toLocaleDateString()} · deneme bitiş {lab.trial_ends_at ? new Date(lab.trial_ends_at).toLocaleDateString() : '—'}
        </Text>

        <Pressable onPress={() => router.push(`/(platform)/view/${id}` as any)}
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 22, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(79,141,247,0.14)', borderWidth: 1, borderColor: 'rgba(79,141,247,0.35)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <Eye size={15} color={C.accent} strokeWidth={1.9} />
          <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600' }}>Lab olarak görüntüle (salt-okunur)</Text>
        </Pressable>

        {/* Counts */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          {([['Kullanıcı', d.counts.users, Users], ['Sipariş', d.counts.orders, ClipboardList], ['Klinik', d.counts.clinics, Building2], ['Fatura', d.counts.invoices, FileText]] as const).map(([label, val, Icon]) => (
            <View key={label} style={{ flex: 1, minWidth: 130, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 16 }}>
              <Icon size={16} color={C.ink3} strokeWidth={1.8} />
              <Text style={{ fontFamily: FONT, fontSize: 26, fontWeight: '300', color: C.ink, marginTop: 8 }}>{val}</Text>
              <Text style={{ fontSize: 11, color: C.ink3, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Abonelik */}
        <Card title="Abonelik">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {PLANS.map((p) => {
              const on = lab.plan === p;
              return (
                <Pressable key={p} disabled={busy} onPress={() => run(() => setLabPlan(String(id), p))}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? planTone(p) : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: on ? planTone(p) : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: on ? '#0B1220' : C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
          {/* Deneme uzat */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <CalendarClock size={15} color={C.ink3} strokeWidth={1.8} />
            <Text style={{ color: C.ink3, fontSize: 13, marginRight: 4 }}>Deneme uzat:</Text>
            {[7, 14, 30].map((days) => (
              <Pressable key={days} disabled={busy} onPress={() => run(() => extendTrial(String(id), days))}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ color: C.ink2, fontSize: 12.5, fontWeight: '600' }}>+{days}g</Text>
              </Pressable>
            ))}
          </View>
          {/* durum */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable disabled={busy || lab.is_active} onPress={() => run(() => setLabStatus(String(id), true))}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: lab.is_active ? 'rgba(255,255,255,0.04)' : C.green, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ color: lab.is_active ? C.ink3 : '#062017', fontWeight: '700', fontSize: 13 }}>Aktifleştir</Text>
            </Pressable>
            <Pressable disabled={busy || !lab.is_active} onPress={() => run(() => setLabStatus(String(id), false))}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: !lab.is_active ? 'rgba(255,255,255,0.04)' : C.amber, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ color: !lab.is_active ? C.ink3 : '#2a1a04', fontWeight: '700', fontSize: 13 }}>Askıya al</Text>
            </Pressable>
          </View>
        </Card>

        {/* Bilgi düzenle */}
        <Card title="Laboratuvar bilgileri">
          {edit ? (
            <View style={{ gap: 10 }}>
              {([['name', 'Ad'], ['phone', 'Telefon'], ['email', 'E-posta'], ['address', 'Adres']] as const).map(([k, label]) => (
                <View key={k}>
                  <Text style={{ color: C.ink3, fontSize: 12, marginBottom: 4 }}>{label}</Text>
                  <TextInput value={(edit as any)[k]} onChangeText={(t) => setEdit({ ...edit, [k]: t })} placeholderTextColor={C.ink3}
                    style={{ height: 42, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: C.line, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable disabled={busy} onPress={() => run(() => updateLabMeta(String(id), edit))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Save size={15} color="#fff" strokeWidth={2} /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Kaydet</Text>
                </Pressable>
                <Pressable onPress={() => setEdit(null)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: C.ink2, fontWeight: '600', fontSize: 13 }}>İptal</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ gap: 6 }}>
              <Row label="Telefon" value={lab.phone} />
              <Row label="E-posta" value={lab.email} />
              <Row label="Adres" value={lab.address} />
              <Pressable onPress={() => setEdit({ name: lab.name ?? '', phone: lab.phone ?? '', email: lab.email ?? '', address: lab.address ?? '' })}
                style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>Düzenle</Text>
              </Pressable>
            </View>
          )}
        </Card>

        {/* Users */}
        <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 }}>Kullanıcılar ({d.users.length})</Text>
        <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginBottom: 24 }}>
          {d.users.map((u, i) => (
            <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '500' }}>{u.name || '—'}</Text>
                <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{u.email || '—'}</Text>
              </View>
              <Text style={{ color: C.ink2, fontSize: 12 }}>{u.user_type}{u.role ? ` · ${u.role}` : ''}</Text>
            </View>
          ))}
        </View>

        {/* Tehlikeli bölge */}
        <View style={{ borderWidth: 1, borderColor: 'rgba(229,100,91,0.3)', borderRadius: 14, padding: 16 }}>
          <Text style={{ color: C.red, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Tehlikeli bölge</Text>
          <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 12 }}>Offboard: lab pasifleştirilir ve "suspended" plana alınır. Veri silinmez.</Text>
          {confirmOff ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable disabled={busy} onPress={() => run(async () => { await offboardLab(String(id)); setConfirmOff(false); })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: C.red, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <LogOut size={15} color="#fff" strokeWidth={2} /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Evet, offboard et</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmOff(false)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ color: C.ink2, fontWeight: '600', fontSize: 13 }}>Vazgeç</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmOff(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(229,100,91,0.12)', borderWidth: 1, borderColor: 'rgba(229,100,91,0.3)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ color: C.red, fontWeight: '700', fontSize: 13 }}>Offboard</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 18, marginBottom: 22 }}>
      <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  );
}
function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: C.ink3, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: C.ink, fontSize: 13 }}>{value || '—'}</Text>
    </View>
  );
}
