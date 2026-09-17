import SwiftUI

/// Равносторонний треугольник — знак «мало». Круглых форм рядом с цифрой
/// быть не должно: см. комментарий к StockDot.
private struct TriangleMark: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// Метка состояния. Цвет здесь единственный носитель смысла — зелёный и
/// янтарный при протанопии неразличимы, — поэтому форма его дублирует.
///
/// Раньше «мало» было кольцом, а «нет» — блёклым кругом. Рядом с цифрой обе
/// формы читались как буква «о»: «о 1 шт.». Теперь формы непохожи ни на
/// букву, ни друг на друга: норма — точка, мало — треугольник, нет — черта.
struct StockDot: View {
    let state: StockState
    var size: CGFloat = 7

    var body: some View {
        Group {
            switch state {
            case .ok:
                Circle().fill(Palette.stockOK)
                    .frame(width: size, height: size)
            case .low:
                TriangleMark().fill(Palette.stockLow)
                    .frame(width: size * 1.25, height: size * 1.1)
            case .out:
                Capsule().fill(Palette.stockOut)
                    .frame(width: size * 1.3, height: max(2, size * 0.34))
            }
        }
        .accessibilityHidden(true)
    }
}

/// Бейдж с остатком. Нормальный остаток обвязки не получает: внимание
/// должно доставаться тому, что требует действия.
struct StockBadge: View {
    let product: Product
    var showsTitle: Bool = false

    private var state: StockState { product.stockState }
    private var tint: Color { Palette.stock(state) }

    var body: some View {
        HStack(spacing: 5) {
            if state != .ok {
                StockDot(state: state, size: 6)
            }

            Text(showsTitle ? state.title : Format.quantity(product.quantity))
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
                .contentTransition(.numericText())
        }
        .foregroundStyle(state == .ok ? Palette.textSecondary : tint)
        .padding(.horizontal, state == .ok ? 0 : 8)
        .padding(.vertical, state == .ok ? 0 : 4)
        .background {
            if state != .ok {
                Capsule(style: .continuous)
                    .fill(tint.opacity(0.12))
                    .overlay {
                        Capsule(style: .continuous)
                            .strokeBorder(tint.opacity(0.28), lineWidth: Metrics.hairline)
                    }
            }
        }
        .animation(Motion.snappy, value: product.quantity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(state.title), \(Format.quantity(product.quantity))")
    }
}

/// Категория — набранная капителью подпись, а не цветная плашка.
/// Плашка тянула бы на себя внимание, ничего при этом не сообщая.
struct CategoryChip: View {
    let title: String

    var body: some View {
        Text(title)
            .microLabel(Palette.textSecondary)
            .lineLimit(1)
    }
}
