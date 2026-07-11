import SceneKit
import ARKit

protocol VirtualFaceContent: AnyObject {
    func update(withFaceAnchor anchor: ARFaceAnchor)
}

typealias VirtualFaceNode = VirtualFaceContent & SCNNode

final class FaceMeshNode: SCNNode, VirtualFaceContent {

    init(geometry: ARSCNFaceGeometry) {
        super.init()

        if let material = geometry.firstMaterial {
            material.diffuse.contents = UIColor.lightGray
            material.lightingModel = .physicallyBased
        }

        self.geometry = geometry
    }

    @available(*, unavailable)
    required init?(coder aDecoder: NSCoder) {
        fatalError("\(#function) has not been implemented")
    }

    func update(withFaceAnchor anchor: ARFaceAnchor) {
        guard let faceGeometry = geometry as? ARSCNFaceGeometry else { return }
        faceGeometry.update(from: anchor.geometry)
    }
}
