import UIKit
import SceneKit
import ARKit

/// Sonuç: dosya URL'leri. JS tarafına resolve edilir.
struct FaceCaptureFiles {
    let asciiSTL: URL
    let binarySTL: URL
    let obj: URL
    let mtl: URL?
    let texturePNG: URL?
    let usdz: URL?     // ModelIO ile OBJ'den üretilen, texture gömülü tek dosya
}

/// AR yüz tarama VC — modal olarak sunulur, capture / cancel ile dismiss eder.
/// Promise tabanlı kullanım için ArScannerModule tarafından present edilir.
final class FaceCaptureViewController: UIViewController, ARSCNViewDelegate, ARSessionDelegate {

    /// Capture başarılı → files. Cancel → nil.
    var onFinish: ((Result<FaceCaptureFiles, Error>?) -> Void)?

    private let sceneView = ARSCNView()
    private var mask: FaceMeshNode?
    private var lastFaceAnchor: ARFaceAnchor?
    private var captureButton: UIButton!
    private var cancelButton: UIButton!
    private var hintLabel: UILabel!
    private var eyesOpen = true

    enum CaptureError: LocalizedError {
        case unsupportedDevice
        case noFaceDetected
        case writeFailed(String)

        var errorDescription: String? {
            switch self {
            case .unsupportedDevice: return "Bu cihazda TrueDepth ön kamera yok."
            case .noFaceDetected: return "Yüz tespit edilemedi. Lütfen yüzünüzü kameraya gösterin."
            case .writeFailed(let s): return "Dosya yazılamadı: \(s)"
            }
        }
    }

    // MARK: Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupSceneView()
        setupButtons()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        UIApplication.shared.isIdleTimerDisabled = true   // tarama sırasında ekran uyumasın

        guard ARFaceTrackingConfiguration.isSupported else {
            finish(.failure(CaptureError.unsupportedDevice))
            return
        }
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

        NSLayoutConstraint.activate([
            sceneView.topAnchor.constraint(equalTo: view.topAnchor),
            sceneView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            sceneView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            sceneView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func setupButtons() {
        captureButton = makeButton(title: "Yakala", action: #selector(capture))
        captureButton.backgroundColor = .white
        captureButton.setTitleColor(.black, for: .normal)
        view.addSubview(captureButton)

        cancelButton = makeButton(title: "Vazgeç", action: #selector(cancel))
        cancelButton.backgroundColor = UIColor.white.withAlphaComponent(0.25)
        cancelButton.setTitleColor(.white, for: .normal)
        view.addSubview(cancelButton)

        // Göz rehberi — gözler açık + üstteki kameraya bakılması için
        hintLabel = UILabel()
        hintLabel.translatesAutoresizingMaskIntoConstraints = false
        hintLabel.numberOfLines = 2
        hintLabel.textAlignment = .center
        hintLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        hintLabel.textColor = .white
        hintLabel.text = "👁 Gözler açık · üstteki kameraya bakın"
        hintLabel.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        hintLabel.layer.cornerRadius = 14
        hintLabel.layer.masksToBounds = true
        view.addSubview(hintLabel)

        NSLayoutConstraint.activate([
            captureButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            captureButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            captureButton.widthAnchor.constraint(equalToConstant: 160),
            captureButton.heightAnchor.constraint(equalToConstant: 55),

            cancelButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            cancelButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            cancelButton.heightAnchor.constraint(equalToConstant: 40),
            cancelButton.widthAnchor.constraint(equalToConstant: 90),

            hintLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            hintLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            hintLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 70),
            hintLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -16),
            hintLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
        ])
    }

    private func makeButton(title: String, action: Selector) -> UIButton {
        let b = UIButton(type: .system)
        b.setTitle(title, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        b.layer.cornerRadius = 12
        b.translatesAutoresizingMaskIntoConstraints = false
        b.addTarget(self, action: action, for: .touchUpInside)
        return b
    }

    // MARK: AR

    private func startSession() {
        sceneView.scene.rootNode.childNodes.forEach { $0.removeFromParentNode() }
        let configuration = ARFaceTrackingConfiguration()
        configuration.isLightEstimationEnabled = true
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
        lastFaceAnchor = faceAnchor

        // Göz-açık tespiti (blendShape: 0=açık, 1=kapalı)
        let bl = faceAnchor.blendShapes[.eyeBlinkLeft]?.floatValue ?? 0
        let br = faceAnchor.blendShapes[.eyeBlinkRight]?.floatValue ?? 0
        let open = bl < 0.45 && br < 0.45
        if open != eyesOpen {
            eyesOpen = open
            DispatchQueue.main.async {
                if open {
                    self.hintLabel.text = "👁 Gözler açık · üstteki kameraya bakın"
                    self.hintLabel.backgroundColor = UIColor.black.withAlphaComponent(0.45)
                } else {
                    self.hintLabel.text = "⚠ Gözlerinizi açın"
                    self.hintLabel.backgroundColor = UIColor.systemOrange.withAlphaComponent(0.85)
                }
            }
        }
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        print("[ar-scanner] AR session failed: \(error.localizedDescription)")
    }

    func sessionWasInterrupted(_ session: ARSession) {
        print("[ar-scanner] AR session interrupted")
    }

    func sessionInterruptionEnded(_ session: ARSession) {
        startSession()
    }

    // MARK: Capture

    @objc private func cancel() {
        finish(nil)
    }

    @objc private func capture() {
        guard let faceAnchor = lastFaceAnchor,
              let frame = sceneView.session.currentFrame else {
            finish(.failure(CaptureError.noFaceDetected))
            return
        }

        // Gözler kapalıysa yakalama — texture'da iris olsun (gözler işlensin)
        guard eyesOpen else {
            hintLabel.text = "⚠ Gözlerinizi açıp tekrar deneyin"
            hintLabel.backgroundColor = UIColor.systemOrange.withAlphaComponent(0.9)
            return
        }

        let snapshot = MeshSnapshot(faceGeometry: faceAnchor.geometry)
        // Gri mesh overlay'i texture'a karışmasın → snapshot öncesi gizle, sonra geri aç
        let wasHidden = mask?.isHidden ?? true
        mask?.isHidden = true
        let image = sceneView.snapshot()
        mask?.isHidden = wasHidden

        do {
            let files = try writeAllFormats(
                snapshot: snapshot,
                faceAnchor: faceAnchor,
                camera: frame.camera,
                viewportSize: sceneView.bounds.size,
                snapshotImage: image
            )
            // USDZ varsa tarama sonrası önizleme göster (Kaydet/Tekrar), yoksa direkt kaydet
            if let usdz = files.usdz {
                presentPreview(usdz: usdz, files: files)
            } else {
                finish(.success(files))
            }
        } catch {
            finish(.failure(CaptureError.writeFailed(error.localizedDescription)))
        }
    }

    private func presentPreview(usdz: URL, files: FaceCaptureFiles) {
        let pv = USDZPreviewVC(url: usdz)
        pv.modalPresentationStyle = .fullScreen
        pv.onSave = { [weak self] in self?.finish(.success(files)) }   // finish self'i dismiss eder (preview dahil)
        pv.onRetry = { [weak pv] in pv?.dismiss(animated: true) }      // capture'a geri dön
        present(pv, animated: true)
    }

    private func writeAllFormats(
        snapshot: MeshSnapshot,
        faceAnchor: ARFaceAnchor,
        camera: ARCamera,
        viewportSize: CGSize,
        snapshotImage: UIImage
    ) throws -> FaceCaptureFiles {
        let dir = freshCaptureDirectory()

        let asciiSTL = STLExporter.ascii(from: snapshot)
        let binarySTL = STLExporter.binary(from: snapshot)
        let objOut = OBJExporter.textured(
            from: snapshot,
            faceAnchor: faceAnchor,
            camera: camera,
            viewportSize: viewportSize,
            snapshotImage: snapshotImage
        )

        let asciiURL = dir.appendingPathComponent("face.stl")
        let binaryURL = dir.appendingPathComponent("face_binary.stl")
        let objURL = dir.appendingPathComponent("face.obj")
        let mtlURL = dir.appendingPathComponent("face.mtl")
        let pngURL = dir.appendingPathComponent("face.png")

        try asciiSTL.write(to: asciiURL, options: .atomic)
        try binarySTL.write(to: binaryURL, options: .atomic)
        try objOut.obj.write(to: objURL, options: .atomic)

        var mtlOut: URL? = nil
        var pngOut: URL? = nil
        if let mtl = objOut.mtl {
            try mtl.write(to: mtlURL, options: .atomic)
            mtlOut = mtlURL
        }
        if let png = objOut.texturePNG {
            try png.write(to: pngURL, options: .atomic)
            pngOut = pngURL
        }

        // OBJ → USDZ (texture gömülü, indirince renkli açılır). Best-effort.
        var usdzOut: URL? = nil
        let usdzURL = dir.appendingPathComponent("face.usdz")
        if (try? USDZExporter.export(objURL: objURL, to: usdzURL)) != nil,
           FileManager.default.fileExists(atPath: usdzURL.path) {
            usdzOut = usdzURL
        }

        return FaceCaptureFiles(
            asciiSTL: asciiURL,
            binarySTL: binaryURL,
            obj: objURL,
            mtl: mtlOut,
            texturePNG: pngOut,
            usdz: usdzOut
        )
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

// MARK: - Tarama sonrası önizleme (QuickLook USDZ + Kaydet/Tekrar)

import QuickLook

final class USDZPreviewVC: UIViewController, QLPreviewControllerDataSource {
    private let url: URL
    var onSave: (() -> Void)?
    var onRetry: (() -> Void)?

    init(url: URL) { self.url = url; super.init(nibName: nil, bundle: nil) }
    @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let ql = QLPreviewController()
        ql.dataSource = self
        addChild(ql)
        ql.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(ql.view)
        ql.didMove(toParent: self)

        let retry = makeButton("Tekrar Tara", bg: UIColor.white.withAlphaComponent(0.22), fg: .white, action: #selector(retryTap))
        let save = makeButton("Kaydet ✓", bg: .white, fg: .black, action: #selector(saveTap))
        let stack = UIStackView(arrangedSubviews: [retry, save])
        stack.axis = .horizontal
        stack.spacing = 12
        stack.distribution = .fillEqually
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            ql.view.topAnchor.constraint(equalTo: view.topAnchor),
            ql.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            ql.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            ql.view.bottomAnchor.constraint(equalTo: stack.topAnchor, constant: -12),
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
            stack.heightAnchor.constraint(equalToConstant: 52),
        ])
    }

    private func makeButton(_ title: String, bg: UIColor, fg: UIColor, action: Selector) -> UIButton {
        let b = UIButton(type: .system)
        b.setTitle(title, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        b.setTitleColor(fg, for: .normal)
        b.backgroundColor = bg
        b.layer.cornerRadius = 26
        b.addTarget(self, action: action, for: .touchUpInside)
        return b
    }

    @objc private func saveTap() { onSave?() }
    @objc private func retryTap() { onRetry?() }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        url as NSURL
    }
}
