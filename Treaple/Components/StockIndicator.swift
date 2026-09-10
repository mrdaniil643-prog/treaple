import SwiftUI

/// Точка-индикатор наличия. Пульсирует, когда остаток на нуле, — так пустые
/// позиции видно даже боковым зрением при прокрутке.
struct StockDot: View {
    let state: StockState
    var size: CGFloat = 8

    @State private var pulse = false

    var body: some View {
        Circle()
            .fill(Palette.stock(state))
            .frame(width: size, height: size)
            .overlay {
                if state == .out {
                    Circle()
                        .stroke(Palette.stock(state).opacity(pulse ? 0 : 0.5), lineWidth: 3)
                        .scaleEffect(pulse ? 2.2 : 1)
                }
            }
            .onAppear {
                guard state == .out else { return }
                withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) {
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
        HStack(spacing: 5) {
            StockDot(state: state, size: 7)
            Text(showsTitle ? state.title : Format.quantity(product.quantity))
                .font(.footnote.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(state == .ok ? Palette.textSecondary : Palette.stock(state))
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background {
            Capsule(style: .continuous)
                .fill(Palette.stock(state).opacity(state == .ok ? 0.10 : 0.14))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(state.title), \(Format.quantity(product.quantity))")
    }
}

/// Плашка категории в карточке товара.
struct CategoryChip: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Palette.category(title))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background {
                Capsule(style: .continuous)
                    .fill(Palette.category(title).opacity(0.12))
            }
            .lineLimit(1)
    }
}
