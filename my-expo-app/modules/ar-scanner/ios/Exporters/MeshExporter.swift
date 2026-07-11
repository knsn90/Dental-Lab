import ARKit
import simd

struct MeshSnapshot {
    let vertices: [SIMD3<Float>]
    let textureCoordinates: [SIMD2<Float>]
    let triangleIndices: [Int16]

    init(faceGeometry: ARFaceGeometry) {
        self.vertices = faceGeometry.vertices
        self.textureCoordinates = faceGeometry.textureCoordinates
        self.triangleIndices = faceGeometry.triangleIndices
    }

    var triangleCount: Int { triangleIndices.count / 3 }
}
