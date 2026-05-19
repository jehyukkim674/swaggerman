import SwiftUI

struct SentRequestSection: View {
    let request: HTTPRequest
    @State private var isExpanded = true

    private var sortedHeaders: [(key: String, value: String)] {
        request.headers.sorted { $0.key < $1.key }
    }

    private var bodyString: String? {
        guard let data = request.body, !data.isEmpty else { return nil }
        let raw = String(data: data, encoding: .utf8) ?? ""
        guard let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .prettyPrinted),
              let str = String(data: pretty, encoding: .utf8) else { return raw }
        return str
    }

    var body: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { isExpanded.toggle() }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text("Request Headers")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text("\(sortedHeaders.count)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(spacing: 0) {
                    ForEach(sortedHeaders, id: \.key) { item in
                        HStack(alignment: .top, spacing: 8) {
                            Text(item.key)
                                .font(.system(.caption, design: .monospaced).bold())
                                .foregroundStyle(.primary)
                                .frame(width: 160, alignment: .leading)
                            Text(item.value)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 3)
                    }
                    if let body = bodyString {
                        Divider().padding(.vertical, 4)
                        HStack(alignment: .top, spacing: 8) {
                            Text("Body")
                                .font(.system(.caption, design: .monospaced).bold())
                                .foregroundStyle(.primary)
                                .frame(width: 160, alignment: .leading)
                            Text(body)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 3)
                    }
                }
                .padding(.bottom, 4)
            }
        }
        .background(Color(.textBackgroundColor).opacity(0.2))
    }
}
