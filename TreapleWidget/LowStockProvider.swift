import WidgetKit
import SwiftData
import Foundation

struct LowStockEntry: TimelineEntry {
    struct Item: Identifiable, Hashable {
        let id: UUID
        let name: String
        let category: String
        let quantity: Int
        let isOut: Bool
    }

    let date: Date
    let totalTitles: Int
    let lowStockCount: Int
    let outOfStockCount: Int
    let items: [Item]
    let isPlaceholder: Bool

    var attentionCount: Int { lowStockCount + outOfStockCount }

    static let placeholder = LowStockEntry(
        date: .now,
        totalTitles: 42,
        lowStockCount: 3,
        outOfStockCount: 1,
        items: [
            Item(id: UUID(), name: "Худи Essentials", category: "Adidas", quantity: 3, isOut: false),
            Item(id: UUID(), name: "Носки высокие", category: "Nike", quantity: 2, isOut: false),
            Item(id: UUID(), name: "Термокружка 500 мл", category: "Аксессуары", quantity: 1, isOut: false),
            Item(id: UUID(), name: "Рюкзак Classic", category: "Herschel", quantity: 0, isOut: true)
        ],
        isPlaceholder: true
    )

    static let empty = LowStockEntry(
        date: .now,
        totalTitles: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        items: [],
        isPlaceholder: false
    )
}

struct LowStockProvider: TimelineProvider {

    func placeholder(in context: Context) -> LowStockEntry {
        .placeholder
    }

    func getSnapshot(in context: Context, completion: @escaping (LowStockEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder)
        } else {
            Task { completion(await loadEntry()) }
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LowStockEntry>) -> Void) {
        Task {
            let entry = await loadEntry()
            // Приложение само дёргает `reloadTimelines` после каждой правки,
            // так что расписание нужно лишь как страховка.
            let next = Calendar.current.date(byAdding: .hour, value: 2, to: .now) ?? .now.addingTimeInterval(7200)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    @MainActor
    private func loadEntry() async -> LowStockEntry {
        guard let container = try? PersistenceController.makeWidgetContainer() else {
            return .empty
        }

        let context = ModelContext(container)
        let descriptor = FetchDescriptor<Product>()
        guard let products = try? context.fetch(descriptor) else { return .empty }

        let low = products.filter { $0.stockState == .low }
        let out = products.filter { $0.stockState == .out }

        let items = (low.sorted { $0.quantity < $1.quantity } + out)
            .prefix(4)
            .map {
                LowStockEntry.Item(
                    id: $0.id,
                    name: $0.name,
                    category: $0.displayCategory,
                    quantity: $0.quantity,
                    isOut: $0.stockState == .out
                )
            }

        return LowStockEntry(
            date: .now,
            totalTitles: products.count,
            lowStockCount: low.count,
            outOfStockCount: out.count,
            items: Array(items),
            isPlaceholder: false
        )
    }
}
