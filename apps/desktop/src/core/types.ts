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
  example?: unknown; // 스펙에 정의된 응답 example/examples (있으면 표시)
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

export interface FormFieldWire {
  name: string;
  value: string;
  filePath?: string;
  contentType?: string;
}

export interface HTTPRequest {
  method: HTTPMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** form 파트(있으면 body 대신 전송). */
  form?: FormFieldWire[];
  /** true면 multipart/form-data, false/없으면 application/x-www-form-urlencoded. */
  multipart?: boolean;
}

/** 전역 네트워크 설정(요청 실행 옵션). */
export interface NetworkSettings {
  timeoutMs: number;
  insecure: boolean;
  proxy: string;
}

export function defaultNetworkSettings(): NetworkSettings {
  return { timeoutMs: 30000, insecure: false, proxy: "" };
}

export interface HTTPResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  size: number;
}
