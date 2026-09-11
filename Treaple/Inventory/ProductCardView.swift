import SwiftUI

/// Строка товара: монограмма, название с категорией, цена и остаток.
/// Цветная кромка у левого края появляется только у позиций, требующих
/// внимания, — на нормальных строках цвета в карточке нет вовсе.
struct ProductCardView: View {
    let product: Product

    private var state: StockState { product.stockState }

    var body: some View {
        HStack(spacing: 12) {
            ProductThumbnail(product: product)

            VStack(alignment: .leading, spacing: 4) {
                Text(product.name.isEmpty ? "Без названия" : product.name)
                    .font(.system(size: 16, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                HStack(spacing: 8) {
                    CategoryChip(title: product.displayCategory)

                    if product.profitPerUnit > 0 {
                        Text("+\(Format.percent(product.markupPercent, digits: 0))")
                            .font(.system(size: 11, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(Palette.textTertiary)
                    }
                }
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 6) {
                Text(Format.money(product.salePrice))
                    .figure(size: 16)
                    .contentTransition(.numericText())
                    .foregroundStyle(Palette.textPrimary)

                StockBadge(product: product)
            }
        }
        .padding(.vertical, 2)
        .cardSurface()
        .overlay(alignment: .leading) { marker }
        .clipShape(RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /// Кромка состояния. Градиент вместо плашки: сверху цвет плотный, книзу
    /// растворяется — полоска читается как подсветка, а не как рамка таблицы.
    @ViewBuilder
    private var marker: some View {
        if state != .ok {
            LinearGradient(
                colors: [Palette.stock(state), Palette.stock(state).opacity(0.4)],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(width: 3)
        }
    }
}

#Preview {
    VStack(spacing: Metrics.cardSpacing) {
        ForEach(Product.sampleProducts.prefix(4)) { product in
            ProductCardView(product: product)
        }
    }
    .padding()
    .background(ScreenBackground())
}
