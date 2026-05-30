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

#[derive(Serialize)]
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

    // 자동 업데이트(데스크톱 전용): 릴리스의 서명된 업데이터 아티팩트를 확인/적용.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            http_request,
            list_cookies,
            clear_cookies,
            read_text_file,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
