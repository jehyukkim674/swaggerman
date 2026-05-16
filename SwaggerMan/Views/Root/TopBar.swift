import SwiftUI

struct TopBar: View {
    @Bindable var projectStore: ProjectStore
    @Bindable var environmentStore: EnvironmentStore
    @Binding var showSidebar: Bool
    @Binding var showRequest: Bool
    @Binding var showResponse: Bool
    let onSettings: () -> Void
    let onEnvironmentEditor: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Menu {
                ForEach(projectStore.projects) { project in
                    Button(project.alias) {
                        projectStore.selectProject(project)
                        environmentStore.onProjectChanged(project)
                    }
                }
                Divider()
                Button("프로젝트 관리...") { onSettings() }
            } label: {
                Label(
                    projectStore.selectedProject?.alias ?? "프로젝트 없음",
                    systemImage: "doc.text"
                )
                .frame(minWidth: 120)
            }
            .menuStyle(.borderedButton)

            if let project = projectStore.selectedProject {
                Menu {
                    ForEach(project.environments) { env in
                        Button(env.name) {
                            environmentStore.setActive(env, for: project)
                        }
                    }
                    Divider()
                    Button("환경 관리...") { onEnvironmentEditor() }
                } label: {
                    let activeEnv = environmentStore.activeEnvironment(for: project)
                    Label(activeEnv?.name ?? "환경 없음", systemImage: "server.rack")
                        .frame(minWidth: 80)
                }
                .menuStyle(.borderedButton)
            }

            Spacer()

            HStack(spacing: 4) {
                Toggle(isOn: $showSidebar) {
                    Image(systemName: "sidebar.left")
                }
                .toggleStyle(.button)
                .help("사이드바 토글")

                Toggle(isOn: $showRequest) {
                    Image(systemName: "square.split.2x1")
                }
                .toggleStyle(.button)
                .help("요청 패널 토글")

                Toggle(isOn: $showResponse) {
                    Image(systemName: "sidebar.right")
                }
                .toggleStyle(.button)
                .help("응답 패널 토글")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .frame(height: 44)
    }
}
