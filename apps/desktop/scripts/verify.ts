// 실제 로컬 서버 spec으로 파서 검증 (Tauri 없이 Node에서 실행: npx tsx scripts/verify.ts)
import { parseSpecText } from "../src/core/openapi-parser";

const res = await fetch("http://localhost:8000/v3/api-docs");
const text = await res.text();
const spec = parseSpecText(text);

const tags = [...new Set(spec.operations.flatMap((o) => o.tags))].sort();
console.log("title       :", spec.info.title);
console.log("servers     :", spec.servers);
console.log("operations  :", spec.operations.length);
console.log("tags        :", tags.length, tags.slice(0, 8).join(", "));
console.log("security    :", spec.securitySchemes.map((s) => s.name).join(", "));
console.log("sample ops  :");
for (const op of spec.operations.slice(0, 4)) {
  const pathParams = op.parameters.filter((p) => p.location === "path").map((p) => p.name);
  console.log(
    `  ${op.method.padEnd(6)} ${op.path}  [path:${pathParams.join(",")}] body:${op.requestBody ? "Y" : "N"}`,
  );
}
