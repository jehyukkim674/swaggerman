import SwiftUI

struct HistoryRowView: View {
    let item: HistoryItem
    let onSelect: () -> Void
    let onReplay: () -> Void

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 6) {
            Text(item.method)
                .font(.system(.caption2, design: .monospaced).bold())
                .foregroundStyle(methodColor)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(methodColor.opacity(0.12))
                .clipShape(.rect(cornerRadius: 3))

            VStack(alignment: .leading, spacing: 1) {
                Text(item.path)
                    .font(.system(.caption, design: .monospaced))
                    .lineLimit(1)
                Text(item.executedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer()

            Text("\(item.responseStatus)")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(statusColor)

            if isHovered {
                Button(action: onReplay) {
                    Image(systemName: "arrow.clockwise")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("요청 에디터에 불러오기 (응답 초기화)")
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 2)
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .onHover { isHovered = $0 }
    }

    private var methodColor: Color {
        HTTPMethod.color(for: item.method)
    }

    private var statusColor: Color {
        .httpStatus(item.responseStatus)
    }
}
