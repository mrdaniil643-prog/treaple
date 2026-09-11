import SwiftUI

/// Фон экрана: нейтральное полотно с очень слабым акцентным отсветом сверху.
/// Ровная заливка во весь экран читается как «страница», лёгкий градиент —
/// как глубина. Непрозрачность намеренно низкая: это подложка, а не декор.
struct ScreenBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Palette.canvas
            .overlay(alignment: .top) {
                LinearGradient(
                    colors: [
                        Palette.accent.opacity(colorScheme == .dark ? 0.11 : 0.055),
                        Palette.accent.opacity(0)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 280)
            }
            .ignoresSafeArea()
    }
}
