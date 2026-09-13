/**
 * AttachmentList — message bubble içinde / panelde ek dosyaları gösterir.
 *
 * - image → küçük signed-url thumbnail
 * - stl   → "STL Önizle" butonu (TODO: ModelViewer modal entegrasyonu)
 * - diğer → indirilebilir chip
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, Linking } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { Box, Download, FileText, Image as ImageIcon, FileVideo, FileWarning } from '../../../core/ui/icons';
import type { SupportAttachment, SupportAttachmentKind } from '../types';

const BUCKET = 'support-attachments';
const SIGNED_TTL = 60 * 30; // 30 dk

function iconForKind(k: SupportAttachmentKind) {
  switch (k) {
    case 'image':     return ImageIcon;
    case 'stl':       return Box;
    case 'recording': return FileVideo;
    case 'log':       return FileWarning;
    default:          return FileText;
  }
}

export function AttachmentList({
  attachments,
  onPreviewStl,
}: {
  attachments: SupportAttachment[];
  onPreviewStl?: (att: SupportAttachment, signedUrl: string) => void;
}) {
  const [signed, setSigned] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paths = attachments.map(a => a.storage_path);
      if (paths.length === 0) return;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      data.forEach((r, idx) => { if (r.signedUrl) map[paths[idx]] = r.signedUrl; });
      setSigned(map);
    })();
    return () => { cancelled = true; };
  }, [attachments]);

  if (!attachments.length) return null;

  return (
    <View className="flex-row flex-wrap gap-2 mt-2">
      {attachments.map((att) => {
        const url = signed[att.storage_path];
        const Icon = iconForKind(att.kind);

        if (att.kind === 'image' && url) {
          return (
            <Pressable
              key={att.id}
              onPress={() => url && Linking.openURL(url)}
              className="rounded-lg overflow-hidden border border-slate-200 bg-white"
            >
              <Image source={{ uri: url }} style={{ width: 96, height: 96 }} resizeMode="cover" />
            </Pressable>
          );
        }

        // 3D dosyalar: STL / PLY / OBJ → tek 3D viewer (att.kind sadece 'stl' tutuyordu)
        const ext = att.file_name.toLowerCase().split('.').pop();
        const is3D = att.kind === 'stl' || ext === 'stl' || ext === 'ply' || ext === 'obj';
        if (is3D) {
          const fmtLabel = (ext ?? 'stl').toUpperCase();
          return (
            <Pressable
              key={att.id}
              onPress={() => url && (onPreviewStl ? onPreviewStl(att, url) : Linking.openURL(url))}
              className="flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 bg-slate-900 border border-slate-900"
            >
              <Box size={13} color="#FFF" strokeWidth={1.8} />
              <Text className="text-[11px] text-white font-medium">{fmtLabel} · {att.file_name}</Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={att.id}
            onPress={() => url && Linking.openURL(url)}
            className="flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 bg-slate-50 border border-slate-200"
          >
            <Icon size={13} color="#475569" strokeWidth={1.7} />
            <Text className="text-[11px] text-slate-700" numberOfLines={1}>{att.file_name}</Text>
            <Download size={11} color="#94A3B8" />
          </Pressable>
        );
      })}
    </View>
  );
}
