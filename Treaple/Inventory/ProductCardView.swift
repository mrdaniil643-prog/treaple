import SwiftUI

/// Карточка товара в списке: фото слева, название и категория по центру,
/// цена и остаток справа. Состояние остатка дублируется цветной кромкой
/// у левого края — её видно боковым зрением при быстрой прокрутке.
struct ProductCardView: View {
    let product: Product

    private var state: StockState { product.stockState }

    var body: some View {
        HStack(spacing: 13) {
            ProductThumbnail(product: product)

            VStack(alignment: .leading, spacing: 5) {
                Text(product.name.isEmpty ? "Без названия" : product.name)
                    .font(.system(.body, weight: .semibold))
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                HStack(spacing: 6) {
                    CategoryChip(title: product.displayCategory)
                    if product.profitPerUnit > 0 {
                        Text("+\(Format.percent(product.markupPercent, digits: 0))")
                            .font(.caption2.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(Palette.stockOK)
                    }
                }
            }

            Spacer(minLength: 6)

            VStack(alignment: .trailing, spacing: 6) {
                Text(Format.money(product.salePrice))
                    .font(.system(.callout, design: .rounded, weight: .semibold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .foregroundStyle(Palette.textPrimary)

                StockBadge(product: product)
            }
        }
        .padding(.vertical, 2)
        .cardSurface()
        .overlay(alignment: .leading) { spine }
        .clipShape(RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /// Кромка состояния. Градиент вместо плашки: сверху цвет плотный, книзу
    /// растворяется — полоска читается как подсветка, а не как рамка таблицы.
    private var spine: some View {
        UnevenRoundedRectangle(
            topLeadingRadius: Metrics.cardRadius,
            bottomLeadingRadius: Metrics.cardRadius,
            style: .continuous
        )
        .fill(
            LinearGradient(
                colors: [Palette.stock(state), Palette.stock(state).opacity(0.45)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .frame(width: 4)
        .opacity(state == .ok ? 0.4 : 1)
    }
}

#Preview {
    VStack(spacing: 12) {
        ForEach(Product.sampleProducts.prefix(3)) { product in
            ProductCardView(product: product)
        }
    }
    .padding()
    .background(ScreenBackground())
}
