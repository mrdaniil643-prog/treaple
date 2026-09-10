import SwiftUI

/// Превью товара: фото, если оно есть, иначе — инициал на подложке цвета категории.
struct ProductThumbnail: View {
    let product: Product
    var size: CGFloat = Metrics.thumbSize
    var cornerRadius: CGFloat = Metrics.thumbRadius

    private var initial: String {
        let source = product.name.isEmpty ? product.displayCategory : product.name
        return String(source.prefix(1)).uppercased()
    }

    var body: some View {
        Group {
            if let data = product.imageData, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                let tint = Palette.category(product.displayCategory)
                ZStack {
                    LinearGradient(
                        colors: [tint.opacity(0.22), tint.opacity(0.10)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    Text(initial)
                        .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
                        .foregroundStyle(tint)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .strokeBorder(Palette.separator, lineWidth: 0.5)
        }
        .accessibilityHidden(true)
    }
}
