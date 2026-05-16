import SwiftUI

struct AuthTab: View {
    let environment: APIEnvironment?

    var body: some View {
        Form {
            Section {
                if let env = environment {
                    LabeledContent("인증 방식") {
                        Text(env.authScheme.displayName)
                            .foregroundStyle(.secondary)
                    }
                    if env.authScheme != .none {
                        Text("토큰은 환경 설정에서 관리합니다.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("활성 환경이 없습니다. TopBar에서 환경을 선택하세요.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
    }

}
