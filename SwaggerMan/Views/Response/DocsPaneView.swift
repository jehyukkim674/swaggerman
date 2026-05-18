import SwiftUI

struct DocsPaneView: View {
    let operation: ParsedOperation

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                overviewSection
                if !operation.parameters.isEmpty {
                    sectionDivider
                    parametersSection
                }
                if let body = operation.requestBody {
                    sectionDivider
                    requestBodySection(body)
                }
                if !operation.responses.isEmpty {
                    sectionDivider
                    responsesSection
                }
                if isAllEmpty {
                    Text("설명 없음")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding()
                }
            }
            .padding(.bottom, 16)
        }
    }

    private var isAllEmpty: Bool {
        (operation.description ?? operation.summary ?? "").isEmpty &&
            operation.parameters.isEmpty &&
            operation.requestBody == nil &&
            operation.responses.isEmpty
    }

    // MARK: - Overview

    private var overviewSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(operation.method.rawValue)
                    .font(.system(.caption, design: .monospaced).bold())
                    .foregroundStyle(operation.method.swiftUIColor)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(operation.method.swiftUIColor.opacity(0.12))
                    .clipShape(.rect(cornerRadius: 4))
                Text(operation.path)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
            }
            if let text = operation.description ?? operation.summary {
                Text(text)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    // MARK: - Parameters

    private var parametersSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            sectionHeader("PARAMETERS")
            ForEach(operation.parameters) { param in
                HStack(alignment: .top, spacing: 6) {
                    Text(param.name)
                        .font(.system(.caption, design: .monospaced))
                        .frame(width: 120, alignment: .leading)
                        .lineLimit(1)
                    Text(param.location.rawValue)
                        .font(.system(size: 9))
                        .padding(.horizontal, 4).padding(.vertical, 1)
                        .background(Color.secondary.opacity(0.15))
                        .clipShape(.rect(cornerRadius: 3))
                        .foregroundStyle(.secondary)
                    Text(schemaTypeLabel(param.schema))
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.blue.opacity(0.85))
                    if param.required {
                        Text("required")
                            .font(.system(size: 9))
                            .padding(.horizontal, 4).padding(.vertical, 1)
                            .background(Color.orange.opacity(0.12))
                            .foregroundStyle(.orange)
                            .clipShape(.rect(cornerRadius: 3))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 2)
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Request Body

    private func requestBodySection(_ body: ParsedRequestBody) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            sectionHeader("REQUEST BODY")
            if !body.contentType.isEmpty {
                Text(body.contentType)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
            }
            if let schema = body.schema {
                SchemaTreeView(schema: schema, requiredKeys: [], depth: 0)
                    .padding(.horizontal, 12)
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Responses

    private var responsesSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionHeader("RESPONSES")
            ForEach(operation.responses, id: \.statusCode) { response in
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text(response.statusCode)
                            .font(.system(.caption, design: .monospaced).bold())
                            .foregroundStyle(Color.httpStatus(Int(response.statusCode) ?? 0))
                        if let desc = response.description {
                            Text(desc)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 12)
                    if let schema = response.schema {
                        SchemaTreeView(schema: schema, requiredKeys: [], depth: 0)
                            .padding(.horizontal, 16)
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(.secondary)
            .tracking(0.8)
            .padding(.horizontal, 12)
            .padding(.bottom, 2)
    }

    private var sectionDivider: some View {
        Divider().padding(.horizontal, 12)
    }

    private func schemaTypeLabel(_ schema: ParsedSchema?) -> String {
        guard let schema else { return "any" }
        switch schema.type {
        case .string:
            if let enums = schema.enumValues, !enums.isEmpty {
                return enums.map { "\"\($0)\"" }.joined(separator: " | ")
            }
            return "string"
        case .integer: return "integer"
        case .number: return "number"
        case .boolean: return "boolean"
        case .array:
            if let items = schema.items { return "array[\(schemaTypeLabel(items))]" }
            return "array"
        case .object: return "object"
        case .unknown: return "unknown"
        }
    }
}

// MARK: - Schema Tree

struct SchemaTreeView: View {
    let schema: ParsedSchema
    let requiredKeys: [String]
    let depth: Int

    @State private var isExpanded: Bool

    init(schema: ParsedSchema, requiredKeys: [String], depth: Int) {
        self.schema = schema
        self.requiredKeys = requiredKeys
        self.depth = depth
        self._isExpanded = State(initialValue: depth < 2)
    }

    var body: some View {
        if schema.type == .object, let properties = schema.properties, !properties.isEmpty, depth < 5 {
            DisclosureGroup(isExpanded: $isExpanded) {
                ForEach(sortedProperties, id: \.key) { item in
                    SchemaPropertyRow(
                        name: item.key,
                        schema: item.value,
                        isRequired: schema.required?.contains(item.key) ?? false,
                        depth: depth
                    )
                }
            } label: {
                Text("object")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
        } else if schema.type == .array, let items = schema.items, items.type == .object {
            DisclosureGroup(isExpanded: $isExpanded) {
                SchemaTreeView(schema: items, requiredKeys: [], depth: depth + 1)
            } label: {
                Text("array[object]")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
        } else {
            Text(typeLabel)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
        }
    }

    private var sortedProperties: [(key: String, value: ParsedSchema)] {
        guard let props = schema.properties else { return [] }
        let req = schema.required ?? []
        return props.sorted {
            let aReq = req.contains($0.key)
            let bReq = req.contains($1.key)
            if aReq != bReq { return aReq }
            return $0.key < $1.key
        }
    }

    private var typeLabel: String {
        switch schema.type {
        case .string:
            if let enums = schema.enumValues, !enums.isEmpty {
                return enums.map { "\"\($0)\"" }.joined(separator: " | ")
            }
            return "string"
        case .integer: return "integer"
        case .number: return "number"
        case .boolean: return "boolean"
        case .array:
            if let items = schema.items { return "array[\(items.type.rawValue)]" }
            return "array"
        case .object: return "object"
        case .unknown: return "unknown"
        }
    }
}

struct SchemaPropertyRow: View {
    let name: String
    let schema: ParsedSchema
    let isRequired: Bool
    let depth: Int

    var body: some View {
        if schema.type == .object, let properties = schema.properties, !properties.isEmpty, depth < 4 {
            VStack(alignment: .leading, spacing: 2) {
                propertyLabel
                SchemaTreeView(schema: schema, requiredKeys: schema.required ?? [], depth: depth + 1)
                    .padding(.leading, 12)
            }
        } else {
            propertyLabel
        }
    }

    private var propertyLabel: some View {
        HStack(spacing: 6) {
            Text(name)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.primary)
                .lineLimit(1)
            Text(typeLabel)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.blue.opacity(0.8))
            if isRequired {
                Text("required")
                    .font(.system(size: 9))
                    .padding(.horizontal, 4).padding(.vertical, 1)
                    .background(Color.orange.opacity(0.12))
                    .foregroundStyle(.orange)
                    .clipShape(.rect(cornerRadius: 3))
            }
        }
        .padding(.vertical, 1)
    }

    private var typeLabel: String {
        switch schema.type {
        case .string:
            if let enums = schema.enumValues, !enums.isEmpty {
                return enums.map { "\"\($0)\"" }.joined(separator: " | ")
            }
            return "string"
        case .integer: return "integer"
        case .number: return "number"
        case .boolean: return "boolean"
        case .array:
            if let items = schema.items { return "array[\(items.type.rawValue)]" }
            return "array"
        case .object: return "object"
        case .unknown: return "unknown"
        }
    }
}
