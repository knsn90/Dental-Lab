// core/storage/uploadWithProgress.ts
// XHR-tabanlı supabase storage upload — gerçek progress bar için.
// Supabase JS SDK fetch ile çalışır, native fetch upload progress yayınlamaz.
// Bu helper XMLHttpRequest kullanarak `xhr.upload.onprogress` üzerinden
// yüzde bildirir. Sadece web'de geçerli (XMLHttpRequest native'de yok).

import { supabase } from '../api/supabase';

export interface XhrUploadParams {
  bucket:      string;
  file:        File | Blob;
  path:        string;
  contentType: string;
  onProgress:  (pct: number) => void;
  upsert?:     boolean;
}

/**
 * Web'de gerçek progress callback'i ile dosya yükler. Hata varsa string
 * döner; başarılıysa null. Native'de XHR yoksa null döner ve onProgress
 * indeterminate (0 sonra 100) çağrılır — caller bunu fallback olarak ele
 * almalı veya supabase.storage.upload kullanmalı.
 */
export async function uploadWithProgress({
  bucket, file, path, contentType, onProgress, upsert = false,
}: XhrUploadParams): Promise<string | null> {
  const supabaseUrl  = (supabase as any).supabaseUrl  ?? (supabase as any).restUrl?.replace(/\/rest\/v1\/?$/, '');
  const session      = (await supabase.auth.getSession()).data.session;
  const accessToken  = session?.access_token;
  const anonKey      = (supabase as any).supabaseKey ?? (supabase as any).rest?.headers?.apikey;

  if (!supabaseUrl || !accessToken) return 'auth missing for XHR upload';
  if (typeof XMLHttpRequest === 'undefined') return 'XMLHttpRequest unavailable';

  return new Promise<string | null>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    if (anonKey) xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', upsert ? 'true' : 'false');

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(null);
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { const j = JSON.parse(xhr.responseText); msg = j.message ?? j.error ?? msg; } catch {}
        resolve(msg);
      }
    };
    xhr.onerror = () => resolve('network error');
    xhr.onabort = () => resolve('aborted');
    xhr.send(file);
  });
}
