import os.log
import SwiftData
import SwiftUI

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
        migrateDisableTLS()
    }

    private func migrateDisableTLS() {
        for project in projects where !project.disableTLSVerification {
            project.disableTLSVerification = true
        }
        try? save()
    }

    // MARK: - Public

    func addProject(alias: String, swaggerURL: String) throws {
        let trimmedAlias = alias.trimmingCharacters(in: .whitespaces)
        guard !trimmedAlias.isEmpty else {
            throw SwaggerManError.validation(.requiredFieldMissing("alias"))
        }

        if projects.contains(where: { $0.alias == trimmedAlias }) {
            throw SwaggerManError.persistence(.duplicateAlias(trimmedAlias))
        }

        let project = Project(alias: trimmedAlias, swaggerURL: swaggerURL)
        modelContext.insert(project)

        let defaultEnv = APIEnvironment(
            name: "Dev",
            baseURL: EnvironmentStore.deriveBaseURL(from: swaggerURL),
            project: project
        )
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
        let wasSelected = selectedProject?.id == deletingID
        modelContext.delete(project)
        try save()
        loadProjects()
        if wasSelected {
            selectedProject = projects.first
        }
    }

    func selectProject(_ project: Project) {
        selectedProject = project
        project.lastUsedAt = Date()
        try? save()
    }

    func saveLastOperationID(_ id: String, for project: Project) {
        project.lastOperationID = id
        try? save()
    }

    func updateProject(
        _ project: Project,
        alias: String,
        swaggerURL: String,
        disableTLSVerification: Bool = false,
        specAuthType: String? = nil,
        specAuthValue1: String? = nil,
        specAuthValue2: String? = nil,
        specAuthValue3: String? = nil
    ) throws {
        let isDuplicate = projects.contains { $0.alias == alias && $0.id != project.id }
        if isDuplicate {
            throw SwaggerManError.persistence(.duplicateAlias(alias))
        }
        project.alias = alias
        project.swaggerURL = swaggerURL
        project.disableTLSVerification = disableTLSVerification
        project.specAuthType = specAuthType
        project.specAuthValue1 = specAuthValue1.flatMap { $0.isEmpty ? nil : $0 }
        project.specAuthValue2 = specAuthValue2.flatMap { $0.isEmpty ? nil : $0 }
        project.specAuthValue3 = specAuthValue3.flatMap { $0.isEmpty ? nil : $0 }
        try save()
        loadProjects()
    }

    // MARK: - Private

    private func loadProjects() {
        let descriptor = FetchDescriptor<Project>(
            sortBy: [SortDescriptor<Project>(\.lastUsedAt, order: .reverse)]
        )
        projects = (try? modelContext.fetch(descriptor)) ?? []
        if selectedProject == nil {
            selectedProject = projects.first
        }
    }

    private func save() throws {
        do {
            try modelContext.save()
        } catch {
            throw SwaggerManError.persistence(.saveFailed(error.localizedDescription))
        }
    }
}
