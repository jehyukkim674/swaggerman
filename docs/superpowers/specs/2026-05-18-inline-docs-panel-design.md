# Inline Docs Panel Design

## Overview

Add a **Docs tab** to the response pane that renders the selected OpenAPI operation's documentation inline — description, parameters, request body schema, and response schemas. The user no longer needs to open Swagger UI to understand what an endpoint expects or returns.

## Problem

`ParsedOperation` currently only stores `responseDescriptions: [String: String]` (status code → text). Response body schemas are not parsed or stored. The Docs tab needs full response schema data to be useful.

## Design

### 1. Data Layer

**New type in `Models/Operation.swift`:**

```swift
struct ParsedResponse {
    let statusCode: String      // "200", "401", "default"
    let description: String?
    let schema: ParsedSchema?   // nil if response has no body
}
```

**`ParsedOperation` change:** replace `responseDescriptions: [String: String]` with `responses: [ParsedResponse]`.

`responseDescriptions` is only referenced in `Models/Operation.swift` and `Services/OpenAPIParser.swift` — no views read it. The replacement is a clean swap with no cascading migration.

**`OpenAPIParser.swift` change:** for each response object, parse `content["application/json"]?.schema` using the existing `parseSchema` helper and populate `ParsedResponse.schema`.

---

### 2. State Layer

**`RequestEditorStore` addition:**

```swift
enum ResponseTab { case docs, response }
var responseTab: ResponseTab = .docs
```

Behaviour:
- `loadOperation(...)` resets `responseTab = .docs` — switching to a new endpoint shows docs first.
- `send(...)` sets `responseTab = .response` after a successful or failed response arrives — the user always sees the result immediately after sending.

---

### 3. UI Layer

#### `ResponsePaneView` changes

Wrap existing content in a `TabView`-style container (custom segmented control, not SwiftUI `TabView`, to match the app's existing panel style). When `store.selectedOperation == nil`, hide the tab bar and show the existing empty state.

Tab bar: `[Docs] [Response]` — driven by `store.responseTab`.

#### New file: `Views/Response/DocsPaneView.swift`

Receives `ParsedOperation` and renders four sections in a `ScrollView`:

**Section 1 — Overview**
- Method badge + path (same style as `OperationRowView`)
- `operation.description` if present; otherwise `operation.summary`; otherwise a "No description" placeholder in secondary color

**Section 2 — Parameters**
- Only shown if `operation.parameters` is non-empty
- Table rows: parameter name (monospaced), `in` badge (path/query/header), type string, required indicator
- `ParsedSchema` → type string: `string`, `integer`, `boolean`, `array[string]`, `object`, enum values joined as `"a" | "b"`

**Section 3 — Request Body**
- Only shown if `operation.requestBody != nil`
- Content-type label (e.g. `application/json`)
- Schema rendered by `SchemaTreeView` (see below)

**Section 4 — Responses**
- One row per `ParsedResponse`, sorted: 2xx first, then 3xx, 4xx, 5xx, "default"
- Status code colored by `Color.httpStatus(Int(statusCode) ?? 0)`
- Description text
- If `schema != nil`, expandable `SchemaTreeView` below the description (collapsed by default)

#### `SchemaTreeView` (within `DocsPaneView.swift`)

Recursive SwiftUI view. Renders a `ParsedSchema` as an indented tree:

```
object
  id        integer   required
  name      string    required
  role      "admin" | "user" | "guest"
  address   object
    street  string
    zip     string
```

- Leaf properties: name (monospaced) + type + required badge
- Object/array properties: collapsible disclosure group
- Max depth: 5 (beyond that show `...` to avoid infinite recursion on circular schemas)
- Enum values formatted as `"v1" | "v2"` in accent color

---

### 4. Files Changed

| File | Change |
|------|--------|
| `Models/Operation.swift` | Add `ParsedResponse`; replace `responseDescriptions` with `responses: [ParsedResponse]` |
| `Services/OpenAPIParser.swift` | Parse response schemas into `ParsedResponse` |
| `Stores/RequestEditorStore.swift` | Add `ResponseTab` enum + `responseTab` var; set in `loadOperation` and `send` |
| `Views/Response/ResponsePaneView.swift` | Add tab bar; bind to `store.responseTab`; show `DocsPaneView` or existing detail view |
| `Views/Response/DocsPaneView.swift` | New — full docs renderer |

---

### 5. Error Handling & Edge Cases

- **No description, no parameters, no body, no responses:** each section is individually hidden; show "No documentation available" if all are empty.
- **Circular schema references:** depth limit of 5 in `SchemaTreeView` prevents infinite recursion.
- **Unknown schema type:** render as `unknown` type string, no crash.
- **`responseDescriptions` migration:** any existing `HistoryItem.responseHeadersJSON` is unaffected — `ParsedResponse` is only in the parsed spec, not persisted.

---

### 6. Out of Scope

- GraphQL / gRPC schemas
- OAuth2 flow documentation
- Editable docs / annotation
- Response example bodies (only schema types, not example values)
