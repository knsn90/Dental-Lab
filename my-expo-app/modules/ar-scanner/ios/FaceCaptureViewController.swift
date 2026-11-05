import UIKit
import SceneKit
import ARKit
import CoreImage
import AudioToolbox

/// Sonuç: köşe renkli PLY (mm) + varsa dokulu OBJ paketi (OBJ + MTL + JPG, mm).
struct FaceCaptureFiles {
    let ply: URL
    var obj: URL? = nil
    var mtl: URL? = nil
    var texture: URL? = nil
}

/// AR yüz tarama VC — modal olarak sunulur, capture / cancel ile dismiss eder.
///
/// Rehberli çok açılı akış:
///   Taramayı Başlat → ÖN (düz bak, sabit dur) → YAN 1 (başı bir yana ~30°)
///   → YAN 2 (diğer yana) → renkler birleştirilir → önizleme
///   → "Siparişe Kaydet" (PLY yazılır) / "Tekrar Tara" (baştan).
///
/// Her poz koşullar sağlanıp kısa süre sabit durulunca OTOMATİK yakalanır
/// (baş dönükken ekran görülmeyebilir → titreşim + ses + flaş geri bildirimi).
/// Yönler "bir yana / diğer yana" diye tarif edilir; ilk dönülen yanın ekrandaki
/// yönü ölçülür ve ikinci pozda ok ters yönü gösterir. Geometri ve göz bölgesi ÖN
/// kareden, yanakların rengi yan karelerden gelir.
final class FaceCaptureViewController: UIViewController, ARSCNViewDelegate, ARSessionDelegate {

    /// Capture başarılı → files. Cancel → nil.
    var onFinish: ((Result<FaceCaptureFiles, Error>?) -> Void)?

    private enum Step { case idle, front, sideA, sideB, processing }

    private static let accent = UIColor(red: 0.20, green: 0.82, blue: 0.74, alpha: 1)

    private let sceneView = ARSCNView()
    private var mask: FaceMeshNode?
    private let hintPill = ScanHintPill()
    private let stepIndicator = ScanStepIndicator(titles: ["Ön", "Yan", "Yan"], accent: FaceCaptureViewController.accent)
    private let directionCue = ScanDirectionCue()
    private let flashView = UIView()
    private let startButton = UIButton(type: .system)
    private let skipButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let ciContext = CIContext(options: [.cacheIntermediates: false])

    private var step: Step = .idle
    private var samples: [FaceColorSample?] = []
    private var captureGroup = DispatchGroup()
    private var captureGeneration = 0
    private var frontSnapshot: MeshSnapshot?
    private var frontExpression: [Float] = []
    private var frontEyeCenters: [SIMD3<Float>] = []
    private var frontEyeCaps: [EyeCap] = []
    private var firstSideYawSign: Float = 0
    private var firstTurnScreenSign: Float = 0
    private var poseHistory: [(time: TimeInterval, angles: SIMD2<Float>)] = []
    private var highResSupported = false

    // Poz eşikleri (radyan) + sabit durma
    private let frontMaxYaw: Float = 8 * .pi / 180
    private let frontMaxPitch: Float = 12 * .pi / 180
    private let sideMinYaw: Float = 25 * .pi / 180
    private let sideMaxYaw: Float = 50 * .pi / 180
    private let sideMaxPitch: Float = 15 * .pi / 180
    private let stableRange: Float = 3 * .pi / 180
    private let holdDuration: TimeInterval = 0.4

    enum CaptureError: LocalizedError {
        case unsupportedDevice
        case frontMissing
        case writeFailed(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedDevice: return "Bu cihazda TrueDepth ön kamera yok."
            case .frontMissing: return "Ön kare alınamadı. Lütfen tekrar deneyin."
            case .writeFailed(let s): return "Dosya yazılamadı: \(s)"
            }
        }
    }

    // MARK: Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupSceneView()
        setupOverlay()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        UIApplication.shared.isIdleTimerDisabled = true   // tarama sırasında ekran uyumasın

        guard ARFaceTrackingConfiguration.isSupported else {
            finish(.failure(CaptureError.unsupportedDevice))
            return
        }
        resetGuide()   // ilk açılış ve önizlemeden "Tekrar Tara" dönüşü
        startSession()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        UIApplication.shared.isIdleTimerDisabled = false  // normale döndür
        sceneView.session.pause()
    }

    // MARK: Setup

    private func setupSceneView() {
        sceneView.translatesAutoresizingMaskIntoConstraints = false
        sceneView.delegate = self
        sceneView.session.delegate = self
        sceneView.automaticallyUpdatesLighting = true
        view.addSubview(sceneView)
        pin(sceneView)
    }

    private func setupOverlay() {
        directionCue.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(directionCue)
        pin(directionCue)

        flashView.translatesAutoresizingMaskIntoConstraints = false
        flashView.backgroundColor = .white
        flashView.alpha = 0
        flashView.isUserInteractionEnabled = false
        view.addSubview(flashView)
        pin(flashView)

        var cancelConfig = UIButton.Configuration.filled()
        cancelConfig.image = UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold))
        cancelConfig.baseBackgroundColor = UIColor.white.withAlphaComponent(0.18)
        cancelConfig.baseForegroundColor = .white
        cancelConfig.cornerStyle = .capsule
        cancelButton.configuration = cancelConfig
        cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)

        var startConfig = UIButton.Configuration.filled()
        startConfig.baseBackgroundColor = .white
        startConfig.baseForegroundColor = .black
        startConfig.cornerStyle = .capsule
        startConfig.contentInsets = NSDirectionalEdgeInsets(top: 16, leading: 32, bottom: 16, trailing: 32)
        startConfig.attributedTitle = AttributedString("Taramayı Başlat", attributes: AttributeContainer([
            .font: UIFont.systemFont(ofSize: 16, weight: .semibold),
        ]))
        startButton.configuration = startConfig
        startButton.addTarget(self, action: #selector(startTap), for: .touchUpInside)

        var skipConfig = UIButton.Configuration.plain()
        skipConfig.baseForegroundColor = UIColor.white.withAlphaComponent(0.7)
        skipConfig.attributedTitle = AttributedString("Yanları atla", attributes: AttributeContainer([
            .font: UIFont.systemFont(ofSize: 14, weight: .medium),
        ]))
        skipButton.configuration = skipConfig
        skipButton.addTarget(self, action: #selector(skipTap), for: .touchUpInside)

        spinner.color = .white
        spinner.hidesWhenStopped = true

        for v in [cancelButton, hintPill, stepIndicator, startButton, skipButton, spinner] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            cancelButton.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            cancelButton.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            cancelButton.widthAnchor.constraint(equalToConstant: 40),
            cancelButton.heightAnchor.constraint(equalToConstant: 40),

            hintPill.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hintPill.centerYAnchor.constraint(equalTo: cancelButton.centerYAnchor),
            hintPill.leadingAnchor.constraint(greaterThanOrEqualTo: cancelButton.trailingAnchor, constant: 10),
            hintPill.trailingAnchor.constraint(lessThanOrEqualTo: guide.trailingAnchor, constant: -16),

            startButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            startButton.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -20),

            skipButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            skipButton.centerYAnchor.constraint(equalTo: startButton.centerYAnchor),

            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: startButton.centerYAnchor),

            stepIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stepIndicator.bottomAnchor.constraint(equalTo: startButton.topAnchor, constant: -22),
        ])
    }

    private func pin(_ v: UIView) {
        NSLayoutConstraint.activate([
            v.topAnchor.constraint(equalTo: view.topAnchor),
            v.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            v.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            v.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    // MARK: AR

    private func startSession() {
        sceneView.scene.rootNode.childNodes.forEach { $0.removeFromParentNode() }
        let configuration = ARFaceTrackingConfiguration()
        configuration.isLightEstimationEnabled = true
        highResSupported = false
        // Yüksek çözünürlüklü kare yakalama (iOS 16+, cihaz destekliyorsa)
        if #available(iOS 16.0, *),
           let format = ARFaceTrackingConfiguration.recommendedVideoFormatForHighResolutionFrameCapturing {
            configuration.videoFormat = format
            highResSupported = true
        }
        sceneView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
    }

    func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
        guard anchor is ARFaceAnchor,
              let device = sceneView.device,
              let maskGeometry = ARSCNFaceGeometry(device: device) else { return }
        let newMask = FaceMeshNode(geometry: maskGeometry)
        node.addChildNode(newMask)
        self.mask = newMask
    }

    func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
        guard let faceAnchor = anchor as? ARFaceAnchor else { return }
        mask?.update(withFaceAnchor: faceAnchor)
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        print("[ar-scanner] AR session failed: \(error.localizedDescription)")
    }

    func sessionWasInterrupted(_ session: ARSession) {
        print("[ar-scanner] AR session interrupted")
    }

    func sessionInterruptionEnded(_ session: ARSession) {
        resetGuide()
        startSession()
    }

    // MARK: Rehberli yakalama (ARSession delegate — ana kuyruk)

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard step == .front || step == .sideA || step == .sideB else { return }
        guard let face = frame.anchors.compactMap({ $0 as? ARFaceAnchor }).first, face.isTracked else {
            poseHistory.removeAll()
            waiting("Yüzünüzü kameraya gösterin")
            return
        }

        let angles = headAngles(face: face, camera: frame.camera)
        let hold = trackHold(angles, time: frame.timestamp)
        let yaw = angles.x, pitch = angles.y

        switch step {
        case .front:
            guard abs(yaw) < frontMaxYaw, abs(pitch) < frontMaxPitch else { waiting("Kameraya düz bakın"); return }
            guard eyesOpen(face) else { waiting("Gözlerinizi açın", warn: true); return }
            guard hold >= 1 else { holding(hold); return }
            capture(face: face, frame: frame, isFront: true)
            step = .sideA

        case .sideA, .sideB:
            if abs(yaw) > sideMaxYaw { waiting("Biraz geri dönün"); return }
            let turned = abs(yaw) >= sideMinYaw && (step == .sideA || sign(yaw) == -firstSideYawSign)
            guard turned else {
                waiting(step == .sideA ? "Başınızı yavaşça bir yana çevirin" : "Şimdi diğer yana çevirin")
                return
            }
            guard abs(pitch) < sideMaxPitch else { waiting("Başınızı dik tutun"); return }
            guard expressionMatches(face) else { waiting("Ön pozdaki ifadeyi koruyun", warn: true); return }
            guard hold >= 1 else { holding(hold); return }
            capture(face: face, frame: frame, isFront: false)
            if step == .sideA {
                firstSideYawSign = sign(yaw)
                firstTurnScreenSign = screenTurnSign(face)
                step = .sideB
            } else {
                processCapture()
                return
            }

        default:
            return
        }
        poseHistory.removeAll()
        refreshGuide()
    }

    private func waiting(_ text: String, warn: Bool = false) {
        hintPill.set(text, warn: warn)
        stepIndicator.setHoldProgress(0)
    }

    private func holding(_ progress: CGFloat) {
        hintPill.set("Sabit durun")
        stepIndicator.setHoldProgress(progress)
    }

    /// Kameranın yüze göre açısı: x = yaw (sağ-sol), y = pitch (yukarı-aşağı), radyan.
    private func headAngles(face: ARFaceAnchor, camera: ARCamera) -> SIMD2<Float> {
        let c = camera.transform.columns.3
        let local = simd_inverse(face.transform) * SIMD4<Float>(c.x, c.y, c.z, 1)
        let yaw = atan2(local.x, local.z)
        let pitch = atan2(local.y, simd_length(SIMD2<Float>(local.x, local.z)))
        return SIMD2<Float>(yaw, pitch)
    }

    /// Açılar `stableRange` içinde kaldıkça süre birikir; 0…1 (1 = holdDuration doldu).
    private func trackHold(_ angles: SIMD2<Float>, time: TimeInterval) -> CGFloat {
        poseHistory.append((time, angles))
        var lo = angles, hi = angles
        for s in poseHistory { lo = simd_min(lo, s.angles); hi = simd_max(hi, s.angles) }
        if hi.x - lo.x > stableRange || hi.y - lo.y > stableRange {
            poseHistory = [(time, angles)]
        }
        while poseHistory.count > 1 && poseHistory[1].time <= time - holdDuration {
            poseHistory.removeFirst()
        }
        return CGFloat(min(1, (time - poseHistory[0].time) / holdDuration))
    }

    /// İlk yan pozda burnun EKRANDA hangi yöne döndüğü (+1 sağ, −1 sol).
    private func screenTurnSign(_ face: ARFaceAnchor) -> Float {
        let o = face.transform.columns.3
        let f = face.transform * SIMD4<Float>(0, 0, 0.1, 1)
        let po = sceneView.projectPoint(SCNVector3(o.x, o.y, o.z))
        let pf = sceneView.projectPoint(SCNVector3(f.x, f.y, f.z))
        return pf.x - po.x >= 0 ? 1 : -1
    }

    private func eyesOpen(_ face: ARFaceAnchor) -> Bool {
        let bl = face.blendShapes[.eyeBlinkLeft]?.floatValue ?? 0
        let br = face.blendShapes[.eyeBlinkRight]?.floatValue ?? 0
        return bl < 0.45 && br < 0.45
    }

    /// Ağız/çene ifadesi (ön poz referans). Yan pozda ifade değişirse renkler yanlış
    /// yere düşer (dudak yanağa taşar) → yakalanmaz.
    private func expressionVector(_ face: ARFaceAnchor) -> [Float] {
        func v(_ k: ARFaceAnchor.BlendShapeLocation) -> Float { face.blendShapes[k]?.floatValue ?? 0 }
        return [
            v(.jawOpen),
            (v(.mouthSmileLeft) + v(.mouthSmileRight)) / 2,
            v(.mouthFunnel),
            v(.mouthPucker),
            v(.mouthClose),
        ]
    }

    private func expressionMatches(_ face: ARFaceAnchor) -> Bool {
        let current = expressionVector(face)
        guard current.count == frontExpression.count else { return true }
        return zip(current, frontExpression).allSatisfy { abs($0 - $1) < 0.18 }
    }

    // MARK: Kare yakalama

    private final class Once { var fired = false }

    private func capture(face: ARFaceAnchor, frame: ARFrame, isFront: Bool) {
        if isFront {
            // Göz delikleri kişinin kendi gözüyle kapatılır; ağız açık kalır
            let filled = EyeHoleFiller.fillEyes(
                MeshSnapshot(faceGeometry: face.geometry),
                leftEye: face.leftEyeTransform,
                rightEye: face.rightEyeTransform
            )
            frontSnapshot = filled.snapshot
            frontEyeCaps = filled.caps
            frontExpression = expressionVector(face)
            frontEyeCenters = [face.leftEyeTransform.columns.3, face.rightEyeTransform.columns.3]
                .map { SIMD3<Float>($0.x, $0.y, $0.z) }
        }

        let slot = samples.count
        samples.append(nil)
        let group = captureGroup
        let generation = captureGeneration
        group.enter()

        let faceTransform = face.transform
        let liveCamera = frame.camera
        let localVertices = face.geometry.vertices
        let viewport = sceneView.bounds.size
        let context = ciContext

        // Ekran görüntüsü her zaman alınır (yedek + yüksek çözünürlük doğrulaması).
        // Gri mesh overlay'i renklere karışmasın → gizle, al, geri aç.
        let wasHidden = mask?.isHidden ?? true
        mask?.isHidden = true
        let screenImage = sceneView.snapshot()
        mask?.isHidden = wasHidden

        let once = Once()
        let finalize: (ARFrame?) -> Void = { [weak self] hiFrame in
            guard !once.fired else { return }
            once.fired = true
            let hiTransform = hiFrame?.anchors.compactMap { $0 as? ARFaceAnchor }.first?.transform ?? faceTransform
            let hiBuffer = hiFrame?.capturedImage
            let hiCamera = hiFrame?.camera
            DispatchQueue.global(qos: .userInitiated).async {
                let snapView = Self.snapshotView(image: screenImage, viewport: viewport,
                                                 faceTransform: faceTransform, camera: liveCamera, context: context)
                var highRes: FaceColorView?
                if let hiBuffer, let hiCamera {
                    highRes = Self.highResView(buffer: hiBuffer, camera: hiCamera, faceTransform: hiTransform,
                                               localVertices: localVertices, context: context)
                }
                DispatchQueue.main.async {
                    if let self, self.captureGeneration == generation, slot < self.samples.count, let snapView {
                        self.samples[slot] = FaceColorSample(snapshotView: snapView, highResView: highRes)
                    }
                    group.leave()
                }
            }
        }

        if #available(iOS 16.0, *), highResSupported {
            sceneView.session.captureHighResolutionFrame { hiFrame, _ in
                DispatchQueue.main.async { finalize(hiFrame) }
            }
            // Güvenlik: yüksek çözünürlük gelmezse ekran görüntüsüyle devam
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { finalize(nil) }
        } else {
            finalize(nil)
        }

        playCaptureFeedback()
    }

    private static func snapshotView(image: UIImage, viewport: CGSize, faceTransform: simd_float4x4,
                                     camera: ARCamera, context: CIContext) -> FaceColorView? {
        guard let cg = image.cgImage, viewport.width > 0, viewport.height > 0,
              let pixels = FacePixels.make(from: CIImage(cgImage: cg), crop: nil, context: context) else { return nil }
        let scale = SIMD2<Float>(Float(cg.width - 1) / Float(viewport.width),
                                 Float(cg.height - 1) / Float(viewport.height))
        return FaceColorView(faceTransform: faceTransform, camera: camera, orientation: .portrait,
                             projectionSize: viewport, pixelScale: scale, pixels: pixels)
    }

    /// Kameranın ham (sensör yönlü) yüksek çözünürlüklü karesi, yüz çevresine kırpılmış.
    private static func highResView(buffer: CVPixelBuffer, camera: ARCamera, faceTransform: simd_float4x4,
                                     localVertices: [SIMD3<Float>], context: CIContext) -> FaceColorView? {
        let resolution = camera.imageResolution
        var lo = SIMD2<Float>(repeating: .greatestFiniteMagnitude)
        var hi = SIMD2<Float>(repeating: -.greatestFiniteMagnitude)
        for v in localVertices {
            let w = faceTransform * SIMD4<Float>(v, 1)
            let p = camera.projectPoint(SIMD3<Float>(w.x, w.y, w.z), orientation: .landscapeRight, viewportSize: resolution)
            let q = SIMD2<Float>(Float(p.x), Float(p.y))
            lo = simd_min(lo, q); hi = simd_max(hi, q)
        }
        guard lo.x < hi.x, lo.y < hi.y else { return nil }
        let margin = (hi - lo) * 0.08
        let crop = CGRect(x: CGFloat(lo.x - margin.x), y: CGFloat(lo.y - margin.y),
                          width: CGFloat(hi.x - lo.x + 2 * margin.x), height: CGFloat(hi.y - lo.y + 2 * margin.y))
        guard let pixels = FacePixels.make(from: CIImage(cvPixelBuffer: buffer), crop: crop, context: context) else { return nil }
        return FaceColorView(faceTransform: faceTransform, camera: camera, orientation: .landscapeRight,
                             projectionSize: resolution, pixelScale: SIMD2<Float>(1, 1), pixels: pixels)
    }

    private func playCaptureFeedback() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        AudioServicesPlaySystemSound(1057)
        flashView.alpha = 0.35
        UIView.animate(withDuration: 0.45, delay: 0, options: [.curveEaseOut, .allowUserInteraction]) {
            self.flashView.alpha = 0
        }
    }

    // MARK: Butonlar

    @objc private func cancel() {
        finish(nil)
    }

    @objc private func startTap() {
        guard step == .idle else { return }
        step = .front
        poseHistory.removeAll()
        refreshGuide()
    }

    /// Baş çevrilemiyorsa: eldeki karelerle bitir
    @objc private func skipTap() {
        guard step == .sideA || step == .sideB else { return }
        processCapture()
    }

    private func resetGuide() {
        captureGeneration += 1
        captureGroup = DispatchGroup()
        step = .idle
        samples.removeAll()
        frontSnapshot = nil
        frontExpression = []
        frontEyeCenters = []
        frontEyeCaps = []
        firstSideYawSign = 0
        firstTurnScreenSign = 0
        poseHistory.removeAll()
        refreshGuide()
    }

    private func refreshGuide() {
        let captured = samples.count
        switch step {
        case .idle:
            stepIndicator.update(completed: 0, current: nil)
            directionCue.setMode(.none)
            hintPill.set("Telefonu yüz hizasında tutun")
        case .front:
            stepIndicator.update(completed: 0, current: 0)
            directionCue.setMode(.none)
            hintPill.set("Kameraya düz bakın")
        case .sideA:
            stepIndicator.update(completed: 1, current: 1)
            directionCue.setMode(.both)
            hintPill.set("Başınızı yavaşça bir yana çevirin")
        case .sideB:
            stepIndicator.update(completed: 2, current: 2)
            directionCue.setMode(firstTurnScreenSign > 0 ? .left : .right)
            hintPill.set("Şimdi diğer yana çevirin")
        case .processing:
            stepIndicator.update(completed: captured, current: nil)
            directionCue.setMode(.none)
            hintPill.set("Renkler birleştiriliyor")
        }
        stepIndicator.setHoldProgress(0)
        setVisible(startButton, step == .idle)
        setVisible(skipButton, step == .sideA || step == .sideB)
        step == .processing ? spinner.startAnimating() : spinner.stopAnimating()
    }

    private func setVisible(_ v: UIView, _ visible: Bool) {
        v.isUserInteractionEnabled = visible
        UIView.animate(withDuration: 0.25) { v.alpha = visible ? 1 : 0 }
    }

    // MARK: İşleme + önizleme

    private func processCapture() {
        guard frontSnapshot != nil, !samples.isEmpty else { return }
        step = .processing
        refreshGuide()

        let generation = captureGeneration
        // Bekleyen yüksek çözünürlüklü kareler tamamlanınca birleştir
        captureGroup.notify(queue: .main) { [weak self] in
            guard let self, self.captureGeneration == generation, let snapshot = self.frontSnapshot else { return }
            guard let front = self.samples.first, front != nil else {
                self.finish(.failure(CaptureError.frontMissing))
                return
            }
            let captured = self.samples.compactMap { $0 }
            let eyes = self.frontEyeCenters
            let eyeCaps = self.frontEyeCaps
            let context = self.ciContext
            // Bölme + çok kareli renk birleştirme + doku pişirme birkaç sn → ana thread'i kilitleme
            DispatchQueue.global(qos: .userInitiated).async {
                let result = FaceColorMesh.build(snapshot: snapshot, samples: captured, frontOnlyCenters: eyes)
                DispatchQueue.main.async {
                    guard self.captureGeneration == generation else { return }
                    self.hintPill.set("Doku hazırlanıyor")
                }
                // Doku başarısız olursa köşe renkli PLY ile devam (önceki davranış)
                let texture = FaceTextureBaker.bake(snapshot: snapshot, views: result.views, gains: result.gains,
                                                    frontOnlyCenters: eyes, eyeCaps: eyeCaps, context: context)
                DispatchQueue.main.async {
                    guard self.onFinish != nil, self.captureGeneration == generation else { return }
                    self.presentPreview(mesh: result.mesh, texture: texture)
                }
            }
        }
    }

    private func presentPreview(mesh: ColoredMesh, texture: BakedFaceTexture?) {
        let preview = FacePreviewViewController(mesh: mesh, texture: texture)
        preview.modalPresentationStyle = .fullScreen
        // Tekrar Tara → önizleme kapanır, viewDidAppear rehberi sıfırlayıp kamerayı başlatır
        preview.onRetry = { [weak preview] in preview?.dismiss(animated: true) }
        // Siparişe Kaydet → PLY (+ dokulu OBJ paketi) yazılır, finish self'i dismiss eder
        preview.onSave = { [weak self, weak preview] enhanced in
            guard let self else { return }
            preview?.setSaving(true)
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let dir = self.freshCaptureDirectory()
                    let url = dir.appendingPathComponent("face_scan.ply")
                    try PLYExporter.writeBinary(mesh, to: url)
                    var files = FaceCaptureFiles(ply: url)
                    // OBJ paketi yazılamazsa PLY yine kaydedilir
                    if let texture,
                       let obj = try? OBJExporter.writeTextured(texture, texture: enhanced ? texture.enhanced : texture.original,
                                                                to: dir) {
                        files.obj = obj.obj
                        files.mtl = obj.mtl
                        files.texture = obj.texture
                    }
                    DispatchQueue.main.async { self.finish(.success(files)) }
                } catch {
                    DispatchQueue.main.async {
                        preview?.setSaving(false)
                        self.finish(.failure(CaptureError.writeFailed(error.localizedDescription)))
                    }
                }
            }
        }
        present(preview, animated: true)
    }

    private func freshCaptureDirectory() -> URL {
        let base = URL(fileURLWithPath: NSTemporaryDirectory())
        let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let dir = base.appendingPathComponent("face-capture-\(stamp)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    // MARK: Finish

    private func finish(_ result: Result<FaceCaptureFiles, Error>?) {
        let cb = onFinish
        onFinish = nil
        dismiss(animated: true) {
            cb?(result)
        }
    }
}
