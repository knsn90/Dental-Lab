/**
 * İmplant parça notları — istemci katmanı.
 *
 * Basit tutuldu (kullanıcı kararı): talep/durum akışı YOK. Sipariş detayında
 * serbest metin not + görsel; iki taraf da görür, karşı tarafa yalnız uygulama
 * içi bildirim düşer. Amaç: "hangi parçayı almıştık, modeli/kodu neydi" bilgisi
 * aylar sonra mesajlar aranmadan bulunsun.
 *
 * Görseller `work-order-photos` deposunda `orders/<sipariş>/parts/<not>/…` altında
 * (bu yol için storage politikaları zaten var); depo private → imzalı URL.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface ImplantNotePhoto {
  id: string;
  note_id: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface ImplantNote {
  id: string;
  work_order_id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author?: { id: string; full_name: string | null; user_type: string | null } | null;
  photos: ImplantNotePhoto[];
}

const SELECT =
  'id, work_order_id, body, created_by, created_at, updated_at,' +
  ' author:profiles!order_implant_notes_created_by_fkey(id, full_name, user_type),' +
  ' photos:order_implant_note_photos(id, note_id, storage_path, uploaded_by, created_at)';

export async function fetchImplantNotes(orderId: string): Promise<ImplantNote[]> {
  const { data, error } = await supabase
    .from('order_implant_notes')
    .select(SELECT)
    .eq('work_order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(n => ({ ...n, photos: n.photos ?? [] })) as ImplantNote[];
}

/**
 * Notlara iliştirilmiş görselleri DOSYA LİSTESİ biçiminde döndürür.
 *
 * Parça görselleri ayrı tabloda yaşıyor (order_implant_note_photos) ama kullanıcı
 * için "siparişe eklenmiş bir dosya"; Dosyalar sekmesinde de görünmesi isteniyor.
 * Kopyalama YOK — aynı depo nesnesi okuma anında listeye katılır, silme hâlâ
 * yalnız notun üstünden yapılır.
 */
export async function fetchNotePhotosAsFiles(
  orderId: string,
): Promise<{ id: string; storage_path: string; caption: string; created_at: string; __fromNote: true }[]> {
  const notes = await fetchImplantNotes(orderId);
  return notes.flatMap(n =>
    n.photos.map(p => ({
      id: p.id,
      storage_path: p.storage_path,
      caption: (n.body ?? '').trim().slice(0, 60) || 'Parça notu',
      created_at: p.created_at,
      __fromNote: true as const,
    })),
  );
}

export async function addImplantNote(orderId: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('add_implant_note', { p_order: orderId, p_body: body });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updateImplantNote(noteId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('update_implant_note', { p_note: noteId, p_body: body });
  if (error) throw new Error(error.message);
}

export async function deleteImplantNote(noteId: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_implant_note', { p_note: noteId });
  if (error) throw new Error(error.message);
  const paths = (data ?? []) as string[];
  if (paths.length) void supabase.storage.from('work-order-photos').remove(paths);
}

/** Web'de File/Blob, native'de {uri,name,type}. */
export type NoteAsset =
  | { kind: 'file'; file: File | Blob; name: string; type: string }
  | { kind: 'uri';  uri: string;       name: string; type: string };

export async function uploadNotePhoto(
  orderId: string, noteId: string, asset: NoteAsset,
): Promise<{ id: string; path: string }> {
  const safe = asset.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `orders/${orderId}/parts/${noteId}/${Date.now()}_${safe}`;

  let body: any;
  if (asset.kind === 'file') {
    body = asset.file;
  } else {
    const fd = new FormData();
    fd.append('file', { uri: asset.uri, name: safe, type: asset.type } as any);
    body = fd;
  }

  const { error: upErr } = await supabase.storage
    .from('work-order-photos')
    .upload(path, body, { contentType: asset.type || 'image/jpeg', upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await supabase.rpc('add_implant_note_photo', { p_note: noteId, p_path: path });
  if (error) {
    void supabase.storage.from('work-order-photos').remove([path]);
    throw new Error(error.message);
  }
  return { id: data as string, path };
}

export async function deleteNotePhoto(photoId: string): Promise<void> {
  const { data, error } = await supabase.rpc('delete_implant_note_photo', { p_photo: photoId });
  if (error) throw new Error(error.message);
  if (data) void supabase.storage.from('work-order-photos').remove([data as string]);
}

/** Private depo → imzalı URL (yol → url). */
export async function signNotePhotos(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from('work-order-photos').createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  (data ?? []).forEach((d: any, i: number) => {
    const url = d?.signedUrl ?? d?.signedURL;
    if (url) out[d?.path ?? paths[i]] = url;
  });
  return out;
}

/**
 * Siparişin notları + (devam siparişinde) asıl işin notları.
 * Asıl işin notları salt-okunur gösterilir — "geçicide ne almıştık" sorusu
 * mesaj aramadan cevaplanır.
 */
export function useImplantNotes(orderId: string | undefined, parentOrderId?: string | null) {
  const [notes, setNotes] = useState<ImplantNote[]>([]);
  const [parentNotes, setParentNotes] = useState<ImplantNote[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) { setLoading(false); return; }
    try {
      setError(null);
      const [own, parent] = await Promise.all([
        fetchImplantNotes(orderId),
        parentOrderId ? fetchImplantNotes(parentOrderId) : Promise.resolve([] as ImplantNote[]),
      ]);
      setNotes(own);
      setParentNotes(parent);
      const paths = [...own, ...parent].flatMap(n => n.photos.map(p => p.storage_path));
      setPhotoUrls(await signNotePhotos(paths));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [orderId, parentOrderId]);

  useEffect(() => { void load(); }, [load]);

  return { notes, parentNotes, photoUrls, loading, error, refetch: load };
}
