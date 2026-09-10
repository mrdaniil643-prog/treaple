import Foundation
import SwiftUI

/// Направление расчёта в калькуляторе наценки.
enum MarkupDirection: String, CaseIterable, Identifiable {
    /// Введена наценка → считаем цену продажи.
    case markupToPrice
    /// Введена цена продажи → показываем наценку.
    case priceToMarkup

    var id: String { rawValue }

    var title: String {
        switch self {
        case .markupToPrice: "Наценка → цена"
        case .priceToMarkup: "Цена → наценка"
        }
    }

    var symbolName: String {
        switch self {
        case .markupToPrice: "percent"
        case .priceToMarkup: "tag"
        }
    }
}

/// Черновик формы. Хранит строки как есть (чтобы «1,5» и «1.5» вводились одинаково),
/// пересчитывает наценку и цену в обе стороны и валидирует поля на лету.
@Observable
final class ProductDraft {

    var name: String = ""
    var category: String = ""
    var purchaseText: String = ""
    var saleText: String = ""
    var markupText: String = ""
    var quantityText: String = ""
    var lowStockThreshold: Int = AppSettingsStore.lowStockThreshold
    var inStock: Bool = true
    var imageData: Data?

    /// Менять только через `toggleDirection()`/`applyMarkupPreset(_:)` —
    /// `@Observable` не дружит с `didSet`, поэтому пересчёт вызываем явно.
    var direction: MarkupDirection = .markupToPrice

    /// Флаг «пользователь уже пытался сохранить» — до этого не подсвечиваем ошибки красным.
    var didAttemptSave = false

    init() {}

    init(copying product: Product) {
        name = product.name
        category = product.category
        purchaseText = Format.editable(product.purchasePrice)
        saleText = Format.editable(product.salePrice)
        markupText = product.purchasePrice > 0 ? Format.editable(product.markupPercent.rounded()) : ""
        quantityText = product.quantity == 0 ? "0" : String(product.quantity)
        lowStockThreshold = product.lowStockThreshold
        inStock = product.inStock
        imageData = product.imageData
        direction = .priceToMarkup
    }

    // MARK: - Разобранные значения

    var purchasePrice: Double { Format.parseDouble(purchaseText) ?? 0 }
    var salePrice: Double { Format.parseDouble(saleText) ?? 0 }
    var markupPercent: Double { Format.parseDouble(markupText) ?? 0 }
    var quantity: Int { Int(quantityText.trimmingCharacters(in: .whitespaces)) ?? 0 }

    var profitPerUnit: Double { salePrice - purchasePrice }

    var marginPercent: Double {
        guard salePrice > 0 else { return 0 }
        return profitPerUnit / salePrice * 100
    }

    var totalProfit: Double { profitPerUnit * Double(quantity) }

    // MARK: - Калькулятор

    /// Вызывается при правке любого из трёх связанных полей.
    func recalculate() {
        switch direction {
        case .markupToPrice:
            guard purchasePrice > 0, !markupText.isEmpty else { return }
            let computed = purchasePrice * (1 + markupPercent / 100)
            saleText = Format.editable((computed * 100).rounded() / 100)
        case .priceToMarkup:
            guard purchasePrice > 0, !saleText.isEmpty else {
                markupText = ""
                return
            }
            let computed = (salePrice - purchasePrice) / purchasePrice * 100
            markupText = Format.editable((computed * 10).rounded() / 10)
        }
    }

    func toggleDirection() {
        direction = direction == .markupToPrice ? .priceToMarkup : .markupToPrice
        recalculate()
    }

    /// Быстрые пресеты наценки — самый частый сценарий заполнения.
    func applyMarkupPreset(_ percent: Int) {
        direction = .markupToPrice
        markupText = String(percent)
        recalculate()
    }

    // MARK: - Валидация

    enum Field: Hashable {
        case name, category, purchase, sale, quantity
    }

    var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    func error(for field: Field) -> String? {
        switch field {
        case .name:
            return trimmedName.isEmpty ? "Введите название товара" : nil

        case .purchase:
            guard !purchaseText.isEmpty else { return nil }
            guard let value = Format.parseDouble(purchaseText) else { return "Введите число" }
            return value < 0 ? "Цена не может быть отрицательной" : nil

        case .sale:
            guard !saleText.isEmpty else { return nil }
            guard let value = Format.parseDouble(saleText) else { return "Введите число" }
            return value < 0 ? "Цена не может быть отрицательной" : nil

        case .quantity:
            guard !quantityText.isEmpty else { return nil }
            guard let value = Int(quantityText.trimmingCharacters(in: .whitespaces)) else {
                return "Введите целое число"
            }
            return value < 0 ? "Количество не может быть отрицательным" : nil

        case .category:
            return nil
        }
    }

    /// Не ошибка, но стоит показать: продаём дешевле, чем купили.
    var lossWarning: String? {
        guard purchasePrice > 0, salePrice > 0, salePrice < purchasePrice else { return nil }
        return "Цена продажи ниже закупки — сделка в минус"
    }

    var isValid: Bool {
        Field.allFields.allSatisfy { error(for: $0) == nil }
    }

    // MARK: - Применение к модели

    func apply(to product: Product) {
        product.name = trimmedName
        product.category = category.trimmingCharacters(in: .whitespacesAndNewlines)
        product.purchasePrice = max(purchasePrice, 0)
        product.salePrice = max(salePrice, 0)
        product.quantity = max(quantity, 0)
        product.lowStockThreshold = max(lowStockThreshold, 0)
        // Нулевой остаток и «в наличии» одновременно — противоречие, приводим к остатку.
        product.inStock = max(quantity, 0) > 0 ? inStock : false
        product.imageData = imageData
        product.touch()
    }
}

extension ProductDraft.Field {
    static var allFields: [ProductDraft.Field] { [.name, .category, .purchase, .sale, .quantity] }
}
