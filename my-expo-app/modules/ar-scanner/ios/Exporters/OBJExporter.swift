import Foundation
import UIKit
import ARKit
import simd

enum OBJExporter {

    struct Output {
        let obj: Data
        let mtl: Data?
        let texturePNG: Data?
        let materialName: String
    }

    static func textured(
        from snapshot: MeshSnapshot,
        faceAnchor: ARFaceAnchor,
        camera: ARCamera,
        viewportSize: CGSize,
        snapshotImage: UIImage,
        mtlFilename: String = "face.mtl",
        textureFilename: String = "face.png",
        materialName: String = "FaceMaterial"
    ) -> Output {
        let uvs = screenSpaceUVs(
            for: snapshot,
            faceAnchor: faceAnchor,
            camera: camera,
            viewportSize: viewportSize
        )

        let obj = composeOBJ(
            snapshot: snapshot,
            uvs: uvs,
            mtlFilename: mtlFilename,
            materialName: materialName
        )

        let mtl = composeMTL(materialName: materialName, textureFilename: textureFilename)
        let png = snapshotImage.pngData()

        return Output(obj: obj, mtl: mtl, texturePNG: png, materialName: materialName)
    }

    // MARK: Ön kamera — pişirilmiş dokulu yüz (OBJ + MTL + JPG, mm)

    struct TexturedFiles {
        let obj: URL
        let mtl: URL
        let texture: URL
    }

    /// Dokulu yüzü `dir` içine yazar: <base>.obj + <base>.mtl + <base>.jpg.
    /// Birim mm (PLY ile aynı uzay → CAD'de üst üste oturur). vt, dokunun alt-sol
    /// kökenli OBJ kuralına göre (1 − v) yazılır.
    static func writeTextured(_ baked: BakedFaceTexture, texture: CGImage, to dir: URL,
                              baseName: String = "face_scan", unitScale: Float = 1000) throws -> TexturedFiles {
        let objURL = dir.appendingPathComponent("\(baseName).obj")
        let mtlURL = dir.appendingPathComponent("\(baseName).mtl")
        let texURL = dir.appendingPathComponent("\(baseName).jpg")

        guard let jpg = UIImage(cgImage: texture).jpegData(compressionQuality: 0.9) else {
            throw NSError(domain: "OBJExporter", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Doku JPEG'e çevrilemedi"])
        }
        try jpg.write(to: texURL, options: .atomic)

        let mtl = [
            "# Siman face scan material",
            "newmtl FaceMaterial",
            "Ka 1.000 1.000 1.000",
            "Kd 1.000 1.000 1.000",
            "Ks 0.000 0.000 0.000",
            "d 1.0",
            "illum 1",
            "map_Kd \(texURL.lastPathComponent)",
            "",
        ].joined(separator: "\n")
        try Data(mtl.utf8).write(to: mtlURL, options: .atomic)

        let snap = baked.snapshot
        var out = "# Siman face scan (textured, mm)\nmtllib \(mtlURL.lastPathComponent)\no face\n"
        out.reserveCapacity(snap.vertices.count * 96 + snap.triangleIndices.count * 12)
        for v in snap.vertices {
            let p = v * unitScale
            out += "v \(p.x) \(p.y) \(p.z)\n"
        }
        for uv in baked.uvs {
            out += "vt \(uv.x) \(1 - uv.y)\n"
        }
        for n in baked.normals {
            out += "vn \(n.x) \(n.y) \(n.z)\n"
        }
        out += "usemtl FaceMaterial\ns 1\n"
        var i = 0
        let idx = snap.triangleIndices
        while i + 2 < idx.count {
            let a = Int(idx[i]) + 1, b = Int(idx[i + 1]) + 1, c = Int(idx[i + 2]) + 1
            out += "f \(a)/\(a)/\(a) \(b)/\(b)/\(b) \(c)/\(c)/\(c)\n"
            i += 3
        }
        try Data(out.utf8).write(to: objURL, options: .atomic)
        return TexturedFiles(obj: objURL, mtl: mtlURL, texture: texURL)
    }

    private static func composeOBJ(
        snapshot: MeshSnapshot,
        uvs: [SIMD2<Float>],
        mtlFilename: String,
        materialName: String
    ) -> Data {
        var lines: [String] = []
        lines.reserveCapacity(snapshot.vertices.count + snapshot.triangleCount + 8)

        lines.append("# ar-scanner OBJ export")
        lines.append("mtllib \(mtlFilename)")
        lines.append("o face")

        for v in snapshot.vertices {
            lines.append("v \(v.x) \(v.y) \(v.z)")
        }
        for uv in uvs {
            lines.append("vt \(uv.x) \(1 - uv.y)")
        }

        lines.append("usemtl \(materialName)")

        var i = 0
        while i < snapshot.triangleIndices.count {
            let a = Int(snapshot.triangleIndices[i]) + 1
            let b = Int(snapshot.triangleIndices[i + 1]) + 1
            let c = Int(snapshot.triangleIndices[i + 2]) + 1
            lines.append("f \(a)/\(a) \(b)/\(b) \(c)/\(c)")
            i += 3
        }

        return Data(lines.joined(separator: "\n").utf8)
    }

    private static func composeMTL(materialName: String, textureFilename: String) -> Data {
        let lines: [String] = [
            "# ar-scanner MTL export",
            "newmtl \(materialName)",
            "Ka 1.000 1.000 1.000",
            "Kd 1.000 1.000 1.000",
            "Ks 0.000 0.000 0.000",
            "d 1.0",
            "illum 1",
            "map_Kd \(textureFilename)"
        ]
        return Data(lines.joined(separator: "\n").utf8)
    }

    private static func screenSpaceUVs(
        for snapshot: MeshSnapshot,
        faceAnchor: ARFaceAnchor,
        camera: ARCamera,
        viewportSize: CGSize
    ) -> [SIMD2<Float>] {
        let anchorTransform = faceAnchor.transform
        var uvs: [SIMD2<Float>] = []
        uvs.reserveCapacity(snapshot.vertices.count)

        for vertex in snapshot.vertices {
            let local = SIMD4<Float>(vertex.x, vertex.y, vertex.z, 1)
            let world4 = anchorTransform * local
            let worldPoint = SIMD3<Float>(world4.x, world4.y, world4.z)

            let projected = camera.projectPoint(
                worldPoint,
                orientation: .portrait,
                viewportSize: viewportSize
            )

            let u = Float(projected.x / viewportSize.width)
            let v = Float(projected.y / viewportSize.height)
            uvs.append(SIMD2<Float>(u, v))
        }

        return uvs
    }
}
