// 컬렉션을 외부 포맷(Postman/cURL/OpenAPI/Bruno)으로 내보내기. 모두 순수 함수.
import yaml from "js-yaml";
import { buildCurl } from "./curl-builder";
import type { Collection, SavedRequest } from "./collections";
import type { HTTPMethod, HTTPRequest } from "./types";

/** SavedRequest → buildCurl이 받는 HTTPRequest. */
function toHTTPRequest(s: SavedRequest): HTTPRequest {
  const headers: Record<string, string> = {};
  for (const h of s.headers ?? []) if (h.key) headers[h.key] = h.value;
  return {
    method: (s.method?.toUpperCase() as HTTPMethod) ?? "GET",
    url: s.url,
    headers,
    body: s.body || undefined,
  };
}

/** 모든 컬렉션의 요청을 (컬렉션, 요청) 쌍으로 평탄화. */
function eachRequest(cols: Collection[]): { col: Collection; req: SavedRequest }[] {
  const out: { col: Collection; req: SavedRequest }[] = [];
  for (const col of cols) for (const req of col.requests) out.push({ col, req });
  return out;
}

// ───────────────────────── Postman v2.1 ─────────────────────────

interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: {
    method: string;
    header: { key: string; value: string }[];
    url: string;
    body?: { mode: "raw"; raw: string };
  };
}

/** "a/b" 폴더 경로를 따라 PostmanItem 폴더 트리에 요청을 삽입. */
function insertIntoTree(root: PostmanItem[], folder: string | undefined, leaf: PostmanItem): void {
  let level = root;
  if (folder) {
    for (const seg of folder.split("/").filter(Boolean)) {
      let node = level.find((i) => i.name === seg && Array.isArray(i.item));
      if (!node) {
        node = { name: seg, item: [] };
        level.push(node);
      }
      level = node.item!;
    }
  }
  level.push(leaf);
}

function savedToPostmanItem(s: SavedRequest): PostmanItem {
  return {
    name: s.name,
    request: {
      method: (s.method ?? "GET").toUpperCase(),
      header: (s.headers ?? []).map((h) => ({ key: h.key, value: h.value })),
      url: s.url,
      ...(s.body ? { body: { mode: "raw" as const, raw: s.body } } : {}),
    },
  };
}

/** 컬렉션을 Postman 컬렉션 v2.1 JSON 문자열로. */
export function toPostmanV21(cols: Collection[]): string {
  const items: PostmanItem[] = [];
  let name = "SwaggerMan Export";
  if (cols.length === 1) {
    name = cols[0].name || name;
    for (const req of cols[0].requests) insertIntoTree(items, req.folder, savedToPostmanItem(req));
  } else {
    // 여러 컬렉션 → 각 컬렉션을 최상위 폴더로
    for (const col of cols) {
      const colNode: PostmanItem = { name: col.name || "(이름 없음)", item: [] };
      for (const req of col.requests)
        insertIntoTree(colNode.item!, req.folder, savedToPostmanItem(req));
      items.push(colNode);
    }
  }
  const doc = {
    info: {
      name,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: items,
  };
  return JSON.stringify(doc, null, 2);
}

// ───────────────────────── cURL 스크립트 ─────────────────────────

/** 모든 요청을 하나의 bash 스크립트로. */
export function toCurlScript(cols: Collection[]): string {
  const lines: string[] = ["#!/usr/bin/env bash", "set -euo pipefail", ""];
  for (const { col, req } of eachRequest(cols)) {
    const label = [col.name, req.folder, req.name].filter(Boolean).join("/");
    lines.push(`# ${label}`);
    lines.push(buildCurl(toHTTPRequest(req)));
    lines.push("");
  }
  return lines.join("\n");
}

// ───────────────────────── OpenAPI 3.1 ─────────────────────────

/** 컬렉션을 best-effort OpenAPI 3.1 YAML로. 손실 매핑. */
export function toOpenAPI(cols: Collection[]): string {
  const servers = new Set<string>();
  const paths: Record<string, Record<string, unknown>> = {};

  for (const { req } of eachRequest(cols)) {
    let pathname = req.url;
    try {
      const u = new URL(req.url);
      servers.add(u.origin);
      pathname = u.pathname || "/";
    } catch {
      /* 상대 URL은 그대로 path로 */
    }
    const method = (req.method ?? "GET").toLowerCase();
    const op: Record<string, unknown> = {
      summary: req.name,
      responses: { default: { description: "" } },
    };

    const headerParams = (req.headers ?? [])
      .filter((h) => h.key)
      .map((h) => ({ name: h.key, in: "header", schema: { type: "string" }, example: h.value }));
    if (headerParams.length) op.parameters = headerParams;

    if (req.body) {
      let example: unknown = req.body;
      try {
        example = JSON.parse(req.body);
      } catch {
        /* 비 JSON 본문은 문자열 그대로 */
      }
      op.requestBody = { content: { "application/json": { example } } };
    }

    paths[pathname] = paths[pathname] ?? {};
    paths[pathname][method] = op;
  }

  const doc: Record<string, unknown> = {
    openapi: "3.1.0",
    info: { title: "SwaggerMan Export", version: "1.0.0" },
    paths,
  };
  const serverList = [...servers];
  if (serverList.length) doc.servers = serverList.map((url) => ({ url }));
  return yaml.dump(doc, { noRefs: true, lineWidth: 120 });
}

// ───────────────────────── Bruno (.bru) ─────────────────────────

/** 파일/폴더명으로 안전하지 않은 문자(공백·구분자·제어문자 등) 치환. 글자·숫자·.·_만 유지. */
function safeName(name: string): string {
  return (name || "").replace(/[^\p{L}\p{N}._]+/gu, "_").replace(/^_+|_+$/g, "") || "untitled";
}

function savedToBru(s: SavedRequest, seq: number): string {
  const method = (s.method ?? "GET").toLowerCase();
  const hasBody = Boolean(s.body);
  const blocks: string[] = [];
  blocks.push(`meta {\n  name: ${s.name}\n  type: http\n  seq: ${seq}\n}`);
  blocks.push(`${method} {\n  url: ${s.url}\n  body: ${hasBody ? "json" : "none"}\n  auth: none\n}`);
  const headers = (s.headers ?? []).filter((h) => h.key);
  if (headers.length) {
    blocks.push(`headers {\n${headers.map((h) => `  ${h.key}: ${h.value}`).join("\n")}\n}`);
  }
  if (hasBody) {
    blocks.push(`body:json {\n${s.body}\n}`);
  }
  return blocks.join("\n\n") + "\n";
}

/** 컬렉션을 Bruno .bru 파일 목록으로(디렉터리 저장용). */
export function toBruFiles(cols: Collection[]): { relPath: string; content: string }[] {
  const files: { relPath: string; content: string }[] = [];
  for (const col of cols) {
    let seq = 1;
    for (const req of col.requests) {
      const segs = [
        safeName(col.name),
        ...(req.folder ? req.folder.split("/").filter(Boolean).map(safeName) : []),
        `${safeName(req.name)}.bru`,
      ];
      files.push({ relPath: segs.join("/"), content: savedToBru(req, seq++) });
    }
  }
  return files;
}
