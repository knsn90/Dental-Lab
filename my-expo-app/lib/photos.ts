import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
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
  // Check file size — yeni expo-file-system API'sinde size her zaman dönüyor
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && 'size' in info && info.size && info.size > MAX_SIZE_MB * 1024 * 1024) {
    return { storagePath: '', error: `Fotoğraf ${MAX_SIZE_MB}MB'dan küçük olmalıdır.` };
  }

  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const fileName = `${Date.now()}.${ext}`;
  const storagePath = `orders/${workOrderId}/${fileName}`;
  const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  // Gövde seçimi — projede StageFileUpload/reviews ile aynı desen.
  //
  // Eskiden dosya base64 string olarak okunup decode ediliyordu; bu, dosyayı
  // bellekte AYNI ANDA iki kez tutuyordu (base64 ~1.33× + çözülmüş buffer 1×
  // ≈ 2.33× dosya boyutu). 5 MB sınırı sayesinde pratikte çökme üretmiyordu
  // ama gereksiz bellek baskısıydı.
  //
  // FormData + {uri} verildiğinde React Native'in ağ katmanı dosyayı doğrudan
  // diskten akıtır — JS tarafında hiç tam buffer oluşmaz.
  let body: any;
  if (typeof window !== 'undefined' &&
      (uri.startsWith('blob:') || uri.startsWith('data:') || uri.startsWith('http'))) {
    body = await (await fetch(uri)).blob();
  } else {
    const fd = new FormData();
    fd.append('file', { uri, name: fileName, type: contentType } as any);
    body = fd;
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, body, {
      contentType,
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
  if (storagePaths.length === 0) return {};
  // Single batch request (1 HTTP call) instead of N parallel requests.
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(storagePaths, 3600);
  const result: Record<string, string> = {};
  data?.forEach((row) => {
    if (row.path && row.signedUrl) result[row.path] = row.signedUrl;
  });
  return result;
}
