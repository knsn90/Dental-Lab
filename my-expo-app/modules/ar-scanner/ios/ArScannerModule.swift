import ExpoModulesCore
import ARKit
import RealityKit
import SwiftUI
import UIKit

public class ArScannerModule: Module {

    public func definition() -> ModuleDefinition {
        Name("ArScanner")

        // Cihaz 3D tarama destekliyor mu?
        // Object Capture (LiDAR fotogrametri) VEYA TrueDepth face tracking.
        Function("isSupported") { () -> Bool in
            return Self.objectCaptureSupported() || ARFaceTrackingConfiguration.isSupported
        }

        // Object Capture (LiDAR) özel olarak destekleniyor mu?
        Function("isObjectCaptureSupported") { () -> Bool in
            return Self.objectCaptureSupported()
        }

        // Ön kamera (TrueDepth) rehberli tarama destekleniyor mu?
        Function("isFrontScanSupported") { () -> Bool in
            return ARFaceTrackingConfiguration.isSupported
        }

        // Ön kamera (TrueDepth) rehberli tarama — Faz 1, modern kapsama rehberi.
        AsyncFunction("startFrontScan") { (promise: Promise) in
            DispatchQueue.main.async {
                guard let presenter = Self.topMostViewController() else {
                    promise.reject("E_NO_PRESENTER", "Aktif view controller bulunamadı.")
                    return
                }
                guard ARFaceTrackingConfiguration.isSupported else {
                    promise.reject("E_UNSUPPORTED", "Bu cihazda TrueDepth ön kamera yok.")
                    return
                }
                // FaceID yöntemi: anlık ARFaceGeometry + texture'lı OBJ (hızlı, başarılı)
                Self.presentTrueDepth(from: presenter, promise: promise)
            }
        }

        // Arka kamera REHBERLİ tarama (Faz B.1) — Vision pose + kapsama + fotogrametri
        AsyncFunction("startGuidedRearScan") { (promise: Promise) in
            DispatchQueue.main.async {
                guard let presenter = Self.topMostViewController() else {
                    promise.reject("E_NO_PRESENTER", "Aktif view controller bulunamadı.")
                    return
                }
                guard #available(iOS 17.0, *), ARWorldTrackingConfiguration.isSupported else {
                    promise.reject("E_UNSUPPORTED", "Bu cihaz world tracking desteklemiyor.")
                    return
                }
                Self.presentGuidedRear(from: presenter, promise: promise)
            }
        }

        // Tarama başlat. Object Capture varsa onu (yüksek kalite, LiDAR),
        // yoksa TrueDepth fallback'i kullanır.
        // Resolve: dosya path'leri dict'i · Vazgeç: null · Hata: reject
        AsyncFunction("startScan") { (promise: Promise) in
            DispatchQueue.main.async {
                guard let presenter = Self.topMostViewController() else {
                    promise.reject("E_NO_PRESENTER", "Aktif view controller bulunamadı.")
                    return
                }

                if #available(iOS 17.0, *), Self.objectCaptureSupported() {
                    Self.presentObjectCapture(from: presenter, promise: promise)
                } else if ARFaceTrackingConfiguration.isSupported {
                    Self.presentTrueDepth(from: presenter, promise: promise)
                } else {
                    promise.reject("E_UNSUPPORTED", "Bu cihaz 3D taramayı desteklemiyor (LiDAR veya TrueDepth gerekli).")
                }
            }
        }
    }

    // MARK: Object Capture (LiDAR)

    @available(iOS 17.0, *)
    private static func presentObjectCapture(from presenter: UIViewController, promise: Promise) {
        let dirs = ObjectCaptureDirs.make()
        var didResolve = false

        let flow = ObjectCaptureFlowView(dirs: dirs) { result in
            guard !didResolve else { return }
            didResolve = true

            // Modal'ı kapat
            presenter.dismiss(animated: true) {
                switch result {
                case .none:
                    promise.resolve(NSNull())
                case .some(.success(let outputDir)):
                    // OBJ bundle: obj + mtl + texture PNG (texture-mapped, keskin, viewer + exocad)
                    let obj = Self.firstFile(in: outputDir, ext: "obj")
                    let mtl = Self.firstFile(in: outputDir, ext: "mtl")
                    let png = Self.firstFile(in: outputDir, ext: "png")
                    guard let objPath = obj?.path else {
                        promise.reject("E_NO_OBJ", "OBJ dosyası üretilemedi.")
                        return
                    }
                    let stlPath = Self.makeSTL(fromOBJ: obj, in: outputDir)
                    // USDZ (texture gömülü) — reconstruction üretti; indirince renkli açılır
                    let usdzExists = FileManager.default.fileExists(atPath: dirs.outputUSDZ.path)
                    let dict: [String: Any] = [
                        "asciiSTL": NSNull(),
                        "binarySTL": stlPath,
                        "obj": objPath,
                        "mtl": mtl?.path ?? NSNull(),
                        "texturePNG": png?.path ?? NSNull(),
                        "usdz": usdzExists ? dirs.outputUSDZ.path : NSNull(),
                        "ply": NSNull(),
                    ]
                    promise.resolve(dict)
                case .some(.failure(let err)):
                    promise.reject("E_RECONSTRUCT_FAILED", err.localizedDescription)
                }
            }
        }

        let host = UIHostingController(rootView: flow)
        host.modalPresentationStyle = .fullScreen
        presenter.present(host, animated: true)
    }

    // MARK: Arka kamera rehberli (Faz B.1)

    @available(iOS 17.0, *)
    private static func presentGuidedRear(from presenter: UIViewController, promise: Promise) {
        let dirs = ObjectCaptureDirs.make()
        var didResolve = false
        let flow = GuidedRearCaptureView(dirs: dirs) { result in
            guard !didResolve else { return }
            didResolve = true
            presenter.dismiss(animated: true) {
                switch result {
                case .none:
                    promise.resolve(NSNull())
                case .some(.success(let outputDir)):
                    let obj = Self.firstFile(in: outputDir, ext: "obj")
                    let mtl = Self.firstFile(in: outputDir, ext: "mtl")
                    let png = Self.firstFile(in: outputDir, ext: "png")
                    guard let objPath = obj?.path else {
                        promise.reject("E_NO_OBJ", "OBJ üretilemedi."); return
                    }
                    let stlPath = Self.makeSTL(fromOBJ: obj, in: outputDir)
                    let usdzExists = FileManager.default.fileExists(atPath: dirs.outputUSDZ.path)
                    promise.resolve([
                        "asciiSTL": NSNull(), "binarySTL": stlPath,
                        "obj": objPath,
                        "mtl": mtl?.path ?? NSNull(),
                        "texturePNG": png?.path ?? NSNull(),
                        "usdz": usdzExists ? dirs.outputUSDZ.path : NSNull(),
                        "ply": NSNull(),
                    ] as [String: Any])
                case .some(.failure(let err)):
                    promise.reject("E_RECONSTRUCT_FAILED", err.localizedDescription)
                }
            }
        }
        let host = UIHostingController(rootView: flow)
        host.modalPresentationStyle = .fullScreen
        presenter.present(host, animated: true)
    }

    // MARK: Ön kamera rehberli (Faz 1)

    @available(iOS 17.0, *)
    private static func presentFrontGuided(from presenter: UIViewController, promise: Promise) {
        let dirs = ObjectCaptureDirs.make()
        var didResolve = false

        let flow = FrontGuidedCaptureView(dirs: dirs) { result in
            guard !didResolve else { return }
            didResolve = true
            presenter.dismiss(animated: true) {
                switch result {
                case .none:
                    promise.resolve(NSNull())
                case .some(.success(let outputDir)):
                    let obj = Self.firstFile(in: outputDir, ext: "obj")
                    let mtl = Self.firstFile(in: outputDir, ext: "mtl")
                    let png = Self.firstFile(in: outputDir, ext: "png")
                    guard let objPath = obj?.path else {
                        promise.reject("E_NO_OBJ", "OBJ üretilemedi.")
                        return
                    }
                    promise.resolve([
                        "asciiSTL": NSNull(), "binarySTL": NSNull(),
                        "obj": objPath,
                        "mtl": mtl?.path ?? NSNull(),
                        "texturePNG": png?.path ?? NSNull(),
                        "usdz": NSNull(), "ply": NSNull(),
                    ] as [String: Any])
                case .some(.failure(let err)):
                    promise.reject("E_RECONSTRUCT_FAILED", err.localizedDescription)
                }
            }
        }
        let host = UIHostingController(rootView: flow)
        host.modalPresentationStyle = .fullScreen
        presenter.present(host, animated: true)
    }

    // MARK: TrueDepth fallback

    private static func presentTrueDepth(from presenter: UIViewController, promise: Promise) {
        let vc = FaceCaptureViewController()
        vc.modalPresentationStyle = .fullScreen
        vc.onFinish = { result in
            switch result {
            case .none:
                promise.resolve(NSNull())
            case .some(.success(let files)):
                let dict: [String: Any] = [
                    "asciiSTL": files.asciiSTL.path,
                    "binarySTL": files.binarySTL.path,
                    "obj": files.obj.path,
                    "mtl": files.mtl?.path ?? NSNull(),
                    "texturePNG": files.texturePNG?.path ?? NSNull(),
                    "usdz": files.usdz?.path ?? NSNull(),
                    "ply": NSNull(),
                ]
                promise.resolve(dict)
            case .some(.failure(let err)):
                promise.reject("E_CAPTURE_FAILED", err.localizedDescription)
            }
        }
        presenter.present(vc, animated: true)
    }

    // MARK: Helpers

    private static func objectCaptureSupported() -> Bool {
        // ObjectCaptureSession.isSupported @MainActor-izole olduğu için nonisolated
        // context'ten çağrılamaz. LiDAR (scene reconstruction) varlığı, Object
        // Capture için yeterli ve doğru bir proxy — nonisolated API.
        guard #available(iOS 17.0, *) else { return false }
        return ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }

    /// OBJ'den binary STL üretir, outputDir'e model.stl olarak yazar, path döner (yoksa NSNull).
    private static func makeSTL(fromOBJ obj: URL?, in outputDir: URL) -> Any {
        guard let objURL = obj,
              let data = STLExporter.binarySTLFromOBJ(objURL: objURL) else { return NSNull() }
        let stlURL = outputDir.appendingPathComponent("model.stl")
        guard (try? data.write(to: stlURL, options: .atomic)) != nil else { return NSNull() }
        return stlURL.path
    }

    /// Bir klasörde verilen uzantıya sahip ilk dosyayı bulur (case-insensitive).
    private static func firstFile(in dir: URL, ext: String) -> URL? {
        let items = (try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: nil)) ?? []
        return items.first { $0.pathExtension.lowercased() == ext.lowercased() }
    }

    private static func topMostViewController() -> UIViewController? {
        guard let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else {
            return nil
        }
        var top = root
        while let presented = top.presentedViewController {
            top = presented
        }
        return top
    }
}
