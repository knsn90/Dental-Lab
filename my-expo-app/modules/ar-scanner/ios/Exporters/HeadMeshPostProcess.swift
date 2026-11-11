import Foundation
import simd

// Tam kafa taraması: fotogrametri çıktısını KAFA ÇERÇEVESİNE taşır.
//
// Fotogrametri modeli kendi keyfi çerçevesinde (ölçek/yön belirsiz) üretir.
// `.poses` isteği her karenin modeldeki kamera merkezini verir; aynı karelerin
// ARKit dünyasındaki (metrik) merkezleri bizde. İki küme arasındaki benzerlik
// dönüşümü (ölçek + dönme + öteleme, Horn) modeli ARKit dünyasına oturtur.
// Oradan kafa çerçevesine: köken = kafa merkezi, +Y = yukarı, +Z = yüzün önü.
//
// Sonra: kafa küresi + boyun silindiri dışındaki yüzler atılır (omuz, sandalye,
// arka plan kırıntısı), kullanılmayan köşeler ayıklanır, birim mm olur.

struct Similarity {
    var scale: Float
    var rotation: simd_float3x3
    var translation: SIMD3<Float>

    @inline(__always) func apply(_ p: SIMD3<Float>) -> SIMD3<Float> { scale * (rotation * p) + translation }

    static let identity = Similarity(scale: 1, rotation: matrix_identity_float3x3, translation: .zero)
}

enum HeadMeshPostProcess {

    // MARK: Benzerlik dönüşümü (Horn 1987, birim kuaterniyon)

    /// `src` → `dst` en küçük kareler benzerlik dönüşümü. En az 3 eş-doğrusal olmayan nokta.
    static func fitSimilarity(src: [SIMD3<Float>], dst: [SIMD3<Float>]) -> Similarity? {
        let n = min(src.count, dst.count)
        guard n >= 3 else { return nil }
        var cs = SIMD3<Double>.zero, cd = SIMD3<Double>.zero
        for i in 0..<n { cs += SIMD3<Double>(src[i]); cd += SIMD3<Double>(dst[i]) }
        cs /= Double(n); cd /= Double(n)

        var S = simd_double3x3()          // Σ a bᵀ  (S[col][row] düzeni)
        var ss = 0.0, sd = 0.0
        for i in 0..<n {
            let a = SIMD3<Double>(src[i]) - cs, b = SIMD3<Double>(dst[i]) - cd
            ss += simd_length_squared(a); sd += simd_length_squared(b)
            S.columns.0 += a * b.x; S.columns.1 += a * b.y; S.columns.2 += a * b.z
        }
        guard ss > 1e-12, sd > 1e-12 else { return nil }
        // Sxy = Σ a.x * b.y  → S.columns.1.x
        func s(_ r: Int, _ c: Int) -> Double { S[c][r] }   // s(r,c) = Σ a_r b_c
        let Sxx = s(0, 0), Sxy = s(0, 1), Sxz = s(0, 2)
        let Syx = s(1, 0), Syy = s(1, 1), Syz = s(1, 2)
        let Szx = s(2, 0), Szy = s(2, 1), Szz = s(2, 2)
        let N: [[Double]] = [
            [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
            [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
            [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
            [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
        ]
        guard let q = largestEigenvector4(N) else { return nil }
        let quat = simd_quatd(ix: q[1], iy: q[2], iz: q[3], r: q[0]).normalized
        let R = simd_double3x3(quat)
        let scale = (sd / ss).squareRoot()       // simetrik ölçek (Horn)
        let t = cd - scale * (R * cs)
        func f(_ m: simd_double3x3) -> simd_float3x3 {
            simd_float3x3(SIMD3<Float>(m.columns.0), SIMD3<Float>(m.columns.1), SIMD3<Float>(m.columns.2))
        }
        return Similarity(scale: Float(scale), rotation: f(R), translation: SIMD3<Float>(t))
    }

    /// Simetrik 4×4 için en büyük öz-değerin öz-vektörü (Jacobi dönmeleri).
    static func largestEigenvector4(_ m: [[Double]]) -> [Double]? {
        var a = m
        var v: [[Double]] = (0..<4).map { i in (0..<4).map { $0 == i ? 1.0 : 0.0 } }
        for _ in 0..<64 {
            var off = 0.0
            for p in 0..<4 { for q in (p + 1)..<4 { off += a[p][q] * a[p][q] } }
            if off < 1e-20 { break }
            for p in 0..<4 {
                for q in (p + 1)..<4 where abs(a[p][q]) > 1e-30 {
                    let theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
                    let t = (theta >= 0 ? 1.0 : -1.0) / (abs(theta) + (theta * theta + 1).squareRoot())
                    let c = 1 / (t * t + 1).squareRoot(), s = t * c
                    for k in 0..<4 {
                        let akp = a[k][p], akq = a[k][q]
                        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq
                    }
                    for k in 0..<4 {
                        let apk = a[p][k], aqk = a[q][k]
                        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk
                    }
                    for k in 0..<4 {
                        let vkp = v[k][p], vkq = v[k][q]
                        v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq
                    }
                }
            }
        }
        var best = 0
        for i in 1..<4 where a[i][i] > a[best][best] { best = i }
        let vec = (0..<4).map { v[$0][best] }
        guard vec.allSatisfy({ $0.isFinite }) else { return nil }
        return vec
    }

    /// Aykırı pozları ayıklayarak sağlam uyum: ilk uyum → kalıntı > max(3×medyan, 2 cm) olanlar
    /// atılır → yeniden uyum. Dönüş: dönüşüm + kullanılan kare sayısı + medyan kalıntı (m).
    static func robustFit(model: [SIMD3<Float>], world: [SIMD3<Float>])
        -> (sim: Similarity, inliers: Int, medianError: Float)? {
        guard var sim = fitSimilarity(src: model, dst: world) else { return nil }
        var keep = Array(0..<min(model.count, world.count))
        for _ in 0..<2 {
            let errs = keep.map { simd_distance(sim.apply(model[$0]), world[$0]) }
            let med = errs.sorted()[errs.count / 2]
            let thr = max(3 * med, 0.02)
            let next = zip(keep, errs).filter { $0.1 <= thr }.map { $0.0 }
            guard next.count >= 6, next.count < keep.count else { break }
            keep = next
            guard let s2 = fitSimilarity(src: keep.map { model[$0] }, dst: keep.map { world[$0] }) else { break }
            sim = s2
        }
        let errs = keep.map { simd_distance(sim.apply(model[$0]), world[$0]) }.sorted()
        return (sim, keep.count, errs[errs.count / 2])
    }

    // MARK: Kafa çerçevesi

    /// Dünya → kafa çerçevesi (metre). Köken kafa merkezi, +Y yukarı, +Z yüzün önü.
    static func worldToHead(anchor: HeadAnchor) -> Similarity {
        let up = SIMD3<Float>(0, 1, 0)
        let z = simd_normalize(SIMD3<Float>(anchor.front.x, 0, anchor.front.z))
        let x = simd_normalize(simd_cross(up, z))
        // Satırları x, up, z olan matris (dünya → kafa)
        let R = simd_float3x3(rows: [x, up, z])
        return Similarity(scale: 1, rotation: R, translation: -(R * anchor.center))
    }

    static func compose(_ a: Similarity, after b: Similarity) -> Similarity {
        // a(b(p)) = sa Ra (sb Rb p + tb) + ta
        Similarity(scale: a.scale * b.scale, rotation: a.rotation * b.rotation,
                   translation: a.scale * (a.rotation * b.translation) + a.translation)
    }

    /// Kafa çerçevesinde (m) tutulacak hacim: kafa küresi ∪ boyun silindiri.
    static let keepHeadRadius: Float = 0.165
    static let keepNeckRadius: Float = 0.095
    static let keepNeckBelow: Float = 0.23

    @inline(__always) static func keep(_ p: SIMD3<Float>) -> Bool {
        if simd_length(p) < keepHeadRadius { return true }
        return p.y < 0 && p.y > -keepNeckBelow && simd_length(SIMD2<Float>(p.x, p.z)) < keepNeckRadius
    }

    // MARK: OBJ

    /// Çapa (burun ucu + sabit derinlik) birkaç cm sapabilir. Yatay merkez: kulak
    /// hizasındaki dilimin (|y| < 4 cm) ortalaması; dikey: kafa tepesinin 11.5 cm altı.
    /// Toplam düzeltme en çok 6 cm.
    static let crownToCenter: Float = 0.115

    static func refineCenter(_ pts: [SIMD3<Float>]) -> SIMD3<Float> {
        var c = SIMD3<Float>.zero
        for _ in 0..<5 {
            var sx = 0.0, sz = 0.0, n = 0
            for p in pts where abs(p.y - c.y) < 0.04 && simd_length(SIMD2<Float>(p.x - c.x, p.z - c.z)) < 0.14 {
                sx += Double(p.x); sz += Double(p.z); n += 1
            }
            guard n > 100 else { break }
            var top = -Float.greatestFiniteMagnitude
            for p in pts where simd_length(SIMD2<Float>(p.x - c.x, p.z - c.z)) < 0.06
                && p.y > c.y && p.y < c.y + 0.22 { top = max(top, p.y) }
            let y = top > c.y + 0.06 ? top - crownToCenter : c.y
            var next = SIMD3<Float>(Float(sx / Double(n)), y, Float(sz / Double(n)))
            if simd_length(next) > 0.06 { next = simd_normalize(next) * 0.06 }
            if simd_distance(next, c) < 0.0005 { c = next; break }
            c = next
        }
        return c
    }

    struct Result {
        let centerShift: SIMD3<Float>  // m (kafa çerçevesinde uygulanan düzeltme)
        let faceCountIn: Int
        let faceCountOut: Int
        let vertexCountOut: Int
        let boundsMin: SIMD3<Float>   // mm
        let boundsMax: SIMD3<Float>   // mm
    }

    /// OBJ'yi yerinde dönüştürür: `toHead` (model → kafa, metre) uygular, hacim dışını
    /// keser, köşeleri sıkıştırır, `unitScale` ile çarpar (1000 = mm). vt/mtllib/usemtl korunur.
    @discardableResult
    static func transformOBJ(at url: URL, toHead: Similarity, crop: Bool = true,
                             unitScale: Float = 1000) throws -> Result {
        let text = try String(contentsOf: url, encoding: .utf8)
        var v: [SIMD3<Float>] = []; v.reserveCapacity(60000)
        var vExtra: [Substring] = []     // köşe rengi vb. (x y z'den sonrası)
        var vn: [SIMD3<Float>] = []
        var header: [String] = []        // mtllib vb.
        var vt: [String] = []
        // Yüz: (usemtl grubu indeksi, [(v, vt, vn)])
        var groups: [String] = []
        var faces: [(g: Int, idx: [(Int, Int, Int)])] = []; faces.reserveCapacity(120000)
        var curGroup = -1

        text.enumerateLines { line, _ in
            if line.hasPrefix("v ") {
                let p = line.dropFirst(2).split(whereSeparator: { $0 == " " || $0 == "\t" })
                if p.count >= 3, let x = Float(p[0]), let y = Float(p[1]), let z = Float(p[2]) {
                    v.append(SIMD3<Float>(x, y, z))
                    vExtra.append(p.count > 3 ? Substring(p[3...].joined(separator: " ")) : "")
                }
            } else if line.hasPrefix("vt ") {
                vt.append(line)
            } else if line.hasPrefix("vn ") {
                let p = line.dropFirst(3).split(whereSeparator: { $0 == " " || $0 == "\t" })
                if p.count >= 3, let x = Float(p[0]), let y = Float(p[1]), let z = Float(p[2]) {
                    vn.append(SIMD3<Float>(x, y, z))
                }
            } else if line.hasPrefix("f ") {
                var idx: [(Int, Int, Int)] = []
                for tok in line.dropFirst(2).split(whereSeparator: { $0 == " " || $0 == "\t" }) {
                    let parts = tok.split(separator: "/", omittingEmptySubsequences: false)
                    func r(_ k: Int, _ n: Int) -> Int {
                        guard k < parts.count, let raw = Int(parts[k]) else { return -1 }
                        return raw > 0 ? raw - 1 : n + raw
                    }
                    idx.append((r(0, v.count), r(1, vt.count), r(2, vn.count)))
                }
                if idx.count >= 3 { faces.append((curGroup, idx)) }
            } else if line.hasPrefix("usemtl ") {
                groups.append(line); curGroup = groups.count - 1
            } else if line.hasPrefix("mtllib ") {
                header.append(line)
            }
        }

        var headPts = v.map { toHead.apply($0) }
        let shift = crop ? refineCenter(headPts) : .zero
        if shift != .zero { for i in headPts.indices { headPts[i] -= shift } }
        var keptFaces: [(g: Int, idx: [(Int, Int, Int)])] = []
        keptFaces.reserveCapacity(faces.count)
        for f in faces {
            guard f.idx.allSatisfy({ $0.0 >= 0 && $0.0 < v.count }) else { continue }
            if crop {
                var c = SIMD3<Float>.zero
                for t in f.idx { c += headPts[t.0] }
                if !keep(c / Float(f.idx.count)) { continue }
            }
            keptFaces.append(f)
        }
        // Çok agresif kestiyse (yanlış hizalama) kesmeden devam et
        if crop, keptFaces.count < faces.count / 10 {
            return try transformOBJ(at: url, toHead: toHead, crop: false, unitScale: unitScale)
        }

        var vMap = [Int](repeating: -1, count: v.count)
        var vnMap = [Int](repeating: -1, count: vn.count)
        var outV: [Int] = [], outVN: [Int] = []
        for f in keptFaces {
            for t in f.idx {
                if vMap[t.0] < 0 { vMap[t.0] = outV.count; outV.append(t.0) }
                if t.2 >= 0, t.2 < vn.count, vnMap[t.2] < 0 { vnMap[t.2] = outVN.count; outVN.append(t.2) }
            }
        }

        var lo = SIMD3<Float>(repeating: .greatestFiniteMagnitude), hi = -lo
        var out = "# Siman tam kafa taramasi — kafa cercevesi (+Y yukari, +Z yuz onu), birim "
        out += unitScale == 1000 ? "mm\n" : "m\n"
        out.reserveCapacity(outV.count * 80 + keptFaces.count * 40)
        for h in header { out += h; out += "\n" }
        for i in outV {
            let p = headPts[i] * unitScale
            lo = simd_min(lo, p); hi = simd_max(hi, p)
            out += "v \(fmt(p.x)) \(fmt(p.y)) \(fmt(p.z))"
            if !vExtra[i].isEmpty { out += " "; out += vExtra[i] }
            out += "\n"
        }
        for line in vt { out += line; out += "\n" }
        for i in outVN {
            let n = simd_normalize(toHead.rotation * vn[i])
            out += "vn \(fmt(n.x)) \(fmt(n.y)) \(fmt(n.z))\n"
        }
        var lastGroup = Int.min
        for f in keptFaces {
            if f.g != lastGroup, f.g >= 0 { out += groups[f.g]; out += "\n" }
            lastGroup = f.g
            out += "f"
            for t in f.idx {
                out += " \(vMap[t.0] + 1)"
                let hasT = t.1 >= 0 && t.1 < vt.count
                let hasN = t.2 >= 0 && t.2 < vn.count && vnMap[t.2] >= 0
                if hasT || hasN { out += "/" + (hasT ? "\(t.1 + 1)" : "") }
                if hasN { out += "/\(vnMap[t.2] + 1)" }
            }
            out += "\n"
        }
        try out.write(to: url, atomically: true, encoding: .utf8)
        return Result(centerShift: shift, faceCountIn: faces.count, faceCountOut: keptFaces.count, vertexCountOut: outV.count,
                      boundsMin: lo, boundsMax: hi)
    }

    private static func fmt(_ f: Float) -> String { String(format: "%.5f", f) }

    /// MTL'nin `map_Kd` dokusu (yoksa ilk png/jpg).
    static func diffuseTexture(objURL: URL) -> URL? {
        let dir = objURL.deletingLastPathComponent()
        if let obj = try? String(contentsOf: objURL, encoding: .utf8),
           let lib = obj.split(separator: "\n").first(where: { $0.hasPrefix("mtllib ") }) {
            let mtlURL = dir.appendingPathComponent(String(lib.dropFirst(7)).trimmingCharacters(in: .whitespaces))
            if let mtl = try? String(contentsOf: mtlURL, encoding: .utf8),
               let kd = mtl.split(separator: "\n").first(where: {
                   $0.trimmingCharacters(in: .whitespaces).hasPrefix("map_Kd ") }) {
                let name = kd.trimmingCharacters(in: .whitespaces).dropFirst(7)
                    .trimmingCharacters(in: .whitespaces)
                let u = dir.appendingPathComponent(name)
                if FileManager.default.fileExists(atPath: u.path) { return u }
            }
        }
        let items = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return items.first { ["png", "jpg", "jpeg"].contains($0.pathExtension.lowercased()) }
    }
}
