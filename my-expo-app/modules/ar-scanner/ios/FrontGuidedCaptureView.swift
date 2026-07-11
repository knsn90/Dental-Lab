import SwiftUI
import ARKit
import SceneKit
import RealityKit
import QuickLook
import CoreImage

// Faz 1 — Ön kamera (TrueDepth/ARFaceTracking) rehberli tarama.
// Modern tasarım: dairesel açı-kapsama göstergesi (Qlone kopyası değil).
//
// Akış:
//   Hasta başını yavaşça çevirir → her açı bölgesi "yakalandıkça" modern
//   accent ile dolar. Yeterli kapsama → fotolar PhotogrammetrySession ile
//   texture'lı OBJ'ye dönüşür → önizleme → kaydet.
//
// 9 bölge: pitch(aşağı/orta/yukarı) × yaw(sol/orta/sağ).

@available(iOS 17.0, *)
final class FrontCaptureModel: ObservableObject {
    @Published var doneZones: Set<Int> = []
    @Published var photoCount: Int = 0
    @Published var currentZone: Int = 4   // başlangıç: merkez
    @Published var faceVisible: Bool = false

    static let zoneCount = 9
    var targetZones: Int { 7 }            // 9'dan 7'si dolunca "yeterli"
    var enoughForFinish: Bool { doneZones.count >= targetZones && photoCount >= 16 }
    var progress: Double { Double(doneZones.count) / Double(Self.zoneCount) }
}

@available(iOS 17.0, *)
struct FrontGuidedCaptureView: View {

    enum Stage: Equatable {
        case capturing
        case reconstructing(Double)
        case preview(URL)
        case failed(String)
    }

    @StateObject private var model = FrontCaptureModel()
    @State private var stage: Stage = .capturing
    @State private var reconstructStarted = false

    let dirs: ObjectCaptureDirs
    let onFinish: (Result<URL, Error>?) -> Void

    // Modern accent (klinik teal/mint tonu)
    private let accent = Color(red: 0.20, green: 0.82, blue: 0.74)

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch stage {
            case .capturing:      captureView
            case .reconstructing(let p): reconstructingView(progress: p)
            case .preview(let url): previewView(usdz: url)
            case .failed(let msg):  failedView(message: msg)
            }
        }
    }

    // MARK: Capture

    private var captureView: some View {
        ZStack {
            FrontCaptureARView(model: model, imagesDir: dirs.images, onError: { msg in
                stage = .failed(msg)
                onFinish(.failure(NSError(domain: "ArScanner", code: -1, userInfo: [NSLocalizedDescriptionKey: msg])))
            })
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Üst bar
                HStack {
                    Button(action: cancel) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .frame(width: 38, height: 38)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    Spacer()
                    // Foto sayacı — modern pill
                    HStack(spacing: 6) {
                        Image(systemName: "camera.fill").font(.system(size: 12))
                        Text("\(model.photoCount)").font(.system(size: 15, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(.ultraThinMaterial, in: Capsule())
                }
                .padding(.horizontal, 16).padding(.top, 14)

                Spacer()

                // Modern rehber kartı + dairesel kapsama
                VStack(spacing: 18) {
                    Text(model.faceVisible
                         ? "Başınızı yavaşça çevirin — sol · sağ · yukarı · aşağı"
                         : "Yüzünüzü kameraya hizalayın")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)

                    CoverageRing(doneZones: model.doneZones, current: model.currentZone, accent: accent)
                        .frame(width: 150, height: 150)

                    Text("\(model.doneZones.count)/\(FrontCaptureModel.zoneCount) bölge")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.white.opacity(0.7))

                    Button(action: finish) {
                        Text(model.enoughForFinish ? "Bitir ✓" : "Devam edin…")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(model.enoughForFinish ? .black : .white.opacity(0.6))
                            .frame(width: 220, height: 52)
                            .background(model.enoughForFinish ? AnyShapeStyle(accent) : AnyShapeStyle(.ultraThinMaterial))
                            .clipShape(Capsule())
                    }
                    .disabled(!model.enoughForFinish)
                }
                .padding(.bottom, 30)
            }
        }
    }

    // MARK: Reconstruction (Object Capture ile aynı motor)

    private func reconstructingView(progress: Double) -> some View {
        VStack(spacing: 18) {
            ProgressView(value: progress).progressViewStyle(.linear).tint(accent).frame(width: 220)
            Text("3D model oluşturuluyor… %\(Int(progress * 100))")
                .font(.system(size: 15, weight: .medium)).foregroundColor(.white)
            Text("Birkaç dakika sürebilir")
                .font(.system(size: 12)).foregroundColor(.white.opacity(0.6))
        }
    }

    private func previewView(usdz: URL) -> some View {
        ZStack {
            Color.black.ignoresSafeArea()
            USDZQuickLook(url: usdz).ignoresSafeArea()
            VStack {
                Spacer()
                HStack(spacing: 12) {
                    Button(action: cancel) {
                        Text("Tekrar Tara")
                            .font(.system(size: 16, weight: .semibold)).foregroundColor(.white)
                            .frame(width: 150, height: 52)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                    Button(action: { onFinish(.success(dirs.outputDir)) }) {
                        Text("Kaydet ✓")
                            .font(.system(size: 16, weight: .semibold)).foregroundColor(.black)
                            .frame(width: 150, height: 52)
                            .background(accent, in: Capsule())
                    }
                }
                .padding(.bottom, 32)
            }
        }
    }

    private func failedView(message: String) -> some View {
        VStack(spacing: 16) {
            Text("Tarama başarısız").font(.system(size: 18, weight: .semibold)).foregroundColor(.white)
            Text(message).font(.system(size: 13)).foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center).padding(.horizontal, 32)
            Button(action: cancel) {
                Text("Kapat").font(.system(size: 16, weight: .semibold)).foregroundColor(.black)
                    .frame(width: 180, height: 50).background(accent, in: Capsule())
            }
        }
    }

    // MARK: Logic

    private func finish() {
        guard model.enoughForFinish, !reconstructStarted else { return }
        reconstructStarted = true
        stage = .reconstructing(0)

        let imagesDir = dirs.images
        let outputDir = dirs.outputDir
        let outputUSDZ = dirs.outputUSDZ

        Task { @MainActor in
            do {
                let session = try PhotogrammetrySession(input: imagesDir)
                let requests: [PhotogrammetrySession.Request] = [
                    .modelFile(url: outputDir, detail: .reduced),
                    .modelFile(url: outputUSDZ, detail: .reduced),
                ]
                try session.process(requests: requests)
                for try await output in session.outputs {
                    switch output {
                    case .requestProgress(_, fractionComplete: let f):
                        stage = .reconstructing(f)
                    case .processingComplete:
                        if FileManager.default.fileExists(atPath: outputUSDZ.path) {
                            stage = .preview(outputUSDZ)
                        } else {
                            onFinish(.success(outputDir))
                        }
                        return
                    case .requestError(_, let err):
                        stage = .failed(err.localizedDescription)
                        onFinish(.failure(err))
                        return
                    default: break
                    }
                }
            } catch {
                stage = .failed(error.localizedDescription)
                onFinish(.failure(error))
            }
        }
    }

    private func cancel() { onFinish(nil) }
}

// MARK: - Modern dairesel kapsama göstergesi

@available(iOS 17.0, *)
struct CoverageRing: View {
    let doneZones: Set<Int>
    let current: Int
    let accent: Color

    // 9 bölge: index 0..8 = (pitch row 0..2) * 3 + (yaw col 0..2)
    // Görsel yerleşim: merkez(4) ortada, diğerleri yön açılarına göre dairede.
    private func position(_ zone: Int, radius: CGFloat) -> CGSize {
        if zone == 4 { return .zero }
        let col = zone % 3 - 1   // -1,0,1  (sol/orta/sağ)
        let row = zone / 3 - 1   // -1,0,1  (üst/orta/alt) — row0=üst
        let angle = atan2(CGFloat(row), CGFloat(col))
        return CGSize(width: cos(angle) * radius, height: sin(angle) * radius)
    }

    var body: some View {
        GeometryReader { geo in
            let r = min(geo.size.width, geo.size.height) / 2 - 14
            ZStack {
                Circle().stroke(Color.white.opacity(0.15), lineWidth: 1)
                ForEach(0..<FrontCaptureModel.zoneCount, id: \.self) { z in
                    let done = doneZones.contains(z)
                    let isCurrent = current == z
                    Circle()
                        .fill(done ? AnyShapeStyle(accent) : AnyShapeStyle(Color.white.opacity(0.18)))
                        .frame(width: z == 4 ? 26 : 20, height: z == 4 ? 26 : 20)
                        .overlay(
                            Circle().stroke(isCurrent ? accent : .clear, lineWidth: 2.5)
                                .scaleEffect(1.5)
                        )
                        .offset(position(z, radius: r))
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: done)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

// MARK: - ARFaceTracking capture controller (UIKit) → SwiftUI köprüsü

@available(iOS 17.0, *)
struct FrontCaptureARView: UIViewControllerRepresentable {
    let model: FrontCaptureModel
    let imagesDir: URL
    let onError: (String) -> Void

    func makeUIViewController(context: Context) -> FrontCaptureController {
        let vc = FrontCaptureController()
        vc.model = model
        vc.imagesDir = imagesDir
        vc.onError = onError
        return vc
    }
    func updateUIViewController(_ vc: FrontCaptureController, context: Context) {}
}

@available(iOS 17.0, *)
final class FrontCaptureController: UIViewController, ARSessionDelegate {
    var model: FrontCaptureModel!
    var imagesDir: URL!
    var onError: ((String) -> Void)?

    private let sceneView = ARSCNView()
    private let ciContext = CIContext()
    private var lastCaptureTime: TimeInterval = 0
    private var photoIndex = 0
    private let maxPhotos = 70
    private var runningMaxSharp: CGFloat = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        sceneView.frame = view.bounds
        sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        sceneView.session.delegate = self
        sceneView.automaticallyUpdatesLighting = true
        view.addSubview(sceneView)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard ARFaceTrackingConfiguration.isSupported else {
            onError?("Bu cihazda TrueDepth ön kamera yok.")
            return
        }
        let cfg = ARFaceTrackingConfiguration()
        cfg.isLightEstimationEnabled = true
        sceneView.session.run(cfg, options: [.resetTracking, .removeExistingAnchors])
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
    }

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard let faceAnchor = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first else {
            if model.faceVisible { DispatchQueue.main.async { self.model.faceVisible = false } }
            return
        }
        if !model.faceVisible { DispatchQueue.main.async { self.model.faceVisible = true } }

        // Yüz yönü → yaw/pitch
        let t = faceAnchor.transform
        let fwd = simd_normalize(SIMD3<Float>(t.columns.2.x, t.columns.2.y, t.columns.2.z))
        let yaw = atan2(fwd.x, abs(fwd.z))        // sol(-)/sağ(+)
        let pitch = asin(max(-1, min(1, fwd.y)))  // aşağı(-)/yukarı(+)

        let thr: Float = 0.26  // ~15°
        let yawB = yaw < -thr ? 0 : (yaw > thr ? 2 : 1)
        let pitchB = pitch > thr ? 0 : (pitch < -thr ? 2 : 1)  // row0=üst
        let zone = pitchB * 3 + yawB

        let now = frame.timestamp
        let isNewZone = !model.doneZones.contains(zone)
        let timeOK = now - lastCaptureTime > 0.35
        if (isNewZone || timeOK), photoIndex < maxPhotos {
            // KESKİNLİK FİLTRESİ — titreme/motion-blur olan kareleri ele.
            let sharp = sharpness(of: frame.capturedImage)
            if sharp > runningMaxSharp { runningMaxSharp = sharp }
            // Net referansın %55'inden bulanıksa atla (yeni bölgede biraz daha toleranslı)
            let threshold = runningMaxSharp * (isNewZone ? 0.45 : 0.6)
            if sharp < threshold && runningMaxSharp > 0 {
                if zone != model.currentZone {
                    DispatchQueue.main.async { self.model.currentZone = zone }
                }
                return  // bulanık kare → kaydetme
            }
            captureFrame(frame)
            lastCaptureTime = now
            DispatchQueue.main.async {
                self.model.currentZone = zone
                self.model.doneZones.insert(zone)
                self.model.photoCount = self.photoIndex
            }
        } else if zone != model.currentZone {
            DispatchQueue.main.async { self.model.currentZone = zone }
        }
    }

    /// Netlik metriği: yüksek-frekans enerjisi (gaussian fark ortalaması).
    /// Yüksek = keskin, düşük = bulanık. Standart CIFilter'larla, hızlı.
    private func sharpness(of pixelBuffer: CVPixelBuffer) -> CGFloat {
        let ci = CIImage(cvPixelBuffer: pixelBuffer)
        let small = ci.transformed(by: CGAffineTransform(scaleX: 0.25, y: 0.25))
        let blurred = small.clampedToExtent()
            .applyingGaussianBlur(sigma: 2.0)
            .cropped(to: small.extent)
        guard let diff = CIFilter(name: "CIDifferenceBlendMode", parameters: [
            kCIInputImageKey: small, kCIInputBackgroundImageKey: blurred,
        ])?.outputImage else { return 0 }
        guard let avg = CIFilter(name: "CIAreaAverage", parameters: [
            kCIInputImageKey: diff,
            kCIInputExtentKey: CIVector(cgRect: small.extent),
        ])?.outputImage else { return 0 }
        var px = [UInt8](repeating: 0, count: 4)
        ciContext.render(avg, toBitmap: &px, rowBytes: 4,
                         bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                         format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return CGFloat(px[0]) * 0.299 + CGFloat(px[1]) * 0.587 + CGFloat(px[2]) * 0.114
    }

    private func captureFrame(_ frame: ARFrame) {
        let pixelBuffer = frame.capturedImage
        let ci = CIImage(cvPixelBuffer: pixelBuffer)
        guard let cg = ciContext.createCGImage(ci, from: ci.extent) else { return }
        let img = UIImage(cgImage: cg)
        guard let data = img.jpegData(compressionQuality: 0.92) else { return }
        let url = imagesDir.appendingPathComponent(String(format: "frame_%03d.jpg", photoIndex))
        try? data.write(to: url, options: .atomic)
        photoIndex += 1
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        onError?(error.localizedDescription)
    }
}
