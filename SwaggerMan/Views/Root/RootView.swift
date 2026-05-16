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
                                guard let project = projectStore.selectedProject else { return }
                                let env = environmentStore.activeEnvironment(for: project)
                                let baseURL = (env?.baseURL ?? project.swaggerURL)
                                    .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                                let envID = env?.id ?? UUID()
                                requestEditorStore.loadOperation(op, baseURL: baseURL, envID: envID)
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
            } else {
                ProgressView("초기화 중...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
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
