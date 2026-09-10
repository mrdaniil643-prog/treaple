import Foundation

/// Единая точка доступа к пользовательским настройкам.
///
/// Настройки живут в App Group, поэтому виджет читает те же значения, что и приложение.
enum AppSettingsStore {
    /// App Group. Должен совпадать со значением в обоих `.entitlements`.
    static let appGroupID = "group.com.treaple.inventory"

    /// Контейнер CloudKit. Должен совпадать со значением в `Treaple.entitlements`.
    static let cloudKitContainerID = "iCloud.com.treaple.inventory"

    /// Имя kind для виджета — используется и в виджете, и при `reloadTimelines`.
    static let lowStockWidgetKind = "TreapleLowStockWidget"

    static let defaultLowStockThresholdFallback = 3

    enum Key {
        static let lowStockThreshold = "settings.lowStockThreshold"
        static let appearance = "settings.appearance"
        static let currencyCode = "settings.currencyCode"
        static let groupByCategory = "settings.groupByCategory"
        static let lastSyncDate = "settings.lastSyncDate"
    }

    /// `UserDefaults` App Group с откатом на `.standard`, если группа не сконфигурирована
    /// (например, при запуске в превью или до настройки capability).
    static let defaults: UserDefaults = UserDefaults(suiteName: appGroupID) ?? .standard

    /// Настроены ли capability у этой сборки.
    ///
    /// App Group и iCloud включаются вместе, поэтому доступность контейнера группы —
    /// надёжный признак того, что и CloudKit трогать можно. На неподписанной сборке
    /// (CI, симулятор без команды разработчика) их нет: обращение к CloudKit там
    /// не просто вернёт ошибку, а уронит приложение на старте.
    static var hasEntitlements: Bool {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) != nil
    }

    static var lowStockThreshold: Int {
        get {
            let stored = defaults.integer(forKey: Key.lowStockThreshold)
            return stored > 0 ? stored : defaultLowStockThresholdFallback
        }
        set { defaults.set(max(newValue, 0), forKey: Key.lowStockThreshold) }
    }

    static var currencyCode: String {
        get { defaults.string(forKey: Key.currencyCode) ?? "RUB" }
        set { defaults.set(newValue, forKey: Key.currencyCode) }
    }

    static var lastSyncDate: Date? {
        get {
            let value = defaults.double(forKey: Key.lastSyncDate)
            return value > 0 ? Date(timeIntervalSince1970: value) : nil
        }
        set { defaults.set(newValue?.timeIntervalSince1970 ?? 0, forKey: Key.lastSyncDate) }
    }
}

/// Режим оформления, выбранный пользователем.
enum AppearanceMode: String, CaseIterable, Identifiable, Sendable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "Системная"
        case .light: "Светлая"
        case .dark: "Тёмная"
        }
    }

    var symbolName: String {
        switch self {
        case .system: "iphone"
        case .light: "sun.max.fill"
        case .dark: "moon.fill"
        }
    }
}
