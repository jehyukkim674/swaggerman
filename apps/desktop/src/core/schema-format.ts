import type { ParsedSchema } from "./types";

/** 스키마 타입을 사람이 읽는 라벨로(enum/array 포함). */
export function schemaTypeLabel(schema: ParsedSchema | undefined): string {
  if (!schema) return "any";
  switch (schema.type) {
    case "string":
      if (schema.enumValues && schema.enumValues.length > 0) {
        return schema.enumValues.map((v) => `"${v}"`).join(" | ");
      }
      return "string";
    case "array":
      return schema.items ? `array[${schemaTypeLabel(schema.items)}]` : "array";
    case "object":
      return "object";
    default:
      return schema.type;
  }
}
