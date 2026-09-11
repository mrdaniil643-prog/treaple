import SwiftUI

/// Карточка-метрика: иконка, крупное число и подпись.
/// Число — главный объект на карточке, поэтому у него округлённое начертание,
/// плотный трекинг и моноширинные цифры: при обновлении разряды не «прыгают».
struct MetricCard: View {
    let title: String
    let value: String
    let caption: String?
    let symbolName: String
    let tint: Color

    @State private var appeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            icon

            VStack(alignment: .leading, spacing: 3) {
                Text(value)
                    .font(.system(size: 23, weight: .bold, design: .rounded))
                    .tracking(-0.4)
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)

                Text(title)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(Palette.textSecondary)

                if let caption {
                    Text(caption)
                        .font(.caption2)
                        .foregroundStyle(Palette.textTertiary)
                }
            }
        }
        // maxHeight растягивает содержимое, иначе соседние карточки в строке
        // сетки получают разную высоту из-за подписей в две строки.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .cardSurface(padding: 14)
        .scaleEffect(appeared ? 1 : 0.94)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(Motion.spring) { appeared = true }
        }
        .accessibilityElement(children: .combine)
    }

    private var icon: some View {
        Image(systemName: symbolName)
            .font(.footnote.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [tint, tint.opacity(0.72)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .shadow(color: tint.opacity(0.32), radius: 6, y: 3)
            }
    }
}

#Preview {
    HStack(spacing: 12) {
        MetricCard(
            title: "Сумма закупки",
            value: "202 тыс. ₽",
            caption: "88 шт. на складе",
            symbolName: "arrow.down.circle.fill",
            tint: Palette.info
        )
        MetricCard(
            title: "Маржа",
            value: "51 %",
            caption: "от суммы продажи",
            symbolName: "percent",
            tint: Palette.stockLow
        )
    }
    .padding()
    .background(ScreenBackground())
}
