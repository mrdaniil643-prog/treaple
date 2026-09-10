import SwiftUI

/// Пустое состояние: иконка на мягкой подложке, объяснение и один явный призыв к действию.
struct EmptyStateView: View {
    let symbolName: String
    let title: String
    let message: String
    var tint: Color = Palette.accent
    var actionTitle: String?
    var action: (() -> Void)?
    var secondaryTitle: String?
    var secondaryAction: (() -> Void)?

    @State private var appeared = false

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.10))
                    .frame(width: 116, height: 116)
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 82, height: 82)
                Image(systemName: symbolName)
                    .font(.system(size: 34, weight: .medium))
                    .foregroundStyle(tint)
                    .symbolRenderingMode(.hierarchical)
            }
            .scaleEffect(appeared ? 1 : 0.82)
            .opacity(appeared ? 1 : 0)

            VStack(spacing: 7) {
                Text(title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Palette.textPrimary)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 300)
            }
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 8)

            if let actionTitle, let action {
                Button(action: action) {
                    Text(actionTitle)
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 22)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .tint(tint)
            }

            if let secondaryTitle, let secondaryAction {
                Button(secondaryTitle, action: secondaryAction)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Palette.textSecondary)
            }
        }
        .padding(.horizontal, 32)
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity)
        .onAppear {
            withAnimation(Motion.spring.delay(0.05)) { appeared = true }
        }
    }
}

#Preview {
    EmptyStateView(
        symbolName: "shippingbox",
        title: "Пока нет товаров",
        message: "Добавьте первую позицию — и склад начнёт считать закупку, продажу и прибыль за вас.",
        actionTitle: "Добавить товар",
        action: {},
        secondaryTitle: "Заполнить примерами",
        secondaryAction: {}
    )
    .frame(maxHeight: .infinity)
    .background(Palette.canvas)
}
