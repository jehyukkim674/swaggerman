import Foundation

struct ParsedParameter: Identifiable {
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

struct ParsedSchema {
    let type: SchemaType
    let properties: [String: ParsedSchema]?
    let items: ParsedSchema?
    let enumValues: [String]?
    let required: [String]?
    let defaultValue: String?
    let example: String?
    let description: String?
}

enum SchemaType: String {
    case string, integer, number, boolean, array, object, unknown
}

struct ParsedRequestBody {
    let required: Bool
    let contentType: String
    let schema: ParsedSchema?
}

struct ParsedOperation: Identifiable {
    let id: String                  // "\(method.rawValue) \(path)"
    let method: HTTPMethod
    let path: String
    let operationId: String?
    let summary: String?
    let description: String?
    let tags: [String]
    let parameters: [ParsedParameter]
    let requestBody: ParsedRequestBody?
    let responseDescriptions: [String: String]   // statusCode → description
}
