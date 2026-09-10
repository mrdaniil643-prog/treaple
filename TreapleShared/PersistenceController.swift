import Foundation
import SwiftData

/// Сборка `ModelContainer`.
///
/// Стор лежит в App Group — так его видит и приложение, и виджет.
/// Приложение открывает стор с `cloudKitDatabase: .automatic` (синхронизация через
/// приватную базу iCloud пользователя, без ручного логина), виджет — только на чтение,
/// без CloudKit, чтобы не требовать лишних entitlements.
enum PersistenceController {

    static let schema = Schema([Product.self])

    /// Файл базы внутри App Group. Если группа недоступна — падаем на Application Support.
    static var storeURL: URL {
        let name = "Treaple.store"
        if let container = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: AppSettingsStore.appGroupID
        ) {
            return container.appendingPathComponent(name)
        }
        let fallback = URL.applicationSupportDirectory
        try? FileManager.default.createDirectory(at: fallback, withIntermediateDirectories: true)
        return fallback.appendingPathComponent(name)
    }

    /// Контейнер приложения: локальное хранилище + автоматическая синхронизация CloudKit.
    @MainActor
    static func makeAppContainer() -> ModelContainer {
        let configuration = ModelConfiguration(
            schema: schema,
            url: storeURL,
            cloudKitDatabase: .private(AppSettingsStore.cloudKitContainerID)
        )
        do {
            return try ModelContainer(for: schema, configurations: configuration)
        } catch {
            // CloudKit может быть недоступен (нет профиля, симулятор без iCloud,
            // отсутствует capability). Работаем локально, но не роняем приложение.
            let local = ModelConfiguration(schema: schema, url: storeURL, cloudKitDatabase: .none)
            if let container = try? ModelContainer(for: schema, configurations: local) {
                return container
            }
            fatalError("Не удалось открыть хранилище: \(error.localizedDescription)")
        }
    }

    /// Контейнер виджета: тот же файл, только чтение, без CloudKit.
    static func makeWidgetContainer() throws -> ModelContainer {
        let configuration = ModelConfiguration(
            schema: schema,
            url: storeURL,
            allowsSave: false,
            cloudKitDatabase: .none
        )
        return try ModelContainer(for: schema, configurations: configuration)
    }

    /// Контейнер в памяти — для превью и тестов.
    @MainActor
    static func makePreviewContainer(seeded: Bool = true) -> ModelContainer {
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        // swiftlint:disable:next force_try
        let container = try! ModelContainer(for: schema, configurations: configuration)
        if seeded {
            for product in Product.sampleProducts {
                container.mainContext.insert(product)
            }
        }
        return container
    }
}
