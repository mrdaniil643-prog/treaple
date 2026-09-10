import Foundation

/// Что именно открывает редактор. Используется как `item` для `.sheet`.
enum ProductEditorRequest: Identifiable, Hashable {
    case create
    case edit(Product)
    case duplicate(Product)

    var id: String {
        switch self {
        case .create: "create"
        case .edit(let product): "edit-\(product.id.uuidString)"
        case .duplicate(let product): "duplicate-\(product.id.uuidString)"
        }
    }

    var title: String {
        switch self {
        case .create: "Новый товар"
        case .edit: "Редактирование"
        case .duplicate: "Копия товара"
        }
    }

    /// Товар, который редактируем на месте. Для копии и создания — `nil`:
    /// в этих случаях объект появится в базе только после сохранения.
    var existingProduct: Product? {
        if case .edit(let product) = self { return product }
        return nil
    }

    var sourceProduct: Product? {
        switch self {
        case .create: nil
        case .edit(let product), .duplicate(let product): product
        }
    }
}
