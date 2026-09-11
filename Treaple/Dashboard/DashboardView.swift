import SwiftUI
import SwiftData
import Charts

/// Дашборд: деньги на складе, распределение остатков по категориям
/// и быстрый доступ к позициям, которые заканчиваются.
struct DashboardView: View {

    var onSelectLowStock: () -> Void

    @Query private var products: [Product]
    @Environment(\.modelContext) private var context

    @State private var chartMetric: ChartMetric = .quantity
    /// Столбцы вырастают из нуля при появлении экрана — это читается как
    /// «данные посчитались», а не как мигание готовой картинки.
    @State private var chartGrown = false

    enum ChartMetric: String, CaseIterable, Identifiable {
        case quantity, value

        var id: String { rawValue }
        var title: String { self == .quantity ? "Штуки" : "Деньги" }
    }

    private var metrics: DashboardMetrics { DashboardMetrics(products: products) }

    var body: some View {
        NavigationStack {
            Group {
                if metrics.isEmpty {
                    EmptyStateView(
                        symbolName: "chart.bar.xaxis",
                        title: "Считать пока нечего",
                        message: "Добавьте товары на склад — здесь появятся суммы закупки, продажи и потенциальная прибыль.",
                        actionTitle: "Перейти на склад",
                        action: onSelectLowStock
                    )
                    .frame(maxHeight: .infinity)
                } else {
                    content
                }
            }
            .background(ScreenBackground())
            .navigationTitle("Дашборд")
        }
    }

    private var content: some View {
        ScrollView {
            VStack(spacing: Metrics.sectionSpacing) {
                metricsGrid
                categoryChart
                lowStockList
            }
            .padding(.horizontal, Metrics.gutter)
            .padding(.top, 4)
            .padding(.bottom, 40)
        }
        .animation(Motion.spring, value: products.count)
    }

    // MARK: - Метрики

    private var metricsGrid: some View {
        let data = metrics
        return LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
            spacing: 12
        ) {
            MetricCard(
                title: "Сумма закупки",
                value: Format.compactMoney(data.purchaseValue),
                caption: "\(Format.integer(data.totalUnits)) шт. на складе",
                symbolName: "arrow.down.circle.fill",
                tint: Palette.info
            )
            MetricCard(
                title: "Сумма продажи",
                value: Format.compactMoney(data.saleValue),
                caption: "\(Format.integer(data.totalTitles)) наименований",
                symbolName: "arrow.up.circle.fill",
                tint: Palette.accent
            )
            MetricCard(
                title: "Потенциальная прибыль",
                value: Format.compactMoney(data.potentialProfit),
                caption: "если продать весь остаток",
                symbolName: "chart.line.uptrend.xyaxis",
                tint: data.potentialProfit >= 0 ? Palette.stockOK : Palette.danger
            )
            MetricCard(
                title: "Маржа",
                value: Format.percent(data.marginPercent),
                caption: "от суммы продажи",
                symbolName: "percent",
                tint: Palette.stockLow
            )
        }
    }

    // MARK: - График

    private var categoryChart: some View {
        let slices = metrics.chartSlices()

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                sectionTitle("Остатки по категориям")
                Spacer()
                Picker("Показатель", selection: $chartMetric) {
                    ForEach(ChartMetric.allCases) { metric in
                        Text(metric.title).tag(metric)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 150)
            }

            Chart(slices) { slice in
                BarMark(
                    x: .value("Значение", chartGrown ? value(for: slice) : 0),
                    y: .value("Категория", slice.category)
                )
                .foregroundStyle(
                    LinearGradient(
                        colors: [
                            Palette.category(slice.category),
                            Palette.category(slice.category).opacity(0.7)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .cornerRadius(8)
                .annotation(position: .trailing, alignment: .leading, spacing: 6) {
                    Text(
                        chartMetric == .quantity
                            ? Format.integer(slice.quantity)
                            : Format.compactMoney(slice.saleValue)
                    )
                    .font(.caption2.weight(.semibold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .foregroundStyle(Palette.textTertiary)
                    .opacity(chartGrown ? 1 : 0)
                }
            }
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(preset: .aligned, position: .leading) { _ in
                    AxisValueLabel()
                        .font(.caption2)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            .chartPlotStyle { plot in
                plot.padding(.trailing, 44)
            }
            .frame(height: max(CGFloat(slices.count) * 38, 120))
            .animation(Motion.spring, value: chartMetric)
            .onAppear {
                guard !chartGrown else { return }
                withAnimation(Motion.gentle.delay(0.15)) { chartGrown = true }
            }
        }
        .cardSurface(padding: 16)
    }

    // MARK: - Мало на складе

    private var lowStockList: some View {
        let data = metrics
        let attention = data.lowStock + data.outOfStock

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                sectionTitle("Требует внимания")
                Spacer()
                if !attention.isEmpty {
                    Text(Format.integer(attention.count))
                        .font(.caption.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.stockLow)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background { Capsule().fill(Palette.stockLow.opacity(0.14)) }
                }
            }

            if attention.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(Palette.stockOK)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Всё в порядке")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.textPrimary)
                        Text("Ни одна позиция не опустилась ниже порога.")
                            .font(.caption)
                            .foregroundStyle(Palette.textSecondary)
                    }
                    Spacer(minLength: 0)
                }
                .cardSurface(padding: 16)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(attention.prefix(6).enumerated()), id: \.element.id) { index, product in
                        lowStockRow(product)
                        if index < min(attention.count, 6) - 1 {
                            Divider().padding(.leading, 52)
                        }
                    }
                }
                .cardSurface(padding: 0)
                .scrollFade()

                Button(action: onSelectLowStock) {
                    HStack(spacing: 5) {
                        Text(attention.count > 6 ? "Показать все \(attention.count)" : "Открыть склад")
                        Image(systemName: "chevron.right")
                            .font(.caption2.weight(.bold))
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.accent)
                }
                .buttonStyle(.pressable)
                .padding(.leading, 4)
            }
        }
    }

    private func lowStockRow(_ product: Product) -> some View {
        HStack(spacing: 12) {
            ProductThumbnail(product: product, size: 38, cornerRadius: 11)

            VStack(alignment: .leading, spacing: 2) {
                Text(product.name.isEmpty ? "Без названия" : product.name)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(1)
                Text(product.displayCategory)
                    .font(.caption2)
                    .foregroundStyle(Palette.textTertiary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            StockBadge(product: product)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    private func value(for slice: DashboardMetrics.CategorySlice) -> Double {
        chartMetric == .quantity ? Double(slice.quantity) : slice.saleValue
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(.headline, design: .rounded, weight: .semibold))
            .foregroundStyle(Palette.textPrimary)
    }
}

#Preview {
    DashboardView(onSelectLowStock: {})
        .modelContainer(PersistenceController.makePreviewContainer())
}
