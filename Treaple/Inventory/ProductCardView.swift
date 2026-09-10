import SwiftUI

/// Карточка товара в списке: фото слева, название и категория по центру,
/// цена и остаток справа. Индикатор наличия — цветная полоса у левого края.
struct ProductCardView: View {
    let product: Product

    var body: some View {
        HStack(spacing: 13) {
            ProductThumbnail(product: product)

            VStack(alignment: .leading, spacing: 5) {
                Text(product.name.isEmpty ? "Без названия" : product.name)
                    .font(.body.weight(.semibold))
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
                    .font(.callout.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(Palette.textPrimary)
                StockBadge(product: product)
            }
        }
        .padding(.vertical, 2)
        .cardSurface()
        .overlay(alignment: .leading) {
            // Цветной «корешок» слева — состояние читается без чтения текста.
            UnevenRoundedRectangle(
                topLeadingRadius: Metrics.cardRadius,
                bottomLeadingRadius: Metrics.cardRadius,
                style: .continuous
            )
            .fill(Palette.stock(product.stockState))
            .frame(width: 4)
            .opacity(product.stockState == .ok ? 0.35 : 1)
        }
        .clipShape(RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    VStack(spacing: 12) {
        ForEach(Product.sampleProducts.prefix(3)) { product in
            ProductCardView(product: product)
        }
    }
    .padding()
    .background(Palette.canvas)
}
