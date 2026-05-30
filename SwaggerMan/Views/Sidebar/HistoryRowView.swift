import SwiftUI

struct HistoryRowView: View {
    let item: HistoryItem
    let onSelect: () -> Void
    let onReplay: () -> Void
    var onDelete: (() -> Void)?

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
                Text(relativeText)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .help("\(absoluteText) 실행됨")
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

                if let onDelete {
                    Button(action: onDelete) {
                        Image(systemName: "trash")
                            .font(.caption)
                            .foregroundStyle(.red.opacity(0.8))
                    }
                    .buttonStyle(.plain)
                    .help("이 히스토리 항목 삭제")
                }
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 2)
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .onHover { isHovered = $0 }
    }

    /// "~전" 형태의 경과 시간(초 단위는 생략). 예: 방금 전 / 3분 전 / 1시간 5분 전 / 2일 전
    private var relativeText: String {
        let elapsed = Date().timeIntervalSince(item.executedAt)
        if elapsed < 60 { return "방금 전" }
        let minutes = Int(elapsed) / 60
        if minutes < 60 { return "\(minutes)분 전" }
        let hours = minutes / 60
        let remainMinutes = minutes % 60
        if hours < 24 {
            return remainMinutes > 0 ? "\(hours)시간 \(remainMinutes)분 전" : "\(hours)시간 전"
        }
        let days = hours / 24
        if days < 7 { return "\(days)일 전" }
        return absoluteText
    }

    /// 정확한 실행 시각 (툴팁용)
    private var absoluteText: String {
        Self.absoluteFormatter.string(from: item.executedAt)
    }

    private static let absoluteFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return formatter
    }()

    private var methodColor: Color {
        HTTPMethod.color(for: item.method)
    }

    private var statusColor: Color {
        .httpStatus(item.responseStatus)
    }
}
