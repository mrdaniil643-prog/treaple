import SwiftUI

/// Переключатель фильтров. Выделение не перекрашивается, а переезжает между
/// сегментами через `matchedGeometryEffect`: движение показывает связь
/// состояний, мгновенная смена цвета — нет.
struct FilterBar: View {
    @Binding var selection: InventoryFilter
    let counts: [InventoryFilter: Int]

    @Namespace private var indicator

    var body: some View {
        HStack(spacing: 0) {
            ForEach(InventoryFilter.allCases) { filter in
                segment(filter)
            }
        }
        .padding(3)
        .glassControl(radius: Metrics.controlRadius + 3)
    }

    private func segment(_ filter: InventoryFilter) -> some View {
        let isSelected = selection == filter
        let count = counts[filter] ?? 0
        let tint = tint(for: filter)

        return Button {
            guard !isSelected else { return }
            Haptics.selection()
            withAnimation(Motion.spring) { selection = filter }
        } label: {
            HStack(spacing: 6) {
                Text(filter.title)
                    .font(.system(size: 13, weight: .semibold))

                if count > 0 {
                    Text(Format.integer(count))
                        .font(.system(size: 11, weight: .semibold))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                        .foregroundStyle(isSelected ? .white.opacity(0.7) : Palette.textTertiary)
                }
            }
            .foregroundStyle(isSelected ? .white : Palette.textSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background {
                if isSelected {
                    RoundedRectangle(cornerRadius: Metrics.controlRadius, style: .continuous)
                        .fill(tint)
                        .shadow(color: tint.opacity(0.3), radius: 6, y: 2)
                        .matchedGeometryEffect(id: "filterIndicator", in: indicator)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    /// Цвет выделения повторяет смысл фильтра: «Мало» подсвечивается тем же
    /// янтарным, что и бейджи в списке.
    private func tint(for filter: InventoryFilter) -> Color {
        switch filter {
        case .all: Palette.accent
        case .low: Palette.stockLow
        case .out: Palette.textSecondary
        }
    }
}

private struct FilterBarPreview: View {
    @State private var selection: InventoryFilter = .all

    var body: some View {
        FilterBar(selection: $selection, counts: [.all: 24, .low: 3, .out: 1])
            .padding()
            .background(ScreenBackground())
    }
}

#Preview {
    FilterBarPreview()
}
