import Foundation
import UIKit
import simd

// OBJ (geometri + UV) + texture PNG → PLY (vertex renkli, TEK dosya).
//
// Neden: exocad/3Shape PLY okur, in-app three.js PLYLoader vertex renkleri
// gösterir (harici texture gerekmez → kırılma olmaz), ve tek dosya yönetimi kolay.
// Texture haritası yerine her vertex'e UV'sinden örneklenmiş renk gömülür.

enum PLYExporter {

    enum PLYError: LocalizedError {
        case objUnreadable
        case noVertices
        var errorDescription: String? {
            switch self {
            case .objUnreadable: return "OBJ okunamadı"
            case .noVertices:    return "Geometri boş"
            }
        }
    }

    /// objURL'deki mesh'i textureURL ile renklendirip plyURL'e ASCII PLY yazar.
    static func export(objURL: URL, textureURL: URL?, to plyURL: URL) throws {
        guard let objText = try? String(contentsOf: objURL, encoding: .utf8) else {
            throw PLYError.objUnreadable
        }

        var positions: [SIMD3<Float>] = []
        var texcoords: [SIMD2<Float>] = []
        var faces: [(Int, Int, Int)] = []                 // 0-based pozisyon index
        var uvIndexForPos: [Int: Int] = [:]               // pozisyon → texcoord index

        positions.reserveCapacity(60000)
        texcoords.reserveCapacity(60000)
        faces.reserveCapacity(120000)

        objText.enumerateLines { line, _ in
            if line.hasPrefix("v ") {
                let p = line.dropFirst(2).split(separator: " ")
                if p.count >= 3,
                   let x = Float(p[0]), let y = Float(p[1]), let z = Float(p[2]) {
                    positions.append(SIMD3<Float>(x, y, z))
                }
            } else if line.hasPrefix("vt ") {
                let p = line.dropFirst(3).split(separator: " ")
                if p.count >= 2, let u = Float(p[0]), let v = Float(p[1]) {
                    texcoords.append(SIMD2<Float>(u, v))
                }
            } else if line.hasPrefix("f ") {
                let verts = line.dropFirst(2).split(separator: " ")
                guard verts.count >= 3 else { return }
                func parse(_ tok: Substring) -> (Int, Int?) {
                    let comps = tok.split(separator: "/", omittingEmptySubsequences: false)
                    let vi = (Int(comps[0]) ?? 1) - 1
                    var ti: Int? = nil
                    if comps.count >= 2, let t = Int(comps[1]) { ti = t - 1 }
                    return (vi, ti)
                }
                // Fan triangulation (quad+ desteklenir)
                let parsed = verts.map { parse($0) }
                for i in 1..<(parsed.count - 1) {
                    let a = parsed[0], b = parsed[i], c = parsed[i + 1]
                    faces.append((a.0, b.0, c.0))
                    if let t = a.1, uvIndexForPos[a.0] == nil { uvIndexForPos[a.0] = t }
                    if let t = b.1, uvIndexForPos[b.0] == nil { uvIndexForPos[b.0] = t }
                    if let t = c.1, uvIndexForPos[c.0] == nil { uvIndexForPos[c.0] = t }
                }
            }
        }

        guard !positions.isEmpty else { throw PLYError.noVertices }

        // Texture pixel buffer
        let tex = loadTexture(textureURL)

        // Her vertex için renk
        var colors = [SIMD3<UInt8>](repeating: SIMD3<UInt8>(200, 200, 200), count: positions.count)
        if let tex = tex {
            for i in 0..<positions.count {
                if let ti = uvIndexForPos[i], ti < texcoords.count {
                    let uv = texcoords[ti]
                    colors[i] = sample(tex, u: uv.x, v: uv.y)
                }
            }
        }

        // ASCII PLY yaz
        var out = String()
        out.reserveCapacity(positions.count * 40 + faces.count * 16 + 256)
        out += "ply\n"
        out += "format ascii 1.0\n"
        out += "comment ar-scanner face scan (vertex-colored)\n"
        out += "element vertex \(positions.count)\n"
        out += "property float x\nproperty float y\nproperty float z\n"
        out += "property uchar red\nproperty uchar green\nproperty uchar blue\n"
        out += "element face \(faces.count)\n"
        out += "property list uchar int vertex_indices\n"
        out += "end_header\n"

        for i in 0..<positions.count {
            let p = positions[i], c = colors[i]
            out += "\(p.x) \(p.y) \(p.z) \(c.x) \(c.y) \(c.z)\n"
        }
        for f in faces {
            out += "3 \(f.0) \(f.1) \(f.2)\n"
        }

        try out.write(to: plyURL, atomically: true, encoding: .utf8)
    }

    // MARK: Texture sampling

    private struct Texture { let pixels: [UInt8]; let width: Int; let height: Int }

    private static func loadTexture(_ url: URL?) -> Texture? {
        guard let url = url,
              let img = UIImage(contentsOfFile: url.path)?.cgImage else { return nil }
        let width = img.width, height = img.height
        guard width > 0, height > 0 else { return nil }
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: &pixels, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4, space: cs,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: width, height: height))
        return Texture(pixels: pixels, width: width, height: height)
    }

    private static func sample(_ t: Texture, u: Float, v: Float) -> SIMD3<UInt8> {
        // OBJ V ekseni alt-üst ters → 1-v
        let uu = min(max(u, 0), 1)
        let vv = min(max(1 - v, 0), 1)
        let x = min(Int(uu * Float(t.width - 1)), t.width - 1)
        let y = min(Int(vv * Float(t.height - 1)), t.height - 1)
        let idx = (y * t.width + x) * 4
        return SIMD3<UInt8>(t.pixels[idx], t.pixels[idx + 1], t.pixels[idx + 2])
    }
}
