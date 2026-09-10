import Foundation
import SwiftData
import WidgetKit

/// Операции над товарами в одном месте: каждая правка обновляет `updatedAt`,
/// сохраняет контекст и просит виджет перерисоваться.
@MainActor
enum ProductStore {

    static func insert(_ product: Product, in context: ModelContext) {
        product.touch()
        context.insert(product)
        commit(context)
    }

    static func delete(_ product: Product, in context: ModelContext) {
        context.delete(product)
        commit(context)
    }

    static func delete(_ products: [Product], in context: ModelContext) {
        for product in products { context.delete(product) }
        commit(context)
    }

    static func toggleInStock(_ product: Product, in context: ModelContext) {
        product.inStock.toggle()
        // Товар без остатка, помеченный «в наличии», — противоречие.
        // Возвращаем минимальный остаток, чтобы состояние оставалось честным.
        if product.inStock && product.quantity <= 0 {
            product.quantity = 1
        }
        product.touch()
        commit(context)
    }

    static func adjustQuantity(_ product: Product, by delta: Int, in context: ModelContext) {
        product.quantity = max(0, product.quantity + delta)
        product.inStock = product.quantity > 0
        product.touch()
        commit(context)
    }

    static func seedSampleData(in context: ModelContext) {
        for product in Product.sampleProducts { context.insert(product) }
        commit(context)
    }

    static func commit(_ context: ModelContext) {
        do {
            try context.save()
            // Дату последней синхронизации ставит CloudSyncMonitor по событиям CloudKit —
            // локальное сохранение ещё не значит, что данные уехали в iCloud.
            WidgetCenter.shared.reloadTimelines(ofKind: AppSettingsStore.lowStockWidgetKind)
        } catch {
            assertionFailure("Не удалось сохранить изменения: \(error)")
        }
    }

    /// Уже использованные категории — для автодополнения в редакторе.
    static func existingCategories(in context: ModelContext) -> [String] {
        let descriptor = FetchDescriptor<Product>()
        let products = (try? context.fetch(descriptor)) ?? []
        let names = products
            .map(\.category)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return Array(Set(names)).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
    }
}
