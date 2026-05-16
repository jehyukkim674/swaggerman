import SwiftUI

struct EnvironmentEditor: View {
    let project: Project
    @Bindable var store: EnvironmentStore
    @Environment(\.dismiss) private var dismiss

    @State private var selectedEnv: APIEnvironment?
    @State private var showAddSheet = false

    var body: some View {
        NavigationSplitView {
            List(project.environments, selection: $selectedEnv) { env in
                VStack(alignment: .leading, spacing: 2) {
                    Text(env.name).font(.headline)
                    Text(env.baseURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .tag(env)
            }
            .navigationTitle("환경")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAddSheet = true } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem {
                    Button {
                        if let e = selectedEnv {
                            try? store.deleteEnvironment(e, from: project)
                            selectedEnv = nil
                        }
                    } label: {
                        Image(systemName: "minus")
                    }
                    .disabled(selectedEnv == nil)
                }
            }
        } detail: {
            if let env = selectedEnv {
                EnvironmentDetailForm(env: env, project: project, store: store)
            } else {
                ContentUnavailableView(
                    "환경 선택",
                    systemImage: "server.rack",
                    description: Text("왼쪽에서 환경을 선택하거나 + 버튼으로 추가하세요.")
                )
            }
        }
        .sheet(isPresented: $showAddSheet) {
            AddEnvironmentSheet(project: project, store: store)
        }
        .frame(minWidth: 520, minHeight: 380)
    }
}

// MARK: - Detail form

private struct EnvironmentDetailForm: View {
    let env: APIEnvironment
    let project: Project
    @Bindable var store: EnvironmentStore

    @State private var name: String
    @State private var baseURL: String
    @State private var authScheme: AuthSchemeType
    @State private var bearerToken: String
    @State private var basicUsername: String
    @State private var basicPassword: String
    @State private var apiKeyHeaderName: String
    @State private var apiKeyValue: String
    @State private var apiKeyInQuery: Bool
    @State private var disableTLS: Bool
    @State private var errorMessage: String?

    init(env: APIEnvironment, project: Project, store: EnvironmentStore) {
        self.env = env
        self.project = project
        self.store = store
        _name = State(initialValue: env.name)
        _baseURL = State(initialValue: env.baseURL)
        _authScheme = State(initialValue: env.authScheme)
        _bearerToken = State(initialValue: env.bearerToken ?? "")
        _basicUsername = State(initialValue: env.basicUsername ?? "")
        _basicPassword = State(initialValue: env.basicPassword ?? "")
        _apiKeyHeaderName = State(initialValue: env.apiKeyHeaderName ?? "X-API-Key")
        _apiKeyValue = State(initialValue: env.apiKeyValue ?? "")
        _apiKeyInQuery = State(initialValue: env.apiKeyInQuery)
        _disableTLS = State(initialValue: env.disableTLSValidation)
    }

    var body: some View {
        Form {
            Section("기본 설정") {
                TextField("이름", text: $name)
                TextField("Base URL", text: $baseURL)
                    .font(.system(.body, design: .monospaced))
            }

            Section("인증") {
                Picker("방식", selection: $authScheme) {
                    ForEach(AuthSchemeType.allCases, id: \.self) { scheme in
                        Text(scheme.displayName).tag(scheme)
                    }
                }

                switch authScheme {
                case .none:
                    EmptyView()
                case .bearer:
                    SecureField("Bearer Token", text: $bearerToken)
                        .font(.system(.body, design: .monospaced))
                case .basic:
                    TextField("사용자명 (Username)", text: $basicUsername)
                    SecureField("비밀번호 (Password)", text: $basicPassword)
                case .apiKey:
                    TextField("헤더/파라미터 이름", text: $apiKeyHeaderName)
                        .font(.system(.body, design: .monospaced))
                    SecureField("값 (Value)", text: $apiKeyValue)
                        .font(.system(.body, design: .monospaced))
                    Toggle("Query Parameter로 전송", isOn: $apiKeyInQuery)
                }
            }

            Section("고급") {
                Toggle("TLS 검증 비활성화", isOn: $disableTLS)
            }

            if let err = errorMessage {
                Section { Text(err).foregroundStyle(.red).font(.caption) }
            }

            Section {
                Button("저장") { save() }
                    .disabled(name.isEmpty || baseURL.isEmpty)
                    .buttonStyle(.borderedProminent)
            }
        }
        .formStyle(.grouped)
        .navigationTitle(env.name)
    }

    private func save() {
        do {
            try store.updateEnvironment(
                env,
                name: name,
                baseURL: baseURL,
                authScheme: authScheme,
                bearerToken: bearerToken.isEmpty ? nil : bearerToken,
                basicUsername: basicUsername.isEmpty ? nil : basicUsername,
                basicPassword: basicPassword.isEmpty ? nil : basicPassword,
                apiKeyHeaderName: apiKeyHeaderName.isEmpty ? nil : apiKeyHeaderName,
                apiKeyValue: apiKeyValue.isEmpty ? nil : apiKeyValue,
                apiKeyInQuery: apiKeyInQuery,
                disableTLS: disableTLS
            )
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Add sheet

private struct AddEnvironmentSheet: View {
    let project: Project
    @Bindable var store: EnvironmentStore
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var baseURL = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("환경 추가").font(.title2).bold()

            Form {
                TextField("이름 (예: Dev)", text: $name)
                TextField("Base URL", text: $baseURL)
                    .font(.system(.body, design: .monospaced))
            }
            .formStyle(.grouped)

            if let err = errorMessage {
                Text(err).foregroundStyle(.red).font(.caption)
            }

            HStack {
                Spacer()
                Button("취소", role: .cancel) { dismiss() }
                Button("추가") { addEnvironment() }
                    .disabled(name.isEmpty || baseURL.isEmpty)
                    .keyboardShortcut(.return)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding()
        .frame(width: 400)
    }

    private func addEnvironment() {
        do {
            try store.addEnvironment(name: name, baseURL: baseURL, to: project)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
