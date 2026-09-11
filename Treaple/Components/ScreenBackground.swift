import SwiftUI

/// Фон экрана. Ровное полотно без градиентов и отсветов: любое свечение
/// возвращает интерфейс к «мягкому» виду, от которого мы здесь уходим.
struct ScreenBackground: View {
    var body: some View {
        Palette.canvas.ignoresSafeArea()
    }
}
