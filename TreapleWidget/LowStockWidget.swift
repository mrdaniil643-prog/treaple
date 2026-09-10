import WidgetKit
import SwiftUI

struct LowStockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: AppSettingsStore.lowStockWidgetKind, provider: LowStockProvider()) { entry in
            LowStockWidgetView(entry: entry)
                .containerBackground(Palette.surface.gradient, for: .widget)
        }
        .configurationDisplayName("Мало на складе")
        .description("Сколько позиций заканчивается или закончилось.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

struct LowStockWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LowStockEntry

    var body: some View {
        switch family {
        case .accessoryCircular: circular
        case .accessoryRectangular: rectangular
        case .systemMedium: medium
        default: small
        }
    }

    private var deepLink: URL? { URL(string: "treaple://low-stock") }

    // MARK: - Малый размер

    private var small: some View {
        VStack(alignment: .leading, spacing: 8) {
            header

            Spacer(minLength: 0)

            Text(Format.integer(entry.attentionCount))
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(accent)
                .contentTransition(.numericText())

            Text(summaryLine)
                .font(.caption2)
                .foregroundStyle(Palette.textSecondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(deepLink)
    }

    // MARK: - Средний размер

    private var medium: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                header
                Spacer(minLength: 0)
                Text(Format.integer(entry.attentionCount))
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(accent)
                Text(summaryLine)
                    .font(.caption2)
                    .foregroundStyle(Palette.textSecondary)
                    .lineLimit(2)
            }
            .frame(width: 108, alignment: .leading)

            Divider()

            VStack(alignment: .leading, spacing: 7) {
                if entry.items.isEmpty {
                    Spacer(minLength: 0)
                    Label("Все позиции в норме", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Palette.stockOK)
                    Spacer(minLength: 0)
                } else {
                    ForEach(entry.items) { item in
                        HStack(spacing: 7) {
                            Circle()
                                .fill(item.isOut ? Palette.stockOut : Palette.stockLow)
                                .frame(width: 6, height: 6)

                            Text(item.name)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(Palette.textPrimary)
                                .lineLimit(1)

                            Spacer(minLength: 4)

                            Text(item.isOut ? "0" : Format.integer(item.quantity))
                                .font(.caption.weight(.bold))
                                .monospacedDigit()
                                .foregroundStyle(item.isOut ? Palette.stockOut : Palette.stockLow)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .widgetURL(deepLink)
    }

    // MARK: - Экран блокировки

    private var circular: some View {
        Gauge(value: gaugeValue) {
            Image(systemName: "shippingbox.fill")
        } currentValueLabel: {
            Text(Format.integer(entry.attentionCount))
                .monospacedDigit()
        }
        .gaugeStyle(.accessoryCircular)
        .widgetURL(deepLink)
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label("Мало на складе", systemImage: "exclamationmark.triangle.fill")
                .font(.caption2.weight(.semibold))
            Text("\(Format.integer(entry.attentionCount)) из \(Format.integer(entry.totalTitles))")
                .font(.headline)
                .monospacedDigit()
            Text(summaryLine)
                .font(.caption2)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(deepLink)
    }

    // MARK: - Общее

    private var header: some View {
        HStack(spacing: 5) {
            Image(systemName: entry.attentionCount > 0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .font(.caption2.weight(.bold))
            Text("Склад")
                .font(.caption2.weight(.bold))
        }
        .foregroundStyle(accent)
    }

    private var accent: Color {
        if entry.outOfStockCount > 0 { return Palette.danger }
        if entry.lowStockCount > 0 { return Palette.stockLow }
        return Palette.stockOK
    }

    private var summaryLine: String {
        if entry.totalTitles == 0 { return "Склад пуст" }
        if entry.attentionCount == 0 { return "Все \(Format.integer(entry.totalTitles)) позиций в норме" }
        var parts: [String] = []
        if entry.lowStockCount > 0 { parts.append("\(Format.integer(entry.lowStockCount)) заканчивается") }
        if entry.outOfStockCount > 0 { parts.append("\(Format.integer(entry.outOfStockCount)) закончилось") }
        return parts.joined(separator: ", ")
    }

    /// Доля «проблемных» позиций — для круглого виджета на экране блокировки.
    private var gaugeValue: Double {
        guard entry.totalTitles > 0 else { return 0 }
        return min(Double(entry.attentionCount) / Double(entry.totalTitles), 1)
    }
}

#Preview(as: .systemMedium) {
    LowStockWidget()
} timeline: {
    LowStockEntry.placeholder
    LowStockEntry.empty
}
