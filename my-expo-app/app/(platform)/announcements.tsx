import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Megaphone, Trash2, Send } from 'lucide-react-native';
import { listAnnouncements, createAnnouncement, setAnnouncementActive, deleteAnnouncement, type Announcement } from '../../modules/platform/api';
import { C, PageHeader, Panel, SectionLabel, Chip, IconChip, hexA } from '../../modules/platform/ui';

const LEVELS: [Announcement['level'], string, string][] = [['info', 'Bilgi', C.accent], ['warning', 'Uyarı', C.amber], ['critical', 'Kritik', C.red]];
const levelTone = (l: string) => LEVELS.find((x) => x[0] === l)?.[2] ?? C.accent;

export default function PlatformAnnouncements() {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState<Announcement['level']>('info');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setRows(await listAnnouncements()); } catch { setRows([]); } }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { await createAnnouncement({ title: title.trim(), body: body.trim() || undefined, level }); setTitle(''); setBody(''); setLevel('info'); await load(); }
    finally { setBusy(false); }
  };
  const act = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); await load(); } finally { setBusy(false); } };

  const input: any = { paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.cardHover, borderWidth: 1, borderColor: C.line, color: C.ink, fontSize: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 900, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Operasyon" title="Duyurular"
          description="Tüm laboratuvarların paneline düşen duyurular. Aktif olanlar üstte banner olarak gösterilir." />

        {/* Create */}
        <SectionLabel>Yeni duyuru · tüm lablar</SectionLabel>
        <Panel style={{ marginBottom: 28 }}>
          <TextInput value={title} onChangeText={setTitle} placeholder="Başlık" placeholderTextColor={C.ink3}
            style={{ ...input, height: 44, marginBottom: 10 }} />
          <TextInput value={body} onChangeText={setBody} placeholder="Mesaj (opsiyonel)" placeholderTextColor={C.ink3} multiline
            style={{ ...input, minHeight: 70, paddingTop: 12, marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {LEVELS.map(([k, label, tone]) => {
              const on = level === k;
              return (
                <Pressable key={k} onPress={() => setLevel(k)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? tone : C.cardHover, borderWidth: 1, borderColor: on ? tone : C.line, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                  <Text style={{ color: on ? '#FFFFFF' : C.ink2, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <Pressable onPress={create} disabled={busy || !title.trim()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 42, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.accent, opacity: !title.trim() ? 0.5 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Send size={15} color="#fff" strokeWidth={2} />}
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Yayınla</Text>
            </Pressable>
          </View>
        </Panel>

        {/* List */}
        {rows === null ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : rows.length === 0 ? (
          <Panel style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
            <IconChip icon={Megaphone} tone={C.ink3} size={52} /><Text style={{ color: C.ink3, fontSize: 14 }}>Henüz duyuru yok</Text>
          </Panel>
        ) : (
          <View style={{ gap: 12 }}>
            {rows.map((a) => (
              <Panel key={a.id} padding={16} style={{ opacity: a.active ? 1 : 0.55 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Chip tone={levelTone(a.level)} dot>{a.level.toUpperCase()}</Chip>
                  <Text style={{ flex: 1, color: C.ink, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 }} numberOfLines={1}>{a.title}</Text>
                  <Pressable onPress={() => act(() => setAnnouncementActive(a.id, !a.active))} disabled={busy}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.cardHover, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Text style={{ color: a.active ? C.amber : C.green, fontSize: 12, fontWeight: '700' }}>{a.active ? 'Durdur' : 'Yayınla'}</Text>
                  </Pressable>
                  <Pressable onPress={() => act(() => deleteAnnouncement(a.id))} disabled={busy}
                    style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(C.red, 0.1), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Trash2 size={15} color={C.red} strokeWidth={1.8} />
                  </Pressable>
                </View>
                {a.body ? <Text style={{ color: C.ink2, fontSize: 13, marginTop: 8 }}>{a.body}</Text> : null}
                <Text style={{ color: C.ink3, fontSize: 11.5, marginTop: 8 }}>
                  {a.audience_name ? a.audience_name : 'Tüm lablar'} · {new Date(a.created_at).toLocaleString()}
                </Text>
              </Panel>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
