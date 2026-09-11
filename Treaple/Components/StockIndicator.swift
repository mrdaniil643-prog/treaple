import SwiftUI

/// Метка состояния. Цвет здесь работает по назначению — он единственный
/// носитель смысла, поэтому форма его дублирует: норма — залитая точка,
/// заканчивается — кольцо, закончился — перечёркнутый круг. Так состояние
/// читается и при дальтонизме, и в чёрно-белой печати.
struct StockDot: View {
    let state: StockState
    var size: CGFloat = 7

    var body: some View {
        Group {
            switch state {
            case .ok:
                Circle().fill(Palette.stockOK)
            case .low:
                Circle().strokeBorder(Palette.stockLow, lineWidth: size * 0.3)
            case .out:
                Circle().fill(Palette.stockOut.opacity(0.45))
            }
        }
        .frame(width: size, height: size)
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
