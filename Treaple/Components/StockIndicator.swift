import SwiftUI

/// Точка-индикатор наличия. Когда остаток на нуле, вокруг расходится
/// затухающее кольцо: пустые позиции должны цеплять взгляд при прокрутке.
struct StockDot: View {
    let state: StockState
    var size: CGFloat = 8

    @State private var pulse = false

    var body: some View {
        Circle()
            .fill(Palette.stock(state).gradient)
            .frame(width: size, height: size)
            .overlay {
                if state == .out {
                    Circle()
                        .stroke(Palette.stock(state).opacity(pulse ? 0 : 0.55), lineWidth: 3)
                        .scaleEffect(pulse ? 2.2 : 1)
                }
            }
            .onAppear {
                guard state == .out else { return }
                withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) {
                    pulse = true
                }
            }
            .accessibilityHidden(true)
    }
}

/// Компактный бейдж со статусом и остатком.
struct StockBadge: View {
    let product: Product
    var showsTitle: Bool = false

    var body: some View {
        let state = product.stockState
        let tint = Palette.stock(state)

        return HStack(spacing: 5) {
            StockDot(state: state, size: 7)

            Text(showsTitle ? state.title : Format.quantity(product.quantity))
                .font(.footnote.weight(.semibold))
                .monospacedDigit()
                .contentTransition(.numericText())
                .foregroundStyle(state == .ok ? Palette.textSecondary : tint)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background {
            Capsule(style: .continuous)
                .fill(tint.opacity(state == .ok ? 0.10 : 0.15))
                .overlay {
                    Capsule(style: .continuous)
                        .strokeBorder(tint.opacity(state == .ok ? 0.10 : 0.22), lineWidth: 0.75)
                }
        }
        .animation(Motion.snappy, value: product.quantity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(state.title), \(Format.quantity(product.quantity))")
    }
}

/// Плашка категории в карточке товара.
struct CategoryChip: View {
    let title: String

    var body: some View {
        let tint = Palette.category(title)

        return Text(title)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background {
                Capsule(style: .continuous).fill(tint.opacity(0.13))
            }
            .lineLimit(1)
    }
}
