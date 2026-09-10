import Foundation
import CoreData
import CloudKit
import Observation

/// Наблюдает за синхронизацией SwiftData ↔ CloudKit.
///
/// SwiftData не публикует свой статус напрямую, но под капотом работает
/// `NSPersistentCloudKitContainer` — его события мы и слушаем. Плюс отдельно
/// проверяем статус аккаунта iCloud, чтобы отличить «нет сети» от «нет профиля».
@Observable
final class CloudSyncMonitor {

    enum Status: Equatable {
        case unknown
        case syncing
        case upToDate(Date?)
        case noAccount
        /// У сборки нет capability iCloud — синхронизации не будет в принципе.
        case notConfigured
        case failed(String)

        var title: String {
            switch self {
            case .unknown: "Проверяем…"
            case .syncing: "Синхронизация…"
            case .upToDate: "Данные актуальны"
            case .noAccount: "iCloud не подключён"
            case .notConfigured: "Только на этом устройстве"
            case .failed: "Ошибка синхронизации"
            }
        }

        var symbolName: String {
            switch self {
            case .unknown: "icloud"
            case .syncing: "arrow.triangle.2.circlepath.icloud"
            case .upToDate: "checkmark.icloud.fill"
            case .noAccount: "exclamationmark.icloud.fill"
            case .notConfigured: "iphone"
            case .failed: "xmark.icloud.fill"
            }
        }
    }

    private(set) var status: Status = .unknown
    private(set) var lastSyncDate: Date? = AppSettingsStore.lastSyncDate

    @ObservationIgnored private var observer: NSObjectProtocol?

    init() {
        guard AppSettingsStore.hasEntitlements else {
            status = .notConfigured
            return
        }

        observer = NotificationCenter.default.addObserver(
            forName: NSPersistentCloudKitContainer.eventChangedNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handle(notification)
        }

        Task { await refresh() }
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
    }

    /// Ручное обновление: pull-to-refresh на списке и кнопка в настройках.
    @MainActor
    func refresh() async {
        // Без entitlements `CKContainer(identifier:)` не просто вернёт ошибку,
        // а бросит исключение — до него доходить нельзя.
        guard AppSettingsStore.hasEntitlements else {
            status = .notConfigured
            return
        }

        if case .syncing = status {} else {
            status = .unknown
        }

        do {
            let accountStatus = try await CKContainer(
                identifier: AppSettingsStore.cloudKitContainerID
            ).accountStatus()

            switch accountStatus {
            case .available:
                status = .upToDate(lastSyncDate)
            case .noAccount:
                status = .noAccount
            case .restricted:
                status = .failed("Доступ к iCloud ограничен настройками устройства")
            case .couldNotDetermine, .temporarilyUnavailable:
                status = .failed("iCloud временно недоступен")
            @unknown default:
                status = .unknown
            }
        } catch {
            status = .failed(error.localizedDescription)
        }

        // Минимальная пауза, чтобы pull-to-refresh не «моргал».
        try? await Task.sleep(for: .milliseconds(350))
    }

    @MainActor
    private func apply(endDate: Date?, errorDescription: String?) {
        guard let endDate else {
            status = .syncing
            return
        }

        if let errorDescription {
            status = .failed(errorDescription)
            return
        }

        lastSyncDate = endDate
        AppSettingsStore.lastSyncDate = endDate
        status = .upToDate(endDate)
    }

    /// Из уведомления вытаскиваем только простые значения: сам `Event` не `Sendable`,
    /// и переносить его на другой актор нельзя.
    private nonisolated func handle(_ notification: Notification) {
        guard let event = notification.userInfo?[
            NSPersistentCloudKitContainer.eventNotificationUserInfoKey
        ] as? NSPersistentCloudKitContainer.Event else { return }

        let endDate = event.endDate
        let errorDescription = event.error?.localizedDescription

        Task { @MainActor [weak self] in
            self?.apply(endDate: endDate, errorDescription: errorDescription)
        }
    }
}
