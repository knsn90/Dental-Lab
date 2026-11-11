import SwiftUI
import ARKit
import SceneKit
import RealityKit
import CoreImage
import UIKit

// Tam kafa (360°) taraması — arka kamera + LiDAR, ikinci kişi hastanın etrafında döner.
//
// Akış: nişan (halka burunda → kafa merkezi) → otomatik çekim (bölge/mesafe/hız
// kapıları, kare başına derinlik + kafa maskesi + yerçekimi) → PhotogrammetrySession
// (+ poz isteği) → poz uyumuyla metrik kafa çerçevesi (mm, +Y yukarı, +Z yüz önü),
// boyun altı/arka plan kesilir → OBJ + USDZ.
// Hesaplar Exporters/HeadScanGeometry · HeadSampleStore · HeadMeshPostProcess'te (Mac'te test edildi).

@available(iOS 17.0, *)
final class HeadScanModel: ObservableObject {
    enum Phase { case aiming, scanning }
    enum Hint { case aim, aimFailed, walk, tracking, notInView, tooClose, tooFar, tooFast, needLow, needHigh, ready }

    @Published var phase: Phase = .aiming
    @Published var hint: Hint = .aim
    @Published var shots = 0
    @Published var doneZones: Set<Int> = []
    @Published var currentZone: HeadScanGeometry.Zone?
    @Published var flash = false

    var anchor: HeadAnchor?
    var startRequested = false
    let store: HeadSampleStore

    init(store: HeadSampleStore) { self.store = store }

    func count(_ b: HeadScanGeometry.Band) -> Int {
        doneZones.filter { $0 / HeadScanGeometry.sectors == b.rawValue }.count
    }
    var enough: Bool {
        count(.mid) >= HeadScanGeometry.requiredMid && count(.high) >= HeadScanGeometry.requiredHigh
            && count(.low) >= HeadScanGeometry.requiredLow && shots >= HeadScanGeometry.requiredShots
    }
}

@available(iOS 17.0, *)
struct HeadScanView: View {
    enum Stage: Equatable {
        case capturing
        case reconstructing(Double)
        case preview(URL)
        case failed(String)
    }

    @StateObject private var model: HeadScanModel
    @State private var stage: Stage = .capturing
    @State private var started = false

    let dirs: ObjectCaptureDirs
    let text: HeadScanText
    let onFinish: (Result<URL, Error>?) -> Void

    private let accent = Color(red: 0.20, green: 0.82, blue: 0.74)

    init(dirs: ObjectCaptureDirs, text: HeadScanText, onFinish: @escaping (Result<URL, Error>?) -> Void) {
        self.dirs = dirs; self.text = text; self.onFinish = onFinish
        _model = StateObject(wrappedValue: HeadScanModel(store: HeadSampleStore(dir: dirs.images)))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch stage {
            case .capturing:             captureView
            case .reconstructing(let p): reconstructingView(p)
            case .preview(let url):      previewView(url)
            case .failed(let msg):       failedView(msg)
            }
        }
        .environment(\.layoutDirection, text.isRTL ? .rightToLeft : .leftToRight)
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    // MARK: Çekim

    private var captureView: some View {
        ZStack {
            HeadScanARView(model: model, store: model.store) { stage = .failed(text.cameraFailed) }
                .ignoresSafeArea()

            if model.flash {
                Color.white.opacity(0.18).ignoresSafeArea().allowsHitTesting(false)
            }

            if model.phase == .aiming {
                Circle().stroke(accent, lineWidth: 3).frame(width: 64, height: 64)
                    .overlay(Circle().fill(accent).frame(width: 6, height: 6))
                    .allowsHitTesting(false)
            }

            VStack(spacing: 0) {
                HStack {
                    Button(action: { onFinish(nil) }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold)).foregroundColor(.white)
                            .frame(width: 38, height: 38)
                            .background(.ultraThinMaterial, in: Circle())
                    }
                    Spacer()
                    Text(text.title).font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                    Spacer()
                    Text(text.shots(model.shots))
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(.ultraThinMaterial, in: Capsule())
                }
                .padding(.horizontal, 16).padding(.top, 14)

                Spacer()

                VStack(spacing: 14) {
                    Text(hintText)
                        .font(.system(size: 14, weight: .medium)).foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
                        .padding(.horizontal, 16)

                    if model.phase == .scanning {
                        HStack(spacing: 16) {
                            CoverageDial(doneZones: model.doneZones, current: model.currentZone, accent: accent)
                                .frame(width: 128, height: 128)
                            VStack(alignment: .leading, spacing: 8) {
                                bandRow(text.ringHigh, model.count(.high), HeadScanGeometry.requiredHigh)
                                bandRow(text.ringMid, model.count(.mid), HeadScanGeometry.requiredMid)
                                bandRow(text.ringLow, model.count(.low), HeadScanGeometry.requiredLow)
                            }
                        }
                        .padding(14)
                        .background(RoundedRectangle(cornerRadius: 22).fill(Color.black.opacity(0.45)))
                    }

                    Button(action: primaryAction) {
                        Text(primaryTitle)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(primaryEnabled ? .black : .white.opacity(0.55))
                            .frame(width: 220, height: 52)
                            .background(primaryEnabled ? AnyShapeStyle(accent) : AnyShapeStyle(.ultraThinMaterial))
                            .clipShape(Capsule())
                    }
                    .disabled(!primaryEnabled)
                }
                .padding(.bottom, 30)
            }
        }
    }

    private func bandRow(_ label: String, _ n: Int, _ need: Int) -> some View {
        HStack(spacing: 8) {
            Circle().fill(n >= need ? accent : Color.white.opacity(0.25)).frame(width: 8, height: 8)
            Text(label).font(.system(size: 13, weight: .medium)).foregroundColor(.white)
            Text("\(min(n, need))/\(need)").font(.system(size: 12, weight: .semibold).monospacedDigit())
                .foregroundColor(.white.opacity(0.7))
        }
    }

    private var hintText: String {
        switch model.hint {
        case .aim: return text.aimHint
        case .aimFailed: return text.aimFailed
        case .walk: return text.walkHint
        case .tracking: return text.tracking
        case .notInView: return text.aimAtHead
        case .tooClose: return text.tooClose
        case .tooFar: return text.tooFar
        case .tooFast: return text.tooFast
        case .needLow: return text.needLow
        case .needHigh: return text.needHigh
        case .ready: return text.ready
        }
    }

    private var primaryTitle: String {
        model.phase == .aiming ? text.start : (model.enough ? text.finish : text.keepGoing)
    }
    private var primaryEnabled: Bool { model.phase == .aiming || model.enough || model.shots >= HeadScanController.maxShots }

    private func primaryAction() {
        if model.phase == .aiming { model.startRequested = true } else { finish() }
    }

    // MARK: Model kurma

    private func reconstructingView(_ p: Double) -> some View {
        VStack(spacing: 18) {
            ProgressView(value: p).progressViewStyle(.linear).tint(accent).frame(width: 220)
            Text("\(text.building) · %\(Int(p * 100))")
                .font(.system(size: 15, weight: .medium)).foregroundColor(.white)
            Text(text.buildingNote).font(.system(size: 12)).foregroundColor(.white.opacity(0.6))
                .multilineTextAlignment(.center).padding(.horizontal, 32)
        }
    }

    private func previewView(_ url: URL) -> some View {
        ZStack {
            Color(red: 0.05, green: 0.06, blue: 0.08).ignoresSafeArea()
            ModelGridPreview(url: url).ignoresSafeArea()
            VStack {
                Spacer()
                HStack(spacing: 12) {
                    Button(action: { onFinish(nil) }) {
                        Text(text.rescan).font(.system(size: 16, weight: .semibold)).foregroundColor(.white)
                            .frame(width: 150, height: 52).background(.ultraThinMaterial, in: Capsule())
                    }
                    Button(action: { onFinish(.success(dirs.outputDir)) }) {
                        Text(text.save).font(.system(size: 16, weight: .semibold)).foregroundColor(.black)
                            .frame(width: 150, height: 52).background(accent, in: Capsule())
                    }
                }
                .padding(.bottom, 32)
            }
        }
    }

    private func failedView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Text(text.failedTitle).font(.system(size: 18, weight: .semibold)).foregroundColor(.white)
            Text(message).font(.system(size: 13)).foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center).padding(.horizontal, 32)
            Button(action: { onFinish(nil) }) {
                Text(text.close).font(.system(size: 16, weight: .semibold)).foregroundColor(.black)
                    .frame(width: 180, height: 50).background(accent, in: Capsule())
            }
        }
    }

    private func finish() {
        guard !started, let anchor = model.anchor else { return }
        started = true
        stage = .reconstructing(0)
        let store = model.store
        let metas = store.metas.sorted { $0.id < $1.id }
        let outputDir = dirs.outputDir, usdz = dirs.outputUSDZ, checkpoint = dirs.checkpoint
        let noModel = text.noModel
        Task { @MainActor in
            do {
                var config = PhotogrammetrySession.Configuration(checkpointDirectory: checkpoint)
                config.featureSensitivity = .high
                config.sampleOrdering = .sequential
                config.isObjectMaskingEnabled = true
                let seq = HeadSampleSequence(store: store, metas: metas)
                let session = try PhotogrammetrySession(input: seq, configuration: config)
                try session.process(requests: [.poses, .modelFile(url: outputDir, detail: .reduced)])
                var poses: [Int: PhotogrammetrySession.Pose] = [:]
                for try await output in session.outputs {
                    switch output {
                    case .requestProgress(let req, fractionComplete: let f):
                        if case .modelFile = req { stage = .reconstructing(f) }
                    case .requestComplete(_, .poses(let p)):
                        poses = p.posesBySample
                    case .requestError(let req, let err):
                        if case .poses = req { continue }      // pozsuz da model kaydedilir (hizasız)
                        stage = .failed(err.localizedDescription); onFinish(.failure(err)); return
                    case .processingComplete:
                        let result = await Task.detached(priority: .userInitiated) {
                            HeadScanFinalizer.finalize(outputDir: outputDir, usdz: usdz, poses: poses,
                                                       metas: metas, anchor: anchor)
                        }.value
                        if let url = result { stage = .preview(url) }
                        else {
                            stage = .failed(noModel)
                            onFinish(.failure(NSError(domain: "ArScanner", code: -2,
                                                      userInfo: [NSLocalizedDescriptionKey: noModel])))
                        }
                        return
                    default: break
                    }
                }
            } catch {
                stage = .failed(error.localizedDescription); onFinish(.failure(error))
            }
        }
    }
}

// MARK: - Model sonrası (arka plan)

@available(iOS 17.0, *)
enum HeadScanFinalizer {
    /// Kafa çerçevesine taşı + kes → USDZ (metre) → OBJ mm. Dönüş: önizleme URL'i.
    static func finalize(outputDir: URL, usdz: URL, poses: [Int: PhotogrammetrySession.Pose],
                         metas: [HeadShotMeta], anchor: HeadAnchor) -> URL? {
        let items = (try? FileManager.default.contentsOfDirectory(at: outputDir, includingPropertiesForKeys: nil)) ?? []
        guard let obj = items.first(where: { $0.pathExtension.lowercased() == "obj" }) else { return nil }

        var ms: [SIMD3<Float>] = [], ws: [SIMD3<Float>] = []
        let byId = Dictionary(uniqueKeysWithValues: metas.map { ($0.id, $0) })
        for (id, p) in poses.sorted(by: { $0.key < $1.key }) {
            if let m = byId[id] { ms.append(p.translation); ws.append(m.cameraCenter) }
        }
        var aligned = false
        do {
            if let fit = HeadMeshPostProcess.robustFit(model: ms, world: ws),
               fit.medianError < 0.03, fit.sim.scale > 0.2, fit.sim.scale < 5 {
                let toHead = HeadMeshPostProcess.compose(HeadMeshPostProcess.worldToHead(anchor: anchor), after: fit.sim)
                try HeadMeshPostProcess.transformOBJ(at: obj, toHead: toHead, crop: true, unitScale: 1)
                aligned = true
            }
        } catch { aligned = false }

        // USDZ metre biriminde (AR Quick Look gerçek boyut), OBJ/STL mm (diş CAD standardı)
        try? FileManager.default.removeItem(at: usdz)
        try? USDZExporter.export(objURL: obj, to: usdz)
        _ = try? HeadMeshPostProcess.transformOBJ(at: obj, toHead: .identity, crop: false,
                                                  unitScale: aligned ? 1000 : 1)
        return FileManager.default.fileExists(atPath: usdz.path) ? usdz : obj
    }
}

// MARK: - Kapsama kadranı (üstten bakış: ön yukarıda; iç halka üst, orta göz hizası, dış alt)

@available(iOS 17.0, *)
struct CoverageDial: View {
    let doneZones: Set<Int>
    let current: HeadScanGeometry.Zone?
    let accent: Color

    var body: some View {
        Canvas { ctx, size in
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            let R = min(size.width, size.height) / 2
            let n = HeadScanGeometry.sectors
            let rings: [(HeadScanGeometry.Band, CGFloat, CGFloat)] = [
                (.high, R * 0.30, R * 0.52), (.mid, R * 0.56, R * 0.78), (.low, R * 0.82, R * 1.0),
            ]
            let step = 2 * Double.pi / Double(n)
            for (band, r0, r1) in rings {
                for s in 0..<n {
                    // sektör 0 = ön (yukarı); pozitif açı = saat yönü tersi (üstten bakış)
                    let mid = -Double.pi / 2 - Double(s) * step
                    let a0 = Angle(radians: mid - step / 2 + 0.04), a1 = Angle(radians: mid + step / 2 - 0.04)
                    var p = Path()
                    p.addArc(center: c, radius: r1, startAngle: a0, endAngle: a1, clockwise: false)
                    p.addArc(center: c, radius: r0, startAngle: a1, endAngle: a0, clockwise: true)
                    p.closeSubpath()
                    let idx = band.rawValue * n + s
                    let isCur = current?.band == band && current?.sector == s
                    let fill: Color = doneZones.contains(idx) ? accent : Color.white.opacity(0.14)
                    ctx.fill(p, with: .color(fill))
                    if isCur { ctx.stroke(p, with: .color(.white), lineWidth: 2) }
                }
            }
            // ön işareti (burun)
            var tri = Path()
            tri.move(to: CGPoint(x: c.x, y: c.y - R * 0.12))
            tri.addLine(to: CGPoint(x: c.x - R * 0.07, y: c.y + R * 0.04))
            tri.addLine(to: CGPoint(x: c.x + R * 0.07, y: c.y + R * 0.04))
            tri.closeSubpath()
            ctx.fill(tri, with: .color(.white.opacity(0.8)))
        }
        .environment(\.layoutDirection, .leftToRight)
    }
}

// MARK: - ARKit denetleyici

@available(iOS 17.0, *)
struct HeadScanARView: UIViewControllerRepresentable {
    let model: HeadScanModel
    let store: HeadSampleStore
    let onError: () -> Void

    func makeUIViewController(context: Context) -> HeadScanController {
        HeadScanController(model: model, store: store, onError: onError)
    }
    func updateUIViewController(_ vc: HeadScanController, context: Context) {}
}

@available(iOS 17.0, *)
final class HeadScanController: UIViewController, ARSessionDelegate {
    static var maxShots: Int { min(PhotogrammetrySession.limits.maximumNumberOfInputImages, 120) }

    private let model: HeadScanModel
    private let store: HeadSampleStore
    private let onError: () -> Void
    private let arView = ARSCNView()
    private let encodeQueue = DispatchQueue(label: "headscan.encode", qos: .userInitiated)
    private let ciContext = CIContext(options: [.cacheIntermediates: false])

    private var usedHiResFormat = false
    private var triedFallback = false
    private var inFlight = false
    private var nextId = 0
    private var zoneShots: [Int: Int] = [:]
    private var lastShotTime: TimeInterval = 0
    private var lastShotPos: SIMD3<Float>?
    private var prevT: simd_float4x4?
    private var prevTime: TimeInterval = 0
    private var speed: Float = 0
    private var angSpeed: Float = 0
    private var lastHintChange: TimeInterval = 0

    init(model: HeadScanModel, store: HeadSampleStore, onError: @escaping () -> Void) {
        self.model = model; self.store = store; self.onError = onError
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        arView.frame = view.bounds
        arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        arView.automaticallyUpdatesLighting = false
        arView.session.delegate = self
        view.addSubview(arView)
        run(hiRes: true)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        arView.session.pause()
    }

    private func run(hiRes: Bool) {
        let config = ARWorldTrackingConfiguration()
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            config.frameSemantics.insert(.sceneDepth)
        }
        config.isAutoFocusEnabled = true
        usedHiResFormat = false
        if hiRes, let f = ARWorldTrackingConfiguration.recommendedVideoFormatForHighResolutionFrameCapturing {
            config.videoFormat = f
            usedHiResFormat = true
        }
        arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        if !triedFallback {
            triedFallback = true
            run(hiRes: false)
        } else {
            DispatchQueue.main.async { self.onError() }
        }
    }

    // MARK: Kare döngüsü

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let T = frame.camera.transform
        let t = frame.timestamp
        if let p = prevT, t > prevTime {
            let dt = Float(t - prevTime)
            let v = simd_distance(pos(T), pos(p)) / dt
            let rel = simd_mul(simd_transpose(rot(p)), rot(T))
            let cosA = min(max((rel.columns.0.x + rel.columns.1.y + rel.columns.2.z - 1) / 2, -1), 1)
            let w = acos(cosA) / dt
            speed = speed * 0.7 + v * 0.3
            angSpeed = angSpeed * 0.7 + w * 0.3
        }
        prevT = T; prevTime = t

        switch model.phase {
        case .aiming:
            if model.startRequested {
                model.startRequested = false
                startScanning(frame)
            }
        case .scanning:
            tick(frame, now: t)
        }
    }

    private func startScanning(_ frame: ARFrame) {
        guard let depth = frame.sceneDepth else { setHint(.aimFailed, force: true); return }
        let dm = Self.copyDepth(depth)
        let K = Self.intrinsics(frame.camera, toWidth: dm.width, height: dm.height)
        guard let a = HeadScanGeometry.estimateAnchor(depth: dm, intrinsics: K, cameraToWorld: frame.camera.transform) else {
            setHint(.aimFailed, force: true); return
        }
        model.anchor = a
        model.phase = .scanning
        setHint(.walk, force: true)
    }

    private func tick(_ frame: ARFrame, now: TimeInterval) {
        guard let anchor = model.anchor else { return }
        let T = frame.camera.transform
        let z = HeadScanGeometry.zone(camera: pos(T), anchor: anchor)
        if model.currentZone != z.zone { model.currentZone = z.zone }

        let hint: HeadScanModel.Hint
        var ok = false
        if case .normal = frame.camera.trackingState {
            if !HeadScanGeometry.headInView(cameraToWorld: T, anchor: anchor) { hint = .notInView }
            else if z.distance < HeadScanGeometry.distanceRange.lowerBound { hint = .tooClose }
            else if z.distance > HeadScanGeometry.distanceRange.upperBound { hint = .tooFar }
            else if speed > 0.20 || angSpeed > 0.6 { hint = .tooFast }
            else { ok = true; hint = guidance() }
        } else { hint = .tracking }
        setHint(hint, force: false)

        guard ok, !inFlight, store.count < Self.maxShots else { return }
        let zi = z.zone.index
        let have = zoneShots[zi] ?? 0
        guard have < 4 else { return }
        let interval: TimeInterval = have == 0 ? 0.5 : 1.0
        guard now - lastShotTime >= interval else { return }
        if let lp = lastShotPos, simd_distance(lp, pos(T)) < 0.03 { return }
        capture(frame, zone: zi, anchor: anchor)
    }

    private func guidance() -> HeadScanModel.Hint {
        if model.enough { return .ready }
        let mid = model.count(.mid), low = model.count(.low), high = model.count(.high)
        if mid >= HeadScanGeometry.requiredMid - 2 {
            if high < HeadScanGeometry.requiredHigh { return .needHigh }
            if low < HeadScanGeometry.requiredLow { return .needLow }
        }
        return .walk
    }

    private func setHint(_ h: HeadScanModel.Hint, force: Bool) {
        let now = CACurrentMediaTime()
        guard model.hint != h else { return }
        // Uyarılar arasında hızlı titreşmeyi önle
        guard force || now - lastHintChange > 0.6 else { return }
        lastHintChange = now
        model.hint = h
    }

    // MARK: Çekim

    private func capture(_ frame: ARFrame, zone: Int, anchor: HeadAnchor) {
        inFlight = true
        lastShotTime = frame.timestamp
        let id = nextId; nextId += 1
        // Derinlik + maske bu (normal) karenin pozuyla hesaplanır
        guard let sd = frame.sceneDepth else { inFlight = false; return }
        let dm = Self.copyDepth(sd)
        let KD = Self.intrinsics(frame.camera, toWidth: dm.width, height: dm.height)
        let depthPose = frame.camera.transform
        let depthTime = frame.timestamp

        let finishWith: (ARFrame) -> Void = { [weak self] imgFrame in
            guard let self else { return }
            let aligned = imgFrame.timestamp == depthTime || abs(imgFrame.timestamp - depthTime) < 0.034
            let T = aligned ? depthPose : imgFrame.camera.transform
            let res = imgFrame.camera.imageResolution
            let K = imgFrame.camera.intrinsics
            let g = HeadScanGeometry.deviceGravity(cameraToWorld: T)
            let meta = HeadShotMeta(id: id, imageWidth: Int(res.width), imageHeight: Int(res.height),
                                    depthWidth: dm.width, depthHeight: dm.height,
                                    fx: K.columns.0.x, fy: K.columns.1.y, cx: K.columns.2.x, cy: K.columns.2.y,
                                    cameraToWorld: HeadShotMeta.flatten(imgFrame.camera.transform),
                                    gravity: [g.x, g.y, g.z], depthAligned: aligned)
            let pixels = imgFrame.capturedImage
            self.encodeQueue.async {
                var mask = HeadScanGeometry.objectMask(depth: dm, intrinsics: KD, cameraToWorld: depthPose, anchor: anchor)
                mask = HeadScanGeometry.dilate(mask, width: dm.width, height: dm.height, radius: 2)
                let ci = CIImage(cvPixelBuffer: pixels)
                let jpeg = self.ciContext.jpegRepresentation(
                    of: ci, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                    options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.9])
                var saved = false
                if let jpeg { saved = (try? self.store.save(jpeg: jpeg, depth: dm, mask: mask, meta: meta)) != nil }
                DispatchQueue.main.async {
                    self.inFlight = false
                    guard saved else { return }
                    self.zoneShots[zone, default: 0] += 1
                    self.lastShotPos = SIMD3<Float>(meta.cameraCenter)
                    self.model.shots = self.store.count
                    self.model.doneZones.insert(zone)
                    self.model.flash = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { self.model.flash = false }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
            }
        }

        if usedHiResFormat {
            arView.session.captureHighResolutionFrame { hi, _ in
                DispatchQueue.main.async { finishWith(hi ?? frame) }
            }
        } else {
            finishWith(frame)
        }
    }

    // MARK: Yardımcılar

    private func pos(_ T: simd_float4x4) -> SIMD3<Float> { SIMD3<Float>(T.columns.3.x, T.columns.3.y, T.columns.3.z) }
    private func rot(_ T: simd_float4x4) -> simd_float3x3 {
        simd_float3x3(SIMD3<Float>(T.columns.0.x, T.columns.0.y, T.columns.0.z),
                      SIMD3<Float>(T.columns.1.x, T.columns.1.y, T.columns.1.z),
                      SIMD3<Float>(T.columns.2.x, T.columns.2.y, T.columns.2.z))
    }

    /// Görüntü iç parametrelerini derinlik çözünürlüğüne ölçekler.
    static func intrinsics(_ cam: ARCamera, toWidth w: Int, height h: Int) -> PinholeIntrinsics {
        let K = cam.intrinsics
        let base = PinholeIntrinsics(fx: K.columns.0.x, fy: K.columns.1.y, cx: K.columns.2.x, cy: K.columns.2.y)
        return base.scaled(Float(w) / Float(cam.imageResolution.width), Float(h) / Float(cam.imageResolution.height))
    }

    /// LiDAR derinliğini kopyalar; düşük güvenli pikseller 0 (geçersiz).
    static func copyDepth(_ d: ARDepthData) -> DepthMap {
        let pb = d.depthMap
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
        let row = CVPixelBufferGetBytesPerRow(pb)
        let base = CVPixelBufferGetBaseAddress(pb)!
        var out = [Float](repeating: 0, count: w * h)
        var conf: UnsafeMutableRawPointer?
        var confRow = 0
        if let c = d.confidenceMap {
            CVPixelBufferLockBaseAddress(c, .readOnly)
            conf = CVPixelBufferGetBaseAddress(c); confRow = CVPixelBufferGetBytesPerRow(c)
        }
        defer { if let c = d.confidenceMap { CVPixelBufferUnlockBaseAddress(c, .readOnly) } }
        for y in 0..<h {
            let src = (base + y * row).assumingMemoryBound(to: Float32.self)
            let cr = conf.map { ($0 + y * confRow).assumingMemoryBound(to: UInt8.self) }
            for x in 0..<w {
                let lowConf = (cr?[x] ?? 2) < UInt8(ARConfidenceLevel.medium.rawValue)
                out[y * w + x] = lowConf ? 0 : src[x]
            }
        }
        return DepthMap(width: w, height: h, values: out)
    }
}
