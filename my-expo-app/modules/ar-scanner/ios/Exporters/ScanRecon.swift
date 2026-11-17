import Foundation
import RealityKit
import simd

// Model kurmanın ortak parçaları: isteği çalıştırma + "yalnız kafanın çevresini kur" kutusu.
//
// NEDEN: Model kurucu neyin "nesne" olduğuna kendi karar verir. Arka plan kadraja girince
// bütün sahneyi (masa, duvar) modele katıyor; üçgen bütçesi odaya yayılıyor, kafa küçük ve
// kaba kalıyordu (2026-11-16: 2,5 m'lik oda modeli). Çözüm iki aşama:
//   1) yalnız kamera konumları çözülür,
//   2) kameraların baktığı ortak nokta (= kafa) bulunur, model yalnız o noktanın çevresindeki
//      kutu için istenir → bütün ayrıntı kafaya harcanır, çevre hiç kurulmaz.

/// Kamera konumlarından bulunan odak: bakılan nokta ve kameraların ona ortalama uzaklığı
/// (model kurucunun kendi birimi ve eksenlerinde).
struct ScanFocus {
    let center: SIMD3<Float>
    let meanDistance: Float

    /// Kameraların bakış doğrularına en yakın nokta (en küçük kareler).
    /// Doğru kullanıldığı için bakış ekseninin yönü (+Z / −Z) sonucu değiştirmez.
    static func from(positions: [SIMD3<Float>], forwards: [SIMD3<Float>]) -> ScanFocus? {
        let n = min(positions.count, forwards.count)
        guard n >= 8 else { return nil }
        var A = simd_double3x3(0), b = SIMD3<Double>.zero
        for i in 0..<n {
            let d = simd_normalize(SIMD3<Double>(forwards[i])), p = SIMD3<Double>(positions[i])
            // M = I − d dᵀ  (doğruya dik bileşeni alır)
            let M = matrix_identity_double3x3 - simd_double3x3(columns: (d * d.x, d * d.y, d * d.z))
            A += M; b += M * p
        }
        guard abs(A.determinant) > 1e-9 else { return nil }
        let c = SIMD3<Float>(A.inverse * b)
        let dist = positions.prefix(n).map { simd_distance($0, c) }.reduce(0, +) / Float(n)
        guard dist.isFinite, dist > 1e-4 else { return nil }
        return ScanFocus(center: c, meanDistance: dist)
    }
}

#if os(iOS)
@available(iOS 17.0, *)
enum ScanRecon {
    enum Outcome { case done, failed(Error?), streamEnded }
    enum Kind { case poses, model }

    /// Bir istek grubunu çalıştırır ve bitene kadar bekler. Pozlar gelirse toplanır.
    /// `alive` false dönerse (iptal / baştan başlama) sessizce bırakır.
    @MainActor
    static func run(_ session: PhotogrammetrySession, _ requests: [PhotogrammetrySession.Request],
                    alive: () -> Bool, progress: (Kind, Double) -> Void)
        async -> (outcome: Outcome, poses: PhotogrammetrySession.Poses?) {
        var poses: PhotogrammetrySession.Poses?
        do {
            try session.process(requests: requests)
            for try await output in session.outputs {
                guard alive() else { return (.failed(nil), poses) }
                switch output {
                case .requestProgress(let req, fractionComplete: let f):
                    if case .poses = req { progress(.poses, f) } else { progress(.model, f) }
                case .requestComplete(_, .poses(let p)):
                    poses = p
                case .requestError(let req, let err):
                    if case .poses = req { continue }       // pozsuz da model kurulabilir
                    return (.failed(err), poses)
                case .processingComplete:
                    return (.done, poses)
                case .processingCancelled:
                    return (.failed(nil), poses)
                default: break
                }
            }
            return (.streamEnded, poses)
        } catch {
            return (.failed(error), poses)
        }
    }

    /// Kamera pozlarından odak (bakılan nokta).
    static func focus(_ poses: PhotogrammetrySession.Poses?) -> ScanFocus? {
        guard let all = poses?.posesBySample.values, all.count >= 8 else { return nil }
        return ScanFocus.from(positions: all.map { $0.translation },
                              forwards: all.map { $0.rotation.act(SIMD3<Float>(0, 0, -1)) })
    }

    /// `center` çevresinde, kenarı 2·half olan küp için model isteği geometrisi.
    static func box(center: SIMD3<Float>, half: Float) -> PhotogrammetrySession.Request.Geometry {
        let h = SIMD3<Float>(repeating: half)
        return .init(bounds: BoundingBox(min: center - h, max: center + h), transform: .identity)
    }

    /// Verilen köşeleri saran eksen-hizalı kutu.
    static func box(enclosing pts: [SIMD3<Float>]) -> PhotogrammetrySession.Request.Geometry? {
        guard var lo = pts.first else { return nil }
        var hi = lo
        for p in pts { lo = simd_min(lo, p); hi = simd_max(hi, p) }
        return .init(bounds: BoundingBox(min: lo, max: hi), transform: .identity)
    }

    /// OBJ'nin köşe/yüz sayısı ve sınır kutusu (tanı kaydı için).
    static func objStats(_ url: URL?) -> [String: Any] {
        guard let url, let text = try? String(contentsOf: url, encoding: .utf8) else { return [:] }
        var lo = SIMD3<Float>(repeating: .greatestFiniteMagnitude), hi = -lo
        var v = 0, f = 0
        text.enumerateLines { line, _ in
            if line.hasPrefix("v ") {
                let p = line.dropFirst(2).split(separator: " ")
                if p.count >= 3, let x = Float(p[0]), let y = Float(p[1]), let z = Float(p[2]) {
                    let q = SIMD3<Float>(x, y, z); lo = simd_min(lo, q); hi = simd_max(hi, q); v += 1
                }
            } else if line.hasPrefix("f ") { f += 1 }
        }
        guard v > 0 else { return ["vertices": 0, "faces": f] }
        let size = hi - lo
        return ["vertices": v, "faces": f, "size": [size.x, size.y, size.z].map { Double($0) }]
    }

    /// Tanı kaydı: yüklenen dosyaların yanına yazılır (uygulamada görünmez). Cihaz günlüğüne
    /// erişim olmadığı için bir taramanın nasıl kurulduğunu sonradan anlamanın tek yolu.
    static func writeInfo(_ info: [String: Any], to dir: URL) {
        // Sonsuz/NaN sayı ya da JSON'a girmeyen tür kaydı tümden düşürmesin → metne çevrilir.
        func clean(_ x: Any) -> Any {
            switch x {
            case let d as [String: Any]: return d.mapValues(clean)
            case let a as [Any]: return a.map(clean)
            case let n as Double: return n.isFinite ? n : "\(n)"
            case let n as Float: return n.isFinite ? Double(n) : "\(n)"
            case is Int, is Bool, is String: return x
            default: return "\(x)"
            }
        }
        let safe = clean(info)
        let url = dir.appendingPathComponent("scan_info.json")
        if JSONSerialization.isValidJSONObject(safe),
           let data = try? JSONSerialization.data(withJSONObject: safe, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: url)
        } else {
            try? "\(info)".write(to: url, atomically: true, encoding: .utf8)
        }
    }
}
#endif
