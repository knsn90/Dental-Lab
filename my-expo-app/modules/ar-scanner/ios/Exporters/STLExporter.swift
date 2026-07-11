import Foundation
import simd

// OBJ mesh'i boyun altından keser (sadece kafa + üst boyun kalır).
// Yöntem: dikey eksen = en uzun bbox ekseni. Kafa ucu = dar uç (kafa omuzdan dardır).
// Boyun = kafa ile omuz arasındaki en DAR yatay kesit (genişlik yerel minimumu).
// O dilimden aşağısı (gövde) atılır. Texture/UV korunur (sadece f satırları filtrelenir).
enum OBJCropper {

    @discardableResult
    static func cropBelowNeck(objURL: URL) -> Bool {
        guard let text = try? String(contentsOf: objURL, encoding: .utf8) else { return false }
        let lines = text.components(separatedBy: "\n")

        var verts: [SIMD3<Float>] = []
        verts.reserveCapacity(20000)
        for line in lines where line.hasPrefix("v ") {
            let p = line.dropFirst(2).split(whereSeparator: { $0 == " " || $0 == "\t" })
            if p.count >= 3, let x = Float(p[0]), let y = Float(p[1]), let z = Float(p[2]) {
                verts.append(SIMD3<Float>(x, y, z))
            }
        }
        guard verts.count > 500 else { return false }

        var lo = verts[0], hi = verts[0]
        for v in verts { lo = simd_min(lo, v); hi = simd_max(hi, v) }
        let size = hi - lo
        let comps = [size.x, size.y, size.z]
        let va = comps.firstIndex(of: comps.max()!)!          // dikey eksen
        let others = [0, 1, 2].filter { $0 != va }
        func ax(_ v: SIMD3<Float>, _ i: Int) -> Float { i == 0 ? v.x : (i == 1 ? v.y : v.z) }
        let vmin = ax(lo, va), vmax = ax(hi, va)
        let vrange = vmax - vmin
        guard vrange > 0.0001 else { return false }

        let N = 24
        var minA = [Float](repeating: .greatestFiniteMagnitude, count: N)
        var maxA = [Float](repeating: -.greatestFiniteMagnitude, count: N)
        var minB = [Float](repeating: .greatestFiniteMagnitude, count: N)
        var maxB = [Float](repeating: -.greatestFiniteMagnitude, count: N)
        var cnt = [Int](repeating: 0, count: N)
        for v in verts {
            var s = Int((ax(v, va) - vmin) / vrange * Float(N))
            if s >= N { s = N - 1 }; if s < 0 { s = 0 }
            let a = ax(v, others[0]), b = ax(v, others[1])
            minA[s] = min(minA[s], a); maxA[s] = max(maxA[s], a)
            minB[s] = min(minB[s], b); maxB[s] = max(maxB[s], b)
            cnt[s] += 1
        }
        func width(_ s: Int) -> Float { cnt[s] == 0 ? 0 : max(maxA[s] - minA[s], maxB[s] - minB[s]) }
        func avgWidth(_ r: Range<Int>) -> Float {
            var sum: Float = 0, c = 0
            for i in r where cnt[i] > 0 { sum += width(i); c += 1 }
            return c > 0 ? sum / Float(c) : 0
        }
        // Kafa ucu = dar uç
        let lowW = avgWidth(0..<max(1, N / 5))                 // vmin tarafı
        let highW = avgWidth((N - N / 5)..<N)                  // vmax tarafı
        let headAtHigh = lowW > highW

        // Boyun: kafa tarafından [0.18,0.72] aralığında min genişlik dilimi
        let order: [Int] = headAtHigh ? Array((0..<N).reversed()) : Array(0..<N)
        var neckPos = -1; var neckW = Float.greatestFiniteMagnitude
        for k in 0..<N {
            let frac = Float(k) / Float(N)
            if frac < 0.18 || frac > 0.72 { continue }
            let s = order[k]
            let w = width(s)
            if w > 0 && w < neckW { neckW = w; neckPos = s }
        }
        guard neckPos >= 0 else { return false }

        var cutoff = vmin + (Float(neckPos) + 0.5) / Float(N) * vrange
        let margin = 0.04 * vrange   // biraz fazla boyun bırak
        cutoff += headAtHigh ? -margin : margin

        func keepFace(_ tokens: [Substring]) -> Bool {
            var sum: Float = 0, c = 0
            for t in tokens {
                let first = t.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false).first ?? t
                guard let raw = Int(first) else { continue }
                let idx = raw > 0 ? raw - 1 : verts.count + raw
                guard idx >= 0, idx < verts.count else { continue }
                sum += ax(verts[idx], va); c += 1
            }
            guard c > 0 else { return false }
            let avg = sum / Float(c)
            return headAtHigh ? (avg >= cutoff) : (avg <= cutoff)
        }

        var out: [String] = []
        out.reserveCapacity(lines.count)
        var keptFaces = 0, totalFaces = 0
        for line in lines {
            if line.hasPrefix("f ") {
                totalFaces += 1
                let toks = Array(line.dropFirst(2).split(whereSeparator: { $0 == " " || $0 == "\t" }))
                if keepFace(toks) { out.append(line); keptFaces += 1 }
            } else {
                out.append(line)
            }
        }
        // Güvenlik: çok agresif kestiyse (kafa da gitti) dokunma
        guard keptFaces > totalFaces / 12, totalFaces > 0 else { return false }

        let result = out.joined(separator: "\n")
        return (try? result.write(to: objURL, atomically: true, encoding: .utf8)) != nil
    }
}

enum STLExporter {

    static func ascii(from snapshot: MeshSnapshot, solidName: String = "face") -> Data {
        var lines: [String] = ["solid \(solidName)"]
        lines.reserveCapacity(snapshot.triangleCount * 7 + 2)

        var i = 0
        while i < snapshot.triangleIndices.count {
            let v0 = snapshot.vertices[Int(snapshot.triangleIndices[i])]
            let v1 = snapshot.vertices[Int(snapshot.triangleIndices[i + 1])]
            let v2 = snapshot.vertices[Int(snapshot.triangleIndices[i + 2])]
            let n = triangleNormal(v0, v1, v2)

            lines.append("facet normal \(n.x) \(n.y) \(n.z)")
            lines.append("\touter loop")
            lines.append("\t\tvertex \(v0.x) \(v0.y) \(v0.z)")
            lines.append("\t\tvertex \(v1.x) \(v1.y) \(v1.z)")
            lines.append("\t\tvertex \(v2.x) \(v2.y) \(v2.z)")
            lines.append("\tendloop")
            lines.append("endfacet")

            i += 3
        }

        lines.append("endsolid \(solidName)")
        return Data(lines.joined(separator: "\n").utf8)
    }

    static func binary(from snapshot: MeshSnapshot, header: String = "ar-scanner binary STL") -> Data {
        var data = Data(capacity: 84 + snapshot.triangleCount * 50)

        var headerBytes = [UInt8](repeating: 0, count: 80)
        let headerData = header.data(using: .ascii) ?? Data()
        for (idx, byte) in headerData.prefix(80).enumerated() {
            headerBytes[idx] = byte
        }
        data.append(contentsOf: headerBytes)

        var triangleCount = UInt32(snapshot.triangleCount).littleEndian
        withUnsafeBytes(of: &triangleCount) { data.append(contentsOf: $0) }

        var i = 0
        while i < snapshot.triangleIndices.count {
            let v0 = snapshot.vertices[Int(snapshot.triangleIndices[i])]
            let v1 = snapshot.vertices[Int(snapshot.triangleIndices[i + 1])]
            let v2 = snapshot.vertices[Int(snapshot.triangleIndices[i + 2])]
            let n = triangleNormal(v0, v1, v2)

            appendFloat(n.x, to: &data); appendFloat(n.y, to: &data); appendFloat(n.z, to: &data)
            appendFloat(v0.x, to: &data); appendFloat(v0.y, to: &data); appendFloat(v0.z, to: &data)
            appendFloat(v1.x, to: &data); appendFloat(v1.y, to: &data); appendFloat(v1.z, to: &data)
            appendFloat(v2.x, to: &data); appendFloat(v2.y, to: &data); appendFloat(v2.z, to: &data)

            var attr = UInt16(0).littleEndian
            withUnsafeBytes(of: &attr) { data.append(contentsOf: $0) }

            i += 3
        }

        return data
    }

    /// Bir OBJ dosyasını (photogrammetry çıktısı) binary STL'e çevirir.
    /// Geometri OBJ ile aynıdır (mevcut en yüksek çözünürlük). Texture içermez (STL doğası).
    static func binarySTLFromOBJ(objURL: URL, header: String = "ar-scanner facescan STL") -> Data? {
        guard let text = try? String(contentsOf: objURL, encoding: .utf8) else { return nil }

        var verts: [SIMD3<Float>] = []
        verts.reserveCapacity(20000)
        // Üçgen köşe indeksleri (0-based, verts'e işaret eder)
        var tris: [(Int, Int, Int)] = []
        tris.reserveCapacity(40000)

        func vertexIndex(_ token: Substring) -> Int? {
            // "v", "v/vt", "v/vt/vn", "v//vn" → ilk alan
            let first = token.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false).first ?? token
            guard let raw = Int(first) else { return nil }
            if raw > 0 { return raw - 1 }
            if raw < 0 { return verts.count + raw }   // negatif = göreli
            return nil
        }

        text.enumerateLines { line, _ in
            if line.hasPrefix("v ") {
                let p = line.dropFirst(2).split(whereSeparator: { $0 == " " || $0 == "\t" })
                if p.count >= 3, let x = Float(p[0]), let y = Float(p[1]), let z = Float(p[2]) {
                    verts.append(SIMD3<Float>(x, y, z))
                }
            } else if line.hasPrefix("f ") {
                let toks = line.dropFirst(2).split(whereSeparator: { $0 == " " || $0 == "\t" })
                let idx = toks.compactMap { vertexIndex($0) }
                guard idx.count >= 3 else { return }
                // Fan triangülasyonu
                for k in 1..<(idx.count - 1) {
                    tris.append((idx[0], idx[k], idx[k + 1]))
                }
            }
        }

        guard !tris.isEmpty else { return nil }

        var data = Data(capacity: 84 + tris.count * 50)
        var headerBytes = [UInt8](repeating: 0, count: 80)
        for (i, b) in (header.data(using: .ascii) ?? Data()).prefix(80).enumerated() { headerBytes[i] = b }
        data.append(contentsOf: headerBytes)

        var triCount = UInt32(tris.count).littleEndian
        withUnsafeBytes(of: &triCount) { data.append(contentsOf: $0) }

        let n = verts.count
        for (a, b, c) in tris {
            guard a >= 0, b >= 0, c >= 0, a < n, b < n, c < n else { continue }
            let v0 = verts[a], v1 = verts[b], v2 = verts[c]
            let nor = triangleNormal(v0, v1, v2)
            appendFloat(nor.x, to: &data); appendFloat(nor.y, to: &data); appendFloat(nor.z, to: &data)
            appendFloat(v0.x, to: &data); appendFloat(v0.y, to: &data); appendFloat(v0.z, to: &data)
            appendFloat(v1.x, to: &data); appendFloat(v1.y, to: &data); appendFloat(v1.z, to: &data)
            appendFloat(v2.x, to: &data); appendFloat(v2.y, to: &data); appendFloat(v2.z, to: &data)
            var attr = UInt16(0).littleEndian
            withUnsafeBytes(of: &attr) { data.append(contentsOf: $0) }
        }
        return data
    }

    private static func triangleNormal(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ c: SIMD3<Float>) -> SIMD3<Float> {
        let edge1 = b - a
        let edge2 = c - a
        let normal = simd_cross(edge1, edge2)
        let length = simd_length(normal)
        return length > 0 ? normal / length : SIMD3<Float>(0, 0, 0)
    }

    private static func appendFloat(_ value: Float, to data: inout Data) {
        var bits = value.bitPattern.littleEndian
        withUnsafeBytes(of: &bits) { data.append(contentsOf: $0) }
    }
}
