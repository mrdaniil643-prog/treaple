import SwiftUI

/// Метка состояния. Без цвета остаётся форма: норма — светлая точка,
/// заканчивается — кольцо, закончился — залитый круг. Плотность краски
/// растёт вместе со срочностью, и порядок читается без легенды.
struct StockDot: View {
    let state: StockState
    var size: CGFloat = 7

    var body: some View {
        Group {
            switch state {
            case .ok:
                Circle().fill(Palette.textTertiary)
            case .low:
                Circle().strokeBorder(Palette.ink, lineWidth: size * 0.28)
            case .out:
                Circle().fill(Palette.ink)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Бейдж с остатком. Нормальный остаток не получает обвязки вовсе —
/// внимание должно доставаться только тому, что требует действия.
struct StockBadge: View {
    let product: Product
    var showsTitle: Bool = false

    private var state: StockState { product.stockState }

    private var text: String {
        showsTitle ? state.title : Format.quantity(product.quantity)
    }

    var body: some View {
        HStack(spacing: 5) {
            if state != .ok {
                StockDot(state: state, size: 6)
            }

            Text(text)
                .font(.system(size: 12, weight: .semibold))
                .monospacedDigit()
                .contentTransition(.numericText())
        }
        .foregroundStyle(foreground)
        .padding(.horizontal, state == .ok ? 0 : 8)
        .padding(.vertical, state == .ok ? 0 : 4)
        .background {
            if state == .out {
                Capsule(style: .continuous).fill(Palette.ink)
            } else if state == .low {
                Capsule(style: .continuous).strokeBorder(Palette.ink, lineWidth: Metrics.hairline)
            }
        }
        .animation(Motion.snappy, value: product.quantity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(state.title), \(Format.quantity(product.quantity))")
    }

    private var foreground: Color {
        switch state {
        case .ok: Palette.textSecondary
        case .low: Palette.ink
        case .out: Palette.inkInverted
        }
    }
}

/// Категория — не плашка, а набранная капителью подпись.
/// Плашки дробят строку, подпись встраивается в типографический ритм.
struct CategoryChip: View {
    let title: String

    var body: some View {
        Text(title)
            .microLabel(Palette.textSecondary)
            .lineLimit(1)
    }
}
