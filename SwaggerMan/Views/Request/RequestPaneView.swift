import SwiftUI

struct RequestPaneView: View {
    @Bindable var store: RequestEditorStore
    let activeEnvironment: APIEnvironment?
    let onSend: () async -> Void

    var body: some View {
        VStack(spacing: 0) {
            if let op = store.selectedOperation {
                OperationHeaderView(
                    operation: op,
                    isSending: store.isSending,
                    onSend: { Task { await onSend() } }
                )
                Divider()

                ScrollView {
                    VStack(spacing: 0) {
                        // Params
                        if !store.pathParams.isEmpty || !store.queryParams.isEmpty {
                            RequestSection(title: "Params", defaultExpanded: true) {
                                ParamsSectionContent(store: store)
                            }
                            Divider().padding(.leading, 12)
                        }

                        // Headers
                        RequestSection(
                            title: "Headers",
                            badge: store.requestHeaders.isEmpty ? nil : "\(store.requestHeaders.count)",
                            defaultExpanded: true
                        ) {
                            HeadersSectionContent(store: store)
                        }
                        Divider().padding(.leading, 12)

                        // Body
                        if op.requestBody != nil {
                            RequestSection(title: "Body", defaultExpanded: true) {
                                BodySectionContent(store: store)
                            }
                            Divider().padding(.leading, 12)
                        }

                        // Auth
                        RequestSection(title: "Auth", defaultExpanded: false) {
                            AuthSectionContent(environment: activeEnvironment)
                        }
                    }
                }
            } else {
                ContentUnavailableView(
                    "Endpoint 선택",
                    systemImage: "arrow.left.square",
                    description: Text("사이드바에서 endpoint를 선택하세요.")
                )
            }
        }
    }
}

// MARK: - Collapsible Section

private struct RequestSection<Content: View>: View {
    let title: String
    var badge: String? = nil
    let defaultExpanded: Bool
    @ViewBuilder let content: () -> Content
    @State private var isExpanded: Bool

    init(title: String, badge: String? = nil, defaultExpanded: Bool = true,
         @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.badge = badge
        self.defaultExpanded = defaultExpanded
        self.content = content
        _isExpanded = State(initialValue: defaultExpanded)
    }

    var body: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { isExpanded.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 12)
                    Text(title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    if let badge {
                        Text(badge)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color.secondary.opacity(0.4))
                            .clipShape(.rect(cornerRadius: 4))
                    }
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                content()
                    .padding(.bottom, 8)
            }
        }
    }
}

// MARK: - Params content

private struct ParamsSectionContent: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !store.pathParams.isEmpty {
                ParamGroup(title: "Path") {
                    ForEach(store.pathParams.keys.sorted(), id: \.self) { key in
                        ParamInputRow(
                            label: "{\(key)}",
                            placeholder: "값 입력",
                            isRequired: true,
                            value: Binding(
                                get: { store.pathParams[key] ?? "" },
                                set: { store.pathParams[key] = $0 }
                            )
                        )
                    }
                }
            }
            if !store.queryParams.isEmpty {
                ParamGroup(title: "Query") {
                    ForEach($store.queryParams) { $param in
                        QueryParamInputRow(param: $param)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
    }
}

// MARK: - Headers content

private struct HeadersSectionContent: View {
    @Bindable var store: RequestEditorStore

    var specHeaders: [RequestParam] { store.requestHeaders.filter { $0.isFromSpec } }
    var userHeaders: [RequestParam] { store.requestHeaders.filter { !$0.isFromSpec } }

    var body: some View {
        VStack(spacing: 4) {
            ForEach($store.requestHeaders) { $header in
                HeaderInputRow(header: $header) {
                    store.requestHeaders.removeAll { $0.id == header.id }
                }
            }

            HStack {
                Spacer()
                Button {
                    store.requestHeaders.append(RequestParam(key: "", value: "", enabled: true))
                } label: {
                    Label("헤더 추가", systemImage: "plus")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
                .padding(.trailing, 4)
            }
            .padding(.horizontal, 12)
            .padding(.top, 2)
        }
        .padding(.horizontal, 12)
    }
}

// MARK: - Body content

private struct BodySectionContent: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("JSON")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Spacer()
                Button("포맷") { formatJSON() }
                    .controlSize(.small)
                    .buttonStyle(.bordered)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 6)

            TextEditor(text: $store.bodyJSON)
                .font(.system(.caption, design: .monospaced))
                .frame(minHeight: 120)
                .padding(8)
                .background(Color(.textBackgroundColor).opacity(0.4))
                .clipShape(.rect(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(.separatorColor), lineWidth: 1)
                )
                .padding(.horizontal, 12)
        }
    }

    private func formatJSON() {
        guard let data = store.bodyJSON.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .prettyPrinted),
              let str = String(data: pretty, encoding: .utf8) else { return }
        store.bodyJSON = str
    }
}

// MARK: - Auth content

private struct AuthSectionContent: View {
    let environment: APIEnvironment?

    var body: some View {
        Group {
            if let env = environment {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text("방식")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(width: 60, alignment: .leading)
                        Text(env.authScheme.displayName)
                            .font(.caption)
                        Spacer()
                    }

                    switch env.authScheme {
                    case .none:
                        EmptyView()
                    case .bearer:
                        let token = env.bearerToken ?? ""
                        HStack(spacing: 8) {
                            Text("Token")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 60, alignment: .leading)
                            if token.isEmpty {
                                Label("환경 설정에서 토큰을 입력하세요.", systemImage: "exclamationmark.triangle")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            } else {
                                Text("Bearer •••" + String(token.suffix(6)))
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    case .basic:
                        HStack(spacing: 8) {
                            Text("User")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 60, alignment: .leading)
                            Text(env.basicUsername ?? "없음")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    case .apiKey:
                        HStack(spacing: 8) {
                            Text(env.apiKeyHeaderName ?? "Key")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 60, alignment: .leading)
                            let val = env.apiKeyValue ?? ""
                            Text(val.isEmpty ? "없음" : "•••" + String(val.suffix(4)))
                                .font(.caption)
                                .foregroundStyle(val.isEmpty ? .orange : .secondary)
                        }
                    }
                }
                .padding(.horizontal, 12)
            } else {
                Text("활성 환경이 없습니다.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
            }
        }
    }
}

// MARK: - Shared row components

private struct ParamGroup<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.tertiary)
                .padding(.leading, 2)
            content()
        }
    }
}

private struct ParamInputRow: View {
    let label: String
    let placeholder: String
    var isRequired: Bool = false
    @Binding var value: String

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 2) {
                Text(label)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                if isRequired {
                    Text("*").font(.caption2).foregroundStyle(.red)
                }
            }
            .frame(width: 110, alignment: .leading)
            .lineLimit(1)

            TextField(placeholder, text: $value)
                .font(.system(.caption, design: .monospaced))
                .textFieldStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Color(.textBackgroundColor).opacity(0.5))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor), lineWidth: 1))
        }
    }
}

private struct QueryParamInputRow: View {
    @Binding var param: RequestParam

    var body: some View {
        HStack(spacing: 8) {
            Toggle("", isOn: $param.enabled).labelsHidden().scaleEffect(0.8).frame(width: 24)
            Text(param.key)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(param.enabled ? .primary : .tertiary)
                .frame(width: 90, alignment: .leading)
                .lineLimit(1)
            TextField("값 입력", text: $param.value)
                .font(.system(.caption, design: .monospaced))
                .textFieldStyle(.plain)
                .disabled(!param.enabled)
                .padding(.horizontal, 8).padding(.vertical, 5)
                .background(param.enabled
                    ? Color(.textBackgroundColor).opacity(0.5)
                    : Color(.textBackgroundColor).opacity(0.15))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor), lineWidth: 1))
        }
    }
}

private struct HeaderInputRow: View {
    @Binding var header: RequestParam
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Toggle("", isOn: $header.enabled).labelsHidden().scaleEffect(0.8).frame(width: 24)

            if header.isFromSpec {
                HStack(spacing: 3) {
                    Text(header.key)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(header.enabled ? .primary : .tertiary)
                    if header.isRequired {
                        Text("*").font(.caption2).foregroundStyle(.red)
                    }
                    Image(systemName: "doc.text")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary.opacity(0.6))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8).padding(.vertical, 6)
                .background(Color(.textBackgroundColor).opacity(0.2))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor).opacity(0.5), lineWidth: 1))
            } else {
                TextField("Header 이름", text: $header.key)
                    .font(.system(.caption, design: .monospaced))
                    .textFieldStyle(.plain)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(Color(.textBackgroundColor).opacity(0.5))
                    .clipShape(.rect(cornerRadius: 5))
                    .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor), lineWidth: 1))
            }

            TextField("값", text: $header.value)
                .font(.system(.caption, design: .monospaced))
                .textFieldStyle(.plain)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 8).padding(.vertical, 6)
                .background(header.enabled
                    ? Color(.textBackgroundColor).opacity(0.5)
                    : Color(.textBackgroundColor).opacity(0.15))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor), lineWidth: 1))

            Button(action: onDelete) {
                Image(systemName: "minus.circle.fill").foregroundStyle(.red.opacity(0.7))
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Operation Header

private struct OperationHeaderView: View {
    let operation: ParsedOperation
    let isSending: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(operation.method.rawValue)
                .font(.system(.body, design: .monospaced).bold())
                .foregroundStyle(operation.method.swiftUIColor)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(operation.method.swiftUIColor.opacity(0.12))
                .clipShape(.rect(cornerRadius: 4))

            Text(operation.path)
                .font(.system(.body, design: .monospaced))
                .lineLimit(1)
                .foregroundStyle(.primary)

            Spacer()

            Button {
                onSend()
            } label: {
                if isSending {
                    ProgressView().scaleEffect(0.7).frame(width: 40)
                } else {
                    Text("Send").frame(width: 40)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSending)
            .help("선택한 endpoint로 HTTP 요청을 보냅니다.")
            .keyboardShortcut(.return, modifiers: .command)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
