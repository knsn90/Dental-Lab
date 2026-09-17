import UIKit

// Ön kamera rehberli taramanın minimal, animasyonlu arayüz parçaları.
// Kamera görüntüsü üstünde durdukları için her zaman koyu/cam dil kullanırlar.

// MARK: - Adım göstergesi

/// Üç düğüm + aralarında ince çizgi.
///   bekleyen → küçük soluk nokta
///   aktif    → beyaz nokta + nefes alan hale + sabit durdukça dolan halka
///   tamam    → accent dolgu + onay işareti (yaylı büyüme), çizgi ilerler
final class ScanStepIndicator: UIView {

    private enum NodeState: Equatable { case pending, active, done }

    private let titles: [String]
    private let accent: UIColor
    private let spacing: CGFloat = 78
    private let edgeInset: CGFloat = 24
    private let nodeSize: CGFloat = 20

    private let track = CAShapeLayer()
    private let progress = CAShapeLayer()
    private var nodes: [UIView] = []
    private var halos: [CAShapeLayer] = []
    private var holdRings: [CAShapeLayer] = []
    private var checks: [UIImageView] = []
    private var labels: [UILabel] = []
    private var states: [NodeState?]
    private var completedCount = -1

    init(titles: [String], accent: UIColor) {
        self.titles = titles
        self.accent = accent
        self.states = Array(repeating: nil, count: titles.count)
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        setup()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override var intrinsicContentSize: CGSize {
        CGSize(width: spacing * CGFloat(titles.count - 1) + edgeInset * 2, height: 48)
    }

    private func center(_ i: Int) -> CGPoint {
        CGPoint(x: edgeInset + CGFloat(i) * spacing, y: 16)
    }

    private func setup() {
        for layer in [track, progress] {
            layer.fillColor = UIColor.clear.cgColor
            layer.lineWidth = 2
            layer.lineCap = .round
            self.layer.addSublayer(layer)
        }
        track.strokeColor = UIColor.white.withAlphaComponent(0.18).cgColor
        progress.strokeColor = accent.cgColor
        progress.strokeEnd = 0

        for title in titles {
            let halo = CAShapeLayer()
            halo.fillColor = UIColor.white.withAlphaComponent(0.35).cgColor
            halo.opacity = 0
            layer.addSublayer(halo)
            halos.append(halo)

            let ring = CAShapeLayer()
            ring.fillColor = UIColor.clear.cgColor
            ring.strokeColor = accent.cgColor
            ring.lineWidth = 2
            ring.lineCap = .round
            ring.strokeEnd = 0
            layer.addSublayer(ring)
            holdRings.append(ring)

            let node = UIView()
            node.layer.cornerRadius = nodeSize / 2
            node.bounds = CGRect(x: 0, y: 0, width: nodeSize, height: nodeSize)
            addSubview(node)
            nodes.append(node)

            let check = UIImageView(image: UIImage(systemName: "checkmark",
                withConfiguration: UIImage.SymbolConfiguration(pointSize: 9, weight: .heavy)))
            check.tintColor = .black
            check.alpha = 0
            node.addSubview(check)
            checks.append(check)

            let label = UILabel()
            label.text = title
            label.font = .systemFont(ofSize: 11, weight: .semibold)
            label.textAlignment = .center
            addSubview(label)
            labels.append(label)
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let gap: CGFloat = 16
        let path = UIBezierPath()
        for i in 0..<(titles.count - 1) {
            path.move(to: CGPoint(x: center(i).x + gap, y: center(i).y))
            path.addLine(to: CGPoint(x: center(i + 1).x - gap, y: center(i + 1).y))
        }
        track.path = path.cgPath
        progress.path = path.cgPath

        for i in titles.indices {
            let c = center(i)
            nodes[i].center = c
            checks[i].center = CGPoint(x: nodeSize / 2, y: nodeSize / 2)
            let haloRect = CGRect(x: -nodeSize / 2, y: -nodeSize / 2, width: nodeSize, height: nodeSize)
            halos[i].bounds = haloRect
            halos[i].position = c
            halos[i].path = UIBezierPath(ovalIn: haloRect).cgPath
            let r: CGFloat = 15
            holdRings[i].bounds = CGRect(x: -r, y: -r, width: r * 2, height: r * 2)
            holdRings[i].position = c
            holdRings[i].path = UIBezierPath(arcCenter: .zero, radius: r, startAngle: -.pi / 2,
                                             endAngle: .pi * 1.5, clockwise: true).cgPath
            labels[i].frame = CGRect(x: c.x - spacing / 2, y: 32, width: spacing, height: 16)
        }
    }

    /// completed: yakalanan poz sayısı · current: aktif poz (nil = yok)
    func update(completed: Int, current: Int?) {
        for i in titles.indices {
            let state: NodeState = i < completed ? .done : (i == current ? .active : .pending)
            guard states[i] != state else { continue }
            let first = states[i] == nil
            states[i] = state
            apply(state, at: i, animated: !first)
        }
        if completed != completedCount {
            completedCount = completed
            let end = CGFloat(min(max(completed - 1, 0), titles.count - 1)) / CGFloat(titles.count - 1)
            let anim = CABasicAnimation(keyPath: "strokeEnd")
            anim.fromValue = progress.presentation()?.strokeEnd ?? progress.strokeEnd
            anim.toValue = end
            anim.duration = 0.45
            anim.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            progress.strokeEnd = end
            progress.add(anim, forKey: "progress")
        }
    }

    /// Aktif düğümün çevresindeki "sabit dur" halkası (0…1)
    func setHoldProgress(_ value: CGFloat) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        for (i, ring) in holdRings.enumerated() {
            let active = states[i] == .active
            ring.strokeEnd = active ? min(max(value, 0), 1) : 0
            ring.opacity = active && value > 0 ? 1 : 0
        }
        CATransaction.commit()
    }

    private func apply(_ state: NodeState, at i: Int, animated: Bool) {
        let node = nodes[i], check = checks[i], label = labels[i], halo = halos[i]
        let changes = {
            switch state {
            case .pending:
                node.backgroundColor = UIColor.white.withAlphaComponent(0.28)
                node.transform = CGAffineTransform(scaleX: 0.45, y: 0.45)
                check.alpha = 0
                label.textColor = UIColor.white.withAlphaComponent(0.45)
            case .active:
                node.backgroundColor = .white
                node.transform = CGAffineTransform(scaleX: 0.6, y: 0.6)
                check.alpha = 0
                label.textColor = .white
            case .done:
                node.backgroundColor = self.accent
                node.transform = .identity
                check.alpha = 1
                label.textColor = UIColor.white.withAlphaComponent(0.75)
            }
        }
        if animated {
            UIView.animate(withDuration: 0.5, delay: 0, usingSpringWithDamping: 0.62,
                           initialSpringVelocity: 0.8, options: [.allowUserInteraction], animations: changes)
        } else {
            changes()
        }

        halo.removeAllAnimations()
        if state == .active {
            let scale = CABasicAnimation(keyPath: "transform.scale")
            scale.fromValue = 0.6
            scale.toValue = 2.0
            let fade = CABasicAnimation(keyPath: "opacity")
            fade.fromValue = 0.9
            fade.toValue = 0
            let group = CAAnimationGroup()
            group.animations = [scale, fade]
            group.duration = 1.5
            group.repeatCount = .infinity
            group.timingFunction = CAMediaTimingFunction(name: .easeOut)
            halo.add(group, forKey: "breathe")
        }
    }
}

// MARK: - Yön işareti

/// Başın çevrileceği yönü gösteren, kayarak nefes alan ince chevron'lar.
final class ScanDirectionCue: UIView {

    enum Mode { case none, both, left, right }

    private let leftArrow = UIImageView()
    private let rightArrow = UIImageView()
    private var mode: Mode = .none

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        let config = UIImage.SymbolConfiguration(pointSize: 40, weight: .light)
        leftArrow.image = UIImage(systemName: "chevron.compact.left", withConfiguration: config)
        rightArrow.image = UIImage(systemName: "chevron.compact.right", withConfiguration: config)
        for arrow in [leftArrow, rightArrow] {
            arrow.tintColor = .white
            arrow.alpha = 0
            arrow.translatesAutoresizingMaskIntoConstraints = false
            addSubview(arrow)
        }
        NSLayoutConstraint.activate([
            leftArrow.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 20),
            leftArrow.centerYAnchor.constraint(equalTo: centerYAnchor),
            rightArrow.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -20),
            rightArrow.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    func setMode(_ newMode: Mode) {
        guard newMode != mode else { return }
        mode = newMode
        let showLeft = newMode == .both || newMode == .left
        let showRight = newMode == .both || newMode == .right
        UIView.animate(withDuration: 0.3) {
            self.leftArrow.alpha = showLeft ? 0.9 : 0
            self.rightArrow.alpha = showRight ? 0.9 : 0
        }
        slide(leftArrow, by: -12, active: showLeft)
        slide(rightArrow, by: 12, active: showRight)
    }

    private func slide(_ view: UIView, by dx: CGFloat, active: Bool) {
        view.layer.removeAnimation(forKey: "slide")
        guard active else { return }
        let move = CABasicAnimation(keyPath: "transform.translation.x")
        move.fromValue = 0
        move.toValue = dx
        let fade = CABasicAnimation(keyPath: "opacity")
        fade.fromValue = 1
        fade.toValue = 0.3
        let group = CAAnimationGroup()
        group.animations = [move, fade]
        group.duration = 0.8
        group.autoreverses = true
        group.repeatCount = .infinity
        group.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        view.layer.add(group, forKey: "slide")
    }
}

// MARK: - Yönerge hapı

/// Cam zeminli tek satır yönerge; metin değişince yumuşak geçiş.
final class ScanHintPill: UIView {

    private let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    private let label = UILabel()
    private var isWarning = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        blur.translatesAutoresizingMaskIntoConstraints = false
        blur.clipsToBounds = true
        addSubview(blur)
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .systemFont(ofSize: 15, weight: .semibold)
        label.textColor = .white
        label.textAlignment = .center
        label.numberOfLines = 2
        addSubview(label)
        NSLayoutConstraint.activate([
            blur.topAnchor.constraint(equalTo: topAnchor),
            blur.bottomAnchor.constraint(equalTo: bottomAnchor),
            blur.leadingAnchor.constraint(equalTo: leadingAnchor),
            blur.trailingAnchor.constraint(equalTo: trailingAnchor),
            label.topAnchor.constraint(equalTo: topAnchor, constant: 10),
            label.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -10),
            label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 18),
            label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -18),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        blur.layer.cornerRadius = min(bounds.height / 2, 22)
    }

    func set(_ text: String, warn: Bool = false) {
        guard text != label.text || warn != isWarning else { return }
        isWarning = warn
        UIView.transition(with: label, duration: 0.22, options: .transitionCrossDissolve) {
            self.label.text = text
            self.label.textColor = warn ? UIColor.systemOrange : .white
        }
    }
}
