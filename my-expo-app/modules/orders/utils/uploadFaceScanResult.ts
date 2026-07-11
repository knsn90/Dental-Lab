// modules/orders/utils/uploadFaceScanResult.ts
//
// FaceScan native modulü tarafından üretilen .obj + .mtl + .png + .stl dosyalarını
// bir iş emrine ait work-order-photos bucket'ına ve work_order_photos tablosuna
// kaydeder. Birden fazla giriş noktası (Dosyalar tab'ı butonu, dashboard quick
// action) aynı mekanizmayı kullansın diye ortak helper.

import { supabase } from '../../../core/api/supabase';
import type { FaceScanResult } from 'ar-scanner';

interface Profile {
  id: string;
  [k: string]: any;
}

const UPLOAD_KEYS: Array<keyof FaceScanResult> = [
  'ply', 'obj', 'mtl', 'texturePNG', 'usdz', 'binarySTL', 'asciiSTL',
];

const CAPTION = '3D Yüz Tarama';

function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'obj':  return 'model/obj';
    case 'mtl':  return 'text/plain';
    case 'png':  return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'usdz': return 'model/vnd.usdz+zip';
    case 'ply':  return 'model/vnd.ply';
    case 'stl':  return 'model/stl';
    default:     return 'application/octet-stream';
  }
}

export interface UploadFaceScanOptions {
  result:        FaceScanResult;
  workOrderId:   string;
  profile:       Profile;
}

export interface UploadFaceScanReport {
  uploadedCount: number;
  errors:        string[];
}

/**
 * Bir FaceScanResult'taki tüm dosyaları tek bir work_order'a yükler.
 * Her dosya kendi başına dener; biri fail olursa diğerleri devam eder.
 */
export async function uploadFaceScanResult({
  result, workOrderId, profile,
}: UploadFaceScanOptions): Promise<UploadFaceScanReport> {
  const ts = Date.now();
  const errors: string[] = [];
  let uploadedCount = 0;

  // ÖNEMLİ: OBJ → MTL → texture referansları orijinal dosya adlarına göredir
  // (örn .obj içinde "mtllib baked_mesh.mtl"). Bu yüzden dosyaları yeniden
  // ADLANDIRMADAN, per-scan bir alt klasöre orijinal adlarıyla yüklüyoruz ki
  // teknisyen indirip exocad'e attığında referanslar bozulmasın.
  const folder = `orders/${workOrderId}/facescan-${ts}`;

  for (const key of UPLOAD_KEYS) {
    const localPath = result[key];
    if (!localPath) continue;

    const basename = localPath.split('/').pop() || `${key}.bin`;
    const ext = basename.split('.').pop() || '';
    const mime = mimeForExt(ext);
    const uri = localPath.startsWith('file://') ? localPath : `file://${localPath}`;
    const storagePath = `${folder}/${basename}`;

    const fd = new FormData();
    fd.append('file', { uri, name: basename, type: mime } as any);

    const { error: upErr } = await supabase.storage
      .from('work-order-photos')
      .upload(storagePath, fd, { contentType: mime, upsert: false });

    if (upErr) {
      errors.push(`${basename}: ${upErr.message}`);
      continue;
    }

    const { error: dbErr } = await supabase
      .from('work_order_photos')
      .insert({
        work_order_id: workOrderId,
        storage_path:  storagePath,
        uploaded_by:   profile.id,
        lab_id:        profile.lab_id ?? null,
        caption:       CAPTION,
      });

    if (dbErr) {
      errors.push(`${basename} kayıt: ${dbErr.message}`);
      void supabase.storage.from('work-order-photos').remove([storagePath]);
      continue;
    }

    uploadedCount += 1;
  }

  return { uploadedCount, errors };
}
