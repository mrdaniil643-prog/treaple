import SwiftUI
import UIKit

// MARK: - Палитра

/// Цвета приложения. Все оттенки адаптивные: собираются через `UIColor` с
/// динамическим провайдером, поэтому корректно переключаются между темами
/// и не требуют дублирования в каталоге ассетов.
enum Palette {

    // Акцент — чернильный индиго. Семантические зелёный/янтарный/серый
    // остаются читаемыми рядом с ним и не сливаются с брендовым цветом.
    static let accent = dynamic(light: 0x4338CA, dark: 0x8D89F7)
    static let accentDeep = dynamic(light: 0x312BA0, dark: 0xA8A4FF)
    static let accentSoft = dynamic(light: 0xEDECFB, dark: 0x22203F)

    // Поверхности: тёплый нейтральный фон, карточки чуть светлее фона.
    static let canvas = dynamic(light: 0xF4F3F0, dark: 0x0B0B10)
    static let surface = dynamic(light: 0xFFFFFF, dark: 0x17171E)
    static let surfaceElevated = dynamic(light: 0xFFFFFF, dark: 0x1F1F28)
    static let separator = dynamic(light: 0xE6E3DD, dark: 0x2C2C37)

    // Текст.
    static let textPrimary = dynamic(light: 0x17171C, dark: 0xF3F2F0)
    static let textSecondary = dynamic(light: 0x6A6A74, dark: 0x9B9BA7)
    static let textTertiary = dynamic(light: 0x9A9AA4, dark: 0x6C6C78)

    // Семантика остатков.
    static let stockOK = dynamic(light: 0x1B9B57, dark: 0x4ADE80)
    static let stockLow = dynamic(light: 0xC17E00, dark: 0xFBBF24)
    static let stockOut = dynamic(light: 0x9A9AA4, dark: 0x74747F)
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
                : UIColor(hue: hue, saturation: 0.68, brightness: 0.66, alpha: 1)
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
    static let thumbRadius: CGFloat = 15

    static let gutter: CGFloat = 20
    static let cardPadding: CGFloat = 14
    static let cardSpacing: CGFloat = 12
    static let sectionSpacing: CGFloat = 28

    static let thumbSize: CGFloat = 54
}

// MARK: - Глубина

/// Тень в два слоя: плотная контактная прямо под карточкой и мягкая рассеянная
/// вокруг неё. Одним слоем получается либо грязное пятно, либо плоскость —
/// разделение и даёт ощущение физического объекта.
struct Elevation {
    let contactOpacity: Double
    let contactRadius: CGFloat
    let contactOffset: CGFloat
    let ambientOpacity: Double
    let ambientRadius: CGFloat
    let ambientOffset: CGFloat

    static let card = Elevation(
        contactOpacity: 0.045, contactRadius: 1.5, contactOffset: 1,
        ambientOpacity: 0.065, ambientRadius: 14, ambientOffset: 7
    )

    static let raised = Elevation(
        contactOpacity: 0.06, contactRadius: 2, contactOffset: 1,
        ambientOpacity: 0.11, ambientRadius: 26, ambientOffset: 14
    )

    /// В тёмной теме тень работает иначе: рассеянный ореол почти не читается,
    /// поэтому контактный слой делаем плотнее, а мягкий — компактнее.
    func resolved(for scheme: ColorScheme) -> Elevation {
        guard scheme == .dark else { return self }
        return Elevation(
            contactOpacity: contactOpacity * 3.4,
            contactRadius: contactRadius,
            contactOffset: contactOffset,
            ambientOpacity: ambientOpacity * 2.6,
            ambientRadius: ambientRadius * 0.75,
            ambientOffset: ambientOffset * 0.8
        )
    }
}

extension View {
    func elevation(_ level: Elevation, scheme: ColorScheme) -> some View {
        let resolved = level.resolved(for: scheme)
        return self
            .shadow(
                color: .black.opacity(resolved.contactOpacity),
                radius: resolved.contactRadius,
                y: resolved.contactOffset
            )
            .shadow(
                color: .black.opacity(resolved.ambientOpacity),
                radius: resolved.ambientRadius,
                y: resolved.ambientOffset
            )
    }
}

// MARK: - Модификаторы

/// Карточка: скруглённая подложка, двухслойная тень и кромка со световым
/// градиентом сверху — она отделяет карточку от фона мягче, чем ровная обводка.
struct CardSurface: ViewModifier {
    var radius: CGFloat = Metrics.cardRadius
    var padding: CGFloat = Metrics.cardPadding
    var elevated: Bool = false

    @Environment(\.colorScheme) private var colorScheme

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background {
                shape
                    .fill(elevated ? Palette.surfaceElevated : Palette.surface)
                    .elevation(elevated ? .raised : .card, scheme: colorScheme)
            }
            .overlay {
                shape.strokeBorder(edgeHighlight, lineWidth: 0.75)
            }
    }

    private var edgeHighlight: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [.white.opacity(0.10), .white.opacity(0.02)]
                : [.white.opacity(0.9), Palette.separator.opacity(0.75)],
            startPoint: .top,
            endPoint: .bottom
        )
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
    func plainListRow(insets: EdgeInsets = EdgeInsets(top: 5, leading: Metrics.gutter, bottom: 5, trailing: Metrics.gutter)) -> some View {
        listRowInsets(insets)
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }

    /// «Жидкое стекло» на iOS 26, плотная карточка-капсула на версиях старше.
    func glassCapsule() -> some View {
        modifier(GlassCapsule())
    }

    /// Мягкое появление карточек при прокрутке: элементы у краёв экрана
    /// слегка приглушены и уменьшены. Заметно ощущается, но не отвлекает.
    func scrollFade() -> some View {
        scrollTransition(.interactive, axis: .vertical) { content, phase in
            content
                .opacity(phase.isIdentity ? 1 : 0.45)
                .scaleEffect(phase.isIdentity ? 1 : 0.965)
        }
    }
}

/// Панель-капсула. На iOS 26 системные панели стеклянные, и собственные
/// элементы управления должны выглядеть так же; ниже — обычная подложка с тенью.
struct GlassCapsule: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme

    private var shape: Capsule { Capsule(style: .continuous) }

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: shape)
        } else {
            content
                .background {
                    shape
                        .fill(Palette.surface)
                        .elevation(.card, scheme: colorScheme)
                }
                .overlay {
                    shape.strokeBorder(Palette.separator, lineWidth: 0.75)
                }
        }
    }
}

/// Нажатие: лёгкое сжатие вместо мгновенной подсветки.
struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.96

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(Motion.snappy, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PressableStyle {
    static var pressable: PressableStyle { PressableStyle() }
}

// MARK: - Анимации

enum Motion {
    /// Основная пружина: для появления/исчезновения карточек и смены фильтров.
    static let spring = Animation.spring(response: 0.38, dampingFraction: 0.82)
    /// Быстрая пружина: для нажатий и мелких переключателей.
    static let snappy = Animation.spring(response: 0.24, dampingFraction: 0.78)
    /// Мягкая длинная — для графиков и появления экрана.
    static let gentle = Animation.spring(response: 0.75, dampingFraction: 0.9)
}
