import SwiftUI
import SwiftData

/// Корневая навигация: три вкладки — склад, дашборд, настройки.
struct RootView: View {

    enum Tab: Hashable {
        case inventory, dashboard, settings
    }

    @State private var selection: Tab = .inventory
    @State private var editorRequest: ProductEditorRequest?
    /// Фильтр, запрошенный извне — тапом по виджету или переходом с дашборда.
    @State private var requestedFilter: InventoryFilter?

    var body: some View {
        TabView(selection: $selection) {
            InventoryView(editorRequest: $editorRequest, requestedFilter: $requestedFilter)
                .tabItem { Label("Склад", systemImage: "shippingbox.fill") }
                .tag(Tab.inventory)

            DashboardView(onSelectLowStock: { showInventory(filter: .low) })
                .tabItem { Label("Дашборд", systemImage: "chart.bar.xaxis") }
                .tag(Tab.dashboard)

            SettingsView()
                .tabItem { Label("Настройки", systemImage: "gearshape.fill") }
                .tag(Tab.settings)
        }
        .background(Palette.canvas)
        .sheet(item: $editorRequest) { request in
            ProductEditorView(request: request)
        }
        .onOpenURL { url in
            // treaple://low-stock — открывается тапом по виджету.
            guard url.scheme == "treaple" else { return }
            switch url.host {
            case "low-stock": showInventory(filter: .low)
            case "add": editorRequest = .create
            default: showInventory(filter: nil)
            }
        }
    }

    private func showInventory(filter: InventoryFilter?) {
        withAnimation(Motion.spring) {
            selection = .inventory
            requestedFilter = filter
        }
    }
}

#Preview {
    RootView()
        .modelContainer(PersistenceController.makePreviewContainer())
        .environment(CloudSyncMonitor())
}
