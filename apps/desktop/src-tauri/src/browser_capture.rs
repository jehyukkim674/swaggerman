// 브라우저 캡처: 전용 Chrome을 CDP 디버깅 모드로 기동해 Network 이벤트(XHR/Fetch)를 녹화한다.
// proxy_server.rs의 전역 핸들·녹화 저장소(최근 100개) 패턴을 따른다.
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;

use crate::proxy_server::ProxyRecord;

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
/// --remote-allow-origins=*: Chrome 111+가 Origin 불일치 시 DevTools WS 업그레이드를 거부하므로
/// (connect_async는 Origin 헤더를 보내지 않지만 방어적으로) 허용해 둔다.
pub fn chrome_args(port: u16, profile_dir: &str, start_url: &str) -> Vec<String> {
    vec![
        format!("--remote-debugging-port={port}"),
        format!("--user-data-dir={profile_dir}"),
        "--remote-allow-origins=*".into(),
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
            if ws.send(Message::Text(cmd)).await.is_err() {
                return Ok(()); // 전송 실패 = 연결 종료
            }
        }
        for rec in out.records {
            push_capture_record(rec);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chrome_args_include_debug_port_profile_and_url() {
        let args = chrome_args(9222, "/tmp/profile", "https://svc.example.com");
        assert!(args.contains(&"--remote-debugging-port=9222".to_string()));
        assert!(args.contains(&"--user-data-dir=/tmp/profile".to_string()));
        assert!(args.contains(&"--remote-allow-origins=*".to_string()));
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

    /// 가짜 CDP WS 서버에 붙여 XHR 흐름 종단 검증. 실제 Chrome은 CI에서 띄우지 않는다.
    #[tokio::test]
    async fn ws_session_records_xhr_via_fake_cdp() {
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
                let _ = ws.send(Message::Text(resp.to_string())).await;
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
}
