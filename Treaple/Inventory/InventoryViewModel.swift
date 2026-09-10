import Foundation
import SwiftUI

// MARK: - Фильтр

enum InventoryFilter: String, CaseIterable, Identifiable, Hashable {
    case all
    case low
    case out

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "Все"
        case .low: "Мало"
        case .out: "Нет"
        }
    }

    var symbolName: String {
        switch self {
        case .all: "square.stack.3d.up.fill"
        case .low: "exclamationmark.triangle.fill"
        case .out: "xmark.circle.fill"
        }
    }

    func matches(_ product: Product) -> Bool {
        switch self {
        case .all: true
        case .low: product.stockState == .low
        case .out: product.stockState == .out
        }
    }
}

// MARK: - Сортировка

enum InventorySort: String, CaseIterable, Identifiable, Hashable {
    case name
    case salePrice
    case quantity
    case updatedAt

    var id: String { rawValue }

    var title: String {
        switch self {
        case .name: "По названию"
        case .salePrice: "По цене продажи"
        case .quantity: "По остатку"
        case .updatedAt: "По дате обновления"
        }
    }

    var symbolName: String {
        switch self {
        case .name: "textformat.abc"
        case .salePrice: "rublesign.circle"
        case .quantity: "number"
        case .updatedAt: "clock.arrow.circlepath"
        }
    }

    /// По умолчанию имя растёт от А до Я, а числа и даты — от больших к меньшим.
    var defaultAscending: Bool { self == .name }

    func areInIncreasingOrder(_ lhs: Product, _ rhs: Product) -> Bool {
        switch self {
        case .name:
            lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
        case .salePrice:
            lhs.salePrice == rhs.salePrice
                ? lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
                : lhs.salePrice < rhs.salePrice
        case .quantity:
            lhs.quantity == rhs.quantity
                ? lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
                : lhs.quantity < rhs.quantity
        case .updatedAt:
            lhs.updatedAt < rhs.updatedAt
        }
    }
}

// MARK: - Секция списка

struct InventorySection: Identifiable, Hashable {
    let id: String
    let title: String
    let products: [Product]

    var totalQuantity: Int { products.reduce(0) { $0 + $1.quantity } }
}

// MARK: - Состояние экрана

/// Держит поиск, фильтр, сортировку и свёрнутые секции; превращает массив
/// товаров из `@Query` в готовые к отрисовке секции.
@Observable
final class InventoryViewModel {

    var searchText: String = ""
    var filter: InventoryFilter = .all
    var sort: InventorySort = .name
    var ascending: Bool = InventorySort.name.defaultAscending
    var groupByCategory: Bool = true
    var collapsedSections: Set<String> = []

    func setSort(_ newSort: InventorySort) {
        if sort == newSort {
            ascending.toggle()
        } else {
            sort = newSort
            ascending = newSort.defaultAscending
        }
    }

    func isCollapsed(_ section: InventorySection) -> Bool {
        collapsedSections.contains(section.id)
    }

    func toggleCollapse(_ section: InventorySection) {
        if collapsedSections.contains(section.id) {
            collapsedSections.remove(section.id)
        } else {
            collapsedSections.insert(section.id)
        }
    }

    /// Количество товаров, попадающих под фильтр (для бейджей на сегмент-контроле).
    func count(for filter: InventoryFilter, in products: [Product]) -> Int {
        products.filter(filter.matches).count
    }

    func sections(from products: [Product]) -> [InventorySection] {
        let matching = products
            .filter(filter.matches)
            .filter(matchesSearch)

        guard groupByCategory else {
            return [InventorySection(id: "all", title: "Все товары", products: sorted(matching))]
        }

        let grouped = Dictionary(grouping: matching, by: \.displayCategory)
        return grouped
            .map { InventorySection(id: $0.key, title: $0.key, products: sorted($0.value)) }
            .sorted { lhs, rhs in
                // «Без категории» всегда в конце списка.
                if lhs.title == Product.uncategorizedTitle { return false }
                if rhs.title == Product.uncategorizedTitle { return true }
                return lhs.title.localizedStandardCompare(rhs.title) == .orderedAscending
            }
    }

    private func sorted(_ products: [Product]) -> [Product] {
        products.sorted { lhs, rhs in
            ascending
                ? sort.areInIncreasingOrder(lhs, rhs)
                : sort.areInIncreasingOrder(rhs, lhs)
        }
    }

    private func matchesSearch(_ product: Product) -> Bool {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return true }
        return product.name.localizedCaseInsensitiveContains(query)
            || product.category.localizedCaseInsensitiveContains(query)
    }
}
