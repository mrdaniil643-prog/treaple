#if DEBUG
import Foundation

/// Аргументы запуска для отладки и автоматических скриншотов.
///
/// `simctl openurl` показал бы системный диалог подтверждения, поэтому CI
/// перезапускает приложение с нужным аргументом, а не открывает deep link.
enum LaunchOptions {

    /// `-seedDemoData` — наполнить пустую базу примерами.
    static var seedsDemoData: Bool {
        CommandLine.arguments.contains("-seedDemoData")
    }

    /// `-startTab dashboard|settings|inventory`
    static var startTab: RootView.Tab? {
        switch value(for: "-startTab") {
        case "inventory": .inventory
        case "dashboard": .dashboard
        case "settings": .settings
        default: nil
        }
    }

    /// `-startFilter low|out|all`
    static var startFilter: InventoryFilter? {
        guard let raw = value(for: "-startFilter") else { return nil }
        return InventoryFilter(rawValue: raw)
    }

    private static func value(for flag: String) -> String? {
        let arguments = CommandLine.arguments
        guard let index = arguments.firstIndex(of: flag), index + 1 < arguments.count else {
            return nil
        }
        return arguments[index + 1]
    }
}
#endif
