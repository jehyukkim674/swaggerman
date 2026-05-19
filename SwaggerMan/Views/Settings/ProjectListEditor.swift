import SwiftUI

struct ProjectListEditor: View {
    @Bindable var store: ProjectStore
    @Environment(\.dismiss) private var dismiss

    @State private var selectedProject: Project?
    @State private var showAddSheet = false

    var body: some View {
        NavigationSplitView {
            List(store.projects, selection: $selectedProject) { project in
                VStack(alignment: .leading, spacing: 2) {
                    Text(project.alias).font(.headline)
                    Text(project.swaggerURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .tag(project)
            }
            .navigationTitle("프로젝트")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAddSheet = true } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem {
                    Button {
                        if let project = selectedProject {
                            try? store.deleteProject(project)
                            selectedProject = nil
                        }
                    } label: {
                        Image(systemName: "minus")
                    }
                    .disabled(selectedProject == nil)
                }
            }
        } detail: {
            if let project = selectedProject {
                ProjectDetailForm(project: project, store: store)
                    .id(project.id)
            } else {
                ContentUnavailableView(
                    "프로젝트 선택",
                    systemImage: "doc.text",
                    description: Text("왼쪽에서 프로젝트를 선택하거나 + 버튼으로 추가하세요.")
                )
            }
        }
        .sheet(isPresented: $showAddSheet) {
            AddProjectSheet(store: store)
        }
        .frame(minWidth: 600, minHeight: 400)
    }
}

// MARK: - Detail form

struct ProjectDetailForm: View {
    let project: Project
    let store: ProjectStore
    @State private var alias: String
    @State private var swaggerURL: String
    @State private var authType: String
    @State private var value1: String
    @State private var value2: String
    @State private var value3: String
    @State private var disableTLS: Bool
    @State private var validationError: String?

    private let authTypes = ["none", "bearer", "basic", "apikey", "login"]
    private let authTypeLabels = [
        "none": "없음",
        "bearer": "Bearer Token",
        "basic": "Basic Auth",
        "apikey": "API Key (헤더)",
        "login": "로그인 (자동 토큰 획득)"
    ]

    init(project: Project, store: ProjectStore) {
        self.project = project
        self.store = store
        _alias = State(initialValue: project.alias)
        _swaggerURL = State(initialValue: project.swaggerURL)
        _authType = State(initialValue: project.specAuthType ?? "none")
        _value1 = State(initialValue: project.specAuthValue1 ?? "")
        _value2 = State(initialValue: project.specAuthValue2 ?? "")
        _value3 = State(initialValue: project.specAuthValue3 ?? "")
        _disableTLS = State(initialValue: project.disableTLSVerification)
    }

    var body: some View {
        Form {
            Section("기본 정보") {
                TextField("Alias", text: $alias)
                    .multilineTextAlignment(.leading)
                TextField("Swagger URL", text: $swaggerURL)
                    .multilineTextAlignment(.leading)
                Toggle("TLS 검증 무시 (자체 서명 인증서)", isOn: $disableTLS)
            }
            Section {
                Picker("인증 방식", selection: $authType) {
                    ForEach(authTypes, id: \.self) { type in
                        Text(authTypeLabels[type] ?? type).tag(type)
                    }
                }
                switch authType {
                case "bearer":
                    SecureField("토큰", text: $value1)
                        .textContentType(.password)
                case "basic":
                    TextField("사용자 이름", text: $value1)
                        .multilineTextAlignment(.leading)
                    SecureField("비밀번호", text: $value2)
                        .textContentType(.password)
                case "apikey":
                    TextField("헤더 이름 (예: X-API-Key)", text: $value1)
                        .multilineTextAlignment(.leading)
                    SecureField("헤더 값", text: $value2)
                        .textContentType(.password)
                case "login":
                    TextField("로그인 URL (예: /api/auth/login)", text: $value1)
                        .multilineTextAlignment(.leading)
                    TextField("사용자 이름", text: $value2)
                        .multilineTextAlignment(.leading)
                    SecureField("비밀번호", text: $value3)
                        .textContentType(.password)
                default:
                    EmptyView()
                }
            } header: {
                Text("Spec 인증")
            } footer: {
                specAuthFooter
            }
            if let err = validationError {
                Text(err).foregroundStyle(.red).font(.caption)
            }
            Button("저장") { save() }
                .disabled(alias.isEmpty || swaggerURL.isEmpty)
        }
        .formStyle(.grouped)
        .navigationTitle(project.alias)
    }

    @ViewBuilder
    private var specAuthFooter: some View {
        switch authType {
        case "bearer":
            Text("Authorization: Bearer <토큰> 헤더로 spec을 가져옵니다.")
        case "basic":
            Text("Authorization: Basic <base64(id:pw)> 헤더로 spec을 가져옵니다.")
        case "apikey":
            Text("지정한 헤더 이름과 값을 spec 요청에 포함합니다.")
        case "login":
            Text("로그인 URL에 POST해 토큰을 받아온 뒤 Bearer로 spec을 가져옵니다. 응답 JSON의 token / access_token / jwt 필드를 자동으로 인식합니다.")
        default:
            EmptyView()
        }
    }

    func save() {
        do {
            let type = authType == "none" ? nil : authType
            try store.updateProject(
                project, alias: alias, swaggerURL: swaggerURL,
                disableTLSVerification: disableTLS,
                specAuthType: type,
                specAuthValue1: value1, specAuthValue2: value2, specAuthValue3: value3
            )
            validationError = nil
        } catch {
            validationError = error.localizedDescription
        }
    }
}

// MARK: - Add sheet

struct AddProjectSheet: View {
    let store: ProjectStore
    @Environment(\.dismiss) private var dismiss
    @State private var alias = ""
    @State private var swaggerURL = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("새 프로젝트 추가").font(.title2).bold()

            Form {
                TextField("Alias (예: My API)", text: $alias)
                TextField("Swagger URL", text: $swaggerURL)
            }
            .formStyle(.grouped)

            if let err = errorMessage {
                Text(err).foregroundStyle(.red).font(.caption)
            }

            HStack {
                Spacer()
                Button("취소", role: .cancel) { dismiss() }
                Button("추가") { addProject() }
                    .disabled(alias.isEmpty || swaggerURL.isEmpty)
                    .keyboardShortcut(.return)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding()
        .frame(width: 420)
    }

    func addProject() {
        do {
            try store.addProject(alias: alias, swaggerURL: swaggerURL)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
