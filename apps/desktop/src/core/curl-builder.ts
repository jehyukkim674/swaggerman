import type { HTTPRequest } from "./types";

/** HTTPRequest를 복사-실행 가능한 cURL 명령으로 변환. */
export function buildCurl(request: HTTPRequest): string {
  const lines: string[] = [`curl -X ${request.method} '${request.url}'`];
  for (const [key, value] of Object.entries(request.headers)) {
    if (!key) continue;
    lines.push(`  -H '${key}: ${value.replace(/'/g, "'\\''")}'`);
  }
  if (request.body && request.body.trim().length > 0) {
    lines.push(`  -d '${request.body.replace(/'/g, "'\\''")}'`);
  }
  return lines.join(" \\\n");
}
