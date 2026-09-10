import SwiftUI
import SwiftData

@main
struct TreapleApp: App {

    @AppStorage(AppSettingsStore.Key.appearance, store: AppSettingsStore.defaults)
    private var appearanceRaw: String = AppearanceMode.system.rawValue

    private let container: ModelContainer
    @State private var syncMonitor = CloudSyncMonitor()

    init() {
        container = PersistenceController.makeAppContainer()
        #if DEBUG
        Self.seedDemoDataIfRequested(in: container)
        #endif
    }

    #if DEBUG
    /// Запуск с аргументом `-seedDemoData` наполняет пустую базу примерами.
    /// Нужно для автоматических скриншотов на CI и удобно при отладке.
    @MainActor
    private static func seedDemoDataIfRequested(in container: ModelContainer) {
        guard LaunchOptions.seedsDemoData else { return }
        let context = container.mainContext
        let existing = (try? context.fetch(FetchDescriptor<Product>())) ?? []
        guard existing.isEmpty else { return }
        for product in Product.sampleProducts { context.insert(product) }
        try? context.save()
    }
    #endif

    private var appearance: AppearanceMode {
        AppearanceMode(rawValue: appearanceRaw) ?? .system
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(syncMonitor)
                .preferredColorScheme(appearance.colorScheme)
                .tint(Palette.accent)
        }
        .modelContainer(container)
    }
}

extension AppearanceMode {
    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}
