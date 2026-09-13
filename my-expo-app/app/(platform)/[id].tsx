import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Users, Building2, FileText, ClipboardList, CalendarClock, Save, LogOut, Eye, ToggleLeft, ToggleRight } from '../../core/ui/icons';
import { labDetail, createLabOwner, setLabStatus, setLabPlan, extendTrial, updateLabMeta, offboardLab, labFlags, setLabFlag, labBilling, createInvoice, setInvoiceStatus, exportLabData, purgeLabPii, labUsage, setLabLimits, LIMIT_METRICS, labNotes, addLabNote, deleteLabNote, listLabApiKeys, createLabApiKey, revokeApiKey, PLANS, type PlatformLabDetail, type Plan, type LabFlag, type LabBilling, type LabUsage, type LabNote, type ApiKey } from '../../modules/platform/api';
import { C, FONT, SERIF, CARD_SHADOW, Kpi, Chip, hexA, planTone, fmtMoney, downloadJson } from '../../modules/platform/ui';
import { Check, Download, Send, Trash2, KeyRound, Copy } from '../../core/ui/icons';
import { isRTL } from '../../core/i18n';

export default function PlatformLabDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<PlatformLabDetail | null>(null);
  const [busy, setBusy] = useState(false);
  // Sahip hesabı — konsoldan kurulan labın ilk giriş kullanıcısı
  const [ownName, setOwnName] = useState('');
  const [ownMail, setOwnMail] = useState('');
  const [ownBusy, setOwnBusy] = useState(false);
  const [ownErr, setOwnErr]   = useState<string | null>(null);
  const [ownerCreds, setOwnerCreds] = useState<{ email: string; password: string } | null>(null);
  const [edit, setEdit] = useState<{ name: string; phone: string; email: string; address: string } | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [purgeName, setPurgeName] = useState<string | null>(null); // null = kapalı
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [flags, setFlags] = useState<LabFlag[]>([]);
  const [billing, setBilling] = useState<LabBilling | null>(null);
  const [usage, setUsage] = useState<LabUsage | null>(null);
  const [limitDraft, setLimitDraft] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<LabNote[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null); // yeni üretilen anahtar (bir kez)

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [r, f, b, u, n, k] = await Promise.all([labDetail(String(id)), labFlags(String(id)).catch(() => []), labBilling(String(id)).catch(() => null), labUsage(String(id)).catch(() => null), labNotes(String(id)).catch(() => []), listLabApiKeys(String(id)).catch(() => [])]);
      setD(r); setFlags(f); setBilling(b); setUsage(u); setNotes(n); setApiKeys(k); setEdit(null); setLimitDraft({}); setNoteDraft('');
    } catch { setD(null); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); await load(); } finally { setBusy(false); } };

  if (!d) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>;
  const lab = d.lab;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80, maxWidth: 980, width: '100%', alignSelf: 'center' }}>
        <Pressable onPress={() => router.replace('/(platform)/labs' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          <ChevronRight size={16} color={C.ink3} strokeWidth={2} style={{ transform: [{ rotate: isRTL() ? '0deg' : '180deg' }] }} />
          <Text style={{ color: C.ink3, fontSize: 13 }}>Laboratuvarlar</Text>
        </Pressable>

        <View style={{ paddingBottom: 22, marginBottom: 26, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: lab.is_active ? C.green : C.red }} />
            <Text style={{ ...SERIF, fontSize: 40, letterSpacing: -1.4, lineHeight: 44, color: C.ink }}>{lab.name}</Text>
            <Chip tone={planTone(lab.plan)} dot>{lab.plan.toUpperCase()}</Chip>
          </View>
          <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 16 }}>
            {lab.slug} · kayıt {new Date(lab.created_at).toLocaleDateString()} · deneme bitiş {lab.trial_ends_at ? new Date(lab.trial_ends_at).toLocaleDateString() : '—'}
          </Text>
          <Pressable onPress={() => router.push(`/(platform)/view/${id}` as any)}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.soft, borderWidth: 1, borderColor: hexA(C.accent, 0.3), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <Eye size={15} color={C.accent} strokeWidth={1.9} />
            <Text style={{ color: C.accentDeep, fontSize: 13, fontWeight: '700' }}>Lab olarak görüntüle (salt-okunur)</Text>
          </Pressable>
        </View>

        {/* Counts */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 26 }}>
          <Kpi label="Kullanıcı" value={d.counts.users} icon={Users} />
          <Kpi label="Sipariş" value={d.counts.orders} icon={ClipboardList} />
          <Kpi label="Klinik" value={d.counts.clinics} icon={Building2} />
          <Kpi label="Fatura" value={d.counts.invoices} icon={FileText} />
        </View>

        {/* Abonelik */}
        <Card title="Abonelik">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {PLANS.map((p) => {
              const on = lab.plan === p;
              return (
                <Pressable key={p} disabled={busy} onPress={() => run(() => setLabPlan(String(id), p))}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? planTone(p) : C.cardHover, borderWidth: 1, borderColor: on ? planTone(p) : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: on ? '#FFFFFF' : C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
          {/* Deneme uzat */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <CalendarClock size={15} color={C.ink3} strokeWidth={1.8} />
            <Text style={{ color: C.ink3, fontSize: 13, marginEnd: 4 }}>Deneme uzat:</Text>
            {[7, 14, 30].map((days) => (
              <Pressable key={days} disabled={busy} onPress={() => run(() => extendTrial(String(id), days))}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: C.cardHover, borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ color: C.ink2, fontSize: 12.5, fontWeight: '600' }}>+{days}g</Text>
              </Pressable>
            ))}
          </View>
          {/* durum */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable disabled={busy || lab.is_active} onPress={() => run(() => setLabStatus(String(id), true))}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: lab.is_active ? C.cardHover : C.green, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ color: lab.is_active ? C.ink3 : '#062017', fontWeight: '700', fontSize: 13 }}>Aktifleştir</Text>
            </Pressable>
            <Pressable disabled={busy || !lab.is_active} onPress={() => run(() => setLabStatus(String(id), false))}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: !lab.is_active ? C.cardHover : C.amber, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
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
                    style={{ height: 42, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.cardHover, borderWidth: 1, borderColor: C.line, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <Pressable disabled={busy} onPress={() => run(() => updateLabMeta(String(id), edit))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Save size={15} color="#fff" strokeWidth={2} /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Kaydet</Text>
                </Pressable>
                <Pressable onPress={() => setEdit(null)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: C.cardHover, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
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
                style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: C.cardHover, borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>Düzenle</Text>
              </Pressable>
            </View>
          )}
        </Card>

        {/* Notlar */}
        <Card title="Notlar">
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: notes.length ? 14 : 0 }}>
            <TextInput value={noteDraft} onChangeText={setNoteDraft} placeholder="Bu lab hakkında iç not…" placeholderTextColor={C.ink3}
              style={{ flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.cardHover, borderWidth: 1, borderColor: C.line, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
            <Pressable disabled={busy || !noteDraft.trim()} onPress={() => run(() => addLabNote(String(id), noteDraft.trim()))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.accent, opacity: !noteDraft.trim() ? 0.5 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Send size={15} color="#fff" strokeWidth={2} /><Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Ekle</Text>
            </Pressable>
          </View>
          <View style={{ gap: 8 }}>
            {notes.map((n) => (
              <View key={n.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: C.ink, fontSize: 13.5 }}>{n.note}</Text>
                  <Text style={{ color: C.ink3, fontSize: 11.5, marginTop: 3 }}>{n.author || '—'} · {new Date(n.created_at).toLocaleString()}</Text>
                </View>
                <Pressable disabled={busy} onPress={() => run(() => deleteLabNote(n.id))} style={{ padding: 6, borderRadius: 8, backgroundColor: hexA(C.red,0.1), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Trash2 size={14} color={C.red} strokeWidth={1.8} />
                </Pressable>
              </View>
            ))}
          </View>
        </Card>

        {/* Abonelik & Faturalar */}
        {billing && (
          <Card title="Abonelik & faturalar">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Text style={{ color: C.ink2, fontSize: 13 }}>Plan:</Text>
              <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{billing.plan_def?.name ?? billing.plan}</Text>
              <Text style={{ color: C.ink3, fontSize: 13 }}>{billing.plan_def ? fmtMoney(billing.plan_def.price_cents, billing.plan_def.currency) + ' / ' + billing.plan_def.billing_interval : ''}</Text>
              <View style={{ flex: 1 }} />
              {billing.plan_def && billing.plan_def.price_cents > 0 && (
                <Pressable disabled={busy} onPress={() => run(() => createInvoice(String(id), billing.plan_def!.price_cents, { currency: billing.plan_def!.currency, planKey: billing.plan }))}
                  style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Fatura kes</Text>
                </Pressable>
              )}
            </View>
            {billing.invoices.length === 0 ? (
              <Text style={{ color: C.ink3, fontSize: 13 }}>Fatura yok.</Text>
            ) : (
              <View style={{ gap: 2 }}>
                {billing.invoices.map((inv) => (
                  <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                    <Text style={{ color: C.ink3, fontSize: 12, width: 90 }}>#{inv.id} · {new Date(inv.issued_at).toLocaleDateString()}</Text>
                    <Text style={{ flex: 1, color: C.ink, fontSize: 13, fontWeight: '600', fontFamily: FONT }}>{fmtMoney(inv.amount_cents, inv.currency)}</Text>
                    <Text style={{ color: inv.status === 'paid' ? C.green : inv.status === 'void' ? C.ink3 : C.amber, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', width: 56 }}>{inv.status}</Text>
                    {inv.status === 'open' && (
                      <Pressable disabled={busy} onPress={() => run(() => setInvoiceStatus(inv.id, 'paid'))} style={{ padding: 6, borderRadius: 8, backgroundColor: hexA(C.green,0.12), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <Check size={14} color={C.green} strokeWidth={2} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Kullanım & limitler */}
        {usage && (
          <Card title="Kullanım & limitler">
            <View style={{ gap: 16 }}>
              {LIMIT_METRICS.map((m) => {
                const used = Number(usage.usage[m.key] || 0);
                const limit = Number(usage.limits[m.key] || 0); // 0 = sınırsız
                const pctUsed = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                const over = limit > 0 && used > limit;
                const isOverride = usage.overrides[m.key] != null;
                return (
                  <View key={m.key} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: C.ink2, fontSize: 13 }}>{m.label} {isOverride ? <Text style={{ color: C.accent, fontSize: 11 }}>· özel</Text> : null}</Text>
                      <Text style={{ color: over ? C.red : C.ink, fontSize: 13, fontWeight: '600' }}>{used} / {limit > 0 ? limit : '∞'}</Text>
                    </View>
                    {limit > 0 && (
                      <View style={{ height: 7, borderRadius: 4, backgroundColor: C.soft, overflow: 'hidden' }}>
                        <View style={{ width: `${pctUsed}%`, height: 7, backgroundColor: over ? C.red : pctUsed > 80 ? C.amber : C.green, borderRadius: 4 }} />
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ color: C.ink3, fontSize: 11.5 }}>Limit (0=sınırsız):</Text>
                      <TextInput value={limitDraft[m.key] ?? String(limit)} onChangeText={(t) => setLimitDraft((d) => ({ ...d, [m.key]: t }))} keyboardType="numeric"
                        style={{ width: 80, height: 32, paddingHorizontal: 10, borderRadius: 8, backgroundColor: C.cardHover, borderWidth: 1, borderColor: limitDraft[m.key] != null ? C.accent : C.line, color: C.ink, fontSize: 13, textAlign: 'end' as any, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
                      {limitDraft[m.key] != null && (
                        <Pressable disabled={busy} onPress={() => run(() => setLabLimits(String(id), { ...usage.overrides, [m.key]: parseInt(limitDraft[m.key], 10) || 0 }))}
                          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Kaydet</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        {/* API anahtarları */}
        <Card title="API anahtarları">
          {newKey && (
            <View style={{ backgroundColor: hexA(C.green,0.1), borderWidth: 1, borderColor: hexA(C.green,0.35), borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: C.green, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Yeni anahtar — yalnız ŞİMDİ görünür, kaydet!</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text selectable style={{ flex: 1, color: C.ink, fontSize: 12.5, fontFamily: FONT }}>{newKey}</Text>
                <Pressable onPress={() => { if (Platform.OS === 'web' && (navigator as any)?.clipboard) (navigator as any).clipboard.writeText(newKey); }} style={{ padding: 6, borderRadius: 8, backgroundColor: C.soft, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Copy size={15} color={C.ink2} strokeWidth={1.8} />
                </Pressable>
                <Pressable onPress={() => setNewKey(null)} style={{ padding: 6 }}><Text style={{ color: C.ink3, fontSize: 16 }}>×</Text></Pressable>
              </View>
            </View>
          )}
          <Pressable disabled={busy} onPress={() => run(async () => { const k = await createLabApiKey(String(id), 'API key'); setNewKey(k); })}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: C.accent, marginBottom: apiKeys.length ? 12 : 0, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <KeyRound size={15} color="#fff" strokeWidth={2} /><Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Yeni anahtar üret</Text>
          </Pressable>
          {apiKeys.map((k) => (
            <View key={k.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line, opacity: k.revoked_at ? 0.5 : 1 }}>
              <Text style={{ color: C.ink, fontSize: 13, fontFamily: FONT }}>{k.key_prefix}••••••</Text>
              <Text style={{ flex: 1, color: C.ink3, fontSize: 12 }}>{k.name || '—'} · {new Date(k.created_at).toLocaleDateString()}</Text>
              {k.revoked_at ? (
                <Text style={{ color: C.ink3, fontSize: 11.5 }}>iptal</Text>
              ) : (
                <Pressable disabled={busy} onPress={() => run(() => revokeApiKey(k.id))} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: hexA(C.red,0.1), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: C.red, fontSize: 12, fontWeight: '600' }}>İptal et</Text>
                </Pressable>
              )}
            </View>
          ))}
          <Text style={{ color: C.ink3, fontSize: 11.5, marginTop: 10 }}>Not: Anahtarlar hash'lenerek saklanır. Tenant API uç noktaları ayrı bir adımda etkinleştirilir.</Text>
        </Card>

        {/* Özellik bayrakları */}
        {flags.length > 0 && (
          <Card title="Özellik bayrakları">
            <View style={{ gap: 4 }}>
              {flags.map((f) => (
                <Pressable key={f.key} disabled={busy} onPress={() => run(() => setLabFlag(String(id), f.key, !f.effective))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  {f.effective ? <ToggleRight size={26} color={C.green} strokeWidth={1.8} /> : <ToggleLeft size={26} color={C.ink3} strokeWidth={1.8} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.ink, fontSize: 14, fontWeight: '500' }}>{f.label || f.key}</Text>
                    {f.description ? <Text style={{ color: C.ink3, fontSize: 12 }}>{f.description}</Text> : null}
                  </View>
                  {f.override == null
                    ? <Text style={{ color: C.ink3, fontSize: 11 }}>varsayılan{f.default_on ? ' · açık' : ' · kapalı'}</Text>
                    : <Text style={{ color: C.accent, fontSize: 11 }}>özel</Text>}
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        {/* ── Sahip hesabı ────────────────────────────────────────────
            Konsoldan kurulan labın henüz giriş yapabilen kullanıcısı yoktur;
            burada sahibin hesabı açılır ve geçici şifre EKRANDA gösterilir.
            İran'a e-posta teslimi güvenilir olmadığı için davet bağlantısı
            yerine doğrudan devredilebilir bilgi veriyoruz. */}
        {/* ownerCreds koşulu ŞART: hesap açılınca load() ile users.length 1 olur;
            yalnız `length === 0` bakarsak kart o anda unmount olur ve şifre hiç
            gösterilmez. Şifre ekranda kaldığı sürece kart açık kalmalı. */}
        {(d.users.length === 0 || ownerCreds) && (
          <Card title="Sahip hesabı">
            <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 12 }}>
              Bu laboratuvarın henüz giriş yapabilen kullanıcısı yok. Yönetici hesabını burada açıp
              giriş bilgilerini sahibine iletin.
            </Text>

            {ownerCreds ? (
              <View style={{ gap: 8, backgroundColor: hexA(C.accent, 0.06), borderRadius: 12, padding: 14,
                             borderWidth: 1, borderColor: hexA(C.accent, 0.25) }}>
                <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700' }}>Giriş bilgileri — bu ekranı kapatınca şifre bir daha gösterilmez</Text>
                <Text selectable style={{ color: C.ink, fontSize: 14 }}>E-posta: {ownerCreds.email}</Text>
                <Text selectable style={{ color: C.ink, fontSize: 16, fontWeight: '700', letterSpacing: 1 }}>Şifre: {ownerCreds.password}</Text>
                <Pressable onPress={() => { try { (navigator as any)?.clipboard?.writeText(`${ownerCreds.email} / ${ownerCreds.password}`); } catch {} }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginTop: 4,
                           paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
                  <Copy size={14} color={C.ink2} strokeWidth={1.8} />
                  <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>Kopyala</Text>
                </Pressable>
                <Pressable onPress={() => setOwnerCreds(null)}
                  style={{ alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ color: C.ink3, fontSize: 12, fontWeight: '600' }}>Bilgileri aldım, kapat</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <TextInput value={ownName} onChangeText={setOwnName} placeholder="Sahip adı soyadı" placeholderTextColor={C.ink3}
                  style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 10,
                           paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14,
                           ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
                <TextInput value={ownMail} onChangeText={setOwnMail} placeholder="E-posta" placeholderTextColor={C.ink3}
                  autoCapitalize="none" keyboardType="email-address"
                  style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 10,
                           paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14,
                           ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
                {ownErr ? <Text style={{ color: '#DC2626', fontSize: 13 }}>{ownErr}</Text> : null}
                <Pressable disabled={ownBusy} onPress={async () => {
                    setOwnErr(null);
                    if (!ownName.trim() || !ownMail.trim()) { setOwnErr('Ad ve e-posta zorunlu'); return; }
                    setOwnBusy(true);
                    try {
                      const c = await createLabOwner({ labId: String(id), email: ownMail, fullName: ownName });
                      setOwnerCreds(c);
                      await load();
                    } catch (e: any) { setOwnErr(String(e?.message ?? e)); }
                    finally { setOwnBusy(false); }
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
                           paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
                           backgroundColor: C.accent, opacity: ownBusy ? 0.6 : 1 }}>
                  <KeyRound size={15} color="#FFFFFF" strokeWidth={1.8} />
                  <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                    {ownBusy ? 'Oluşturuluyor…' : 'Yönetici hesabı oluştur'}
                  </Text>
                </Pressable>
              </View>
            )}
          </Card>
        )}

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

        {/* KVKK / Uyum */}
        <Card title="KVKK / Uyum">
          <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 12 }}>Veri taşınabilirliği ve kişisel veri silme (unutulma hakkı).</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Pressable disabled={busy} onPress={() => run(async () => { const data = await exportLabData(String(id)); downloadJson(`${lab.slug || 'lab'}-export.json`, data); })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: C.cardHover, borderWidth: 1, borderColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Download size={15} color={C.ink2} strokeWidth={1.8} />
              <Text style={{ color: C.ink2, fontSize: 13, fontWeight: '600' }}>Verileri dışa aktar (JSON)</Text>
            </Pressable>
            {purgeName == null && (
              <Pressable disabled={busy} onPress={() => { setPurgeName(''); setPurgeMsg(null); }}
                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: hexA(C.red,0.12), borderWidth: 1, borderColor: hexA(C.red,0.3), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ color: C.red, fontSize: 13, fontWeight: '700' }}>Kişisel verileri sil (anonimleştir)</Text>
              </Pressable>
            )}
          </View>
          {purgeName != null && (
            <View style={{ marginTop: 14, gap: 10 }}>
              <Text style={{ color: C.ink2, fontSize: 13 }}>
                Bu işlem kullanıcı/hasta/klinik kişisel verilerini <Text style={{ color: C.red, fontWeight: '700' }}>geri alınamaz</Text> biçimde anonimleştirir ve lab'ı pasifleştirir. Onaylamak için lab adını yazın:
                <Text style={{ color: C.ink, fontWeight: '700' }}>  {lab.name}</Text>
              </Text>
              <TextInput value={purgeName} onChangeText={setPurgeName} placeholder="Lab adı" placeholderTextColor={C.ink3}
                style={{ height: 42, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.cardHover, borderWidth: 1, borderColor: C.line, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
              {purgeMsg ? <Text style={{ color: C.green, fontSize: 12.5 }}>{purgeMsg}</Text> : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable disabled={busy || purgeName !== lab.name} onPress={() => run(async () => { const r = await purgeLabPii(String(id), purgeName); setPurgeMsg(`Anonimleştirildi: ${r.profiles} kullanıcı, ${r.work_orders} sipariş, ${r.clinics} klinik, ${r.doctors} hekim.`); setPurgeName(null); })}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: purgeName === lab.name ? C.red : hexA(C.red,0.3), opacity: purgeName === lab.name ? 1 : 0.6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Onayla ve sil</Text>
                </Pressable>
                <Pressable onPress={() => setPurgeName(null)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: C.cardHover, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: C.ink2, fontWeight: '600', fontSize: 13 }}>Vazgeç</Text>
                </Pressable>
              </View>
            </View>
          )}
        </Card>

        {/* Tehlikeli bölge */}
        <View style={{ borderWidth: 1, borderColor: hexA(C.red,0.3), borderRadius: 14, padding: 16 }}>
          <Text style={{ color: C.red, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Tehlikeli bölge</Text>
          <Text style={{ color: C.ink3, fontSize: 13, marginBottom: 12 }}>Offboard: lab pasifleştirilir ve "suspended" plana alınır. Veri silinmez.</Text>
          {confirmOff ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable disabled={busy} onPress={() => run(async () => { await offboardLab(String(id)); setConfirmOff(false); })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: C.red, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <LogOut size={15} color="#fff" strokeWidth={2} /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Evet, offboard et</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmOff(false)} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: C.cardHover, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ color: C.ink2, fontWeight: '600', fontSize: 13 }}>Vazgeç</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirmOff(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: hexA(C.red,0.12), borderWidth: 1, borderColor: hexA(C.red,0.3), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
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
    <View style={{ backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 20, marginBottom: 20, ...CARD_SHADOW }}>
      <Text style={{ color: C.ink3, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 14 }}>{title}</Text>
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
