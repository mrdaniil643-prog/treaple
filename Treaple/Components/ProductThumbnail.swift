import SwiftUI

/// Превью товара: фото, если оно есть, иначе — монограмма.
///
/// Подложка тонирована одним и тем же акцентом для всех товаров. Раньше
/// оттенок брался по хешу категории, и список превращался в пестроту,
/// в которой цвет ничего не сообщал.
struct ProductThumbnail: View {
    let product: Product
    var size: CGFloat = Metrics.thumbSize
    var cornerRadius: CGFloat = Metrics.thumbRadius

    @Environment(\.colorScheme) private var colorScheme

    private var initial: String {
        let source = product.name.isEmpty ? product.displayCategory : product.name
        return String(source.prefix(1)).uppercased()
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
    }

    var body: some View {
        Group {
            if let data = product.imageData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Palette.accentWash
                    Text(initial)
                        .font(.system(size: size * 0.38, weight: .semibold))
                        .tracking(-0.5)
                        .foregroundStyle(Palette.accent.opacity(0.85))
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay {
            shape.strokeBorder(
                LinearGradient(
                    colors: [
                        .white.opacity(colorScheme == .dark ? 0.10 : 0.75),
                        Palette.line.opacity(0.9)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                ),
                lineWidth: 0.75
            )
        }
        .accessibilityHidden(true)
    }
}
