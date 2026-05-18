import SwiftUI

struct AuthorizeSheet: View {
    @Bindable var operationStore: OperationStore
    @Environment(\.dismiss) private var dismiss

    @State private var draftValues: [String: String] = [:]

    var schemes: [ParsedSecurityScheme] {
        operationStore.securitySchemes
    }

    var body: some View {
        VStack(spacing: 0) {
            // Title bar
            HStack {
                Text("Available authorizations")
                    .font(.title3.bold())
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)

            Divider()

            if schemes.isEmpty {
                ContentUnavailableView(
                    "보안 스킴 없음",
                    systemImage: "lock.slash",
                    description: Text("이 스펙에는 정의된 securitySchemes가 없습니다.")
                )
                .padding(40)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(schemes) { scheme in
                            SchemeRow(
                                scheme: scheme,
                                value: Binding(
                                    get: { draftValues[scheme.name] ?? operationStore.securityValues[scheme.name] ?? ""
                                    },
                                    set: { draftValues[scheme.name] = $0 }
                                ),
                                isAuthorized: !(operationStore.securityValues[scheme.name] ?? "").isEmpty,
                                onAuthorize: {
                                    let v = draftValues[scheme.name] ?? ""
                                    operationStore.securityValues[scheme.name] = v.isEmpty ? nil : v
                                },
                                onLogout: {
                                    operationStore.securityValues.removeValue(forKey: scheme.name)
                                    draftValues.removeValue(forKey: scheme.name)
                                }
                            )
                            Divider()
                        }
                    }
                }
            }

            Divider()
            HStack {
                Spacer()
                Button("닫기") { dismiss() }
                    .buttonStyle(.bordered)
                    .keyboardShortcut(.escape)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .frame(minWidth: 520, minHeight: 300)
    }
}

// MARK: - Scheme Row

private struct SchemeRow: View {
    let scheme: ParsedSecurityScheme
    @Binding var value: String
    let isAuthorized: Bool
    let onAuthorize: () -> Void
    let onLogout: () -> Void

    @State private var showValue = false

    var schemeLabel: String {
        switch scheme.kind {
        case let .apiKey(name, loc): "apiKey — \(name) (\(loc))"
        case let .http(scheme): "http (\(scheme))"
        case .oauth2: "oauth2"
        case .unknown: "unknown"
        }
    }

    var headerKeyName: String? {
        switch scheme.kind {
        case let .apiKey(name, _): name
        case let .http(scheme) where scheme.lowercased() == "bearer": "Authorization"
        case let .http(scheme) where scheme.lowercased() == "basic": "Authorization"
        default: nil
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: isAuthorized ? "lock.fill" : "lock.open")
                    .foregroundStyle(isAuthorized ? .green : .secondary)
                    .font(.system(size: 13))
                Text(scheme.name)
                    .font(.system(.body, design: .monospaced).bold())
                Text("(\(schemeLabel))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if let desc = scheme.description {
                Text(desc)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let key = headerKeyName {
                HStack {
                    Text("Name:").font(.caption).foregroundStyle(.secondary)
                    Text(key).font(.system(.caption, design: .monospaced))
                }
                HStack {
                    Text("In:").font(.caption).foregroundStyle(.secondary)
                    switch scheme.kind {
                    case let .apiKey(_, loc):
                        Text(loc).font(.system(.caption, design: .monospaced))
                    default:
                        Text("header").font(.system(.caption, design: .monospaced))
                    }
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Value:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: 8) {
                    if showValue {
                        TextField("토큰 입력", text: $value)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(.body, design: .monospaced))
                    } else {
                        SecureField("토큰 입력", text: $value)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(.body, design: .monospaced))
                    }
                    Button {
                        showValue.toggle()
                    } label: {
                        Image(systemName: showValue ? "eye.slash" : "eye")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }

            HStack(spacing: 8) {
                Button("Authorize") {
                    onAuthorize()
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(value.isEmpty)

                if isAuthorized {
                    Button("Logout") {
                        onLogout()
                    }
                    .buttonStyle(.bordered)
                    .foregroundStyle(.red)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }
}
