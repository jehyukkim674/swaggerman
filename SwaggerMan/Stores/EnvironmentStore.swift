import SwiftData
import SwiftUI
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "EnvironmentStore")

@Observable
@MainActor
final class EnvironmentStore {
    private var activeEnvironments: [UUID: UUID] = [:]  // projectID → environmentID
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    // MARK: - Public

    func addEnvironment(name: String, baseURL: String, to project: Project) throws {
        let env = APIEnvironment(name: name, baseURL: baseURL, project: project)
        project.environments.append(env)
        modelContext.insert(env)
        try save()
        log.info("Environment added: \(name) to project \(project.alias)")
    }

    func deleteEnvironment(_ env: APIEnvironment, from project: Project) throws {
        let envID = env.id
        if activeEnvironments[project.id] == envID {
            let fallback = project.environments.first { $0.id != envID }
            activeEnvironments[project.id] = fallback?.id
        }
        modelContext.delete(env)
        try save()
    }

    func updateEnvironment(_ env: APIEnvironment, name: String, baseURL: String,
                           authScheme: AuthSchemeType,
                           bearerToken: String? = nil,
                           basicUsername: String? = nil,
                           basicPassword: String? = nil,
                           apiKeyHeaderName: String? = nil,
                           apiKeyValue: String? = nil,
                           apiKeyInQuery: Bool = false,
                           disableTLS: Bool = false) throws {
        env.name = name
        env.baseURL = baseURL
        env.authScheme = authScheme
        env.bearerToken = bearerToken
        env.basicUsername = basicUsername
        env.basicPassword = basicPassword
        env.apiKeyHeaderName = apiKeyHeaderName
        env.apiKeyValue = apiKeyValue
        env.apiKeyInQuery = apiKeyInQuery
        env.disableTLSValidation = disableTLS
        try save()
    }

    func setActive(_ env: APIEnvironment, for project: Project) {
        activeEnvironments[project.id] = env.id
    }

    func activeEnvironment(for project: Project) -> APIEnvironment? {
        guard let envID = activeEnvironments[project.id] else {
            return project.environments.first
        }
        return project.environments.first { $0.id == envID }
    }

    func onProjectChanged(_ project: Project) {
        if activeEnvironments[project.id] == nil {
            activeEnvironments[project.id] = project.environments.first?.id
        }
    }

    // MARK: - Private

    private func save() throws {
        do {
            try modelContext.save()
        } catch {
            throw SwaggerManError.persistence(.saveFailed(error.localizedDescription))
        }
    }
}
