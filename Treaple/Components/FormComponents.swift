import SwiftUI

/// Секция формы: заголовок мелкими прописными и карточка с содержимым.
struct FormSection<Content: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).microLabel()
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.textTertiary)
                }
            }
            .padding(.leading, 6)

            VStack(spacing: 0) {
                content
            }
            .cardSurface(padding: 0)
        }
    }
}

/// Строка формы с подписью, полем ввода и текстом ошибки под ним.
struct FormRow<Content: View>: View {
    let title: String
    var systemImage: String?
    var error: String?
    var showsError: Bool = true
    var showsDivider: Bool = true
    @ViewBuilder var content: Content

    private var isInvalid: Bool { showsError && error != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 14))
                        .foregroundStyle(isInvalid ? Palette.danger : Palette.textTertiary)
                        .frame(width: 22)
                }

                Text(title)
                    .font(.system(size: 14))
                    .foregroundStyle(Palette.textSecondary)

                Spacer(minLength: 12)

                content
                    .multilineTextAlignment(.trailing)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 13)

            if isInvalid, let error {
                Text(error)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Palette.danger)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            if showsDivider {
                Hairline(inset: 14)
            }
        }
        // Неверное поле помечено и подложкой, и полосой у кромки: цвет
        // один, но носителей два — так ошибку видно и боковым зрением.
        .background(isInvalid ? Palette.danger.opacity(0.05) : Color.clear)
        .overlay(alignment: .leading) {
            if isInvalid {
                Rectangle().fill(Palette.danger).frame(width: 2)
            }
        }
        .animation(Motion.snappy, value: isInvalid)
    }
}

/// Компактная кнопка-таблетка для пресетов и переключателей внутри формы.
struct PillButton: View {
    let title: String
    var systemImage: String?
    var isActive: Bool = false
    var tint: Color = Palette.accent
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            HStack(spacing: 5) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 10, weight: .semibold))
                }
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundStyle(isActive ? .white : tint)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background {
                Capsule(style: .continuous)
                    .fill(isActive ? tint : tint.opacity(0.11))
            }
        }
        .buttonStyle(.pressable)
    }
}
