import SwiftUI

/// Сегмент-контрол фильтров. Написан руками вместо `Picker(.segmented)`,
/// чтобы показывать счётчики и перетаскивать подложку через `matchedGeometryEffect`.
struct FilterBar: View {
    @Binding var selection: InventoryFilter
    let counts: [InventoryFilter: Int]

    @Namespace private var indicator

    var body: some View {
        HStack(spacing: 4) {
            ForEach(InventoryFilter.allCases) { filter in
                segment(filter)
            }
        }
        .padding(4)
        .background {
            Capsule(style: .continuous)
                .fill(Palette.surface)
                .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        }
        .overlay {
            Capsule(style: .continuous)
                .strokeBorder(Palette.separator, lineWidth: 0.5)
        }
    }

    private func segment(_ filter: InventoryFilter) -> some View {
        let isSelected = selection == filter
        let count = counts[filter] ?? 0

        return Button {
            guard !isSelected else { return }
            Haptics.selection()
            withAnimation(Motion.snappy) { selection = filter }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: filter.symbolName)
                    .font(.caption2.weight(.semibold))
                Text(filter.title)
                    .font(.subheadline.weight(.semibold))
                if count > 0 {
                    Text(Format.integer(count))
                        .font(.caption2.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(isSelected ? Color.white.opacity(0.85) : Palette.textTertiary)
                }
            }
            .foregroundStyle(isSelected ? .white : Palette.textSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background {
                if isSelected {
                    Capsule(style: .continuous)
                        .fill(tint(for: filter))
                        .matchedGeometryEffect(id: "filterIndicator", in: indicator)
                }
            }
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

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
            .background(Palette.canvas)
    }
}

#Preview {
    FilterBarPreview()
}
