import SwiftUI
import SwiftData
import PhotosUI

/// Карточка товара: создание, редактирование и дублирование.
struct ProductEditorView: View {

    let request: ProductEditorRequest

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var draft: ProductDraft
    @State private var categories: [String] = []
    @State private var photoItem: PhotosPickerItem?
    @State private var showsCamera = false

    @FocusState private var focus: ProductDraft.Field?

    init(request: ProductEditorRequest) {
        self.request = request
        if let source = request.sourceProduct {
            let copy = ProductDraft(copying: source)
            if case .duplicate = request {
                copy.name = "\(source.name) (копия)"
            }
            _draft = State(initialValue: copy)
        } else {
            _draft = State(initialValue: ProductDraft())
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    photoSection
                    mainSection
                    pricingSection
                    stockSection
                    summaryCard
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(ScreenBackground())
            .navigationTitle(request.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .toolbar { keyboardToolbar }
        }
        .presentationDragIndicator(.visible)
        .task { categories = ProductStore.existingCategories(in: context) }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task { await loadPhoto(item) }
        }
        .fullScreenCover(isPresented: $showsCamera) {
            CameraPicker { image in
                withAnimation(Motion.spring) {
                    draft.imageData = image.inventoryThumbnailData()
                }
                Haptics.success()
            }
            .ignoresSafeArea()
        }
    }

    // MARK: - Фото

    private var photoSection: some View {
        VStack(spacing: 14) {
            ZStack {
                if let data = draft.imageData, let image = UIImage(data: data) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                        .transition(.opacity.combined(with: .scale(scale: 0.96)))
                } else {
                    ZStack {
                        Palette.accentWash
                        VStack(spacing: 8) {
                            Image(systemName: "camera")
                                .font(.system(size: 22, weight: .regular))
                            Text("Фото товара").microLabel(Palette.accent.opacity(0.8))
                        }
                        .foregroundStyle(Palette.accent.opacity(0.8))
                    }
                }
            }
            .frame(width: 132, height: 132)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Palette.line, lineWidth: Metrics.hairline)
            }

            HStack(spacing: 8) {
                PhotosPicker(selection: $photoItem, matching: .images, photoLibrary: .shared()) {
                    HStack(spacing: 5) {
                        Image(systemName: "photo.on.rectangle")
                            .font(.caption2.weight(.bold))
                        Text("Галерея")
                            .font(.footnote.weight(.semibold))
                    }
                    .foregroundStyle(Palette.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background { Capsule(style: .continuous).fill(Palette.accent.opacity(0.11)) }
                }

                if CameraPicker.isAvailable {
                    PillButton(title: "Камера", systemImage: "camera.fill") {
                        showsCamera = true
                    }
                }

                if draft.imageData != nil {
                    PillButton(title: "Убрать", systemImage: "trash", tint: Palette.danger) {
                        withAnimation(Motion.spring) { draft.imageData = nil }
                        photoItem = nil
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
    }

    // MARK: - Основное

    private var mainSection: some View {
        FormSection(title: "Товар") {
            FormRow(
                title: "Название",
                systemImage: "tag.fill",
                error: draft.error(for: .name),
                showsError: draft.didAttemptSave || (focus != .name && !draft.name.isEmpty)
            ) {
                TextField("Кроссовки Air Zoom", text: $draft.name)
                    .textInputAutocapitalization(.sentences)
                    .focused($focus, equals: .name)
                    .submitLabel(.next)
                    .onSubmit { focus = .category }
            }

            FormRow(title: "Категория", systemImage: "square.grid.2x2.fill", showsDivider: !categorySuggestions.isEmpty) {
                TextField("Бренд или группа", text: $draft.category)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .category)
                    .submitLabel(.next)
                    .onSubmit { focus = .purchase }
            }

            if !categorySuggestions.isEmpty {
                categorySuggestionRow
            }
        }
    }

    /// Автодополнение по уже заведённым категориям.
    private var categorySuggestions: [String] {
        let query = draft.category.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return Array(categories.prefix(6)) }
        let matches = categories.filter {
            $0.localizedCaseInsensitiveContains(query) && $0.localizedCaseInsensitiveCompare(query) != .orderedSame
        }
        return Array(matches.prefix(6))
    }

    private var categorySuggestionRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(categorySuggestions, id: \.self) { suggestion in
                    Button {
                        Haptics.selection()
                        withAnimation(Motion.snappy) { draft.category = suggestion }
                    } label: {
                        Text(suggestion)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Palette.textSecondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background {
                                Capsule(style: .continuous).fill(Palette.surfaceAlt)
                            }
                            .overlay {
                                Capsule(style: .continuous)
                                    .strokeBorder(Palette.line, lineWidth: Metrics.hairline)
                            }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
        }
    }

    // MARK: - Цены и наценка

    private var pricingSection: some View {
        FormSection(
            title: "Цены",
            subtitle: draft.direction == .markupToPrice
                ? "Введите наценку — цена продажи посчитается сама"
                : "Введите цену продажи — наценка посчитается сама"
        ) {
            FormRow(
                title: "Цена закупки",
                systemImage: "arrow.down.circle.fill",
                error: draft.error(for: .purchase),
                showsError: !draft.purchaseText.isEmpty
            ) {
                priceField(text: $draft.purchaseText, field: .purchase)
            }

            FormRow(title: "Наценка", systemImage: "percent", showsDivider: true) {
                HStack(spacing: 6) {
                    TextField("0", text: $draft.markupText)
                        .keyboardType(.decimalPad)
                        .frame(maxWidth: 90)
                        .monospacedDigit()
                        .disabled(draft.direction == .priceToMarkup)
                        .foregroundStyle(
                            draft.direction == .priceToMarkup ? Palette.textSecondary : Palette.textPrimary
                        )
                        .onChange(of: draft.markupText) { _, _ in
                            guard draft.direction == .markupToPrice else { return }
                            draft.recalculate()
                        }
                    Text("%")
                        .font(.subheadline)
                        .foregroundStyle(Palette.textTertiary)
                }
            }

            FormRow(
                title: "Цена продажи",
                systemImage: "arrow.up.circle.fill",
                error: draft.error(for: .sale),
                showsError: !draft.saleText.isEmpty,
                showsDivider: true
            ) {
                priceField(text: $draft.saleText, field: .sale)
                    .disabled(draft.direction == .markupToPrice)
                    .foregroundStyle(
                        draft.direction == .markupToPrice ? Palette.textSecondary : Palette.textPrimary
                    )
            }

            calculatorControls
        }
    }

    private func priceField(text: Binding<String>, field: ProductDraft.Field) -> some View {
        HStack(spacing: 4) {
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .focused($focus, equals: field)
                .frame(maxWidth: 110)
                .monospacedDigit()
                .onChange(of: text.wrappedValue) { _, _ in draft.recalculate() }
            Text(Format.currencySymbol(for: AppSettingsStore.currencyCode))
                .font(.subheadline)
                .foregroundStyle(Palette.textTertiary)
        }
    }

    private var calculatorControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                Haptics.selection()
                withAnimation(Motion.snappy) { draft.toggleDirection() }
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "arrow.left.arrow.right")
                        .font(.caption.weight(.bold))
                        .rotationEffect(.degrees(draft.direction == .markupToPrice ? 0 : 180))
                    Text(draft.direction.title)
                        .font(.footnote.weight(.semibold))
                }
                .foregroundStyle(Palette.accent)
            }
            .buttonStyle(.plain)

            HStack(spacing: 7) {
                ForEach([20, 30, 50, 100, 150], id: \.self) { preset in
                    PillButton(
                        title: "+\(preset)%",
                        isActive: draft.direction == .markupToPrice && Int(draft.markupPercent) == preset
                    ) {
                        withAnimation(Motion.snappy) { draft.applyMarkupPreset(preset) }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    // MARK: - Остаток

    private var stockSection: some View {
        FormSection(title: "Склад") {
            FormRow(
                title: "Количество",
                systemImage: "number",
                error: draft.error(for: .quantity),
                showsError: !draft.quantityText.isEmpty
            ) {
                HStack(spacing: 10) {
                    TextField("0", text: $draft.quantityText)
                        .keyboardType(.numberPad)
                        .focused($focus, equals: .quantity)
                        .frame(maxWidth: 70)
                        .monospacedDigit()
                    Stepper(
                        "",
                        onIncrement: {
                            draft.quantityText = String(draft.quantity + 1)
                            Haptics.tap()
                        },
                        onDecrement: {
                            draft.quantityText = String(max(0, draft.quantity - 1))
                            Haptics.tap()
                        }
                    )
                    .labelsHidden()
                }
            }

            FormRow(title: "Порог «мало на складе»", systemImage: "exclamationmark.triangle.fill") {
                Stepper(value: $draft.lowStockThreshold, in: 0...999) {
                    Text(Format.integer(draft.lowStockThreshold))
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.textPrimary)
                }
                .fixedSize()
            }

            FormRow(title: "В наличии", systemImage: "checkmark.seal.fill", showsDivider: false) {
                Toggle("", isOn: $draft.inStock)
                    .labelsHidden()
                    .tint(Palette.stockOK)
                    .onChange(of: draft.inStock) { _, _ in Haptics.tap() }
            }
        }
    }

    // MARK: - Итог

    private var summaryCard: some View {
        VStack(spacing: 12) {
            HStack {
                summaryItem(
                    title: "Прибыль с единицы",
                    value: Format.money(draft.profitPerUnit),
                    tint: draft.profitPerUnit >= 0 ? Palette.stockOK : Palette.danger
                )
                Rectangle().fill(Palette.line).frame(width: Metrics.hairline, height: 34)
                summaryItem(
                    title: "Маржа",
                    value: Format.percent(draft.marginPercent),
                    tint: draft.marginPercent >= 0 ? Palette.stockOK : Palette.danger
                )
                Rectangle().fill(Palette.line).frame(width: Metrics.hairline, height: 34)
                summaryItem(
                    title: "Всего на складе",
                    value: Format.money(draft.totalProfit),
                    tint: Palette.textPrimary
                )
            }

            if let warning = draft.lossWarning {
                Label(warning, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Palette.stockLow)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .cardSurface()
        .animation(Motion.snappy, value: draft.lossWarning)
    }

    private func summaryItem(title: String, value: String, tint: Color) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .figure(size: 16)
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(title)
                .microLabel()
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Тулбары

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Отмена") { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
            Button("Сохранить", action: save)
                .fontWeight(.semibold)
                .disabled(!draft.isValid)
        }
    }

    @ToolbarContentBuilder
    private var keyboardToolbar: some ToolbarContent {
        ToolbarItemGroup(placement: .keyboard) {
            Spacer()
            Button("Готово") { focus = nil }
                .fontWeight(.semibold)
        }
    }

    // MARK: - Действия

    private func loadPhoto(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data) else { return }
        await MainActor.run {
            withAnimation(Motion.spring) {
                draft.imageData = image.inventoryThumbnailData()
            }
            Haptics.success()
        }
    }

    private func save() {
        draft.didAttemptSave = true
        guard draft.isValid else {
            Haptics.error()
            return
        }

        if let existing = request.existingProduct {
            draft.apply(to: existing)
            ProductStore.commit(context)
        } else {
            let product = Product()
            draft.apply(to: product)
            ProductStore.insert(product, in: context)
        }

        Haptics.success()
        dismiss()
    }
}

#Preview {
    ProductEditorView(request: .create)
        .modelContainer(PersistenceController.makePreviewContainer())
}
