import SwiftUI
import UIKit

// MARK: - Палитра

/// Цвет здесь — рабочий инструмент, а не украшение. Правило одно: у каждого
/// оттенка ровно одна задача.
///
/// - `accent` отмечает интерактив и выделение — и больше ничего;
/// - `stockOK` / `stockLow` / `stockOut` говорят только об остатке;
/// - всё прочее нейтрально.
///
/// Раздавать оттенки по хешу категории — как было раньше — значит расходовать
/// внимание на цвет, который ничего не сообщает.
enum Palette {

    // Акцент — глубокий индиго-навий. Заметно отличается от системного синего,
    // не спорит с зелёным и янтарным, которыми размечен остаток.
    static let accent = dynamic(light: 0x2F3D9E, dark: 0x9AA5FF)
    static let accentWash = dynamic(light: 0xEDEEF9, dark: 0x1B1D33)

    // Поверхности: тёплый нейтральный фон, карточка светлее фона.
    static let canvas = dynamic(light: 0xF4F3F1, dark: 0x0C0C10)
    static let surface = dynamic(light: 0xFFFFFF, dark: 0x17171D)
    static let surfaceAlt = dynamic(light: 0xF7F6F4, dark: 0x1F1F26)

    // Линии.
    static let line = dynamic(light: 0xE5E2DD, dark: 0x2A2A33)
    static let lineStrong = dynamic(light: 0xCBC7C0, dark: 0x3C3C46)

    // Текст.
    static let textPrimary = dynamic(light: 0x16161A, dark: 0xF4F3F1)
    static let textSecondary = dynamic(light: 0x6C6C76, dark: 0x9E9EA9)
    static let textTertiary = dynamic(light: 0x9B9BA4, dark: 0x6E6E79)

    // Остаток. Приглушённые, а не «светофорные»: рядом с нейтральным фоном
    // чистые RGB-зелёный и красный выглядят дёшево.
    static let stockOK = dynamic(light: 0x15803D, dark: 0x4ADE80)
    static let stockLow = dynamic(light: 0xB45309, dark: 0xF5B93C)
    static let stockOut = dynamic(light: 0x9B9BA4, dark: 0x6E6E79)
    static let danger = dynamic(light: 0xB42318, dark: 0xFF6B60)

    static func stock(_ state: StockState) -> Color {
        switch state {
        case .ok: stockOK
        case .low: stockLow
        case .out: stockOut
        }
    }

    /// Ступень акцента по рангу — для графиков. Один тон разной насыщенности
    /// вместо радуги: порядок виден, пестроты нет.
    static func accentStep(rank: Int, of total: Int) -> Color {
        guard total > 1 else { return accent }
        let step = min(Double(rank) / Double(total - 1), 1)
        return Color(uiColor: UIColor { traits in
            let dark = traits.userInterfaceStyle == .dark
            let base = dark
                ? UIColor(hex: 0x9AA5FF)
                : UIColor(hex: 0x2F3D9E)
            var hue: CGFloat = 0, saturation: CGFloat = 0, brightness: CGFloat = 0, alpha: CGFloat = 0
            base.getHue(&hue, saturation: &saturation, brightness: &brightness, alpha: &alpha)
            return UIColor(
                hue: hue,
                saturation: saturation * (1 - step * 0.62),
                brightness: dark ? brightness * (1 - step * 0.28) : min(brightness + step * 0.34, 1),
                alpha: 1
            )
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

enum Metrics {
    /// 16 — компромисс: мягче строгих 14, но без «подушечности» двадцати.
    static let cardRadius: CGFloat = 16
    static let controlRadius: CGFloat = 12
    static let thumbRadius: CGFloat = 12

    static let hairline: CGFloat = 1

    static let gutter: CGFloat = 20
    static let cardPadding: CGFloat = 14
    static let cardSpacing: CGFloat = 10
    static let sectionSpacing: CGFloat = 28

    static let thumbSize: CGFloat = 52
}

// MARK: - Типографика

extension View {
    /// Микрозаголовок: капитель с разреженным трекингом. Он задаёт ритм
    /// разделов и не конкурирует с содержимым за внимание.
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
            .tracking(-size * 0.022)
            .monospacedDigit()
    }
}

// MARK: - Глубина

/// Тень в два слоя: плотная контактная прямо под карточкой и мягкая
/// рассеянная вокруг. Одним слоем получается либо грязное пятно, либо
/// плоскость — разделение и создаёт ощущение физического объекта.
struct Elevation {
    let contactOpacity: Double
    let contactRadius: CGFloat
    let contactOffset: CGFloat
    let ambientOpacity: Double
    let ambientRadius: CGFloat
    let ambientOffset: CGFloat

    static let card = Elevation(
        contactOpacity: 0.04, contactRadius: 1.5, contactOffset: 1,
        ambientOpacity: 0.055, ambientRadius: 12, ambientOffset: 6
    )

    static let raised = Elevation(
        contactOpacity: 0.055, contactRadius: 2, contactOffset: 1,
        ambientOpacity: 0.10, ambientRadius: 24, ambientOffset: 12
    )

    /// В тёмной теме рассеянный ореол почти не читается: контактный слой
    /// делаем плотнее, мягкий — компактнее.
    func resolved(for scheme: ColorScheme) -> Elevation {
        guard scheme == .dark else { return self }
        return Elevation(
            contactOpacity: contactOpacity * 3.6,
            contactRadius: contactRadius,
            contactOffset: contactOffset,
            ambientOpacity: ambientOpacity * 2.8,
            ambientRadius: ambientRadius * 0.7,
            ambientOffset: ambientOffset * 0.8
        )
    }
}

extension View {
    func elevation(_ level: Elevation, scheme: ColorScheme) -> some View {
        let resolved = level.resolved(for: scheme)
        return self
            .shadow(color: .black.opacity(resolved.contactOpacity), radius: resolved.contactRadius, y: resolved.contactOffset)
            .shadow(color: .black.opacity(resolved.ambientOpacity), radius: resolved.ambientRadius, y: resolved.ambientOffset)
    }
}

// MARK: - Поверхности

/// Карточка: заливка, двухслойная тень и кромка со световым градиентом
/// сверху — она отделяет карточку от фона мягче, чем ровная обводка.
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
                    .fill(elevated ? Palette.surfaceAlt : Palette.surface)
                    .elevation(elevated ? .raised : .card, scheme: colorScheme)
            }
            .overlay { shape.strokeBorder(edgeHighlight, lineWidth: 0.75) }
    }

    private var edgeHighlight: LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [.white.opacity(0.09), .white.opacity(0.02)]
                : [.white.opacity(0.9), Palette.line.opacity(0.8)],
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

    func plainListRow(insets: EdgeInsets = EdgeInsets(top: 5, leading: Metrics.gutter, bottom: 5, trailing: Metrics.gutter)) -> some View {
        listRowInsets(insets)
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }

    /// «Жидкое стекло» на iOS 26, плотная подложка с тенью на версиях старше.
    func glassControl(radius: CGFloat = Metrics.controlRadius) -> some View {
        modifier(GlassControl(radius: radius))
    }
}

/// Панель управления. На iOS 26 системные панели стеклянные, и собственные
/// элементы должны выглядеть так же, иначе они кажутся вклеенными.
struct GlassControl: ViewModifier {
    var radius: CGFloat = Metrics.controlRadius

    @Environment(\.colorScheme) private var colorScheme

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
    }

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: shape)
        } else {
            content
                .background {
                    shape.fill(Palette.surface).elevation(.card, scheme: colorScheme)
                }
                .overlay { shape.strokeBorder(Palette.line, lineWidth: Metrics.hairline) }
        }
    }
}

/// Волосяная линия одного тона по всему приложению. Системный `Divider`
/// берёт собственный цвет и толщину и выбивается из ритма.
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
            .opacity(configuration.isPressed ? 0.65 : 1)
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(Motion.snappy, value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PressableStyle {
    static var pressable: PressableStyle { PressableStyle() }
}

// MARK: - Анимации

enum Motion {
    static let spring = Animation.spring(response: 0.34, dampingFraction: 0.84)
    static let snappy = Animation.spring(response: 0.22, dampingFraction: 0.8)
    static let gentle = Animation.spring(response: 0.7, dampingFraction: 0.92)
}
