// spec URL을 로드한다. JSON/YAML이면 바로 파싱하고, HTML(Swagger UI)이면 디스커버리로 실제 spec을 찾는다.
// macOS 앱(OperationStore)의 디스커버리 로직을 포팅: well-known 경로 + swagger-config + HTML url 추출,
// 일부 후보가 401이어도 유효 spec을 우선 사용(401 가로채기 방지).
import { rawGet } from "./http-client";
import { parseSpecText } from "./openapi-parser";
import type { ParsedSpec } from "./types";

const WELL_KNOWN = [
  "/v3/api-docs",
  "/openapi.json",
  "/openapi.yaml",
  "/v2/api-docs",
  "/api-docs",
  "/swagger.json",
  "/api/schema/",
  "/api/openapi.json",
  "/api/swagger.json",
  "/swagger/v1/swagger.json",
];

const CONFIG_PATHS = ["/v3/api-docs/swagger-config", "/swagger-ui/swagger-config"];

function isHtml(body: string): boolean {
  return body.trim().startsWith("<");
}

function tryParse(body: string): ParsedSpec | null {
  try {
    const spec = parseSpecText(body);
    return spec.operations.length > 0 ? spec : null;
  } catch {
    return null;
  }
}

/** HTML에서 url: "..." 형태의 spec 후보 추출. */
function extractUrlsFromHtml(html: string): string[] {
  const results: string[] = [];
  const regex = /["\s,{]url\s*:\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const candidate = match[1];
    const lower = candidate.toLowerCase();
    if (
      lower.endsWith(".json") ||
      lower.endsWith(".yaml") ||
      lower.endsWith(".yml") ||
      lower.includes("api-doc") ||
      lower.includes("openapi") ||
      lower.includes("swagger") ||
      lower.includes("/schema") ||
      lower.includes("/spec")
    ) {
      results.push(candidate);
    }
  }
  return results;
}

function absolutize(base: URL, path: string): string | null {
  try {
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

/** swagger-config(JSON)에서 spec URL들을 추출. 단일 url + 그룹 urls[] 모두 처리. */
async function configSpecUrls(base: URL, insecure: boolean): Promise<string[]> {
  const urls: string[] = [];
  for (const path of CONFIG_PATHS) {
    const configUrl = absolutize(base, path);
    if (!configUrl) continue;
    try {
      const { status, body } = await rawGet(configUrl, {}, insecure);
      if (status < 200 || status >= 300) continue;
      const config = JSON.parse(body);
      if (typeof config.url === "string" && config.url) {
        const u = absolutize(base, config.url);
        if (u) urls.push(u);
      }
      if (Array.isArray(config.urls)) {
        for (const entry of config.urls) {
          if (entry?.url) {
            const u = absolutize(base, entry.url);
            if (u) urls.push(u);
          }
        }
      }
    } catch {
      /* config 없음/파싱 실패 → 무시 */
    }
  }
  return urls;
}

type ProbeResult =
  | { kind: "found"; spec: ParsedSpec }
  | { kind: "unauthorized" }
  | { kind: "miss" };

async function probe(url: string, insecure: boolean): Promise<ProbeResult> {
  try {
    const { status, body } = await rawGet(url, {}, insecure);
    if (status === 401 || status === 403) return { kind: "unauthorized" };
    if (status < 200 || status >= 300) return { kind: "miss" };
    if (isHtml(body)) return { kind: "miss" };
    const spec = tryParse(body);
    return spec ? { kind: "found", spec } : { kind: "miss" };
  } catch {
    return { kind: "miss" };
  }
}

async function discover(specUrl: string, html: string, insecure: boolean): Promise<ParsedSpec> {
  const base = new URL(specUrl);
  base.search = "";

  // 후보 순서가 곧 우선순위(첫 found가 채택됨).
  // 표준 aggregate(/v3/api-docs 등)를 그룹별 spec보다 먼저 두어 전체 spec이 우선 로드되게 한다.
  const candidates = new Set<string>();
  for (const path of WELL_KNOWN) {
    const u = absolutize(base, path);
    if (u) candidates.add(u);
  }
  for (const u of await configSpecUrls(base, insecure)) candidates.add(u);
  for (const extracted of extractUrlsFromHtml(html)) {
    const u = extracted.startsWith("http") ? extracted : absolutize(base, extracted);
    if (u) candidates.add(u);
  }

  // 병렬 probe — 유효 spec(found)을 우선. 일부 401이어도 중단하지 않음.
  const results = await Promise.all([...candidates].map((u) => probe(u, insecure)));
  const found = results.find((r) => r.kind === "found");
  if (found && found.kind === "found") return found.spec;

  if (results.some((r) => r.kind === "unauthorized")) {
    throw new Error("이 Swagger URL은 인증이 필요합니다.");
  }
  throw new Error(
    "spec을 찾지 못했습니다. JSON spec URL을 직접 입력하세요. 예: /v3/api-docs, /openapi.json",
  );
}

/** spec URL을 로드해 ParsedSpec 반환. HTML이면 디스커버리 수행. */
export async function loadSpec(specUrl: string, insecure = false): Promise<ParsedSpec> {
  const { status, body } = await rawGet(specUrl, {}, insecure);

  if (!isHtml(body)) {
    if (status === 401 || status === 403) {
      throw new Error("이 spec URL은 인증이 필요합니다.");
    }
    if (status < 200 || status >= 300) {
      throw new Error(`spec 요청 실패: HTTP ${status}`);
    }
    const spec = tryParse(body);
    if (spec) return spec;
    // JSON이지만 operation이 없으면 그래도 파싱 시도(빈 spec 허용)
    return parseSpecText(body);
  }

  return discover(specUrl, body, insecure);
}
