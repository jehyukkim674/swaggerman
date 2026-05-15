import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var modelContext

    @State private var projectStore: ProjectStore?
    @State private var environmentStore: EnvironmentStore?
    @State private var operationStore = OperationStore()

    @State private var showSidebar = true
    @State private var showRequest = true
    @State private var showResponse = true
    @State private var showProjectSettings = false

    var body: some View {
        VStack(spacing: 0) {
            if let projectStore, let environmentStore {
                TopBar(
                    projectStore: projectStore,
                    environmentStore: environmentStore,
                    showSidebar: $showSidebar,
                    showRequest: $showRequest,
                    showResponse: $showResponse,
                    onSettings: { showProjectSettings = true }
                )
                Divider()
                HStack(spacing: 0) {
                    if showSidebar {
                        Text("Sidebar")
                            .frame(width: 240)
                            .frame(maxHeight: .infinity)
                            .background(Color(.windowBackgroundColor))
                        Divider()
                    }
                    if showRequest {
                        Text("Request Pane")
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        Divider()
                    }
                    if showResponse {
                        Text("Response Pane")
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
            projectStore = ps
            environmentStore = es
        }
        .sheet(isPresented: $showProjectSettings) {
            if let ps = projectStore {
                ProjectListEditor(store: ps)
            }
        }
    }
}
