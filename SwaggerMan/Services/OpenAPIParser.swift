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

        let servers = document.servers.map { $0.urlTemplate.absoluteString }

        var operations: [ParsedOperation] = []

        for (path, pathItemEither) in document.paths {
            guard let pathItem = resolvePathItem(pathItemEither, components: document.components) else {
                continue
            }
            let pathString = path.rawValue
            let pathLevelParams = pathItem.parameters

            for endpoint in pathItem.endpoints {
                guard let mappedMethod = mapMethod(endpoint.method) else {
                    continue
                }
                let op = endpoint.operation
                let combinedParams = pathLevelParams + op.parameters
                let parsedParameters = combinedParams.compactMap { paramEither -> ParsedParameter? in
                    guard let parameter = resolveParameter(paramEither, components: document.components) else {
                        return nil
                    }
                    return convertParameter(parameter, pathString: pathString)
                }

                let parsedRequestBody = op.requestBody.flatMap {
                    convertRequestBody($0, components: document.components)
                }

                var responseDescriptions: [String: String] = [:]
                for (statusCode, responseEither) in op.responses {
                    if let response = try? document.components.lookup(responseEither) {
                        responseDescriptions[statusCode.rawValue] = response.description
                    }
                }

                let parsed = ParsedOperation(
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
                )
                operations.append(parsed)
            }
        }

        return ParsedSpec(
            info: info,
            servers: servers,
            operations: operations,
            rawOperationCount: operations.count
        )
    }

    // MARK: - Helpers

    private func resolvePathItem(
        _ either: Either<JSONReference<OpenAPI.PathItem>, OpenAPI.PathItem>,
        components: OpenAPI.Components
    ) -> OpenAPI.PathItem? {
        switch either {
        case .a(let ref):
            return components[ref]
        case .b(let item):
            return item
        }
    }

    private func resolveParameter(
        _ either: Either<JSONReference<OpenAPI.Parameter>, OpenAPI.Parameter>,
        components: OpenAPI.Components
    ) -> OpenAPI.Parameter? {
        switch either {
        case .a(let ref):
            return components[ref]
        case .b(let parameter):
            return parameter
        }
    }

    private func mapMethod(_ method: OpenAPI.HttpMethod) -> HTTPMethod? {
        switch method {
        case .get: return .get
        case .post: return .post
        case .put: return .put
        case .delete: return .delete
        case .patch: return .patch
        case .options: return .options
        case .head: return .head
        case .trace: return nil // TRACE not in HTTPMethod enum; skip silently
        }
    }

    private func mapLocation(_ location: OpenAPI.Parameter.Context.Location) -> ParameterLocation {
        switch location {
        case .query: return .query
        case .header: return .header
        case .path: return .path
        case .cookie: return .cookie
        }
    }

    private func convertParameter(_ parameter: OpenAPI.Parameter, pathString: String) -> ParsedParameter {
        let location = mapLocation(parameter.location)
        let schema: ParsedSchema?
        if let schemaContext = parameter.schemaOrContent.a,
           let jsonSchema = schemaContext.schema.b ?? unwrapSchemaReference(schemaContext.schema) {
            schema = convertSchema(jsonSchema)
        } else {
            schema = nil
        }

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
            return nil
        case .b(let schema):
            return schema
        }
    }

    private func convertRequestBody(
        _ either: Either<JSONReference<OpenAPI.Request>, OpenAPI.Request>,
        components: OpenAPI.Components
    ) -> ParsedRequestBody? {
        let request: OpenAPI.Request
        switch either {
        case .a(let ref):
            guard let resolved = components[ref] else { return nil }
            request = resolved
        case .b(let value):
            request = value
        }

        guard let firstContent = request.content.first else {
            return ParsedRequestBody(required: request.required, contentType: "", schema: nil)
        }

        let contentType = firstContent.key.rawValue
        let schema: ParsedSchema?
        if let schemaEither = firstContent.value.schema {
            switch schemaEither {
            case .a:
                schema = nil
            case .b(let jsonSchema):
                schema = convertSchema(jsonSchema)
            }
        } else {
            schema = nil
        }

        return ParsedRequestBody(
            required: request.required,
            contentType: contentType,
            schema: schema
        )
    }

    private func convertSchema(_ schema: JSONSchema) -> ParsedSchema {
        let type: SchemaType
        var properties: [String: ParsedSchema]? = nil
        var items: ParsedSchema? = nil
        var required: [String]? = nil

        switch schema.value {
        case .boolean:
            type = .boolean
        case .integer:
            type = .integer
        case .number:
            type = .number
        case .string:
            type = .string
        case .object(_, let objectContext):
            type = .object
            var props: [String: ParsedSchema] = [:]
            for (key, propSchema) in objectContext.properties {
                props[key] = convertSchema(propSchema)
            }
            properties = props
            required = objectContext.requiredProperties.isEmpty ? nil : objectContext.requiredProperties
        case .array(_, let arrayContext):
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
