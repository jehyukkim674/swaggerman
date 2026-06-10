// 컬렉션/폴더 + Import/Export. 저장 요청을 스펙과 무관하게 관리한다.
import { newId } from "./history";
import type { ParsedOperation } from "./types";
import type { RequestInputs } from "./request-builder";

export interface SavedRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
  folder?: string; // "a/b" 형태의 폴더 경로(선택)
}

export interface Collection {
  id: string;
  name: string;
  requests: SavedRequest[];
}

type AnyObj = Record<string, unknown>;
const isObj = (v: unknown): v is AnyObj => typeof v === "object" && v !== null;
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

/** Postman 컬렉션 v2.1 JSON을 파싱한다. item 트리를 폴더 경로로 평탄화. */
export function parsePostmanV21(json: unknown): Collection {
  if (!isObj(json) || !isObj(json.info) || !Array.isArray(json.item)) {
    throw new Error("Postman 컬렉션(v2.1) 형식이 아닙니다.");
  }
  const requests: SavedRequest[] = [];

  const extractUrl = (url: unknown): string => {
    if (typeof url === "string") return url;
    if (isObj(url)) {
      if (typeof url.raw === "string") return url.raw;
      const host = Array.isArray(url.host) ? url.host.join(".") : str(url.host);
      const path = Array.isArray(url.path) ? url.path.join("/") : str(url.path);
      const protocol = str(url.protocol, "https");
      if (host) return `${protocol}://${host}/${path}`.replace(/\/+$/, "");
    }
    return "";
  };

  const toSaved = (item: AnyObj, folder: string): SavedRequest => {
    const req = isObj(item.request) ? item.request : {};
    const headers: { key: string; value: string }[] = [];
    if (Array.isArray(req.header)) {
      for (const h of req.header) {
        if (isObj(h) && typeof h.key === "string") headers.push({ key: h.key, value: str(h.value) });
      }
    }
    const body = isObj(req.body) ? str(req.body.raw) : "";
    return {
      id: newId(),
      name: str(item.name, "(이름 없음)"),
      method: str(req.method, "GET").toUpperCase(),
      url: extractUrl(req.url),
      headers,
      body,
      folder: folder || undefined,
    };
  };

  const walk = (items: unknown[], folder: string) => {
    for (const raw of items) {
      if (!isObj(raw)) continue;
      if (Array.isArray(raw.item)) {
        const sub = str(raw.name);
        walk(raw.item, folder ? `${folder}/${sub}` : sub);
      } else if (isObj(raw.request)) {
        requests.push(toSaved(raw, folder));
      }
    }
  };
  walk(json.item, "");

  return { id: newId(), name: str((json.info as AnyObj).name, "Postman Collection"), requests };
}

/** 저장 요청을 ad-hoc 오퍼레이션+입력+baseURL로 변환(편집기 로드용). */
export function savedToRequest(s: SavedRequest): {
  operation: ParsedOperation;
  inputs: RequestInputs;
  baseURL: string;
} {
  let baseURL = "";
  let path = s.url;
  const queryParams: { key: string; value: string; enabled: boolean }[] = [];
  try {
    const u = new URL(s.url);
    baseURL = u.origin;
    path = u.pathname || "/";
    u.searchParams.forEach((value, key) => queryParams.push({ key, value, enabled: true }));
  } catch {
    /* 상대 URL 등은 그대로 path로 */
  }
  // 옛 버전/외부 import 데이터는 headers·body가 없을 수 있어 방어적으로 처리
  const body = s.body ?? "";
  const operation: ParsedOperation = {
    id: `saved:${s.id}`,
    method: (s.method as ParsedOperation["method"]) ?? "GET",
    path,
    tags: ["저장됨"],
    summary: s.name,
    parameters: [],
    requestBody: body ? { required: false, contentType: "application/json" } : undefined,
    responses: [],
  };
  const inputs: RequestInputs = {
    pathParams: {},
    queryParams,
    headers: (s.headers ?? []).map((h) => ({ key: h.key, value: h.value, enabled: true })),
    body,
    bodyMode: body ? "raw" : "none",
    form: [],
  };
  return { operation, inputs, baseURL };
}

/** 현재 편집 상태를 저장 요청으로 변환. */
export function requestToSaved(
  name: string,
  method: string,
  url: string,
  headers: { key: string; value: string; enabled: boolean }[],
  body: string,
): SavedRequest {
  return {
    id: newId(),
    name,
    method,
    url,
    headers: headers.filter((h) => h.enabled && h.key).map((h) => ({ key: h.key, value: h.value })),
    body,
  };
}

/** 네이티브 export 형식(우리 컬렉션 배열을 그대로 직렬화). */
export function exportCollections(collections: Collection[]): string {
  return JSON.stringify({ swaggerman: "collections", version: 1, collections }, null, 2);
}

/** 네이티브 import. 우리 형식이면 컬렉션 배열을, 아니면 Postman 파싱을 시도한다. */
export function importCollections(text: string): Collection[] {
  const json: unknown = JSON.parse(text);
  if (isObj(json) && json.swaggerman === "collections" && Array.isArray(json.collections)) {
    return json.collections as Collection[];
  }
  // Postman 단일 컬렉션
  return [parsePostmanV21(json)];
}
