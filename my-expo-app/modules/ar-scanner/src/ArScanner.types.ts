/**
 * Bir başarılı face capture sonucu. Tüm yollar yerel dosya sistemi path'leridir
 * (file:// öneki yok — expo-file-system'a doğrudan verilebilir).
 *
 * .obj + .mtl + .png üçlüsü exocad/3Shape/Medit gibi CAD yazılımlarına direkt
 * import edilebilir bir paket oluşturur (üçü aynı klasördedir).
 */
export type FaceScanResult = {
  /** ASCII STL — TrueDepth fallback'te dolu, Object Capture'da null. */
  asciiSTL: string | null;
  /** Binary STL — TrueDepth fallback'te dolu, Object Capture'da null. */
  binarySTL: string | null;
  /** Wavefront OBJ — TrueDepth fallback'te dolu. */
  obj: string | null;
  /** OBJ ile aynı klasörde MTL (texture referansı). */
  mtl: string | null;
  /** Photographic texture (AR scene snapshot). */
  texturePNG: string | null;
  /** Object Capture (LiDAR fotogrametri) USDZ — gömülü texture'lı yüksek kalite mesh. */
  usdz: string | null;
  /** Vertex renkli PLY — tek dosya, exocad uyumlu, texture gömülü (Object Capture nihai çıktısı). */
  ply: string | null;
};
