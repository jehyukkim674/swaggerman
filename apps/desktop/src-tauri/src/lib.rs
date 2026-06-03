mod ai;
mod global_shortcut;
mod mock_server;

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use reqwest_cookie_store::{CookieStore, CookieStoreMutex};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormPart {
    name: String,
    #[serde(default)]
    value: Option<String>,
    /// 파일 업로드 시 로컬 경로(있으면 멀티파트 파일 파트로 전송).
    #[serde(default)]
    file_path: Option<String>,
    #[serde(default)]
    content_type: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpRequestArgs {
    method: String,
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
    /// form 파트(있으면 body 대신 사용). multipart=true면 multipart/form-data, 아니면 urlencoded.
    #[serde(default)]
    form: Option<Vec<FormPart>>,
    #[serde(default)]
    multipart: Option<bool>,
    /// 인증서 검증 무시(자체 서명 등).
    #[serde(default)]
    insecure: Option<bool>,
    /// 프록시 URL(예: http://127.0.0.1:8888).
    #[serde(default)]
    proxy: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResult {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
    duration_ms: u64,
    size: usize,
}

/// 세션 동안 공유되는 쿠키 저장소(요청 간 Set-Cookie 자동 유지, 조회/삭제 가능).
static COOKIE_STORE: OnceLock<Arc<CookieStoreMutex>> = OnceLock::new();
fn cookie_store() -> Arc<CookieStoreMutex> {
    COOKIE_STORE
        .get_or_init(|| Arc::new(CookieStoreMutex::new(CookieStore::default())))
        .clone()
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CookieInfo {
    name: String,
    value: String,
    domain: String,
    path: String,
}

/// 저장된 모든 쿠키를 조회한다.
#[tauri::command]
fn list_cookies() -> Vec<CookieInfo> {
    let store = cookie_store();
    let guard = store.lock().unwrap();
    guard
        .iter_any()
        .map(|c| CookieInfo {
            name: c.name().to_string(),
            value: c.value().to_string(),
            domain: c.domain().unwrap_or("").to_string(),
            path: c.path().unwrap_or("").to_string(),
        })
        .collect()
}

/// 저장된 쿠키를 모두 삭제한다.
#[tauri::command]
fn clear_cookies() {
    let store = cookie_store();
    store.lock().unwrap().clear();
}

/// 텍스트 파일을 읽는다(컬렉션 import 용).
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("파일 읽기 실패({path}): {e}"))
}

/// 텍스트 파일을 쓴다(컬렉션 export 용).
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("파일 쓰기 실패({path}): {e}"))
}

/// 임의 호스트로 HTTP 요청을 보낸다(웹뷰 CORS/스코프 제약 없음 — API 클라이언트 목적).
#[tauri::command]
async fn http_request(args: HttpRequestArgs) -> Result<HttpResult, String> {
    let start = Instant::now();

    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_millis(args.timeout_ms.unwrap_or(30_000)))
        .user_agent("SwaggerManDesktop/0.2")
        .cookie_provider(cookie_store());

    if args.insecure.unwrap_or(false) {
        builder = builder.danger_accept_invalid_certs(true);
    }
    if let Some(proxy) = args.proxy.as_ref().filter(|s| !s.is_empty()) {
        builder = builder
            .proxy(reqwest::Proxy::all(proxy).map_err(|e| format!("프록시 설정 오류: {e}"))?);
    }

    let client = builder.build().map_err(|e| e.to_string())?;

    let method = reqwest::Method::from_bytes(args.method.to_uppercase().as_bytes())
        .map_err(|e| format!("잘못된 메서드: {e}"))?;

    // 헤더 이름은 ASCII 토큰만 유효하므로, 파싱 불가한 헤더(예: 한글 이름)는 건너뛴다.
    // (값은 UTF-8 바이트 허용) — 잘못된 헤더 하나로 요청 전체가 실패("builder error")하지 않도록.
    let mut header_map = reqwest::header::HeaderMap::new();
    for (key, value) in &args.headers {
        if key.is_empty() {
            continue;
        }
        if let (Ok(name), Ok(val)) = (
            reqwest::header::HeaderName::from_bytes(key.as_bytes()),
            reqwest::header::HeaderValue::from_bytes(value.as_bytes()),
        ) {
            header_map.insert(name, val);
        }
    }
    let mut request = client.request(method, &args.url).headers(header_map);

    // body 우선순위: form 파트 > raw body
    if let Some(parts) = args.form {
        if args.multipart.unwrap_or(false) {
            let mut form = reqwest::multipart::Form::new();
            for p in parts {
                if let Some(path) = p.file_path.as_ref().filter(|s| !s.is_empty()) {
                    let bytes =
                        std::fs::read(path).map_err(|e| format!("파일 읽기 실패({path}): {e}"))?;
                    let filename = std::path::Path::new(path)
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("file")
                        .to_string();
                    let mut part = reqwest::multipart::Part::bytes(bytes).file_name(filename);
                    if let Some(ct) = p.content_type.as_ref().filter(|s| !s.is_empty()) {
                        part = part
                            .mime_str(ct)
                            .map_err(|e| format!("content-type 오류: {e}"))?;
                    }
                    form = form.part(p.name, part);
                } else {
                    form = form.text(p.name, p.value.unwrap_or_default());
                }
            }
            request = request.multipart(form);
        } else {
            let pairs: Vec<(String, String)> = parts
                .into_iter()
                .map(|p| (p.name, p.value.unwrap_or_default()))
                .collect();
            request = request.form(&pairs);
        }
    } else if let Some(body) = args.body {
        if !body.is_empty() {
            request = request.body(body);
        }
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();

    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            headers.insert(key.to_string(), value.to_string());
        }
    }

    let body = response.text().await.map_err(|e| e.to_string())?;
    let size = body.len();

    Ok(HttpResult {
        status,
        headers,
        body,
        duration_ms: start.elapsed().as_millis() as u64,
        size,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    // 자동 업데이트 + 전역 단축키(데스크톱 전용)
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_global_shortcut::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            http_request,
            list_cookies,
            clear_cookies,
            read_text_file,
            write_text_file,
            ai::ai_detect,
            ai::ai_complete,
            ai::ai_chat,
            ai::ai_cancel,
            mock_server::mock_start,
            mock_server::mock_stop,
            mock_server::mock_status,
            global_shortcut::register_global_shortcut,
            global_shortcut::unregister_global_shortcut
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // 앱 종료 시 mock 서버 정리 (포트 점유 방지)
            if matches!(event, tauri::RunEvent::Exit) {
                mock_server::stop_server_internal();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

    /// 요청 1건을 받아 캡처하고 고정 응답을 돌려주는 일회용 HTTP 서버.
    fn spawn_server(response: &'static str) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buf = vec![0u8; 16384];
                let n = stream.read(&mut buf).unwrap_or(0);
                let _ = tx.send(String::from_utf8_lossy(&buf[..n]).to_string());
                let _ = stream.write_all(response.as_bytes());
            }
        });
        (format!("http://{addr}/"), rx)
    }

    const OK_RESP: &str = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok";

    fn args(url: String) -> HttpRequestArgs {
        HttpRequestArgs {
            method: "POST".into(),
            url,
            headers: HashMap::new(),
            body: None,
            timeout_ms: Some(5000),
            form: None,
            multipart: None,
            insecure: None,
            proxy: None,
        }
    }

    #[tokio::test]
    async fn raw_body_and_header_are_sent() {
        let (url, rx) = spawn_server(OK_RESP);
        let mut a = args(url);
        a.headers.insert("X-Test".into(), "hello".into());
        a.body = Some("{\"a\":1}".into());
        let res = http_request(a).await.unwrap();
        assert_eq!(res.status, 200);
        assert_eq!(res.body, "ok");
        let captured = rx.recv_timeout(Duration::from_secs(3)).unwrap();
        assert!(captured.contains("x-test: hello") || captured.contains("X-Test: hello"));
        assert!(captured.contains("{\"a\":1}"));
    }

    #[tokio::test]
    async fn urlencoded_form_sets_content_type() {
        let (url, rx) = spawn_server(OK_RESP);
        let mut a = args(url);
        a.form = Some(vec![
            FormPart { name: "a".into(), value: Some("1".into()), file_path: None, content_type: None },
            FormPart { name: "b".into(), value: Some("x y".into()), file_path: None, content_type: None },
        ]);
        a.multipart = Some(false);
        let res = http_request(a).await.unwrap();
        assert_eq!(res.status, 200);
        let captured = rx.recv_timeout(Duration::from_secs(3)).unwrap().to_lowercase();
        assert!(captured.contains("content-type: application/x-www-form-urlencoded"));
        assert!(captured.contains("a=1"));
        assert!(captured.contains("b=x+y"));
    }

    #[tokio::test]
    async fn multipart_includes_file_part() {
        let dir = std::env::temp_dir();
        let path = dir.join("swaggerman_test_upload.txt");
        std::fs::write(&path, b"FILEDATA").unwrap();
        let (url, rx) = spawn_server(OK_RESP);
        let mut a = args(url);
        a.form = Some(vec![FormPart {
            name: "file".into(),
            value: None,
            file_path: Some(path.to_string_lossy().to_string()),
            content_type: Some("text/plain".into()),
        }]);
        a.multipart = Some(true);
        let res = http_request(a).await.unwrap();
        assert_eq!(res.status, 200);
        let captured = rx.recv_timeout(Duration::from_secs(3)).unwrap();
        assert!(captured.to_lowercase().contains("content-type: multipart/form-data"));
        assert!(captured.contains("name=\"file\""));
        assert!(captured.contains("swaggerman_test_upload.txt"));
        assert!(captured.contains("FILEDATA"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn read_write_text_file_roundtrip() {
        let path = std::env::temp_dir()
            .join("swaggerman_rw_test.json")
            .to_string_lossy()
            .to_string();
        write_text_file(path.clone(), "{\"x\":1}".into()).unwrap();
        assert_eq!(read_text_file(path.clone()).unwrap(), "{\"x\":1}");
        let _ = std::fs::remove_file(&path);
    }

    /// 요청 `count`건을 받아 각 요청을 캡처하고 매번 동일 응답을 반환.
    fn spawn_server_multi(response: &'static str, count: usize) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut served = 0;
            for stream in listener.incoming() {
                let mut s = match stream {
                    Ok(s) => s,
                    Err(_) => break,
                };
                let mut buf = vec![0u8; 8192];
                let n = s.read(&mut buf).unwrap_or(0);
                let _ = tx.send(String::from_utf8_lossy(&buf[..n]).to_string());
                let _ = s.write_all(response.as_bytes());
                served += 1;
                if served >= count {
                    break;
                }
            }
        });
        (format!("http://{addr}/"), rx)
    }

    #[tokio::test]
    async fn cookie_jar_persists_and_clears() {
        clear_cookies();
        let resp = "HTTP/1.1 200 OK\r\nSet-Cookie: sid=abc; Path=/\r\nContent-Length: 2\r\n\r\nok";
        let (url, rx) = spawn_server_multi(resp, 2);

        // 1st: Set-Cookie 수신
        http_request(args(url.clone())).await.unwrap();
        let cookies = list_cookies();
        assert!(
            cookies.iter().any(|c| c.name == "sid" && c.value == "abc"),
            "쿠키 저장 실패: {cookies:?}"
        );

        // 2nd: 저장된 쿠키가 자동 첨부되는지
        http_request(args(url)).await.unwrap();
        let _first = rx.recv_timeout(Duration::from_secs(3)).unwrap();
        let second = rx.recv_timeout(Duration::from_secs(3)).unwrap().to_lowercase();
        assert!(second.contains("cookie: sid=abc"), "쿠키 미첨부: {second}");

        // clear 후 비어있는지
        clear_cookies();
        assert!(list_cookies().iter().all(|c| c.name != "sid"));
    }
}
