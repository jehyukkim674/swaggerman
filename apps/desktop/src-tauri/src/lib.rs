use std::collections::HashMap;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpRequestArgs {
    method: String,
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
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

/// 임의 호스트로 HTTP 요청을 보낸다(웹뷰 CORS/스코프 제약 없음 — API 클라이언트 목적).
#[tauri::command]
async fn http_request(args: HttpRequestArgs) -> Result<HttpResult, String> {
    let start = Instant::now();

    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(args.timeout_ms.unwrap_or(30_000)))
        .user_agent("SwaggerManDesktop/0.1")
        .build()
        .map_err(|e| e.to_string())?;

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
    if let Some(body) = args.body {
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
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

    // 자동 업데이트(데스크톱 전용): 릴리스의 서명된 업데이터 아티팩트를 확인/적용.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .invoke_handler(tauri::generate_handler![http_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
