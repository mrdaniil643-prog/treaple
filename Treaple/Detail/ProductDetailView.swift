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
            ProductThumbnail(product: product, size: 120, cornerRadius: 26)
                .shadow(color: .black.opacity(0.08), radius: 16, y: 8)

            VStack(spacing: 8) {
                Text(product.name.isEmpty ? "Без названия" : product.name)
                    .font(.title2.weight(.bold))
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
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .tracking(-1)
                        .monospacedDigit()
                        .foregroundStyle(Palette.stock(product.stockState))
                        .contentTransition(.numericText())
                    Text("шт. на складе")
                        .font(.caption)
                        .foregroundStyle(Palette.textTertiary)
                }
                .frame(minWidth: 120)

                stepButton(symbol: "plus", enabled: true) {
                    ProductStore.adjustQuantity(product, by: 1, in: context)
                }
            }

            if product.stockState == .low {
                Label(
                    "Остаток ниже порога — \(Format.integer(product.lowStockThreshold)) шт.",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.caption.weight(.medium))
                .foregroundStyle(Palette.stockLow)
            }

            Toggle(isOn: inStockBinding) {
                Label("В наличии", systemImage: "checkmark.seal.fill")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Palette.textPrimary)
            }
            .tint(Palette.stockOK)
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
                .foregroundStyle(enabled ? Palette.accent : Palette.textTertiary)
                .frame(width: 52, height: 52)
                .background {
                    Circle()
                        .fill(enabled ? Palette.accent.opacity(0.12) : Palette.separator.opacity(0.4))
                        .overlay {
                            Circle().strokeBorder(
                                enabled ? Palette.accent.opacity(0.2) : .clear,
                                lineWidth: 0.75
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
            Text("ЭКОНОМИКА ПОЗИЦИИ")
                .font(.caption2.weight(.bold))
                .tracking(0.7)
                .foregroundStyle(Palette.textTertiary)
                .padding(.leading, 4)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                statTile("Закупка", Format.money(product.purchasePrice), "arrow.down.circle.fill", Palette.info)
                statTile("Продажа", Format.money(product.salePrice), "arrow.up.circle.fill", Palette.accent)
                statTile(
                    "Прибыль с единицы",
                    Format.money(product.profitPerUnit),
                    "plus.forwardslash.minus",
                    product.profitPerUnit >= 0 ? Palette.stockOK : Palette.danger
                )
                statTile("Наценка", Format.percent(product.markupPercent), "percent", Palette.stockLow)
                statTile("Сумма закупки", Format.money(product.totalPurchaseValue), "shippingbox.fill", Palette.info)
                statTile(
                    "Прибыль по остатку",
                    Format.money(product.totalProfit),
                    "chart.line.uptrend.xyaxis",
                    product.totalProfit >= 0 ? Palette.stockOK : Palette.danger
                )
            }
        }
    }

    private func statTile(_ title: String, _ value: String, _ symbol: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: symbol)
                .font(.caption.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background {
                    Circle()
                        .fill(LinearGradient(
                            colors: [tint, tint.opacity(0.72)],
                            startPoint: .topLeading, endPoint: .bottomTrailing
                        ))
                        .shadow(color: tint.opacity(0.3), radius: 5, y: 2)
                }

            Text(value)
                .font(.system(.callout, design: .rounded, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(Palette.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)

            Text(title)
                .font(.caption2)
                .foregroundStyle(Palette.textTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface(padding: 13)
    }

    // MARK: - Служебное

    private var metaCard: some View {
        VStack(spacing: 10) {
            metaRow("Обновлено", Format.relativeDate(product.updatedAt))
            Divider()
            metaRow("Создано", Format.dateTime(product.createdAt))
            Divider()
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
