/**
 * AttachmentUploader — destek konuşmasında composer altında yer alan dropzone.
 *
 *  - Web: drag&drop + dosya seçici
 *  - Native: expo-document-picker
 *
 * Yüklenen her dosya `support-attachments` bucket'ına `{ticket_id}/{ts}_{name}`
 * pattern'i ile yazılır, ardından `support_attachments` tablosuna kayıt düşer.
 *
 * onUploaded callback'i parent'a yüklenen ek listesini iletir; composer
 * mesaj gönderirken bu eklerin id'lerini message_id ile ilişkilendirir.
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Paperclip, X, Image as ImageIcon, FileText, Box, FileAudio, FileVideo, FileWarning } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { createAttachmentRecord } from '../api';
import type { SupportAttachment, SupportAttachmentKind } from '../types';
import { ACCENT_ORANGE } from '../types';

const BUCKET = 'support-attachments';
const MAX_BYTES = 100 * 1024 * 1024; // 100MB

interface Props {
  ticketId: string;
  /** Yükleme tamamlanınca verilen ek kaydını parent'a bildir */
  onUploaded?: (att: SupportAttachment) => void;
  /** Hata callback'i — composer toast göstersin */
  onError?: (msg: string) => void;
  compact?: boolean;
}

interface PendingItem {
  localId:  string;
  name:     string;
  size:     number;
  progress: number | null; // null = belirsiz
  error?:   string;
  kind:     SupportAttachmentKind;
}

function detectKind(name: string, mime?: string | null): SupportAttachmentKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['stl', 'obj', 'ply', '3mf'].includes(ext))                return 'stl';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext))               return 'recording';
  if (['log', 'txt'].includes(ext))                              return 'log';
  if (mime?.startsWith('image/'))                                return 'image';
  if (mime?.startsWith('video/'))                                return 'recording';
  return 'file';
}

function iconForKind(k: SupportAttachmentKind) {
  switch (k) {
    case 'image':     return ImageIcon;
    case 'stl':       return Box;
    case 'recording': return FileVideo;
    case 'log':       return FileWarning;
    case 'screenshot':return ImageIcon;
    default:          return FileText;
  }
}

export function AttachmentUploader({ ticketId, onUploaded, onError, compact }: Props) {
  const [items, setItems]   = useState<PendingItem[]>([]);
  const [dragOver, setDrag] = useState(false);
  const inputRef            = useRef<HTMLInputElement | null>(null);

  const uploadFile = useCallback(async (file: File | Blob, fileName: string, mime?: string | null) => {
    if (file.size > MAX_BYTES) {
      onError?.(`${fileName} 100MB'den büyük`);
      return;
    }
    const kind    = detectKind(fileName, mime);
    const localId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const safeName = fileName.replace(/[^\w.\-]+/g, '_');
    const path     = `${ticketId}/${Date.now()}_${safeName}`;

    setItems(prev => [...prev, { localId, name: fileName, size: file.size, progress: null, kind }]);

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: mime ?? (file as any).type ?? 'application/octet-stream',
      upsert: false,
    });

    if (error) {
      setItems(prev => prev.map(p => p.localId === localId ? { ...p, error: error.message } : p));
      onError?.(`${fileName}: ${error.message}`);
      return;
    }

    const { data: rec, error: recErr } = await createAttachmentRecord({
      ticket_id:    ticketId,
      kind,
      storage_path: path,
      file_name:    fileName,
      file_size:    file.size,
      mime_type:    mime ?? (file as any).type ?? null,
    });

    if (recErr || !rec) {
      setItems(prev => prev.map(p => p.localId === localId ? { ...p, error: recErr?.message ?? 'kayıt hatası' } : p));
      onError?.(`${fileName} kaydı oluşturulamadı`);
      return;
    }

    setItems(prev => prev.map(p => p.localId === localId ? { ...p, progress: 100 } : p));
    onUploaded?.(rec as SupportAttachment);
  }, [ticketId, onUploaded, onError]);

  const handleWebFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const f of list) await uploadFile(f, f.name, f.type);
  }, [uploadFile]);

  const openPicker = useCallback(async () => {
    if (Platform.OS === 'web') {
      inputRef.current?.click();
      return;
    }
    try {
      const Doc = await import('expo-document-picker');
      const res = await Doc.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      for (const asset of res.assets ?? []) {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        await uploadFile(blob, asset.name ?? 'file', asset.mimeType ?? null);
      }
    } catch (e: any) {
      onError?.(e?.message ?? 'dosya seçilemedi');
    }
  }, [uploadFile, onError]);

  // ─── Web drag/drop handlers ───────────────────────────────────────────────
  const onDragOver = (e: any) => { e.preventDefault?.(); setDrag(true); };
  const onDragLeave = () => setDrag(false);
  const onDrop = async (e: any) => {
    e.preventDefault?.();
    setDrag(false);
    const dt = e.dataTransfer;
    if (dt?.files?.length) await handleWebFiles(dt.files);
  };

  return (
    <View className="gap-2">
      {/* Hidden web input */}
      {Platform.OS === 'web' ? (
        <input
          ref={inputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) handleWebFiles(e.target.files);
            e.target.value = '';
          }}
        />
      ) : null}

      {/* Dropzone / picker trigger */}
      <Pressable
        onPress={openPicker}
        // @ts-ignore RN-Web event proxies
        onDragOver={Platform.OS === 'web' ? onDragOver : undefined}
        // @ts-ignore
        onDragLeave={Platform.OS === 'web' ? onDragLeave : undefined}
        // @ts-ignore
        onDrop={Platform.OS === 'web' ? onDrop : undefined}
        className={[
          'flex-row items-center gap-2 rounded-xl px-3 py-2 border border-dashed',
          dragOver ? 'bg-orange-50 border-orange-300' : 'border-slate-300 bg-slate-50',
          compact ? '' : 'min-h-[44px]',
        ].join(' ')}
      >
        <Paperclip size={14} color={ACCENT_ORANGE} strokeWidth={1.8} />
        <Text className="text-xs text-slate-600 flex-1">
          {dragOver ? 'Bırak — yüklensin' : 'Dosya ekle (STL · görsel · log · video, max 100MB)'}
        </Text>
      </Pressable>

      {/* Pending / completed list */}
      {items.length > 0 && (
        <View className="gap-1">
          {items.map((it) => {
            const Icon = iconForKind(it.kind);
            return (
              <View
                key={it.localId}
                className="flex-row items-center gap-2 rounded-lg bg-white border border-slate-200 px-2 py-1.5"
              >
                <Icon size={14} color="#475569" strokeWidth={1.7} />
                <Text className="text-[11px] text-slate-700 flex-1" numberOfLines={1}>
                  {it.name} <Text className="text-slate-400">· {(it.size / 1024).toFixed(0)} KB</Text>
                </Text>
                {it.error ? (
                  <Text className="text-[10px] text-rose-600">{it.error}</Text>
                ) : it.progress === 100 ? (
                  <Text className="text-[10px] text-emerald-600">yüklendi</Text>
                ) : (
                  <ActivityIndicator size="small" color={ACCENT_ORANGE} />
                )}
                <Pressable onPress={() => setItems(prev => prev.filter(p => p.localId !== it.localId))} hitSlop={6}>
                  <X size={12} color="#94A3B8" />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
