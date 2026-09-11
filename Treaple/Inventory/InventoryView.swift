import SwiftUI
import SwiftData

/// Главный экран: список товаров с поиском, фильтрами, сортировкой,
/// сворачиваемыми секциями по категориям и свайп-действиями.
struct InventoryView: View {

    @Binding var editorRequest: ProductEditorRequest?
    @Binding var requestedFilter: InventoryFilter?

    @Environment(\.modelContext) private var context
    @Environment(CloudSyncMonitor.self) private var syncMonitor

    @Query private var products: [Product]

    @AppStorage(AppSettingsStore.Key.groupByCategory, store: AppSettingsStore.defaults)
    private var groupByCategory: Bool = true

    @State private var model = InventoryViewModel()
    @State private var pendingDeletion: Product?

    var body: some View {
        NavigationStack {
            content
                .background(ScreenBackground())
                .navigationTitle("Склад")
                // Компактный заголовок: на iOS 26 поле поиска занимает строку
                // крупного заголовка, и тот перестаёт отрисовываться вовсе.
                .navigationBarTitleDisplayMode(.inline)
                // Размещение поиска отдаём системе: на iOS 26 закреплённый
                // navigationBarDrawer занимает место крупного заголовка.
                .searchable(
                    text: $model.searchText,
                    prompt: "Поиск по названию или категории"
                )
                .toolbar { toolbarContent }
                .refreshable { await syncMonitor.refresh() }
                .animation(Motion.spring, value: products.count)
                .animation(Motion.snappy, value: model.filter)
                .animation(Motion.snappy, value: model.sort)
                .animation(Motion.snappy, value: model.ascending)
                .animation(Motion.snappy, value: model.collapsedSections)
        }
        .onAppear {
            model.groupByCategory = groupByCategory
            #if DEBUG
            if let filter = LaunchOptions.startFilter { model.filter = filter }
            #endif
        }
        .onChange(of: requestedFilter) { _, newValue in
            guard let newValue else { return }
            withAnimation(Motion.snappy) {
                model.filter = newValue
                model.searchText = ""
            }
            requestedFilter = nil
        }
        .onChange(of: groupByCategory) { _, newValue in
            withAnimation(Motion.spring) { model.groupByCategory = newValue }
        }
        .confirmationDialog(
            "Удалить товар?",
            isPresented: Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } }),
            titleVisibility: .visible,
            presenting: pendingDeletion
        ) { product in
            Button("Удалить «\(product.name)»", role: .destructive) { delete(product) }
            Button("Отмена", role: .cancel) { pendingDeletion = nil }
        } message: { _ in
            Text("Действие нельзя отменить.")
        }
    }

    // MARK: - Содержимое

    @ViewBuilder
    private var content: some View {
        let sections = model.sections(from: products)

        if products.isEmpty {
            emptyLibrary
        } else if sections.allSatisfy(\.products.isEmpty) {
            emptyResults
                .safeAreaInset(edge: .top, spacing: 0) { filterBar }
        } else {
            list(sections)
                .safeAreaInset(edge: .top, spacing: 0) { filterBar }
        }
    }

    private func list(_ sections: [InventorySection]) -> some View {
        List {
            ForEach(sections) { section in
                Section {
                    if !model.isCollapsed(section) {
                        ForEach(section.products) { product in
                            row(product)
                        }
                    }
                } header: {
                    if model.groupByCategory {
                        sectionHeader(section)
                    }
                }
            }

            // Немного воздуха под последней карточкой, чтобы её не поджимал таб-бар.
            Color.clear
                .frame(height: 24)
                .plainListRow(insets: EdgeInsets())
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.immediately)
    }

    private func row(_ product: Product) -> some View {
        // Ссылка лежит под карточкой с нулевой прозрачностью: List всё равно
        // делает всю строку кликабельной, но системная «шеврон»-стрелка,
        // которая ломала бы вёрстку карточки, не рисуется.
        ZStack {
            NavigationLink {
                ProductDetailView(product: product, editorRequest: $editorRequest)
            } label: {
                EmptyView()
            }
            .opacity(0)

            ProductCardView(product: product)
        }
        .plainListRow()
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Haptics.warning()
                pendingDeletion = product
            } label: {
                Label("Удалить", systemImage: "trash.fill")
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            Button {
                Haptics.tap()
                editorRequest = .edit(product)
            } label: {
                Label("Изменить", systemImage: "square.and.pencil")
            }
            .tint(Palette.accent)

            Button {
                Haptics.tap(.medium)
                withAnimation(Motion.spring) {
                    ProductStore.toggleInStock(product, in: context)
                }
            } label: {
                Label(
                    product.inStock ? "Нет в наличии" : "В наличии",
                    systemImage: product.inStock ? "xmark.circle.fill" : "checkmark.circle.fill"
                )
            }
            .tint(product.inStock ? Palette.stockOut : Palette.stockOK)
        }
        .contextMenu { contextMenu(for: product) }
        .transition(.asymmetric(
            insertion: .scale(scale: 0.94).combined(with: .opacity),
            removal: .opacity.combined(with: .scale(scale: 0.9))
        ))
    }

    @ViewBuilder
    private func contextMenu(for product: Product) -> some View {
        Button {
            editorRequest = .edit(product)
        } label: {
            Label("Редактировать", systemImage: "square.and.pencil")
        }

        Button {
            Haptics.tap()
            withAnimation(Motion.snappy) { ProductStore.adjustQuantity(product, by: 1, in: context) }
        } label: {
            Label("Добавить 1 шт.", systemImage: "plus.circle")
        }

        Button {
            Haptics.tap()
            withAnimation(Motion.snappy) { ProductStore.adjustQuantity(product, by: -1, in: context) }
        } label: {
            Label("Списать 1 шт.", systemImage: "minus.circle")
        }
        .disabled(product.quantity <= 0)

        Button {
            editorRequest = .duplicate(product)
        } label: {
            Label("Дублировать", systemImage: "doc.on.doc")
        }

        Divider()

        Button(role: .destructive) {
            pendingDeletion = product
        } label: {
            Label("Удалить", systemImage: "trash")
        }
    }

    private func sectionHeader(_ section: InventorySection) -> some View {
        Button {
            Haptics.selection()
            withAnimation(Motion.spring) { model.toggleCollapse(section) }
        } label: {
            HStack(spacing: 10) {
                Text(section.title).microLabel(Palette.textSecondary)

                Text(Format.quantity(section.totalQuantity))
                    .font(.system(size: 11, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(Palette.textTertiary)

                // Линия дотягивает заголовок до правого края: секции
                // читаются как разделы печатного каталога.
                Hairline()

                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Palette.textTertiary)
                    .rotationEffect(.degrees(model.isCollapsed(section) ? -90 : 0))
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .plainListRow(insets: EdgeInsets(top: 16, leading: Metrics.gutter, bottom: 2, trailing: Metrics.gutter))
    }

    private var filterBar: some View {
        FilterBar(
            selection: $model.filter,
            counts: Dictionary(
                uniqueKeysWithValues: InventoryFilter.allCases.map {
                    ($0, model.count(for: $0, in: products))
                }
            )
        )
        .padding(.horizontal, Metrics.gutter)
        .padding(.bottom, 10)
    }

    // MARK: - Пустые состояния

    private var emptyLibrary: some View {
        ScrollView {
            EmptyStateView(
                symbolName: "shippingbox",
                title: "Пока нет товаров",
                message: "Добавьте первую позицию — приложение само посчитает закупку, продажу, наценку и прибыль.",
                actionTitle: "Добавить товар",
                action: { editorRequest = .create },
                secondaryTitle: "Заполнить примерами",
                secondaryAction: {
                    Haptics.success()
                    withAnimation(Motion.spring) { ProductStore.seedSampleData(in: context) }
                }
            )
            .padding(.top, 40)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    private var emptyResults: some View {
        let isSearching = !model.searchText.trimmingCharacters(in: .whitespaces).isEmpty
        let resetAction: (() -> Void)? = model.filter == .all
            ? nil
            : { withAnimation(Motion.snappy) { model.filter = .all } }

        return ScrollView {
            EmptyStateView(
                symbolName: isSearching ? "magnifyingglass" : "line.3.horizontal.decrease.circle",
                title: isSearching ? "Ничего не найдено" : "Ничего не подходит под фильтр",
                message: isSearching
                    ? "По запросу «\(model.searchText)» товаров нет. Проверьте написание или сбросьте фильтр."
                    : "В этом срезе пока пусто. Попробуйте другой фильтр.",
                tint: Palette.textSecondary,
                actionTitle: resetAction == nil ? nil : "Показать все",
                action: resetAction
            )
            .padding(.top, 24)
        }
        .scrollBounceBehavior(.basedOnSize)
    }

    // MARK: - Тулбар

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                Picker("Сортировка", selection: sortBinding) {
                    ForEach(InventorySort.allCases) { sort in
                        Label(sort.title, systemImage: sort.symbolName).tag(sort)
                    }
                }

                Divider()

                Button {
                    Haptics.selection()
                    withAnimation(Motion.snappy) { model.ascending.toggle() }
                } label: {
                    Label(
                        model.ascending ? "По возрастанию" : "По убыванию",
                        systemImage: model.ascending ? "arrow.up" : "arrow.down"
                    )
                }

                Toggle(isOn: $groupByCategory) {
                    Label("Группировать по категориям", systemImage: "rectangle.3.group")
                }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 15, weight: .semibold))
            }
            .accessibilityLabel("Сортировка и группировка")
        }

        ToolbarItem(placement: .topBarTrailing) {
            Button {
                Haptics.tap(.medium)
                editorRequest = .create
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .semibold))
            }
            .accessibilityLabel("Добавить товар")
        }
    }

    private var sortBinding: Binding<InventorySort> {
        Binding(
            get: { model.sort },
            set: { newValue in
                Haptics.selection()
                withAnimation(Motion.snappy) { model.setSort(newValue) }
            }
        )
    }

    // MARK: - Действия

    private func delete(_ product: Product) {
        Haptics.success()
        withAnimation(Motion.spring) {
            ProductStore.delete(product, in: context)
        }
        pendingDeletion = nil
    }
}

private struct InventoryPreview: View {
    @State private var request: ProductEditorRequest?
    @State private var filter: InventoryFilter?

    var body: some View {
        InventoryView(editorRequest: $request, requestedFilter: $filter)
            .environment(CloudSyncMonitor())
            .modelContainer(PersistenceController.makePreviewContainer())
    }
}

#Preview {
    InventoryPreview()
}
