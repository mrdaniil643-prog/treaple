import SwiftUI
import SwiftData
import WidgetKit

/// Настройки: синхронизация, порог остатка, валюта, экспорт и тема.
struct SettingsView: View {

    @Environment(\.modelContext) private var context
    @Environment(CloudSyncMonitor.self) private var syncMonitor

    @Query private var products: [Product]

    @AppStorage(AppSettingsStore.Key.appearance, store: AppSettingsStore.defaults)
    private var appearanceRaw: String = AppearanceMode.system.rawValue

    @AppStorage(AppSettingsStore.Key.lowStockThreshold, store: AppSettingsStore.defaults)
    private var lowStockThreshold: Int = AppSettingsStore.defaultLowStockThresholdFallback

    @AppStorage(AppSettingsStore.Key.currencyCode, store: AppSettingsStore.defaults)
    private var currencyCode: String = "RUB"

    @State private var exportURL: URL?
    @State private var exportError: String?
    @State private var isRefreshing = false
    @State private var showsThresholdApplyConfirmation = false

    private var appearance: AppearanceMode {
        AppearanceMode(rawValue: appearanceRaw) ?? .system
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Metrics.sectionSpacing) {
                    syncCard
                    stockSection
                    appearanceSection
                    exportSection
                    aboutSection
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 4)
                .padding(.bottom, 40)
            }
            .background(ScreenBackground())
            .navigationTitle("Настройки")
        }
        .alert(
            "Не удалось выгрузить файл",
            isPresented: Binding(get: { exportError != nil }, set: { if !$0 { exportError = nil } })
        ) {
            Button("Понятно", role: .cancel) { exportError = nil }
        } message: {
            Text(exportError ?? "")
        }
        .confirmationDialog(
            "Применить порог ко всем товарам?",
            isPresented: $showsThresholdApplyConfirmation,
            titleVisibility: .visible
        ) {
            Button("Применить к \(products.count) товарам") { applyThresholdToAll() }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Индивидуальные пороги будут заменены на \(Format.integer(lowStockThreshold)) шт.")
        }
    }

    // MARK: - Синхронизация

    private var syncCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Image(systemName: syncMonitor.status.symbolName)
                    .font(.system(size: 19, weight: .regular))
                    .foregroundStyle(statusTint)
                    .frame(width: 44, height: 44)
                    .background {
                        Circle()
                            .fill(Palette.surfaceAlt)
                            .overlay { Circle().strokeBorder(Palette.line, lineWidth: Metrics.hairline) }
                    }
                    .rotationEffect(.degrees(isRefreshing ? 360 : 0))
                    .animation(
                        isRefreshing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default,
                        value: isRefreshing
                    )

                VStack(alignment: .leading, spacing: 3) {
                    Text(syncMonitor.status.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Palette.textPrimary)
                    Text(syncDescription)
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }

            Button {
                Task {
                    Haptics.tap()
                    isRefreshing = true
                    await syncMonitor.refresh()
                    isRefreshing = false
                }
            } label: {
                Text("Обновить сейчас")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background {
                        RoundedRectangle(cornerRadius: Metrics.controlRadius, style: .continuous)
                            .strokeBorder(Palette.lineStrong, lineWidth: Metrics.hairline)
                    }
                    .foregroundStyle(Palette.textPrimary)
            }
            .buttonStyle(.pressable)
            .disabled(isRefreshing || syncMonitor.status == .notConfigured)
        }
        .cardSurface(padding: 16)
    }

    private var statusTint: Color {
        switch syncMonitor.status {
        case .upToDate, .syncing, .unknown: Palette.textPrimary
        case .noAccount, .notConfigured, .failed: Palette.textSecondary
        }
    }

    private var syncDescription: String {
        switch syncMonitor.status {
        case .noAccount:
            return "Войдите в iCloud в настройках iPhone — тогда склад появится на всех ваших устройствах."
        case .notConfigured:
            return "В этой сборке iCloud не подключён: данные хранятся только здесь. Включите capability iCloud и App Groups в Xcode, чтобы склад синхронизировался между устройствами."
        case .failed(let message):
            return message
        default:
            guard let date = syncMonitor.lastSyncDate else {
                return "Синхронизация включена — данные уедут в iCloud автоматически."
            }
            return "Последнее обновление \(Format.relativeDate(date))"
        }
    }

    // MARK: - Склад

    private var stockSection: some View {
        FormSection(title: "Склад", subtitle: "Применяется к новым товарам") {
            FormRow(title: "Порог «мало на складе»", systemImage: "exclamationmark.triangle.fill") {
                Stepper(value: $lowStockThreshold, in: 0...999) {
                    Text(Format.quantity(lowStockThreshold))
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.textPrimary)
                }
                .fixedSize()
                .onChange(of: lowStockThreshold) { _, _ in
                    Haptics.selection()
                    WidgetCenter.shared.reloadTimelines(ofKind: AppSettingsStore.lowStockWidgetKind)
                }
            }

            FormRow(title: "Валюта", systemImage: "banknote") {
                Picker("Валюта", selection: $currencyCode) {
                    ForEach(["RUB", "USD", "EUR", "KZT", "BYN"], id: \.self) { code in
                        Text("\(Format.currencySymbol(for: code)) \(code)").tag(code)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .tint(Palette.accent)
            }

            Button {
                Haptics.tap()
                showsThresholdApplyConfirmation = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.textPrimary)
                        .frame(width: 22)
                    Text("Применить порог ко всем товарам")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Palette.textPrimary)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(products.isEmpty)
        }
    }

    // MARK: - Оформление

    private var appearanceSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Оформление")
                .microLabel()
                .padding(.leading, 6)

            HStack(spacing: 10) {
                ForEach(AppearanceMode.allCases) { mode in
                    appearanceOption(mode)
                }
            }
        }
    }

    private func appearanceOption(_ mode: AppearanceMode) -> some View {
        let isActive = appearance == mode
        return Button {
            Haptics.selection()
            withAnimation(Motion.spring) { appearanceRaw = mode.rawValue }
        } label: {
            VStack(spacing: 9) {
                Image(systemName: mode.symbolName)
                    .font(.system(size: 17, weight: .regular))
                Text(mode.title)
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundStyle(isActive ? Palette.inkInverted : Palette.textSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background {
                RoundedRectangle(cornerRadius: Metrics.controlRadius, style: .continuous)
                    .fill(isActive ? Palette.ink : Palette.surface)
            }
            .overlay {
                RoundedRectangle(cornerRadius: Metrics.controlRadius, style: .continuous)
                    .strokeBorder(isActive ? Color.clear : Palette.line, lineWidth: Metrics.hairline)
            }
        }
        .buttonStyle(.pressable)
    }

    // MARK: - Экспорт

    private var exportSection: some View {
        FormSection(title: "Данные") {
            if let exportURL {
                ShareLink(item: exportURL) {
                    exportLabel(
                        title: "Поделиться CSV",
                        subtitle: exportURL.lastPathComponent,
                        symbol: "square.and.arrow.up"
                    )
                }
                .buttonStyle(.plain)
            }

            Button {
                prepareExport()
            } label: {
                exportLabel(
                    title: exportURL == nil ? "Экспорт в CSV" : "Пересобрать файл",
                    subtitle: "\(Format.integer(products.count)) позиций · Excel и Numbers",
                    symbol: "tablecells"
                )
            }
            .buttonStyle(.plain)
            .disabled(products.isEmpty)

            Button {
                Haptics.success()
                withAnimation(Motion.spring) { ProductStore.seedSampleData(in: context) }
            } label: {
                exportLabel(
                    title: "Добавить демо-товары",
                    subtitle: "8 позиций для знакомства с приложением",
                    symbol: "wand.and.stars",
                    showsDivider: false
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func exportLabel(
        title: String,
        subtitle: String,
        symbol: String,
        showsDivider: Bool = true
    ) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.textSecondary)
                    .frame(width: 22)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Palette.textPrimary)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(Palette.textTertiary)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Palette.textTertiary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .contentShape(Rectangle())

            if showsDivider {
                Hairline(inset: 48)
            }
        }
    }

    // MARK: - О приложении

    private var aboutSection: some View {
        VStack(spacing: 6) {
            Text("Treaple").microLabel(Palette.textSecondary)
            Text("Версия \(appVersion) · данные хранятся в вашем iCloud")
                .font(.system(size: 11))
                .foregroundStyle(Palette.textTertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private var appVersion: String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(version) (\(build))"
    }

    // MARK: - Действия

    private func prepareExport() {
        do {
            exportURL = try CSVExport.makeFile(from: products)
            Haptics.success()
        } catch {
            exportError = error.localizedDescription
            Haptics.error()
        }
    }

    private func applyThresholdToAll() {
        for product in products {
            product.lowStockThreshold = lowStockThreshold
            product.touch()
        }
        ProductStore.commit(context)
        Haptics.success()
    }
}

#Preview {
    SettingsView()
        .environment(CloudSyncMonitor())
        .modelContainer(PersistenceController.makePreviewContainer())
}
