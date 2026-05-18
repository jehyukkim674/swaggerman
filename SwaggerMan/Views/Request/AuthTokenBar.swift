import AppKit
import SwiftUI

struct AuthTokenBar: View {
    @Bindable var operationStore: OperationStore
    @State private var showValues = false

    var schemes: [ParsedSecurityScheme] {
        operationStore.securitySchemes
    }

    private func isAuthorized(_ scheme: ParsedSecurityScheme) -> Bool {
        !(operationStore.securityValues[scheme.name] ?? "").isEmpty
    }

    var authorizedCount: Int {
        schemes.filter { isAuthorized($0) }.count
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: authorizedCount > 0 ? "lock.fill" : "lock.open")
                    .font(.system(size: 11))
                    .foregroundStyle(authorizedCount > 0 ? .green : .secondary)
                Text("Authorization")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                if authorizedCount > 0 {
                    Text("\(authorizedCount)/\(schemes.count)")
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { showValues.toggle() }
                } label: {
                    Image(systemName: showValues ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.15)) { showValues.toggle() }
            }

            if showValues {
                VStack(spacing: 6) {
                    ForEach(schemes) { scheme in
                        AuthTokenRow(
                            scheme: scheme,
                            value: Binding(
                                get: { operationStore.securityValues[scheme.name] ?? "" },
                                set: { v in
                                    if v.isEmpty {
                                        operationStore.securityValues.removeValue(forKey: scheme.name)
                                    } else {
                                        operationStore.securityValues[scheme.name] = v
                                    }
                                }
                            ),
                            isAuthorized: isAuthorized(scheme)
                        )
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }
        }
        .background(Color(.windowBackgroundColor).opacity(0.5))
    }
}

struct AuthTokenRow: View {
    let scheme: ParsedSecurityScheme
    @Binding var value: String
    let isAuthorized: Bool
    @State private var showToken = false

    var schemeShortLabel: String {
        switch scheme.kind {
        case let .apiKey(name, _): name
        case let .http(scheme): scheme.capitalized
        case .oauth2: "OAuth2"
        case .unknown: "Token"
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isAuthorized ? "lock.fill" : "lock.open")
                .font(.system(size: 10))
                .foregroundStyle(isAuthorized ? .green : .secondary)
                .frame(width: 12)

            Text(scheme.name)
                .font(.system(.caption, design: .monospaced).weight(.medium))
                .lineLimit(1)
                .frame(minWidth: 80, maxWidth: 120, alignment: .leading)

            Text(schemeShortLabel)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
                .padding(.vertical, 1)
                .background(Color.secondary.opacity(0.15))
                .clipShape(.rect(cornerRadius: 3))

            if showToken {
                TextField("토큰", text: $value)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.caption, design: .monospaced))
            } else {
                NativeSecureField(placeholder: "토큰", text: $value)
                    .frame(height: 22)
            }

            Button {
                showToken.toggle()
            } label: {
                Image(systemName: showToken ? "eye.slash" : "eye")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
    }
}

struct NativeSecureField: NSViewRepresentable {
    var placeholder: String
    @Binding var text: String

    func makeNSView(context: Context) -> NSSecureTextField {
        let field = NSSecureTextField()
        field.placeholderString = placeholder
        field.delegate = context.coordinator
        field.isBordered = true
        field.bezelStyle = .roundedBezel
        field.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        field.focusRingType = .default
        return field
    }

    func updateNSView(_ nsView: NSSecureTextField, context _: Context) {
        if nsView.stringValue != text {
            nsView.stringValue = text
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        var text: Binding<String>
        init(text: Binding<String>) {
            self.text = text
        }

        func controlTextDidChange(_ obj: Notification) {
            guard let field = obj.object as? NSSecureTextField else { return }
            text.wrappedValue = field.stringValue
        }

        func controlTextDidEndEditing(_ obj: Notification) {
            guard let field = obj.object as? NSSecureTextField else { return }
            text.wrappedValue = field.stringValue
        }
    }
}
