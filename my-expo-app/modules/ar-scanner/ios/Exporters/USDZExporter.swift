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

        guard MDLAsset.canExportFileExtension("usdz") else {
            throw NSError(domain: "USDZExporter", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "USDZ export desteklenmiyor"])
        }
        try asset.export(to: usdzURL)
    }
}
