/**
 * Not/çizim nesneleri — three.js geometrisi üretimi.
 *
 * Neden mesh'in ÇOCUĞU olarak eklenir: noktalar mesh'in local uzayında
 * saklanıyor. Nesneyi o mesh'e child yapınca grubun döndürmesi, auto-stack
 * offset'i, fit ve ortalama ÜCRETSİZ doğru çalışır — dünya uzayında tutulsa
 * model her yüklenişte biraz farklı yere oturduğu için işaret kayardı.
 *
 * Z-kavgası (yüzeyle iç içe geçen tüp) shader hilesiyle değil, YAKALAMA
 * anında çözülür: nokta, çarpma normali boyunca tüp yarıçapı kadar dışarı
 * kaydırılarak saklanır. Böylece tüp yüzeyin hemen üstünde durur ve derinlik
 * testi doğru kalır (modelin arkasına geçen çizim gizlenir — 3D'de olması
 * gereken davranış).
 */
import * as THREE from 'three';
import type { AnnotationKind, Point3, ScanAnnotation } from './types';

/** Nesnelerin adı — sahne temizliğinde ve raycast filtresinde kullanılır. */
export const ANNOT_OBJ_NAME = '__scan_annot__';

const TUBE_RADIAL_SEGMENTS = 6;

function vec(p: Point3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

/** Aynı noktanın tekrarı eğriyi patlatır (NaN teğet) → ayıkla. */
function dedupe(points: Point3[], eps = 1e-4): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const p of points) {
    const v = vec(p);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) continue;
    if (out.length === 0 || out[out.length - 1].distanceTo(v) > eps) out.push(v);
  }
  return out;
}

function basicMat(color: string): THREE.Material {
  // MeshBasic: notlar sahne ışığından etkilenmesin (renk kimliği = kalem rengi).
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false });
}

/** Serbest çizgi — CatmullRom eğrisinden tüp. */
function buildStroke(pts: THREE.Vector3[], color: string, radius: number): THREE.Object3D | null {
  if (pts.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
  // Segment sayısı nokta sayısıyla ölçeklenir; 1200'de sınırlanır (perf).
  const seg = Math.min(1200, Math.max(8, pts.length * 3));
  const geom = new THREE.TubeGeometry(curve, seg, radius, TUBE_RADIAL_SEGMENTS, false);
  const mesh = new THREE.Mesh(geom, basicMat(color));
  // Uçlara küre: tüp uçları açık kalıyor, kalem izi kesik görünüyordu.
  const capGeom = new THREE.SphereGeometry(radius, 8, 6);
  const capMat = basicMat(color);
  const a = new THREE.Mesh(capGeom, capMat); a.position.copy(pts[0]); mesh.add(a);
  const b = new THREE.Mesh(capGeom, capMat); b.position.copy(pts[pts.length - 1]); mesh.add(b);
  return mesh;
}

/** Ok — gövde tüpü + koni baş. */
function buildArrow(pts: THREE.Vector3[], color: string, radius: number): THREE.Object3D | null {
  if (pts.length < 2) return null;
  const from = pts[0];
  const to = pts[pts.length - 1];
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 1e-4) return null;
  dir.normalize();

  const headLen = Math.min(len * 0.42, radius * 6);
  const shaftLen = Math.max(len - headLen, len * 0.25);
  const group = new THREE.Group();

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, shaftLen, TUBE_RADIAL_SEGMENTS),
    basicMat(color),
  );
  // CylinderGeometry +Y yönünde; yönü quaternion ile döndür.
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  shaft.quaternion.copy(quat);
  shaft.position.copy(from).addScaledVector(dir, shaftLen / 2);
  group.add(shaft);

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 2.4, headLen, 10),
    basicMat(color),
  );
  head.quaternion.copy(quat);
  head.position.copy(to).addScaledVector(dir, -headLen / 2);
  group.add(head);

  return group;
}

/** Metin etiketi — canvas dokulu sprite (offline, ek font/kütüphane yok). */
function buildLabel(text: string, color: string, scale: number): THREE.Sprite | null {
  if (typeof document === 'undefined') return null;
  const lines = wrap(text, 22).slice(0, 4);
  const pad = 14;
  const fontSize = 30;
  const lineH = fontSize * 1.25;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const wPx = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
  const hPx = lines.length * lineH + pad * 2;
  canvas.width = Math.ceil(wPx);
  canvas.height = Math.ceil(hPx);

  const c = canvas.getContext('2d')!;
  c.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  c.textBaseline = 'top';
  // Balon: kalem renginde kenar + beyaz zemin (her iki temada okunur)
  roundRect(c, 1, 1, canvas.width - 2, canvas.height - 2, 14);
  c.fillStyle = 'rgba(255,255,255,0.96)';
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = color;
  c.stroke();
  c.fillStyle = '#0A0A0A';
  lines.forEach((l, i) => c.fillText(l, pad, pad + i * lineH));

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, toneMapped: false }));
  // Dünya birimi: yüksekliği ~scale mm olacak şekilde oranla
  const h = scale;
  sprite.scale.set((canvas.width / canvas.height) * h, h, 1);
  return sprite;
}

function wrap(text: string, max: number): string[] {
  const words = String(text).trim().split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line) { line = w; continue; }
    if ((line + ' ' + w).length <= max) line += ' ' + w;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out.length ? out : [''];
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * Tek bir notun 3D nesnesi. `labelScale` model ölçeğine göre etiket boyu (mm).
 * Dönen nesne, notun çapalandığı MESH'e child olarak eklenmelidir.
 */
export function buildAnnotationObject(
  a: Pick<ScanAnnotation, 'id' | 'kind' | 'color' | 'width' | 'points' | 'text'>,
  labelScale = 3,
): THREE.Object3D | null {
  const pts = dedupe(a.points);
  if (pts.length === 0) return null;
  const radius = Math.max(0.05, Math.min(5, a.width || 0.35));

  let obj: THREE.Object3D | null = null;
  if (a.kind === 'stroke') obj = buildStroke(pts, a.color, radius);
  else if (a.kind === 'arrow') obj = buildArrow(pts, a.color, radius);
  else {
    // note: iğne (küre) + metin balonu
    const g = new THREE.Group();
    const pin = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.8, 12, 10), basicMat(a.color));
    pin.position.copy(pts[0]);
    g.add(pin);
    if (a.text) {
      const label = buildLabel(a.text, a.color, labelScale);
      if (label) {
        label.position.copy(pts[0]);
        label.position.y += labelScale * 0.9;
        g.add(label);
      }
    }
    obj = g;
  }
  if (!obj) return null;

  obj.name = ANNOT_OBJ_NAME;
  obj.userData.annotationId = a.id;
  obj.traverse((o) => { o.userData.annotationId = a.id; });
  // Notlar modelin ÜSTÜNDE çizilsin (aynı derinlikte kalırsa yüzeyle titreşir)
  obj.renderOrder = 3;
  return obj;
}

/** Not nesnelerini serbest bırak — viewer kapanınca GPU'da kalmasın. */
export function disposeAnnotationObject(obj: THREE.Object3D) {
  obj.traverse((o: any) => {
    if (o.geometry) o.geometry.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
    else if (m) { m.map?.dispose?.(); m.dispose?.(); }
  });
  obj.parent?.remove(obj);
}

/** Yakalama anında noktayı normal boyunca dışarı kaydır (z-kavgası önlemi). */
export function offsetAlongNormal(
  point: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
): THREE.Vector3 {
  return point.clone().addScaledVector(normal, radius * 1.25);
}

export type { AnnotationKind };
