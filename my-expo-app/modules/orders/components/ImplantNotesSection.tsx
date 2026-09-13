/**
 * ImplantNotesSection — implant parça notları (scan body, dijital analog, Ti-base …).
 *
 * Bilinçli olarak SADE (kullanıcı kararı): talep/durum akışı yok, yalnız not + ek.
 * "Hangi parçayı almıştık, modeli/kodu neydi" bilgisi sipariş detayında kalsın,
 * aylar sonra mesajlar aranmasın. İki taraf da görür ve yazabilir.
 *
 * Çalışma kartındaki İMPLANT şeridinin altında; aynı bileşen mobil handoff'ta da
 * kullanılır → web/native görünüm birebir. Native güvenliği: stiller NESNE.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, Platform, Image, Modal, TextInput } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Paperclip, X, MoreHorizontal, Trash2, Pencil, FileText } from '../../../core/ui/icons';
import { openFileUrl } from '../../../core/util/openFile';

import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { toast } from '../../../core/ui/Toast';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import {
  useImplantNotes, addImplantNote, updateImplantNote, deleteImplantNote,
  uploadNotePhoto, type ImplantNote, type NoteAsset,
} from '../implantNotes';

/** Görsel mi — önizleme küçük resim mi yoksa dosya kartı mı çizileceğini belirler. */
function isImagePath(nameOrPath: string): boolean {
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(nameOrPath || '');
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export function ImplantNotesSection({
  orderId, parentOrderId, parentOrderNumber, currentUserId, onChange,
}: {
  orderId: string;
  /** Devam siparişinde asıl işin id'si — "önceki iş" notları salt-okunur görünür. */
  parentOrderId?: string | null;
  parentOrderNumber?: string | null;
  currentUserId?: string | null;
  /** Not/görsel eklenip silindiğinde haber ver — Dosyalar sekmesi de tazelensin. */
  onChange?: () => void;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { notes, parentNotes, photoUrls, loading, refetch } = useImplantNotes(orderId, parentOrderId);

  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<{ asset: NoteAsset; preview: string; name: string; image: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // Her dosya türü: ambalaj fotoğrafı, ekran görüntüsü, firmadan gelen PDF
  // irsaliye/katalog sayfası… Tür kısıtı yok — depo ve RPC zaten tür-bağımsız.
  async function pickFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      for (const a of res.assets) {
        const name = a.name ?? `ek_${Date.now()}`;
        const type = a.mimeType ?? 'application/octet-stream';
        const webFile = (a as any).file as File | undefined;
        const asset: NoteAsset = webFile
          ? { kind: 'file', file: webFile, name, type }
          : Platform.OS === 'web'
            ? { kind: 'file', file: await (await fetch(a.uri)).blob(), name, type }
            : { kind: 'uri', uri: a.uri, name, type };
        setPending(p => [...p, { asset, preview: a.uri, name, image: isImagePath(name) || type.startsWith('image/') }]);
      }
    } catch (e: any) {
      toast.error(e?.message ?? autoT('Dosya seçilemedi.'));
    }
  }

  async function submit() {
    const body = draft.trim();
    if (!body) { toast.error(autoT('Not boş olamaz.')); return; }
    setBusy(true);
    try {
      const id = await addImplantNote(orderId, body);
      for (const p of pending) await uploadNotePhoto(orderId, id, p.asset);
      setDraft(''); setPending([]);
      await refetch();
      onChange?.();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally { setBusy(false); }
  }

  async function saveEdit(id: string) {
    const body = editBody.trim();
    if (!body) { toast.error(autoT('Not boş olamaz.')); return; }
    setBusy(true);
    try {
      await updateImplantNote(id, body);
      setEditId(null); setEditBody('');
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally { setBusy(false); }
  }

  const iconBtn = {
    width: 30, height: 30, borderRadius: 999,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1, borderColor: T.hairline,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  };

  function renderNote(n: ImplantNote, readOnly?: boolean) {
    const mine = !!currentUserId && n.created_by === currentUserId;
    const editing = editId === n.id;
    return (
      <View key={n.id} style={{ gap: 5, paddingVertical: 6 }}>
        {editing ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={editBody} onChangeText={setEditBody} multiline
              style={{
                borderWidth: 1, borderColor: T.hairline, borderRadius: 10,
                paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: T.ink,
                backgroundColor: isDark ? T.cardSoft : '#FFFFFF', minHeight: 60,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
              <Pressable onPress={() => { setEditId(null); setEditBody(''); }}
                style={{ paddingHorizontal: 10, paddingVertical: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ fontSize: 12, color: T.ink3 }}>{autoT('Vazgeç')}</Text>
              </Pressable>
              <Pressable onPress={() => saveEdit(n.id)} disabled={busy}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: T.ink,
                         opacity: busy ? 0.5 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#101010' : '#FFFFFF' }}>{autoT('Kaydet')}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: 12.5, color: T.ink, lineHeight: 18 }}>{n.body}</Text>
        )}

        {n.photos.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {n.photos.map(ph => {
              const url = photoUrls[ph.storage_path] ?? null;
              const img = isImagePath(ph.storage_path);
              const fileName = (ph.storage_path.split('/').pop() ?? '').replace(/^\d+_/, '');
              return (
                <Pressable
                  key={ph.id}
                  /* Görsel ekranda açılır; PDF/diğer dosya kendi uygulamasında */
                  onPress={() => {
                    if (!url) { toast.error(autoT('Dosyaya erişilemedi. Birazdan tekrar deneyin.')); return; }
                    if (img) setLightbox(url); else void openFileUrl(url);
                  }}
                  style={img
                    ? { width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
                        borderWidth: 1, borderColor: T.hairline,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }
                    : { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220,
                        paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8,
                        borderWidth: 1, borderColor: T.hairline,
                        backgroundColor: isDark ? T.cardSoft : '#F7F7F7',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                >
                  {img
                    ? (url
                        ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} />
                        : <View style={{ flex: 1, backgroundColor: isDark ? T.cardSoft : '#F1F1F1' }} />)
                    : (
                      <>
                        <FileText size={13} color={T.ink2} strokeWidth={1.8} />
                        <Text numberOfLines={1} style={{ fontSize: 11, color: T.ink2, flexShrink: 1 }}>{fileName}</Text>
                      </>
                    )}
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 10.5, color: T.ink3 }}>
            {(n as any).created_by_name || (((n as any).created_by_side === 'clinic') ? autoT('Klinik') : autoT('Laboratuvar'))}
            {' · '}{fmtDate(n.created_at)}
          </Text>
          <View style={{ flex: 1 }} />
          {mine && !readOnly && !editing && (
            <Pressable onPress={() => setMenuFor(menuFor === n.id ? null : n.id)}
              style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
                       ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <MoreHorizontal size={14} color={T.ink3} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>

        {menuFor === n.id && mine && !readOnly && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable
              onPress={() => { setMenuFor(null); setEditId(n.id); setEditBody(n.body); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5,
                       borderRadius: 999, borderWidth: 1, borderColor: T.hairline,
                       ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <Pencil size={12} color={T.ink2} strokeWidth={1.8} />
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: T.ink2 }}>{autoT('Düzenle')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMenuFor(null);
                setConfirm({
                  title: autoT('Notu sil'), variant: 'danger',
                  message: autoT('Bu not ve ekleri silinecek. Geri alınamaz.'),
                  label: autoT('Evet, sil'),
                  onConfirm: async () => {
                    setConfirm(null);
                    try { await deleteImplantNote(n.id); await refetch(); onChange?.(); }
                    catch (e: any) { toast.error(e?.message ?? String(e)); }
                  },
                });
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5,
                       borderRadius: 999, borderWidth: 1, borderColor: T.hairline,
                       ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <Trash2 size={12} color="#D94B4B" strokeWidth={1.8} />
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#D94B4B' }}>{autoT('Sil')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 9.5, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3 }}>
        {autoT('Parça notları')}
      </Text>

      {loading && notes.length === 0 ? (
        <Text style={{ fontSize: 11.5, color: T.ink3 }}>{autoT('Yükleniyor…')}</Text>
      ) : notes.length === 0 ? null : (
        <View style={{ gap: 2 }}>{notes.map(n => renderNote(n))}</View>
      )}

      {/* Yazma alanı — not + ek */}
      <View style={{ gap: 8 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder={autoT('Parça notu — ör. Ti-base Dentsply Sirona, REF 60220, 1 adet')}
          placeholderTextColor={T.ink3}
          style={{
            borderWidth: 1, borderColor: T.hairline, borderRadius: 10,
            paddingHorizontal: 10, paddingVertical: 8, fontSize: 12.5, color: T.ink,
            backgroundColor: isDark ? T.cardSoft : '#FFFFFF', minHeight: 44,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
          }}
        />

        {pending.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {pending.map((p, i) => (
              /* Görsel → küçük önizleme; PDF/diğer → ad taşıyan dosya kartı */
              <View
                key={i}
                style={p.image
                  ? { width: 40, height: 40, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: T.hairline }
                  : { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200,
                      paddingStart: 8, paddingEnd: 20, paddingVertical: 6, borderRadius: 8,
                      borderWidth: 1, borderColor: T.hairline, backgroundColor: isDark ? T.cardSoft : '#F7F7F7' }}
              >
                {p.image
                  ? <Image source={{ uri: p.preview }} style={{ width: '100%', height: '100%' }} />
                  : (
                    <>
                      <FileText size={13} color={T.ink2} strokeWidth={1.8} />
                      <Text numberOfLines={1} style={{ fontSize: 11, color: T.ink2, flexShrink: 1 }}>{p.name}</Text>
                    </>
                  )}
                <Pressable
                  onPress={() => setPending(ps => ps.filter((_, j) => j !== i))}
                  style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16,
                           alignItems: 'center', justifyContent: 'center',
                           backgroundColor: p.image ? 'rgba(0,0,0,0.55)' : 'transparent',
                           ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                >
                  <X size={10} color={p.image ? '#FFFFFF' : T.ink3} strokeWidth={2.4} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={pickFile} style={iconBtn} accessibilityLabel={autoT('Ek')}>
            <Paperclip size={14} color={T.ink2} strokeWidth={1.8} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={submit}
            disabled={busy || !draft.trim()}
            style={{
              paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999,
              backgroundColor: T.ink, opacity: busy || !draft.trim() ? 0.45 : 1,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#101010' : '#FFFFFF' }}>
              {busy ? autoT('Ekleniyor…') : autoT('Not ekle')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Devam siparişi: asıl işin notları (salt-okunur) */}
      {parentNotes.length > 0 && (
        <View style={{ marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.hairline, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 9.5, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3 }}>
              {autoT('Önceki işin notları')}
            </Text>
            {!!parentOrderNumber && (
              <Text style={{ fontSize: 10.5, color: T.ink3, fontFamily: T.mono }}>{parentOrderNumber}</Text>
            )}
          </View>
          {parentNotes.map(n => renderNote(n, true))}
        </View>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />

      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable
          onPress={() => setLightbox(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          {!!lightbox && <Image source={{ uri: lightbox }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </View>
  );
}
