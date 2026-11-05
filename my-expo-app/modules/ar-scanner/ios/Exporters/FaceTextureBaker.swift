import UIKit
import CoreImage
import simd

/// Dokulu yüz: taban ağ (ön poz, göz delikleri kapalı) + köşe başına görüntü-uzayı
/// UV + iki doku (ham birleştirme ve iyileştirilmiş). OBJ+MTL+JPG ve önizleme bundan.
struct BakedFaceTexture {
    /// Geometri METRE, face-anchor yerel uzayı (PLY ile aynı uzay).
    let snapshot: MeshSnapshot
    /// Köşe başına UV, görüntü uzayında (sol-üst köken: v=0 dokunun üst satırı).
    let uvs: [SIMD2<Float>]
    let normals: [SIMD3<Float>]
    let original: CGImage
    let enhanced: CGImage
}

// Çok açılı doku pişirme.
//
// ARKit yüz ağıyla birlikte hazır bir UV açılımı verir (her yüz için aynı). Köşe
// rengi yerine bu UV haritasının her TEKSELİ için renk hesaplanır:
//   1. Teksel → içinde olduğu UV üçgeni → barisentrik ağırlık → yüzeydeki 3D nokta.
//   2. Nokta her karede izdüşürülür (üçgen köşelerinin izdüşümü ağırlıkla
//      karıştırılır; üçgenler birkaç mm, perspektif hatası ihmal edilir).
//   3. Görünürlük + ağırlık köşe-renk birleştirmesiyle AYNI kurallar: kameraya
//      bakma (facing^6), derinlik tamponu, göz bölgesi yalnız ön kare, kare başı
//      pozlama kazancı. Ek olarak kare kenarına yakın pikseller yumuşakça söner.
//   4. Hiçbir karede görülmeyen teksel + UV adaları arası boşluk: düşük çözünürlükte
//      itme-çekme (pull-push) ile komşu renklerden doldurulur (dikiş/mipmap izi yok).
//   5. İyileştirme (Core Image): gürültü azaltma, gölge açma/parlama bastırma,
//      hafif keskinleştirme. AĞIZ/DUDAK bölgesi ham kalır (gülüş tasarımı ölçüsü).
//   6. GÖZLER ayrı işlenir (cilt filtresi iris/kirpiği yumuşatırdı): ham doku +
//      iris netleştirme + göz akında hafif kızarıklık temizliği. Göz akı hem
//      geometriden (bakış ekseninden limbus dışı) hem renkten (açık, düşük
//      doygunluk) tanınır → iris, kapak derisi ve göz pınarı rengi korunur.
// Geometri hiç değişmez; yalnız doku üretilir.
enum FaceTextureBaker {

    static let size = 4096
    private static let lowRes = 512
    /// Kare kenarına bu kadar pikselden yakın örnekler yumuşakça söner.
    private static let borderFeather: Float = 24
    /// Ağız açıklığı merkezine göre ham bırakılan elips yarıçapları (m) + yumuşak geçiş.
    private static let mouthRadius = SIMD2<Float>(0.036, 0.026)
    private static let mouthFeather: Float = 1.35
    /// Göz maskesi kenar yumuşatma (teksel, ~0.45 mm)
    private static let eyeFeather = 10

    private struct ViewProjection {
        let pixels: FacePixels
        let pixel: [SIMD2<Float>]
        let viewPos: [SIMD3<Float>]
        let viewNormal: [SIMD3<Float>]
        let zbuf: [Float]
        let zw: Int
        let zh: Int
        let zscale: SIMD2<Float>
    }

    static func bake(snapshot: MeshSnapshot,
                     views: [FaceColorView],
                     gains: [SIMD3<Float>],
                     frontOnlyCenters: [SIMD3<Float>],
                     eyeCaps: [EyeCap] = [],
                     context: CIContext) -> BakedFaceTexture? {
        let pos = snapshot.vertices
        guard !views.isEmpty, gains.count == views.count,
              snapshot.textureCoordinates.count == pos.count, pos.count > 3 else { return nil }
        let tris = snapshot.triangleIndices.map { Int($0) }
        guard tris.count >= 3, tris.allSatisfy({ $0 >= 0 && $0 < pos.count }) else { return nil }

        let normals = FaceColorMesh.vertexNormals(pos, tris.map { UInt32($0) })
        let uvs = imageSpaceUVs(snapshot)
        let projections = views.map { project($0, pos: pos, normals: normals, tris: tris) }
        let mouth = mouthCenter(snapshot)

        let S = size
        let texels = S * S
        let rgba = UnsafeMutablePointer<UInt8>.allocate(capacity: texels * 4)
        rgba.initialize(repeating: 0, count: texels * 4)
        let known = UnsafeMutablePointer<UInt8>.allocate(capacity: texels)
        known.initialize(repeating: 0, count: texels)
        let mouthMask = UnsafeMutablePointer<UInt8>.allocate(capacity: texels)
        mouthMask.initialize(repeating: 0, count: texels)
        // Göz dolgusu teksel = 255; göz akı olasılığı (geometriden) 0…255
        let eyeMask = UnsafeMutablePointer<UInt8>.allocate(capacity: texels)
        eyeMask.initialize(repeating: 0, count: texels)
        let scleraPrior = UnsafeMutablePointer<UInt8>.allocate(capacity: texels)
        scleraPrior.initialize(repeating: 0, count: texels)
        defer {
            rgba.deallocate()
            known.deallocate()
            mouthMask.deallocate()
            eyeMask.deallocate()
            scleraPrior.deallocate()
        }

        // Sıcak döngü HAM İŞARETÇİLERLE: Swift dizisine/struct'a teksel başına
        // erişim, paralel iş parçacıklarında referans sayacı çekişmesi yaratıp
        // pişirmeyi ~10 kat yavaşlatıyordu (Mac ölçümü 7.8 sn → bkz. bellek notu).
        let linearLUT = UnsafeMutablePointer<Float>.allocate(capacity: 257)
        for i in 0...256 { linearLUT[i] = FaceColorMesh.toLinear(Float(min(i, 255))) }
        let srgbLUT = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
        for i in 0..<4096 { srgbLUT[i] = FaceColorMesh.toSRGB8(Float(i) / 4095) }
        let raws = projections.enumerated().map { RawView($0.element, gain: gains[$0.offset]) }
        let rawPtr = UnsafeMutablePointer<RawView>.allocate(capacity: raws.count)
        rawPtr.initialize(from: raws, count: raws.count)
        let viewCount = raws.count
        defer {
            linearLUT.deallocate()
            srgbLUT.deallocate()
            for r in raws { r.free() }
            rawPtr.deallocate()
        }

        let minFacing = FaceColorMesh.minFacing
        let eyeInner = FaceColorMesh.eyeFrontOnlyInner
        let eyeOuter = FaceColorMesh.eyeFrontOnlyOuter
        let depthEps = FaceColorMesh.depthEpsilon
        let eyeA = frontOnlyCenters.first, eyeB = frontOnlyCenters.count > 1 ? frontOnlyCenters[1] : nil
        let fS = Float(S)

        @inline(__always) func lin(_ v: Float) -> Float {
            let i = min(max(Int(v), 0), 255)
            return linearLUT[i] + (linearLUT[i + 1] - linearLUT[i]) * (v - Float(i))
        }

        let triCount = tris.count / 3
        let chunks = max(1, min(triCount, ProcessInfo.processInfo.activeProcessorCount * 4))
        DispatchQueue.concurrentPerform(iterations: chunks) { chunk in
            // Üçgenin 3 köşesinin kare başı verisi (üçgen başına bir kez doldurulur)
            let tv = UnsafeMutablePointer<TriView>.allocate(capacity: viewCount)
            defer { tv.deallocate() }
            var t = chunk
            while t < triCount {
                defer { t += chunks }
                let ia = tris[t * 3], ib = tris[t * 3 + 1], ic = tris[t * 3 + 2]
                let a = uvs[ia] * fS, b = uvs[ib] * fS, c = uvs[ic] * fS
                let area = FaceColorMesh.edge(a, b, c)
                guard abs(area) > 1e-6 else { continue }
                // Kenara teksel cinsinden uzaklık = ağırlık × (|alan| / kenar boyu)
                let la = abs(area) / max(simd_distance(b, c), 1e-6)
                let lb = abs(area) / max(simd_distance(c, a), 1e-6)
                let lc = abs(area) / max(simd_distance(a, b), 1e-6)
                let minX = max(0, Int((min(a.x, b.x, c.x) - 1).rounded(.down)))
                let maxX = min(S - 1, Int((max(a.x, b.x, c.x) + 1).rounded(.up)))
                let minY = max(0, Int((min(a.y, b.y, c.y) - 1).rounded(.down)))
                let maxY = min(S - 1, Int((max(a.y, b.y, c.y) + 1).rounded(.up)))
                guard minX <= maxX, minY <= maxY else { continue }
                let pa = pos[ia], pb = pos[ib], pc = pos[ic]
                // Göz dolgusu üçgeni: en az bir köşesi dolgu köşesi
                var cap: EyeCap?
                for e in eyeCaps where e.contains(vertex: ia) || e.contains(vertex: ib) || e.contains(vertex: ic) {
                    cap = e
                }
                for k in 0..<viewCount {
                    let p = projections[k]
                    tv[k] = TriView(pix: (p.pixel[ia], p.pixel[ib], p.pixel[ic]),
                                    vp: (p.viewPos[ia], p.viewPos[ib], p.viewPos[ic]),
                                    vn: (p.viewNormal[ia], p.viewNormal[ib], p.viewNormal[ic]))
                }

                for y in minY...maxY {
                    for x in minX...maxX {
                        let q = SIMD2<Float>(Float(x) + 0.5, Float(y) + 0.5)
                        var w0 = FaceColorMesh.edge(b, c, q) / area
                        var w1 = FaceColorMesh.edge(c, a, q) / area
                        var w2 = 1 - w0 - w1
                        // Kenarı ~0.75 teksel taşan teksel de alınır (adalar arası çatlak kalmaz)
                        guard w0 * la >= -0.75, w1 * lb >= -0.75, w2 * lc >= -0.75 else { continue }
                        w0 = max(w0, 0); w1 = max(w1, 0); w2 = max(w2, 0)
                        let ws = w0 + w1 + w2
                        guard ws > 0 else { continue }
                        w0 /= ws; w1 /= ws; w2 /= ws

                        let idx = y * S + x
                        let p = pa * w0 + pb * w1 + pc * w2

                        if let cap {
                            eyeMask[idx] = 255
                            // Limbusun ~1 mm dışına kadar iris sayılır (iris kenarı korunur)
                            let cosA = simd_dot(simd_normalize(p - cap.center), cap.gaze)
                            let lc = cap.limbusCos
                            let sclera = 1 - FaceColorMesh.smoothstep(lc - 0.07, lc - 0.02, cosA)
                            scleraPrior[idx] = UInt8(min(255, sclera * 255 + 0.5))
                        }

                        if let mouth {
                            let d = (SIMD2<Float>(p.x, p.y) - mouth) / mouthRadius
                            let m = 1 - FaceColorMesh.smoothstep(1, mouthFeather, simd_length(d))
                            if m > 0 { mouthMask[idx] = UInt8(min(255, m * 255 + 0.5)) }
                        }

                        var sideScale: Float = 1
                        if let eyeA {
                            var dmin = simd_distance(p, eyeA)
                            if let eyeB { dmin = min(dmin, simd_distance(p, eyeB)) }
                            sideScale = FaceColorMesh.smoothstep(eyeInner, eyeOuter, dmin)
                        }

                        var sum = SIMD3<Float>.zero
                        var wsum: Float = 0
                        for k in 0..<viewCount {
                            let scale: Float = k == 0 ? 1 : sideScale
                            guard scale > 0 else { continue }
                            let v = rawPtr[k]
                            let tr = tv[k]
                            let vp = tr.vp.0 * w0 + tr.vp.1 * w1 + tr.vp.2 * w2
                            let dist = simd_length(vp)
                            guard dist > 1e-6 else { continue }
                            let vn = simd_normalize(tr.vn.0 * w0 + tr.vn.1 * w1 + tr.vn.2 * w2)
                            let facing = simd_dot(vn, -vp / dist)
                            guard facing > minFacing else { continue }
                            let pix = tr.pix.0 * w0 + tr.pix.1 * w1 + tr.pix.2 * w2
                            guard pix.x >= 0, pix.y >= 0, pix.x <= v.maxX, pix.y <= v.maxY else { continue }
                            let bx = min(v.zw - 1, max(0, Int((pix.x * v.zscale.x).rounded())))
                            let by = min(v.zh - 1, max(0, Int((pix.y * v.zscale.y).rounded())))
                            guard dist <= v.zbuf[by * v.zw + bx] + depthEps else { continue }   // önde yüzey var
                            let edgeDist = min(pix.x, pix.y, v.maxX - pix.x, v.maxY - pix.y)
                            let feather = FaceColorMesh.smoothstep(0, borderFeather, edgeDist)
                            let g = (facing - minFacing) / (1 - minFacing)
                            let g2 = g * g
                            let w = g2 * g2 * g2 * scale * feather
                            guard w > 0 else { continue }
                            let s = v.sample(pix)
                            sum += SIMD3<Float>(lin(s.x), lin(s.y), lin(s.z)) * v.gain * w
                            wsum += w
                        }
                        guard wsum > 0 else { continue }
                        let col = sum / wsum
                        let o = idx * 4
                        rgba[o] = srgbLUT[min(max(Int(col.x * 4095 + 0.5), 0), 4095)]
                        rgba[o + 1] = srgbLUT[min(max(Int(col.y * 4095 + 0.5), 0), 4095)]
                        rgba[o + 2] = srgbLUT[min(max(Int(col.z * 4095 + 0.5), 0), 4095)]
                        rgba[o + 3] = 255
                        known[idx] = 1
                    }
                }
            }
        }

        fillUnknown(rgba: rgba, known: known, size: S)
        guard let original = makeImage(rgba, size: S),
              let enhanced = enhance(original, mouthMask: mouthMask, eyeMask: eyeMask,
                                     scleraPrior: scleraPrior, size: S, context: context) else { return nil }
        return BakedFaceTexture(snapshot: snapshot, uvs: uvs, normals: normals,
                                original: original, enhanced: enhanced)
    }

    /// Bir karenin sıcak döngüde kullanılan verisi — dizi değil ham işaretçi
    /// (paralel erişimde referans sayacı çekişmesi olmasın). `free()` ile bırakılır.
    private struct RawView {
        let px: UnsafeMutablePointer<UInt8>
        let width: Int
        let maxX: Float
        let maxY: Float
        let zbuf: UnsafeMutablePointer<Float>
        let zw: Int
        let zh: Int
        let zscale: SIMD2<Float>
        let gain: SIMD3<Float>

        init(_ p: ViewProjection, gain: SIMD3<Float>) {
            let data = p.pixels.data
            px = UnsafeMutablePointer<UInt8>.allocate(capacity: data.count)
            px.initialize(from: data, count: data.count)
            width = p.pixels.width
            maxX = Float(p.pixels.width - 1)
            maxY = Float(p.pixels.height - 1)
            zbuf = UnsafeMutablePointer<Float>.allocate(capacity: p.zbuf.count)
            zbuf.initialize(from: p.zbuf, count: p.zbuf.count)
            zw = p.zw; zh = p.zh; zscale = p.zscale
            self.gain = gain
        }

        func free() { px.deallocate(); zbuf.deallocate() }

        /// Çift doğrusal örnek (0…255 sRGB) — FacePixels.sample ile aynı.
        @inline(__always) func sample(_ p: SIMD2<Float>) -> SIMD3<Float> {
            let x0 = Int(p.x), y0 = Int(p.y)
            let x1 = min(x0 + 1, Int(maxX)), y1 = min(y0 + 1, Int(maxY))
            let tx = p.x - Float(x0), ty = p.y - Float(y0)
            @inline(__always) func at(_ x: Int, _ y: Int) -> SIMD3<Float> {
                let i = (y * width + x) * 4
                return SIMD3<Float>(Float(px[i]), Float(px[i + 1]), Float(px[i + 2]))
            }
            let top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx
            let bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx
            return top + (bottom - top) * ty
        }
    }

    private struct TriView {
        let pix: (SIMD2<Float>, SIMD2<Float>, SIMD2<Float>)
        let vp: (SIMD3<Float>, SIMD3<Float>, SIMD3<Float>)
        let vn: (SIMD3<Float>, SIMD3<Float>, SIMD3<Float>)
    }

    // MARK: UV yönü

    /// ARKit UV'sini görüntü uzayına (sol-üst köken) getirir. Yön ağdan doğrulanır:
    /// alnın (en yüksek y) v'si çenenin (en düşük y) v'sinden küçük olmalı.
    private static func imageSpaceUVs(_ snapshot: MeshSnapshot) -> [SIMD2<Float>] {
        let pos = snapshot.vertices
        let uv = snapshot.textureCoordinates
        guard let top = pos.indices.max(by: { pos[$0].y < pos[$1].y }),
              let bottom = pos.indices.min(by: { pos[$0].y < pos[$1].y }) else { return uv }
        let flip = uv[top].y > uv[bottom].y
        return uv.map { SIMD2<Float>(min(max($0.x, 0), 1), min(max(flip ? 1 - $0.y : $0.y, 0), 1)) }
    }

    // MARK: Ağız merkezi

    /// Göz delikleri kapatıldıktan sonra kalan sınır halkaları: yüzün dış çevresi
    /// (en uzun) + ağız açıklığı. Ağız merkezi (x, y) face-anchor uzayında.
    private static func mouthCenter(_ snapshot: MeshSnapshot) -> SIMD2<Float>? {
        let loops = EyeHoleFiller.boundaryLoops(snapshot.triangleIndices)
        guard loops.count >= 2,
              let outer = loops.indices.max(by: { loops[$0].count < loops[$1].count }) else { return nil }
        // Bir göz deliği kapatılamamışsa o da kalır → ağız = merkezi EN ALTTAKİ delik
        let centers = loops.indices.filter { $0 != outer }
            .map { EyeHoleFiller.centroid(loops[$0], snapshot.vertices) }
        guard let c = centers.min(by: { $0.y < $1.y }) else { return nil }
        return SIMD2<Float>(c.x, c.y)
    }

    // MARK: İzdüşüm

    private static func project(_ view: FaceColorView, pos: [SIMD3<Float>],
                                normals: [SIMD3<Float>], tris: [Int]) -> ViewProjection {
        let MV = view.camera.viewMatrix(for: view.orientation) * view.faceTransform
        let N = FaceColorMesh.upper3x3(MV)
        var pixel = [SIMD2<Float>](repeating: SIMD2<Float>(-1, -1), count: pos.count)
        var viewPos = [SIMD3<Float>](repeating: .zero, count: pos.count)
        var viewNormal = [SIMD3<Float>](repeating: SIMD3<Float>(0, 0, 1), count: pos.count)
        var depth = [Float](repeating: .infinity, count: pos.count)
        for i in pos.indices {
            let world = FaceColorMesh.xyz(view.faceTransform * SIMD4<Float>(pos[i], 1))
            let p = view.camera.projectPoint(world, orientation: view.orientation, viewportSize: view.projectionSize)
            pixel[i] = SIMD2<Float>(Float(p.x), Float(p.y)) * view.pixelScale - view.pixels.origin
            viewPos[i] = FaceColorMesh.xyz(MV * SIMD4<Float>(pos[i], 1))
            depth[i] = simd_length(viewPos[i])
            let n = N * normals[i]
            viewNormal[i] = simd_length(n) > 0 ? simd_normalize(n) : SIMD3<Float>(0, 0, 1)
        }

        // Derinlik tamponu (kare çözünürlüğünün 1/4'ü) — öndeki yüzeyin (burun)
        // arkasında kalan noktalar o kareden renk almaz.
        let px = view.pixels
        let zw = max(16, px.width / 4), zh = max(16, px.height / 4)
        let zscale = SIMD2<Float>(Float(zw) / Float(px.width), Float(zh) / Float(px.height))
        var zbuf = [Float](repeating: .infinity, count: zw * zh)
        var t = 0
        while t + 2 < tris.count {
            let a = tris[t], b = tris[t + 1], c = tris[t + 2]
            t += 3
            let pa = pixel[a] * zscale, pb = pixel[b] * zscale, pc = pixel[c] * zscale
            let area = FaceColorMesh.edge(pa, pb, pc)
            guard abs(area) > 1e-6 else { continue }
            let minX = max(0, Int(min(pa.x, pb.x, pc.x).rounded(.down)))
            let maxX = min(zw - 1, Int(max(pa.x, pb.x, pc.x).rounded(.up)))
            let minY = max(0, Int(min(pa.y, pb.y, pc.y).rounded(.down)))
            let maxY = min(zh - 1, Int(max(pa.y, pb.y, pc.y).rounded(.up)))
            guard minX <= maxX, minY <= maxY else { continue }
            for y in minY...maxY {
                for x in minX...maxX {
                    let q = SIMD2<Float>(Float(x), Float(y))
                    let w0 = FaceColorMesh.edge(pb, pc, q) / area
                    let w1 = FaceColorMesh.edge(pc, pa, q) / area
                    let w2 = 1 - w0 - w1
                    guard w0 >= -0.02, w1 >= -0.02, w2 >= -0.02 else { continue }
                    let z = w0 * depth[a] + w1 * depth[b] + w2 * depth[c]
                    let idx = y * zw + x
                    if z < zbuf[idx] { zbuf[idx] = z }
                }
            }
        }
        return ViewProjection(pixels: px, pixel: pixel, viewPos: viewPos, viewNormal: viewNormal,
                              zbuf: zbuf, zw: zw, zh: zh, zscale: zscale)
    }

    // MARK: Boşluk doldurma (pull-push)

    /// Bilinen teksellerin düşük çözünürlüklü piramidi kurulur; boş hücreler bir üst
    /// seviyeden doldurulur. Bilinmeyen tam çözünürlüklü teksel bu haritadan çift
    /// doğrusal örneklenir → görülmeyen bölge ve UV adaları arası yumuşak dolar.
    private static func fillUnknown(rgba: UnsafeMutablePointer<UInt8>,
                                    known: UnsafeMutablePointer<UInt8>, size S: Int) {
        let L = lowRes
        let f = S / L
        var levels: [[SIMD4<Float>]] = []
        var base = [SIMD4<Float>](repeating: .zero, count: L * L)
        for y in 0..<S {
            let row = (y / f) * L
            for x in 0..<S where known[y * S + x] != 0 {
                let o = (y * S + x) * 4
                base[row + x / f] += SIMD4<Float>(Float(rgba[o]), Float(rgba[o + 1]), Float(rgba[o + 2]), 1)
            }
        }
        levels.append(base)
        var n = L
        while n > 1 {
            let m = n / 2
            let prev = levels[levels.count - 1]
            var next = [SIMD4<Float>](repeating: .zero, count: m * m)
            for y in 0..<m {
                for x in 0..<m {
                    next[y * m + x] = prev[(2 * y) * n + 2 * x] + prev[(2 * y) * n + 2 * x + 1]
                        + prev[(2 * y + 1) * n + 2 * x] + prev[(2 * y + 1) * n + 2 * x + 1]
                }
            }
            levels.append(next)
            n = m
        }

        // İtme: en kaba seviyeden aşağı, boş hücre = ebeveyn rengi
        var colors: [SIMD3<Float>] = {
            let c = levels[levels.count - 1][0]
            return [c.w > 0 ? SIMD3<Float>(c.x, c.y, c.z) / c.w : SIMD3<Float>(repeating: 150)]
        }()
        var side = 1
        for k in stride(from: levels.count - 2, through: 0, by: -1) {
            let lv = levels[k]
            let ns = side * 2
            var next = [SIMD3<Float>](repeating: .zero, count: ns * ns)
            for y in 0..<ns {
                for x in 0..<ns {
                    let c = lv[y * ns + x]
                    next[y * ns + x] = c.w > 0 ? SIMD3<Float>(c.x, c.y, c.z) / c.w : colors[(y / 2) * side + x / 2]
                }
            }
            colors = next
            side = ns
        }

        let inv = 1 / Float(f)
        for y in 0..<S {
            let fy = min(max((Float(y) + 0.5) * inv - 0.5, 0), Float(L - 1))
            let y0 = Int(fy), y1 = min(y0 + 1, L - 1)
            let ty = fy - Float(y0)
            for x in 0..<S where known[y * S + x] == 0 {
                let fx = min(max((Float(x) + 0.5) * inv - 0.5, 0), Float(L - 1))
                let x0 = Int(fx), x1 = min(x0 + 1, L - 1)
                let tx = fx - Float(x0)
                let top = colors[y0 * L + x0] * (1 - tx) + colors[y0 * L + x1] * tx
                let bottom = colors[y1 * L + x0] * (1 - tx) + colors[y1 * L + x1] * tx
                let c = top * (1 - ty) + bottom * ty
                let o = (y * S + x) * 4
                rgba[o] = UInt8(min(max(c.x, 0), 255))
                rgba[o + 1] = UInt8(min(max(c.y, 0), 255))
                rgba[o + 2] = UInt8(min(max(c.z, 0), 255))
                rgba[o + 3] = 255
            }
        }
    }

    // MARK: İyileştirme

    /// Gürültü azaltma → gölge açma + parlama bastırma → hafif keskinleştirme.
    /// Gözlerde göze özel sonuç (bkz. `enhanceEyes`), ağız maskesinde (dudak/diş
    /// bölgesi) ham doku kullanılır.
    private static func enhance(_ original: CGImage, mouthMask: UnsafeMutablePointer<UInt8>,
                                eyeMask: UnsafeMutablePointer<UInt8>,
                                scleraPrior: UnsafeMutablePointer<UInt8>,
                                size S: Int, context: CIContext) -> CGImage? {
        let input = CIImage(cgImage: original)
        let extent = input.extent
        let processed = input.clampedToExtent()
            .applyingFilter("CINoiseReduction", parameters: [
                "inputNoiseLevel": 0.012,
                "inputSharpness": 0.45,
            ])
            .applyingFilter("CIHighlightShadowAdjust", parameters: [
                "inputShadowAmount": 0.32,
                "inputHighlightAmount": 0.85,
                "inputRadius": 24,
            ])
            .applyingFilter("CIUnsharpMask", parameters: [
                kCIInputRadiusKey: 2.2,
                kCIInputIntensityKey: 0.3,
            ])
            .cropped(to: extent)

        guard let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        let count = S * S
        let out = UnsafeMutablePointer<UInt8>.allocate(capacity: count * 4)
        defer { out.deallocate() }
        context.render(processed, toBitmap: out, rowBytes: S * 4, bounds: extent,
                       format: .RGBA8, colorSpace: space)

        enhanceEyes(original, into: out, eyeMask: eyeMask, scleraPrior: scleraPrior, size: S)

        // Ham dokuyu ağız bölgesi için yeniden oku (CGImage → piksel)
        if (0..<count).contains(where: { mouthMask[$0] != 0 }),
           let raw = original.dataProvider?.data as Data? {
            raw.withUnsafeBytes { (src: UnsafeRawBufferPointer) in
                guard let s = src.baseAddress?.assumingMemoryBound(to: UInt8.self), src.count >= count * 4 else { return }
                for i in 0..<count {
                    let m = Int(mouthMask[i])
                    guard m > 0 else { continue }
                    let o = i * 4
                    for ch in 0..<3 {
                        out[o + ch] = UInt8((Int(out[o + ch]) * (255 - m) + Int(s[o + ch]) * m + 127) / 255)
                    }
                    out[o + 3] = 255
                }
            }
        }
        return makeImage(out, size: S)
    }

    // MARK: Göz iyileştirme

    /// Göz bölgesi (dolgu teksel + yumuşak kenar) cilt filtresinin sonucu yerine:
    ///   ham doku → iris/kirpik netleştirme (unsharp; göz akında zayıf, damar
    ///   belirginleşmesin) → göz akında damar (çevresinden kırmızı ince çizgi)
    ///   bastırma + hafif renk/ışık temizliği.
    ///   Göz akı kapısı ÇEVREYE bakar: geometri olasılığı × çevre açık × çevre
    ///   düşük doygunluk × kapak kenarından içeride → koyu iris, gözbebeği,
    ///   kirpik, kapak derisi ve göz pınarı korunur.
    /// Yalnız göz kutusunda, Core Image'sız (ikinci bir tam boy CI geçişi ~150 MB).
    private static func enhanceEyes(_ original: CGImage, into out: UnsafeMutablePointer<UInt8>,
                                    eyeMask: UnsafeMutablePointer<UInt8>,
                                    scleraPrior: UnsafeMutablePointer<UInt8>,
                                    size S: Int) {
        // Göz tekselerinin sınır kutusu (iki göz birlikte) + yumuşatma payı
        var x0 = S, y0 = S, x1 = -1, y1 = -1
        for y in 0..<S {
            let row = y * S
            for x in 0..<S where eyeMask[row + x] != 0 {
                if x < x0 { x0 = x }; if x > x1 { x1 = x }
                if y < y0 { y0 = y }; if y > y1 { y1 = y }
            }
        }
        guard x1 >= x0, y1 >= y0,
              original.bitsPerPixel == 32, original.bytesPerRow >= S * 4,
              let data = original.dataProvider?.data as Data? else { return }
        let rowBytes = original.bytesPerRow
        let pad = eyeFeather * 3
        x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
        x1 = min(S - 1, x1 + pad); y1 = min(S - 1, y1 + pad)
        let bw = x1 - x0 + 1, bh = y1 - y0 + 1
        let n = bw * bh

        // Ham renk (kanal düzlemleri) + maskeler
        var rawR = [Float](repeating: 0, count: n), rawG = rawR, rawB = rawR
        var mask = [Float](repeating: 0, count: n)
        var prior = [Float](repeating: 0, count: n)
        let ok = data.withUnsafeBytes { (src: UnsafeRawBufferPointer) -> Bool in
            guard let px = src.baseAddress?.assumingMemoryBound(to: UInt8.self),
                  src.count >= (S - 1) * rowBytes + S * 4 else { return false }
            for y in 0..<bh {
                for x in 0..<bw {
                    let k = y * bw + x
                    let o = (y + y0) * rowBytes + (x + x0) * 4
                    rawR[k] = Float(px[o]); rawG[k] = Float(px[o + 1]); rawB[k] = Float(px[o + 2])
                    let i = (y + y0) * S + x + x0
                    mask[k] = eyeMask[i] != 0 ? 1 : 0
                    prior[k] = Float(scleraPrior[i]) / 255
                }
            }
            return true
        }
        guard ok else { return }

        // Bulanıklar (kutu ×2 ≈ üçgen/gauss):
        //   small  ~0.25 mm → keskinleştirme tabanı
        //   nb     ~1 mm    → çevre rengi (damar = çevresinden kırmızı)
        //   inner  geniş maske → kapak kenarına yakın söner
        var smR = rawR, smG = rawG, smB = rawB
        var nbR = rawR, nbG = rawG, nbB = rawB
        var inner = mask
        for _ in 0..<2 {
            boxBlur(&smR, bw, bh, 3); boxBlur(&smG, bw, bh, 3); boxBlur(&smB, bw, bh, 3)
            boxBlur(&nbR, bw, bh, 12); boxBlur(&nbG, bw, bh, 12); boxBlur(&nbB, bw, bh, 12)
            boxBlur(&mask, bw, bh, eyeFeather / 2)
            boxBlur(&prior, bw, bh, eyeFeather / 2)
            boxBlur(&inner, bw, bh, eyeFeather * 2)
        }

        for y in 0..<bh {
            for x in 0..<bw {
                let k = y * bw + x
                guard mask[k] > 0.002 else { continue }
                let raw = SIMD3<Float>(rawR[k], rawG[k], rawB[k])
                let nb = SIMD3<Float>(nbR[k], nbG[k], nbB[k])
                let nbMx = max(nb.x, nb.y, nb.z), nbMn = min(nb.x, nb.y, nb.z)
                let nbLum = (0.299 * nb.x + 0.587 * nb.y + 0.114 * nb.z) / 255
                let nbSat = nbMx > 1 ? (nbMx - nbMn) / nbMx : 0
                // Dolgunun içine taşan kapak derisi (ARKit göz deliği kapağa tam
                // oturmazsa): iris dışı + doygun + açık ton → cilt filtresinde kalır,
                // kapak kenarında ton basamağı oluşmaz.
                let skinLike = prior[k]
                    * FaceColorMesh.smoothstep(0.26, 0.40, nbSat)
                    * FaceColorMesh.smoothstep(0.30, 0.45, nbLum)
                let m = mask[k] * (1 - skinLike)
                let gate = prior[k]
                    * FaceColorMesh.smoothstep(0.35, 0.70, inner[k])
                    * FaceColorMesh.smoothstep(0.40, 0.60, nbLum)
                    * (1 - FaceColorMesh.smoothstep(0.18, 0.38, nbSat))

                // Netleştirme: iris/kirpik tam; göz akında ve kapak kenarı dahil HER
                // kırmızı ince çizgide zayıf (damar belirginleşmesin)
                let rawExcess = (raw.x - (raw.y + raw.z) / 2) - (nb.x - (nb.y + nb.z) / 2)
                let veinish = prior[k] * FaceColorMesh.smoothstep(3, 18, rawExcess)
                let small = SIMD3<Float>(smR[k], smG[k], smB[k])
                // Fark ±14 ile sınırlı: iris dokusu netleşir, kapak/gözbebeği gibi
                // güçlü kenarlarda beyaz/kara hale oluşmaz
                let amount = 0.6 * (1 - 0.8 * max(gate, veinish))
                var c = raw + simd_clamp((raw - small) * amount, SIMD3<Float>(repeating: -14), SIMD3<Float>(repeating: 14))

                if gate > 0 {
                    // Damar: çevresinden kırmızı → çevre rengine çek
                    let redExcess = (c.x - (c.y + c.z) / 2) - (nb.x - (nb.y + nb.z) / 2)
                    let vein = FaceColorMesh.smoothstep(3, 18, redExcess)
                    c += (nb - c) * (0.85 * vein * gate)
                    // Genel kızarıklık / sarılık → hafif nötrleştir
                    let lum = (0.299 * c.x + 0.587 * c.y + 0.114 * c.z) / 255
                    c += (SIMD3<Float>(repeating: lum * 255) - c) * (0.35 * gate)
                    // Hafif aydınlatma — kirpik/gözbebeği gibi koyu teksel hariç
                    c += (SIMD3<Float>(repeating: 255) - c) * (0.07 * gate * FaceColorMesh.smoothstep(0.35, 0.6, lum))
                }
                let o = ((y + y0) * S + x + x0) * 4
                for ch in 0..<3 {
                    let v = Float(out[o + ch]) * (1 - m) + c[ch] * m
                    out[o + ch] = UInt8(min(max(v + 0.5, 0), 255))
                }
            }
        }
    }

    /// Yerinde ayrılabilir kutu bulanıklığı (yarıçap r), kenarda kırpılmış pencere.
    private static func boxBlur(_ a: inout [Float], _ w: Int, _ h: Int, _ r: Int) {
        guard r > 0 else { return }
        var tmp = [Float](repeating: 0, count: a.count)
        for y in 0..<h {
            var acc: Float = 0
            let row = y * w
            for x in 0...min(r, w - 1) { acc += a[row + x] }
            for x in 0..<w {
                let lo = max(0, x - r), hi = min(w - 1, x + r)
                tmp[row + x] = acc / Float(hi - lo + 1)
                if x + r + 1 < w { acc += a[row + x + r + 1] }
                if x - r >= 0 { acc -= a[row + x - r] }
            }
        }
        for x in 0..<w {
            var acc: Float = 0
            for y in 0...min(r, h - 1) { acc += tmp[y * w + x] }
            for y in 0..<h {
                let lo = max(0, y - r), hi = min(h - 1, y + r)
                a[y * w + x] = acc / Float(hi - lo + 1)
                if y + r + 1 < h { acc += tmp[(y + r + 1) * w + x] }
                if y - r >= 0 { acc -= tmp[(y - r) * w + x] }
            }
        }
    }

    private static func makeImage(_ ptr: UnsafeMutablePointer<UInt8>, size S: Int) -> CGImage? {
        let data = Data(bytes: ptr, count: S * S * 4)
        guard let provider = CGDataProvider(data: data as CFData),
              let space = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        return CGImage(width: S, height: S, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: S * 4,
                       space: space, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}
