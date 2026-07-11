import SwiftUI
import RealityKit
import QuickLook
import UIKit
import os

// Apple Object Capture (iOS 17+, LiDAR'lı cihazlar) ile yüksek kaliteli
// fotogrametri taraması. Arka kamera + LiDAR ile hastanın yüzü/kafası taranır.
//
// Akış:
//   ready → detecting → capturing → (dial dolar) → finish → reconstruct
//   reconstruct → ÖNİZLEME (döndürülebilir 3D) → Kaydet / Tekrar Tara
//
// Özellikler:
//   • Canlı "Kapsama" görünümü (ObjectCapturePointCloudView) — taranan alan + çekim noktaları
//   • Çok-turlu tarama (beginNewScanPass) — daha iyi kapsama
//   • Tarama sonrası USDZ önizleme (QuickLook), beğenince kaydet
//   • Çıktı: OBJ bundle (CAD) + USDZ (önizleme)

@available(iOS 17.0, *)
struct ObjectCaptureDirs {
    let images: URL
    let checkpoint: URL
    /// OBJ çıktı KLASÖRÜ — baked_mesh.obj + .mtl + texture (ara çıktı, PLY'ye bake için)
    let outputDir: URL
    /// USDZ tek dosya — on-device önizleme (QuickLook) için
    let outputUSDZ: URL
    /// PLY tek dosya — vertex renkli, exocad uyumlu, UPLOAD EDİLEN nihai dosya
    let outputPLY: URL

    static func make() -> ObjectCaptureDirs {
        let base = FileManager.default.temporaryDirectory
            .appendingPathComponent("objcap-\(UUID().uuidString)", isDirectory: true)
        let images = base.appendingPathComponent("Images", isDirectory: true)
        let checkpoint = base.appendingPathComponent("Snapshots", isDirectory: true)
        let output = base.appendingPathComponent("Model", isDirectory: true)
        let usdz = base.appendingPathComponent("preview.usdz")
        let ply = base.appendingPathComponent("face_scan.ply")
        try? FileManager.default.createDirectory(at: images, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: checkpoint, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        return ObjectCaptureDirs(images: images, checkpoint: checkpoint, outputDir: output, outputUSDZ: usdz, outputPLY: ply)
    }
}

@available(iOS 17.0, *)
struct ObjectCaptureFlowView: View {

    enum Stage: Equatable {
        case capturing
        case reconstructing(Double)
        case preview(URL)        // USDZ hazır → önizleme
        case failed(String)
    }

    @State private var session = ObjectCaptureSession()
    @State private var stage: Stage = .capturing
    @State private var started = false
    @State private var reconstructStarted = false
    @State private var passCount = 1
    @State private var passDone = false

    // 180° yüz akışı: kadran (360°) yerine bu kadar foto çekilince "Bitir" aktif
    private let minShotsToFinish = 20

    let dirs: ObjectCaptureDirs
    /// Kaydet → outputDir (OBJ) · Vazgeç/Tekrar → nil · Hata → failure
    let onFinish: (Result<URL, Error>?) -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch stage {
            case .capturing:
                captureView
            case .reconstructing(let p):
                reconstructingView(progress: p)
            case .preview(let url):
                previewView(usdz: url)
            case .failed(let msg):
                failedView(message: msg)
            }
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true   // tarama sırasında ekran uyumasın
            startIfNeeded()
        }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .onChange(of: session.state) { _, newState in handleState(newState) }
        .onChange(of: session.userCompletedScanPass) { _, done in passDone = done }
    }

    // MARK: Capture

    @ViewBuilder
    private var captureView: some View {
        ZStack {
            ObjectCaptureView(session: session)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // ── Üst: vazgeç + tur/foto sayacı ──
                HStack(alignment: .top) {
                    Button(action: cancel) {
                        Text("Vazgeç")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Color.black.opacity(0.4))
                            .clipShape(Capsule())
                    }
                    Spacer()
                    if case .capturing = session.state {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.triangle.2.circlepath").font(.system(size: 12))
                            Text("Tur \(passCount)").font(.system(size: 14, weight: .semibold))
                            Text("·")
                            Image(systemName: "camera.fill").font(.system(size: 11))
                            Text("\(session.numberOfShotsTaken)").font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(Color.black.opacity(0.4))
                        .clipShape(Capsule())
                    }
                }
                .padding(.horizontal, 16).padding(.top, 12)

                stepGuideCard
                    .padding(.horizontal, 16).padding(.top, 12)

                Spacer()

                bottomActionArea
                    .padding(.bottom, 28)
            }
        }
    }

    @ViewBuilder
    private var bottomActionArea: some View {
        switch session.state {
        case .ready:
            actionButton(title: "Devam") { _ = session.startDetecting() }
        case .detecting:
            actionButton(title: "Taramayı Başlat") { session.startCapturing() }
        case .capturing:
            // 180° yüz akışı: 360° kadran dolmasını BEKLEME. Yeterli foto (≥ minShots)
            // çekilince belirgin "Bitir" aktif olur. Yüzün önünü birkaç kez gez = yoğunluk.
            let shots = session.numberOfShotsTaken
            let enough = shots >= minShotsToFinish
            VStack(spacing: 10) {
                Text(enough
                     ? "Yeterli foto toplandı — bitirebilir veya devam edip daha fazla gezebilirsiniz"
                     : "Yüzün önünü 180° tarayın (sol yanak → ön → sağ yanak) · \(shots)/\(minShotsToFinish)")
                    .font(.system(size: 12)).foregroundColor(.white.opacity(0.85))
                    .multilineTextAlignment(.center).padding(.horizontal, 24)
                Button(action: { session.finish() }) {
                    Text(enough ? "Bitir ✓" : "Devam edin… (\(shots)/\(minShotsToFinish))")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(enough ? .black : .white.opacity(0.55))
                        .frame(width: 240, height: 54)
                        .background(enough ? Color.white : Color.white.opacity(0.18))
                        .clipShape(Capsule())
                }
                .disabled(!enough)
            }
            .padding(.vertical, 14).frame(maxWidth: .infinity)
            .background(Color.black.opacity(0.45))
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .padding(.horizontal, 16)
        default:
            EmptyView()
        }
    }

    private func newPass() {
        passDone = false
        passCount += 1
        session.beginNewScanPass()
    }

    private var stepGuideCard: some View {
        VStack(spacing: 6) {
            Text(stepTitle).font(.system(size: 17, weight: .bold))
                .foregroundColor(.white).multilineTextAlignment(.center)
            Text(stepDetail).font(.system(size: 13))
                .foregroundColor(.white.opacity(0.85)).multilineTextAlignment(.center)
        }
        .padding(.horizontal, 20).padding(.vertical, 14).frame(maxWidth: .infinity)
        .background(Color.black.opacity(0.45))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var stepTitle: String {
        switch session.state {
        case .initializing: return "Hazırlanıyor…"
        case .ready:        return "1. Adım — Konumlan"
        case .detecting:    return "2. Adım — Kafayı Kutuya Al"
        case .capturing:    return "3. Adım — Yüzü 180° Tara"
        case .finishing:    return "Tamamlanıyor…"
        case .completed:    return "Tarama Tamam ✓"
        case .failed:       return "Hata"
        @unknown default:   return ""
        }
    }

    private var stepDetail: String {
        switch session.state {
        case .initializing: return "Kamera başlatılıyor"
        case .ready:        return "Telefonu hastanın yüzüne ~30 cm tutun, 'Devam'a basın"
        case .detecting:    return "Kutuyu SADECE kafanın etrafına oturt (gövde girmesin), sonra 'Taramayı Başlat'"
        case .capturing:
            return "Yüzün ÖNÜNÜ 180° tara: sol yanak → ön → sağ yanak. Birkaç kez gez, sonra 'Bitir'. 'Taranan Alanı Göster' ile kontrol et"
        case .finishing:    return "Son kareler işleniyor"
        case .completed:    return "3D model oluşturuluyor"
        case .failed:       return ""
        @unknown default:   return ""
        }
    }

    private func actionButton(title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 17, weight: .semibold)).foregroundColor(.black)
                .frame(width: 220, height: 54)
                .background(Color.white).clipShape(Capsule())
        }
    }

    // MARK: Reconstruction

    private func reconstructingView(progress: Double) -> some View {
        VStack(spacing: 18) {
            ProgressView(value: progress).progressViewStyle(.linear).tint(.white).frame(width: 220)
            Text("3D model oluşturuluyor… %\(Int(progress * 100))")
                .font(.system(size: 15, weight: .medium)).foregroundColor(.white)
            Text("Bu işlem birkaç dakika sürebilir")
                .font(.system(size: 12)).foregroundColor(.white.opacity(0.6))
        }
    }

    // MARK: Preview (tarama sonrası döndürülebilir 3D)

    private func previewView(usdz: URL) -> some View {
        ZStack {
            Color(red: 0.05, green: 0.06, blue: 0.08).ignoresSafeArea()
            ModelGridPreview(url: usdz).ignoresSafeArea()

            VStack {
                HStack {
                    Text("Önizleme — beğendin mi?")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                        .padding(.horizontal, 16).padding(.vertical, 8)
                        .background(Color.black.opacity(0.5)).clipShape(Capsule())
                    Spacer()
                }
                .padding(.horizontal, 16).padding(.top, 12)

                Spacer()

                HStack(spacing: 12) {
                    Button(action: cancel) {
                        Text("Tekrar Tara")
                            .font(.system(size: 16, weight: .semibold)).foregroundColor(.white)
                            .frame(width: 150, height: 52)
                            .background(Color.white.opacity(0.22)).clipShape(Capsule())
                    }
                    Button(action: { onFinish(.success(dirs.outputDir)) }) {
                        Text("Kaydet ✓")
                            .font(.system(size: 16, weight: .semibold)).foregroundColor(.black)
                            .frame(width: 150, height: 52)
                            .background(Color.white).clipShape(Capsule())
                    }
                }
                .padding(.bottom, 32)
            }
        }
    }

    private func failedView(message: String) -> some View {
        VStack(spacing: 16) {
            Text("Tarama başarısız")
                .font(.system(size: 18, weight: .semibold)).foregroundColor(.white)
            Text(message)
                .font(.system(size: 13)).foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center).padding(.horizontal, 32)
            Button(action: cancel) {
                Text("Kapat")
                    .font(.system(size: 16, weight: .semibold)).foregroundColor(.black)
                    .frame(width: 180, height: 50)
                    .background(Color.white).clipShape(Capsule())
            }
        }
    }

    // MARK: Logic

    private func startIfNeeded() {
        guard !started else { return }
        started = true
        var cfg = ObjectCaptureSession.Configuration()
        cfg.checkpointDirectory = dirs.checkpoint
        cfg.isOverCaptureEnabled = true
        session.start(imagesDirectory: dirs.images, configuration: cfg)
    }

    private func handleState(_ state: ObjectCaptureSession.CaptureState) {
        switch state {
        case .completed:
            startReconstruction()
        case .failed(let error):
            stage = .failed(error.localizedDescription)
            onFinish(.failure(error))
        default:
            break
        }
    }

    private func startReconstruction() {
        guard !reconstructStarted else { return }
        reconstructStarted = true
        stage = .reconstructing(0)

        let imagesDir = dirs.images
        let outputDir = dirs.outputDir
        let outputUSDZ = dirs.outputUSDZ

        Task { @MainActor in
            do {
                let photoSession = try PhotogrammetrySession(input: imagesDir)
                // İki çıktı: OBJ bundle (texture-mapped, keskin) + USDZ (önizleme)
                // .reduced = iOS'ta güvenilir; texture haritasıyla fotogerçekçi sonuç verir
                let requests: [PhotogrammetrySession.Request] = [
                    .modelFile(url: outputDir, detail: .reduced),
                    .modelFile(url: outputUSDZ, detail: .reduced),
                ]
                try photoSession.process(requests: requests)

                for try await output in photoSession.outputs {
                    switch output {
                    case .requestProgress(_, fractionComplete: let fraction):
                        stage = .reconstructing(fraction)
                    case .processingComplete:
                        // Boyun altından kes (sadece kafa) → OBJ güncelle + USDZ yeniden üret
                        if let objURL = GuidedRearCaptureView.firstFile(in: outputDir, ext: "obj") {
                            OBJCropper.cropBelowNeck(objURL: objURL)
                            try? USDZExporter.export(objURL: objURL, to: outputUSDZ)
                        }
                        if FileManager.default.fileExists(atPath: outputUSDZ.path) {
                            stage = .preview(outputUSDZ)
                        } else {
                            onFinish(.success(dirs.outputDir))
                        }
                        return
                    case .requestError(_, let error):
                        stage = .failed(error.localizedDescription)
                        onFinish(.failure(error))
                        return
                    default:
                        break
                    }
                }
            } catch {
                stage = .failed(error.localizedDescription)
                onFinish(.failure(error))
            }
        }
    }

    private func cancel() {
        session.cancel()
        onFinish(nil)
    }

    // OBJ bundle (outputDir) → tek PLY (vertex renkli). Texture'ı vertex'lere bake eder.
    private func bakePLY() {
        let dir = dirs.outputDir
        let items = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        guard let objURL = items.first(where: { $0.pathExtension.lowercased() == "obj" }) else { return }
        let pngURL = items.first(where: { $0.pathExtension.lowercased() == "png" })
        try? PLYExporter.export(objURL: objURL, textureURL: pngURL, to: dirs.outputPLY)
    }
}

// MARK: - USDZ QuickLook (döndürülebilir 3D önizleme)

@available(iOS 17.0, *)
struct USDZQuickLook: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            url as NSURL
        }
    }
}
