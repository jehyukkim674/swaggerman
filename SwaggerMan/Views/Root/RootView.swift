import SwiftData
import SwiftUI

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

    @State private var sidebarWidth: CGFloat = 240
    @State private var responseWidth: CGFloat = 420

    var body: some View {
        VStack(spacing: 0) {
            if let projectStore, let environmentStore,
               let operationStore, let requestEditorStore,
               let historyStore
            {
                if projectStore.projects.isEmpty {
                    WelcomeView(projectStore: projectStore, environmentStore: environmentStore)
                } else {
                    TopBar(
                        projectStore: projectStore,
                        environmentStore: environmentStore,
                        operationStore: operationStore,
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
                                selectedOperationID: requestEditorStore.selectedOperation?.id,
                                onSelectOperation: { op in
                                    guard let project = projectStore.selectedProject,
                                          let env = environmentStore.activeEnvironment(for: project) else { return }
                                    let baseURL = env.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                                    requestEditorStore.loadOperation(op, baseURL: baseURL, environment: env,
                                                                     securityHeaders: operationStore
                                                                         .computedSecurityHeaders)
                                    projectStore.saveLastOperationID(op.id, for: project)
                                }
                            )
                            .frame(width: sidebarWidth)
                            PanelDivider { delta in
                                sidebarWidth = max(80, sidebarWidth + delta)
                            }
                        }
                        if showRequest {
                            RequestPaneView(
                                store: requestEditorStore,
                                operationStore: operationStore,
                                activeEnvironment: projectStore.selectedProject.flatMap {
                                    environmentStore.activeEnvironment(for: $0)
                                },
                                onSend: {
                                    guard let project = projectStore.selectedProject else { return }
                                    await requestEditorStore.send(project: project, historyStore: historyStore)
                                }
                            )
                            .frame(maxWidth: .infinity)
                            if showResponse {
                                PanelDivider { delta in
                                    responseWidth = max(80, responseWidth - delta)
                                }
                            }
                        }
                        if showResponse {
                            ResponsePaneView(store: requestEditorStore)
                                .frame(width: responseWidth)
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                Task {
                    try? await os.loadSpec(for: project)
                    restoreLastOperation(project: project, os: os, es: es, res: res)
                }
            }
        }
        .onChange(of: projectStore?.selectedProject?.id) { oldID, newID in
            guard oldID != newID else { return }
            guard let project = projectStore?.selectedProject,
                  let os = operationStore,
                  let es = environmentStore,
                  let res = requestEditorStore else { return }
            es.onProjectChanged(project)
            os.clearSpec()
            res.clearSelection()
            Task {
                try? await os.loadSpec(for: project)
                restoreLastOperation(project: project, os: os, es: es, res: res)
            }
        }
        .sheet(isPresented: $showProjectListEditor) {
            if let ps = projectStore {
                ProjectListEditor(store: ps)
            }
        }
        .sheet(isPresented: $showEnvironmentEditor) {
            if let project = projectStore?.selectedProject,
               let es = environmentStore
            {
                EnvironmentEditor(project: project, store: es)
            }
        }
    }

    @MainActor
    func restoreLastOperation(project: Project, os: OperationStore,
                              es: EnvironmentStore, res: RequestEditorStore)
    {
        guard let lastID = project.lastOperationID,
              let op = os.operations.first(where: { $0.id == lastID }),
              let env = es.activeEnvironment(for: project) else { return }
        let baseURL = env.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        res.loadOperation(op, baseURL: baseURL, environment: env,
                          securityHeaders: os.computedSecurityHeaders)
    }
}

// MARK: - Welcome / Onboarding

struct WelcomeView: View {
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
                Text("OpenAPI JSON spec URL을 입력해서 시작하세요.")
                    .foregroundStyle(.secondary)
                Text("Swagger UI 주소(index.html)가 아닌 spec 파일 URL이 필요합니다.")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            VStack(alignment: .leading, spacing: 10) {
                TextField("프로젝트 이름 (예: My API)", text: $alias)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 420)

                TextField("JSON Spec URL (예: /v3/api-docs, /openapi.json)", text: $swaggerURL)
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

    func addProject() {
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

// MARK: - Draggable Panel Divider (native AppKit for smooth tracking)

struct PanelDivider: View {
    let onDrag: (CGFloat) -> Void

    var body: some View {
        NativeDividerView(onDrag: onDrag)
            .frame(width: 8)
    }
}

struct NativeDividerView: NSViewRepresentable {
    let onDrag: (CGFloat) -> Void

    func makeNSView(context _: Context) -> DividerNSView {
        let v = DividerNSView()
        v.onDrag = onDrag
        return v
    }

    func updateNSView(_ nsView: DividerNSView, context _: Context) {
        nsView.onDrag = onDrag
    }
}

final class DividerNSView: NSView {
    var onDrag: ((CGFloat) -> Void)?

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .resizeLeftRight)
    }

    override func mouseDown(with event: NSEvent) {
        var prevX = event.locationInWindow.x
        window?.trackEvents(
            matching: [.leftMouseDragged, .leftMouseUp],
            timeout: .infinity,
            mode: .eventTracking
        ) { [weak self] event, stop in
            guard let event else { stop.pointee = true; return }
            switch event.type {
            case .leftMouseDragged:
                let x = event.locationInWindow.x
                self?.onDrag?(x - prevX)
                prevX = x
            default:
                stop.pointee = true
            }
        }
    }

    override func draw(_: NSRect) {
        NSColor.separatorColor.setFill()
        NSRect(x: (bounds.width - 1) / 2, y: 0, width: 1, height: bounds.height).fill()
    }
}
