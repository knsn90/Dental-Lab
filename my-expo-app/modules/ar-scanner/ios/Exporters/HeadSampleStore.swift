import Foundation
import CoreGraphics
import CoreVideo
import CoreMotion
import ImageIO
import simd
#if canImport(RealityKit)
import RealityKit
#endif

// Tam kafa taraması kare deposu — her çekim diske yazılır, fotogrametriye
// TEMBEL bir dizi olarak verilir (bellekte aynı anda tek kare).
//
// Kare başına: shot_NNNN.jpg (ham sensör yönü, yatay) · .depth (Float32, m)
// · .mask (UInt8, derinlik çözünürlüğü) · .json (poz, iç parametre, yerçekimi).

struct HeadShotMeta: Codable {
    let id: Int
    let imageWidth: Int
    let imageHeight: Int
    let depthWidth: Int
    let depthHeight: Int
    /// Görüntü çözünürlüğünde iç parametreler (px)
    let fx: Float, fy: Float, cx: Float, cy: Float
    /// ARKit kamera → dünya (sütun-öncelikli 16 değer)
    let cameraToWorld: [Float]
    /// CoreMotion cihaz ekseninde yerçekimi (g)
    let gravity: [Double]
    /// Derinlik aynı karenin mi? (yüksek çözünürlüklü kare ayrı anda gelebilir; hizasız
    /// derinlik fotogrametriye verilmez, yalnız maske için kullanılır)
    var depthAligned: Bool = true

    var transform: simd_float4x4 {
        let c = cameraToWorld
        return simd_float4x4(SIMD4<Float>(c[0], c[1], c[2], c[3]),
                             SIMD4<Float>(c[4], c[5], c[6], c[7]),
                             SIMD4<Float>(c[8], c[9], c[10], c[11]),
                             SIMD4<Float>(c[12], c[13], c[14], c[15]))
    }
    var cameraCenter: SIMD3<Float> { SIMD3<Float>(cameraToWorld[12], cameraToWorld[13], cameraToWorld[14]) }

    static func flatten(_ m: simd_float4x4) -> [Float] {
        [m.columns.0.x, m.columns.0.y, m.columns.0.z, m.columns.0.w,
         m.columns.1.x, m.columns.1.y, m.columns.1.z, m.columns.1.w,
         m.columns.2.x, m.columns.2.y, m.columns.2.z, m.columns.2.w,
         m.columns.3.x, m.columns.3.y, m.columns.3.z, m.columns.3.w]
    }
}

final class HeadSampleStore {
    let dir: URL
    private(set) var metas: [HeadShotMeta] = []
    private let lock = NSLock()

    init(dir: URL) {
        self.dir = dir
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    var count: Int { lock.lock(); defer { lock.unlock() }; return metas.count }

    private func base(_ id: Int) -> URL { dir.appendingPathComponent(String(format: "shot_%04d", id)) }

    /// Bir çekimi diske yazar. JPEG çağıran tarafından kodlanır (iOS: CIContext).
    func save(jpeg: Data, depth: DepthMap, mask: [UInt8], meta: HeadShotMeta) throws {
        let b = base(meta.id)
        try jpeg.write(to: b.appendingPathExtension("jpg"))
        try depth.values.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: b.appendingPathExtension("depth"))
        try Data(mask).write(to: b.appendingPathExtension("mask"))
        try JSONEncoder().encode(meta).write(to: b.appendingPathExtension("json"))
        lock.lock(); metas.append(meta); lock.unlock()
    }

    /// Diskteki çekimleri yeniden okur (yarıda kalan taramayı sürdürme / test).
    func reloadFromDisk() {
        let files = ((try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? [])
            .filter { $0.hasPrefix("shot_") && $0.hasSuffix(".json") }.sorted()
        let loaded = files.compactMap { f -> HeadShotMeta? in
            guard let d = try? Data(contentsOf: dir.appendingPathComponent(f)) else { return nil }
            return try? JSONDecoder().decode(HeadShotMeta.self, from: d)
        }
        lock.lock(); metas = loaded; lock.unlock()
    }

    // MARK: Okuma

    func loadDepth(_ m: HeadShotMeta) -> [Float]? {
        guard let d = try? Data(contentsOf: base(m.id).appendingPathExtension("depth")),
              d.count == m.depthWidth * m.depthHeight * 4 else { return nil }
        return d.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
    }

    func loadMask(_ m: HeadShotMeta) -> [UInt8]? {
        guard let d = try? Data(contentsOf: base(m.id).appendingPathExtension("mask")),
              d.count == m.depthWidth * m.depthHeight else { return nil }
        return [UInt8](d)
    }

    func loadImage(_ m: HeadShotMeta) -> CGImage? {
        let url = base(m.id).appendingPathExtension("jpg") as CFURL
        guard let src = CGImageSourceCreateWithURL(url, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(src, 0, nil)
    }

    // MARK: Piksel tamponları

    static func bgraBuffer(from image: CGImage) -> CVPixelBuffer? {
        let w = image.width, h = image.height
        var pb: CVPixelBuffer?
        let attrs: [CFString: Any] = [kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
                                      kCVPixelBufferCGImageCompatibilityKey: true,
                                      kCVPixelBufferCGBitmapContextCompatibilityKey: true]
        guard CVPixelBufferCreate(kCFAllocatorDefault, w, h, kCVPixelFormatType_32BGRA,
                                  attrs as CFDictionary, &pb) == kCVReturnSuccess, let buf = pb else { return nil }
        CVPixelBufferLockBaseAddress(buf, [])
        defer { CVPixelBufferUnlockBaseAddress(buf, []) }
        guard let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: w, height: h,
                                  bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buf),
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
                                    | CGBitmapInfo.byteOrder32Little.rawValue) else { return nil }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        return buf
    }

    static func depthBuffer(_ values: [Float], width w: Int, height h: Int) -> CVPixelBuffer? {
        var pb: CVPixelBuffer?
        let attrs: [CFString: Any] = [kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary]
        guard CVPixelBufferCreate(kCFAllocatorDefault, w, h, kCVPixelFormatType_DepthFloat32,
                                  attrs as CFDictionary, &pb) == kCVReturnSuccess, let buf = pb else { return nil }
        CVPixelBufferLockBaseAddress(buf, [])
        defer { CVPixelBufferUnlockBaseAddress(buf, []) }
        let row = CVPixelBufferGetBytesPerRow(buf)
        let base = CVPixelBufferGetBaseAddress(buf)!
        values.withUnsafeBufferPointer { src in
            for y in 0..<h {
                let dst = (base + y * row).assumingMemoryBound(to: Float.self)
                for x in 0..<w {
                    let d = src[y * w + x]
                    dst[x] = d.isFinite && d > 0 ? d : 0
                }
            }
        }
        return buf
    }

    /// Derinlik çözünürlüğündeki maskeyi görüntü çözünürlüğüne (en yakın komşu) büyütür.
    static func maskBuffer(_ mask: [UInt8], width mw: Int, height mh: Int,
                           outWidth w: Int, outHeight h: Int) -> CVPixelBuffer? {
        var pb: CVPixelBuffer?
        let attrs: [CFString: Any] = [kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary]
        guard CVPixelBufferCreate(kCFAllocatorDefault, w, h, kCVPixelFormatType_OneComponent8,
                                  attrs as CFDictionary, &pb) == kCVReturnSuccess, let buf = pb else { return nil }
        CVPixelBufferLockBaseAddress(buf, [])
        defer { CVPixelBufferUnlockBaseAddress(buf, []) }
        let row = CVPixelBufferGetBytesPerRow(buf)
        let base = CVPixelBufferGetBaseAddress(buf)!.assumingMemoryBound(to: UInt8.self)
        var xs = [Int](repeating: 0, count: w)
        for x in 0..<w { xs[x] = min(mw - 1, x * mw / w) }
        mask.withUnsafeBufferPointer { src in
            for y in 0..<h {
                let sy = min(mh - 1, y * mh / h)
                let dst = base + y * row
                let srow = sy * mw
                for x in 0..<w { dst[x] = src[srow + xs[x]] }
            }
        }
        return buf
    }

    /// Fotogrametriye kamera odağını EXIF olarak bildirir (35 mm eşdeğeri, köşegen tabanlı).
    static func exifMetadata(_ m: HeadShotMeta) -> [String: Any] {
        let diag = (Float(m.imageWidth * m.imageWidth + m.imageHeight * m.imageHeight)).squareRoot()
        let f35 = Double(m.fx * 43.2666 / diag)
        return [
            kCGImagePropertyExifDictionary as String: [
                kCGImagePropertyExifFocalLenIn35mmFilm as String: Int(f35.rounded()),
                kCGImagePropertyExifPixelXDimension as String: m.imageWidth,
                kCGImagePropertyExifPixelYDimension as String: m.imageHeight,
            ] as [String: Any],
            kCGImagePropertyTIFFDictionary as String: [
                kCGImagePropertyTIFFMake as String: "Apple",
            ] as [String: Any],
        ]
    }
}

#if canImport(RealityKit)
/// Fotogrametri girişi: kareleri sırayla diskten okur (tembel).
@available(iOS 17.0, macOS 14.0, *)
struct HeadSampleSequence: Sequence {
    let store: HeadSampleStore
    let metas: [HeadShotMeta]
    var useDepth = true
    var useMask = true
    /// Mac testinde yerçekimi (doğru, yanlış ya da hiç) sonucu değiştirmedi; hizalamayı
    /// poz uyumu yapıyor. Doğrulanamayan girdi verilmesin diye kapalı (meta'da saklanır).
    var useGravity = false

    func makeIterator() -> AnyIterator<PhotogrammetrySample> {
        var i = 0
        return AnyIterator {
            while i < metas.count {
                let m = metas[i]; i += 1
                guard let cg = store.loadImage(m), let img = HeadSampleStore.bgraBuffer(from: cg) else { continue }
                var s = PhotogrammetrySample(id: m.id, image: img)
                s.metadata = HeadSampleStore.exifMetadata(m)
                if useDepth, m.depthAligned, let d = store.loadDepth(m) {
                    s.depthDataMap = HeadSampleStore.depthBuffer(d, width: m.depthWidth, height: m.depthHeight)
                }
                if useMask, let mk = store.loadMask(m) {
                    s.objectMask = HeadSampleStore.maskBuffer(mk, width: m.depthWidth, height: m.depthHeight,
                                                              outWidth: m.imageWidth, outHeight: m.imageHeight)
                }
                if useGravity, m.gravity.count == 3 {
                    s.gravity = CMAcceleration(x: m.gravity[0], y: m.gravity[1], z: m.gravity[2])
                }
                return s
            }
            return nil
        }
    }
}
#endif
