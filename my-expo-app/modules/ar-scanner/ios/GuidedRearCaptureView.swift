import SwiftUI
import ARKit
import AVFoundation
import SceneKit
import SceneKit.ModelIO
import ModelIO
import RealityKit
import Vision
import UIKit
import CoreImage

// Faz B.1 — Arka kamera REHBERLİ tarama (Qlone benzeri, kendi pipeline'ımız).
//
// Kilit: arka kamerada ARFaceAnchor yok → Vision (VNDetectFaceRectanglesRequest
// rev3) ile yüzün yaw/pitch açısı 2D görüntüden çıkarılır. Açıya göre kapsama
// bölgeleri (ön 180°) dolar; yeterince kare toplanınca PhotogrammetrySession
// ile texture'lı OBJ + USDZ üretilir.
//
// NOT: Reconstruction motoru yine PhotogrammetrySession; kareleri biz seçiyoruz.

@available(iOS 17.0, *)
final class RearGuidedModel: ObservableObject {
    @Published var doneZones: Set<Int> = []
    @Published var photoCount: Int = 0
    @Published var currentZone: Int = 7
    @Published var faceVisible: Bool = false
    @Published var maxMP: Int = 12          // cihazın desteklediği en yüksek foto MP

    static let zoneCols = 5
    static let zoneRows = 3
    static let zoneCount = 15          // 5 sütun (yaw) × 3 satır (pitch)
    var minShots: Int { 30 }
    var enoughForFinish: Bool { doneZones.count >= 9 && photoCount >= minShots }
}

@available(iOS 17.0, *)
struct GuidedRearCaptureView: View {
    enum Stage: Equatable {
        case capturing
        case reconstructing(Double)
        case preview(URL)
        case failed(String)
    }

    @StateObject private var model = RearGuidedModel()
    @State private var stage: Stage = .capturing
    @State private var reconstructStarted = false
    @State private var hiRes = true          // true = en yüksek çözünürlük, false = 12MP

    let dirs: ObjectCaptureDirs
    let onFinish: (Result<URL, Error>?) -> Void

    private let accent = Color(red: 0.20, green: 0.82, blue: 0.74)

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch stage {
            case .capturing:           captureView
            case .reconstructing(let p): reconstructingView(progress: p)
            case .preview(let url):     previewView(usdz: url)
            case .failed(let msg):      failedView(message: msg)
            }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private var captureView: some View {
        ZStack {
            RearCaptureARView(model: model, imagesDir: dirs.images, hiRes: hiRes, onError: { msg in
                stage = .failed(msg)
                onFinish(.failure(NSError(domain: "ArScanner", code: -1,
                    userInfo: [NSLocalizedDescriptionKey: msg])))
            })
            .ignoresSafeArea()

            VStack(spacing: 0) {
                HStack {
                    Button(action: { onFinish(nil) }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold)).foregroundColor(.white)
                            .frame(width: 38, height: 38)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    Spacer()
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

                VStack(spacing: 16) {
                    Text(model.faceVisible
                         ? "Hastanın yüzü etrafında YAVAŞÇA gezin — sol · ön · sağ · üst · alt"
                         : "Arka kamerayı hastanın yüzüne çevirin")
                        .font(.system(size: 14, weight: .medium)).foregroundColor(.white)
                        .multilineTextAlignment(.center).padding(.horizontal, 24)

                    // Çözünürlük seçimi (operatör) — yalnız tarama başlamadan değiştir
                    HStack(spacing: 0) {
                        qualityButton(title: "12 MP", selected: !hiRes) { hiRes = false }
                        qualityButton(title: "Yüksek (\(model.maxMP) MP)", selected: hiRes) { hiRes = true }
                    }
                    .background(.ultraThinMaterial, in: Capsule())
                    .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
                    .opacity(model.photoCount == 0 ? 1 : 0.4)
                    .disabled(model.photoCount > 0)

                    CoverageHead3D(doneZones: model.doneZones, current: model.currentZone, accent: accent)
                        .frame(width: 190, height: 220)
                        .background(
                            RoundedRectangle(cornerRadius: 24)
                                .fill(Color.black.opacity(0.35))
                        )

                    Text("\(model.doneZones.count)/\(RearGuidedModel.zoneCount) bölge")
                        .font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.7))

                    Button(action: finish) {
                        Text(model.enoughForFinish ? "Bitir ✓" : "Devam edin…")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(model.enoughForFinish ? .black : .white.opacity(0.55))
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

    private func reconstructingView(progress: Double) -> some View {
        VStack(spacing: 18) {
            ProgressView(value: progress).progressViewStyle(.linear).tint(accent).frame(width: 220)
            Text("3D model oluşturuluyor… %\(Int(progress * 100))")
                .font(.system(size: 15, weight: .medium)).foregroundColor(.white)
            Text("Birkaç dakika sürebilir").font(.system(size: 12)).foregroundColor(.white.opacity(0.6))
        }
    }

    private func previewView(usdz: URL) -> some View {
        ZStack {
            Color(red: 0.05, green: 0.06, blue: 0.08).ignoresSafeArea()
            ModelGridPreview(url: usdz).ignoresSafeArea()
            VStack {
                Spacer()
                HStack(spacing: 12) {
                    Button(action: { onFinish(nil) }) {
                        Text("Tekrar Tara").font(.system(size: 16, weight: .semibold)).foregroundColor(.white)
                            .frame(width: 150, height: 52).background(.ultraThinMaterial, in: Capsule())
                    }
                    Button(action: { onFinish(.success(dirs.outputDir)) }) {
                        Text("Kaydet ✓").font(.system(size: 16, weight: .semibold)).foregroundColor(.black)
                            .frame(width: 150, height: 52).background(accent, in: Capsule())
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
            Button(action: { onFinish(nil) }) {
                Text("Kapat").font(.system(size: 16, weight: .semibold)).foregroundColor(.black)
                    .frame(width: 180, height: 50).background(accent, in: Capsule())
            }
        }
    }

    private func qualityButton(title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(selected ? .black : .white)
                .padding(.horizontal, 18).padding(.vertical, 10)
                .background(selected ? AnyShapeStyle(accent) : AnyShapeStyle(Color.clear))
                .clipShape(Capsule())
        }
    }

    static func firstFile(in dir: URL, ext: String) -> URL? {
        let items = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return items.first { $0.pathExtension.lowercased() == ext.lowercased() }
    }

    private func finish() {
        guard model.enoughForFinish, !reconstructStarted else { return }
        reconstructStarted = true
        stage = .reconstructing(0)
        let imagesDir = dirs.images
        let outputDir = dirs.outputDir
        let outputUSDZ = dirs.outputUSDZ
        Task { @MainActor in
            do {
                var config = PhotogrammetrySession.Configuration()
                // Cilt gibi pürüzsüz/az dokulu yüzeyler için yüksek hassasiyet kritik.
                config.featureSensitivity = .high
                // Rehberli süpürme kareleri sıralı çekildi → hem hız hem kalite artar.
                config.sampleOrdering = .sequential
                let session = try PhotogrammetrySession(input: imagesDir, configuration: config)
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
                        // Boyun altından kes (sadece kafa) → OBJ'yi yerinde güncelle,
                        // USDZ'i kesilmiş OBJ'den yeniden üret (preview + indirme kafa olsun)
                        if let objURL = Self.firstFile(in: outputDir, ext: "obj") {
                            OBJCropper.cropBelowNeck(objURL: objURL)
                            try? USDZExporter.export(objURL: objURL, to: outputUSDZ)
                        }
                        if FileManager.default.fileExists(atPath: outputUSDZ.path) {
                            stage = .preview(outputUSDZ)
                        } else { onFinish(.success(outputDir)) }
                        return
                    case .requestError(_, let err):
                        stage = .failed(err.localizedDescription); onFinish(.failure(err)); return
                    default: break
                    }
                }
            } catch {
                stage = .failed(error.localizedDescription); onFinish(.failure(error))
            }
        }
    }
}

// MARK: - ARWorldTracking + Vision pose controller

@available(iOS 17.0, *)
struct RearCaptureARView: UIViewControllerRepresentable {
    let model: RearGuidedModel
    let imagesDir: URL
    let hiRes: Bool
    let onError: (String) -> Void

    func makeUIViewController(context: Context) -> RearCaptureController {
        let vc = RearCaptureController()
        vc.model = model; vc.imagesDir = imagesDir; vc.onError = onError; vc.hiRes = hiRes
        return vc
    }
    func updateUIViewController(_ vc: RearCaptureController, context: Context) {
        vc.hiRes = hiRes
    }
}

// AVCaptureSession tabanlı: poz takibi Vision (önizleme kareleri), kayıt ise
// AVCapturePhotoOutput ile cihazın seçilen çözünürlüğünde (12MP veya 48MP) tam foto.
@available(iOS 17.0, *)
final class RearCaptureController: UIViewController,
    AVCaptureVideoDataOutputSampleBufferDelegate, AVCapturePhotoCaptureDelegate {

    var model: RearGuidedModel!
    var imagesDir: URL!
    var onError: ((String) -> Void)?
    var hiRes: Bool = true

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private let videoOutput = AVCaptureVideoDataOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer!
    private let ciContext = CIContext()
    private let visionQueue = DispatchQueue(label: "rear.vision")
    private let sessionQueue = DispatchQueue(label: "rear.session")
    private var frameTick = 0
    private var lastCaptureTime: TimeInterval = 0
    private var photoIndex = 0
    private var shotsInZone: [Int: Int] = [:]
    private var runningMaxSharp: CGFloat = 0
    private var maxDims = CMVideoDimensions(width: 4032, height: 3024)
    private let stdDims = CMVideoDimensions(width: 4032, height: 3024)   // ~12MP
    private var captureIndexByID: [Int64: Int] = [:]

    // Mod'a göre limitler (48MP ağır → daha az kare + daha geniş aralık)
    private var maxPhotos: Int { hiRes ? 48 : 90 }
    private var perZoneCap: Int { hiRes ? 4 : 6 }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        previewLayer.frame = view.bounds
        view.layer.addSublayer(previewLayer)
        if let c = previewLayer.connection, c.isVideoRotationAngleSupported(90) {
            c.videoRotationAngle = 90   // portrait
        }
        sessionQueue.async { [weak self] in self?.configure() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sessionQueue.async { [weak self] in self?.session.stopRunning() }
    }

    private func configure() {
        session.beginConfiguration()
        session.sessionPreset = .photo
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            session.commitConfiguration()
            DispatchQueue.main.async { self.onError?("Arka kamera açılamadı.") }
            return
        }
        session.addInput(input)

        if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }
        photoOutput.maxPhotoQualityPrioritization = .quality
        if let best = device.activeFormat.supportedMaxPhotoDimensions
            .max(by: { Int($0.width) * Int($0.height) < Int($1.width) * Int($1.height) }) {
            maxDims = best
        }
        photoOutput.maxPhotoDimensions = maxDims

        if session.canAddOutput(videoOutput) {
            videoOutput.alwaysDiscardsLateVideoFrames = true
            videoOutput.setSampleBufferDelegate(self, queue: visionQueue)
            session.addOutput(videoOutput)
        }
        session.commitConfiguration()

        let mp = Int((Double(maxDims.width) * Double(maxDims.height) / 1_000_000).rounded())
        DispatchQueue.main.async { self.model.maxMP = mp }

        session.startRunning()
    }

    // MARK: Önizleme kareleri → Vision (visionQueue üzerinde)
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        frameTick += 1
        guard frameTick % 4 == 0,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let ts = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))

        let req = VNDetectFaceRectanglesRequest()
        req.revision = VNDetectFaceRectanglesRequestRevision3
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .right, options: [:])
        try? handler.perform([req])

        guard let face = (req.results)?.first else {
            DispatchQueue.main.async { if self.model.faceVisible { self.model.faceVisible = false } }
            return
        }
        DispatchQueue.main.async { if !self.model.faceVisible { self.model.faceVisible = true } }

        let yaw = face.yaw?.doubleValue ?? 0
        let pitch = face.pitch?.doubleValue ?? 0
        let cols = RearGuidedModel.zoneCols, rows = RearGuidedModel.zoneRows
        let maxYaw = 0.85, maxPitch = 0.5
        let ny = min(max((yaw + maxYaw) / (2 * maxYaw), 0), 1)
        var col = Int((ny * Double(cols - 1)).rounded())
        col = (cols - 1) - col
        let np = min(max((pitch + maxPitch) / (2 * maxPitch), 0), 1)
        var row = Int((np * Double(rows - 1)).rounded())
        row = (rows - 1) - row
        let zone = row * cols + col

        let zoneShots = shotsInZone[zone] ?? 0
        let isNewZone = !model.doneZones.contains(zone)
        let interval = ts - lastCaptureTime
        let minInterval = hiRes ? (isNewZone ? 0.35 : 0.6) : (isNewZone ? 0.15 : 0.30)
        guard interval > minInterval, zoneShots < perZoneCap, photoIndex < maxPhotos else {
            DispatchQueue.main.async { self.model.currentZone = zone }
            return
        }
        let sharp = sharpness(of: pixelBuffer)
        runningMaxSharp *= 0.97
        let bar = runningMaxSharp * (isNewZone ? 0.40 : 0.55)
        let ok = sharp >= bar || runningMaxSharp < 1
        if sharp > runningMaxSharp { runningMaxSharp = sharp }
        guard ok else {
            DispatchQueue.main.async { self.model.currentZone = zone }
            return
        }
        let idx = photoIndex
        photoIndex += 1
        lastCaptureTime = ts
        shotsInZone[zone] = zoneShots + 1
        DispatchQueue.main.async {
            self.model.currentZone = zone
            self.model.doneZones.insert(zone)
            self.model.photoCount = self.photoIndex
        }
        triggerPhotoCapture(index: idx)
    }

    private func triggerPhotoCapture(index: Int) {
        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
        settings.maxPhotoDimensions = hiRes ? maxDims : stdDims
        settings.photoQualityPrioritization = .quality
        captureIndexByID[settings.uniqueID] = index
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let idx = captureIndexByID.removeValue(forKey: photo.resolvedSettings.uniqueID) ?? photoIndex
        guard error == nil, let data = photo.fileDataRepresentation() else { return }
        let url = imagesDir.appendingPathComponent(String(format: "rear_%03d.jpg", idx))
        try? data.write(to: url, options: .atomic)
    }

    private func sharpness(of pb: CVPixelBuffer) -> CGFloat {
        let ci = CIImage(cvPixelBuffer: pb).transformed(by: CGAffineTransform(scaleX: 0.25, y: 0.25))
        let blurred = ci.clampedToExtent().applyingGaussianBlur(sigma: 2.0).cropped(to: ci.extent)
        guard let diff = CIFilter(name: "CIDifferenceBlendMode", parameters: [
            kCIInputImageKey: ci, kCIInputBackgroundImageKey: blurred])?.outputImage,
              let avg = CIFilter(name: "CIAreaAverage", parameters: [
            kCIInputImageKey: diff, kCIInputExtentKey: CIVector(cgRect: ci.extent)])?.outputImage
        else { return 0 }
        var px = [UInt8](repeating: 0, count: 4)
        ciContext.render(avg, toBitmap: &px, rowBytes: 4,
                         bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
                         format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return CGFloat(px[0]) * 0.299 + CGFloat(px[1]) * 0.587 + CGFloat(px[2]) * 0.114
    }
}

// MARK: - B.2: 3D Yeşil Kafa Rehberi (Qlone tarzı kapsama göstergesi)
//
// Dairesel halka yerine 3B kafa proxy'si: 9 bölge kafanın ön yüzeyinde işaretli.
// Taranan bölge → yeşil + parlama; hedef (current) → beyaz + nabız; bekleyen → soluk.

@available(iOS 17.0, *)
struct CoverageHead3D: UIViewRepresentable {
    let doneZones: Set<Int>
    let current: Int
    let accent: Color

    final class Coord { var markers: [Int: SCNNode] = [:] }
    func makeCoordinator() -> Coord { Coord() }

    func makeUIView(context: Context) -> SCNView {
        let v = SCNView()
        v.backgroundColor = .clear
        v.isUserInteractionEnabled = false
        v.antialiasingMode = .multisampling4X
        v.rendersContinuously = true
        let scene = SCNScene()
        v.scene = scene

        // Hafif sürekli dönüş ile 3B hissi
        let rig = SCNNode()
        scene.rootNode.addChildNode(rig)
        rig.runAction(.repeatForever(.sequence([
            .rotateBy(x: 0, y: 0.35, z: 0, duration: 2.2),
            .rotateBy(x: 0, y: -0.35, z: 0, duration: 2.2),
        ])))

        // Gerçek 3D kafa modeli (WaltHead.obj) — resource bundle'dan yükle
        if let headNode = Self.loadHeadModel() {
            rig.addChildNode(headNode)
        } else {
            // Yedek: model bulunamazsa basit elipsoid
            let hm = SCNMaterial()
            hm.lightingModel = .physicallyBased
            hm.diffuse.contents = UIColor(white: 0.78, alpha: 1)
            let head = SCNSphere(radius: 1.0); head.segmentCount = 64
            head.materials = [hm]
            let hn = SCNNode(geometry: head)
            hn.scale = SCNVector3(0.82, 1.05, 0.9)
            rig.addChildNode(hn)
        }

        // 15 bölge markeri (5 sütun × 3 satır), kafanın ön yüzeyinde
        let cols = RearGuidedModel.zoneCols, rows = RearGuidedModel.zoneRows
        let maxYaw: Float = 0.95, maxPitch: Float = 0.6
        for zone in 0..<RearGuidedModel.zoneCount {
            let col = zone % cols, row = zone / cols
            let yaw = -maxYaw + Float(col) / Float(cols - 1) * 2 * maxYaw
            let pitch = maxPitch - Float(row) / Float(rows - 1) * 2 * maxPitch  // row0 = üst
            let dir = SCNVector3(cos(pitch) * sin(yaw), sin(pitch), cos(pitch) * cos(yaw))
            let m = SCNSphere(radius: 0.11)
            m.segmentCount = 20
            let mm = SCNMaterial()
            mm.lightingModel = .constant
            mm.diffuse.contents = UIColor(white: 0.5, alpha: 0.85)
            m.materials = [mm]
            let node = SCNNode(geometry: m)
            node.position = SCNVector3(dir.x * 0.85, dir.y * 1.05, dir.z * 0.95)
            rig.addChildNode(node)
            context.coordinator.markers[zone] = node
        }

        // Aydınlatma
        let amb = SCNNode(); amb.light = SCNLight()
        amb.light?.type = .ambient; amb.light?.intensity = 700
        scene.rootNode.addChildNode(amb)
        let key = SCNNode(); key.light = SCNLight()
        key.light?.type = .directional; key.light?.intensity = 750
        key.eulerAngles = SCNVector3(-0.5, 0.5, 0)
        scene.rootNode.addChildNode(key)

        // Önden kamera
        let cam = SCNNode(); cam.camera = SCNCamera()
        cam.camera?.fieldOfView = 34
        cam.position = SCNVector3(0, 0, 6)
        cam.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(cam)
        v.pointOfView = cam

        applyColors(context: context)
        return v
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        applyColors(context: context)
    }

    // Resource bundle'dan kafa OBJ URL'ini bul
    private static func headModelURL() -> URL? {
        let bundles: [Bundle] = [Bundle(for: ArScannerModule.self), Bundle.main]
        for b in bundles {
            if let u = b.url(forResource: "head_guide", withExtension: "obj") { return u }
            if let bp = b.url(forResource: "ArScannerAssets", withExtension: "bundle"),
               let ab = Bundle(url: bp),
               let u = ab.url(forResource: "head_guide", withExtension: "obj") { return u }
        }
        return nil
    }

    // Kafa modelini yükle → normalize + ortala + yarı saydam gri materyal
    private static func loadHeadModel() -> SCNNode? {
        guard let url = headModelURL() else { return nil }
        // OBJ'yi ModelIO ile yükle (SCNScene(url:) OBJ'de boş sahne dönebiliyor)
        let asset = MDLAsset(url: url)
        guard asset.count > 0 else { return nil }
        let scene = SCNScene(mdlAsset: asset)

        let node = scene.rootNode.flattenedClone()
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = UIColor(white: 0.80, alpha: 1)
        m.roughness.contents = 0.55
        m.metalness.contents = 0.0
        m.transparency = 0.5            // yarı saydam → noktalar/iç hatlar okunur
        m.isDoubleSided = true
        node.geometry?.materials = [m]
        node.enumerateChildNodes { c, _ in c.geometry?.materials = [m] }

        // Normalize: ~2.4 birim, merkezde.
        // MDLAsset.boundingBox güvenilir (SCNNode.boundingBox MDL import'ta 0 dönebiliyor → dev model).
        let bb = asset.boundingBox
        let mn = bb.minBounds, mx = bb.maxBounds
        let center = SCNVector3((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2)
        let size = SCNVector3(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z)
        let maxDim = max(size.x, max(size.y, size.z))
        let s: Float = maxDim > 0.0001 ? 2.4 / maxDim : 1
        node.position = SCNVector3(-center.x, -center.y, -center.z)
        let scaler = SCNNode()
        scaler.scale = SCNVector3(s, s, s)
        scaler.addChildNode(node)
        return scaler
    }

    private func applyColors(context: Context) {
        let green = UIColor(red: 0.10, green: 0.92, blue: 0.45, alpha: 1)  // canlı yeşil
        let pulse = SCNAction.repeatForever(.sequence([
            .scale(to: 1.55, duration: 0.5),
            .scale(to: 1.15, duration: 0.5),
        ]))
        for (zone, node) in context.coordinator.markers {
            guard let mat = node.geometry?.firstMaterial else { continue }
            node.removeAllActions()
            if doneZones.contains(zone) {
                mat.diffuse.contents = green
                mat.emission.contents = green   // parlama → parlak yeşil
                node.scale = SCNVector3(1.3, 1.3, 1.3)
            } else if zone == current {
                mat.diffuse.contents = UIColor.white
                mat.emission.contents = UIColor.white
                node.scale = SCNVector3(1.4, 1.4, 1.4)
                node.runAction(pulse)
            } else {
                mat.diffuse.contents = UIColor(white: 0.30, alpha: 0.7)  // belirgin sönük
                mat.emission.contents = UIColor.black
                node.scale = SCNVector3(0.8, 0.8, 0.8)
            }
        }
    }
}

// MARK: - Kendi 3D önizlememiz (SceneKit, orbit + grid zemin) — AR QuickLook yerine

@available(iOS 17.0, *)
struct ModelGridPreview: UIViewRepresentable {
    let url: URL   // USDZ (texture gömülü)

    func makeUIView(context: Context) -> SCNView {
        let v = SCNView()
        v.allowsCameraControl = true
        // Arcball → her yönde serbest 360° dönüş (turntable dikeyi kısıtlıyordu)
        v.defaultCameraController.interactionMode = .orbitArcball
        v.defaultCameraController.inertiaEnabled = true
        v.defaultCameraController.minimumVerticalAngle = -180
        v.defaultCameraController.maximumVerticalAngle = 180
        v.antialiasingMode = .multisampling4X
        v.autoenablesDefaultLighting = false
        v.backgroundColor = UIColor(red: 0.05, green: 0.06, blue: 0.08, alpha: 1)

        let scene = (try? SCNScene(url: url, options: nil)) ?? SCNScene()
        v.scene = scene

        // Modeli tek bir "content" düğümüne sar
        let content = SCNNode()
        for child in scene.rootNode.childNodes { child.removeFromParentNode(); content.addChildNode(child) }
        scene.rootNode.addChildNode(content)

        // Ölç + NORMALİZE et (sabit ~2 birim) → kamera dolly aralığı makul olur,
        // böylece zoom-out da çalışır (eskiden model çok küçüktü, geri gidemiyordu).
        let measure = content.flattenedClone()
        let (lo, hi) = measure.boundingBox
        let center = SCNVector3((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2)
        let size = SCNVector3(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
        let maxDim = max(size.x, max(size.y, size.z))
        let s: Float = maxDim > 0.0001 ? 2.0 / maxDim : 1.0
        content.scale = SCNVector3(s, s, s)
        content.position = SCNVector3(-center.x * s, -center.y * s, -center.z * s)
        let floorY = -size.y / 2 * s

        // Grid zemin (normalize edilmiş modelin altına)
        let floor = SCNFloor()
        floor.reflectivity = 0
        let fm = SCNMaterial()
        fm.diffuse.contents = Self.gridTexture()
        fm.diffuse.wrapS = .repeat
        fm.diffuse.wrapT = .repeat
        fm.diffuse.contentsTransform = SCNMatrix4MakeScale(0.6, 0.6, 1)
        fm.lightingModel = .constant
        fm.isDoubleSided = true
        floor.materials = [fm]
        let floorNode = SCNNode(geometry: floor)
        floorNode.position = SCNVector3(0, floorY, 0)
        scene.rootNode.addChildNode(floorNode)

        // Aydınlatma — texture'ın gerçek rengi için ağırlıklı ambient
        let amb = SCNNode(); amb.light = SCNLight()
        amb.light?.type = .ambient; amb.light?.intensity = 950
        scene.rootNode.addChildNode(amb)
        let dir = SCNNode(); dir.light = SCNLight()
        dir.light?.type = .directional; dir.light?.intensity = 550
        dir.eulerAngles = SCNVector3(-Float.pi / 3, Float.pi / 5, 0)
        scene.rootNode.addChildNode(dir)

        // Kamera — sabit mesafe (model normalize, ~2 birim)
        let cam = SCNNode(); cam.camera = SCNCamera()
        cam.camera?.zNear = 0.01; cam.camera?.zFar = 1000
        cam.position = SCNVector3(0, 0, 4.5)
        cam.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(cam)
        v.pointOfView = cam

        return v
    }

    func updateUIView(_ uiView: SCNView, context: Context) {}

    private static func gridTexture() -> UIImage {
        let s = CGSize(width: 512, height: 512)
        return UIGraphicsImageRenderer(size: s).image { ctx in
            let c = ctx.cgContext
            c.setFillColor(UIColor(red: 0.07, green: 0.08, blue: 0.10, alpha: 1).cgColor)
            c.fill(CGRect(origin: .zero, size: s))
            // ince çizgiler
            c.setStrokeColor(UIColor(white: 1, alpha: 0.10).cgColor)
            c.setLineWidth(1)
            let step: CGFloat = 64
            var x: CGFloat = 0
            while x <= s.width { c.move(to: CGPoint(x: x, y: 0)); c.addLine(to: CGPoint(x: x, y: s.height)); x += step }
            var y: CGFloat = 0
            while y <= s.height { c.move(to: CGPoint(x: 0, y: y)); c.addLine(to: CGPoint(x: s.width, y: y)); y += step }
            c.strokePath()
            // kalın ana çizgiler (her 256px)
            c.setStrokeColor(UIColor(white: 1, alpha: 0.18).cgColor)
            c.setLineWidth(2)
            for p in stride(from: CGFloat(0), through: s.width, by: 256) {
                c.move(to: CGPoint(x: p, y: 0)); c.addLine(to: CGPoint(x: p, y: s.height))
                c.move(to: CGPoint(x: 0, y: p)); c.addLine(to: CGPoint(x: s.width, y: p))
            }
            c.strokePath()
        }
    }
}
