import SwiftUI

/// Фон экрана: нейтральное полотно с едва заметным акцентным отсветом сверху.
/// Ровная заливка во весь экран читается как «страница», градиент — как глубина;
/// отсюда и низкая непрозрачность, чтобы это не превращалось в декорацию.
struct ScreenBackground: View {
    var tint: Color = Palette.accent

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Palette.canvas
            .overlay(alignment: .top) {
                LinearGradient(
                    colors: [
                        tint.opacity(colorScheme == .dark ? 0.16 : 0.075),
                        tint.opacity(0)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 300)
            }
            .ignoresSafeArea()
    }
}
