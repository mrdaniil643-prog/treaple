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

        return VStack(spacing: Metrics.cardSpacing) {
            MetricCard(
                title: "Потенциальная прибыль",
                value: Format.compactMoney(data.potentialProfit),
                caption: "если продать весь остаток — \(Format.integer(data.totalUnits)) шт.",
                size: .hero
            )
            .cardSurface(padding: 18)

            HStack(spacing: 0) {
                MetricCard(title: "Закупка", value: Format.compactMoney(data.purchaseValue))
                columnRule
                MetricCard(title: "Продажа", value: Format.compactMoney(data.saleValue))
                columnRule
                MetricCard(title: "Маржа", value: Format.percent(data.marginPercent, digits: 0))
            }
            .cardSurface(padding: 16)
        }
    }

    /// Разделитель колонок. Поля по бокам обязательны: без них подписи
    /// упираются в линию и полоса читается как таблица, а не как ряд цифр.
    private var columnRule: some View {
        Rectangle()
            .fill(Palette.line)
            .frame(width: Metrics.hairline)
            .padding(.vertical, 2)
            .padding(.horizontal, 12)
    }

    // MARK: - График

    private var categoryChart: some View {
        let slices = metrics.chartSlices()

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                sectionTitle("По категориям")
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
                // Ранговая шкала серого: самый большой остаток самый плотный,
                // порядок виден без легенды и без единого цветного пятна.
                .foregroundStyle(Palette.tone(rank: slice.rank, of: slices.count))
                .cornerRadius(3)
                .annotation(position: .trailing, alignment: .leading, spacing: 6) {
                    Text(
                        chartMetric == .quantity
                            ? Format.integer(slice.quantity)
                            : Format.compactMoney(slice.saleValue)
                    )
                    .font(.system(size: 11, weight: .semibold))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                    .foregroundStyle(Palette.textSecondary)
                    .opacity(chartGrown ? 1 : 0)
                }
            }
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(preset: .aligned, position: .leading) { _ in
                    AxisValueLabel()
                        .font(.system(size: 11, weight: .medium))
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
                        .font(.system(size: 11, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.inkInverted)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background { Capsule(style: .continuous).fill(Palette.ink) }
                }
            }

            if attention.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.textPrimary)
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
                            Hairline(inset: 50)
                        }
                    }
                }
                .cardSurface(padding: 0)

                Button(action: onSelectLowStock) {
                    HStack(spacing: 5) {
                        Text(attention.count > 6 ? "Показать все \(attention.count)" : "Открыть склад")
                        Image(systemName: "chevron.right")
                            .font(.caption2.weight(.bold))
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Palette.textPrimary)
                }
                .buttonStyle(.pressable)
                .padding(.leading, 4)
            }
        }
    }

    private func lowStockRow(_ product: Product) -> some View {
        HStack(spacing: 12) {
            ProductThumbnail(product: product, size: 36, cornerRadius: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text(product.name.isEmpty ? "Без названия" : product.name)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(1)
                CategoryChip(title: product.displayCategory)
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
        Text(text).microLabel(Palette.textSecondary)
    }
}

#Preview {
    DashboardView(onSelectLowStock: {})
        .modelContainer(PersistenceController.makePreviewContainer())
}
