import Foundation
import simd

// Tam kafa (360°) taramasının ARKit'ten bağımsız hesapları — Mac'te test edilir.
//
// Uzay: ARKit dünya uzayı (metre, +y yukarı = yerçekiminin tersi).
// Kamera uzayı: ARKit kamera (+x sağ, +y yukarı, −z ileri) — ham sensör yönünde
// (capturedImage yatay; telefon dik tutulsa da görüntü 90° yatıktır).
// Görüntü pikseli: sol-üst köken, v aşağı.

/// Taramanın merkezi: hastanın kafa merkezi + başlangıçtaki "ön" yönü.
/// Hasta tarama boyunca SABİT durur; operatör etrafında döner.
struct HeadAnchor {
    let center: SIMD3<Float>
    /// Kafadan başlangıç kamerasına yatay birim yön (sektör 0 = yüzün önü)
    let front: SIMD3<Float>
}

/// Kamera iç parametreleri (piksel). Derinlik haritası için görüntüden ölçeklenir.
struct PinholeIntrinsics {
    let fx: Float, fy: Float, cx: Float, cy: Float

    func scaled(_ sx: Float, _ sy: Float) -> PinholeIntrinsics {
        PinholeIntrinsics(fx: fx * sx, fy: fy * sy, cx: cx * sx, cy: cy * sy)
    }

    /// Piksel + düzlemsel derinlik (m) → kamera uzayı nokta (ARKit ekseni).
    @inline(__always) func unproject(u: Float, v: Float, depth d: Float) -> SIMD3<Float> {
        SIMD3<Float>((u - cx) / fx * d, -(v - cy) / fy * d, -d)
    }

    /// Kamera uzayı nokta → piksel (önde değilse nil).
    func project(_ p: SIMD3<Float>) -> SIMD2<Float>? {
        guard p.z < -1e-4 else { return nil }
        let d = -p.z
        return SIMD2<Float>(p.x / d * fx + cx, -p.y / d * fy + cy)
    }
}

/// Düzlemsel derinlik haritası (Float32, metre; 0/NaN = geçersiz).
struct DepthMap {
    let width: Int
    let height: Int
    let values: [Float]

    @inline(__always) func at(_ x: Int, _ y: Int) -> Float {
        let d = values[y * width + x]
        return d.isFinite && d > 0.05 ? d : 0
    }
}

enum HeadScanGeometry {

    // MARK: Bölgeler

    /// Yatay sektör sayısı (30°'lik dilimler, 0 = yüzün önü)
    static let sectors = 12
    /// Yükseklik bantları: alt (çene altı / boyun), orta, üst (tepe)
    enum Band: Int, CaseIterable { case low = 0, mid = 1, high = 2 }

    static let lowBelow: Float = -12 * .pi / 180
    static let highAbove: Float = 22 * .pi / 180

    /// Bitirmek için gereken en az bölge (bant başına sektör) + en az kare.
    static let requiredMid = 11
    static let requiredHigh = 6
    static let requiredLow = 3
    static let requiredShots = 45

    /// Çekim mesafesi aralığı (kamera — kafa merkezi, m)
    static let distanceRange: ClosedRange<Float> = 0.25...1.1
    /// Kafa kadrajın ortasına bu açıdan yakın olmalı
    static let maxOffAxis: Float = 24 * .pi / 180

    struct Zone: Hashable {
        let sector: Int
        let band: Band
        var index: Int { band.rawValue * HeadScanGeometry.sectors + sector }
    }

    /// Kamera konumu → bölge + mesafe.
    static func zone(camera c: SIMD3<Float>, anchor a: HeadAnchor) -> (zone: Zone, distance: Float, elevation: Float) {
        let v = c - a.center
        let dist = max(simd_length(v), 1e-5)
        let elev = asin(min(max(v.y / dist, -1), 1))
        var h = SIMD3<Float>(v.x, 0, v.z)
        if simd_length(h) < 1e-5 { h = a.front }
        h = simd_normalize(h)
        let angle = atan2(simd_cross(a.front, h).y, simd_dot(a.front, h))   // (−π, π]
        let width = 2 * Float.pi / Float(sectors)
        var s = Int((angle / width).rounded()) % sectors
        if s < 0 { s += sectors }
        let band: Band = elev < lowBelow ? .low : (elev > highAbove ? .high : .mid)
        return (Zone(sector: s, band: band), dist, elev)
    }

    /// Kafa merkezi kameranın baktığı yöne yakın mı (kadraj içinde)?
    static func headInView(cameraToWorld T: simd_float4x4, anchor: HeadAnchor) -> Bool {
        let c = SIMD3<Float>(T.columns.3.x, T.columns.3.y, T.columns.3.z)
        let forward = -simd_normalize(SIMD3<Float>(T.columns.2.x, T.columns.2.y, T.columns.2.z))
        let toHead = anchor.center - c
        let len = simd_length(toHead)
        guard len > 1e-4 else { return false }
        return acos(min(max(simd_dot(forward, toHead / len), -1), 1)) < maxOffAxis
    }

    // MARK: Kafa merkezi tahmini

    /// Ekranın / görüntünün ORTASINDAKİ yüz noktası (operatör halkayı burna getirir)
    /// + kafa derinliği → kafa merkezi. Burun ucundan kafa merkezine ~9.5 cm.
    static let noseToCenter: Float = 0.095

    static func estimateAnchor(depth: DepthMap, intrinsics K: PinholeIntrinsics,
                               cameraToWorld T: simd_float4x4) -> HeadAnchor? {
        let cxp = depth.width / 2, cyp = depth.height / 2
        var samples: [Float] = []
        for y in max(0, cyp - 4)...min(depth.height - 1, cyp + 4) {
            for x in max(0, cxp - 4)...min(depth.width - 1, cxp + 4) {
                let d = depth.at(x, y)
                if d > 0 { samples.append(d) }
            }
        }
        guard samples.count >= 10 else { return nil }
        samples.sort()
        let d = samples[samples.count / 2]
        guard d > 0.15, d < 1.5 else { return nil }

        let pc = K.unproject(u: Float(cxp) + 0.5, v: Float(cyp) + 0.5, depth: d)
        let surface = xyz(T * SIMD4<Float>(pc, 1))
        let cam = SIMD3<Float>(T.columns.3.x, T.columns.3.y, T.columns.3.z)
        let ray = simd_normalize(surface - cam)
        let center = surface + ray * noseToCenter
        var front = cam - center
        front.y = 0
        guard simd_length(front) > 1e-4 else { return nil }
        return HeadAnchor(center: center, front: simd_normalize(front))
    }

    // MARK: Nesne maskesi

    /// Derinlikten kafa + boyun maskesi (derinlik çözünürlüğünde, 0/255).
    /// Kafa: merkezden `headRadius` küre; boyun: merkezin altında dikey silindir.
    /// Derinliği okunamayan piksel (saç LiDAR'a dönmeyebilir) KORUNUR (255).
    static let headRadius: Float = 0.17
    static let neckRadius: Float = 0.10
    static let neckBelow: Float = 0.34

    static func objectMask(depth: DepthMap, intrinsics K: PinholeIntrinsics,
                           cameraToWorld T: simd_float4x4, anchor: HeadAnchor) -> [UInt8] {
        var mask = [UInt8](repeating: 255, count: depth.width * depth.height)
        let c = anchor.center
        for y in 0..<depth.height {
            for x in 0..<depth.width {
                let d = depth.at(x, y)
                guard d > 0 else { continue }
                let p = xyz(T * SIMD4<Float>(K.unproject(u: Float(x) + 0.5, v: Float(y) + 0.5, depth: d), 1))
                let inHead = simd_distance(p, c) < headRadius
                let dy = p.y - c.y
                let horiz = simd_length(SIMD2<Float>(p.x - c.x, p.z - c.z))
                let inNeck = dy < 0 && dy > -neckBelow && horiz < neckRadius
                if !(inHead || inNeck) { mask[y * depth.width + x] = 0 }
            }
        }
        return mask
    }

    /// Maskeyi (255 = tut) `radius` piksel genişletir — derinlik ↔ görüntü küçük kaymalarına pay.
    static func dilate(_ m: [UInt8], width w: Int, height h: Int, radius r: Int) -> [UInt8] {
        guard r > 0 else { return m }
        var tmp = m, out = m
        for y in 0..<h {
            for x in 0..<w where m[y * w + x] == 0 {
                var hit = false
                for dx in max(0, x - r)...min(w - 1, x + r) where m[y * w + dx] != 0 { hit = true; break }
                if hit { tmp[y * w + x] = 255 }
            }
        }
        for y in 0..<h {
            for x in 0..<w where tmp[y * w + x] == 0 {
                var hit = false
                for dy in max(0, y - r)...min(h - 1, y + r) where tmp[dy * w + x] != 0 { hit = true; break }
                if hit { out[y * w + x] = 255 }
            }
        }
        return out
    }

    // MARK: Yerçekimi

    /// Kamera pozundan yerçekimi, CoreMotion CİHAZ ekseninde (g birimi):
    /// cihaz +x sağ, +y üst kenar, +z ekrandan dışarı (dik tutuş). ARKit kamera
    /// ekseni yatay-sağ tutuşa göredir: kam_x = −cihaz_y, kam_y = cihaz_x.
    static func deviceGravity(cameraToWorld T: simd_float4x4) -> SIMD3<Double> {
        let R = simd_float3x3(SIMD3<Float>(T.columns.0.x, T.columns.0.y, T.columns.0.z),
                              SIMD3<Float>(T.columns.1.x, T.columns.1.y, T.columns.1.z),
                              SIMD3<Float>(T.columns.2.x, T.columns.2.y, T.columns.2.z))
        let gCam = R.transpose * SIMD3<Float>(0, -1, 0)
        return SIMD3<Double>(Double(gCam.y), Double(-gCam.x), Double(gCam.z))
    }

    @inline(__always) static func xyz(_ v: SIMD4<Float>) -> SIMD3<Float> { SIMD3<Float>(v.x, v.y, v.z) }
}
