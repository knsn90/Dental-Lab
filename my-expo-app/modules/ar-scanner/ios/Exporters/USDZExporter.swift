import Foundation
import ModelIO
import SceneKit
import SceneKit.ModelIO

// OBJ bundle (obj + mtl + texture) → USDZ (tek dosya, texture GÖMÜLÜ).
//
// Neden: USDZ tek dosya ve texture'ı içine gömer → indirince macOS Quick Look /
// iOS AR Quick Look renkli açar (OBJ'nin harici MTL/PNG'si Quick Look'ta gri çıkar).
// Web viewer OBJ'yi texture'lı gösterir; USDZ ise "her yerde renkli açılan" dosya.

enum USDZExporter {

    /// objURL'deki OBJ'yi (aynı klasördeki MTL + texture ile) usdzURL'e yazar.
    /// Başarısız olursa hata fırlatır (çağıran best-effort ele alır).
    static func export(objURL: URL, to usdzURL: URL) throws {
        let asset = MDLAsset(url: objURL)
        asset.loadTextures()   // MTL'deki map_Kd PNG'sini yükle (gömme için şart)

        // 1) ModelIO. Cihazda çoğu zaman "desteklenmiyor" diyor ya da hata veriyor (2026-11-16:
        //    birleşik taramada USDZ hiç oluşmadı, önizleme bozuk çıktı).
        if MDLAsset.canExportFileExtension("usdz"), (try? asset.export(to: usdzURL)) != nil,
           FileManager.default.fileExists(atPath: usdzURL.path) {
            return
        }
        // 2) SceneKit: sahneyi USDZ olarak yazar (iOS'ta desteklenen yol).
        try? FileManager.default.removeItem(at: usdzURL)
        let scene = SCNScene(mdlAsset: asset)
        let ok = scene.write(to: usdzURL, options: nil, delegate: nil, progressHandler: nil)
        guard ok, FileManager.default.fileExists(atPath: usdzURL.path) else {
            throw NSError(domain: "USDZExporter", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "USDZ export başarısız"])
        }
    }
}
