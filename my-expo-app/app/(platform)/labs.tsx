import { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Building2, CheckCircle2, PauseCircle, Download, Plus, X } from '../../core/ui/icons';
import { listLabs, setLabStatus, createLab, type PlatformLab, type LabRegion } from '../../modules/platform/api';
import { C, FONT, PageHeader, Panel, Chip, Btn, IconChip, hexA, planTone, downloadCsv } from '../../modules/platform/ui';
import { autoT } from '../../core/i18n/autoTranslate';

type Filter = 'all' | 'active' | 'suspended' | 'trial';

export default function PlatformLabs() {
  const router = useRouter();
  const [labs, setLabs] = useState<PlatformLab[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  // Yeni lab formu — platform konsolundan kurulum (bkz. admin_create_lab).
  const [newOpen, setNewOpen] = useState(false);
  const [nName, setNName]   = useState('');
  const [nMail, setNMail]   = useState('');
  const [nRegion, setNRegion] = useState<LabRegion>('TR');
  const [nSaving, setNSaving] = useState(false);
  const [nErr, setNErr]     = useState<string | null>(null);

  const submitNew = async () => {
    setNErr(null);
    if (!nName.trim())  { setNErr(autoT('Lab adı zorunlu')); return; }
    if (!nMail.trim())  { setNErr(autoT('Sahip e-postası zorunlu')); return; }
    setNSaving(true);
    try {
      await createLab({ name: nName.trim(), ownerEmail: nMail.trim(), region: nRegion });
      setNewOpen(false); setNName(''); setNMail(''); setNRegion('TR');
      await load();
    } catch (e: any) {
      setNErr(String(e?.message ?? e));
    } finally { setNSaving(false); }
  };

  const load = useCallback(async () => { try { setLabs(await listLabs()); } catch { setLabs([]); } }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = labs ?? [];
    if (filter === 'active') list = list.filter((l) => l.is_active);
    else if (filter === 'suspended') list = list.filter((l) => !l.is_active);
    else if (filter === 'trial') list = list.filter((l) => l.plan === 'trial');
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((l) => `${l.name} ${l.slug}`.toLowerCase().includes(s));
    return list;
  }, [labs, q, filter]);

  const toggle = async (l: PlatformLab) => {
    setBusy(l.id);
    try { await setLabStatus(l.id, !l.is_active); await load(); } finally { setBusy(null); }
  };

  const exportCsv = () => {
    downloadCsv('labs.csv', [
      [autoT('Ad'), autoT('Slug'), autoT('Plan'), autoT('Aktif'), autoT('Kullanıcı'), autoT('Sipariş'), autoT('Oluşturma')],
      ...filtered.map((l) => [l.name, l.slug, l.plan, l.is_active ? autoT('evet') : autoT('hayır'), l.users, l.orders, new Date(l.created_at).toISOString().slice(0, 10)]),
    ]);
  };

  const FILTERS: [Filter, string][] = [['all', 'Tümü'], ['active', 'Aktif'], ['trial', 'Deneme'], ['suspended', 'Askıda']];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1180, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Yönetim" title="Laboratuvarlar"
          description="Tüm kiracı laboratuvarları — durum, plan ve kullanım."
          stats={labs ? [{ label: 'Toplam', value: labs.length }] : undefined}
          actions={
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn variant="ghost" icon={Download} onPress={exportCsv}>CSV</Btn>
              <Btn icon={Plus} onPress={() => setNewOpen(v => !v)}>Yeni Lab</Btn>
            </View>
          } />

        {/* ── Yeni lab kurulumu ──────────────────────────────────────────
            Bölge seçimi burada yapılır çünkü labın dili, takvimi, para birimi
            ve KDV varsayılanı ona bağlı — İranlı lab ilk açılışta Farsça,
            Şemsi ve Tümen ile gelir. Sahip e-postası "bekleyen" olarak
            işaretlenir; o kişi kayıt olunca labı devralır. */}
        {newOpen && (
          <Panel style={{ marginBottom: 18, padding: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ ...FONT.h3, color: C.ink }}>Yeni laboratuvar</Text>
              <Pressable onPress={() => setNewOpen(false)} hitSlop={8}><X size={18} color={C.ink3} /></Pressable>
            </View>

            <TextInput value={nName} onChangeText={setNName} placeholder="Laboratuvar adı" placeholderTextColor={C.ink3}
              style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 10,
                       paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14,
                       ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />

            <TextInput value={nMail} onChangeText={setNMail} placeholder="Sahip e-postası" placeholderTextColor={C.ink3}
              autoCapitalize="none" keyboardType="email-address"
              style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, borderRadius: 10,
                       paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 14,
                       ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ ...FONT.small, color: C.ink3 }}>Bölge</Text>
              {(['TR', 'IR'] as LabRegion[]).map(r => {
                const on = nRegion === r;
                return (
                  <Pressable key={r} onPress={() => setNRegion(r)}
                    style={{ paddingHorizontal: 14, height: 36, justifyContent: 'center', borderRadius: 999,
                             backgroundColor: on ? C.soft : C.card, borderWidth: 1,
                             borderColor: on ? C.accent : C.line }}>
                    <Text style={{ color: on ? C.accentDeep : C.ink2, fontSize: 13, fontWeight: on ? '700' : '600' }}>
                      {r === 'TR' ? '🇹🇷 Türkiye' : '🇮🇷 İran'}
                    </Text>
                  </Pressable>
                );
              })}
              <Text style={{ ...FONT.small, color: C.ink3 }}>
                {nRegion === 'IR'
                  ? 'Farsça · Şemsi takvim · Tümen · %10 KDV · e-Fatura ve POS kapalı'
                  : 'Türkçe · Miladi takvim · ₺ · %20 KDV'}
              </Text>
            </View>

            {nErr ? <Text style={{ ...FONT.small, color: '#DC2626' }}>{nErr}</Text> : null}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn onPress={submitNew} disabled={nSaving}>{nSaving ? 'Kuruluyor…' : 'Laboratuvarı kur'}</Btn>
              <Btn variant="ghost" onPress={() => setNewOpen(false)}>Vazgeç</Btn>
            </View>
            <Text style={{ ...FONT.small, color: C.ink3 }}>
              Sahip bu e-postayla kayıt olup giriş yaptığında laboratuvarı devralır.
            </Text>
          </Panel>
        )}

        {/* Arama + filtreler */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 999, borderWidth: 1, borderColor: C.line, paddingHorizontal: 16, height: 42, flex: 1, minWidth: 220 }}>
            <Search size={16} color={C.ink3} strokeWidth={1.8} />
            <TextInput value={q} onChangeText={setQ} placeholder="Lab adı veya slug ara…" placeholderTextColor={C.ink3}
              style={{ flex: 1, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
          </View>
          {FILTERS.map(([k, label]) => {
            const on = filter === k;
            return (
              <Pressable key={k} onPress={() => setFilter(k)}
                style={{ paddingHorizontal: 16, height: 42, justifyContent: 'center', borderRadius: 999, backgroundColor: on ? C.soft : C.card, borderWidth: 1, borderColor: on ? C.accent : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ color: on ? C.accentDeep : C.ink2, fontSize: 13, fontWeight: on ? '700' : '600' }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {labs === null ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : filtered.length === 0 ? (
          <Panel style={{ alignItems: 'center', paddingVertical: 44, gap: 10 }}>
            <IconChip icon={Building2} tone={C.ink3} size={52} />
            <Text style={{ color: C.ink3, fontSize: 14 }}>Lab bulunamadı</Text>
          </Panel>
        ) : (
          <Panel padding={0}>
            {filtered.map((l, i) => (
              <Pressable key={l.id} onPress={() => router.push(`/(platform)/${l.id}` as any)}
                style={({ hovered }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: hovered ? C.cardHover : 'transparent', paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }]}>
                <View style={{ position: 'relative' }}>
                  <IconChip icon={Building2} tone={l.is_active ? C.accent : C.ink3} size={38} />
                  <View style={{ position: 'absolute', end: -1, bottom: -1, width: 11, height: 11, borderRadius: 6, backgroundColor: l.is_active ? C.green : C.red, borderWidth: 2, borderColor: C.card }} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.ink, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 }}>{l.name}</Text>
                  <Text numberOfLines={1} style={{ color: C.ink3, fontSize: 12, marginTop: 2, fontFamily: FONT }}>{l.slug}</Text>
                </View>
                <View style={{ width: 66, alignItems: 'flex-end' }}>
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{l.users}</Text>
                  <Text style={{ color: C.ink3, fontSize: 11 }}>kullanıcı</Text>
                </View>
                <View style={{ width: 66, alignItems: 'flex-end' }}>
                  <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{l.orders}</Text>
                  <Text style={{ color: C.ink3, fontSize: 11 }}>sipariş</Text>
                </View>
                <Chip tone={planTone(l.plan)}>{l.plan.toUpperCase()}</Chip>
                <Pressable onPress={(e: any) => { e.stopPropagation?.(); toggle(l); }} disabled={busy === l.id}
                  style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(l.is_active ? C.amber : C.green, 0.12), ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) }}>
                  {busy === l.id ? <ActivityIndicator size="small" color={C.ink2} />
                    : l.is_active ? <PauseCircle size={18} color={C.amber} strokeWidth={1.8} />
                    : <CheckCircle2 size={18} color={C.green} strokeWidth={1.8} />}
                </Pressable>
              </Pressable>
            ))}
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}
