import SwiftUI

struct AuthTab: View {
    let environment: APIEnvironment?

    var body: some View {
        if let env = environment {
            Form {
                Section("현재 환경 인증") {
                    LabeledContent("방식") {
                        Text(env.authScheme.displayName)
                            .foregroundStyle(.secondary)
                    }

                    switch env.authScheme {
                    case .none:
                        Text("인증 없이 요청합니다.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    case .bearer:
                        if let token = env.bearerToken, !token.isEmpty {
                            LabeledContent("Token") {
                                Text("Bearer •••" + String(token.suffix(6)))
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            Label("토큰이 설정되지 않았습니다.", systemImage: "exclamationmark.triangle")
                                .font(.caption)
                                .foregroundStyle(.orange)
                        }
                    case .basic:
                        LabeledContent("사용자명") {
                            Text(env.basicUsername ?? "없음").foregroundStyle(.secondary)
                        }
                        if env.basicPassword?.isEmpty == false {
                            LabeledContent("비밀번호") {
                                Text("•••••").foregroundStyle(.secondary)
                            }
                        }
                    case .apiKey:
                        LabeledContent(env.apiKeyHeaderName ?? "API Key") {
                            let val = env.apiKeyValue ?? ""
                            Text(val.isEmpty ? "없음" : "•••" + String(val.suffix(4)))
                                .foregroundStyle(val.isEmpty ? .orange : .secondary)
                        }
                        if env.apiKeyInQuery == true {
                            Text("Query parameter로 전송됩니다.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    HStack(spacing: 4) {
                        Image(systemName: "info.circle")
                        Text("환경 설정에서 토큰 값을 변경할 수 있습니다.")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
        } else {
            ContentUnavailableView(
                "환경 없음",
                systemImage: "lock.slash",
                description: Text("상단 바에서 환경을 선택하세요.")
            )
        }
    }
}
