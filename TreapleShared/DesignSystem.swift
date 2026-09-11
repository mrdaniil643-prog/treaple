import SwiftUI
import UIKit

// MARK: - Палитра

/// Строго монохромная шкала. Цвета нет вовсе — ни акцентного, ни
/// семантического: иерархию держат плотность краски, вес шрифта и линии.
/// Оттенок пришлось бы заучивать, а плотность читается сразу.
enum Palette {

    // Чернила. В светлой теме это почти чёрный, в тёмной — почти белый:
    // чистые #000/#FFF на большой площади дают резь в глазах.
    static let ink = dynamic(light: 0x0A0A0A, dark: 0xFAFAFA)
    static let inkInverted = dynamic(light: 0xFFFFFF, dark: 0x0A0A0A)

    /// Акцент в монохроме — это и есть чернила.
    static var accent: Color { ink }

    // Полотно и поверхности. Карточка отделяется от фона тоном и волосяной
    // линией, а не тенью: тень — это мягкость, здесь она неуместна.
    static let canvas = dynamic(light: 0xF2F2F2, dark: 0x000000)
    static let surface = dynamic(light: 0xFFFFFF, dark: 0x0E0E0E)
    static let surfaceAlt = dynamic(light: 0xF7F7F7, dark: 0x161616)

    // Линии.
    static let line = dynamic(light: 0xE3E3E3, dark: 0x262626)
    static let lineStrong = dynamic(light: 0xC9C9C9, dark: 0x3C3C3C)

    // Текст.
    static let textPrimary = dynamic(light: 0x0A0A0A, dark: 0xFAFAFA)
    static let textSecondary = dynamic(light: 0x6B6B6B, dark: 0xA2A2A2)
    static let textTertiary = dynamic(light: 0x9C9C9C, dark: 0x6E6E6E)

    // Состояния остатка — те же чернила разной плотности.
    static let stockOK = textTertiary
    static let stockLow = ink
    static let stockOut = ink
    static let danger = ink
    static let info = textSecondary

    static func stock(_ state: StockState) -> Color {
        switch state {
        case .ok: textTertiary
        case .low, .out: ink
        }
    }

    /// Ступень серого для рангов — графики, списки категорий.
    /// Ранг 0 самый плотный, дальше светлее: порядок виден без подписей.
    static func tone(rank: Int, of total: Int) -> Color {
        guard total > 1 else { return ink }
        let step = min(Double(rank) / Double(total - 1), 1)
        return Color(uiColor: UIColor { traits in
            let dark = traits.userInterfaceStyle == .dark
            // Светлая тема темнеет от чёрного к серому, тёмная — от белого к серому.
            let value = dark ? (0.96 - step * 0.55) : (0.06 + step * 0.58)
            return UIColor(white: value, alpha: 1)
        })
    }

    private static func dynamic(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light)
        })
    }
}

private extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

// MARK: - Метрики

/// Радиусы сознательно мелкие: сильное скругление читается как «мягкое
/// дружелюбное приложение», мелкое — как точный инструмент.
enum Metrics {
    static let cardRadius: CGFloat = 14
    static let controlRadius: CGFloat = 10
    static let thumbRadius: CGFloat = 9

    static let hairline: CGFloat = 1

    static let gutter: CGFloat = 20
    static let cardPadding: CGFloat = 14
    static let cardSpacing: CGFloat = 10
    static let sectionSpacing: CGFloat = 30

    static let thumbSize: CGFloat = 50
}

// MARK: - Типографика

extension View {
    /// Микрозаголовок: капитель, разреженный трекинг, третичный тон.
    /// Именно он задаёт «выставочный» ритм — подписи не кричат, а маркируют.
    func microLabel(_ color: Color = Palette.textTertiary) -> some View {
        self
            .font(.system(size: 10, weight: .semibold))
            .tracking(1.1)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }

    /// Крупное число: плотный трекинг и табличные цифры, чтобы разряды
    /// не смещались при обновлении.
    func figure(size: CGFloat, weight: Font.Weight = .semibold) -> some View {
        self
            .font(.system(size: size, weight: weight))
            .tracking(-size * 0.025)
            .monospacedDigit()
    }
}

// MARK: - Поверхности

/// Карточка: плоская заливка и волосяная линия по контуру. Ни теней, ни
/// градиентов — глубина здесь создаётся разницей тонов и точностью линий.
struct CardSurface: ViewModifier {
    var radius: CGFloat = Metrics.cardRadius
    var padding: CGFloat = Metrics.cardPadding
    var elevated: Bool = false

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(shape.fill(elevated ? Palette.surfaceAlt : Palette.surface))
            .overlay {
                shape.strokeBorder(Palette.line, lineWidth: Metrics.hairline)
            }
    }
}

extension View {
    func cardSurface(
        radius: CGFloat = Metrics.cardRadius,
        padding: CGFloat = Metrics.cardPadding,
        elevated: Bool = false
    ) -> some View {
        modifier(CardSurface(radius: radius, padding: padding, elevated: elevated))
    }

    /// Убирает системные отступы и фон строки списка — чтобы карточки выглядели как карточки.
    func plainListRow(insets: EdgeInsets = EdgeInsets(top: 4, leading: Metrics.gutter, bottom: 4, trailing: Metrics.gutter)) -> some View {
        listRowInsets(insets)
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }

    /// Панель управления: плоская подложка с контуром, без стекла и размытия.
    func controlSurface(radius: CGFloat = Metrics.controlRadius) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return background(shape.fill(Palette.surface))
            .overlay { shape.strokeBorder(Palette.line, lineWidth: Metrics.hairline) }
    }
}

/// Волосяная линия. Системный `Divider` берёт собственный цвет и толщину —
/// здесь нужна ровно одна линия одного тона по всему приложению.
struct Hairline: View {
    var inset: CGFloat = 0

    var body: some View {
        Rectangle()
            .fill(Palette.line)
            .frame(height: Metrics.hairline)
            .padding(.leading, inset)
    }
}

/// Нажатие: лёгкое сжатие вместо мгновенной подсветки.
struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.97

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(Motion.snappy, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PressableStyle {
    static var pressable: PressableStyle { PressableStyle() }
}

// MARK: - Анимации

enum Motion {
    static let spring = Animation.spring(response: 0.34, dampingFraction: 0.86)
    static let snappy = Animation.spring(response: 0.22, dampingFraction: 0.82)
    static let gentle = Animation.spring(response: 0.7, dampingFraction: 0.92)
}
