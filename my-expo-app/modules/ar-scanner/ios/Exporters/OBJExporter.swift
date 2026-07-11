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
