import Foundation

/// Форматирование денег, процентов и дат в едином стиле по всему приложению.
enum Format {

    static var locale: Locale { Locale(identifier: "ru_RU") }

    /// Цена с символом валюты. Копейки показываем только если они есть.
    static func money(_ value: Double, code: String = AppSettingsStore.currencyCode) -> String {
        let hasFraction = abs(value.truncatingRemainder(dividingBy: 1)) > 0.001
        return value.formatted(
            .currency(code: code)
                .locale(locale)
                .precision(.fractionLength(hasFraction ? 2 : 0))
        )
    }

    /// Компактная запись для крупных сумм на дашборде: 1,2 млн / 348 тыс.
    static func compactMoney(_ value: Double, code: String = AppSettingsStore.currencyCode) -> String {
        let symbol = currencySymbol(for: code)
        let magnitude = abs(value)
        switch magnitude {
        case 1_000_000...:
            return "\(decimal(value / 1_000_000, digits: 1)) млн \(symbol)"
        case 100_000...:
            return "\(decimal(value / 1_000, digits: 0)) тыс. \(symbol)"
        default:
            return money(value, code: code)
        }
    }

    static func percent(_ value: Double, digits: Int = 1) -> String {
        "\(decimal(value, digits: digits)) %"
    }

    static func decimal(_ value: Double, digits: Int = 1) -> String {
        value.formatted(.number.locale(locale).precision(.fractionLength(0...digits)))
    }

    static func integer(_ value: Int) -> String {
        value.formatted(.number.locale(locale))
    }

    /// «шт.» с правильным окончанием для количества.
    static func quantity(_ value: Int) -> String {
        "\(integer(value)) шт."
    }

    static func relativeDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: .now)
    }

    static func dateTime(_ date: Date) -> String {
        date.formatted(.dateTime.locale(locale).day().month(.abbreviated).hour().minute())
    }

    static func currencySymbol(for code: String) -> String {
        var components = Locale.Components(locale: locale)
        components.currency = Locale.Currency(code)
        return Locale(components: components).currencySymbol ?? code
    }

    /// Разбор строки из текстового поля: принимаем и запятую, и точку.
    static func parseDouble(_ text: String) -> Double? {
        let normalized = text
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\u{00A0}", with: "")
            .replacingOccurrences(of: ",", with: ".")
        guard !normalized.isEmpty else { return nil }
        return Double(normalized)
    }

    /// Строковое представление для редактируемого поля: без хвостовых нулей.
    static func editable(_ value: Double) -> String {
        guard value != 0 else { return "" }
        if abs(value.rounded() - value) < 0.001 {
            return String(Int(value.rounded()))
        }
        return String(format: "%.2f", value).replacingOccurrences(of: ".", with: ",")
    }
}
