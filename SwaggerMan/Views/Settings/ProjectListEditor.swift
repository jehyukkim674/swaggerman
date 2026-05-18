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
    @State private var validationError: String?

    init(project: Project, store: ProjectStore) {
        self.project = project
        self.store = store
        _alias = State(initialValue: project.alias)
        _swaggerURL = State(initialValue: project.swaggerURL)
    }

    var body: some View {
        Form {
            TextField("Alias", text: $alias)
            TextField("Swagger URL", text: $swaggerURL)
            if let err = validationError {
                Text(err).foregroundStyle(.red).font(.caption)
            }
            Button("저장") { save() }
                .disabled(alias.isEmpty || swaggerURL.isEmpty)
        }
        .formStyle(.grouped)
        .navigationTitle(project.alias)
    }

    func save() {
        do {
            try store.updateProject(project, alias: alias, swaggerURL: swaggerURL)
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
