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
    @Published var maxMP: Int = 12          // "yüksek" seçeneğinin gerçek MP değeri

    /// Kameradaki yüz: konumu + bakış açısı. Rehber noktaları bununla yüze "yapışır".
    struct FaceTrack: Equatable {
        var rect: CGRect        // dik görüntüde 0…1, sol-üst köşe kökenli
        var yaw: Double
        var pitch: Double
        var aspect: CGFloat     // dik görüntünün en/boy oranı
    }
    @Published var face: FaceTrack?

    /// Bölge ızgarasının açı sınırları (radyan) ve her bölgenin merkez açısı.
    static let maxYaw = 0.85
    static let maxPitch = 0.5
    static func zoneYaw(_ zone: Int) -> Double {
        -maxYaw + 2 * maxYaw * Double(zoneCols - 1 - zone % zoneCols) / Double(zoneCols - 1)
    }
    static func zonePitch(_ zone: Int) -> Double {
        -maxPitch + 2 * maxPitch * Double(zoneRows - 1 - zone / zoneCols) / Double(zoneRows - 1)
    }

    static let zoneCols = 5
    static let zoneRows = 3
    static let zoneCount = 15          // 5 sütun (yaw) × 3 satır (pitch)
    var minShots: Int { 30 }
    var enoughForFinish: Bool { doneZones.count >= Self.minZones && photoCount >= minShots }

    enum Notice { case none, tooClose, tooFar, tooFast }
    enum Move { case left, right, up, down, hold }
    @Published var notice: Notice = .none
    @Published var limitReached = false      // kare sınırı doldu → yeni kare çekilmez
    /// Kameranın yüze yaklaşık uzaklığı (cm, 5'lik adımlarla). Yüz görünmüyorsa nil.
    @Published var distanceCM: Int?
    /// İyi çekim aralığı (cm): yakında yüz kadraja sığmaz ve netlik bozulur, uzakta ayrıntı düşer.
    static let distanceRange = 30...70

    static let minZones = 9
    /// Bitirme koşuluna ne kadar yaklaşıldı (0…1): bölge ve kare sayısından geride olan.
    var progress: Double {
        min(1, min(Double(doneZones.count) / Double(Self.minZones), Double(photoCount) / Double(minShots)))
    }
    var allZonesDone: Bool { doneZones.count >= Self.zoneCount }

    /// Operatörün bulunduğu bölgeye en yakın eksik bölge (kafa göstergesinde vurgulanır).
    static let frontZone = 7
    var frontDone: Bool { doneZones.contains(Self.frontZone) }
    var targetZone: Int? {
        // Önce gülüş: hasta gülüşünü uzun süre tutamaz → dişlerin en iyi göründüğü
        // tam karşı açı, tarama başlar başlamaz çekilir.
        if !frontDone { return Self.frontZone }
        let cols = Self.zoneCols
        let cr = currentZone / cols, cc = currentZone % cols
        func cost(_ z: Int) -> Int { abs(z % cols - cc) * 2 + abs(z / cols - cr) * 3 }
        return (0..<Self.zoneCount).filter { !doneZones.contains($0) }.min { cost($0) < cost($1) }
    }
    /// Hedefe gitmek için yön — gösterge ile aynı taraf (sütun 0 = ekranda sol, satır 0 = üst).
    var move: Move? {
        guard let t = targetZone else { return nil }
        let cols = Self.zoneCols
        let dc = t % cols - currentZone % cols, dr = t / cols - currentZone / cols
        if dc == 0 && dr == 0 { return .hold }
        if dc != 0 && abs(dc) >= abs(dr) { return dc < 0 ? .left : .right }
        return dr < 0 ? .up : .down
    }

    func reset() {
        doneZones = []; photoCount = 0; currentZone = 7; faceVisible = false
        notice = .none; limitReached = false; face = nil; distanceCM = nil
    }
}

/// Tarama ekranının vurgu rengi: uygulamadaki panel rengi (JS'ten hex gelir).
/// Ekran siyah olduğu için çok koyu bir renk okunmaz → o durumda varsayılan turkuaza düşer.
struct ScanAccent {
    let color: Color
    let onColor: Color

    init(hex: String?) {
        var r = 0.20, g = 0.82, b = 0.74
        if let hex {
            let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "# ")).prefix(6)
            if h.count == 6, let v = UInt32(h, radix: 16) {
                let pr = Double((v >> 16) & 0xFF) / 255, pg = Double((v >> 8) & 0xFF) / 255, pb = Double(v & 0xFF) / 255
                if 0.2126 * pr + 0.7152 * pg + 0.0722 * pb >= 0.22 { r = pr; g = pg; b = pb }
            }
        }
        color = Color(red: r, green: g, blue: b)
        onColor = (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.55 ? .black : .white
    }
}

/// Mesafe göstergesinin renkleri (beyaz yazı ikisinde de okunur).
enum ScanDistanceColor {
    static let good = Color(red: 0.13, green: 0.62, blue: 0.29)
    static let bad = Color(red: 0.84, green: 0.20, blue: 0.18)
}

/// Düğme, parmak değdiği anda tepki verir (bırakılınca değil) ve yayla geri döner.
struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 1), value: configuration.isPressed)
    }
}

/// Sistemin "büyük yazı" ayarına uyan yazı tipi. Sabit ölçülü düğmeler taşmasın diye
/// büyüme %35 ile sınırlı.
func scanFont(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    .system(size: min(UIFontMetrics.default.scaledValue(for: size), size * 1.35), weight: weight)
}

@available(iOS 17.0, *)
struct GuidedRearCaptureView: View {
    enum Stage: Equatable {
        case preparing              // kamera izni soruluyor
        case permissionDenied
        case intro                  // hazırlık: ipuçları + çözünürlük seçimi
        case capturing
        case reconstructing(Double)
        case preview(URL)
        case failed(String)
    }

    @StateObject private var model = RearGuidedModel()
    @State private var stage: Stage = .preparing
    // true = yüksek çözünürlük (en çok ~24 MP), false = 12 MP. Cihazda 12 MP'den büyük uygun
    // seçenek yoksa hep 12 MP.
    @State private var hiRes = RearCaptureController.highMP != nil
    @State private var dirs: ObjectCaptureDirs
    @State private var captureID = UUID()    // değişince kamera denetleyicisi baştan kurulur
    @State private var runID = 0             // eski model-oluşturma görevlerini geçersiz kılar
    @State private var photoSession: PhotogrammetrySession?
    @State private var introSeen = false     // "Tekrar tara" hazırlık ekranını yeniden göstermez
    @State private var previewColor = true   // önizlemede doku açık mı
    @State private var confirmExit = false
    @State private var confirmCancelBuild = false

    let text: GuidedRearText
    let onFinish: (Result<URL, Error>?) -> Void

    private let accent: Color
    private let onAccent: Color          // accent zeminli düğmelerin metni

    init(dirs: ObjectCaptureDirs, text: GuidedRearText, accentHex: String? = nil,
         onFinish: @escaping (Result<URL, Error>?) -> Void) {
        let tone = ScanAccent(hex: accentHex)
        accent = tone.color
        onAccent = tone.onColor
        _dirs = State(initialValue: dirs)
        self.text = text
        self.onFinish = onFinish
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch stage {
            case .preparing:            EmptyView()
            case .permissionDenied:     permissionView
            case .intro:                introView
            case .capturing:            captureView
            case .reconstructing(let p): reconstructingView(progress: p)
            case .preview(let url):     previewView(usdz: url)
            case .failed(let msg):      failedView(message: msg)
            }
        }
        .buttonStyle(PressScaleStyle())
        .environment(\.colorScheme, .dark)   // ekran hep koyu: cam yüzeyler de koyu olsun
        .environment(\.layoutDirection, text.isRTL ? .rightToLeft : .leftToRight)
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            if stage == .preparing { beginCapture() }
        }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .alert(text.exitTitle, isPresented: $confirmExit) {
            Button(text.exit, role: .destructive) { close() }
            Button(text.stay, role: .cancel) {}
        } message: { Text(text.discardNote) }
        .alert(text.cancelBuildTitle, isPresented: $confirmCancelBuild) {
            Button(text.rescan) { restart() }
            Button(text.exit, role: .destructive) { close() }
            Button(text.stay, role: .cancel) {}
        } message: { Text(text.discardNote) }
    }

    private var captureView: some View {
        ZStack {
            RearCaptureARView(model: model, imagesDir: dirs.images, hiRes: hiRes, onError: { _ in
                stage = .failed(text.cameraFailed)
            })
            .id(captureID)
            .ignoresSafeArea()

            // Rehber yüzün üstünde: noktalar başa bağlıdır, operatör döndükçe yüzeyle birlikte
            // kayar ve çekilen açıların noktası yeşile döner.
            FaceGuideOverlay(face: model.face, doneZones: model.doneZones, target: model.targetZone)
                .ignoresSafeArea()
                .environment(\.layoutDirection, .leftToRight)
                .accessibilityHidden(true)   // aynı bilgi talimatta ve düğmedeki yüzdede okunur
                .allowsHitTesting(false)

            VStack(spacing: 0) {
                HStack {
                    closeButton { if model.photoCount > 0 { confirmExit = true } else { close() } }
                    Spacer()
                    // Yaklaşık mesafe: ideal aralıkta (40–55 cm) yeşil, dışında kırmızı
                    if let cm = model.distanceCM {
                        let good = HeadScanGeometry.idealDistanceCM.contains(cm)
                        HStack(spacing: 6) {
                            Image(systemName: "ruler").font(scanFont(12))
                            Text("≈ \(cm) cm").font(scanFont(15, .semibold)).monospacedDigit()
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(good ? ScanDistanceColor.good : ScanDistanceColor.bad, in: Capsule())
                        .environment(\.layoutDirection, .leftToRight)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(text.distance(cm))
                        .transition(.opacity)
                        .animation(.spring(response: 0.3, dampingFraction: 1), value: good)
                    }
                    Spacer()
                    HStack(spacing: 6) {
                        Image(systemName: "camera.fill").font(scanFont(12))
                        Text("\(model.photoCount)").font(scanFont(15, .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(.ultraThinMaterial, in: Capsule())
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(text.shots(model.photoCount))
                }
                .padding(.horizontal, 16).padding(.top, 14)

                Spacer(minLength: 8)

                VStack(spacing: 14) {
                    // Kısa talimat düğmenin hemen üstünde; yüzün önü açık kalır, yön yüzdeki noktadan okunur.
                    ZStack {
                        Text(hint.text)
                            .font(scanFont(17, .semibold))
                            .tracking(-0.2)
                            .foregroundColor(hint.warning ? .black : .white)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 20).padding(.vertical, 11)
                            .background(hint.warning ? AnyShapeStyle(warn) : AnyShapeStyle(.ultraThinMaterial),
                                        in: Capsule())
                            .id(hint.text)
                            .transition(.opacity.combined(with: .scale(scale: 0.96)))
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 1), value: hint.text)
                    .accessibilityAddTraits(.updatesFrequently)

                        VStack(spacing: 10) {
                            // Hazır olana kadar düğme ilerleme çubuğu gibi dolar; dolunca "Bitir" olur.
                            Button(action: finish) {
                                Text(model.enoughForFinish ? text.finish : text.keepGoing(Int(model.progress * 100)))
                                    .font(scanFont(16, .semibold))
                                    .monospacedDigit()
                                    .lineLimit(1).minimumScaleFactor(0.75)
                                    .foregroundColor(model.enoughForFinish ? onAccent : .white.opacity(0.85))
                                    .frame(width: finishWidth, height: 52)
                                    .background(alignment: .leading) {
                                        accent.opacity(model.enoughForFinish ? 1 : 0.45)
                                            .frame(width: finishWidth * (model.enoughForFinish ? 1 : model.progress))
                                            .animation(.spring(response: 0.35, dampingFraction: 1), value: model.progress)
                                    }
                                    .background(Color.white.opacity(0.16))   // dolmamış kısım koyu camda da seçilsin
                                    .background(.ultraThinMaterial)
                                    .clipShape(Capsule())
                            }
                            .disabled(!model.enoughForFinish)
                            .animation(.spring(response: 0.4, dampingFraction: 0.8), value: model.enoughForFinish)

                            // Sınır doldu ama kapsama yetmedi → çıkmaz kalmasın, baştan başlat
                            if model.limitReached && !model.enoughForFinish {
                                Button(action: restart) {
                                    Text(text.rescan).font(scanFont(14, .semibold)).foregroundColor(.white)
                                        .padding(.horizontal, 18).padding(.vertical, 9)
                                        .background(.ultraThinMaterial, in: Capsule())
                                }
                            }
                        }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 30)
                .onChange(of: hint.text) { _, spoken in
                    if UIAccessibility.isVoiceOverRunning {
                        UIAccessibility.post(notification: .announcement, argument: spoken)
                    }
                }
                .onChange(of: model.enoughForFinish) { _, ready in
                    if ready { UINotificationFeedbackGenerator().notificationOccurred(.success) }
                }
            }
        }
    }

    private let finishWidth: CGFloat = 220

    private func closeButton(action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(scanFont(16, .bold)).foregroundColor(.white)
                .frame(width: 44, height: 44)
                .background(.ultraThinMaterial, in: Circle())
        }
        .accessibilityLabel(text.close)
    }

    // Hazırlık: kamera açılmadan önce ne yapılacağını anlatır; çözünürlük burada seçilir.
    private var introView: some View {
        VStack(spacing: 0) {
            HStack { closeButton(action: close); Spacer() }
                .padding(.horizontal, 16).padding(.top, 14)
            Spacer()
            VStack(alignment: .leading, spacing: 26) {
                Text(text.introTitle)
                    .font(scanFont(28, .light)).foregroundColor(.white)
                VStack(alignment: .leading, spacing: 16) {
                    tip("sun.max", text.tipLight)
                    tip("arrow.left.and.right", text.tipDistance)
                    tip("face.smiling", text.tipSmile)
                    tip("arrow.triangle.2.circlepath", text.tipMove)
                    tip("mouth", text.tipRetractor)
                }
                if let mp = RearCaptureController.highMP {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(text.qualityLabel.uppercased())
                            .font(scanFont(11, .bold)).tracking(1.2)
                            .foregroundColor(.white.opacity(0.5))
                        HStack(spacing: 0) {
                            qualityButton(title: text.qualityStandard, selected: !hiRes) { hiRes = false }
                            qualityButton(title: text.qualityHigh(mp), selected: hiRes) { hiRes = true }
                        }
                        .background(.ultraThinMaterial, in: Capsule())
                        .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
                        Text(text.qualityNote)
                            .font(scanFont(12)).foregroundColor(.white.opacity(0.55))
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 28)
            Spacer()
            Button(action: { introSeen = true; stage = .capturing }) {
                Text(text.start).font(scanFont(16, .semibold)).foregroundColor(onAccent)
                    .frame(width: 220, height: 52).background(accent, in: Capsule())
            }
            .padding(.bottom, 30)
        }
    }

    private func tip(_ symbol: String, _ label: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(scanFont(17, .regular)).foregroundColor(accent)
                .frame(width: 26, height: 22)
            Text(label)
                .font(scanFont(15)).foregroundColor(.white.opacity(0.88))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private let warn = Color(red: 0.96, green: 0.74, blue: 0.26)

    /// O anki duruma göre tek cümlelik talimat. Öncelik: yüz yok → sınır → mesafe/hız → kapsama.
    private var hint: (text: String, warning: Bool) {
        guard model.faceVisible else { return (text.aimAtFace, false) }
        if model.limitReached {
            return model.enoughForFinish ? (text.limitReached, false) : (text.limitTooFew, true)
        }
        switch model.notice {
        case .tooClose: return (text.tooClose, true)
        case .tooFar:   return (text.tooFar, true)
        case .tooFast:  return (text.tooFast, true)
        case .none:     break
        }
        if model.allZonesDone { return (text.perfect, false) }
        if model.enoughForFinish { return (text.ready, false) }
        if !model.frontDone { return (text.frontFirst, false) }
        // Yön, yüzün üstündeki beyaz hedef noktasıyla gösterilir; metin onu anlatır.
        switch model.move {
        case .hold?:  return (text.holdSteady, false)
        case nil:     return (text.moveHint, false)
        default:      return (text.chaseDot, false)
        }
    }

    private func reconstructingView(progress: Double) -> some View {
        VStack(spacing: 18) {
            ProgressView(value: progress).progressViewStyle(.linear).tint(accent).frame(width: 220)
            Text(text.building(Int(progress * 100)))
                .font(scanFont(15, .medium)).foregroundColor(.white)
            Text(text.buildingNote).font(scanFont(12)).foregroundColor(.white.opacity(0.6))
                .multilineTextAlignment(.center).padding(.horizontal, 32)
            Button(action: { confirmCancelBuild = true }) {
                Text(text.cancel).font(scanFont(15, .semibold)).foregroundColor(.white)
                    .frame(width: 160, height: 48).background(.ultraThinMaterial, in: Capsule())
            }
            .padding(.top, 14)
        }
    }

    private func previewView(usdz: URL) -> some View {
        ZStack {
            Color(red: 0.05, green: 0.06, blue: 0.08).ignoresSafeArea()
            ModelGridPreview(url: usdz, showColor: previewColor).ignoresSafeArea()
            VStack(spacing: 10) {
                // Renk kapatılınca diş bölgesinin gerçek ağı görünür: ağız içi taramayla
                // hizalama buna bağlı, renkli görüntü kusuru gizler.
                HStack(spacing: 0) {
                    qualityButton(title: text.colorOn, selected: previewColor) { previewColor = true }
                    qualityButton(title: text.colorOff, selected: !previewColor) { previewColor = false }
                }
                .background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(Color.white.opacity(0.15), lineWidth: 1))
                .padding(.top, 14)
                Text(text.previewHint)
                    .font(scanFont(12)).foregroundColor(.white.opacity(0.6))
                    .multilineTextAlignment(.center).padding(.horizontal, 32)
                Spacer()
                HStack(spacing: 12) {
                    Button(action: restart) {
                        Text(text.rescan).font(scanFont(16, .semibold)).foregroundColor(.white)
                            .frame(width: 150, height: 52).background(.ultraThinMaterial, in: Capsule())
                    }
                    Button(action: { onFinish(.success(dirs.outputDir)) }) {
                        Text(text.save).font(scanFont(16, .semibold)).foregroundColor(onAccent)
                            .frame(width: 150, height: 52).background(accent, in: Capsule())
                    }
                }
                .padding(.bottom, 32)
            }
        }
    }

    // Hata ekranda kalır: operatör nedenini okur, aynı yerden tekrar dener ya da kapatır.
    private func failedView(message: String) -> some View {
        VStack(spacing: 16) {
            Text(text.failedTitle).font(scanFont(18, .semibold)).foregroundColor(.white)
            Text(message).font(scanFont(13)).foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center).padding(.horizontal, 32)
            Button(action: restart) {
                Text(text.retry).font(scanFont(16, .semibold)).foregroundColor(onAccent)
                    .frame(width: 200, height: 50).background(accent, in: Capsule())
            }
            .padding(.top, 6)
            Button(action: close) {
                Text(text.close).font(scanFont(16, .semibold)).foregroundColor(.white)
                    .frame(width: 200, height: 50).background(.ultraThinMaterial, in: Capsule())
            }
        }
    }

    private var permissionView: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera").font(scanFont(34, .light)).foregroundColor(.white.opacity(0.8))
            Text(text.permissionTitle).font(scanFont(18, .semibold)).foregroundColor(.white)
            Text(text.permissionBody).font(scanFont(13)).foregroundColor(.white.opacity(0.7))
                .multilineTextAlignment(.center).padding(.horizontal, 32)
            Button(action: {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            }) {
                Text(text.openSettings).font(scanFont(16, .semibold)).foregroundColor(onAccent)
                    .frame(width: 200, height: 50).background(accent, in: Capsule())
            }
            .padding(.top, 6)
            Button(action: close) {
                Text(text.close).font(scanFont(16, .semibold)).foregroundColor(.white)
                    .frame(width: 200, height: 50).background(.ultraThinMaterial, in: Capsule())
            }
        }
    }

    private func qualityButton(title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(scanFont(13, .semibold))
                .foregroundColor(selected ? onAccent : .white)
                .padding(.horizontal, 18).padding(.vertical, 10)
                .background(selected ? AnyShapeStyle(accent) : AnyShapeStyle(Color.clear))
                .clipShape(Capsule())
        }
    }

    static func firstFile(in dir: URL, ext: String) -> URL? {
        let items = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return items.first { $0.pathExtension.lowercased() == ext.lowercased() }
    }

    // MARK: Akış

    /// Kamera iznine göre çekimi başlatır ya da izin ekranını gösterir.
    private func beginCapture() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            stage = introSeen ? .capturing : .intro
        case .notDetermined:
            stage = .preparing
            AVCaptureDevice.requestAccess(for: .video) { ok in
                DispatchQueue.main.async { stage = ok ? (introSeen ? .capturing : .intro) : .permissionDenied }
            }
        default:
            stage = .permissionDenied
        }
    }

    /// Ekranı kapatmadan baştan başlar: süren işi durdurur, eski kareleri siler,
    /// temiz bir klasörle kamerayı yeniden kurar.
    private func restart() {
        runID += 1
        photoSession?.cancel()
        photoSession = nil
        let oldBase = dirs.images.deletingLastPathComponent()
        dirs = ObjectCaptureDirs.make()
        try? FileManager.default.removeItem(at: oldBase)
        model.reset()
        previewColor = true
        captureID = UUID()
        beginCapture()
    }

    private func close() {
        runID += 1
        photoSession?.cancel()
        photoSession = nil
        onFinish(nil)
    }

    private func finish() {
        guard model.enoughForFinish, stage == .capturing else { return }
        runID += 1
        let run = runID
        stage = .reconstructing(0)
        let imagesDir = dirs.images, outputDir = dirs.outputDir, outputUSDZ = dirs.outputUSDZ
        let checkpoint = dirs.checkpoint
        var info: [String: Any] = ["mode": "rearGuided", "shots": model.photoCount, "hiRes": hiRes]
        Task { @MainActor in
            let alive = { run == runID }
            func makeSession() throws -> PhotogrammetrySession {
                var config = PhotogrammetrySession.Configuration(checkpointDirectory: checkpoint)
                // Cilt gibi pürüzsüz/az dokulu yüzeyler için yüksek hassasiyet kritik.
                config.featureSensitivity = .high
                // Rehberli süpürme kareleri sıralı çekildi → hem hız hem kalite artar.
                config.sampleOrdering = .sequential
                let session = try PhotogrammetrySession(input: imagesDir, configuration: config)
                photoSession = session
                return session
            }
            func modelExists() -> Bool { Self.firstFile(in: outputDir, ext: "obj") != nil }
            func requests(_ g: PhotogrammetrySession.Request.Geometry?) -> [PhotogrammetrySession.Request] {
                [.modelFile(url: outputDir, detail: .reduced, geometry: g),
                 .modelFile(url: outputUSDZ, detail: .reduced, geometry: g)]
            }
            do {
                var session = try makeSession()

                // 1) Yalnız kamera konumları. Kameraların baktığı ortak nokta = hastanın başı.
                let first = await ScanRecon.run(session, [.poses], alive: alive) { _, f in
                    stage = .reconstructing(f * 0.15)
                }
                guard alive() else { return }
                info["poses"] = first.poses?.posesBySample.count ?? 0
                var geometry: PhotogrammetrySession.Request.Geometry?
                if let focus = ScanRecon.focus(first.poses) {
                    // Küpün yarı kenarı = kamera uzaklığının %62'si: 45 cm'den çekimde ~28 cm →
                    // baş ve boyun girer, masa ve arka plan dışarıda kalır.
                    geometry = ScanRecon.box(center: focus.center, half: focus.meanDistance * 0.5)
                    info["focusDistance"] = Double(focus.meanDistance)
                }
                info["boxed"] = geometry != nil

                // 2) Model, yalnız o kutu için. Aynı oturum ikinci isteği kabul etmezse yeni
                //    oturumla (aynı ara kayıtlarla) denenir; kutu sonuç vermezse kutusuz kurulur.
                var attempt = "same-session"
                let onModel: (ScanRecon.Kind, Double) -> Void = { kind, f in
                    if kind == .model { stage = .reconstructing(0.15 + f * 0.85) }
                }
                _ = await ScanRecon.run(session, requests(geometry), alive: alive, progress: onModel)
                guard alive() else { return }
                if !modelExists() {
                    attempt = "new-session"
                    session = try makeSession()
                    _ = await ScanRecon.run(session, requests(geometry), alive: alive, progress: onModel)
                    guard alive() else { return }
                }
                if !modelExists(), geometry != nil {
                    attempt = "new-session-no-box"
                    info["boxed"] = false
                    session = try makeSession()
                    _ = await ScanRecon.run(session, requests(nil), alive: alive, progress: onModel)
                    guard alive() else { return }
                }
                photoSession = nil
                info["attempt"] = attempt

                guard let objURL = Self.firstFile(in: outputDir, ext: "obj") else {
                    stage = .failed(text.noModel)
                    return
                }
                // Boyun altından kes (yalnız omuz varsa çalışır) → OBJ'yi yerinde güncelle,
                // USDZ'i kesilmiş OBJ'den yeniden üret (önizleme + indirme aynı olsun)
                info["neckCrop"] = OBJCropper.cropBelowNeck(objURL: objURL)
                try? USDZExporter.export(objURL: objURL, to: outputUSDZ)
                info["model"] = ScanRecon.objStats(objURL)
                ScanRecon.writeInfo(info, to: outputDir)
                if FileManager.default.fileExists(atPath: outputUSDZ.path) {
                    stage = .preview(outputUSDZ)
                } else { onFinish(.success(outputDir)) }
            } catch {
                guard alive() else { return }
                photoSession = nil
                stage = .failed(text.noModel)
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

    /// "Yüksek" seçeneğinin üst sınırı. 48 MP × 48 kare, model oluşturulurken telefonun
    /// bellek sınırını aşıp uygulamayı kapatıyordu (12 MP × 90 kare sorunsuz). 24 MP × 48 kare
    /// toplam piksel olarak 12 MP × 90 kareyle aynı yükte kalır.
    static let highCapMP = 25.5
    private static func megapixels(_ d: CMVideoDimensions) -> Double { Double(d.width) * Double(d.height) / 1_000_000 }

    /// Cihazın arka kamerasında 12 MP'den büyük, sınırın altında bir foto boyutu varsa MP değeri.
    static let highMP: Int? = {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { return nil }
        let best = device.formats.flatMap { $0.supportedMaxPhotoDimensions }
            .map(megapixels).filter { $0 <= highCapMP }.max() ?? 0
        return best > 13 ? Int(best.rounded()) : nil
    }()
    private var captureIndexByID: [Int64: Int] = [:]
    private var tanHalfFOV: Double = 0.69    // yatay görüş açısının yarısının tanjantı (cihazdan okunur)
    private var lastDistance: Int?
    private var lastNotice: RearGuidedModel.Notice = .none
    private var fastUntil: TimeInterval = 0     // "daha yavaş" uyarısı titremesin diye kısa süre tutulur
    private var limitSent = false
    private let shotHaptic = UIImpactFeedbackGenerator(style: .light)
    private let zoneHaptic = UIImpactFeedbackGenerator(style: .medium)

    private func setNotice(_ n: RearGuidedModel.Notice) {
        guard n != lastNotice else { return }
        lastNotice = n
        DispatchQueue.main.async { self.model.notice = n }
    }

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
        let fov = Double(device.activeFormat.videoFieldOfView)
        if fov > 20, fov < 140 { tanHalfFOV = tan(fov * .pi / 360) }

        if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }
        photoOutput.maxPhotoQualityPrioritization = .quality
        if let best = device.activeFormat.supportedMaxPhotoDimensions
            .filter({ Self.megapixels($0) <= Self.highCapMP })
            .max(by: { Self.megapixels($0) < Self.megapixels($1) }) {
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
        guard frameTick % 3 == 0,   // ~10 Hz: rehber yüzü akıcı izlesin
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let ts = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))

        let req = VNDetectFaceRectanglesRequest()
        req.revision = VNDetectFaceRectanglesRequestRevision3
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .right, options: [:])
        try? handler.perform([req])

        guard let face = (req.results)?.first else {
            lastDistance = nil
            DispatchQueue.main.async {
                if self.model.faceVisible { self.model.faceVisible = false }
                if self.model.face != nil { self.model.face = nil }
                if self.model.distanceCM != nil { self.model.distanceCM = nil }
            }
            return
        }
        DispatchQueue.main.async { if !self.model.faceVisible { self.model.faceVisible = true } }

        // Mesafe: yüz kutusunun gerçek yüksekliği (~20 cm) ve kameranın görüş açısından hesaplanır.
        // Dik görüntünün yüksekliği sensörün uzun kenarıdır → yatay görüş açısı ona karşılık gelir.
        // Yaklaşık değerdir (±%10–15): yüz boyu kişiden kişiye değişir.
        let faceH = max(Double(face.boundingBox.height), 0.02)
        let cm = Int((0.20 / (2 * faceH * tanHalfFOV) * 100 / 5).rounded()) * 5
        if cm != lastDistance {
            lastDistance = cm
            DispatchQueue.main.async { self.model.distanceCM = cm }
        }
        let distance: RearGuidedModel.Notice = cm < RearGuidedModel.distanceRange.lowerBound ? .tooClose
            : (cm > RearGuidedModel.distanceRange.upperBound ? .tooFar : .none)
        if distance == .tooClose, lastNotice != .tooClose {
            // Fazla yaklaşınca ekrana bakmadan da fark edilsin
            DispatchQueue.main.async { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
        }
        setNotice(distance != .none ? distance : (ts < fastUntil ? .tooFast : .none))
        if photoIndex >= maxPhotos, !limitSent {
            limitSent = true
            DispatchQueue.main.async { self.model.limitReached = true }
        }

        let yaw = face.yaw?.doubleValue ?? 0
        let pitch = face.pitch?.doubleValue ?? 0
        // Rehber için yüzün ekrandaki yeri (Vision kökeni sol-alt → sol-üste çevrilir)
        let bb = face.boundingBox
        let track = RearGuidedModel.FaceTrack(
            rect: CGRect(x: bb.minX, y: 1 - bb.maxY, width: bb.width, height: bb.height),
            yaw: yaw, pitch: pitch,
            aspect: CGFloat(CVPixelBufferGetHeight(pixelBuffer)) / CGFloat(max(CVPixelBufferGetWidth(pixelBuffer), 1)))
        DispatchQueue.main.async { self.model.face = track }
        let cols = RearGuidedModel.zoneCols, rows = RearGuidedModel.zoneRows
        let maxYaw = RearGuidedModel.maxYaw, maxPitch = RearGuidedModel.maxPitch
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
            // Bulanık kare → operatör hızlı hareket ediyor
            fastUntil = ts + 1.2
            if distance == .none { setNotice(.tooFast) }
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
            // Her çekimde hafif, yeni bölgede belirgin titreşim → ekrana bakmadan ilerleme hissedilir
            (isNewZone ? self.zoneHaptic : self.shotHaptic).impactOccurred()
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

// MARK: - Yüz rehberi (kamera görüntüsünde, yüzün üstünde tel kafes)
//
// Rehber ekranın altında durunca operatör gözünü hastadan ayırıyor ve kamerayı kaydırıyordu.
// Bu yüzden rehber yüzün kendisine çizilir: başın yüzeyine oturan, düğümlü bir üçgen ağ
// (yüz taramalarındaki nokta-üçgen ağını anımsatır).
//   • Kafes 15 yamadan oluşur; her yama, o açıdan bakınca kameraya dönük olan yüzeydir.
//   • Operatör hastanın etrafında döndükçe kafes başla birlikte döner.
//   • Çekilen yama yeşile döner; sıradaki hedef yama beyaz nefes alır.
// Ortadaki yama her zaman o an çekilen açıdır: "beyaz yamayı yüzün ortasına getir".

/// Ağın tek yaması: baş elipsoidi üzerinde üçgenlenmiş bir düğüm kümesi, kameranın o anki
/// bakış açısına göre izdüşümü alınmış. Konum ve açı canlandırılabilir → kafes yüzü akıcı izler.
struct FaceMeshPatch: Shape {
    var cx: CGFloat, cy: CGFloat, rx: CGFloat, ry: CGFloat
    var yaw: CGFloat, pitch: CGFloat      // kameranın yüze göre açısı (radyan)
    let zoneYaw: CGFloat, zonePitch: CGFloat
    let spanYaw: CGFloat, spanPitch: CGFloat
    let gridI: Int, gridJ: Int            // yamanın ilk düğümünün ağdaki genel sırası
    static let cells = 2                  // yama başına hücre (her hücre iki üçgen)

    typealias Pair = AnimatablePair<CGFloat, CGFloat>
    var animatableData: AnimatablePair<Pair, AnimatablePair<Pair, Pair>> {
        get { .init(.init(cx, cy), .init(.init(rx, ry), .init(yaw, pitch))) }
        set {
            cx = newValue.first.first; cy = newValue.first.second
            rx = newValue.second.first.first; ry = newValue.second.first.second
            yaw = newValue.second.second.first; pitch = newValue.second.second.second
        }
    }

    /// Yüzey noktası (a = yatay açı, b = dikey açı) → ekran noktası; arkaya dönükse nil.
    private func point(_ a: CGFloat, _ b: CGFloat) -> CGPoint? {
        // Dikey açı görselde genişletilir: üç satır alından çeneye tüm başı sarsın (düz kesik kalmasın)
        let dy = yaw - a, dp = (pitch - b) * 1.35
        guard cos(dy) * cos(dp) > 0.12 else { return nil }
        return CGPoint(x: cx + rx * sin(dy) * cos(dp), y: cy + ry * sin(dp))
    }

    /// Ağ düğümünün düzgün ızgaradan sapması (hücre oranı). Düğümün ağdaki genel sırasına
    /// bağlıdır → komşu yamalar ortak kenarda aynı düğümü çizer, ağ tek parça görünür.
    private static func jitter(_ i: Int, _ j: Int) -> (CGFloat, CGFloat) {
        func h(_ n: Int) -> CGFloat {
            let x = sin(Double(n) * 12.9898) * 43758.5453
            return CGFloat(x - x.rounded(.down)) - 0.5
        }
        return (h(i * 31 + j * 17 + 3) * 0.5, h(i * 13 + j * 29 + 7) * 0.5)
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let n = Self.cells
        let stepA = spanYaw / CGFloat(n), stepB = spanPitch / CGFloat(n)
        let a0 = zoneYaw - spanYaw / 2, b0 = zonePitch - spanPitch / 2
        // Yamanın düğümleri (yüz taramasındaki nokta bulutu gibi hafif düzensiz)
        var v = [[CGPoint?]](repeating: [CGPoint?](repeating: nil, count: n + 1), count: n + 1)
        for i in 0...n {
            for j in 0...n {
                let (ja, jb) = Self.jitter(gridI + i, gridJ + j)
                v[i][j] = point(a0 + stepA * (CGFloat(i) + ja), b0 + stepB * (CGFloat(j) + jb))
            }
        }
        func edge(_ a: CGPoint?, _ b: CGPoint?) {
            guard let a, let b else { return }
            p.move(to: a); p.addLine(to: b)
        }
        // Her hücre iki üçgen: dört kenar + bir köşegen (yönü dönüşümlü → düzensiz üçgen ağı)
        for i in 0..<n {
            for j in 0..<n {
                edge(v[i][j], v[i + 1][j]); edge(v[i][j], v[i][j + 1])
                if i == n - 1 { edge(v[i + 1][j], v[i + 1][j + 1]) }
                if j == n - 1 { edge(v[i][j + 1], v[i + 1][j + 1]) }
                if (gridI + i + gridJ + j) % 2 == 0 { edge(v[i][j], v[i + 1][j + 1]) }
                else { edge(v[i + 1][j], v[i][j + 1]) }
            }
        }
        // Düğüm noktaları
        for row in v {
            for q in row {
                if let q { p.addEllipse(in: CGRect(x: q.x - 1.3, y: q.y - 1.3, width: 2.6, height: 2.6)) }
            }
        }
        return p
    }
}

@available(iOS 17.0, *)
struct FaceGuideOverlay: View {
    let face: RearGuidedModel.FaceTrack?
    let doneZones: Set<Int>
    let target: Int?

    @State private var pulse = false
    private let green = Color(red: 0.19, green: 0.82, blue: 0.35)   // sistem yeşili
    private let reduceMotion = UIAccessibility.isReduceMotionEnabled
    private let spanYaw = CGFloat(2 * RearGuidedModel.maxYaw / Double(RearGuidedModel.zoneCols - 1))
    private let spanPitch = CGFloat(2 * RearGuidedModel.maxPitch / Double(RearGuidedModel.zoneRows - 1))

    var body: some View {
        GeometryReader { geo in
            if let f = face {
                // Kamera görüntüsü ekranı doldurur (aspect fill) → dik görüntünün ekrandaki boyutu
                let ih = max(geo.size.height, geo.size.width / max(f.aspect, 0.01)), iw = ih * f.aspect
                let ox = (iw - geo.size.width) / 2, oy = (ih - geo.size.height) / 2
                let cx = f.rect.midX * iw - ox, cy = f.rect.midY * ih - oy
                let rx = f.rect.width * iw * 0.62, ry = f.rect.height * ih * 0.80

                ZStack {
                    ForEach(0..<RearGuidedModel.zoneCount, id: \.self) { z in
                        let done = doneZones.contains(z)
                        let isTarget = z == target && !done
                        FaceMeshPatch(cx: cx, cy: cy, rx: rx, ry: ry,
                                      yaw: CGFloat(f.yaw), pitch: CGFloat(f.pitch),
                                      zoneYaw: CGFloat(RearGuidedModel.zoneYaw(z)),
                                      zonePitch: CGFloat(RearGuidedModel.zonePitch(z)),
                                      spanYaw: spanYaw, spanPitch: spanPitch,
                                      // sütun/satır açıyla ters sıralı → ortak kenarlar aynı düğüme denk gelsin
                                      gridI: (RearGuidedModel.zoneCols - 1 - z % RearGuidedModel.zoneCols) * FaceMeshPatch.cells,
                                      gridJ: (RearGuidedModel.zoneRows - 1 - z / RearGuidedModel.zoneCols) * FaceMeshPatch.cells)
                            .stroke(done ? green : Color.white,
                                    style: StrokeStyle(lineWidth: done ? 1.6 : (isTarget ? 1.6 : 1), lineCap: .round, lineJoin: .round))
                            .opacity(done ? 0.95 : (isTarget ? (pulse ? 1 : 0.45) : 0.32))
                            .zIndex(done ? 2 : (isTarget ? 1 : 0))     // yeşil teller ortak kenarda üstte kalır
                            .animation(.spring(response: 0.35, dampingFraction: 1), value: done)
                    }
                }
                .shadow(color: .black.opacity(0.4), radius: 1.5)   // açık ten ve açık zeminde de seçilsin
                .animation(.spring(response: 0.22, dampingFraction: 1), value: f)   // yüzü akıcı, kesintisiz izler
                .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 1), value: face == nil)
        .onAppear {
            // "Hareketi azalt" açıksa hedef nefes almaz, sabit kalır
            if reduceMotion { pulse = true }
            else { withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true } }
        }
    }
}

// MARK: - Kendi 3D önizlememiz (SceneKit, orbit + grid zemin) — AR QuickLook yerine

@available(iOS 17.0, *)
struct ModelGridPreview: UIViewRepresentable {
    let url: URL   // USDZ (texture gömülü)
    var showColor: Bool = true

    final class Coord {
        var originals: [(SCNGeometry, [SCNMaterial])] = []   // geometri + özgün (dokulu) malzemeleri
        var ambient: SCNLight?
        var key: SCNNode?
        var color = true
        /// Ön kamera önizlemesindeki "Yüzey" malzemesiyle birebir aynı: dokusuz, mat açık gri.
        lazy var surface: SCNMaterial = {
            let m = SCNMaterial()
            m.lightingModel = .physicallyBased
            m.diffuse.contents = UIColor(white: 0.82, alpha: 1)
            m.roughness.contents = 0.6
            m.metalness.contents = 0.0
            m.isDoubleSided = true
            return m
        }()
    }
    func makeCoordinator() -> Coord { Coord() }

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

        // USDZ doğrudan açılır. OBJ (USDZ üretilemediyse) ModelIO ile, dokusu yüklenerek açılır;
        // SCNScene(url:) OBJ'yi eksik/boş okuyabiliyor (önizlemede ince bir dilim görünüyordu).
        let scene: SCNScene
        if url.pathExtension.lowercased() == "obj" {
            let asset = MDLAsset(url: url)
            asset.loadTextures()
            scene = SCNScene(mdlAsset: asset)
        } else {
            scene = (try? SCNScene(url: url, options: nil)) ?? SCNScene()
        }
        v.scene = scene

        // Modeli tek bir "content" düğümüne sar
        let content = SCNNode()
        for child in scene.rootNode.childNodes { child.removeFromParentNode(); content.addChildNode(child) }
        scene.rootNode.addChildNode(content)

        // Ölç + NORMALİZE et (sabit ~2 birim) → kamera dolly aralığı makul olur,
        // böylece zoom-out da çalışır (eskiden model çok küçüktü, geri gidemiyordu).
        // Renksiz görünüm için geometrileri ve özgün malzemelerini sakla
        var seen = Set<ObjectIdentifier>()
        content.enumerateHierarchy { node, _ in
            if let g = node.geometry, seen.insert(ObjectIdentifier(g)).inserted {
                context.coordinator.originals.append((g, g.materials))
            }
        }

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
        context.coordinator.ambient = amb.light
        context.coordinator.key = dir

        // Kamera — sabit mesafe (model normalize, ~2 birim)
        let cam = SCNNode(); cam.camera = SCNCamera()
        cam.camera?.zNear = 0.01; cam.camera?.zFar = 1000
        cam.position = SCNVector3(0, 0, 4.5)
        cam.look(at: SCNVector3(0, 0, 0))
        scene.rootNode.addChildNode(cam)
        v.pointOfView = cam

        return v
    }

    func updateUIView(_ uiView: SCNView, context: Context) {
        let c = context.coordinator
        guard c.color != showColor else { return }
        c.color = showColor
        SCNTransaction.begin()
        SCNTransaction.animationDuration = 0.2
        // Renksiz: dokulu malzemenin tamamı (renk + normal + AO haritaları) çıkar, yerine ön kamera
        // önizlemesindeki düz yüzey malzemesi gelir → yalnız ağın gerçek şekli görünür.
        for (g, original) in c.originals {
            g.materials = showColor ? original : Array(repeating: c.surface, count: max(original.count, 1))
        }
        // Işık da ön kameradaki gibi: renklide düz (doku rengi için), renksizde yandan (kabartı için)
        c.ambient?.intensity = showColor ? 950 : 350
        c.key?.light?.intensity = showColor ? 550 : 900
        c.key?.eulerAngles = showColor ? SCNVector3(-Float.pi / 3, Float.pi / 5, 0) : SCNVector3(-0.35, 0.35, 0)
        SCNTransaction.commit()
    }

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
