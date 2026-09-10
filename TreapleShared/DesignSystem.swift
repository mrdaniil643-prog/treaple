import SwiftUI
import UIKit

// MARK: - Палитра

/// Цвета приложения. Все оттенки адаптивные: собираются через `UIColor` с
/// динамическим провайдером, поэтому корректно переключаются между темами
/// и не требуют дублирования в каталоге ассетов.
enum Palette {

    // Акцент — чернильный индиго. Семантические зелёный/янтарный/серый
    // остаются читаемыми рядом с ним и не сливаются с брендовым цветом.
    static let accent = dynamic(light: 0x4338CA, dark: 0x8B8AF5)
    static let accentSoft = dynamic(light: 0xEEEDFB, dark: 0x252248)

    // Поверхности: тёплый нейтральный фон, карточки чуть светлее фона.
    static let canvas = dynamic(light: 0xF6F5F3, dark: 0x0E0E12)
    static let surface = dynamic(light: 0xFFFFFF, dark: 0x1A1A21)
    static let surfaceElevated = dynamic(light: 0xFFFFFF, dark: 0x22222B)
    static let separator = dynamic(light: 0xE7E4DF, dark: 0x2E2E38)

    // Текст.
    static let textPrimary = dynamic(light: 0x1A1A1F, dark: 0xF2F1EF)
    static let textSecondary = dynamic(light: 0x6B6B75, dark: 0x9C9CA8)
    static let textTertiary = dynamic(light: 0x9B9BA5, dark: 0x6E6E7A)

    // Семантика остатков.
    static let stockOK = dynamic(light: 0x1E9E5A, dark: 0x4ADE80)
    static let stockLow = dynamic(light: 0xC98200, dark: 0xFBBF24)
    static let stockOut = dynamic(light: 0x9B9BA5, dark: 0x74747F)
    static let danger = dynamic(light: 0xD92D20, dark: 0xFF6B60)
    static let info = dynamic(light: 0x1D6FE0, dark: 0x63A8FF)

    static func stock(_ state: StockState) -> Color {
        switch state {
        case .ok: stockOK
        case .low: stockLow
        case .out: stockOut
        }
    }

    /// Устойчивый цвет для категории — одинаковый при каждом запуске.
    static func category(_ name: String) -> Color {
        let hues: [Double] = [0.02, 0.09, 0.14, 0.33, 0.45, 0.53, 0.61, 0.70, 0.78, 0.90]
        var hasher: UInt64 = 5381
        for byte in name.utf8 { hasher = hasher &* 33 &+ UInt64(byte) }
        let hue = hues[Int(hasher % UInt64(hues.count))]
        return Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(hue: hue, saturation: 0.55, brightness: 0.85, alpha: 1)
                : UIColor(hue: hue, saturation: 0.65, brightness: 0.70, alpha: 1)
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

/// Радиусы, отступы и тени. Один источник правды, чтобы вёрстка «дышала» одинаково.
enum Metrics {
    static let cardRadius: CGFloat = 20
    static let controlRadius: CGFloat = 14
    static let thumbRadius: CGFloat = 16

    static let gutter: CGFloat = 20
    static let cardPadding: CGFloat = 14
    static let cardSpacing: CGFloat = 12
    static let sectionSpacing: CGFloat = 28

    static let thumbSize: CGFloat = 56
}

// MARK: - Модификаторы

/// Карточка: мягкая подложка со скруглением и деликатной тенью.
struct CardSurface: ViewModifier {
    var radius: CGFloat = Metrics.cardRadius
    var padding: CGFloat = Metrics.cardPadding
    var elevated: Bool = false

    @Environment(\.colorScheme) private var colorScheme

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(elevated ? Palette.surfaceElevated : Palette.surface)
                    .shadow(
                        color: .black.opacity(colorScheme == .dark ? 0.35 : 0.06),
                        radius: elevated ? 18 : 10,
                        x: 0,
                        y: elevated ? 8 : 4
                    )
            }
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Palette.separator.opacity(colorScheme == .dark ? 0.8 : 0.5), lineWidth: 0.5)
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
    func plainListRow(insets: EdgeInsets = EdgeInsets(top: 6, leading: Metrics.gutter, bottom: 6, trailing: Metrics.gutter)) -> some View {
        listRowInsets(insets)
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}

// MARK: - Анимации

enum Motion {
    /// Основная пружина: для появления/исчезновения карточек и смены фильтров.
    static let spring = Animation.spring(response: 0.38, dampingFraction: 0.82)
    /// Быстрая пружина: для нажатий и мелких переключателей.
    static let snappy = Animation.spring(response: 0.26, dampingFraction: 0.8)
}
