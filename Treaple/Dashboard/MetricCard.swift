import SwiftUI

/// Карточка-метрика. Иконок нет: кружок с глифом рядом с крупным числом
/// становится декорацией и отбирает у него внимание. Работает типографика —
/// капительная подпись сверху, число под ней.
struct MetricCard: View {

    enum Size {
        /// Главная цифра экрана — во всю ширину.
        case hero
        /// Столбец в полосе второстепенных показателей.
        case compact

        var figureSize: CGFloat {
            switch self {
            case .hero: 40
            case .compact: 19
            }
        }
    }

    let title: String
    let value: String
    var caption: String?
    var size: Size = .compact
    /// Цвет числа. По умолчанию нейтральный: подкрашиваем только там, где
    /// оттенок что-то сообщает — например, убыток вместо прибыли.
    var valueTint: Color = Palette.textPrimary

    @State private var appeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: size == .hero ? 9 : 6) {
            Text(title).microLabel()

            Text(value)
                .figure(size: size.figureSize)
                .contentTransition(.numericText())
                .foregroundStyle(valueTint)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            if let caption {
                Text(caption)
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.textTertiary)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 6)
        .onAppear { withAnimation(Motion.spring) { appeared = true } }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    VStack(spacing: 10) {
        MetricCard(
            title: "Потенциальная прибыль",
            value: "211 тыс. ₽",
            caption: "если продать весь остаток — 88 шт.",
            size: .hero,
            valueTint: Palette.stockOK
        )
        .cardSurface(padding: 18)

        HStack(spacing: 0) {
            MetricCard(title: "Закупка", value: "202 тыс. ₽")
            Rectangle().fill(Palette.line).frame(width: 1, height: 40).padding(.horizontal, 12)
            MetricCard(title: "Продажа", value: "414 тыс. ₽")
            Rectangle().fill(Palette.line).frame(width: 1, height: 40).padding(.horizontal, 12)
            MetricCard(title: "Маржа", value: "51 %")
        }
        .cardSurface(padding: 16)
    }
    .padding()
    .background(ScreenBackground())
}
