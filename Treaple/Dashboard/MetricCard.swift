import SwiftUI

/// Карточка-метрика: иконка, крупное число и подпись.
struct MetricCard: View {
    let title: String
    let value: String
    let caption: String?
    let symbolName: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: symbolName)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(tint)
                    .frame(width: 28, height: 28)
                    .background { Circle().fill(tint.opacity(0.13)) }
                Spacer(minLength: 0)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(value)
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
                    .contentTransition(.numericText())

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
        .accessibilityElement(children: .combine)
    }
}
