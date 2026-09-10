import Foundation

/// Сводка по складу. Считается один раз за отрисовку — никаких вычислений в теле View.
struct DashboardMetrics {

    struct CategorySlice: Identifiable, Hashable {
        var id: String { category }
        let category: String
        let quantity: Int
        let saleValue: Double
        let titles: Int
    }

    let totalTitles: Int
    let totalUnits: Int
    let purchaseValue: Double
    let saleValue: Double
    let potentialProfit: Double
    let marginPercent: Double
    let lowStock: [Product]
    let outOfStock: [Product]
    let categories: [CategorySlice]

    init(products: [Product]) {
        totalTitles = products.count
        totalUnits = products.reduce(0) { $0 + max($1.quantity, 0) }
        purchaseValue = products.reduce(0) { $0 + $1.totalPurchaseValue }
        saleValue = products.reduce(0) { $0 + $1.totalSaleValue }
        potentialProfit = saleValue - purchaseValue
        marginPercent = saleValue > 0 ? (saleValue - purchaseValue) / saleValue * 100 : 0

        lowStock = products
            .filter { $0.stockState == .low }
            .sorted { $0.quantity < $1.quantity }

        outOfStock = products
            .filter { $0.stockState == .out }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }

        categories = Dictionary(grouping: products, by: \.displayCategory)
            .map { key, items in
                CategorySlice(
                    category: key,
                    quantity: items.reduce(0) { $0 + max($1.quantity, 0) },
                    saleValue: items.reduce(0) { $0 + $1.totalSaleValue },
                    titles: items.count
                )
            }
            .sorted { $0.quantity > $1.quantity }
    }

    var isEmpty: Bool { totalTitles == 0 }

    /// Топ-категории для графика: длинный хвост схлопываем в «Прочее».
    func chartSlices(limit: Int = 6) -> [CategorySlice] {
        guard categories.count > limit else { return categories }
        let top = Array(categories.prefix(limit))
        let rest = categories.dropFirst(limit)
        let other = CategorySlice(
            category: "Прочее",
            quantity: rest.reduce(0) { $0 + $1.quantity },
            saleValue: rest.reduce(0) { $0 + $1.saleValue },
            titles: rest.reduce(0) { $0 + $1.titles }
        )
        return top + [other]
    }
}
