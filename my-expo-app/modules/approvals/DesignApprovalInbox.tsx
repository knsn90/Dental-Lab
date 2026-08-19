// Tasarım (hekim) onayları gelen kutusu — hekim + klinik panellerinde paylaşılır.
// Lab tasarımı onaya gönderince burada listelenir; onay/red + not verilir.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput, Platform, RefreshControl, Image, Modal } from 'react-native';
import { BadgeCheck, Check, X, Clock, FileSearch, MessageSquare } from 'lucide-react-native';
import { usePanelTheme } from '../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { hexA } from '../../core/theme/stationPalette';
import { supabase } from '../../core/api/supabase';
import { fetchPendingDesignApprovals, clinicDecideDesignApproval, type PendingDesignApproval } from '../orders/api';
import { FilesUploadModal, type UploadAttachment } from '../orders/components/FilesUploadModal';
import { allStationFileCategories } from '../orders/stations/registry';
import { Viewer3DModalLazy } from '../viewer-3d/Viewer3DLazy';
import { toast } from '../../core/ui/Toast';
import { autoT } from '../../core/i18n/autoTranslate';

function detectKind(name: string): UploadAttachment['kind'] {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['stl', 'obj', 'ply', '3mf', 'dcm'].includes(ext)) return 'scan';
  if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  return 'image';
}

const PAGE_BG: Record<string, string> = { clinic: '#F9FAFB', lab: '#F5F1EB', exec: '#F7F9FC', tech: '#F5F9FD' };
const F_SERIF = Platform.OS === 'web' ? 'Inter Tight, system-ui, sans-serif' : undefined;

function expiresLabel(iso: string | null): { text: string; urgent: boolean } {
  if (!iso) return { text: '', urgent: false };
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: 'Süre doldu', urgent: true };
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return { text: `${Math.floor(h / 24)} ${autoT('gün kaldı')}`, urgent: false };
  if (h >= 1) return { text: `${h} ${autoT('saat kaldı')}`, urgent: h < 6 };
  return { text: `${Math.max(1, Math.floor(ms / 60_000))} ${autoT('dk kaldı')}`, urgent: true };
}

export function DesignApprovalInbox({ routePrefix = '/(doctor)' }: { routePrefix?: string }) {
  const theme = usePanelTheme();
  const T = useMobileTokens();
  const accent = theme.primary;
  const deep = theme.primaryDeep;
  const pageBg = PAGE_BG[theme.key] ?? '#F0F6F2';

  const [items, setItems] = useState<PendingDesignApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  // ── Dosya görüntüleme (sayfadan ayrılmadan) ──
  const [filesFor, setFilesFor] = useState<PendingDesignApproval | null>(null);
  const [attachments, setAttachments] = useState<UploadAttachment[]>([]);
  const [viewer3DFiles, setViewer3DFiles] = useState<Array<{ id: string; name: string; url: string; format: 'stl' | 'ply' | 'obj' }> | null>(null);
  const [imgViewer, setImgViewer] = useState<{ url: string; name: string } | null>(null);

  const openFiles = async (o: PendingDesignApproval) => {
    setFilesFor(o);
    setAttachments([]);
    const { data } = await supabase
      .from('work_order_photos')
      .select('id, storage_path, caption, created_at')
      .eq('work_order_id', o.id)
      .order('created_at', { ascending: true })
      .limit(200);
    const rows = data ?? [];
    if (rows.length === 0) { setAttachments([]); return; }
    const paths = rows.map((r: any) => r.storage_path);
    const { data: signed } = await supabase.storage.from('work-order-photos').createSignedUrls(paths, 3600);
    const urlByPath: Record<string, string> = {};
    (signed ?? []).forEach((s: any) => { if (s?.signedUrl && s?.path) urlByPath[s.path] = s.signedUrl; });
    setAttachments(rows.map((r: any) => ({
      id: r.id,
      name: r.caption?.trim() || (r.storage_path.split('/').pop() ?? 'Dosya'),
      uri: urlByPath[r.storage_path] ?? '',
      kind: detectKind(r.storage_path),
      filename: r.storage_path,
      canRemove: false,
      created_at: r.created_at,
    })));
  };

  const previewAttachment = (att: UploadAttachment) => {
    if (att.kind === 'scan') {
      const ext = (att.filename || att.name).split('.').pop()?.toLowerCase();
      const fmt = (ext === 'ply' || ext === 'obj') ? ext : 'stl';
      setViewer3DFiles([{ id: att.id, name: att.name, url: att.uri, format: fmt as any }]);
    } else if (att.kind === 'image') {
      if (att.uri) setImgViewer({ url: att.uri, name: att.name });
    } else if (Platform.OS === 'web' && att.uri) {
      window.open(att.uri, '_blank');
    }
  };
  const scan3D = attachments.filter(a => a.kind === 'scan');

  const load = useCallback(async () => {
    const rows = await fetchPendingDesignApprovals();
    setItems(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, approved: boolean) => {
    setBusyId(id);
    const res = await clinicDecideDesignApproval(id, approved, noteFor === id ? noteText.trim() || undefined : undefined);
    setBusyId(null);
    if (!res.ok) { toast.error(res.error ?? 'İşlem başarısız'); return; }
    toast.success(approved ? 'Tasarım onaylandı' : 'Değişiklik talep edildi');
    setNoteFor(null); setNoteText('');
    setItems(prev => prev.filter(x => x.id !== id));
  };

  const shadow = Platform.OS === 'web' ? ({ boxShadow: '0 8px 24px rgba(15,42,31,0.08)' } as any) : {};

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Başlık ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: hexA(accent, 0.14), alignItems: 'center', justifyContent: 'center' }}>
            <BadgeCheck size={22} color={deep} strokeWidth={1.7} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.4, color: hexA(deep, 0.6), textTransform: 'uppercase' }}>
              Tasarım Onayı
            </Text>
            <Text style={{ fontSize: 25, fontWeight: '700', color: T.ink, letterSpacing: -0.5, ...(F_SERIF ? { fontFamily: F_SERIF } : {}) }}>
              Onaylar
            </Text>
          </View>
          {!loading && items.length > 0 && (
            <View style={{ minWidth: 30, height: 30, paddingHorizontal: 8, borderRadius: 999, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{items.length}</Text>
            </View>
          )}
        </View>

        {loading ? (
          <View style={{ paddingVertical: 56, alignItems: 'center' }}>
            <ActivityIndicator color={accent} />
          </View>
        ) : items.length === 0 ? (
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 56, backgroundColor: T.card, borderRadius: 22, borderWidth: 1, borderColor: T.hairline, ...shadow }}>
            <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: hexA(accent, 0.10), alignItems: 'center', justifyContent: 'center' }}>
              <BadgeCheck size={28} color={accent} strokeWidth={1.5} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink, ...(F_SERIF ? { fontFamily: F_SERIF } : {}) }}>Bekleyen onay yok</Text>
            <Text style={{ fontSize: 13, color: T.ink3, textAlign: 'center', maxWidth: 300, lineHeight: 19 }}>
              Laboratuvar bir tasarımı onayınıza gönderdiğinde burada görünür.
            </Text>
          </View>
        ) : (
          items.map(o => {
            const exp = expiresLabel(o.doctor_approval_expires_at);
            const noteOpen = noteFor === o.id;
            const busy = busyId === o.id;
            const expBg = exp.urgent ? hexA('#D94B4B', 0.12) : hexA('#E89B2A', 0.14);
            const expFg = exp.urgent ? '#C0392B' : '#B7791F';
            return (
              <View key={o.id} style={{
                backgroundColor: T.card, borderRadius: 20, borderWidth: 1, borderColor: T.hairline,
                marginBottom: 14, overflow: 'hidden', ...shadow,
              }}>
                {/* Üst accent şeridi */}
                <View style={{ height: 4, backgroundColor: accent }} />
                <View style={{ padding: 18 }}>
                  {/* Hasta + sipariş + süre */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 17, fontWeight: '700', color: T.ink, ...(F_SERIF ? { fontFamily: F_SERIF } : {}) }} numberOfLines={1}>
                        {o.patient_name || 'Hasta'}
                      </Text>
                      {!!o.order_number && (
                        <Text style={{ fontSize: 12, fontWeight: '600', color: hexA(deep, 0.55), marginTop: 1, letterSpacing: 0.2 }}>#{o.order_number}</Text>
                      )}
                    </View>
                    {!!exp.text && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: expBg }}>
                        <Clock size={11} color={expFg} strokeWidth={2.2} />
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: expFg }}>{exp.text}</Text>
                      </View>
                    )}
                  </View>

                  {/* İşlem / renk chip'leri */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {[o.work_type, o.shade].filter(Boolean).map((tag, i) => (
                      <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: hexA(accent, 0.10) }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: deep }} numberOfLines={1}>{tag as string}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Tasarımı görüntüle */}
                  <Pressable
                    onPress={() => openFiles(o)}
                    style={({ hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      marginTop: 14, height: 44, borderRadius: 13,
                      borderWidth: 1, borderColor: hexA(deep, 0.18),
                      backgroundColor: hovered ? hexA(accent, 0.06) : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' as any, transition: 'background 0.15s' } as any : {}),
                    })}
                  >
                    <FileSearch size={16} color={deep} strokeWidth={1.8} />
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: deep }}>Tasarımı ve dosyaları görüntüle</Text>
                  </Pressable>

                  {/* Not girişi */}
                  {noteOpen && (
                    <View style={{ marginTop: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <MessageSquare size={13} color={T.ink3} strokeWidth={1.8} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink3, letterSpacing: 0.3, textTransform: 'uppercase' }}>Değişiklik notu</Text>
                      </View>
                      <TextInput
                        value={noteText}
                        onChangeText={setNoteText}
                        placeholder="Hangi değişiklik gerekli? (opsiyonel)"
                        placeholderTextColor={T.ink3}
                        multiline
                        autoFocus
                        style={{
                          minHeight: 64, borderRadius: 13, borderWidth: 1, borderColor: T.hairline,
                          backgroundColor: T.cardSoft, padding: 12, fontSize: 13.5, color: T.ink, textAlignVertical: 'top',
                          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                        }}
                      />
                    </View>
                  )}

                  {/* Karar butonları */}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <Pressable
                      onPress={() => { if (!noteOpen) { setNoteFor(o.id); setNoteText(''); } else { decide(o.id, false); } }}
                      disabled={busy}
                      style={({ hovered }: any) => ({
                        flex: 1, height: 46, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                        borderWidth: 1.5, borderColor: hexA('#D94B4B', 0.4),
                        backgroundColor: hovered ? hexA('#D94B4B', 0.10) : hexA('#D94B4B', 0.05),
                        opacity: busy ? 0.6 : 1,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : {}),
                      })}
                    >
                      <X size={17} color="#C0392B" strokeWidth={2.2} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#C0392B' }}>
                        {noteOpen ? 'Reddet' : 'Değişiklik İste'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => decide(o.id, true)}
                      disabled={busy}
                      style={({ hovered }: any) => ({
                        flex: 1.25, height: 46, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        backgroundColor: hovered ? deep : accent, opacity: busy ? 0.6 : 1,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' as any, transition: 'background 0.15s' } as any : {}),
                      })}
                    >
                      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Check size={18} color="#fff" strokeWidth={2.6} />}
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>Onayla</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Dosya görüntüleme — sayfadan ayrılmadan (read-only) */}
      {filesFor && (
        <FilesUploadModal
          visible
          onClose={() => setFilesFor(null)}
          accentColor={accent}
          title={filesFor.patient_name ? `${filesFor.patient_name} · Dosyalar` : 'Sipariş Dosyaları'}
          splitView
          showImplant={false}
          extraGroups={allStationFileCategories()}
          hideEmptyExtraGroups
          attachments={attachments}
          onPickPhoto={() => {}}
          onPickVideo={() => {}}
          onPickScan={() => {}}
          onPickPdf={() => {}}
          onPreview={previewAttachment}
          count3D={scan3D.length}
          onPreviewAll3D={() => setViewer3DFiles(scan3D.map(a => {
            const ext = (a.filename || a.name).split('.').pop()?.toLowerCase();
            const fmt = (ext === 'ply' || ext === 'obj') ? ext : 'stl';
            return { id: a.id, name: a.name, url: a.uri, format: fmt as any };
          }))}
        />
      )}

      {/* 3D görüntüleyici */}
      {viewer3DFiles && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModalLazy
            visible
            files={viewer3DFiles}
            title={viewer3DFiles.length > 1 ? `${viewer3DFiles.length} tarama birlikte` : viewer3DFiles[0]?.name}
            onClose={() => setViewer3DFiles(null)}
          />
        </React.Suspense>
      )}

      {/* Görsel önizleme */}
      {imgViewer && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setImgViewer(null)}>
          <Pressable onPress={() => setImgViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <Image source={{ uri: imgViewer.url }} style={{ width: '100%', height: '82%' }} resizeMode="contain" />
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

export default DesignApprovalInbox;
