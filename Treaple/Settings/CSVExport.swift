import Foundation

/// Экспорт всей таблицы в CSV.
///
/// Разделитель — точка с запятой: Excel и Numbers в русской локали ждут именно её,
/// иначе числа с запятой в дробной части ломают разбор колонок.
enum CSVExport {

    static let separator = ";"

    static let columns = [
        "Название",
        "Категория",
        "Цена закупки",
        "Цена продажи",
        "Наценка, %",
        "Маржа, %",
        "Количество",
        "Сумма закупки",
        "Сумма продажи",
        "Прибыль",
        "Порог «мало»",
        "В наличии",
        "Обновлено"
    ]

    static func makeCSV(from products: [Product]) -> String {
        var rows: [String] = [columns.map(escape).joined(separator: separator)]

        let sorted = products.sorted { lhs, rhs in
            if lhs.displayCategory == rhs.displayCategory {
                return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
            }
            return lhs.displayCategory.localizedStandardCompare(rhs.displayCategory) == .orderedAscending
        }

        for product in sorted {
            let values = [
                product.name,
                product.displayCategory,
                number(product.purchasePrice),
                number(product.salePrice),
                number(product.markupPercent, digits: 1),
                number(product.marginPercent, digits: 1),
                String(product.quantity),
                number(product.totalPurchaseValue),
                number(product.totalSaleValue),
                number(product.totalProfit),
                String(product.lowStockThreshold),
                product.inStock ? "да" : "нет",
                ISO8601DateFormatter().string(from: product.updatedAt)
            ]
            rows.append(values.map(escape).joined(separator: separator))
        }

        return rows.joined(separator: "\r\n")
    }

    /// Пишем файл во временную папку и отдаём URL в share sheet.
    static func makeFile(from products: [Product]) throws -> URL {
        let stamp = Date().formatted(.iso8601.year().month().day())
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("Склад-\(stamp).csv")

        // BOM — чтобы Excel открыл кириллицу как UTF-8, а не как «крокозябры».
        var data = Data([0xEF, 0xBB, 0xBF])
        data.append(Data(makeCSV(from: products).utf8))
        try data.write(to: url, options: .atomic)
        return url
    }

    private static func number(_ value: Double, digits: Int = 2) -> String {
        String(format: "%.\(digits)f", value).replacingOccurrences(of: ".", with: ",")
    }

    private static func escape(_ field: String) -> String {
        guard field.contains(separator) || field.contains("\"") || field.contains("\n") else {
            return field
        }
        return "\"\(field.replacingOccurrences(of: "\"", with: "\"\""))\""
    }
}
