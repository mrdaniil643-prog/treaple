import SwiftUI

/// Переключатель фильтров. Выбранный сегмент залит чернилами и выворачивает
/// текст — в монохроме инверсия работает так же однозначно, как цвет,
/// и при этом не вводит в палитру ничего лишнего.
struct FilterBar: View {
    @Binding var selection: InventoryFilter
    let counts: [InventoryFilter: Int]

    @Namespace private var indicator

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: Metrics.controlRadius, style: .continuous)
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(InventoryFilter.allCases) { filter in
                segment(filter)
            }
        }
        .padding(3)
        .controlSurface()
    }

    private func segment(_ filter: InventoryFilter) -> some View {
        let isSelected = selection == filter
        let count = counts[filter] ?? 0

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
                        .opacity(isSelected ? 0.65 : 1)
                        .foregroundStyle(isSelected ? Palette.inkInverted : Palette.textTertiary)
                }
            }
            .foregroundStyle(isSelected ? Palette.inkInverted : Palette.textSecondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background {
                if isSelected {
                    RoundedRectangle(cornerRadius: Metrics.controlRadius - 3, style: .continuous)
                        .fill(Palette.ink)
                        .matchedGeometryEffect(id: "filterIndicator", in: indicator)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
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
