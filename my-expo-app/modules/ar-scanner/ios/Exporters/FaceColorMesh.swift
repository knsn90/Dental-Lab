import UIKit
import ARKit
import CoreImage
import simd

/// Köşe renkli yüz ağı — PLY çıktısının ve tarama sonrası önizlemenin TEK kaynağı.
/// Konumlar face-anchor yerel uzayında, METRE (PLY yazarken mm'ye çevrilir).
struct ColoredMesh {
    let positions: [SIMD3<Float>]
    let colors: [SIMD3<UInt8>]
    let triangles: [UInt32]

    var triangleCount: Int { triangles.count / 3 }
}

/// Renk kaynağı görüntü: sRGB RGBA8, gerekirse yüz çevresine kırpılmış.
/// `origin` = kırpmanın kaynak görüntüdeki sol-üst pikseli.
struct FacePixels {
    let data: [UInt8]
    let width: Int
    let height: Int
    let origin: SIMD2<Float>

    init?(cgImage cg: CGImage, origin: SIMD2<Float>) {
        guard cg.width > 1, cg.height > 1 else { return nil }
        let w = cg.width, h = cg.height
        var buf = [UInt8](repeating: 0, count: w * h * 4)
        let ok = buf.withUnsafeMutableBytes { raw -> Bool in
            guard let ctx = CGContext(data: raw.baseAddress, width: w, height: h,
                                      bitsPerComponent: 8, bytesPerRow: w * 4,
                                      space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            // Bitmap bağlamında ilk satır = görüntünün üstü
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { return nil }
        data = buf; width = w; height = h; self.origin = origin
    }

    /// CIImage → hafif keskinleştirme → kırpma → piksel.
    /// `crop` görüntü koordinatında (sol-üst köken); nil = tamamı.
    static func make(from image: CIImage, crop: CGRect?, context: CIContext) -> FacePixels? {
        let full = image.extent
        let bounds = CGRect(x: 0, y: 0, width: full.width, height: full.height)
        let rect = (crop?.intersection(bounds) ?? bounds).integral
        guard rect.width > 1, rect.height > 1 else { return nil }
        // Core Image sol-alt kökenli → dikey çevir
        let ciRect = CGRect(x: full.minX + rect.minX, y: full.minY + full.height - rect.maxY,
                            width: rect.width, height: rect.height)
        let sharpened = image.clampedToExtent()
            .applyingFilter("CIUnsharpMask", parameters: [kCIInputRadiusKey: 1.6, kCIInputIntensityKey: 0.45])
            .cropped(to: ciRect)
        guard let cg = context.createCGImage(sharpened, from: ciRect, format: .RGBA8,
                                             colorSpace: CGColorSpace(name: CGColorSpace.sRGB)) else { return nil }
        return FacePixels(cgImage: cg, origin: SIMD2<Float>(Float(rect.minX), Float(rect.minY)))
    }

    func contains(_ p: SIMD2<Float>) -> Bool {
        p.x >= 0 && p.y >= 0 && p.x <= Float(width - 1) && p.y <= Float(height - 1)
    }

    /// Çift doğrusal örnek (0…255 sRGB). p kırpma içi piksel.
    func sample(_ p: SIMD2<Float>) -> SIMD3<Float> {
        let x0 = Int(p.x), y0 = Int(p.y)
        let x1 = min(x0 + 1, width - 1), y1 = min(y0 + 1, height - 1)
        let tx = SIMD3<Float>(repeating: p.x - Float(x0))
        let ty = SIMD3<Float>(repeating: p.y - Float(y0))
        let top = simd_mix(px(x0, y0), px(x1, y0), tx)
        let bottom = simd_mix(px(x0, y1), px(x1, y1), tx)
        return simd_mix(top, bottom, ty)
    }

    private func px(_ x: Int, _ y: Int) -> SIMD3<Float> {
        let i = (y * width + x) * 4
        return SIMD3<Float>(Float(data[i]), Float(data[i + 1]), Float(data[i + 2]))
    }
}

/// Renk için kullanılan tek bir görüntü + onu çeken kamera.
/// İzdüşüm: camera.projectPoint(orientation, projectionSize) → × pixelScale → − pixels.origin
struct FaceColorView {
    let faceTransform: simd_float4x4
    let camera: ARCamera
    let orientation: UIInterfaceOrientation
    let projectionSize: CGSize
    let pixelScale: SIMD2<Float>
    let pixels: FacePixels
}

/// Bir poz: ekran görüntüsü (her zaman) + kameranın yüksek çözünürlüklü karesi (varsa).
struct FaceColorSample {
    let snapshotView: FaceColorView
    let highResView: FaceColorView?
}

// Çok açılı renk birleştirme.
//
// Geometri tek kareden (ön poz, göz delikleri kapatılmış) gelir. ARKit her karede
// AYNI topolojiyi yüze bağlı koordinatlarda verdiği için diğer pozlarla eşleştirme
// bedavadır: aynı yerel köşe, o karenin face transform'u ile izdüşürülür.
//
//   1. Ağ orta-nokta bölmeyle inceltilir (4 seviye ≈ 330k köşe, ~0.3 mm aralık).
//   2. Yüksek çözünürlüklü kare varsa ve ön pozda ekran görüntüsüyle tutarlıysa o
//      kullanılır (tutarsızsa ekran görüntüsüne dönülür → kalite asla düşmez).
//   3. Her kare için: köşe kameraya ne kadar bakıyor (facing) + derinlik tamponu
//      (burun gibi öndeki yüzey arkasını kapatıyor mu) → görünür köşeler örneklenir.
//   4. GÖZ BÖLGESİ yalnız ön kareden: yan karelerin ağırlığı göz merkezine yakın
//      köşelerde yumuşakça sıfıra iner (kapak/iris yandan bozulmasın).
//   5. Kareler arası pozlama farkı → kanal kazancı (ön kare referans).
//   6. Harmanlama lineer ışık uzayında, ağırlık = facing^6 → her bölge en dik
//      baktığı kareden gelir; geçişler yumuşak ama detay karışıp bulanmaz.
//   7. Hiçbir karede görülmeyen köşeler komşulardan doldurulur.

/// Renk birleştirmenin sonucu: köşe renkli ağ (PLY + önizleme) ve dokunun da
/// kullandığı seçilmiş kareler + kare başı pozlama kazancı (ön kare = 1).
struct FaceColorResult {
    let mesh: ColoredMesh
    let views: [FaceColorView]
    let gains: [SIMD3<Float>]
}

enum FaceColorMesh {

    static let minFacing: Float = 0.2
    static let depthEpsilon: Float = 0.004   // 4 mm
    static let eyeFrontOnlyInner: Float = 0.017
    static let eyeFrontOnlyOuter: Float = 0.025

    static func build(snapshot: MeshSnapshot,
                      samples: [FaceColorSample],
                      frontOnlyCenters: [SIMD3<Float>],
                      subdivisions: Int = 4) -> FaceColorResult {
        let baseVertexCount = snapshot.vertices.count
        let baseTris = snapshot.triangleIndices.map { UInt32(Int($0)) }

        var views = samples.map { $0.snapshotView }
        if let front = samples.first, let hiFront = front.highResView,
           highResAgrees(hiFront, front.snapshotView, positions: snapshot.vertices, tris: baseTris) {
            views = samples.map { $0.highResView ?? $0.snapshotView }
        }

        var pos = snapshot.vertices
        var tris = baseTris
        for _ in 0..<max(0, subdivisions) { subdivide(&pos, &tris) }
        let normals = vertexNormals(pos, tris)

        // Yan karelerin göz bölgesindeki ağırlık çarpanı (0 = yalnız ön kare)
        var sideScale = [Float](repeating: 1, count: pos.count)
        if !frontOnlyCenters.isEmpty {
            for i in pos.indices {
                var d = Float.greatestFiniteMagnitude
                for c in frontOnlyCenters { d = min(d, simd_distance(pos[i], c)) }
                sideScale[i] = smoothstep(eyeFrontOnlyInner, eyeFrontOnlyOuter, d)
            }
        }

        let observations = views.enumerated().map { k, view in
            observe(view, pos: pos, normals: normals,
                    baseVertexCount: baseVertexCount, baseTris: baseTris,
                    weightScale: k == 0 ? nil : sideScale)
        }
        let gains = exposureGains(observations)

        var colors = [SIMD3<Float>](repeating: SIMD3<Float>(repeating: 0.45), count: pos.count)
        var known = [Bool](repeating: false, count: pos.count)
        for i in pos.indices {
            var sum = SIMD3<Float>.zero
            var wsum: Float = 0
            for k in observations.indices {
                let w = observations[k].weights[i]
                guard w > 0 else { continue }
                sum += observations[k].colors[i] * gains[k] * w
                wsum += w
            }
            if wsum > 0 { colors[i] = sum / wsum; known[i] = true }
        }
        spreadUnknown(&colors, &known, tris: tris)

        let bytes = colors.map { c -> SIMD3<UInt8> in
            SIMD3<UInt8>(toSRGB8(c.x), toSRGB8(c.y), toSRGB8(c.z))
        }
        return FaceColorResult(mesh: ColoredMesh(positions: pos, colors: bytes, triangles: tris),
                               views: views, gains: gains)
    }

    /// Alan ağırlıklı köşe normalleri, yüzden DIŞARI bakacak şekilde yönlendirilmiş
    /// (face-anchor +z = yüzden izleyiciye doğru).
    static func vertexNormals(_ pos: [SIMD3<Float>], _ tris: [UInt32]) -> [SIMD3<Float>] {
        var n = [SIMD3<Float>](repeating: .zero, count: pos.count)
        var i = 0
        while i + 2 < tris.count {
            let a = Int(tris[i]), b = Int(tris[i + 1]), c = Int(tris[i + 2])
            let fn = simd_cross(pos[b] - pos[a], pos[c] - pos[a])
            n[a] += fn; n[b] += fn; n[c] += fn
            i += 3
        }
        let outward: Float = n.reduce(Float(0)) { $0 + $1.z } < 0 ? -1 : 1
        return n.map { simd_length($0) > 0 ? simd_normalize($0) * outward : SIMD3<Float>(0, 0, 1) }
    }

    // MARK: Yüksek çözünürlük güvenlik kontrolü

    /// Aynı ön pozun yüksek çözünürlüklü karesi ile ekran görüntüsünden, kameraya
    /// dik bakan taban köşelerde örneklenen parlaklıklar ilişkili mi? (göz, kaş,
    /// dudak, burun deliği yapısı). İzdüşüm yönü yanlışsa ilişki çöker → reddedilir.
    private static func highResAgrees(_ a: FaceColorView, _ b: FaceColorView,
                                      positions: [SIMD3<Float>], tris: [UInt32]) -> Bool {
        let normals = vertexNormals(positions, tris)
        let la = luma(a, positions, normals), lb = luma(b, positions, normals)
        var xs: [Float] = [], ys: [Float] = []
        for i in positions.indices {
            if let x = la[i], let y = lb[i] { xs.append(x); ys.append(y) }
        }
        guard xs.count >= 100 else { return false }
        let n = Float(xs.count)
        let mx = xs.reduce(0, +) / n, my = ys.reduce(0, +) / n
        var sxy: Float = 0, sxx: Float = 0, syy: Float = 0
        for i in xs.indices {
            let dx = xs[i] - mx, dy = ys[i] - my
            sxy += dx * dy; sxx += dx * dx; syy += dy * dy
        }
        guard sxx > 0, syy > 0 else { return false }
        return sxy / (sxx * syy).squareRoot() > 0.6
    }

    private static func luma(_ v: FaceColorView, _ pos: [SIMD3<Float>], _ normals: [SIMD3<Float>]) -> [Float?] {
        let MV = v.camera.viewMatrix(for: v.orientation) * v.faceTransform
        let N = upper3x3(MV)
        return pos.indices.map { i -> Float? in
            let pc = xyz(MV * SIMD4<Float>(pos[i], 1))
            guard simd_dot(simd_normalize(N * normals[i]), simd_normalize(-pc)) > 0.6 else { return nil }
            let world = xyz(v.faceTransform * SIMD4<Float>(pos[i], 1))
            let p = v.camera.projectPoint(world, orientation: v.orientation, viewportSize: v.projectionSize)
            let q = SIMD2<Float>(Float(p.x), Float(p.y)) * v.pixelScale - v.pixels.origin
            guard v.pixels.contains(q) else { return nil }
            let s = v.pixels.sample(q)
            return 0.299 * s.x + 0.587 * s.y + 0.114 * s.z
        }
    }

    // MARK: Tek kare gözlemi

    private struct Observation {
        var colors: [SIMD3<Float>]   // lineer 0…1
        var weights: [Float]
        var facing: [Float]
    }

    private static func observe(_ view: FaceColorView,
                                pos: [SIMD3<Float>],
                                normals: [SIMD3<Float>],
                                baseVertexCount: Int,
                                baseTris: [UInt32],
                                weightScale: [Float]?) -> Observation {
        let n = pos.count
        let px = view.pixels
        let size = view.projectionSize
        let sw = Float(size.width), sh = Float(size.height)

        var pixel = [SIMD2<Float>](repeating: SIMD2<Float>(-1, -1), count: n)
        var depth = [Float](repeating: .infinity, count: n)
        var facing = [Float](repeating: -1, count: n)
        guard sw > 0, sh > 0 else {
            return Observation(colors: .init(repeating: .zero, count: n),
                               weights: .init(repeating: 0, count: n), facing: facing)
        }

        // 330k köşe için projectPoint çağrısı yavaş → aynı izdüşüm matrislerle yapılır,
        // birkaç köşede projectPoint ile doğrulanır; uyuşmazsa projectPoint'e düşülür.
        let MV = view.camera.viewMatrix(for: view.orientation) * view.faceTransform
        let P = view.camera.projectionMatrix(for: view.orientation, viewportSize: size, zNear: 0.001, zFar: 1000)
        let N = upper3x3(MV)
        func matrixProject(_ pc: SIMD4<Float>) -> SIMD2<Float> {
            let clip = P * pc
            let w = abs(clip.w) > 1e-8 ? clip.w : 1e-8
            return SIMD2<Float>((clip.x / w + 1) * 0.5 * sw, (1 - clip.y / w) * 0.5 * sh)
        }
        var useMatrix = true
        let probeStep = max(1, baseVertexCount / 24)
        for i in stride(from: 0, to: baseVertexCount, by: probeStep) {
            let world = xyz(view.faceTransform * SIMD4<Float>(pos[i], 1))
            let ref = view.camera.projectPoint(world, orientation: view.orientation, viewportSize: size)
            let mine = matrixProject(MV * SIMD4<Float>(pos[i], 1))
            if simd_distance(mine, SIMD2<Float>(Float(ref.x), Float(ref.y))) > 1.5 { useMatrix = false; break }
        }

        for i in 0..<n {
            let pc4 = MV * SIMD4<Float>(pos[i], 1)
            let pc = xyz(pc4)
            depth[i] = simd_length(pc)
            facing[i] = simd_dot(simd_normalize(N * normals[i]), -pc / max(depth[i], 1e-6))
            let proj: SIMD2<Float>
            if useMatrix {
                proj = matrixProject(pc4)
            } else {
                let world = xyz(view.faceTransform * SIMD4<Float>(pos[i], 1))
                let p = view.camera.projectPoint(world, orientation: view.orientation, viewportSize: size)
                proj = SIMD2<Float>(Float(p.x), Float(p.y))
            }
            pixel[i] = proj * view.pixelScale - px.origin
        }

        // Derinlik tamponu — TABAN ağ üçgenleriyle (her biri birkaç piksel; ince
        // bölünmüş üçgenler piksel merkezlerini ıskalar). Bölme düzlemsel olduğu için
        // ince köşeler taban üçgenlerin üstünde durur → derinlik tutarlı.
        let bw = max(16, px.width / 4), bh = max(16, px.height / 4)
        let ds = SIMD2<Float>(Float(bw) / Float(px.width), Float(bh) / Float(px.height))
        var zbuf = [Float](repeating: .infinity, count: bw * bh)
        var t = 0
        while t + 2 < baseTris.count {
            let a = Int(baseTris[t]), b = Int(baseTris[t + 1]), c = Int(baseTris[t + 2])
            t += 3
            guard a < baseVertexCount, b < baseVertexCount, c < baseVertexCount else { continue }
            let pa = pixel[a] * ds, pb = pixel[b] * ds, pc = pixel[c] * ds
            let area = edge(pa, pb, pc)
            guard abs(area) > 1e-6 else { continue }
            let minX = max(0, Int(min(pa.x, pb.x, pc.x).rounded(.down)))
            let maxX = min(bw - 1, Int(max(pa.x, pb.x, pc.x).rounded(.up)))
            let minY = max(0, Int(min(pa.y, pb.y, pc.y).rounded(.down)))
            let maxY = min(bh - 1, Int(max(pa.y, pb.y, pc.y).rounded(.up)))
            guard minX <= maxX, minY <= maxY else { continue }
            for y in minY...maxY {
                for x in minX...maxX {
                    let q = SIMD2<Float>(Float(x), Float(y))
                    let w0 = edge(pb, pc, q) / area
                    let w1 = edge(pc, pa, q) / area
                    let w2 = 1 - w0 - w1
                    guard w0 >= -0.02, w1 >= -0.02, w2 >= -0.02 else { continue }
                    let z = w0 * depth[a] + w1 * depth[b] + w2 * depth[c]
                    let idx = y * bw + x
                    if z < zbuf[idx] { zbuf[idx] = z }
                }
            }
        }

        var colors = [SIMD3<Float>](repeating: .zero, count: n)
        var weights = [Float](repeating: 0, count: n)
        for i in 0..<n {
            let f = facing[i]
            let scale = weightScale?[i] ?? 1
            let p = pixel[i]
            guard f > minFacing, scale > 0, px.contains(p) else { continue }
            let bx = min(bw - 1, Int((p.x * ds.x).rounded()))
            let by = min(bh - 1, Int((p.y * ds.y).rounded()))
            guard depth[i] <= zbuf[by * bw + bx] + depthEpsilon else { continue }   // öndeki yüzey kapatıyor
            let s = px.sample(p)
            colors[i] = SIMD3<Float>(toLinear(s.x), toLinear(s.y), toLinear(s.z))
            let g = (f - minFacing) / (1 - minFacing)
            weights[i] = pow(g, 6) * scale
        }
        return Observation(colors: colors, weights: weights, facing: facing)
    }

    /// Ön kare (0) referans; diğer karelerin kanal kazancı, ikisinin de iyi gördüğü
    /// köşelerdeki ortalama renk oranından.
    private static func exposureGains(_ obs: [Observation]) -> [SIMD3<Float>] {
        var gains = [SIMD3<Float>](repeating: SIMD3<Float>(repeating: 1), count: obs.count)
        guard obs.count > 1 else { return gains }
        let ref = obs[0]
        for k in 1..<obs.count {
            var sumRef = SIMD3<Float>.zero, sumK = SIMD3<Float>.zero
            var count = 0
            for i in ref.colors.indices
            where ref.weights[i] > 0 && obs[k].weights[i] > 0 && ref.facing[i] > 0.5 && obs[k].facing[i] > 0.5 {
                sumRef += ref.colors[i]; sumK += obs[k].colors[i]; count += 1
            }
            guard count >= 200 else { continue }
            let ratio = sumRef / simd_max(sumK, SIMD3<Float>(repeating: 1e-4))
            gains[k] = simd_clamp(ratio, SIMD3<Float>(repeating: 0.6), SIMD3<Float>(repeating: 1.6))
        }
        return gains
    }

    // MARK: Orta-nokta bölme

    private static func subdivide(_ pos: inout [SIMD3<Float>], _ tris: inout [UInt32]) {
        var cache: [UInt64: UInt32] = [:]
        cache.reserveCapacity(tris.count * 3 / 2)
        var out: [UInt32] = []
        out.reserveCapacity(tris.count * 4)

        func mid(_ a: UInt32, _ b: UInt32) -> UInt32 {
            let key = a < b ? (UInt64(a) << 32 | UInt64(b)) : (UInt64(b) << 32 | UInt64(a))
            if let m = cache[key] { return m }
            let m = UInt32(pos.count)
            pos.append((pos[Int(a)] + pos[Int(b)]) * 0.5)
            cache[key] = m
            return m
        }

        var i = 0
        while i + 2 < tris.count {
            let a = tris[i], b = tris[i + 1], c = tris[i + 2]
            let ab = mid(a, b), bc = mid(b, c), ca = mid(c, a)
            out.append(contentsOf: [a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca])
            i += 3
        }
        tris = out
    }

    // MARK: Bilinmeyen renkleri komşulardan yay (katman katman, BFS)

    private static func spreadUnknown(_ colors: inout [SIMD3<Float>], _ known: inout [Bool], tris: [UInt32]) {
        let n = colors.count
        guard known.contains(false) else { return }

        // Sıkıştırılmış komşuluk (CSR) — 330k köşede köşe başına dizi yerine tek dizi
        var offsets = [Int](repeating: 0, count: n + 1)
        var t = 0
        while t + 2 < tris.count {
            offsets[Int(tris[t]) + 1] += 2
            offsets[Int(tris[t + 1]) + 1] += 2
            offsets[Int(tris[t + 2]) + 1] += 2
            t += 3
        }
        for i in 0..<n { offsets[i + 1] += offsets[i] }
        var cursor = offsets
        var nbr = [UInt32](repeating: 0, count: offsets[n])
        func link(_ v: UInt32, _ x: UInt32, _ y: UInt32) {
            let at = cursor[Int(v)]
            nbr[at] = x; nbr[at + 1] = y
            cursor[Int(v)] = at + 2
        }
        t = 0
        while t + 2 < tris.count {
            let a = tris[t], b = tris[t + 1], c = tris[t + 2]
            link(a, b, c); link(b, a, c); link(c, a, b)
            t += 3
        }

        var queued = [Bool](repeating: false, count: n)
        var frontier: [Int] = []
        for i in 0..<n where !known[i] {
            for k in offsets[i]..<offsets[i + 1] where known[Int(nbr[k])] {
                frontier.append(i); queued[i] = true; break
            }
        }
        while !frontier.isEmpty {
            var updates: [(Int, SIMD3<Float>)] = []
            updates.reserveCapacity(frontier.count)
            for i in frontier {
                var sum = SIMD3<Float>.zero
                var count: Float = 0
                for k in offsets[i]..<offsets[i + 1] where known[Int(nbr[k])] {
                    sum += colors[Int(nbr[k])]; count += 1
                }
                if count > 0 { updates.append((i, sum / count)) }
            }
            guard !updates.isEmpty else { break }
            for (i, c) in updates { colors[i] = c; known[i] = true }
            var next: [Int] = []
            for (i, _) in updates {
                for k in offsets[i]..<offsets[i + 1] {
                    let j = Int(nbr[k])
                    if !known[j] && !queued[j] { queued[j] = true; next.append(j) }
                }
            }
            frontier = next
        }
    }

    // MARK: Yardımcılar

    static func xyz(_ v: SIMD4<Float>) -> SIMD3<Float> { SIMD3<Float>(v.x, v.y, v.z) }

    static func upper3x3(_ m: simd_float4x4) -> simd_float3x3 {
        simd_float3x3(xyz(m.columns.0), xyz(m.columns.1), xyz(m.columns.2))
    }

    static func edge(_ a: SIMD2<Float>, _ b: SIMD2<Float>, _ p: SIMD2<Float>) -> Float {
        (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    }

    static func smoothstep(_ e0: Float, _ e1: Float, _ x: Float) -> Float {
        let t = min(max((x - e0) / (e1 - e0), 0), 1)
        return t * t * (3 - 2 * t)
    }

    /// 0…255 sRGB → 0…1 lineer
    static func toLinear(_ v: Float) -> Float {
        let c = v / 255
        return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }

    /// 0…1 lineer → 0…255 sRGB
    static func toSRGB8(_ v: Float) -> UInt8 {
        let c = min(max(v, 0), 1)
        let s = c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1 / 2.4) - 0.055
        return UInt8((s * 255).rounded())
    }
}
