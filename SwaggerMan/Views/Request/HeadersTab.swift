import SwiftUI

struct HeadersTab: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        VStack(spacing: 0) {
            if store.requestHeaders.isEmpty {
                ContentUnavailableView(
                    "헤더 없음",
                    systemImage: "list.bullet.rectangle",
                    description: Text("아래 버튼으로 헤더를 추가하세요.")
                )
            } else {
                ScrollView {
                    VStack(spacing: 4) {
                        ForEach($store.requestHeaders) { $header in
                            HeadersTabInputRow(header: $header) {
                                store.requestHeaders.removeAll { $0.id == header.id }
                            }
                        }
                    }
                    .padding(12)
                }
            }

            Divider()

            Button {
                store.requestHeaders.append(RequestParam(key: "", value: "", enabled: true))
            } label: {
                Label("헤더 추가", systemImage: "plus")
                    .font(.caption.weight(.medium))
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.accentColor)
            .padding(10)
        }
    }
}

private struct HeadersTabInputRow: View {
    @Binding var header: RequestParam
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Toggle("", isOn: $header.enabled)
                .labelsHidden()
                .scaleEffect(0.85)
                .frame(width: 24)

            TextField("Header 이름", text: $header.key)
                .font(.system(.caption, design: .monospaced))
                .textFieldStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(header.enabled
                    ? Color(.textBackgroundColor).opacity(0.5)
                    : Color(.textBackgroundColor).opacity(0.15))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(
                    RoundedRectangle(cornerRadius: 5)
                        .stroke(Color(.separatorColor), lineWidth: 1)
                )

            TextField("값", text: $header.value)
                .font(.system(.caption, design: .monospaced))
                .textFieldStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity)
                .background(header.enabled
                    ? Color(.textBackgroundColor).opacity(0.5)
                    : Color(.textBackgroundColor).opacity(0.15))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(
                    RoundedRectangle(cornerRadius: 5)
                        .stroke(Color(.separatorColor), lineWidth: 1)
                )

            Button(action: onDelete) {
                Image(systemName: "minus.circle.fill")
                    .foregroundStyle(.red.opacity(0.8))
            }
            .buttonStyle(.plain)
        }
    }
}
