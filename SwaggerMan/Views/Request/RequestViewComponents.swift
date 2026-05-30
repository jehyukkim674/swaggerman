import SwiftUI

// MARK: - Operation Header

struct OperationHeaderView: View {
    let operation: ParsedOperation
    let isSending: Bool
    let onSend: () -> Void
    let onCancel: () -> Void

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

            if isSending {
                // 응답이 다 올 때까지 로딩 표시. 클릭하면 취소(중복 전송 방지).
                Button(action: onCancel) {
                    HStack(spacing: 5) {
                        ProgressView()
                            .controlSize(.small)
                            .scaleEffect(0.7)
                        Text("전송 중")
                    }
                    .frame(width: 70)
                }
                .buttonStyle(.bordered)
                .tint(.secondary)
                .help("응답을 기다리는 중입니다. 클릭하면 취소합니다.")
                .keyboardShortcut(.escape, modifiers: [])
            } else {
                Button(action: onSend) {
                    Text("Send").frame(width: 50)
                }
                .buttonStyle(.borderedProminent)
                .help("선택한 endpoint로 HTTP 요청을 보냅니다.")
                .keyboardShortcut(.return, modifiers: .command)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

// MARK: - Header Value Field

struct HeaderValueField: View {
    @Binding var value: String
    let enabled: Bool

    private var hasNewline: Bool {
        value.contains("\n")
    }

    private var hasLeadingSpace: Bool {
        value.first?.isWhitespace == true
    }

    private var hasTrailingSpace: Bool {
        value.last?.isWhitespace == true && !value.isEmpty
    }

    private var hasWhitespaceBoundary: Bool {
        hasLeadingSpace || hasTrailingSpace
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Group {
                if hasNewline {
                    TextEditor(text: $value)
                        .font(.system(.caption, design: .monospaced))
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .scrollContentBackground(.hidden)
                } else {
                    TextField("값", text: $value)
                        .font(.system(.caption, design: .monospaced))
                        .textFieldStyle(.plain)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, hasNewline ? 4 : 6)
            .background(enabled
                ? Color(.textBackgroundColor).opacity(0.5)
                : Color(.textBackgroundColor).opacity(0.15))
            .clipShape(.rect(cornerRadius: 5))
            .overlay(
                RoundedRectangle(cornerRadius: 5)
                    .stroke(hasWhitespaceBoundary ? Color.orange.opacity(0.8) : Color(.separatorColor), lineWidth: 1)
            )
            .overlay(alignment: .topTrailing) {
                if hasNewline {
                    Text("↵ \(value.components(separatedBy: "\n").count - 1)줄")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(.bar)
                        .clipShape(.rect(cornerRadius: 3))
                        .padding(4)
                }
            }

            if hasWhitespaceBoundary {
                HStack(spacing: 3) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 9))
                        .foregroundStyle(.orange)
                    if hasLeadingSpace, hasTrailingSpace {
                        Text("앞뒤 공백 포함")
                    } else if hasLeadingSpace {
                        Text("앞 공백 포함")
                    } else {
                        Text("뒤 공백 포함")
                    }
                    Button("제거") { value = value.trimmingCharacters(in: .whitespaces) }
                        .buttonStyle(.plain)
                        .foregroundStyle(.orange)
                        .underline()
                }
                .font(.system(size: 10))
                .foregroundStyle(.orange.opacity(0.9))
                .padding(.leading, 4)
            }
        }
    }
}
