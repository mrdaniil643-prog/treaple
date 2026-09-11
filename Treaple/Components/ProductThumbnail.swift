import SwiftUI

/// Превью товара: фото, если оно есть, иначе — монограмма в обведённом
/// квадрате. Без градиентов и цветных подложек: знак держится на самой
/// букве, её весе и точной рамке.
struct ProductThumbnail: View {
    let product: Product
    var size: CGFloat = Metrics.thumbSize
    var cornerRadius: CGFloat = Metrics.thumbRadius

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
                    .grayscale(1)
            } else {
                ZStack {
                    Palette.surfaceAlt
                    Text(initial)
                        .font(.system(size: size * 0.36, weight: .medium))
                        .tracking(-0.5)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay {
            shape.strokeBorder(Palette.line, lineWidth: Metrics.hairline)
        }
        .accessibilityHidden(true)
    }
}
