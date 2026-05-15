import SwiftData
import SwiftUI
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "ProjectStore")

@Observable
@MainActor
final class ProjectStore {
    private(set) var projects: [Project] = []
    private(set) var selectedProject: Project?

    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
        loadProjects()
    }

    // MARK: - Public

    func addProject(alias: String, swaggerURL: String) throws {
        guard !alias.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw SwaggerManError.validation(.requiredFieldMissing("alias"))
        }

        if projects.contains(where: { $0.alias == alias }) {
            throw SwaggerManError.persistence(.duplicateAlias(alias))
        }

        let project = Project(alias: alias, swaggerURL: swaggerURL)
        modelContext.insert(project)

        let defaultEnv = APIEnvironment(name: "Dev", baseURL: swaggerURL, project: project)
        modelContext.insert(defaultEnv)
        project.environments.append(defaultEnv)

        try save()
        loadProjects()

        if selectedProject == nil {
            selectedProject = project
        }

        log.info("Project added: \(alias)")
    }

    func deleteProject(_ project: Project) throws {
        let deletingID = project.id
        modelContext.delete(project)
        try save()

        if selectedProject?.id == deletingID {
            loadProjects()
            selectedProject = projects.first
        } else {
            loadProjects()
        }
    }

    func selectProject(_ project: Project) {
        selectedProject = project
        project.lastUsedAt = Date()
        try? save()
    }

    func updateProject(_ project: Project, alias: String, swaggerURL: String) throws {
        let isDuplicate = projects.contains { $0.alias == alias && $0.id != project.id }
        if isDuplicate {
            throw SwaggerManError.persistence(.duplicateAlias(alias))
        }
        project.alias = alias
        project.swaggerURL = swaggerURL
        try save()
        loadProjects()
    }

    // MARK: - Private

    private func loadProjects() {
        let descriptor = FetchDescriptor<Project>(
            sortBy: [SortDescriptor<Project>(\.lastUsedAt, order: .reverse)]
        )
        projects = (try? modelContext.fetch(descriptor)) ?? []
    }

    private func save() throws {
        do {
            try modelContext.save()
        } catch {
            throw SwaggerManError.persistence(.saveFailed(error.localizedDescription))
        }
    }
}
