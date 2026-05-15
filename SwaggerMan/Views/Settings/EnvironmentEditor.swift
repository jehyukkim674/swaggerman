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
        .frame(minWidth: 500, minHeight: 350)
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
    @State private var disableTLS: Bool
    @State private var errorMessage: String?

    init(env: APIEnvironment, project: Project, store: EnvironmentStore) {
        self.env = env
        self.project = project
        self.store = store
        _name = State(initialValue: env.name)
        _baseURL = State(initialValue: env.baseURL)
        _authScheme = State(initialValue: env.authScheme)
        _disableTLS = State(initialValue: env.disableTLSValidation)
    }

    var body: some View {
        Form {
            TextField("이름", text: $name)
            TextField("Base URL", text: $baseURL)
            Picker("인증 방식", selection: $authScheme) {
                Text("없음").tag(AuthSchemeType.none)
                Text("Bearer Token").tag(AuthSchemeType.bearer)
                Text("Basic Auth").tag(AuthSchemeType.basic)
                Text("API Key").tag(AuthSchemeType.apiKey)
            }
            Toggle("TLS 검증 비활성화", isOn: $disableTLS)

            if let err = errorMessage {
                Text(err).foregroundStyle(.red).font(.caption)
            }

            Button("저장") { save() }
                .disabled(name.isEmpty || baseURL.isEmpty)
        }
        .formStyle(.grouped)
        .navigationTitle(env.name)
    }

    private func save() {
        do {
            try store.updateEnvironment(env, name: name, baseURL: baseURL, authScheme: authScheme, disableTLS: disableTLS)
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
        .frame(width: 380)
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
