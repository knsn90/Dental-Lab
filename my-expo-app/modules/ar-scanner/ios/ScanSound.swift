import AVFoundation

// Taramanın sesli rehberi.
//
// Ağız içi tarayıcılardaki mantık: veri alınırken yumuşak bir ezgi döner, alınamıyorken
// (mesafe aralık dışı, çok hızlı hareket, baş kadrajda değil) ezgi kısılıp susar ve düzelince
// kaldığı yerden sürer. Operatör ekrana bakmadan taramanın yürüdüğünü duyar.
//
// Ses dosyası yok; ezgi burada üretilir (yumuşak, çabuk sönen notalar). Telefonun sessiz
// anahtarı açık olsa da çalar — klinikte telefonlar çoğunlukla sessizdedir; kapatmak için
// ekranda düğme var.

final class ScanSound {
    /// Ezgi (Hz) — re majör pentatonik, 16 nota, her biri 0,42 sn (≈ 6,7 sn'lik döngü).
    private static let melody: [Float] = [
        293.66, 440.00, 369.99, 493.88, 440.00, 329.63, 369.99, 293.66,
        329.63, 440.00, 493.88, 587.33, 493.88, 440.00, 369.99, 329.63,
    ]
    private static let noteSeconds: Float = 0.42
    /// Onay sesi: yükselen iki nota.
    private static let chimeNotes: [Float] = [880.00, 1174.66]

    private let engine = AVAudioEngine()
    private var source: AVAudioSourceNode?
    private var running = false

    // Çalma durumu — yalnız ses iş parçacığı yazar (hedefler ana iş parçacığından tek değer olarak verilir).
    private var sampleRate: Float = 44_100
    private var noteIndex = 0
    private var noteSample = 0
    private var phase: Float = 0
    private var gain: Float = 0
    private var chimeSample = -1
    private var chimePhase: Float = 0
    private var shotSample = -1
    private var shotPhase: Float = 0
    private var shotFreq: Float = 880

    // Ana iş parçacığından verilen hedefler
    private var targetGain: Float = 0
    private var chimeRequested = false
    private var shotRequested = false
    var muted = false { didSet { if muted { targetGain = 0 } } }

    func start() {
        guard !running else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? session.setActive(true)

        let format = engine.outputNode.inputFormat(forBus: 0)
        sampleRate = Float(format.sampleRate > 0 ? format.sampleRate : 44_100)
        guard let mono = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1) else { return }
        let node = AVAudioSourceNode { [unowned self] _, _, frameCount, audioBufferList -> OSStatus in
            let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
            guard let out = buffers.first?.mData?.assumingMemoryBound(to: Float.self) else { return noErr }
            for i in 0..<Int(frameCount) { out[i] = self.nextSample() }
            for b in buffers.dropFirst() {
                if let p = b.mData?.assumingMemoryBound(to: Float.self) { for i in 0..<Int(frameCount) { p[i] = out[i] } }
            }
            return noErr
        }
        engine.attach(node)
        engine.connect(node, to: engine.mainMixerNode, format: mono)
        source = node
        do { try engine.start(); running = true } catch { running = false }
    }

    /// Ezgi çalsın mı (veri alınıyor mu).
    func setActive(_ on: Bool) {
        let g: Float = (on && !muted) ? 1 : 0
        if targetGain != g { targetGain = g }
    }

    /// Bölüm tamamlandı onayı.
    func chime() { if !muted { chimeRequested = true } }

    /// Kare çekildi: ezgide o an çalan notanın bir oktav üstünde kısa, yumuşak bir tık.
    func shot() { if !muted { shotRequested = true } }

    func stop() {
        guard running else { return }
        running = false
        engine.stop()
        if let source { engine.detach(source) }
        source = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    // MARK: Üretim (ses iş parçacığı)

    @inline(__always) private func nextSample() -> Float {
        // Ses düzeyi ~120 ms'de hedefe yaklaşır → aç/kapa tıkırtısız
        gain += (targetGain - gain) * (1 / (0.12 * sampleRate))
        var out: Float = 0

        if gain > 0.0005 {
            let noteLen = Int(Self.noteSeconds * sampleRate)
            if noteSample >= noteLen {
                noteSample = 0
                noteIndex = (noteIndex + 1) % Self.melody.count
            }
            let t = Float(noteSample) / sampleRate
            // Yumuşak vuruş: 12 ms'de açılır, üstel söner
            let env = min(t / 0.012, 1) * expf(-t * 4.2)
            phase += 2 * .pi * Self.melody[noteIndex] / sampleRate
            if phase > 2 * .pi { phase -= 2 * .pi }
            out += (sinf(phase) + 0.18 * sinf(2 * phase)) * env * gain * 0.20
            noteSample += 1      // ezgi yalnız duyulurken ilerler → kaldığı yerden sürer
        }

        if shotRequested {
            shotRequested = false; shotSample = 0; shotPhase = 0
            shotFreq = Self.melody[noteIndex] * 2      // ezgiyle aynı tonda kalır
        }
        if shotSample >= 0 {
            let t = Float(shotSample) / sampleRate
            if t > 0.14 {
                shotSample = -1
            } else {
                let env = min(t / 0.004, 1) * expf(-t * 34)
                shotPhase += 2 * .pi * shotFreq / sampleRate
                if shotPhase > 2 * .pi { shotPhase -= 2 * .pi }
                out += sinf(shotPhase) * env * 0.16
                shotSample += 1
            }
        }

        if chimeRequested { chimeRequested = false; chimeSample = 0; chimePhase = 0 }
        if chimeSample >= 0 {
            let per = Int(0.16 * sampleRate)
            let k = chimeSample / per
            if k >= Self.chimeNotes.count + 2 {
                chimeSample = -1
            } else {
                let n = min(k, Self.chimeNotes.count - 1)
                let t = Float(chimeSample - n * per) / sampleRate
                let env = min(t / 0.006, 1) * expf(-t * 6)
                chimePhase += 2 * .pi * Self.chimeNotes[n] / sampleRate
                if chimePhase > 2 * .pi { chimePhase -= 2 * .pi }
                out += sinf(chimePhase) * env * 0.22
                chimeSample += 1
            }
        }
        return out
    }
}
