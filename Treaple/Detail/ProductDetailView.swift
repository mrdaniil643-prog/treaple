import SwiftUI
import SwiftData

/// Подробности по товару: фото, экономика позиции и быстрое управление остатком.
struct ProductDetailView: View {

    @Bindable var product: Product
    @Binding var editorRequest: ProductEditorRequest?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var showsDeleteConfirmation = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                header
                quantityControl
                economicsGrid
                metaCard
            }
            .padding(.horizontal, Metrics.gutter)
            .padding(.bottom, 40)
        }
        .background(ScreenBackground())
        .navigationTitle(product.name.isEmpty ? "Товар" : product.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        editorRequest = .edit(product)
                    } label: {
                        Label("Редактировать", systemImage: "square.and.pencil")
                    }

                    Button {
                        editorRequest = .duplicate(product)
                    } label: {
                        Label("Дублировать", systemImage: "doc.on.doc")
                    }

                    Divider()

                    Button(role: .destructive) {
                        showsDeleteConfirmation = true
                    } label: {
                        Label("Удалить", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.title3)
                }
            }
        }
        .confirmationDialog("Удалить товар?", isPresented: $showsDeleteConfirmation, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) {
                Haptics.success()
                ProductStore.delete(product, in: context)
                dismiss()
            }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("«\(product.name)» будет удалён со всех устройств.")
        }
    }

    // MARK: - Шапка

    private var header: some View {
        VStack(spacing: 14) {
            ProductThumbnail(product: product, size: 112, cornerRadius: 16)

            VStack(spacing: 8) {
                Text(product.name.isEmpty ? "Без названия" : product.name)
                    .font(.system(size: 22, weight: .semibold))
                    .tracking(-0.4)
                    .foregroundStyle(Palette.textPrimary)
                    .multilineTextAlignment(.center)

                HStack(spacing: 8) {
                    CategoryChip(title: product.displayCategory)
                    StockBadge(product: product, showsTitle: true)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    // MARK: - Остаток

    private var quantityControl: some View {
        VStack(spacing: 14) {
            HStack(spacing: 20) {
                stepButton(symbol: "minus", enabled: product.quantity > 0) {
                    ProductStore.adjustQuantity(product, by: -1, in: context)
                }

                VStack(spacing: 2) {
                    Text(Format.integer(product.quantity))
                        .figure(size: 46, weight: .semibold)
                        .foregroundStyle(Palette.textPrimary)
                        .contentTransition(.numericText())
                    Text("шт. на складе").microLabel()
                }
                .frame(minWidth: 120)

                stepButton(symbol: "plus", enabled: true) {
                    ProductStore.adjustQuantity(product, by: 1, in: context)
                }
            }

            if product.stockState == .low {
                Text("Остаток ниже порога — \(Format.integer(product.lowStockThreshold)) шт.")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Palette.textSecondary)
            }

            Toggle(isOn: inStockBinding) {
                Text("В наличии")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Palette.textPrimary)
            }
            .tint(Palette.ink)
        }
        .cardSurface(padding: 18)
        .animation(Motion.snappy, value: product.quantity)
    }

    private var inStockBinding: Binding<Bool> {
        Binding(
            get: { product.inStock },
            set: { _ in
                Haptics.tap(.medium)
                withAnimation(Motion.snappy) {
                    ProductStore.toggleInStock(product, in: context)
                }
            }
        )
    }

    private func stepButton(symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            withAnimation(Motion.snappy) { action() }
        } label: {
            Image(systemName: symbol)
                .font(.title3.weight(.semibold))
                .foregroundStyle(enabled ? Palette.textPrimary : Palette.textTertiary)
                .frame(width: 52, height: 52)
                .background {
                    Circle()
                        .fill(Palette.surfaceAlt)
                        .overlay {
                            Circle().strokeBorder(
                                enabled ? Palette.lineStrong : Palette.line,
                                lineWidth: Metrics.hairline
                            )
                        }
                }
        }
        .buttonStyle(.pressable)
        .disabled(!enabled)
    }

    // MARK: - Экономика

    private var economicsGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Экономика позиции")
                .microLabel(Palette.textSecondary)
                .padding(.leading, 4)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                statTile("Закупка", Format.money(product.purchasePrice))
                statTile("Продажа", Format.money(product.salePrice))
                statTile("Прибыль с единицы", Format.money(product.profitPerUnit))
                statTile("Наценка", Format.percent(product.markupPercent))
                statTile("Сумма закупки", Format.money(product.totalPurchaseValue))
                statTile("Прибыль по остатку", Format.money(product.totalProfit))
            }
        }
    }

    private func statTile(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(value)
                .figure(size: 17)
                .foregroundStyle(Palette.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            Text(title).microLabel()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(padding: 13)
    }

    // MARK: - Служебное

    private var metaCard: some View {
        VStack(spacing: 10) {
            metaRow("Обновлено", Format.relativeDate(product.updatedAt))
            Hairline()
            metaRow("Создано", Format.dateTime(product.createdAt))
            Hairline()
            metaRow("Порог «мало»", Format.quantity(product.lowStockThreshold))
        }
        .cardSurface(padding: 14)
    }

    private func metaRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Palette.textPrimary)
        }
    }
}

#Preview {
    NavigationStack {
        ProductDetailView(product: Product.sampleProducts[1], editorRequest: .constant(nil))
    }
    .modelContainer(PersistenceController.makePreviewContainer())
}
