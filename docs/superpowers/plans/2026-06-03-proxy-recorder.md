# 프록시 녹화 모드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 프록시 서버가 타깃 Base URL로 요청을 투명 포워딩하면서 요청/응답을 녹화하고, 녹화 항목을 경로 매칭 operation의 Mock 데이터셋으로 변환한다.

**Architecture:** Rust(axum + reqwest)로 포워딩 프록시 서버를 만들고(mock_server.rs 패턴 재활용), 녹화 버퍼에 적재. TS는 invoke 래퍼 + 녹화→operation 매칭 변환 모듈 + 프록시 모달을 제공하고, App.tsx가 매칭 녹화를 mock-config에 주입한다.

**Tech Stack:** Rust(axum 0.8, reqwest 0.12, tokio), TypeScript, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-proxy-recorder-design.md`

작업 디렉터리: `/Users/82312411gimjaehyeog/Dev/swagger-man/apps/desktop`. 모든 명령은 이 디렉터리에서. 브랜치: `main`. 한국어 주석/커밋. 참고: 기존 `src-tauri/src/mock_server.rs`(axum 서버·전역 핸들·graceful shutdown·CORS·녹화버퍼 패턴)와 `src/core/mock-config.ts`(loadMockConfig/saveMockConfig)를 읽고 그 패턴을 따른다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src-tauri/src/proxy_server.rs` (신규) | 포워딩 axum 서버 + 녹화 + proxy_start/stop/recordings command |
| `src-tauri/src/lib.rs` (수정) | mod + 플러그인 아님(command만) 등록 + Exit 시 정리 |
| `src/core/proxy-client.ts` (신규) | ProxyRecord 타입 + invoke 래퍼 |
| `src/core/proxy-to-mock.ts` (신규) | 녹화 → 매칭 operation + mock 변환 |
| `src/core/proxy-to-mock.test.ts` (신규) | 매칭·변환 테스트 |
| `src/components/ProxyModal.tsx` (신규) | 프록시 제어 + 녹화 리스트 + Mock으로 보내기 |
| `src/components/ProxyModal.test.tsx` (신규) | UI 테스트 |
| `src/App.tsx` (수정) | 상단바 버튼 + 모달 + sendRecordingToMock |
| `src/App.css`, `public/tauri-mock.js` (수정) | 스타일 + no-op |

---

### Task 1: Rust proxy_server.rs — 포워딩 서버 + 녹화

**Files:**
- Modify: `src-tauri/src/proxy_server.rs` (신규)
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 순수 함수 테스트 + 타입 작성 (proxy_server.rs)**

`src-tauri/src/proxy_server.rs` 생성:

```rust
// 프록시 녹화 서버: 타깃 Base URL로 요청을 투명 포워딩하면서 요청/응답을 녹화한다.
// mock_server.rs의 axum 서버·전역 핸들·graceful shutdown·CORS 패턴을 따른다.
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tokio::sync::oneshot;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRecord {
    pub at_ms: u64,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub response_body: String,
    pub error: Option<String>,
}

struct RunningProxy {
    shutdown_tx: Option<oneshot::Sender<()>>,
    port: u16,
}

static PROXY_HANDLE: OnceLock<Mutex<Option<RunningProxy>>> = OnceLock::new();
fn proxy_handle() -> &'static Mutex<Option<RunningProxy>> {
    PROXY_HANDLE.get_or_init(|| Mutex::new(None))
}

static RECORDINGS: OnceLock<Mutex<Vec<ProxyRecord>>> = OnceLock::new();
fn recordings() -> &'static Mutex<Vec<ProxyRecord>> {
    RECORDINGS.get_or_init(|| Mutex::new(Vec::new()))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// 타깃 base + 경로 + 쿼리로 포워딩 URL을 구성한다. base 끝 슬래시/path 시작 슬래시 중복 정리.
pub fn build_forward_url(target_base: &str, path: &str, query: Option<&str>) -> String {
    let base = target_base.trim_end_matches('/');
    let p = if path.starts_with('/') { path.to_string() } else { format!("/{path}") };
    match query {
        Some(q) if !q.is_empty() => format!("{base}{p}?{q}"),
        _ => format!("{base}{p}"),
    }
}

/// 녹화 추가(최근 100개 유지).
fn push_record(rec: ProxyRecord) {
    let mut recs = recordings().lock().unwrap();
    recs.push(rec);
    let overflow = recs.len().saturating_sub(100);
    if overflow > 0 {
        recs.drain(0..overflow);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forward_url_joins_base_path_query() {
        assert_eq!(build_forward_url("https://api.test", "/pet/3", None), "https://api.test/pet/3");
        assert_eq!(build_forward_url("https://api.test/", "/pet", Some("status=sold")), "https://api.test/pet?status=sold");
        assert_eq!(build_forward_url("https://api.test", "pet", None), "https://api.test/pet");
        assert_eq!(build_forward_url("https://api.test", "/pet", Some("")), "https://api.test/pet");
    }

    #[test]
    fn recordings_capped_at_100() {
        recordings().lock().unwrap().clear();
        for i in 0..130 {
            push_record(ProxyRecord {
                at_ms: i, method: "GET".into(), path: format!("/p{i}"),
                status: 200, response_body: "{}".into(), error: None,
            });
        }
        let recs = recordings().lock().unwrap();
        assert_eq!(recs.len(), 100);
        assert_eq!(recs.first().unwrap().path, "/p30"); // 앞 30개 드레인
    }
}
```

- [ ] **Step 2: lib.rs에 mod 선언 후 순수 테스트 실행**

`lib.rs`의 `mod mock_server;` 아래에 `mod proxy_server;` 추가.

Run: `cd src-tauri && cargo test proxy_server 2>&1 | tail -10`
Expected: 2 passed

- [ ] **Step 3: axum 포워딩 서버 본체 구현**

`proxy_server.rs`의 테스트 모듈 위에 추가:

```rust
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, Method, Uri};
use axum::response::IntoResponse;
use axum::Router;

#[derive(Clone)]
struct ProxyState {
    target: Arc<String>,
    client: reqwest::Client,
}

fn cors_headers(resp: &mut axum::http::HeaderMap) {
    resp.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    resp.insert("Access-Control-Allow-Methods", "*".parse().unwrap());
    resp.insert("Access-Control-Allow-Headers", "*".parse().unwrap());
}

async fn forward_handler(
    State(st): State<ProxyState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> axum::response::Response {
    // OPTIONS preflight
    if method == Method::OPTIONS {
        let mut resp = (axum::http::StatusCode::NO_CONTENT).into_response();
        cors_headers(resp.headers_mut());
        return resp;
    }

    let path = uri.path().to_string();
    let url = build_forward_url(&st.target, &path, uri.query());

    // reqwest 메서드 변환
    let rmethod = reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET);
    let mut req = st.client.request(rmethod, &url).body(body.to_vec());
    // host 제외하고 헤더 전달
    for (k, v) in headers.iter() {
        let name = k.as_str();
        if name.eq_ignore_ascii_case("host") {
            continue;
        }
        if let Ok(val) = v.to_str() {
            req = req.header(name, val);
        }
    }

    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let resp_body = res.text().await.unwrap_or_default();
            push_record(ProxyRecord {
                at_ms: now_ms(), method: method.to_string(), path: path.clone(),
                status, response_body: resp_body.clone(), error: None,
            });
            let mut resp = (axum::http::StatusCode::from_u16(status).unwrap_or(axum::http::StatusCode::OK), resp_body).into_response();
            cors_headers(resp.headers_mut());
            resp
        }
        Err(e) => {
            push_record(ProxyRecord {
                at_ms: now_ms(), method: method.to_string(), path,
                status: 502, response_body: String::new(), error: Some(e.to_string()),
            });
            let mut resp = (axum::http::StatusCode::BAD_GATEWAY, format!("프록시 포워딩 실패: {e}")).into_response();
            cors_headers(resp.headers_mut());
            resp
        }
    }
}

pub(crate) fn stop_proxy_internal() {
    if let Some(mut running) = proxy_handle().lock().unwrap().take() {
        if let Some(tx) = running.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

#[tauri::command]
pub async fn proxy_start(target_base_url: String, port: u16) -> Result<u16, String> {
    stop_proxy_internal();
    if target_base_url.trim().is_empty() {
        return Err("타깃 Base URL이 비어 있습니다".into());
    }
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| format!("PORT_IN_USE: {e}"))?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (tx, rx) = oneshot::channel::<()>();
    let state = ProxyState {
        target: Arc::new(target_base_url),
        client: reqwest::Client::new(),
    };
    let app = Router::new().fallback(forward_handler).with_state(state);
    *proxy_handle().lock().unwrap() = Some(RunningProxy { shutdown_tx: Some(tx), port: bound });
    recordings().lock().unwrap().clear();
    tokio::spawn(async move {
        let serve = axum::serve(listener, app).with_graceful_shutdown(async {
            let _ = rx.await;
        });
        if let Err(e) = serve.await {
            eprintln!("[proxy_server] 오류: {e}");
        }
    });
    Ok(bound)
}

#[tauri::command]
pub async fn proxy_stop() -> Result<(), String> {
    stop_proxy_internal();
    Ok(())
}

#[tauri::command]
pub fn proxy_recordings() -> Vec<ProxyRecord> {
    recordings().lock().unwrap().clone()
}
```

참고: `_` unused warning 방지를 위해 `HashMap` import가 안 쓰이면 제거. (위 코드는 HashMap 미사용 — 상단 `use std::collections::HashMap;` 줄 삭제)

- [ ] **Step 4: lib.rs command 등록 + Exit 정리**

`generate_handler!` 목록에 추가:
```rust
            global_shortcut::register_global_shortcut,
            global_shortcut::unregister_global_shortcut,
            proxy_server::proxy_start,
            proxy_server::proxy_stop,
            proxy_server::proxy_recordings
```

RunEvent::Exit 블록에 추가:
```rust
            if matches!(event, tauri::RunEvent::Exit) {
                mock_server::stop_server_internal();
                proxy_server::stop_proxy_internal();
            }
```

- [ ] **Step 5: 빌드 + 테스트 + clippy**

Run: `cd src-tauri && cargo build 2>&1 | tail -8 && cargo test 2>&1 | grep "test result" && cargo clippy --all-targets 2>&1 | grep -cE "^error"`
Expected: 빌드 성공, 테스트 PASS, clippy error 0

- [ ] **Step 6: 커밋**

```bash
git add src-tauri/Cargo.lock src-tauri/src/proxy_server.rs src-tauri/src/lib.rs
git commit -m "기능: Rust 프록시 녹화 서버 — 투명 포워딩 + 녹화 버퍼 + start/stop/recordings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: proxy-client.ts + proxy-to-mock.ts

**Files:**
- Create: `src/core/proxy-client.ts`
- Create: `src/core/proxy-to-mock.ts`
- Create: `src/core/proxy-to-mock.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 (proxy-to-mock)**

```ts
// src/core/proxy-to-mock.test.ts
import { describe, it, expect } from "vitest";
import { matchOperation, recordingToMock } from "./proxy-to-mock";
import type { ParsedSpec, ParsedOperation } from "./types";
import type { ProxyRecord } from "./proxy-client";

const ops: ParsedOperation[] = [
  { id: "GET /pet/findByStatus", method: "GET", path: "/pet/findByStatus", tags: [], parameters: [], responses: [] },
  { id: "GET /pet/{petId}", method: "GET", path: "/pet/{petId}", tags: [], parameters: [], responses: [] },
  { id: "POST /pet", method: "POST", path: "/pet", tags: [], parameters: [], responses: [] },
];
const spec = { info: { title: "t", version: "1" }, operations: ops, securitySchemes: [] } as unknown as ParsedSpec;

function rec(over: Partial<ProxyRecord>): ProxyRecord {
  return { atMs: 1, method: "GET", path: "/pet/findByStatus", status: 200, responseBody: "[]", ...over };
}

describe("matchOperation", () => {
  it("정확 경로 매칭", () => {
    expect(matchOperation(spec, "GET", "/pet/findByStatus")?.id).toBe("GET /pet/findByStatus");
  });
  it("path param 매칭", () => {
    expect(matchOperation(spec, "GET", "/pet/42")?.id).toBe("GET /pet/{petId}");
  });
  it("method 다르면 매칭 안 됨", () => {
    expect(matchOperation(spec, "DELETE", "/pet/42")).toBeNull();
  });
  it("없는 경로는 null", () => {
    expect(matchOperation(spec, "GET", "/unknown")).toBeNull();
  });
});

describe("recordingToMock", () => {
  it("배열 응답은 dataset으로, 매칭 opId 반환", () => {
    const r = recordingToMock(spec, rec({ responseBody: '[{"id":1}]' }));
    expect(r?.opId).toBe("GET /pet/findByStatus");
    expect(r?.dataset).toEqual([{ id: 1 }]);
    expect(r?.body).toBeUndefined();
  });
  it("객체 응답은 body로", () => {
    const r = recordingToMock(spec, rec({ method: "GET", path: "/pet/42", responseBody: '{"id":42}' }));
    expect(r?.opId).toBe("GET /pet/{petId}");
    expect(r?.body).toEqual({ id: 42 });
    expect(r?.dataset).toBeUndefined();
  });
  it("매칭 operation 없으면 null", () => {
    expect(recordingToMock(spec, rec({ path: "/nope" }))).toBeNull();
  });
  it("JSON 아닌 응답은 body 문자열로", () => {
    const r = recordingToMock(spec, rec({ responseBody: "plain text" }));
    expect(r?.body).toBe("plain text");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/core/proxy-to-mock.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현 (proxy-client.ts)**

```ts
// src/core/proxy-client.ts
// 프록시 녹화 서버 Tauri command 호출 래퍼.
import { invoke } from "@tauri-apps/api/core";

export interface ProxyRecord {
  atMs: number;
  method: string;
  path: string;
  status: number;
  responseBody: string;
  error?: string | null;
}

/** 프록시 시작. 바인딩된 포트 반환. 포트 충돌 시 "PORT_IN_USE: ..." throw */
export async function startProxy(targetBaseUrl: string, port: number): Promise<number> {
  return invoke<number>("proxy_start", { targetBaseUrl, port });
}

export async function stopProxy(): Promise<void> {
  await invoke("proxy_stop");
}

export async function getRecordings(): Promise<ProxyRecord[]> {
  return invoke<ProxyRecord[]>("proxy_recordings");
}
```

- [ ] **Step 4: 구현 (proxy-to-mock.ts)**

```ts
// src/core/proxy-to-mock.ts
// 프록시 녹화 → 경로 매칭 operation + Mock 변환.
import type { ParsedOperation, ParsedSpec } from "./types";
import type { ProxyRecord } from "./proxy-client";

/** operation path 템플릿(/pet/{petId})과 실제 경로(/pet/42)를 매칭. {x}는 와일드카드. */
function pathMatches(template: string, actual: string): boolean {
  const t = template.replace(/^\//, "").split("/");
  const a = actual.replace(/^\//, "").split("/");
  if (t.length !== a.length) return false;
  return t.every((seg, i) => (seg.startsWith("{") && seg.endsWith("}")) || seg === a[i]);
}

/** method + path로 매칭되는 operation 반환(없으면 null). 쿼리스트링은 무시. */
export function matchOperation(spec: ParsedSpec, method: string, path: string): ParsedOperation | null {
  const cleanPath = path.split("?")[0];
  return (
    spec.operations.find(
      (op) => op.method.toUpperCase() === method.toUpperCase() && pathMatches(op.path, cleanPath),
    ) ?? null
  );
}

export interface MockTarget {
  opId: string;
  dataset?: unknown[];
  body?: unknown;
}

/** 녹화를 매칭 operation의 Mock 대상으로 변환. 응답이 JSON 배열이면 dataset, 객체면 body,
 *  그 외(JSON 아님)면 원문 문자열을 body로. 매칭 operation 없으면 null. */
export function recordingToMock(spec: ParsedSpec, record: ProxyRecord): MockTarget | null {
  const op = matchOperation(spec, record.method, record.path);
  if (!op) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.responseBody);
  } catch {
    return { opId: op.id, body: record.responseBody };
  }
  if (Array.isArray(parsed)) return { opId: op.id, dataset: parsed };
  return { opId: op.id, body: parsed };
}
```

- [ ] **Step 5: 테스트 통과 + 타입체크**

Run: `npx vitest run src/core/proxy-to-mock.test.ts && npx tsc --noEmit && npx eslint src/core/proxy-client.ts src/core/proxy-to-mock.ts src/core/proxy-to-mock.test.ts`
Expected: PASS (8개), 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/core/proxy-client.ts src/core/proxy-to-mock.ts src/core/proxy-to-mock.test.ts
git commit -m "기능: 프록시 클라이언트 래퍼 + 녹화→operation 매칭/Mock 변환

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ProxyModal 컴포넌트

**Files:**
- Create: `src/components/ProxyModal.tsx`
- Create: `src/components/ProxyModal.test.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
// src/components/ProxyModal.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { ProxyModal } from "./ProxyModal";
import type { ProxyRecord } from "../core/proxy-client";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: unknown) => {
    if (cmd === "proxy_start") return 9091;
    if (cmd === "proxy_recordings") return [] as ProxyRecord[];
    return undefined;
  });
});

function renderModal(onSendToMock = vi.fn()) {
  render(
    <ProxyModal
      defaultTarget="https://api.example.com"
      onSendToMock={onSendToMock}
      onClose={vi.fn()}
    />,
  );
  return onSendToMock;
}

describe("ProxyModal", () => {
  it("타깃 URL 기본값과 시작 버튼을 표시한다", () => {
    renderModal();
    expect(screen.getByDisplayValue("https://api.example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "시작" })).toBeTruthy();
  });

  it("시작하면 proxy_start를 호출하고 실행 상태를 표시한다", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("proxy_start", expect.anything()));
    expect(await screen.findByText(/실행 중/)).toBeTruthy();
  });

  it("녹화 항목의 'Mock으로' 클릭 시 onSendToMock을 호출한다", async () => {
    const recs: ProxyRecord[] = [{ atMs: 1, method: "GET", path: "/pet", status: 200, responseBody: "[]" }];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "proxy_start") return 9091;
      if (cmd === "proxy_recordings") return recs;
      return undefined;
    });
    const onSend = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    // 폴링으로 녹화가 뜨면 Mock으로 버튼 노출
    const btn = await screen.findByRole("button", { name: /Mock으로/ });
    fireEvent.click(btn);
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ path: "/pet" }));
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/components/ProxyModal.test.tsx`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```tsx
// src/components/ProxyModal.tsx
// 프록시 녹화 모달: 타깃으로 포워딩하며 녹화, 녹화 항목을 Mock으로 보낸다.
import { useEffect, useRef, useState } from "react";
import { startProxy, stopProxy, getRecordings, type ProxyRecord } from "../core/proxy-client";
import { methodColor } from "./method";
import { CloseCircleIcon, CopyIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  defaultTarget: string;
  /** 녹화를 Mock으로 변환 요청(App이 매칭·저장). 성공 메시지/실패는 App이 결정 → 결과 문자열 반환 */
  onSendToMock: (record: ProxyRecord) => string;
  onClose: () => void;
}

const DEFAULT_PORT = 9091;

export function ProxyModal({ defaultTarget, onSendToMock, onClose }: Props) {
  useEscToClose(onClose);
  const [target, setTarget] = useState(defaultTarget);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [running, setRunning] = useState(false);
  const [boundPort, setBoundPort] = useState(0);
  const [records, setRecords] = useState<ProxyRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(() => {
      getRecordings().then(setRecords).catch(() => {});
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running]);

  const toggle = async () => {
    setError(null);
    if (running) {
      await stopProxy();
      setRunning(false);
      return;
    }
    try {
      const bp = await startProxy(target, port);
      setBoundPort(bp);
      setRunning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("PORT_IN_USE") ? `포트 ${port}이(가) 사용 중입니다 (예: ${port + 1})` : `시작 실패: ${msg}`);
    }
  };

  const baseUrl = `http://localhost:${boundPort}`;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal proxy-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>프록시 녹화{running && <span className="proxy-running"> 실행 중 — {baseUrl}</span>}</h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body proxy-body">
          <div className="proxy-control">
            <label className="config-field">
              <span className="config-label">타깃 Base URL</span>
              <input value={target} disabled={running} onChange={(e) => setTarget(e.target.value)}
                placeholder="https://api.example.com" spellCheck={false} style={{ minWidth: 280 }} />
            </label>
            <label className="config-field">
              <span className="config-label">포트</span>
              <input type="number" value={port} disabled={running}
                onChange={(e) => setPort(Number(e.target.value) || DEFAULT_PORT)} style={{ width: 80 }} />
            </label>
            <button className={running ? "btn small" : "btn small primary"} disabled={!target.trim()} onClick={toggle}>
              {running ? "중지" : "시작"}
            </button>
            {running && (
              <button className="btn small" title="Base URL 복사" onClick={() => navigator.clipboard.writeText(baseUrl).catch(() => {})}>
                <CopyIcon size={13} /> {baseUrl}
              </button>
            )}
          </div>
          {error && <div className="error-box">{error}</div>}
          {sendMsg && <div className="proxy-sendmsg">{sendMsg}</div>}
          <div className="proxy-records">
            {records.length === 0 && <div className="hint">{running ? `${baseUrl} 로 호출하면 여기에 녹화됩니다` : "시작 후 프록시로 호출하세요"}</div>}
            {[...records].reverse().map((r, i) => (
              <div className="proxy-rec-row" key={`${r.atMs}-${i}`}>
                <span className="method" style={{ color: methodColor(r.method) }}>{r.method}</span>
                <span className="proxy-rec-path">{r.path}</span>
                <span className="proxy-rec-status" style={{ color: r.error ? "#f85149" : "#3fb950" }}>
                  {r.error ? "ERR" : r.status}
                </span>
                <button className="btn small" onClick={() => setSendMsg(onSendToMock(r))}>Mock으로</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: CSS 추가 (App.css 끝)**

```css
/* 프록시 녹화 모달 */
.modal.proxy-modal { width: 680px; max-width: 94vw; max-height: 82vh; }
.proxy-body { display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
.proxy-running { margin-left: 10px; font-size: 11px; color: #3fb950; font-weight: 600; }
.proxy-control { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.proxy-sendmsg { color: var(--accent); font-size: 12px; }
.proxy-records { overflow: auto; border: 1px solid var(--border); border-radius: 6px; flex: 1; min-height: 120px; }
.proxy-rec-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px; font-size: 12px; border-bottom: 1px solid var(--border); }
.proxy-rec-path { font-family: ui-monospace, monospace; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.proxy-rec-status { font-family: ui-monospace, monospace; font-weight: 700; }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/components/ProxyModal.test.tsx`
Expected: PASS (3개)

- [ ] **Step 6: 커밋**

```bash
git add src/components/ProxyModal.tsx src/components/ProxyModal.test.tsx src/App.css
git commit -m "기능: 프록시 녹화 모달 — 제어·실시간 녹화 리스트·Mock으로 보내기

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: App.tsx 통합 + 검증

**Files:**
- Modify: `src/App.tsx`, `public/tauri-mock.js`

- [ ] **Step 1: App.tsx import + state + 콜백**

import 추가:
```tsx
import { ProxyModal } from "./components/ProxyModal";
import { recordingToMock } from "./core/proxy-to-mock";
import type { ProxyRecord } from "./core/proxy-client";
import { loadMockConfig, saveMockConfig } from "./core/mock-config";
```
(이미 import된 것은 중복 추가 금지 — loadMockConfig/saveMockConfig가 이미 있으면 재사용)

state 추가(mockOpen 근처):
```tsx
  const [proxyOpen, setProxyOpen] = useState(false);
```

콜백 추가(runForPersona 근처):
```tsx
  // 프록시 녹화를 Mock 데이터로 저장. 결과 메시지 반환.
  function sendRecordingToMock(record: ProxyRecord): string {
    if (!spec) return "스펙이 로드되지 않았습니다";
    const target = recordingToMock(spec, record);
    if (!target) return `스펙에 없는 경로입니다: ${record.method} ${record.path}`;
    const url = activeSpecUrl || specUrl;
    const cfg = loadMockConfig(url, spec);
    const op = cfg.operations.find((o) => o.opId === target.opId);
    if (op) {
      op.enabled = true;
      op.source = "manual";
      op.dataset = target.dataset;
      op.body = target.body;
    }
    saveMockConfig(url, cfg);
    return `Mock 저장됨: ${target.opId}`;
  }
```

- [ ] **Step 2: 상단바 버튼 + 모달 렌더**

"Mock" 버튼 근처에 추가:
```tsx
        <button className="btn" title="프록시 녹화 — 실서버로 포워딩하며 응답을 녹화해 Mock으로" onClick={() => setProxyOpen(true)} disabled={!spec}>
          프록시
        </button>
```

모달 렌더(mockOpen 블록 근처):
```tsx
      {proxyOpen && spec && (
        <ProxyModal
          defaultTarget={baseURL}
          onSendToMock={sendRecordingToMock}
          onClose={() => setProxyOpen(false)}
        />
      )}
```

- [ ] **Step 3: tauri-mock.js no-op**

invoke switch에 추가:
```js
      case "proxy_start":
        return Promise.reject(new Error("브라우저 모드에서는 프록시를 사용할 수 없습니다 (데스크톱 전용)"));
      case "proxy_stop":
        return Promise.resolve();
      case "proxy_recordings":
        return Promise.resolve([]);
```

- [ ] **Step 4: 전체 검증**

Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -3 && npx eslint src/App.tsx && npm run build 2>&1 | tail -2`
Expected: 타입 에러 없음, 전체 PASS, 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add src/App.tsx public/tauri-mock.js
git commit -m "기능: 상단바 프록시 버튼 + 녹화→Mock 저장 연결 (브라우저 모드 no-op)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 전체 검증 + 통합 테스트

**Files:** 없음

- [ ] **Step 1: TS + Rust 전체 검증**

```bash
npx eslint . && npx tsc --noEmit && npx vitest run && npm run build
cd src-tauri && cargo test && cargo clippy --all-targets 2>&1 | grep -cE "^error"
```
Expected: 모두 PASS, clippy error 0

- [ ] **Step 2: Rust 통합 테스트 추가 (proxy_server.rs)**

`proxy_server.rs` 테스트 모듈에 추가(로컬 테스트 서버로 포워딩 검증):

```rust
    #[tokio::test]
    async fn proxy_forwards_and_records() {
        // 타깃 역할 로컬 서버
        let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target_port = target_listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let app = axum::Router::new().route("/ping", axum::routing::get(|| async { "pong" }));
            axum::serve(target_listener, app).await.unwrap();
        });
        // 프록시 시작
        let proxy_port = proxy_start(format!("http://127.0.0.1:{target_port}"), 0).await.unwrap();
        // 프록시로 호출
        let client = reqwest::Client::new();
        let resp = client.get(format!("http://127.0.0.1:{proxy_port}/ping")).send().await.unwrap();
        assert_eq!(resp.status().as_u16(), 200);
        assert_eq!(resp.text().await.unwrap(), "pong");
        // 녹화 확인
        let recs = proxy_recordings();
        assert!(recs.iter().any(|r| r.path == "/ping" && r.status == 200));
        proxy_stop().await.unwrap();
    }
```

주의: 전역 싱글톤이라 다른 tokio 서버 테스트와 병렬 충돌 가능 → 이 통합 테스트는 단독 시나리오로. (mock_server 통합 테스트와 같은 프로세스 내 병렬이면 포트 0이라 충돌 적지만, RECORDINGS/PROXY_HANDLE 전역 공유 주의 — 이 테스트 하나만 proxy 전역을 씀)

Run: `cd src-tauri && cargo test proxy 2>&1 | grep "test result"`
Expected: PASS

- [ ] **Step 3: 브라우저 모드 스모크 + 커밋**

```bash
npm run dev  # 프록시 버튼 → 모달 표시, 브라우저 모드 안내 확인
```
통합 테스트 커밋:
```bash
git add src-tauri/src/proxy_server.rs
git commit -m "테스트: 프록시 포워딩·녹화 통합 테스트(로컬 타깃 서버)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review 체크

- **스펙 커버리지**: 포워딩 서버(Task1) ✓ / 녹화 버퍼 cap(Task1) ✓ / start/stop/recordings(Task1) ✓ / CORS·502(Task1) ✓ / Exit 정리(Task1) ✓ / 클라이언트 래퍼(Task2) ✓ / 녹화→operation 매칭·변환(Task2) ✓ / 모달·폴링·Mock으로(Task3) ✓ / App 통합·mock-config 주입(Task4) ✓ / 브라우저 no-op(Task4) ✓ / 통합 테스트(Task5) ✓
- **타입 일관성**: ProxyRecord(camelCase atMs/responseBody) Rust serde ↔ TS 일치 ✓. proxy_start(targetBaseUrl, port)/invoke 인자명 camelCase 일치 ✓. recordingToMock 반환 MockTarget{opId,dataset?,body?} ↔ App에서 mock-config 주입 ✓. MockOperationConfig 필드(enabled/source/dataset/body) mock-config.ts와 일치 ✓
- **플레이스홀더 없음** ✓
