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
        Appearance.applyGlobalStyling()
    }

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

/// Точечные настройки UIKit-слоя, которых нет в SwiftUI-API.
enum Appearance {
    static func applyGlobalStyling() {
        // Крупные заголовки навигации — плотнее и контрастнее системных.
        let largeTitle = UINavigationBarAppearance()
        largeTitle.configureWithTransparentBackground()
        largeTitle.largeTitleTextAttributes = [
            .font: UIFont.systemFont(ofSize: 34, weight: .bold),
            .kern: -0.6
        ]
        largeTitle.titleTextAttributes = [.font: UIFont.systemFont(ofSize: 17, weight: .semibold)]

        let scrolled = UINavigationBarAppearance()
        scrolled.configureWithDefaultBackground()
        scrolled.largeTitleTextAttributes = largeTitle.largeTitleTextAttributes
        scrolled.titleTextAttributes = largeTitle.titleTextAttributes

        UINavigationBar.appearance().standardAppearance = largeTitle
        UINavigationBar.appearance().compactAppearance = scrolled
        UINavigationBar.appearance().scrollEdgeAppearance = largeTitle
    }
}
