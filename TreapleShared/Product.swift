import Foundation
import SwiftData

/// Товар на складе.
///
/// Все свойства имеют значения по умолчанию и не используют `@Attribute(.unique)` —
/// это обязательное требование CloudKit-совместимой схемы SwiftData.
@Model
final class Product {
    var id: UUID = UUID()
    var name: String = ""
    var category: String = ""

    /// Фото товара. `.externalStorage` — большие бинарники лежат рядом со стором,
    /// в CloudKit уезжают как CKAsset.
    @Attribute(.externalStorage) var imageData: Data?

    var purchasePrice: Double = 0
    var salePrice: Double = 0
    var quantity: Int = 0
    var lowStockThreshold: Int = 3
    var inStock: Bool = true
    var createdAt: Date = Date()
    var updatedAt: Date = Date()

    init(
        id: UUID = UUID(),
        name: String = "",
        category: String = "",
        imageData: Data? = nil,
        purchasePrice: Double = 0,
        salePrice: Double = 0,
        quantity: Int = 0,
        lowStockThreshold: Int = AppSettingsStore.defaultLowStockThresholdFallback,
        inStock: Bool = true,
        createdAt: Date = .now,
        updatedAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.category = category
        self.imageData = imageData
        self.purchasePrice = purchasePrice
        self.salePrice = salePrice
        self.quantity = quantity
        self.lowStockThreshold = lowStockThreshold
        self.inStock = inStock
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - Производные величины

extension Product {
    /// Прибыль с одной единицы товара.
    var profitPerUnit: Double { salePrice - purchasePrice }

    /// Наценка в процентах от цены закупки.
    var markupPercent: Double {
        guard purchasePrice > 0 else { return 0 }
        return (salePrice - purchasePrice) / purchasePrice * 100
    }

    /// Маржа в процентах от цены продажи.
    var marginPercent: Double {
        guard salePrice > 0 else { return 0 }
        return profitPerUnit / salePrice * 100
    }

    var totalPurchaseValue: Double { purchasePrice * Double(quantity) }
    var totalSaleValue: Double { salePrice * Double(quantity) }
    var totalProfit: Double { profitPerUnit * Double(quantity) }

    var stockState: StockState {
        if !inStock || quantity <= 0 { return .out }
        if quantity <= max(lowStockThreshold, 0) { return .low }
        return .ok
    }

    /// Категория для отображения: пустую заменяем на «Без категории».
    var displayCategory: String {
        let trimmed = category.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? Product.uncategorizedTitle : trimmed
    }

    static let uncategorizedTitle = "Без категории"

    func touch() { updatedAt = .now }
}

// MARK: - Состояние остатка

enum StockState: Int, CaseIterable, Sendable {
    case ok
    case low
    case out

    var title: String {
        switch self {
        case .ok: "В наличии"
        case .low: "Мало"
        case .out: "Нет в наличии"
        }
    }

    var symbolName: String {
        switch self {
        case .ok: "checkmark.circle.fill"
        case .low: "exclamationmark.triangle.fill"
        case .out: "xmark.circle.fill"
        }
    }
}
