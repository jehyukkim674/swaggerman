import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var modelContext

    @State private var projectStore: ProjectStore?
    @State private var environmentStore: EnvironmentStore?
    @State private var operationStore: OperationStore?
    @State private var requestEditorStore: RequestEditorStore?
    @State private var historyStore: HistoryStore?

    @State private var showSidebar = true
    @State private var showRequest = true
    @State private var showResponse = true
    @State private var showProjectListEditor = false
    @State private var showEnvironmentEditor = false

    var body: some View {
        VStack(spacing: 0) {
            if let projectStore, let environmentStore,
               let operationStore, let requestEditorStore,
               let historyStore {
                if projectStore.projects.isEmpty {
                    WelcomeView(projectStore: projectStore, environmentStore: environmentStore)
                } else {
                    TopBar(
                        projectStore: projectStore,
                        environmentStore: environmentStore,
                        showSidebar: $showSidebar,
                        showRequest: $showRequest,
                        showResponse: $showResponse,
                        onSettings: { showProjectListEditor = true },
                        onEnvironmentEditor: { showEnvironmentEditor = true }
                    )
                    Divider()
                    HStack(spacing: 0) {
                        if showSidebar {
                            SidebarView(
                                operationStore: operationStore,
                                onSelectOperation: { op in
                                    guard let project = projectStore.selectedProject,
                                          let env = environmentStore.activeEnvironment(for: project) else { return }
                                    let baseURL = env.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                                    requestEditorStore.loadOperation(op, baseURL: baseURL, envID: env.id)
                                }
                            )
                            .frame(width: 240)
                            .frame(maxHeight: .infinity)
                            Divider()
                        }
                        if showRequest {
                            RequestPaneView(
                                store: requestEditorStore,
                                activeEnvironment: projectStore.selectedProject.flatMap {
                                    environmentStore.activeEnvironment(for: $0)
                                },
                                onSend: {
                                    guard let project = projectStore.selectedProject else { return }
                                    await requestEditorStore.send(project: project, historyStore: historyStore)
                                }
                            )
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            Divider()
                        }
                        if showResponse {
                            ResponsePaneView(store: requestEditorStore)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        }
                    }
                }
            } else {
                ProgressView("초기화 중...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .preferredColorScheme(.dark)
        .task {
            let ps = ProjectStore(modelContext: modelContext)
            let es = EnvironmentStore(modelContext: modelContext)
            let os = OperationStore()
            let res = RequestEditorStore()
            let hs = HistoryStore(modelContext: modelContext)
            projectStore = ps
            environmentStore = es
            operationStore = os
            requestEditorStore = res
            historyStore = hs
            if let project = ps.selectedProject {
                es.onProjectChanged(project)
                Task { try? await os.loadSpec(for: project) }
            }
        }
        .onChange(of: projectStore?.selectedProject?.id) { _, _ in
            guard let project = projectStore?.selectedProject,
                  let os = operationStore,
                  let es = environmentStore,
                  let res = requestEditorStore else { return }
            es.onProjectChanged(project)
            os.clearSpec()
            res.clearSelection()
            Task { try? await os.loadSpec(for: project) }
        }
        .sheet(isPresented: $showProjectListEditor) {
            if let ps = projectStore {
                ProjectListEditor(store: ps)
            }
        }
        .sheet(isPresented: $showEnvironmentEditor) {
            if let project = projectStore?.selectedProject,
               let es = environmentStore {
                EnvironmentEditor(project: project, store: es)
            }
        }
    }
}

// MARK: - Welcome / Onboarding

private struct WelcomeView: View {
    let projectStore: ProjectStore
    let environmentStore: EnvironmentStore

    @State private var alias = ""
    @State private var swaggerURL = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 28) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 60))
                .foregroundStyle(Color.accentColor)

            VStack(spacing: 6) {
                Text("Swagger Man")
                    .font(.largeTitle.bold())
                Text("OpenAPI 3.x Spec URL을 입력해서 시작하세요.")
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 10) {
                TextField("프로젝트 이름 (예: My API)", text: $alias)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 420)

                TextField("Swagger URL", text: $swaggerURL)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 420)

                if let err = errorMessage {
                    Text(err).foregroundStyle(.red).font(.caption)
                }
            }

            Button("시작하기") { addProject() }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(alias.isEmpty || swaggerURL.isEmpty)
                .keyboardShortcut(.return)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func addProject() {
        do {
            try projectStore.addProject(alias: alias, swaggerURL: swaggerURL)
            if let project = projectStore.projects.first {
                projectStore.selectProject(project)
                environmentStore.onProjectChanged(project)
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
