import SwiftUI

struct BodyTab: View {
    @Bindable var store: RequestEditorStore
    let hasBody: Bool

    var body: some View {
        if !hasBody {
            ContentUnavailableView(
                "요청 본문 없음",
                systemImage: "doc.slash",
                description: Text("이 endpoint는 요청 본문을 사용하지 않습니다.")
            )
        } else {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("JSON")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("포맷") { formatJSON() }
                        .controlSize(.small)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)

                Divider()

                TextEditor(text: $store.bodyJSON)
                    .font(.system(.body, design: .monospaced))
                    .padding(8)
            }
        }
    }

    func formatJSON() {
        guard let data = store.bodyJSON.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .prettyPrinted),
              let str = String(data: pretty, encoding: .utf8) else { return }
        store.bodyJSON = str
    }
}
