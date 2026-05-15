import Foundation

struct SpecInfo {
    let title: String
    let version: String
    let description: String?
}

struct ParsedSpec {
    let info: SpecInfo
    let servers: [String]
    let operations: [ParsedOperation]
    let rawOperationCount: Int
}
