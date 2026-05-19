import Foundation

struct ParsedParameter: Identifiable, Codable {
    let id: String
    let name: String
    let location: ParameterLocation
    let required: Bool
    let schema: ParsedSchema?
    let description: String?
}

enum ParameterLocation: String, Codable {
    case path, query, header, cookie
}

final class ParsedSchema: Codable {
    let type: SchemaType
    let properties: [String: ParsedSchema]?
    let items: ParsedSchema?
    let enumValues: [String]?
    let required: [String]?
    let defaultValue: String?
    let example: String?
    let description: String?

    init(type: SchemaType, properties: [String: ParsedSchema]? = nil,
         items: ParsedSchema? = nil, enumValues: [String]? = nil,
         required: [String]? = nil, defaultValue: String? = nil,
         example: String? = nil, description: String? = nil)
    {
        self.type = type
        self.properties = properties
        self.items = items
        self.enumValues = enumValues
        self.required = required
        self.defaultValue = defaultValue
        self.example = example
        self.description = description
    }
}

enum SchemaType: String, Codable {
    case string, integer, number, boolean, array, object, unknown
}

struct ParsedRequestBody: Codable {
    let required: Bool
    let contentType: String
    let schema: ParsedSchema?
}

struct ParsedResponse: Codable {
    let statusCode: String
    let description: String?
    let schema: ParsedSchema?
}

struct ParsedOperation: Identifiable, Codable {
    let id: String
    let method: HTTPMethod
    let path: String
    let operationId: String?
    let summary: String?
    let description: String?
    let tags: [String]
    let parameters: [ParsedParameter]
    let requestBody: ParsedRequestBody?
    let responses: [ParsedResponse]
}
