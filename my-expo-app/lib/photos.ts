import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const BUCKET = 'work-order-photos';
const MAX_SIZE_MB = 5;

export async function pickPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  });

  if (result.canceled) return null;
  return result.assets[0].uri;
}

export async function takePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    quality: 0.8,
  });

  if (result.canceled) return null;
  return result.assets[0].uri;
}

export async function uploadPhoto(
  uri: string,
  workOrderId: string,
  uploadedBy: string,
  toothNumber?: number | null,
  caption?: string | null,
): Promise<{ storagePath: string; error: string | null }> {
  // Check file size
  const info = await FileSystem.getInfoAsync(uri, { size: true });
  if (info.exists && 'size' in info && info.size > MAX_SIZE_MB * 1024 * 1024) {
    return { storagePath: '', error: `Fotoğraf ${MAX_SIZE_MB}MB'dan küçük olmalıdır.` };
  }

  // Read as base64
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const fileName = `${Date.now()}.${ext}`;
  const storagePath = `orders/${workOrderId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, decode(base64), {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      upsert: false,
    });

  if (uploadError) return { storagePath: '', error: uploadError.message };

  const row: Record<string, any> = {
    work_order_id: workOrderId,
    storage_path: storagePath,
    uploaded_by: uploadedBy,
  };
  if (toothNumber != null) row.tooth_number = toothNumber;
  if (caption)             row.caption      = caption;

  const { error: dbError } = await supabase.from('work_order_photos').insert(row);

  if (dbError) return { storagePath: '', error: dbError.message };

  return { storagePath, error: null };
}

export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600); // 1 hour
  return data?.signedUrl ?? null;
}

export async function getSignedUrls(storagePaths: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(
    storagePaths.map(async (path) => {
      const url = await getSignedUrl(path);
      if (url) result[path] = url;
    })
  );
  return result;
}
