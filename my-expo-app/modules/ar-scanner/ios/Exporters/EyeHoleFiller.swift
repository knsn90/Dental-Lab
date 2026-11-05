import simd

// ARFaceGeometry gözlerin ve ağzın yerini BİLEREK açık bırakır (maske/filtre ağı).
// Bu yardımcı yalnız iki GÖZ deliğini kapatır; ağız açık kalır (gülüş tasarımında
// dişler oraya yerleştirilir).
//
// Yöntem:
//   1. Tek bir üçgene ait kenarlar = delik sınırı → kapalı halkalara birleştirilir.
//   2. ARKit göz merkezine (leftEyeTransform/rightEyeTransform) en yakın küçük halka
//      = göz deliği. En büyük halka (yüz dış çevresi) asla seçilmez.
//   3. Halka → merkez arası iç halkalar + tepe noktası, göz küresi yüzeyine oturtulur
//      (kapak kenarından merkeze hafif kavis; düz kapak / dışa taşan top değil).
//   4. Bakış yönünde (ARKit göz transform'unun z ekseni) KORNEA kabarıklığı:
//      ortalama göz ölçüleri (sklera r≈12 mm, kornea r≈7.8 mm, limbus r≈5.9 mm)
//      gözün kendi yarıçapına ölçeklenir → tepe ~1.1 mm öne çıkar. Kapak kenarına
//      yaklaştıkça söner (kabarıklık göz kapağını delmez; kenar köşeleri sabit).
//   5. Yeni köşeler de ekran izdüşümüyle UV alır (OBJExporter) → dolguya kişinin
//      o anki fotoğraftaki kendi gözü (iris dahil) kaplanır.
//
// Üçgen yönü: mevcut üçgendeki sınır kenarı a→b ise dolgu üçgeni b→a gezer;
// böylece normaller komşularla aynı yöne bakar (viewer'da siyah/ters yüz olmaz).

/// Kapatılan bir göz: dolgu köşeleri [firstVertex, firstVertex + vertexCount) aralığında.
/// Doku pişirme bu bilgiyle göz bölgesini (iris / göz akı) ayrı işler.
struct EyeCap {
    let center: SIMD3<Float>
    /// Bakış yönü (face-anchor uzayı, birim). Kornea ve iris bu eksende.
    let gaze: SIMD3<Float>
    /// Göz küresi yarıçapı (m)
    let radius: Float
    let firstVertex: Int
    let vertexCount: Int

    /// Ortalama gözde limbus (iris kenarı) yarıçapı / sklera yarıçapı = 5.9 / 12.
    static let limbusRatio: Float = 5.9 / 12
    static let corneaRatio: Float = 7.8 / 12

    func contains(vertex i: Int) -> Bool { i >= firstVertex && i < firstVertex + vertexCount }

    /// Bakış ekseniyle limbus arasındaki açının kosinüsü (bundan büyükse iris).
    var limbusCos: Float { sqrt(max(0, 1 - EyeCap.limbusRatio * EyeCap.limbusRatio)) }
}

enum EyeHoleFiller {

    /// İç halka sayısı (tepe hariç). 6 → kornea kabarıklığı için yeterli sık, üçgen sayısı küçük.
    private static let innerRings = 6
    /// Göz merkezinden en uzak kabul edilen halka merkezi (m). Ağız ~6 cm uzakta.
    private static let maxEyeLoopDistance: Float = 0.03
    /// Makul göz küresi yarıçapı aralığı (m) — dışındaysa yedek geometri.
    private static let radiusRange: ClosedRange<Float> = 0.006...0.02

    /// Göz transform'ları face-anchor yerel uzayındadır (köşelerle aynı uzay).
    static func fill(_ snapshot: MeshSnapshot,
                     leftEye: simd_float4x4,
                     rightEye: simd_float4x4) -> MeshSnapshot {
        fillEyes(snapshot, leftEye: leftEye, rightEye: rightEye).snapshot
    }

    /// Göz deliklerini kapatır ve kapatılan her gözün bilgisini döndürür.
    static func fillEyes(_ snapshot: MeshSnapshot,
                         leftEye: simd_float4x4,
                         rightEye: simd_float4x4) -> (snapshot: MeshSnapshot, caps: [EyeCap]) {
        let loops = boundaryLoops(snapshot.triangleIndices)
        guard loops.count >= 2 else { return (snapshot, []) }

        // Yüzün dış çevresi en uzun halkadır → aday dışı
        let outerIdx = loops.indices.max(by: { loops[$0].count < loops[$1].count })!
        var used = Set<Int>([outerIdx])

        var verts = snapshot.vertices
        var uvs = snapshot.textureCoordinates
        var tris = snapshot.triangleIndices
        var caps: [EyeCap] = []

        for eye in [leftEye, rightEye] {
            let eyeCenter = SIMD3<Float>(eye.columns.3.x, eye.columns.3.y, eye.columns.3.z)
            var best = -1
            var bestDist = Float.greatestFiniteMagnitude
            for (i, loop) in loops.enumerated() where !used.contains(i) {
                let d = simd_distance(centroid(loop, verts), eyeCenter)
                if d < bestDist { bestDist = d; best = i }
            }
            guard best >= 0, bestDist < maxEyeLoopDistance else { continue }
            used.insert(best)
            let first = verts.count
            let gazeAxis = SIMD3<Float>(eye.columns.2.x, eye.columns.2.y, eye.columns.2.z)
            if let cap = fillLoop(loops[best], eyeCenter: eyeCenter, gazeAxis: gazeAxis,
                                  verts: &verts, uvs: &uvs, tris: &tris) {
                caps.append(EyeCap(center: cap.center, gaze: cap.gaze, radius: cap.radius,
                                   firstVertex: first, vertexCount: verts.count - first))
            }
        }

        guard verts.count <= Int(Int16.max) else { return (snapshot, []) }
        return (MeshSnapshot(vertices: verts, textureCoordinates: uvs, triangleIndices: tris), caps)
    }

    /// Kornea yüzeyinin göz merkezinden `cosTheta` yönündeki uzaklığı (m), sklera
    /// yarıçapı `rs` için. Limbus dışında (cos < limbus) sklera yarıçapı döner.
    static func corneaDistance(cosTheta: Float, scleraRadius rs: Float) -> Float {
        let ri = EyeCap.limbusRatio * rs
        let rc = EyeCap.corneaRatio * rs
        let limbusCos = sqrt(max(0, 1 - EyeCap.limbusRatio * EyeCap.limbusRatio))
        guard cosTheta > limbusCos else { return rs }
        // Kornea küresinin merkezi bakış ekseninde, limbus çemberinden geçecek uzaklıkta
        let off = sqrt(rs * rs - ri * ri) - sqrt(rc * rc - ri * ri)
        let b = off * cosTheta
        let disc = b * b - off * off + rc * rc
        guard disc > 0 else { return rs }
        return max(rs, b + sqrt(disc))
    }

    // MARK: Halka dolgusu

    private static func fillLoop(_ loop: [Int],
                                 eyeCenter: SIMD3<Float>,
                                 gazeAxis: SIMD3<Float>,
                                 verts: inout [SIMD3<Float>],
                                 uvs: inout [SIMD2<Float>],
                                 tris: inout [Int16]) -> (center: SIMD3<Float>, gaze: SIMD3<Float>, radius: Float)? {
        let n = loop.count
        guard n >= 3 else { return nil }

        let rimCentroid = centroid(loop, verts)
        var center = eyeCenter
        var radius = loop.reduce(Float(0)) { $0 + simd_distance(verts[$1], eyeCenter) } / Float(n)
        var apexDir = rimCentroid - eyeCenter

        // Göz merkezi beklenmedik yerdeyse: kenarın 12 mm arkasında sanal küre
        if !radiusRange.contains(radius) || simd_length(apexDir) < 1e-5 {
            center = rimCentroid - SIMD3<Float>(0, 0, 0.012)
            radius = loop.reduce(Float(0)) { $0 + simd_distance(verts[$1], center) } / Float(n)
            apexDir = SIMD3<Float>(0, 0, 1)   // face-anchor +z = yüzden dışarı
        }
        apexDir = simd_normalize(apexDir)

        // Bakış ekseni: ARKit göz z ekseni dışarı bakmalı. Ters ise çevir; dolgu
        // yönünden çok sapıyorsa (yedek geometri / bozuk transform) dolgu yönü.
        var gaze = simd_length(gazeAxis) > 1e-5 ? simd_normalize(gazeAxis) : apexDir
        if simd_dot(gaze, apexDir) < 0 { gaze = -gaze }
        if simd_dot(gaze, apexDir) < 0.5 { gaze = apexDir }

        let hasUV = uvs.count == verts.count
        let rimUV: SIMD2<Float> = hasUV
            ? loop.reduce(SIMD2<Float>(0, 0)) { $0 + uvs[$1] } / Float(n)
            : .zero

        // Kenarın yumuşatılmış kopyası (döngüsel Laplace): iç halkalar kenarın
        // basamak/çentiklerini merkeze taşımasın (dolguda yıldız kıvrımı olmasın).
        var smoothRim = loop.map { verts[$0] }
        var smoothUV = hasUV ? loop.map { uvs[$0] } : []
        for _ in 0..<12 {
            smoothRim = (0..<n).map { i in
                smoothRim[i] * 0.5 + (smoothRim[(i + n - 1) % n] + smoothRim[(i + 1) % n]) * 0.25
            }
            if hasUV {
                smoothUV = (0..<n).map { i in
                    smoothUV[i] * 0.5 + (smoothUV[(i + n - 1) % n] + smoothUV[(i + 1) % n]) * 0.25
                }
            }
        }

        var prevRing = loop
        for k in 1...innerRings {
            let t = Float(k) / Float(innerRings + 1)
            let sm = smoothstep(0, 0.4, t)
            var ring: [Int] = []
            ring.reserveCapacity(n)
            for (li, vi) in loop.enumerated() {
                let rim = simd_mix(verts[vi], smoothRim[li], SIMD3<Float>(repeating: sm))
                let rimDir = simd_normalize(rim - center)
                let dir = simd_normalize(simd_mix(rimDir, apexDir, SIMD3<Float>(repeating: t)))
                let r = simd_mix(simd_distance(rim, center), radius, t)
                // Kornea kabarıklığı — kapak kenarına yakın halkalarda söner
                let bulge = corneaDistance(cosTheta: simd_dot(dir, gaze), scleraRadius: radius) - radius
                let fade = smoothstep(0, 0.45, t)
                ring.append(verts.count)
                verts.append(center + dir * (r + bulge * fade))
                if hasUV {
                    let rimTex = simd_mix(uvs[vi], smoothUV[li], SIMD2<Float>(repeating: sm))
                    uvs.append(simd_mix(rimTex, rimUV, SIMD2<Float>(repeating: t)))
                }
            }
            appendStrip(outer: prevRing, inner: ring, tris: &tris)
            prevRing = ring
        }

        let apex = verts.count
        let apexBulge = corneaDistance(cosTheta: simd_dot(apexDir, gaze), scleraRadius: radius) - radius
        verts.append(center + apexDir * (radius + apexBulge))
        if hasUV { uvs.append(rimUV) }
        for i in 0..<n {
            let j = (i + 1) % n
            tris.append(contentsOf: [Int16(prevRing[j]), Int16(prevRing[i]), Int16(apex)])
        }
        return (center, gaze, radius)
    }

    private static func smoothstep(_ e0: Float, _ e1: Float, _ x: Float) -> Float {
        let t = min(max((x - e0) / (e1 - e0), 0), 1)
        return t * t * (3 - 2 * t)
    }

    /// Dış halka kenarı o_i→o_{i+1} mevcut yüzeyle aynı yönde gezildiği için
    /// dolgu üçgenleri ters sırayla (o_{i+1}, o_i, …) kurulur.
    private static func appendStrip(outer: [Int], inner: [Int], tris: inout [Int16]) {
        let n = outer.count
        for i in 0..<n {
            let j = (i + 1) % n
            tris.append(contentsOf: [Int16(outer[j]), Int16(outer[i]), Int16(inner[i])])
            tris.append(contentsOf: [Int16(outer[j]), Int16(inner[i]), Int16(inner[j])])
        }
    }

    // MARK: Sınır halkaları

    /// Yalnız tek üçgende geçen kenarlar (yönlü, üçgendeki sırayla) → kapalı halkalar.
    static func boundaryLoops(_ indices: [Int16]) -> [[Int]] {
        struct Edge: Hashable { let a: Int; let b: Int }
        var count: [Edge: Int] = [:]
        var directed: [Edge] = []
        directed.reserveCapacity(indices.count)

        var i = 0
        while i + 2 < indices.count {
            let t = [Int(indices[i]), Int(indices[i + 1]), Int(indices[i + 2])]
            for k in 0..<3 {
                let a = t[k], b = t[(k + 1) % 3]
                directed.append(Edge(a: a, b: b))
                count[Edge(a: min(a, b), b: max(a, b)), default: 0] += 1
            }
            i += 3
        }

        var next: [Int: [Int]] = [:]
        for e in directed where count[Edge(a: min(e.a, e.b), b: max(e.a, e.b))] == 1 {
            next[e.a, default: []].append(e.b)
        }

        var loops: [[Int]] = []
        while let start = next.first(where: { !$0.value.isEmpty })?.key {
            var loop = [start]
            var cur = start
            var closed = false
            while loop.count <= indices.count {
                guard var outs = next[cur], !outs.isEmpty else { break }
                let nxt = outs.removeLast()
                next[cur] = outs
                if nxt == start { closed = true; break }
                loop.append(nxt)
                cur = nxt
            }
            if closed && loop.count >= 3 { loops.append(loop) }
            next = next.filter { !$0.value.isEmpty }
        }
        return loops
    }

    static func centroid(_ loop: [Int], _ verts: [SIMD3<Float>]) -> SIMD3<Float> {
        loop.reduce(SIMD3<Float>(0, 0, 0)) { $0 + verts[$1] } / Float(loop.count)
    }
}
