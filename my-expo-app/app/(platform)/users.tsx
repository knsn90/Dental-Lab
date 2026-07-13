import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Search, Users as UsersIcon, Mail, ChevronDown, UserX, ArrowRightLeft, Power, LogOut } from 'lucide-react-native';
import { listUsers, setUserActive, setUserRole, moveUserLab, anonymizeUser, sendPasswordReset, signoutUser, listLabs, USER_ROLES, type PlatformUser, type PlatformLab } from '../../modules/platform/api';
import { C, PageHeader, Panel, Chip, IconChip, hexA } from '../../modules/platform/ui';

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
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1180, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Yönetim" title="Kullanıcılar"
          description="Tüm laboratuvarlardaki hesaplar — rol, taşıma, oturum ve KVKK işlemleri."
          stats={users ? [{ label: 'Toplam', value: users.length }] : undefined} />

        {/* Arama + lab filtresi */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 999, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, height: 42, flex: 1, minWidth: 220 }}>
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

        {toast ? <View style={{ backgroundColor: C.soft, borderWidth: 1, borderColor: hexA(C.accent, 0.28), borderRadius: 12, padding: 12, marginBottom: 14 }}><Text style={{ color: C.accentDeep, fontSize: 13, fontWeight: '600' }}>{toast}</Text></View> : null}

        {users === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : filtered.length === 0 ? (
          <Panel style={{ alignItems: 'center', paddingVertical: 44, gap: 10 }}>
            <IconChip icon={UsersIcon} tone={C.ink3} size={52} /><Text style={{ color: C.ink3, fontSize: 14 }}>Kullanıcı bulunamadı</Text>
          </Panel>
        ) : (
          <Panel padding={0}>
            {filtered.map((u, i) => {
              const expanded = open === u.id;
              return (
                <View key={u.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                  {/* Row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 18 }}>
                    <View style={{ position: 'relative' }}>
                      <IconChip icon={UsersIcon} tone={C.accent} size={34} />
                      <View style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: u.is_active ? C.green : C.red, borderWidth: 2, borderColor: C.card }} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 }}>
                        {u.name || '—'}{!u.email_confirmed ? <Text style={{ color: C.amber, fontSize: 11, fontWeight: '600' }}>  · doğrulanmadı</Text> : null}
                      </Text>
                      <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12 }}>{u.email || '—'}</Text>
                    </View>
                    {u.lab_name ? <Chip tone={C.ink2}>{u.lab_name}</Chip> : null}
                    <Text style={{ color: C.ink3, fontSize: 12, width: 96 }}>{u.role || u.user_type}</Text>
                    <Text style={{ color: C.ink3, fontSize: 11.5, width: 90, textAlign: 'right' }}>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}</Text>
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
                    <View style={{ paddingHorizontal: 18, paddingBottom: 16, gap: 14, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14, backgroundColor: C.cardHover }}>
                      <View>
                        <Text style={{ color: C.ink3, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8 }}>Rol</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {USER_ROLES.map((r) => (
                            <Pressable key={r} disabled={busy === u.id} onPress={() => act(u.id, () => setUserRole(u.id, r))} style={chip(u.role === r)}>
                              <Text style={chipT(u.role === r)}>{r}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <View>
                        <Text style={{ color: C.ink3, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 8 }}>Başka lab'a taşı</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {labs.filter((l) => l.id !== u.lab_id).slice(0, 8).map((l) => (
                            <Pressable key={l.id} disabled={busy === u.id} onPress={() => act(u.id, () => moveUserLab(u.id, l.id), `${l.name} lab'ına taşındı.`)} style={chip(false)}>
                              <ArrowRightLeft size={11} color={C.ink3} strokeWidth={2} /><Text style={chipT(false)} numberOfLines={1}>{l.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <Pressable disabled={busy === u.id} onPress={() => act(u.id, () => signoutUser(u.id), 'Tüm oturumlar sonlandırıldı.')}
                        style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <LogOut size={14} color={C.ink2} strokeWidth={1.9} /><Text style={{ color: C.ink2, fontSize: 12.5, fontWeight: '600' }}>Tüm oturumları kapat</Text>
                      </Pressable>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {confirmAnon === u.id ? (
                          <>
                            <Text style={{ color: C.red, fontSize: 12.5, flex: 1, minWidth: 200 }}>Kişisel veriler anonimleştirilecek ve hesap pasifleşecek. Emin misin?</Text>
                            <Pressable disabled={busy === u.id} onPress={() => act(u.id, async () => { await anonymizeUser(u.id); setConfirmAnon(null); }, 'Kullanıcı anonimleştirildi.')} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.red, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Evet, anonimleştir</Text>
                            </Pressable>
                            <Pressable onPress={() => setConfirmAnon(null)} style={iconBtn}><Text style={{ color: C.ink2, fontSize: 12.5 }}>Vazgeç</Text></Pressable>
                          </>
                        ) : (
                          <Pressable onPress={() => setConfirmAnon(u.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: hexA(C.red, 0.10), borderWidth: 1, borderColor: hexA(C.red, 0.25), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                            <UserX size={14} color={C.red} strokeWidth={1.9} /><Text style={{ color: C.red, fontSize: 12.5, fontWeight: '600' }}>Anonimleştir (KVKK)</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}

const iconBtn: any = { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardHover, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) };
const chip = (on: boolean): any => ({ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? C.soft : C.card, borderWidth: 1, borderColor: on ? C.accent : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) });
const chipT = (on: boolean): any => ({ color: on ? C.accentDeep : C.ink2, fontSize: 12.5, fontWeight: on ? '700' : '600', maxWidth: 130 });
