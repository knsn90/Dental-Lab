/**
 * Bir başarılı face capture sonucu. Tüm yollar yerel dosya sistemi path'leridir
 * (file:// öneki yok — expo-file-system'a doğrudan verilebilir).
 *
 * .obj + .mtl + .png üçlüsü exocad/3Shape/Medit gibi CAD yazılımlarına direkt
 * import edilebilir bir paket oluşturur (üçü aynı klasördedir).
 */
export type FaceScanResult = {
  /** ASCII STL — kullanılmıyor (her modda null). */
  asciiSTL: string | null;
  /** Binary STL — arka kamera modlarında dolu; ön kamerada null. */
  binarySTL: string | null;
  /** Wavefront OBJ — arka kamera modları + ön kamera (dokulu yüz, mm; doku pişirilemezse null). */
  obj: string | null;
  /** OBJ ile aynı klasörde MTL (texture referansı). */
  mtl: string | null;
  /** OBJ dokusu — arka kamerada PNG, ön kamerada 4096 px pişirilmiş JPG (ad tarihsel). */
  texturePNG: string | null;
  /** Object Capture (LiDAR fotogrametri) USDZ — gömülü texture'lı yüksek kalite mesh. */
  usdz: string | null;
  /** Köşe renkli binary PLY (mm) — ön kamera (TrueDepth) modu; dokulu OBJ ile aynı uzayda. */
  ply: string | null;
};
