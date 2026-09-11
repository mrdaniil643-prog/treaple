import SwiftUI

/// Карточка-метрика. Иконок нет вовсе: в монохроме кружок с глифом
/// превращается в декорацию, а работать должна типографика — капительная
/// подпись сверху, крупное число под ней.
struct MetricCard: View {

    enum Size {
        /// Главная цифра экрана — во всю ширину.
        case hero
        /// Столбец в полосе второстепенных показателей.
        case compact

        var figureSize: CGFloat {
            switch self {
            case .hero: 42
            case .compact: 19
            }
        }
    }

    let title: String
    let value: String
    var caption: String?
    var size: Size = .compact

    @State private var appeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: size == .hero ? 10 : 6) {
            Text(title).microLabel()

            Text(value)
                .figure(size: size.figureSize)
                .contentTransition(.numericText())
                .foregroundStyle(Palette.textPrimary)
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
    VStack(spacing: 12) {
        MetricCard(
            title: "Потенциальная прибыль",
            value: "211 тыс. ₽",
            caption: "при полной продаже остатка",
            size: .hero
        )
        .cardSurface(padding: 18)

        HStack(spacing: 0) {
            MetricCard(title: "Закупка", value: "202 тыс. ₽")
            Rectangle().fill(Palette.line).frame(width: 1, height: 40)
            MetricCard(title: "Продажа", value: "414 тыс. ₽")
            Rectangle().fill(Palette.line).frame(width: 1, height: 40)
            MetricCard(title: "Маржа", value: "51 %")
        }
        .cardSurface(padding: 16)
    }
    .padding()
    .background(ScreenBackground())
}
