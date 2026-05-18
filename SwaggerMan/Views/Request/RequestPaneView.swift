import SwiftUI

struct RequestPaneView: View {
    @Bindable var store: RequestEditorStore
    @Bindable var operationStore: OperationStore
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

                // Inline auth token bar (if spec defines security schemes)
                if !operationStore.securitySchemes.isEmpty {
                    Divider()
                    AuthTokenBar(operationStore: operationStore)
                }

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

