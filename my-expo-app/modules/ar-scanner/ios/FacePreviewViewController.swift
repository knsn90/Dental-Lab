import UIKit
import SceneKit
import simd

/// Ön kamera taraması sonrası önizleme — kaydedilecek PLY'nin BİREBİR aynısını
/// (aynı ColoredMesh) gösterir. Beğenilirse "Siparişe Kaydet", değilse "Tekrar Tara".
/// "Renkli" = fotoğraf renkleri (ışıksız, gerçek ton) · "Yüzey" = gri, ışıklı geometri.
final class FacePreviewViewController: UIViewController {

    var onSave: (() -> Void)?
    var onRetry: (() -> Void)?

    private let mesh: ColoredMesh
    private let scnView = SCNView()
    private let meshNode = SCNNode()
    // Model kendi merkezinde döner (serbest kamera yerine) → elden kaçmaz
    private let pivot = SCNNode()
    private let cameraNode = SCNNode()
    private var yaw: Float = 0
    private var pitch: Float = 0
    private var velocity = SIMD2<Float>(0, 0)       // rad/sn, parmak bırakılınca kayma
    private var inertiaLink: CADisplayLink?
    private var baseDistance: Float = 0.4
    private var distance: Float = 0.4
    private var pinchStartDistance: Float = 0.4
    private let maxPitch: Float = 1.1               // ~63°, takla atmaz
    private let rotationPerPoint: Float = 0.009
    private var colorGeometry: SCNGeometry?
    private var surfaceGeometry: SCNGeometry?
    private let saveButton = UIButton(type: .system)
    private let retryButton = UIButton(type: .system)
    private let spinner = UIActivityIndicatorView(style: .medium)

    init(mesh: ColoredMesh) {
        self.mesh = mesh
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.05, green: 0.06, blue: 0.08, alpha: 1)
        setupScene()
        setupOverlay()
    }

    func setSaving(_ saving: Bool) {
        saveButton.isEnabled = !saving
        retryButton.isEnabled = !saving
        saveButton.setTitle(saving ? "" : "Siparişe Kaydet", for: .normal)
        saving ? spinner.startAnimating() : spinner.stopAnimating()
    }

    // MARK: Sahne

    private func setupScene() {
        scnView.translatesAutoresizingMaskIntoConstraints = false
        scnView.backgroundColor = .clear
        scnView.antialiasingMode = .multisampling4X
        scnView.allowsCameraControl = false
        view.addSubview(scnView)
        NSLayoutConstraint.activate([
            scnView.topAnchor.constraint(equalTo: view.topAnchor),
            scnView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scnView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scnView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        let scene = SCNScene()
        scnView.scene = scene
        buildGeometries()
        meshNode.geometry = colorGeometry

        // Ortala: modeli orijine taşı, kamera boyuta göre mesafe alsın
        var lo = SIMD3<Float>(repeating: .greatestFiniteMagnitude)
        var hi = SIMD3<Float>(repeating: -.greatestFiniteMagnitude)
        for p in mesh.positions { lo = simd_min(lo, p); hi = simd_max(hi, p) }
        let center = (lo + hi) * 0.5
        let maxDim = max(simd_reduce_max(hi - lo), 0.01)
        meshNode.position = SCNVector3(-center.x, -center.y, -center.z)
        pivot.addChildNode(meshNode)
        scene.rootNode.addChildNode(pivot)

        let ambient = SCNNode()
        ambient.light = SCNLight()
        ambient.light?.type = .ambient
        ambient.light?.intensity = 350
        scene.rootNode.addChildNode(ambient)
        let key = SCNNode()
        key.light = SCNLight()
        key.light?.type = .directional
        key.light?.intensity = 900
        key.eulerAngles = SCNVector3(-0.35, 0.35, 0)
        scene.rootNode.addChildNode(key)

        cameraNode.camera = SCNCamera()
        cameraNode.camera?.fieldOfView = 35
        cameraNode.camera?.zNear = 0.005
        cameraNode.camera?.zFar = 10
        baseDistance = maxDim * 2.4
        distance = baseDistance
        cameraNode.position = SCNVector3(0, 0, distance)
        scene.rootNode.addChildNode(cameraNode)
        scnView.pointOfView = cameraNode

        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pan.maximumNumberOfTouches = 1
        scnView.addGestureRecognizer(pan)
        scnView.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:))))
        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap))
        doubleTap.numberOfTapsRequired = 2
        scnView.addGestureRecognizer(doubleTap)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopInertia()
    }

    // MARK: Dokunma kontrolleri

    /// Yaw dünya Y ekseninde (serbest), pitch ekran yatay ekseninde (sınırlı).
    private func applyRotation() {
        pitch = min(max(pitch, -maxPitch), maxPitch)
        pivot.simdOrientation = simd_quatf(angle: pitch, axis: SIMD3<Float>(1, 0, 0))
            * simd_quatf(angle: yaw, axis: SIMD3<Float>(0, 1, 0))
    }

    @objc private func handlePan(_ g: UIPanGestureRecognizer) {
        switch g.state {
        case .began:
            stopInertia()
        case .changed:
            let t = g.translation(in: scnView)
            yaw += Float(t.x) * rotationPerPoint
            pitch += Float(t.y) * rotationPerPoint
            g.setTranslation(.zero, in: scnView)
            applyRotation()
        case .ended, .cancelled:
            let v = g.velocity(in: scnView)
            velocity = SIMD2<Float>(Float(v.x), Float(v.y)) * rotationPerPoint
            startInertia()
        default:
            break
        }
    }

    @objc private func handlePinch(_ g: UIPinchGestureRecognizer) {
        switch g.state {
        case .began:
            pinchStartDistance = distance
        case .changed:
            let scale = max(Float(g.scale), 0.01)
            distance = min(max(pinchStartDistance / scale, baseDistance * 0.45), baseDistance * 2.2)
            cameraNode.simdPosition = SIMD3<Float>(0, 0, distance)
        default:
            break
        }
    }

    @objc private func handleDoubleTap() {
        stopInertia()
        yaw = 0
        pitch = 0
        distance = baseDistance
        SCNTransaction.begin()
        SCNTransaction.animationDuration = 0.45
        SCNTransaction.animationTimingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        applyRotation()
        cameraNode.simdPosition = SIMD3<Float>(0, 0, distance)
        SCNTransaction.commit()
    }

    private func startInertia() {
        stopInertia()
        guard simd_length(velocity) > 0.05 else { return }
        let link = CADisplayLink(target: self, selector: #selector(stepInertia(_:)))
        link.add(to: .main, forMode: .common)
        inertiaLink = link
    }

    @objc private func stepInertia(_ link: CADisplayLink) {
        let dt = Float(max(link.targetTimestamp - link.timestamp, 1.0 / 120))
        yaw += velocity.x * dt
        pitch += velocity.y * dt
        // Üstel yavaşlama (~0.35 sn'de sönümlenir)
        velocity *= exp(-dt * 7)
        applyRotation()
        if simd_length(velocity) < 0.05 { stopInertia() }
    }

    private func stopInertia() {
        inertiaLink?.invalidate()
        inertiaLink = nil
    }

    private func buildGeometries() {
        let normals = FaceColorMesh.vertexNormals(mesh.positions, mesh.triangles)
        let vertexSource = SCNGeometrySource(vertices: mesh.positions.map { SCNVector3($0.x, $0.y, $0.z) })
        let normalSource = SCNGeometrySource(normals: normals.map { SCNVector3($0.x, $0.y, $0.z) })

        // SceneKit lineer renk uzayında çizer ve köşe rengini LİNEER kabul eder.
        // PLY'deki değerler sRGB → doğrudan verilirse gama iki kez uygulanır, renkler
        // soluk/yıkanmış görünür. Önizleme için sRGB → lineer çevrilir (PLY sRGB kalır).
        func linear(_ v: UInt8) -> Float {
            let c = Float(v) / 255
            return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        var rgb = [Float]()
        rgb.reserveCapacity(mesh.colors.count * 3)
        for c in mesh.colors { rgb.append(linear(c.x)); rgb.append(linear(c.y)); rgb.append(linear(c.z)) }
        let colorData = rgb.withUnsafeBufferPointer { Data(buffer: $0) }
        let colorSource = SCNGeometrySource(
            data: colorData, semantic: .color, vectorCount: mesh.colors.count,
            usesFloatComponents: true, componentsPerVector: 3,
            bytesPerComponent: MemoryLayout<Float>.size, dataOffset: 0,
            dataStride: MemoryLayout<Float>.size * 3)
        let element = SCNGeometryElement(indices: mesh.triangles, primitiveType: .triangles)

        let colorMaterial = SCNMaterial()
        colorMaterial.lightingModel = .constant          // fotoğraftaki gerçek ton
        colorMaterial.diffuse.contents = UIColor.white
        colorMaterial.isDoubleSided = true
        let color = SCNGeometry(sources: [vertexSource, normalSource, colorSource], elements: [element])
        color.materials = [colorMaterial]
        colorGeometry = color

        let surfaceMaterial = SCNMaterial()
        surfaceMaterial.lightingModel = .physicallyBased
        surfaceMaterial.diffuse.contents = UIColor(white: 0.82, alpha: 1)
        surfaceMaterial.roughness.contents = 0.6
        surfaceMaterial.isDoubleSided = true
        let surface = SCNGeometry(sources: [vertexSource, normalSource], elements: [element])
        surface.materials = [surfaceMaterial]
        surfaceGeometry = surface
    }

    // MARK: Arayüz

    private func setupOverlay() {
        let title = UILabel()
        title.text = "Önizleme"
        title.font = .systemFont(ofSize: 17, weight: .semibold)
        title.textColor = .white

        let modes = UISegmentedControl(items: ["Renkli", "Yüzey"])
        modes.selectedSegmentIndex = 0
        modes.selectedSegmentTintColor = .white
        modes.setTitleTextAttributes([.foregroundColor: UIColor.black], for: .selected)
        modes.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .normal)
        modes.backgroundColor = UIColor.white.withAlphaComponent(0.18)
        modes.addTarget(self, action: #selector(modeChanged(_:)), for: .valueChanged)

        let top = UIStackView(arrangedSubviews: [title, UIView(), modes])
        top.axis = .horizontal
        top.alignment = .center
        top.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(top)

        let hint = UILabel()
        hint.text = "Sürükle: döndür · iki parmak: yakınlaştır · çift dokun: sıfırla"
        hint.font = .systemFont(ofSize: 12, weight: .medium)
        hint.textColor = UIColor.white.withAlphaComponent(0.6)
        hint.textAlignment = .center
        hint.numberOfLines = 2
        hint.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hint)

        style(retryButton, title: "Tekrar Tara", bg: UIColor.white.withAlphaComponent(0.22), fg: .white)
        retryButton.addTarget(self, action: #selector(retryTap), for: .touchUpInside)
        style(saveButton, title: "Siparişe Kaydet", bg: .white, fg: .black)
        saveButton.addTarget(self, action: #selector(saveTap), for: .touchUpInside)
        spinner.color = .black
        spinner.hidesWhenStopped = true
        spinner.translatesAutoresizingMaskIntoConstraints = false
        saveButton.addSubview(spinner)

        let buttons = UIStackView(arrangedSubviews: [retryButton, saveButton])
        buttons.axis = .horizontal
        buttons.spacing = 12
        buttons.distribution = .fillEqually
        buttons.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(buttons)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            top.topAnchor.constraint(equalTo: guide.topAnchor, constant: 12),
            top.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            top.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),

            buttons.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            buttons.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
            buttons.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -12),
            buttons.heightAnchor.constraint(equalToConstant: 52),

            hint.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
            hint.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
            hint.bottomAnchor.constraint(equalTo: buttons.topAnchor, constant: -12),

            spinner.centerXAnchor.constraint(equalTo: saveButton.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: saveButton.centerYAnchor),
        ])
    }

    private func style(_ b: UIButton, title: String, bg: UIColor, fg: UIColor) {
        b.setTitle(title, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        b.setTitleColor(fg, for: .normal)
        b.setTitleColor(fg.withAlphaComponent(0.5), for: .disabled)
        b.backgroundColor = bg
        b.layer.cornerRadius = 26
    }

    @objc private func modeChanged(_ sender: UISegmentedControl) {
        meshNode.geometry = sender.selectedSegmentIndex == 0 ? colorGeometry : surfaceGeometry
    }

    @objc private func saveTap() { onSave?() }
    @objc private func retryTap() { onRetry?() }
}
