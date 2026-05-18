import Foundation
import OpenAPIKit30
import Yams

struct OpenAPIParser: OpenAPIParserProtocol {
    func parse(_ data: Data) throws -> ParsedSpec {
        // Detect OpenAPI 2.0 (swagger field present) before attempting decode.
        if let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let swaggerVersion = dict["swagger"] {
            throw SwaggerManError.parsing(.unsupportedVersion(String(describing: swaggerVersion)))
        }

        let document: OpenAPI.Document
        do {
            document = try JSONDecoder().decode(OpenAPI.Document.self, from: data)
        } catch {
            throw SwaggerManError.parsing(.invalidJSON(error.localizedDescription))
        }

        return buildSpec(from: document)
    }

    func parseYAML(_ string: String) throws -> ParsedSpec {
        // Detect OpenAPI 2.0 (swagger key) in YAML before attempting decode.
        if let yamlAny = try? Yams.load(yaml: string) as? [String: Any],
           let swaggerVersion = yamlAny["swagger"] {
            throw SwaggerManError.parsing(.unsupportedVersion(String(describing: swaggerVersion)))
        }

        let document: OpenAPI.Document
        do {
            document = try YAMLDecoder().decode(OpenAPI.Document.self, from: string)
        } catch {
            throw SwaggerManError.parsing(.invalidYAML(error.localizedDescription))
        }
        return buildSpec(from: document)
    }

    // MARK: - Mapping

    private func buildSpec(from document: OpenAPI.Document) -> ParsedSpec {
        let info = SpecInfo(
            title: document.info.title,
            version: document.info.version,
            description: document.info.description
        )
        let servers = document.servers.map(\.urlTemplate.absoluteString)
        let operations = buildOperations(from: document)
        let securitySchemes = buildSecuritySchemes(from: document.components)
        return ParsedSpec(
            info: info,
            servers: servers,
            operations: operations,
            securitySchemes: securitySchemes.sorted { $0.name < $1.name },
            rawOperationCount: operations.count
        )
    }

    private func buildOperations(from document: OpenAPI.Document) -> [ParsedOperation] {
        var operations: [ParsedOperation] = []
        for (path, pathItemEither) in document.paths {
            guard let pathItem = resolvePathItem(pathItemEither, components: document.components) else {
                continue
            }
            let pathString = path.rawValue
            let pathLevelParams = pathItem.parameters
            for endpoint in pathItem.endpoints {
                guard let mappedMethod = mapMethod(endpoint.method) else { continue }
                let op = endpoint.operation
                let parsedParameters = (pathLevelParams + op.parameters).compactMap { paramEither -> ParsedParameter? in
                    guard let parameter = resolveParameter(paramEither, components: document.components) else {
                        return nil
                    }
                    return convertParameter(parameter, pathString: pathString)
                }
                let parsedRequestBody = op.requestBody.flatMap {
                    convertRequestBody($0, components: document.components)
                }
                let responseDescriptions = buildResponseDescriptions(op.responses, components: document.components)
                operations.append(ParsedOperation(
                    id: "\(mappedMethod.rawValue) \(pathString)",
                    method: mappedMethod,
                    path: pathString,
                    operationId: op.operationId,
                    summary: op.summary,
                    description: op.description,
                    tags: op.tags ?? [],
                    parameters: parsedParameters,
                    requestBody: parsedRequestBody,
                    responseDescriptions: responseDescriptions
                ))
            }
        }
        return operations
    }

    private func buildResponseDescriptions(
        _ responses: OpenAPI.Response.Map,
        components: OpenAPI.Components
    ) -> [String: String] {
        var result: [String: String] = [:]
        for (statusCode, responseEither) in responses {
            if let response = try? components.lookup(responseEither) {
                result[statusCode.rawValue] = response.description
            }
        }
        return result
    }

    private func buildSecuritySchemes(from components: OpenAPI.Components) -> [ParsedSecurityScheme] {
        components.securitySchemes.compactMap { entry in
            let kind = mapSecuritySchemeKind(entry.value.type)
            return ParsedSecurityScheme(
                id: entry.key.rawValue,
                name: entry.key.rawValue,
                kind: kind,
                description: entry.value.description
            )
        }
    }

    private func mapSecuritySchemeKind(_ type: OpenAPI.SecurityScheme.SecurityType) -> SecuritySchemeKind {
        switch type {
        case let .apiKey(name, location):
            let loc: String = switch location {
            case .header: "header"
            case .query: "query"
            case .cookie: "cookie"
            }
            return .apiKey(name: name, location: loc)
        case let .http(scheme, _):
            return .http(scheme: scheme)
        case .oauth2:
            return .oauth2
        default:
            return .unknown
        }
    }

    // MARK: - Helpers

    private func resolvePathItem(
        _ either: Either<JSONReference<OpenAPI.PathItem>, OpenAPI.PathItem>,
        components: OpenAPI.Components
    ) -> OpenAPI.PathItem? {
        switch either {
        case let .a(ref):
            components[ref]
        case let .b(item):
            item
        }
    }

    private func resolveParameter(
        _ either: Either<JSONReference<OpenAPI.Parameter>, OpenAPI.Parameter>,
        components: OpenAPI.Components
    ) -> OpenAPI.Parameter? {
        switch either {
        case let .a(ref):
            components[ref]
        case let .b(parameter):
            parameter
        }
    }

    private func mapMethod(_ method: OpenAPI.HttpMethod) -> HTTPMethod? {
        switch method {
        case .get: .get
        case .post: .post
        case .put: .put
        case .delete: .delete
        case .patch: .patch
        case .options: .options
        case .head: .head
        case .trace: nil // TRACE not in HTTPMethod enum; skip silently
        }
    }

    private func mapLocation(_ location: OpenAPI.Parameter.Context.Location) -> ParameterLocation {
        switch location {
        case .query: .query
        case .header: .header
        case .path: .path
        case .cookie: .cookie
        }
    }

    private func convertParameter(_ parameter: OpenAPI.Parameter, pathString: String) -> ParsedParameter {
        let location = mapLocation(parameter.location)
        let resolvedSchema = parameter.schemaOrContent.a.flatMap {
            $0.schema.b ?? unwrapSchemaReference($0.schema)
        }
        let schema: ParsedSchema? = resolvedSchema.map { convertSchema($0) }

        return ParsedParameter(
            id: "\(pathString)-\(parameter.name)-\(location.rawValue)",
            name: parameter.name,
            location: location,
            required: parameter.required,
            schema: schema,
            description: parameter.description
        )
    }

    private func unwrapSchemaReference(_ either: Either<JSONReference<JSONSchema>, JSONSchema>) -> JSONSchema? {
        switch either {
        case .a:
            nil
        case let .b(schema):
            schema
        }
    }

    private func convertRequestBody(
        _ either: Either<JSONReference<OpenAPI.Request>, OpenAPI.Request>,
        components: OpenAPI.Components
    ) -> ParsedRequestBody? {
        let request: OpenAPI.Request
        switch either {
        case let .a(ref):
            guard let resolved = components[ref] else { return nil }
            request = resolved
        case let .b(value):
            request = value
        }

        guard let firstContent = request.content.first else {
            return ParsedRequestBody(required: request.required, contentType: "", schema: nil)
        }

        let contentType = firstContent.key.rawValue
        let schema: ParsedSchema? = if let schemaEither = firstContent.value.schema {
            switch schemaEither {
            case .a:
                nil
            case let .b(jsonSchema):
                convertSchema(jsonSchema)
            }
        } else {
            nil
        }

        return ParsedRequestBody(
            required: request.required,
            contentType: contentType,
            schema: schema
        )
    }

    private func convertSchema(_ schema: JSONSchema) -> ParsedSchema {
        let type: SchemaType
        var properties: [String: ParsedSchema]?
        var items: ParsedSchema?
        var required: [String]?

        switch schema.value {
        case .boolean:
            type = .boolean
        case .integer:
            type = .integer
        case .number:
            type = .number
        case .string:
            type = .string
        case let .object(_, objectContext):
            type = .object
            var props: [String: ParsedSchema] = [:]
            for (key, propSchema) in objectContext.properties {
                props[key] = convertSchema(propSchema)
            }
            properties = props
            required = objectContext.requiredProperties.isEmpty ? nil : objectContext.requiredProperties
        case let .array(_, arrayContext):
            type = .array
            if let itemSchema = arrayContext.items {
                items = convertSchema(itemSchema)
            }
        case .all, .one, .any, .not, .reference, .fragment:
            type = .unknown
        }

        let enumValues = schema.allowedValues?.compactMap { $0.value as? String }
        let defaultValue = schema.defaultValue.map { String(describing: $0.value) }
        let example = schema.example.map { String(describing: $0.value) }

        return ParsedSchema(
            type: type,
            properties: properties,
            items: items,
            enumValues: enumValues,
            required: required,
            defaultValue: defaultValue,
            example: example,
            description: schema.description
        )
    }
}
