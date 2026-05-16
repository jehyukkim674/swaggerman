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

                TabView {
                    ParamsTab(store: store)
                        .tabItem { Text("Params") }
                    HeadersTab(store: store)
                        .tabItem { Text("Headers") }
                    BodyTab(store: store, hasBody: op.requestBody != nil)
                        .tabItem { Text("Body") }
                    AuthTab(environment: activeEnvironment)
                        .tabItem { Text("Auth") }
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
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
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
                    ProgressView()
                        .scaleEffect(0.7)
                        .frame(width: 40)
                } else {
                    Text("Send")
                        .frame(width: 40)
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
