// OpenAPI 3.0/3.1 (+ Swagger 2.0 일부) 문서를 ParsedSpec으로 변환.
// 로컬 $ref(#/components/...)를 해석한다. 외부 $ref는 미지원(첫 버전).
import yaml from "js-yaml";
import type {
  HTTPMethod,
  ParsedOperation,
  ParsedParameter,
  ParsedRequestBody,
  ParsedResponse,
  ParsedSchema,
  ParsedSecurityScheme,
  ParsedSpec,
  ParameterLocation,
  SchemaType,
} from "./types";
import { HTTP_METHODS } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

export function parseSpecText(text: string): ParsedSpec {
  const trimmed = text.trim();
  let doc: AnyObj;
  if (trimmed.startsWith("{")) {
    doc = JSON.parse(trimmed);
  } else {
    doc = yaml.load(trimmed) as AnyObj;
  }
  if (!doc || typeof doc !== "object") {
    throw new Error("유효한 OpenAPI 문서가 아닙니다.");
  }
  return parseSpec(doc);
}

export function parseSpec(doc: AnyObj): ParsedSpec {
  const components: AnyObj = doc.components ?? {};

  const resolveRef = (node: AnyObj | undefined): AnyObj | undefined => {
    if (!node) return node;
    if (typeof node.$ref === "string") {
      const path = node.$ref.replace(/^#\//, "").split("/");
      let cur: AnyObj | undefined = doc;
      for (const key of path) {
        cur = cur?.[key];
      }
      return cur;
    }
    return node;
  };

  const toSchemaType = (raw: unknown): SchemaType => {
    const t = Array.isArray(raw) ? raw.find((x) => x !== "null") : raw;
    switch (t) {
      case "string":
      case "integer":
      case "number":
      case "boolean":
      case "array":
      case "object":
        return t;
      default:
        return "unknown";
    }
  };

  const convertSchema = (input: AnyObj | undefined, depth = 0): ParsedSchema | undefined => {
    if (!input || depth > 6) return undefined;
    const schema = resolveRef(input);
    if (!schema) return undefined;

    let type = toSchemaType(schema.type);
    if (type === "unknown" && schema.properties) type = "object";
    if (type === "unknown" && schema.items) type = "array";

    let properties: Record<string, ParsedSchema> | undefined;
    if (schema.properties && typeof schema.properties === "object") {
      properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        const converted = convertSchema(value as AnyObj, depth + 1);
        if (converted) properties[key] = converted;
      }
    }

    return {
      type,
      properties,
      items: convertSchema(schema.items, depth + 1),
      enumValues: Array.isArray(schema.enum) ? schema.enum.map(String) : undefined,
      required: Array.isArray(schema.required) ? schema.required : undefined,
      defaultValue: schema.default != null ? String(schema.default) : undefined,
      example: schema.example != null ? String(schema.example) : undefined,
      description: schema.description,
    };
  };

  const buildParameters = (raw: unknown[] | undefined): ParsedParameter[] => {
    if (!Array.isArray(raw)) return [];
    const result: ParsedParameter[] = [];
    raw.forEach((item, index) => {
      const param = resolveRef(item as AnyObj);
      if (!param?.name || !param?.in) return;
      const location = param.in as ParameterLocation;
      if (!["path", "query", "header", "cookie"].includes(location)) return;
      result.push({
        id: `${location}-${param.name}-${index}`,
        name: param.name,
        location,
        required: param.required === true || location === "path",
        schema: convertSchema(param.schema),
        description: param.description,
      });
    });
    return result;
  };

  const buildRequestBody = (raw: AnyObj | undefined): ParsedRequestBody | undefined => {
    const body = resolveRef(raw);
    if (!body?.content || typeof body.content !== "object") return undefined;
    const entries = Object.entries(body.content as AnyObj);
    const preferred =
      entries.find(([ct]) => ct.includes("json")) ?? entries[0];
    if (!preferred) return undefined;
    const [contentType, mediaRaw] = preferred;
    const media = mediaRaw as AnyObj;
    // 스펙 example 우선순위: mediaType.example → mediaType.examples[*].value → schema.example
    let example: unknown = media?.example;
    if (example === undefined && media?.examples && typeof media.examples === "object") {
      const first = Object.values(media.examples as AnyObj)[0] as AnyObj | undefined;
      example = first?.value;
    }
    if (example === undefined) {
      const resolvedSchema = resolveRef(media?.schema);
      if (resolvedSchema?.example !== undefined) example = resolvedSchema.example;
    }
    return {
      required: body.required === true,
      contentType,
      schema: convertSchema(media?.schema),
      example,
    };
  };

  const buildResponses = (raw: AnyObj | undefined): ParsedResponse[] => {
    if (!raw || typeof raw !== "object") return [];
    const result: ParsedResponse[] = [];
    for (const [statusCode, value] of Object.entries(raw)) {
      const response = resolveRef(value as AnyObj);
      if (!response) continue;
      let schema: ParsedSchema | undefined;
      let example: unknown;
      if (response.content && typeof response.content === "object") {
        const first = Object.values(response.content as AnyObj)[0] as AnyObj | undefined;
        schema = convertSchema(first?.schema);
        // 응답 example: media.example > media.examples의 첫 value > 스키마 example
        if (first?.example !== undefined) {
          example = first.example;
        } else if (first?.examples && typeof first.examples === "object") {
          const firstEx = Object.values(first.examples as AnyObj)[0] as AnyObj | undefined;
          if (firstEx && "value" in firstEx) example = firstEx.value;
        }
        if (example === undefined) {
          const resolved = resolveRef(first?.schema);
          if (resolved?.example !== undefined) example = resolved.example;
        }
      }
      result.push({ statusCode, description: response.description, schema, example });
    }
    return result.sort(
      (a, b) => (parseInt(a.statusCode, 10) || 999) - (parseInt(b.statusCode, 10) || 999),
    );
  };

  const operations: ParsedOperation[] = [];
  let rawCount = 0;
  const paths: AnyObj = doc.paths ?? {};
  for (const [path, pathItemRaw] of Object.entries(paths)) {
    const pathItem = resolveRef(pathItemRaw as AnyObj);
    if (!pathItem) continue;
    const sharedParams = buildParameters(pathItem.parameters);
    for (const method of HTTP_METHODS) {
      const opRaw = pathItem[method.toLowerCase()] as AnyObj | undefined;
      if (!opRaw) continue;
      rawCount += 1;
      const opParams = buildParameters(opRaw.parameters);
      operations.push({
        id: `${method} ${path}`,
        method: method as HTTPMethod,
        path,
        operationId: opRaw.operationId,
        summary: opRaw.summary,
        description: opRaw.description,
        tags: Array.isArray(opRaw.tags) ? opRaw.tags : [],
        parameters: [...sharedParams, ...opParams],
        requestBody: buildRequestBody(opRaw.requestBody),
        responses: buildResponses(opRaw.responses),
      });
    }
  }

  const securitySchemes: ParsedSecurityScheme[] = [];
  const schemes: AnyObj = components.securitySchemes ?? {};
  for (const [name, value] of Object.entries(schemes)) {
    const scheme = resolveRef(value as AnyObj);
    if (!scheme) continue;
    switch (scheme.type) {
      case "apiKey":
        securitySchemes.push({
          name,
          kind: { kind: "apiKey", name: scheme.name ?? name, location: scheme.in ?? "header" },
        });
        break;
      case "http":
        securitySchemes.push({ name, kind: { kind: "http", scheme: scheme.scheme ?? "bearer" } });
        break;
      case "oauth2":
        securitySchemes.push({ name, kind: { kind: "oauth2" } });
        break;
      case "openIdConnect":
        securitySchemes.push({ name, kind: { kind: "openIdConnect" } });
        break;
      default:
        securitySchemes.push({ name, kind: { kind: "unknown" } });
    }
  }

  const servers: string[] = Array.isArray(doc.servers)
    ? doc.servers.map((s: AnyObj) => s.url).filter(Boolean)
    : doc.host
      ? [`${(doc.schemes?.[0] as string) ?? "https"}://${doc.host}${doc.basePath ?? ""}`]
      : [];

  return {
    info: {
      title: doc.info?.title ?? "Untitled API",
      version: doc.info?.version ?? "",
      description: doc.info?.description,
    },
    servers,
    operations,
    securitySchemes,
    rawOperationCount: rawCount,
  };
}
