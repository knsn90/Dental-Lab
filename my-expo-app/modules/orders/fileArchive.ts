// Zip tarama arşivi → 3D viewer köprüsü.
// Bazı klinikler tüm taramaları (Üst/Alt/Kapanış çene) tek bir .zip içine koyup
// yüklüyor. Bu dosya, zip'i TARAYICI İÇİNDE (fflate) açıp içindeki mesh'leri
// (STL/PLY/OBJ) ve görselleri blob-URL'e çevirir → Viewer3DModal doğrudan
// gösterebilir. Yalnız web (native WebView blob-URL'i alamaz).
import { unzip, unzipSync, type Unzipped } from 'fflate';
import type { ViewerFile } from '../viewer-3d/types';

const MESH_RE = /\.(stl|ply|obj)$/i;
const IMG_RE  = /\.(png|jpe?g|webp|gif|bmp)$/i;
// macOS zip artığı + gizli dosyalar
const JUNK_RE = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|\._)/i;

export function is3DExt(path: string): 'stl' | 'ply' | 'obj' | null {
  const ext = (path ?? '').toLowerCase().split('.').pop();
  return ext === 'stl' || ext === 'ply' || ext === 'obj' ? ext : null;
}
export function isImageExt(path: string): boolean {
  return IMG_RE.test(path ?? '');
}
export function isArchiveExt(path: string): boolean {
  return /\.zip$/i.test(path ?? '');
}

const MIME: Record<string, string> = {
  stl: 'model/stl', ply: 'application/octet-stream', obj: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
};

export interface UnzipResult {
  /** 3D mesh dosyaları (blob URL) — Viewer3DModal.files için hazır */
  files: ViewerFile[];
  /** Zip içindeki görseller (blob URL) — referans/lightbox için */
  images: { name: string; url: string }[];
  /** Kapanışta revoke edilecek tüm blob URL'ler */
  objectUrls: string[];
  /** Tanınmayan (mesh/görsel olmayan) entry adları */
  other: string[];
}

function unzipAsync(buf: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

/**
 * İmzalı bir .zip URL'ini indir + aç, içindeki mesh/görselleri blob-URL'e çevir.
 * Dönüşteki objectUrls'i çağıran taraf viewer kapanınca revoke etmeli.
 */
export async function unzipToViewer(url: string, opts?: { idPrefix?: string }): Promise<UnzipResult> {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  const data = await unzipAsync(buf);

  const objectUrls: string[] = [];
  const mkUrl = (bytes: Uint8Array, ext: string) => {
    const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' }));
    objectUrls.push(u);
    return u;
  };

  const meshEntries: { name: string; dir: string; bytes: Uint8Array }[] = [];
  const imgEntries:  { name: string; dir: string; bytes: Uint8Array }[] = [];
  const other: string[] = [];

  for (const [path, bytes] of Object.entries(data)) {
    if (!bytes || bytes.length === 0) continue;        // klasör entry'si
    if (JUNK_RE.test(path)) continue;
    const base = path.split('/').pop() ?? path;
    const dir  = path.slice(0, path.length - base.length);
    if (MESH_RE.test(base))      meshEntries.push({ name: base, dir, bytes });
    else if (IMG_RE.test(base))  imgEntries.push({ name: base, dir, bytes });
    else                         other.push(base);
  }

  // Görseller önce (obj texture eşlemesi için gerekli)
  const imagesFull = imgEntries.map((e) => ({
    name: e.name, dir: e.dir,
    url: mkUrl(e.bytes, (e.name.split('.').pop() ?? '').toLowerCase()),
  }));

  const prefix = opts?.idPrefix ?? 'zip';
  const files: ViewerFile[] = meshEntries.map((e, i) => {
    const fmt = is3DExt(e.name)!;
    const url = mkUrl(e.bytes, fmt);
    // OBJ → aynı klasördeki ilk görseli texture olarak eşle
    const textureUrl = fmt === 'obj'
      ? (imagesFull.find((im) => im.dir === e.dir)?.url ?? null)
      : null;
    return { id: `${prefix}-mesh-${i}`, name: e.name, url, format: fmt, textureUrl };
  });

  return {
    files,
    images: imagesFull.map(({ name, url }) => ({ name, url })),
    objectUrls,
    other,
  };
}

// ── Native (iOS/Android) varyantı ────────────────────────────────────────────
// URL.createObjectURL native'de yok. Bunun yerine mesh/görselleri base64 data-URI'ye
// çeviriyoruz; native 3D viewer (WebView) ve RN <Image> `data:` URI'yi fetch/gösterebilir.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? B64[b2 & 63] : '=';
  }
  return out;
}

export async function unzipToViewerNative(url: string, opts?: { idPrefix?: string }): Promise<UnzipResult> {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  // Native'de fflate async `unzip` Web Worker ister (Hermes'te yok) → senkron unzipSync.
  const data = unzipSync(buf);

  const mkUrl = (bytes: Uint8Array, ext: string) =>
    `data:${MIME[ext] ?? 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;

  const meshEntries: { name: string; dir: string; bytes: Uint8Array }[] = [];
  const imgEntries:  { name: string; dir: string; bytes: Uint8Array }[] = [];
  const other: string[] = [];

  for (const [path, bytes] of Object.entries(data)) {
    if (!bytes || bytes.length === 0) continue;
    if (JUNK_RE.test(path)) continue;
    const base = path.split('/').pop() ?? path;
    const dir  = path.slice(0, path.length - base.length);
    if (MESH_RE.test(base))      meshEntries.push({ name: base, dir, bytes });
    else if (IMG_RE.test(base))  imgEntries.push({ name: base, dir, bytes });
    else                         other.push(base);
  }

  const imagesFull = imgEntries.map((e) => ({
    name: e.name, dir: e.dir,
    url: mkUrl(e.bytes, (e.name.split('.').pop() ?? '').toLowerCase()),
  }));

  const prefix = opts?.idPrefix ?? 'zip';
  const files: ViewerFile[] = meshEntries.map((e, i) => {
    const fmt = is3DExt(e.name)!;
    const textureUrl = fmt === 'obj'
      ? (imagesFull.find((im) => im.dir === e.dir)?.url ?? null)
      : null;
    return { id: `${prefix}-mesh-${i}`, name: e.name, url: mkUrl(e.bytes, fmt), format: fmt, textureUrl };
  });

  return {
    files,
    images: imagesFull.map(({ name, url }) => ({ name, url })),
    objectUrls: [],
    other,
  };
}
