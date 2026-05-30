// OpenAPI/요청/응답 도메인 타입. macOS(Swift) 앱의 모델을 TS로 포팅.

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

export const HTTP_METHODS: HTTPMethod[] = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
];

export type ParameterLocation = "path" | "query" | "header" | "cookie";

export type SchemaType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "unknown";

export interface ParsedSchema {
  type: SchemaType;
  properties?: Record<string, ParsedSchema>;
  items?: ParsedSchema;
  enumValues?: string[];
  required?: string[];
  defaultValue?: string;
  example?: string;
  description?: string;
}

export interface ParsedParameter {
  id: string;
  name: string;
  location: ParameterLocation;
  required: boolean;
  schema?: ParsedSchema;
  description?: string;
}

export interface ParsedRequestBody {
  required: boolean;
  contentType: string;
  schema?: ParsedSchema;
  example?: unknown; // 스펙에 정의된 example/examples (있으면 body 미리 채우기에 우선 사용)
}

export interface ParsedResponse {
  statusCode: string; // "200", "404", "default"
  description?: string;
  schema?: ParsedSchema;
}

export interface ParsedOperation {
  id: string; // `${method} ${path}`
  method: HTTPMethod;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ParsedParameter[];
  requestBody?: ParsedRequestBody;
  responses: ParsedResponse[];
}

export type SecuritySchemeKind =
  | { kind: "apiKey"; name: string; location: string }
  | { kind: "http"; scheme: string }
  | { kind: "oauth2" }
  | { kind: "openIdConnect" }
  | { kind: "unknown" };

export interface ParsedSecurityScheme {
  name: string;
  kind: SecuritySchemeKind;
}

export interface SpecInfo {
  title: string;
  version: string;
  description?: string;
}

export interface ParsedSpec {
  info: SpecInfo;
  servers: string[];
  operations: ParsedOperation[];
  securitySchemes: ParsedSecurityScheme[];
  rawOperationCount: number;
}

export interface HTTPRequest {
  method: HTTPMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HTTPResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  size: number;
}
