# CDP 브라우저 캡처 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱이 전용 Chrome을 CDP 디버깅 모드로 띄워 XHR/Fetch 트래픽을 녹화 — Okta 등 OAuth 리다이렉트로 리버스 프록시가 우회되는 문제를 해결한다.

**Architecture:** Rust `browser_capture.rs`가 Chrome 기동 + CDP WebSocket + 녹화 저장을 전담(기존 `proxy_server.rs` 패턴과 대칭). 프론트는 `capture-client.ts` 래퍼 + ProxyModal 모드 전환. 녹화는 기존 `ProxyRecord` 타입을 재사용해 `recordingsToMocks` 파이프라인이 그대로 동작한다.

**Tech Stack:** Tauri 2 (Rust: tokio, axum 기존), 신규 `tokio-tungstenite` + `futures-util` + `base64`(전부 이미 Cargo.lock에 전이 포함). 프론트 React+TS, vitest.

**스펙:** `docs/superpowers/specs/2026-06-10-cdp-browser-capture-design.md`

**참고 — 기존 코드 위치:**
- `apps/desktop/src-tauri/src/proxy_server.rs` — ProxyRecord(9-18행), 전역 핸들 패턴(20-34행), 커맨드(305-358행)
- `apps/desktop/src-tauri/src/lib.rs` — 커맨드 등록(225행~), 종료 정리(249-250행)
- `apps/desktop/src/core/proxy-to-mock.ts` — recordingToMock/recordingsToMocks
- `apps/desktop/src/components/ProxyModal.tsx` + `.test.tsx` — 모달/테스트 패턴
- `apps/desktop/src/App.tsx` — sendRecordingToMock(262행), sendAllRecordingsToMock(274행), ProxyModal 마운트(1735행)

**명령어:** Rust 테스트 `cd apps/desktop/src-tauri && cargo test`, 프론트 `cd apps/desktop && npm test`(vitest run), 타입 `npm run typecheck`.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| Create `src-tauri/src/browser_capture.rs` | Chrome 탐지/기동, CDP WS 세션, 이벤트→녹화 변환, 커맨드 4개 |
| Modify `src-tauri/src/lib.rs` | 모듈 선언·커맨드 등록·종료 시 Chrome 정리 |
| Modify `src-tauri/Cargo.toml` | tokio-tungstenite, futures-util, base64 추가 |
| Create `src/core/capture-client.ts` | Tauri 커맨드 호출 래퍼 4개 |
| Modify `src/core/proxy-to-mock.ts` | `stripBasePath` + 매칭 폴백(baseUrl 선택 인자) |
| Modify `src/components/ProxyModal.tsx` | `프록시 | 브라우저` 모드 전환 UI |
| Modify `src/App.tsx` | 핸들러에 baseURL 전달 |
| Modify `src/App.css` | 모드 탭 스타일 |

---

### Task 1: Rust 의존성 + 순수 헬퍼 (Chrome 탐지·인자·포트·URL 파싱)

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/browser_capture.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (mod 선언만)

- [ ] **Step 1: Cargo.toml에 의존성 추가** (`[dependencies]` 섹션 끝)

```toml
tokio-tungstenite = "0.24"
futures-util = { version = "0.3", default-features = false, features = ["sink", "std"] }
base64 = "0.22"
```

- [ ] **Step 2: browser_capture.rs 생성 — 헬퍼와 실패하는 테스트**

```rust
// 브라우저 캡처: 전용 Chrome을 CDP 디버깅 모드로 기동해 Network 이벤트(XHR/Fetch)를 녹화한다.
// proxy_server.rs의 전역 핸들·녹화 저장소(최근 100개) 패턴을 따른다.
use std::path::PathBuf;

/// OS별 Chrome 계열 실행 파일 후보(우선순위 순). 에러 메시지 안내에도 쓴다.
pub fn chrome_candidates() -> Vec<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        return [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
    }
    #[cfg(target_os = "windows")]
    {
        let mut v = Vec::new();
        for base in [
            std::env::var("PROGRAMFILES").unwrap_or_else(|_| r"C:\Program Files".into()),
            std::env::var("PROGRAMFILES(X86)").unwrap_or_else(|_| r"C:\Program Files (x86)".into()),
            std::env::var("LOCALAPPDATA").unwrap_or_default(),
        ] {
            if base.is_empty() {
                continue;
            }
            v.push(PathBuf::from(&base).join(r"Google\Chrome\Application\chrome.exe"));
            v.push(PathBuf::from(&base).join(r"Microsoft\Edge\Application\msedge.exe"));
        }
        return v;
    }
    #[allow(unreachable_code)]
    Vec::new()
}

fn find_chrome() -> Option<PathBuf> {
    chrome_candidates().into_iter().find(|p| p.exists())
}

/// CDP 기동 인자. 전용 프로필로 일반 브라우저와 분리(프로필 유지 → Okta 로그인 세션 재사용).
pub fn chrome_args(port: u16, profile_dir: &str, start_url: &str) -> Vec<String> {
    vec![
        format!("--remote-debugging-port={port}"),
        format!("--user-data-dir={profile_dir}"),
        "--no-first-run".into(),
        "--no-default-browser-check".into(),
        start_url.to_string(),
    ]
}

/// /json/list 응답에서 첫 page 타깃의 webSocketDebuggerUrl. (v1: 첫 탭만 캡처)
pub fn parse_page_ws_url(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    v.as_array()?
        .iter()
        .find(|t| t["type"] == "page")
        .and_then(|t| t["webSocketDebuggerUrl"].as_str())
        .map(String::from)
}

/// URL에서 scheme://host를 떼고 path+query만 남긴다(fragment 제거). 경로 없으면 "/".
pub fn path_and_query(url: &str) -> String {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let no_frag = rest.split('#').next().unwrap_or(rest);
    match no_frag.find('/') {
        Some(i) => no_frag[i..].to_string(),
        None => match no_frag.find('?') {
            Some(i) => format!("/{}", &no_frag[i..]),
            None => "/".into(),
        },
    }
}

/// from..to 범위에서 바인딩 가능한 첫 포트.
fn pick_free_port(from: u16, to: u16) -> Result<u16, String> {
    for p in from..to {
        if std::net::TcpListener::bind(("127.0.0.1", p)).is_ok() {
            return Ok(p);
        }
    }
    Err("빈 디버깅 포트를 찾지 못했습니다".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chrome_args_include_debug_port_profile_and_url() {
        let args = chrome_args(9222, "/tmp/profile", "https://svc.example.com");
        assert!(args.contains(&"--remote-debugging-port=9222".to_string()));
        assert!(args.contains(&"--user-data-dir=/tmp/profile".to_string()));
        assert!(args.contains(&"--no-first-run".to_string()));
        assert_eq!(args.last().unwrap(), "https://svc.example.com");
    }

    #[test]
    fn parse_page_ws_url_picks_first_page_target() {
        let body = r#"[
          {"type":"iframe","webSocketDebuggerUrl":"ws://x/devtools/page/IF"},
          {"type":"page","webSocketDebuggerUrl":"ws://x/devtools/page/AAA"},
          {"type":"page","webSocketDebuggerUrl":"ws://x/devtools/page/BBB"}
        ]"#;
        assert_eq!(parse_page_ws_url(body).as_deref(), Some("ws://x/devtools/page/AAA"));
        assert_eq!(parse_page_ws_url("[]"), None);
        assert_eq!(parse_page_ws_url("not json"), None);
    }

    #[test]
    fn path_and_query_strips_origin_and_fragment() {
        assert_eq!(path_and_query("https://h.com/api/pets?limit=2"), "/api/pets?limit=2");
        assert_eq!(path_and_query("https://h.com/api/pets#frag"), "/api/pets");
        assert_eq!(path_and_query("https://h.com"), "/");
        assert_eq!(path_and_query("https://h.com?x=1"), "/?x=1");
    }

    #[test]
    fn pick_free_port_returns_bindable_port() {
        let p = pick_free_port(49500, 49600).unwrap();
        assert!((49500..49600).contains(&p));
    }
}
```

- [ ] **Step 3: lib.rs에 모듈 선언 추가** (3-4행 `mod mock_server;` 옆)

```rust
mod browser_capture;
```

- [ ] **Step 4: 테스트 실행**

Run: `cd apps/desktop/src-tauri && cargo test browser_capture`
Expected: 4개 테스트 PASS (미사용 함수 warning은 다음 Task에서 사용되며 사라짐 — `find_chrome`/`pick_free_port`에 일시적으로 `#[allow(dead_code)]`를 붙이지 말고 warning 허용)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/browser_capture.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "기능: 브라우저 캡처 헬퍼 — Chrome 탐지·CDP 인자·포트·URL 파싱"
```

---

### Task 2: CaptureTracker — CDP 이벤트 → 녹화 상태 기계

**Files:**
- Modify: `apps/desktop/src-tauri/src/browser_capture.rs`

WS I/O와 분리된 순수 상태 기계. 이벤트 흐름: `requestWillBeSent`(XHR/Fetch만 추적) → `responseReceived`(status) → `loadingFinished`(getResponseBody 커맨드 발행) → 커맨드 응답(본문 확보, 녹화 완성). `loadingFailed`는 즉시 에러 녹화.

- [ ] **Step 1: 실패하는 테스트 추가** (`mod tests` 안에)

```rust
    fn ev(json: serde_json::Value) -> String {
        json.to_string()
    }

    #[test]
    fn tracker_records_xhr_after_body_response() {
        let mut t = CaptureTracker::new();
        // 1) XHR 요청 시작 → 추적
        let out = t.on_message(&ev(serde_json::json!({
            "method": "Network.requestWillBeSent",
            "params": {"requestId": "r1", "type": "XHR",
                       "request": {"method": "GET", "url": "https://h.com/api/pets?limit=2"}}
        })));
        assert!(out.commands.is_empty() && out.records.is_empty());
        // 2) 응답 헤더 → status 기록
        t.on_message(&ev(serde_json::json!({
            "method": "Network.responseReceived",
            "params": {"requestId": "r1", "response": {"status": 200}}
        })));
        // 3) 로딩 완료 → getResponseBody 커맨드 발행
        let out = t.on_message(&ev(serde_json::json!({
            "method": "Network.loadingFinished", "params": {"requestId": "r1"}
        })));
        assert_eq!(out.commands.len(), 1);
        let cmd: serde_json::Value = serde_json::from_str(&out.commands[0]).unwrap();
        assert_eq!(cmd["method"], "Network.getResponseBody");
        assert_eq!(cmd["params"]["requestId"], "r1");
        // 4) 본문 응답 → 녹화 완성
        let out = t.on_message(&ev(serde_json::json!({
            "id": cmd["id"], "result": {"body": "{\"ok\":true}", "base64Encoded": false}
        })));
        assert_eq!(out.records.len(), 1);
        let r = &out.records[0];
        assert_eq!(r.method, "GET");
        assert_eq!(r.path, "/api/pets?limit=2");
        assert_eq!(r.status, 200);
        assert_eq!(r.response_body, "{\"ok\":true}");
        assert!(r.error.is_none());
    }

    #[test]
    fn tracker_ignores_non_api_types() {
        let mut t = CaptureTracker::new();
        for ty in ["Document", "Stylesheet", "Image", "Script"] {
            t.on_message(&ev(serde_json::json!({
                "method": "Network.requestWillBeSent",
                "params": {"requestId": ty, "type": ty,
                           "request": {"method": "GET", "url": "https://h.com/x"}}
            })));
            let out = t.on_message(&ev(serde_json::json!({
                "method": "Network.loadingFinished", "params": {"requestId": ty}
            })));
            assert!(out.commands.is_empty(), "{ty}는 무시해야 함");
        }
    }

    #[test]
    fn tracker_records_loading_failed_as_error() {
        let mut t = CaptureTracker::new();
        t.on_message(&ev(serde_json::json!({
            "method": "Network.requestWillBeSent",
            "params": {"requestId": "r1", "type": "Fetch",
                       "request": {"method": "POST", "url": "https://h.com/api/login"}}
        })));
        let out = t.on_message(&ev(serde_json::json!({
            "method": "Network.loadingFailed",
            "params": {"requestId": "r1", "errorText": "net::ERR_CONNECTION_RESET"}
        })));
        assert_eq!(out.records.len(), 1);
        assert_eq!(out.records[0].error.as_deref(), Some("net::ERR_CONNECTION_RESET"));
        assert_eq!(out.records[0].response_body, "");
    }

    #[test]
    fn tracker_decodes_base64_body_and_drops_non_utf8() {
        let mut t = CaptureTracker::new();
        t.on_message(&ev(serde_json::json!({
            "method": "Network.requestWillBeSent",
            "params": {"requestId": "r1", "type": "XHR",
                       "request": {"method": "GET", "url": "https://h.com/api/bin"}}
        })));
        let out = t.on_message(&ev(serde_json::json!({
            "method": "Network.loadingFinished", "params": {"requestId": "r1"}
        })));
        let cmd: serde_json::Value = serde_json::from_str(&out.commands[0]).unwrap();
        // "hello" base64
        let out = t.on_message(&ev(serde_json::json!({
            "id": cmd["id"], "result": {"body": "aGVsbG8=", "base64Encoded": true}
        })));
        assert_eq!(out.records[0].response_body, "hello");
        // 비-UTF8(0xFF 0xFE)은 빈 문자열로
        t.on_message(&ev(serde_json::json!({
            "method": "Network.requestWillBeSent",
            "params": {"requestId": "r2", "type": "XHR",
                       "request": {"method": "GET", "url": "https://h.com/api/bin2"}}
        })));
        let out = t.on_message(&ev(serde_json::json!({
            "method": "Network.loadingFinished", "params": {"requestId": "r2"}
        })));
        let cmd: serde_json::Value = serde_json::from_str(&out.commands[0]).unwrap();
        let out = t.on_message(&ev(serde_json::json!({
            "id": cmd["id"], "result": {"body": "//4=", "base64Encoded": true}
        })));
        assert_eq!(out.records[0].response_body, "");
    }

    #[test]
    fn tracker_ignores_garbage_and_unknown_messages() {
        let mut t = CaptureTracker::new();
        for msg in ["not json", "{}", r#"{"method":"Page.loadEventFired","params":{}}"#, r#"{"id":1,"result":{}}"#] {
            let out = t.on_message(msg);
            assert!(out.commands.is_empty() && out.records.is_empty());
        }
    }
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd apps/desktop/src-tauri && cargo test browser_capture`
Expected: FAIL — `CaptureTracker` not found

- [ ] **Step 3: 구현** (browser_capture.rs, 헬퍼들 아래에 추가)

```rust
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde_json::{json, Value};

use crate::proxy_server::ProxyRecord;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

struct PendingEntry {
    method: String,
    path: String,
    status: u16,
}

/// CDP Network 이벤트 → 녹화 변환 상태 기계. WS I/O와 분리해 단위 테스트 가능.
#[derive(Default)]
pub struct CaptureTracker {
    pending: HashMap<String, PendingEntry>, // requestId → 요청 정보
    body_waits: HashMap<u64, String>,       // getResponseBody 커맨드 id → requestId
    next_cmd_id: u64,
}

/// on_message 결과: WS로 보낼 CDP 커맨드(JSON 문자열)와 완성된 녹화.
#[derive(Default)]
pub struct TrackerOutput {
    pub commands: Vec<String>,
    pub records: Vec<ProxyRecord>,
}

impl CaptureTracker {
    pub fn new() -> Self {
        // 1~99는 Network.enable 등 수동 커맨드용으로 비워둔다
        Self { next_cmd_id: 100, ..Default::default() }
    }

    pub fn on_message(&mut self, text: &str) -> TrackerOutput {
        let mut out = TrackerOutput::default();
        let Ok(v) = serde_json::from_str::<Value>(text) else { return out };
        if let Some(method) = v["method"].as_str() {
            self.on_event(method, &v["params"], &mut out);
        } else if let Some(cmd_id) = v["id"].as_u64() {
            self.on_command_result(cmd_id, &v["result"], &mut out);
        }
        out
    }

    fn on_event(&mut self, method: &str, p: &Value, out: &mut TrackerOutput) {
        match method {
            "Network.requestWillBeSent" => {
                let ty = p["type"].as_str().unwrap_or("");
                if ty != "XHR" && ty != "Fetch" {
                    return;
                }
                if let (Some(id), Some(m), Some(url)) = (
                    p["requestId"].as_str(),
                    p["request"]["method"].as_str(),
                    p["request"]["url"].as_str(),
                ) {
                    self.pending.insert(
                        id.into(),
                        PendingEntry { method: m.into(), path: path_and_query(url), status: 0 },
                    );
                }
            }
            "Network.responseReceived" => {
                if let Some(e) = p["requestId"].as_str().and_then(|id| self.pending.get_mut(id)) {
                    e.status = p["response"]["status"].as_u64().unwrap_or(0) as u16;
                }
            }
            "Network.loadingFinished" => {
                let Some(id) = p["requestId"].as_str() else { return };
                if !self.pending.contains_key(id) {
                    return;
                }
                self.next_cmd_id += 1;
                self.body_waits.insert(self.next_cmd_id, id.to_string());
                out.commands.push(
                    json!({"id": self.next_cmd_id, "method": "Network.getResponseBody",
                           "params": {"requestId": id}})
                    .to_string(),
                );
            }
            "Network.loadingFailed" => {
                let Some(e) = p["requestId"].as_str().and_then(|id| self.pending.remove(id)) else {
                    return;
                };
                out.records.push(ProxyRecord {
                    at_ms: now_ms(),
                    method: e.method,
                    path: e.path,
                    status: e.status,
                    response_body: String::new(),
                    error: Some(p["errorText"].as_str().unwrap_or("loading failed").to_string()),
                });
            }
            _ => {}
        }
    }

    fn on_command_result(&mut self, cmd_id: u64, result: &Value, out: &mut TrackerOutput) {
        let Some(req_id) = self.body_waits.remove(&cmd_id) else { return };
        let Some(e) = self.pending.remove(&req_id) else { return };
        out.records.push(ProxyRecord {
            at_ms: now_ms(),
            method: e.method,
            path: e.path,
            status: e.status,
            response_body: decode_body(result),
            error: None,
        });
    }
}

/// getResponseBody 결과 본문. base64면 디코드, 비-UTF8/실패면 빈 문자열(녹화 자체는 남긴다).
fn decode_body(result: &Value) -> String {
    let body = result["body"].as_str().unwrap_or("");
    if result["base64Encoded"].as_bool().unwrap_or(false) {
        base64::engine::general_purpose::STANDARD
            .decode(body)
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
            .unwrap_or_default()
    } else {
        body.to_string()
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/desktop/src-tauri && cargo test browser_capture`
Expected: 9개 테스트 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/browser_capture.rs
git commit -m "기능: CaptureTracker — CDP Network 이벤트를 ProxyRecord로 변환(XHR/Fetch만, 본문 base64 디코드)"
```

---

### Task 3: WS 세션 펌프 + 가짜 CDP 서버 통합 테스트

**Files:**
- Modify: `apps/desktop/src-tauri/src/browser_capture.rs`

- [ ] **Step 1: 실패하는 통합 테스트 추가** (`mod tests` 안에 — 전역 녹화 저장소를 쓰는 테스트는 이것 하나뿐이어야 한다. Mock 서버 때 병렬 충돌 교훈)

```rust
    /// 가짜 CDP WS 서버에 붙여 XHR 흐름 종단 검증. 실제 Chrome은 CI에서 띄우지 않는다.
    #[tokio::test]
    async fn ws_session_records_xhr_via_fake_cdp() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::Message;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            // 클라이언트의 Network.enable 수신 → ack
            let _ = ws.next().await;
            let _ = ws.send(Message::Text(r#"{"id":1,"result":{}}"#.into())).await;
            // 스크립트된 XHR 이벤트 3종
            for ev in [
                r#"{"method":"Network.requestWillBeSent","params":{"requestId":"r1","type":"XHR","request":{"method":"GET","url":"https://real-host.example.com/api/pets?limit=2"}}}"#,
                r#"{"method":"Network.responseReceived","params":{"requestId":"r1","response":{"status":200}}}"#,
                r#"{"method":"Network.loadingFinished","params":{"requestId":"r1"}}"#,
            ] {
                let _ = ws.send(Message::Text(ev.into())).await;
            }
            // getResponseBody 커맨드 수신 → 본문 응답 후 종료
            if let Some(Ok(Message::Text(t))) = ws.next().await {
                let v: serde_json::Value = serde_json::from_str(&t).unwrap();
                assert_eq!(v["method"], "Network.getResponseBody");
                let resp = serde_json::json!({"id": v["id"], "result": {"body": "[{\"id\":1}]", "base64Encoded": false}});
                let _ = ws.send(Message::Text(resp.to_string().into())).await;
            }
            let _ = ws.close(None).await;
        });

        capture_recordings_store().lock().unwrap().clear();
        run_ws_session(&format!("ws://{addr}")).await.unwrap();
        let recs = capture_recordings_store().lock().unwrap().clone();
        assert_eq!(recs.len(), 1);
        assert_eq!(recs[0].method, "GET");
        assert_eq!(recs[0].path, "/api/pets?limit=2");
        assert_eq!(recs[0].status, 200);
        assert_eq!(recs[0].response_body, "[{\"id\":1}]");
    }
```

- [ ] **Step 2: 컴파일 실패 확인**

Run: `cd apps/desktop/src-tauri && cargo test browser_capture`
Expected: FAIL — `run_ws_session`, `capture_recordings_store` not found

- [ ] **Step 3: 구현** (browser_capture.rs에 추가)

```rust
use std::sync::{Mutex, OnceLock};

use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

static CAPTURE_RECORDINGS: OnceLock<Mutex<Vec<ProxyRecord>>> = OnceLock::new();
fn capture_recordings_store() -> &'static Mutex<Vec<ProxyRecord>> {
    CAPTURE_RECORDINGS.get_or_init(|| Mutex::new(Vec::new()))
}

/// 녹화 추가(최근 100개 유지 — proxy_server와 동일 정책).
fn push_capture_record(rec: ProxyRecord) {
    let mut recs = capture_recordings_store().lock().unwrap();
    recs.push(rec);
    let overflow = recs.len().saturating_sub(100);
    if overflow > 0 {
        recs.drain(0..overflow);
    }
}

/// CDP WS에 붙어 Network.enable 후 이벤트를 녹화로 변환한다. WS가 닫히면(브라우저 종료) 반환.
pub async fn run_ws_session(ws_url: &str) -> Result<(), String> {
    let (mut ws, _) = tokio_tungstenite::connect_async(ws_url)
        .await
        .map_err(|e| format!("CDP 연결 실패: {e}"))?;
    ws.send(Message::Text(r#"{"id":1,"method":"Network.enable"}"#.into()))
        .await
        .map_err(|e| format!("Network.enable 실패: {e}"))?;
    let mut tracker = CaptureTracker::new();
    while let Some(msg) = ws.next().await {
        let Ok(Message::Text(text)) = msg else { continue };
        let out = tracker.on_message(&text);
        for cmd in out.commands {
            if ws.send(Message::Text(cmd.into())).await.is_err() {
                return Ok(()); // 전송 실패 = 연결 종료
            }
        }
        for rec in out.records {
            push_capture_record(rec);
        }
    }
    Ok(())
}
```

주의: `while let Some(msg)`의 `let Ok(Message::Text(..)) else continue` 패턴은 Err(연결 끊김)도 continue하므로 무한 루프가 되지 않는지 확인 — `ws.next()`는 연결 종료 시 `None`을 반환하므로 루프가 끝난다. Err 프레임 뒤에도 스트림은 곧 None이 된다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd apps/desktop/src-tauri && cargo test browser_capture`
Expected: 10개 테스트 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/browser_capture.rs
git commit -m "기능: CDP WS 세션 펌프 + 가짜 CDP 서버 통합 테스트(실Chrome 불필요)"
```

---

### Task 4: Tauri 커맨드 4개 + lib.rs 등록 + 종료 정리

**Files:**
- Modify: `apps/desktop/src-tauri/src/browser_capture.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

Chrome 기동은 실제 브라우저가 필요해 자동 테스트 불가(스펙의 테스트 전략대로 수동 검증). 커맨드 자체는 컴파일 + 기존 테스트 무파손으로 확인한다.

- [ ] **Step 1: 전역 핸들과 커맨드 구현** (browser_capture.rs에 추가)

```rust
use std::sync::atomic::{AtomicU64, Ordering};

/// 실행 중 캡처: 자식 Chrome 프로세스 + 세션 id(오래된 WS 태스크가 새 세션을 끄지 않게).
struct RunningCapture {
    session: u64,
    child: tokio::process::Child,
}

static CAPTURE_HANDLE: OnceLock<Mutex<Option<RunningCapture>>> = OnceLock::new();
fn capture_handle() -> &'static Mutex<Option<RunningCapture>> {
    CAPTURE_HANDLE.get_or_init(|| Mutex::new(None))
}

static SESSION_SEQ: AtomicU64 = AtomicU64::new(1);

/// Chrome 종료 + 핸들 정리. WS 태스크는 연결이 끊기며 스스로 끝난다.
pub(crate) fn stop_capture_internal() {
    if let Some(mut running) = capture_handle().lock().unwrap().take() {
        let _ = running.child.start_kill();
    }
}

/// WS가 끊겼을 때(사용자가 Chrome 창을 닫음) 해당 세션이 아직 현재 세션이면 정리.
fn stop_if_session(session: u64) {
    let mut guard = capture_handle().lock().unwrap();
    if guard.as_ref().map(|r| r.session) == Some(session) {
        if let Some(mut running) = guard.take() {
            let _ = running.child.start_kill();
        }
    }
}

#[tauri::command]
pub async fn capture_start(start_url: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    stop_capture_internal();
    if start_url.trim().is_empty() {
        return Err("시작 URL이 비어 있습니다".into());
    }
    let chrome = find_chrome().ok_or_else(|| {
        format!(
            "Chrome을 찾을 수 없습니다. 탐색한 경로:\n{}",
            chrome_candidates()
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join("\n")
        )
    })?;
    let profile = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("capture-profile");
    let port = pick_free_port(9222, 9322)?;
    let mut child = tokio::process::Command::new(&chrome)
        .args(chrome_args(port, &profile.display().to_string(), &start_url))
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Chrome 기동 실패: {e}"))?;

    // CDP 포트가 열릴 때까지 폴링(최대 10초)
    let http = reqwest::Client::new();
    let version_url = format!("http://127.0.0.1:{port}/json/version");
    let mut up = false;
    for _ in 0..20 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if http.get(&version_url).send().await.is_ok() {
            up = true;
            break;
        }
    }
    if !up {
        let _ = child.start_kill();
        return Err("CDP 디버깅 포트가 10초 내에 열리지 않았습니다".into());
    }
    let list = http
        .get(format!("http://127.0.0.1:{port}/json/list"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let Some(ws_url) = parse_page_ws_url(&list) else {
        let _ = child.start_kill();
        return Err("캡처할 페이지 탭을 찾지 못했습니다".into());
    };

    capture_recordings_store().lock().unwrap().clear();
    let session = SESSION_SEQ.fetch_add(1, Ordering::SeqCst);
    // 핸들을 먼저 저장한 뒤 태스크 기동(즉시 끊겨도 stop_if_session이 정리하도록)
    *capture_handle().lock().unwrap() = Some(RunningCapture { session, child });
    tokio::spawn(async move {
        if let Err(e) = run_ws_session(&ws_url).await {
            eprintln!("[browser_capture] {e}");
        }
        stop_if_session(session); // 브라우저 창이 닫히면 자동 중지
    });
    Ok(())
}

#[tauri::command]
pub async fn capture_stop() -> Result<(), String> {
    stop_capture_internal();
    Ok(())
}

#[tauri::command]
pub fn capture_recordings() -> Vec<ProxyRecord> {
    capture_recordings_store().lock().unwrap().clone()
}

#[tauri::command]
pub fn capture_status() -> bool {
    capture_handle().lock().unwrap().is_some()
}
```

- [ ] **Step 2: lib.rs 등록** — `invoke_handler`의 `proxy_server::proxy_recordings` 뒤에 추가:

```rust
            browser_capture::capture_start,
            browser_capture::capture_stop,
            browser_capture::capture_recordings,
            browser_capture::capture_status
```

종료 정리(249-250행 근처, `stop_proxy_internal()` 호출 옆):

```rust
                browser_capture::stop_capture_internal();
```

- [ ] **Step 3: 전체 Rust 테스트 + 컴파일 확인**

Run: `cd apps/desktop/src-tauri && cargo test`
Expected: 기존 + 신규 전체 PASS, warning 없음

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/browser_capture.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "기능: 브라우저 캡처 Tauri 커맨드(start/stop/recordings/status) — Chrome 기동·CDP 폴링·자동 중지"
```

---

### Task 5: 프론트 capture-client.ts

**Files:**
- Create: `apps/desktop/src/core/capture-client.ts`
- Create: `apps/desktop/src/core/capture-client.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// src/core/capture-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));

import { startCapture, stopCapture, getCaptureRecordings, getCaptureStatus } from "./capture-client";

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

describe("capture-client", () => {
  it("startCapture는 capture_start에 startUrl을 전달한다", async () => {
    await startCapture("https://svc.example.com");
    expect(invokeMock).toHaveBeenCalledWith("capture_start", { startUrl: "https://svc.example.com" });
  });

  it("stopCapture는 capture_stop을 호출한다", async () => {
    await stopCapture();
    expect(invokeMock).toHaveBeenCalledWith("capture_stop");
  });

  it("getCaptureRecordings는 녹화 배열을 반환한다", async () => {
    invokeMock.mockResolvedValue([{ atMs: 1, method: "GET", path: "/x", status: 200, responseBody: "{}" }]);
    const recs = await getCaptureRecordings();
    expect(invokeMock).toHaveBeenCalledWith("capture_recordings");
    expect(recs).toHaveLength(1);
  });

  it("getCaptureStatus는 실행 여부를 반환한다", async () => {
    invokeMock.mockResolvedValue(true);
    expect(await getCaptureStatus()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("capture_status");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/capture-client.test.ts`
Expected: FAIL — `./capture-client` 모듈 없음

- [ ] **Step 3: 구현**

```typescript
// src/core/capture-client.ts
// 브라우저(CDP) 캡처 Tauri command 호출 래퍼. proxy-client.ts와 동일 패턴.
import { invoke } from "@tauri-apps/api/core";
import type { ProxyRecord } from "./proxy-client";

/** 전용 Chrome 기동 + CDP 캡처 시작. Chrome 미발견/기동 실패 시 메시지와 함께 throw. */
export async function startCapture(startUrl: string): Promise<void> {
  await invoke("capture_start", { startUrl });
}

export async function stopCapture(): Promise<void> {
  await invoke("capture_stop");
}

export async function getCaptureRecordings(): Promise<ProxyRecord[]> {
  return invoke<ProxyRecord[]>("capture_recordings");
}

/** 사용자가 Chrome 창을 직접 닫으면 백엔드가 자동 중지하므로 UI 재동기화에 사용. */
export async function getCaptureStatus(): Promise<boolean> {
  return invoke<boolean>("capture_status");
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd apps/desktop && npx vitest run src/core/capture-client.test.ts`
Expected: 4개 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/core/capture-client.ts apps/desktop/src/core/capture-client.test.ts
git commit -m "기능: capture-client — 브라우저 캡처 커맨드 래퍼 4개"
```

---

### Task 6: stripBasePath + 매칭 폴백

**Files:**
- Modify: `apps/desktop/src/core/proxy-to-mock.ts`
- Modify: `apps/desktop/src/core/proxy-to-mock.test.ts`

브라우저 캡처 path는 실제 호스트의 절대 경로라 baseURL에 경로 접두사가 있으면(`https://host/api`) 스펙 매칭이 어긋난다. 원본 path로 먼저 매칭하고, 실패하면 접두사를 뗀 path로 재시도한다(프록시 녹화는 원본 매칭이 먼저 성공하므로 영향 없음).

- [ ] **Step 1: 실패하는 테스트 추가** (proxy-to-mock.test.ts에 — 기존 테스트의 spec 픽스처 생성 패턴을 따른다)

```typescript
describe("stripBasePath", () => {
  it("baseUrl의 path 접두사를 제거한다", () => {
    expect(stripBasePath("/api/v1/pets/42", "https://host.com/api/v1")).toBe("/pets/42");
    expect(stripBasePath("/api/v1", "https://host.com/api/v1")).toBe("/");
  });

  it("접두사가 아니면 원본 그대로", () => {
    expect(stripBasePath("/other/pets", "https://host.com/api/v1")).toBe("/other/pets");
    expect(stripBasePath("/api/v1extra/x", "https://host.com/api/v1")).toBe("/api/v1extra/x");
  });

  it("baseUrl에 경로가 없거나 URL이 아니면 원본 그대로", () => {
    expect(stripBasePath("/pets", "https://host.com")).toBe("/pets");
    expect(stripBasePath("/pets", "not a url")).toBe("/pets");
  });
});

describe("recordingToMock baseUrl 폴백", () => {
  it("절대 경로 녹화도 baseUrl 접두사를 떼고 매칭한다", () => {
    // 기존 테스트와 동일한 방식의 spec 픽스처: GET /pets operation 1개
    const spec = makeSpec([{ id: "getPets", method: "get", path: "/pets" }]);
    const record: ProxyRecord = {
      atMs: 1, method: "GET", path: "/api/v1/pets?limit=2", status: 200, responseBody: "[]",
    };
    expect(recordingToMock(spec, record)).toBeNull(); // baseUrl 없으면 종전대로 실패
    const target = recordingToMock(spec, record, "https://host.com/api/v1");
    expect(target?.opId).toBe("getPets");
  });
});
```

(주의: `makeSpec`은 기존 proxy-to-mock.test.ts 안의 spec 픽스처 헬퍼를 그대로 사용한다. 이름이 다르면 기존 것을 따르고, 없으면 기존 테스트가 spec을 만드는 코드를 함수로 추출해 재사용한다. import에 `stripBasePath` 추가.)

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/core/proxy-to-mock.test.ts`
Expected: FAIL — `stripBasePath` export 없음

- [ ] **Step 3: 구현** (proxy-to-mock.ts)

```typescript
/** baseUrl의 path 접두사를 제거. 브라우저 캡처 녹화는 실제 호스트의 절대 경로라
 *  스펙 매칭 전에 보정이 필요하다. 접두사가 아니거나 baseUrl이 URL이 아니면 원본 그대로. */
export function stripBasePath(path: string, baseUrl: string): string {
  let prefix: string;
  try {
    prefix = new URL(baseUrl).pathname;
  } catch {
    return path;
  }
  prefix = prefix.replace(/\/+$/, "");
  if (!prefix) return path;
  if (path === prefix) return "/";
  if (path.startsWith(prefix + "/") || path.startsWith(prefix + "?")) return path.slice(prefix.length);
  return path;
}
```

`recordingToMock` 수정 — 시그니처에 `baseUrl?: string` 추가, 매칭 폴백:

```typescript
/** 녹화를 매칭 operation의 Mock 대상으로 변환. 응답이 JSON 배열이면 dataset, 객체면 body,
 *  그 외(JSON 아님)면 원문 문자열을 body로. 매칭 operation 없으면 null.
 *  baseUrl을 주면 원본 path 매칭 실패 시 base path 접두사를 떼고 재시도(브라우저 캡처용). */
export function recordingToMock(spec: ParsedSpec, record: ProxyRecord, baseUrl?: string): MockTarget | null {
  let op = matchOperation(spec, record.method, record.path);
  if (!op && baseUrl) op = matchOperation(spec, record.method, stripBasePath(record.path, baseUrl));
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

`recordingsToMocks` 수정 — `baseUrl?: string` 추가, 내부 호출에 전달:

```typescript
export function recordingsToMocks(spec: ParsedSpec, records: ProxyRecord[], baseUrl?: string): BulkMockResult {
  // ... 기존 본문에서 recordingToMock(spec, record) → recordingToMock(spec, record, baseUrl)
}
```

- [ ] **Step 4: 통과 + 기존 테스트 무파손 확인**

Run: `cd apps/desktop && npx vitest run src/core/proxy-to-mock.test.ts`
Expected: 전체 PASS (기존 테스트 포함)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/core/proxy-to-mock.ts apps/desktop/src/core/proxy-to-mock.test.ts
git commit -m "기능: stripBasePath + 매칭 폴백 — 브라우저 캡처의 절대 경로를 스펙에 매칭"
```

---

### Task 7: ProxyModal 모드 전환 UI

**Files:**
- Modify: `apps/desktop/src/components/ProxyModal.tsx`
- Modify: `apps/desktop/src/components/ProxyModal.test.tsx`
- Modify: `apps/desktop/src/App.css`

- [ ] **Step 1: 실패하는 테스트 추가** (ProxyModal.test.tsx 끝에)

```typescript
describe("ProxyModal 브라우저 모드", () => {
  it("브라우저 탭 클릭 시 시작 URL 입력과 시작 버튼을 표시한다", async () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    expect(screen.getByPlaceholderText("https://service.example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: "시작" })).toBeTruthy();
  });

  it("브라우저 모드 시작 시 capture_start를 호출하고 녹화를 폴링한다", async () => {
    const recs: ProxyRecord[] = [
      { atMs: 1, method: "GET", path: "/api/pets", status: 200, responseBody: "[]" },
    ];
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "capture_recordings") return recs;
      if (cmd === "capture_status") return true;
      return undefined;
    });
    const onSend = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("capture_start", expect.objectContaining({ startUrl: "https://api.example.com" })),
    );
    const btn = await screen.findByRole("button", { name: "Mock으로" });
    fireEvent.click(btn);
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ path: "/api/pets" }));
  });

  it("브라우저 모드 중지 시 capture_stop을 호출한다", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "capture_status") return true;
      if (cmd === "capture_recordings") return [];
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    const stop = await screen.findByRole("button", { name: "중지" });
    fireEvent.click(stop);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("capture_stop"));
  });

  it("Chrome 미발견 등 시작 실패 메시지를 표시한다", async () => {
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "capture_start") throw new Error("Chrome을 찾을 수 없습니다");
      if (cmd === "capture_status") return false;
      if (cmd === "capture_recordings") return [];
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(await screen.findByText(/Chrome을 찾을 수 없습니다/)).toBeTruthy();
  });

  it("status가 false로 바뀌면(창 닫힘) 실행 표시가 사라진다", async () => {
    let status = true;
    invokeMock.mockImplementation(async (cmd: unknown) => {
      if (cmd === "capture_status") return status;
      if (cmd === "capture_recordings") return [];
      return undefined;
    });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "브라우저" }));
    fireEvent.click(screen.getByRole("button", { name: "시작" }));
    await screen.findByRole("button", { name: "중지" });
    status = false; // 사용자가 Chrome 창을 닫음
    expect(await screen.findByRole("button", { name: "시작" }, { timeout: 3000 })).toBeTruthy();
  });
});
```

(주의: 기존 `beforeEach`의 기본 mockImplementation에 `if (cmd === "capture_status") return false;`와 `if (cmd === "capture_recordings") return [];`를 추가해 마운트 시 재동기화 호출이 안전하게 떨어지게 한다.)

- [ ] **Step 2: 실패 확인**

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx`
Expected: 신규 5개 FAIL ("브라우저" 버튼 없음), 기존은 PASS

- [ ] **Step 3: ProxyModal.tsx 수정** — 전체 교체본:

```tsx
// src/components/ProxyModal.tsx
// 프록시/브라우저 녹화 모달.
// - 프록시: 타깃으로 포워딩하며 녹화 (OAuth 리다이렉트가 있는 서비스는 우회됨)
// - 브라우저: 전용 Chrome을 CDP로 띄워 XHR/Fetch를 녹화 (Okta 등 로그인 흐름 대응)
import { useEffect, useRef, useState } from "react";
import { startProxy, stopProxy, getRecordings, type ProxyRecord } from "../core/proxy-client";
import { startCapture, stopCapture, getCaptureRecordings, getCaptureStatus } from "../core/capture-client";
import { methodColor } from "./method";
import { CloseCircleIcon, CopyIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";
import type { NetworkSettings } from "../core/types";

interface Props {
  defaultTarget: string;
  /** 앱 네트워크 설정(SSL 검증 끄기 등) — 포워딩에 적용 */
  net?: Partial<NetworkSettings>;
  /** 녹화를 Mock으로 변환 요청(App이 매칭·저장). 성공 메시지/실패는 App이 결정 → 결과 문자열 반환 */
  onSendToMock: (record: ProxyRecord) => string;
  /** 녹화 전체를 Mock으로 일괄 저장(App이 매칭·저장). 결과 메시지 반환 */
  onSendAllToMock: (records: ProxyRecord[]) => string;
  onClose: () => void;
}

const DEFAULT_PORT = 9091;
type Mode = "proxy" | "browser";

export function ProxyModal({ defaultTarget, net, onSendToMock, onSendAllToMock, onClose }: Props) {
  useEscToClose(onClose);
  const [mode, setMode] = useState<Mode>("proxy");
  // 프록시 모드 상태
  const [target, setTarget] = useState(defaultTarget);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [running, setRunning] = useState(false);
  const [boundPort, setBoundPort] = useState(0);
  const [records, setRecords] = useState<ProxyRecord[]>([]);
  // 브라우저 모드 상태
  const [startUrl, setStartUrl] = useState(defaultTarget);
  const [capRunning, setCapRunning] = useState(false);
  const [capRecords, setCapRecords] = useState<ProxyRecord[]>([]);
  // 공용
  const [error, setError] = useState<string | null>(null);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 마운트 시 캡처 상태 재동기화(모달을 닫았다 열어도 Chrome이 떠있을 수 있음) + 보존된 녹화 로드
  useEffect(() => {
    getCaptureStatus().then((s) => setCapRunning(!!s)).catch(() => {});
    getCaptureRecordings().then((r) => setCapRecords(r ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!running) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    getRecordings().then(setRecords).catch(() => {});
    pollRef.current = setInterval(() => {
      getRecordings().then(setRecords).catch(() => {});
    }, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running]);

  useEffect(() => {
    if (!capRunning) {
      if (capPollRef.current) clearInterval(capPollRef.current);
      return;
    }
    getCaptureRecordings().then((r) => setCapRecords(r ?? [])).catch(() => {});
    capPollRef.current = setInterval(() => {
      getCaptureRecordings().then((r) => setCapRecords(r ?? [])).catch(() => {});
      // 사용자가 Chrome 창을 직접 닫으면 백엔드가 자동 중지 → UI 반영
      getCaptureStatus().then((s) => { if (!s) setCapRunning(false); }).catch(() => {});
    }, 1000);
    return () => {
      if (capPollRef.current) clearInterval(capPollRef.current);
    };
  }, [capRunning]);

  const toggle = async () => {
    setError(null);
    if (running) {
      await stopProxy();
      setRunning(false);
      return;
    }
    try {
      const bp = await startProxy(target, port, net);
      setBoundPort(bp);
      setRunning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes("PORT_IN_USE") ? `포트 ${port}이(가) 사용 중입니다 (예: ${port + 1})` : `시작 실패: ${msg}`);
    }
  };

  const toggleCapture = async () => {
    setError(null);
    if (capRunning) {
      await stopCapture().catch(() => {});
      setCapRunning(false);
      return;
    }
    try {
      await startCapture(startUrl);
      setCapRunning(true);
    } catch (e) {
      setError(`시작 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const baseUrl = `http://localhost:${boundPort}`;
  const isBrowser = mode === "browser";
  const shownRecords = isBrowser ? capRecords : records;
  const activeRunning = isBrowser ? capRunning : running;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal proxy-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            {isBrowser ? "브라우저 녹화" : "프록시 녹화"}
            {activeRunning && <span className="proxy-running"> 실행 중{!isBrowser && ` — ${baseUrl}`}</span>}
          </h3>
          <button className="icon-btn" onClick={onClose} title="닫기"><CloseCircleIcon size={18} /></button>
        </div>
        <div className="modal-body proxy-body">
          <div className="proxy-mode-tabs">
            <button className={!isBrowser ? "btn small primary" : "btn small"} onClick={() => setMode("proxy")}>프록시</button>
            <button className={isBrowser ? "btn small primary" : "btn small"} onClick={() => setMode("browser")}>브라우저</button>
          </div>
          {!isBrowser && (
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
          )}
          {isBrowser && (
            <div className="proxy-control">
              <label className="config-field">
                <span className="config-label">시작 URL</span>
                <input value={startUrl} disabled={capRunning} onChange={(e) => setStartUrl(e.target.value)}
                  placeholder="https://service.example.com" spellCheck={false} style={{ minWidth: 280 }} />
              </label>
              <button className={capRunning ? "btn small" : "btn small primary"} disabled={!startUrl.trim()} onClick={toggleCapture}>
                {capRunning ? "중지" : "시작"}
              </button>
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
          {sendMsg && <div className="proxy-sendmsg">{sendMsg}</div>}
          <div className="proxy-records">
            {shownRecords.length === 0 && (
              <div className="hint">
                {isBrowser
                  ? capRunning
                    ? "Chrome 창에서 서비스를 사용하면 API 호출(XHR/fetch)이 여기에 녹화됩니다"
                    : "시작하면 전용 Chrome이 열립니다 (로그인 세션은 다음 녹화에 재사용)"
                  : running
                    ? `${baseUrl} 로 호출하면 여기에 녹화됩니다`
                    : "시작 후 프록시로 호출하세요"}
              </div>
            )}
            {shownRecords.length > 0 && (
              <div className="proxy-bulk-row">
                <button className="btn small" onClick={() => setSendMsg(onSendAllToMock(shownRecords))}>
                  전체 Mock으로
                </button>
              </div>
            )}
            {[...shownRecords].reverse().map((r, i) => (
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

- [ ] **Step 4: App.css에 탭 스타일 추가** (`.proxy-body` 정의 근처)

```css
.proxy-mode-tabs { display: flex; gap: 6px; margin-bottom: 4px; }
```

- [ ] **Step 5: 기존 beforeEach 보강 + 전체 통과 확인**

기존 `beforeEach` mockImplementation에 추가:

```typescript
    if (cmd === "capture_status") return false;
    if (cmd === "capture_recordings") return [];
```

Run: `cd apps/desktop && npx vitest run src/components/ProxyModal.test.tsx`
Expected: 기존 + 신규 전체 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/ProxyModal.tsx apps/desktop/src/components/ProxyModal.test.tsx apps/desktop/src/App.css
git commit -m "기능: ProxyModal 브라우저 모드 — 전용 Chrome CDP 녹화 시작/중지·상태 재동기화·녹화 공유 UI"
```

---

### Task 8: App.tsx 연결 + 전체 검증

**Files:**
- Modify: `apps/desktop/src/App.tsx:262-286`

- [ ] **Step 1: 핸들러에 baseURL 전달** (262행 `sendRecordingToMock`, 274행 `sendAllRecordingsToMock`)

```typescript
    const target = recordingToMock(spec, record, baseURL);
```

```typescript
    const { targets, unmatched, failed } = recordingsToMocks(spec, records, baseURL);
```

- [ ] **Step 2: 전체 검증**

Run: `cd apps/desktop && npm test && npm run typecheck && npm run lint`
Expected: 전체 PASS, 타입/린트 에러 없음

Run: `cd apps/desktop/src-tauri && cargo test`
Expected: 전체 PASS

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "기능: Mock 변환에 baseURL 전달 — 브라우저 캡처 절대 경로 매칭 연결"
```

---

### Task 9: 수동 검증 (데스크톱 앱)

자동화 불가 영역(실제 Chrome 기동). 데스크톱 앱을 빌드해 확인한다.

- [ ] **Step 1: 앱 실행**

Run: `cd apps/desktop && npm run tauri dev`

- [ ] **Step 2: 시나리오 확인** (사용자 또는 로컬에서)

1. 상단바 프록시 버튼 → 모달 → "브라우저" 탭 → 시작 URL 입력 → 시작
2. 전용 Chrome 창이 뜨고 시작 URL이 열리는지
3. 페이지에서 API를 호출하면(개발자도구 Network의 XHR과 동일 건) 모달 리스트에 녹화되는지
4. "Mock으로"/"전체 Mock으로"가 스펙 매칭·저장되는지
5. Chrome 창을 직접 닫으면 모달이 몇 초 내 "시작" 상태로 돌아오는지
6. 재시작 시 이전 로그인 세션(쿠키)이 유지되는지 — **Okta 시나리오는 사내망에서 사용자 확인 필요**

- [ ] **Step 3: 결과를 사용자에게 보고** — Okta 실검증은 사내망 필요하므로 사용자 확인 후 릴리스 진행

---

## Self-Review 결과

- **스펙 커버리지**: Chrome 기동/탐지(T1·T4), CDP 세션·XHR 필터(T2·T3), 커맨드 4개·종료 정리(T4), 클라이언트 래퍼(T5), stripBasePath(T6), 모달 모드 UI·상태 재동기화·창닫힘 처리(T7), baseURL 연결(T8), 수동 검증(T9). 스펙의 "에러 처리" 표 5건 모두 T4·T7에 구현 위치 존재.
- **의존성 메모**: 스펙은 tokio-tungstenite 1개만 언급했으나 futures-util(WS Stream/Sink 어댑터)·base64(본문 디코드)가 추가로 필요 — 둘 다 이미 Cargo.lock에 전이 의존성으로 존재해 실질 증가 없음.
- **타입 일관성**: ProxyRecord(Rust camelCase 직렬화 ↔ TS 인터페이스) 기존 타입 재사용으로 일치. 커맨드 인자 `startUrl` ↔ Rust `start_url`(Tauri 자동 변환) 일치.
