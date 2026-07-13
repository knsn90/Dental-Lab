import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Search, Users as UsersIcon, Mail, ChevronDown, UserX, ArrowRightLeft, Power, Check, LogOut } from 'lucide-react-native';
import { listUsers, setUserActive, setUserRole, moveUserLab, anonymizeUser, sendPasswordReset, signoutUser, listLabs, USER_ROLES, type PlatformUser, type PlatformLab } from '../../modules/platform/api';
import { C, FONT, PlatformNav } from '../../modules/platform/ui';

export default function PlatformUsers() {
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [labs, setLabs] = useState<PlatformLab[]>([]);
  const [q, setQ] = useState('');
  const [labFilter, setLabFilter] = useState<string>('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmAnon, setConfirmAnon] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const [u, l] = await Promise.all([listUsers(null, null, 500), listLabs()]); setUsers(u); setLabs(l); }
    catch { setUsers([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = users ?? [];
    if (labFilter) list = list.filter((u) => u.lab_id === labFilter);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((u) => `${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(s));
    return list;
  }, [users, q, labFilter]);

  const act = async (uid: string, fn: () => Promise<any>, msg?: string) => {
    setBusy(uid);
    try { await fn(); if (msg) { setToast(msg); setTimeout(() => setToast(null), 2500); } await load(); }
    catch (e: any) { setToast(e?.message ?? 'Hata'); setTimeout(() => setToast(null), 3000); }
    finally { setBusy(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1160, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="users" />

        {/* Controls */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, height: 42, flex: 1, minWidth: 220 }}>
            <Search size={16} color={C.ink3} strokeWidth={1.8} />
            <TextInput value={q} onChangeText={setQ} placeholder="Ad veya e-posta ara…" placeholderTextColor={C.ink3}
              style={{ flex: 1, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
          </View>
          <Pressable onPress={() => setLabFilter('')} style={chip(!labFilter)}><Text style={chipT(!labFilter)}>Tüm lablar</Text></Pressable>
          {labs.slice(0, 6).map((l) => (
            <Pressable key={l.id} onPress={() => setLabFilter(labFilter === l.id ? '' : l.id)} style={chip(labFilter === l.id)}>
              <Text style={chipT(labFilter === l.id)} numberOfLines={1}>{l.name}</Text>
            </Pressable>
          ))}
        </View>

        {toast ? <View style={{ backgroundColor: 'rgba(79,141,247,0.14)', borderWidth: 1, borderColor: 'rgba(79,141,247,0.3)', borderRadius: 10, padding: 10, marginBottom: 12 }}><Text style={{ color: C.ink, fontSize: 13 }}>{toast}</Text></View> : null}

        {users === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : filtered.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center', gap: 8 }}>
            <UsersIcon size={28} color={C.ink3} strokeWidth={1.5} /><Text style={{ color: C.ink3, fontSize: 14 }}>Kullanıcı bulunamadı</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.ink3, fontSize: 12 }}>{filtered.length} kullanıcı</Text>
            {filtered.map((u) => {
              const expanded = open === u.id;
              return (
                <View key={u.id} style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
                  {/* Row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: u.is_active ? C.green : C.red }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>
                        {u.name || '—'}{!u.email_confirmed ? <Text style={{ color: C.amber, fontSize: 11 }}>  · doğrulanmadı</Text> : null}
                      </Text>
                      <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{u.email || '—'}</Text>
                    </View>
                    {u.lab_name ? <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)' }}><Text numberOfLines={1} style={{ color: C.ink2, fontSize: 11, maxWidth: 120 }}>{u.lab_name}</Text></View> : null}
                    <Text style={{ color: C.ink3, fontSize: 12, width: 96 }}>{u.role || u.user_type}</Text>
                    <Text style={{ color: C.ink3, fontSize: 11.5, width: 90, textAlign: 'right' }}>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}</Text>
                    {/* quick actions */}
                    <Pressable disabled={busy === u.id} onPress={() => act(u.id, () => setUserActive(u.id, !u.is_active))} style={iconBtn}>
                      <Power size={16} color={u.is_active ? C.amber : C.green} strokeWidth={1.9} />
                    </Pressable>
                    <Pressable disabled={busy === u.id || !u.email} onPress={() => act(u.id, () => sendPasswordReset(u.email!), 'Şifre sıfırlama e-postası gönderildi.')} style={iconBtn}>
                      <Mail size={16} color={C.ink2} strokeWidth={1.9} />
                    </Pressable>
                    <Pressable onPress={() => setOpen(expanded ? null : u.id)} style={iconBtn}>
                      <ChevronDown size={16} color={C.ink3} strokeWidth={2} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
                    </Pressable>
                  </View>

                  {/* Expanded actions */}
                  {expanded && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
                      {/* Role */}
                      <View>
                        <Text style={{ color: C.ink3, fontSize: 11.5, marginBottom: 6 }}>Rol</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {USER_ROLES.map((r) => (
                            <Pressable key={r} disabled={busy === u.id} onPress={() => act(u.id, () => setUserRole(u.id, r))} style={chip(u.role === r)}>
                              <Text style={chipT(u.role === r)}>{r}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      {/* Move lab */}
                      <View>
                        <Text style={{ color: C.ink3, fontSize: 11.5, marginBottom: 6 }}><ArrowRightLeft size={11} color={C.ink3} /> Başka lab'a taşı</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {labs.filter((l) => l.id !== u.lab_id).slice(0, 8).map((l) => (
                            <Pressable key={l.id} disabled={busy === u.id} onPress={() => act(u.id, () => moveUserLab(u.id, l.id), `${l.name} lab'ına taşındı.`)} style={chip(false)}>
                              <Text style={chipT(false)} numberOfLines={1}>{l.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      {/* Oturumları kapat */}
                      <Pressable disabled={busy === u.id} onPress={() => act(u.id, () => signoutUser(u.id), 'Tüm oturumlar sonlandırıldı.')}
                        style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <LogOut size={14} color={C.ink2} strokeWidth={1.9} /><Text style={{ color: C.ink2, fontSize: 12.5, fontWeight: '600' }}>Tüm oturumları kapat</Text>
                      </Pressable>
                      {/* Anonymize */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        {confirmAnon === u.id ? (
                          <>
                            <Text style={{ color: C.red, fontSize: 12.5, flex: 1 }}>Kişisel veriler anonimleştirilecek ve hesap pasifleşecek. Emin misin?</Text>
                            <Pressable disabled={busy === u.id} onPress={() => act(u.id, async () => { await anonymizeUser(u.id); setConfirmAnon(null); }, 'Kullanıcı anonimleştirildi.')} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: C.red, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Evet, anonimleştir</Text>
                            </Pressable>
                            <Pressable onPress={() => setConfirmAnon(null)} style={iconBtn}><Text style={{ color: C.ink2, fontSize: 12.5 }}>Vazgeç</Text></Pressable>
                          </>
                        ) : (
                          <Pressable onPress={() => setConfirmAnon(u.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: 'rgba(229,100,91,0.10)', borderWidth: 1, borderColor: 'rgba(229,100,91,0.25)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                            <UserX size={14} color={C.red} strokeWidth={1.9} /><Text style={{ color: C.red, fontSize: 12.5, fontWeight: '600' }}>Anonimleştir (KVKK)</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const iconBtn: any = { padding: 8, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.05)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) };
const chip = (on: boolean): any => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? 'rgba(79,141,247,0.16)' : 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: on ? 'rgba(79,141,247,0.4)' : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) });
const chipT = (on: boolean): any => ({ color: on ? C.ink : C.ink2, fontSize: 12.5, fontWeight: '600', maxWidth: 130 });
