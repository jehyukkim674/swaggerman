import Foundation
import OpenAPIKit
import Yams

func openAPIKit31ParseJSON(_ data: Data) throws -> ParsedSpec {
    let document = try JSONDecoder().decode(OpenAPI.Document.self, from: data)
    return buildParsedSpec31(from: document)
}

func openAPIKit31ParseYAML(_ string: String) throws -> ParsedSpec {
    let document = try YAMLDecoder().decode(OpenAPI.Document.self, from: string)
    return buildParsedSpec31(from: document)
}

private func buildParsedSpec31(from document: OpenAPI.Document) -> ParsedSpec {
    let info = SpecInfo(
        title: document.info.title,
        version: document.info.version,
        description: document.info.description
    )
    let servers = document.servers.map(\.urlTemplate.absoluteString)
    let operations = buildOperations31(from: document)
    let securitySchemes = buildSecuritySchemes31(from: document.components)
    return ParsedSpec(
        info: info,
        servers: servers,
        operations: operations,
        securitySchemes: securitySchemes.sorted { $0.name < $1.name },
        rawOperationCount: operations.count
    )
}

private func buildOperations31(from document: OpenAPI.Document) -> [ParsedOperation] {
    var operations: [ParsedOperation] = []
    for (path, pathItemEither) in document.paths {
        guard let pathItem = resolvePathItem31(pathItemEither, components: document.components) else { continue }
        let pathString = path.rawValue
        let pathLevelParams = pathItem.parameters
        for endpoint in pathItem.endpoints {
            guard let mappedMethod = mapHTTPMethod31(endpoint.method) else { continue }
            let op = endpoint.operation
            let parsedParameters = (pathLevelParams + op.parameters).compactMap { paramEither -> ParsedParameter? in
                guard let parameter = resolveParameter31(paramEither, components: document.components)
                else { return nil }
                return convertParameter31(parameter, pathString: pathString)
            }
            let parsedRequestBody = op.requestBody.flatMap {
                convertRequestBody31($0, components: document.components)
            }
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
                responses: buildResponses31(op.responses, components: document.components)
            ))
        }
    }
    return operations
}

private func buildResponses31(
    _ responses: OpenAPI.Response.Map,
    components: OpenAPI.Components
) -> [ParsedResponse] {
    var result: [ParsedResponse] = []
    for (statusCode, responseEither) in responses {
        guard let response = try? components.lookup(responseEither) else { continue }
        let schema: ParsedSchema? = response.content.first.flatMap { _, mediaType in
            guard let schemaEither = mediaType.schema else { return nil }
            switch schemaEither {
            case .a: return nil
            case let .b(jsonSchema): return convertSchema31(jsonSchema)
            }
        }
        result.append(ParsedResponse(
            statusCode: statusCode.rawValue,
            description: response.description,
            schema: schema
        ))
    }
    return result.sorted { (Int($0.statusCode) ?? 999) < (Int($1.statusCode) ?? 999) }
}

private func buildSecuritySchemes31(from components: OpenAPI.Components) -> [ParsedSecurityScheme] {
    components.securitySchemes.compactMap { entry in
        ParsedSecurityScheme(
            id: entry.key.rawValue,
            name: entry.key.rawValue,
            kind: mapSecuritySchemeKind31(entry.value.type),
            description: entry.value.description
        )
    }
}

private func mapSecuritySchemeKind31(_ type: OpenAPI.SecurityScheme.SecurityType) -> SecuritySchemeKind {
    switch type {
    case let .apiKey(name, location):
        let loc = switch location {
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

private func resolvePathItem31(
    _ either: Either<OpenAPI.Reference<OpenAPI.PathItem>, OpenAPI.PathItem>,
    components: OpenAPI.Components
) -> OpenAPI.PathItem? {
    switch either {
    case let .a(ref): components[ref]
    case let .b(item): item
    }
}

private func resolveParameter31(
    _ either: Either<OpenAPI.Reference<OpenAPI.Parameter>, OpenAPI.Parameter>,
    components: OpenAPI.Components
) -> OpenAPI.Parameter? {
    switch either {
    case let .a(ref): components[ref]
    case let .b(parameter): parameter
    }
}

private func mapHTTPMethod31(_ method: OpenAPI.HttpMethod) -> HTTPMethod? {
    switch method {
    case .get: .get
    case .post: .post
    case .put: .put
    case .delete: .delete
    case .patch: .patch
    case .options: .options
    case .head: .head
    case .trace: nil
    }
}

private func convertParameter31(_ parameter: OpenAPI.Parameter, pathString: String) -> ParsedParameter {
    let location: ParameterLocation = switch parameter.location {
    case .query: .query
    case .header: .header
    case .path: .path
    case .cookie: .cookie
    }
    let resolvedSchema = parameter.schemaOrContent.a.flatMap { context -> JSONSchema? in
        switch context.schema {
        case .a: nil
        case let .b(schema): schema
        }
    }
    return ParsedParameter(
        id: "\(pathString)-\(parameter.name)-\(location.rawValue)",
        name: parameter.name,
        location: location,
        required: parameter.required,
        schema: resolvedSchema.map { convertSchema31($0) },
        description: parameter.description
    )
}

private func convertRequestBody31(
    _ either: Either<OpenAPI.Reference<OpenAPI.Request>, OpenAPI.Request>,
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
    let schema: ParsedSchema? = switch firstContent.value.schema {
    case .none: nil
    case let .some(.a): nil
    case let .some(.b(schema)): convertSchema31(schema)
    }
    return ParsedRequestBody(required: request.required, contentType: firstContent.key.rawValue, schema: schema)
}

private func convertSchema31(_ schema: JSONSchema) -> ParsedSchema {
    var type: SchemaType = .unknown
    var properties: [String: ParsedSchema]?
    var items: ParsedSchema?
    var required: [String]?

    switch schema.value {
    case .boolean: type = .boolean
    case .integer: type = .integer
    case .number: type = .number
    case .string: type = .string
    case let .object(_, ctx):
        type = .object
        properties = Dictionary(uniqueKeysWithValues: ctx.properties.map { ($0.key, convertSchema31($0.value)) })
        required = ctx.requiredProperties.isEmpty ? nil : ctx.requiredProperties
    case let .array(_, ctx):
        type = .array
        items = ctx.items.map { convertSchema31($0) }
    default: type = .unknown
    }

    return ParsedSchema(
        type: type,
        properties: properties,
        items: items,
        enumValues: schema.allowedValues?.compactMap { $0.value as? String },
        required: required,
        defaultValue: schema.defaultValue.map { String(describing: $0.value) },
        example: schema.examples.first.map { String(describing: $0.value) },
        description: schema.description
    )
}
