import SwiftUI

/// Превью товара: фото, если оно есть, иначе — инициал на подложке цвета
/// категории. Заглушка не должна выглядеть как «нет данных», поэтому это
/// полноценный градиентный плиточный знак, а не серый квадрат.
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
                placeholder
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay {
            shape.strokeBorder(
                LinearGradient(
                    colors: [.white.opacity(colorScheme == .dark ? 0.12 : 0.7), Palette.separator.opacity(0.6)],
                    startPoint: .top,
                    endPoint: .bottom
                ),
                lineWidth: 0.75
            )
        }
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        let tint = Palette.category(product.displayCategory)
        return ZStack {
            LinearGradient(
                colors: [tint.opacity(0.26), tint.opacity(0.11)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Text(initial)
                .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
                .foregroundStyle(tint)
        }
    }
}
