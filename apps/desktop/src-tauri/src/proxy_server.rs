// 프록시 녹화 서버: 타깃 Base URL로 요청을 투명 포워딩하면서 요청/응답을 녹화한다.
// mock_server.rs의 axum 서버·전역 핸들·graceful shutdown·CORS 패턴을 따른다.
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
    #[allow(dead_code)]
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
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 타깃 base + 경로 + 쿼리로 포워딩 URL을 구성한다. base 끝 슬래시/path 시작 슬래시 중복 정리.
pub fn build_forward_url(target_base: &str, path: &str, query: Option<&str>) -> String {
    let base = target_base.trim_end_matches('/');
    let p = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
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

// ─────────────────────────────────────────────
// axum 포워딩 서버 본체
// ─────────────────────────────────────────────

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
    let rmethod =
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET);
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
                at_ms: now_ms(),
                method: method.to_string(),
                path: path.clone(),
                status,
                response_body: resp_body.clone(),
                error: None,
            });
            let mut resp = (
                axum::http::StatusCode::from_u16(status)
                    .unwrap_or(axum::http::StatusCode::OK),
                resp_body,
            )
                .into_response();
            cors_headers(resp.headers_mut());
            resp
        }
        Err(e) => {
            push_record(ProxyRecord {
                at_ms: now_ms(),
                method: method.to_string(),
                path,
                status: 502,
                response_body: String::new(),
                error: Some(e.to_string()),
            });
            let mut resp = (
                axum::http::StatusCode::BAD_GATEWAY,
                format!("프록시 포워딩 실패: {e}"),
            )
                .into_response();
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
    let bound = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let (tx, rx) = oneshot::channel::<()>();
    let state = ProxyState {
        target: Arc::new(target_base_url),
        client: reqwest::Client::new(),
    };
    let app = Router::new().fallback(forward_handler).with_state(state);
    *proxy_handle().lock().unwrap() = Some(RunningProxy {
        shutdown_tx: Some(tx),
        port: bound,
    });
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

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn forward_url_joins_base_path_query() {
        assert_eq!(
            build_forward_url("https://api.test", "/pet/3", None),
            "https://api.test/pet/3"
        );
        assert_eq!(
            build_forward_url("https://api.test/", "/pet", Some("status=sold")),
            "https://api.test/pet?status=sold"
        );
        assert_eq!(
            build_forward_url("https://api.test", "pet", None),
            "https://api.test/pet"
        );
        assert_eq!(
            build_forward_url("https://api.test", "/pet", Some("")),
            "https://api.test/pet"
        );
    }

    #[test]
    fn recordings_capped_at_100() {
        recordings().lock().unwrap().clear();
        for i in 0..130 {
            push_record(ProxyRecord {
                at_ms: i,
                method: "GET".into(),
                path: format!("/p{i}"),
                status: 200,
                response_body: "{}".into(),
                error: None,
            });
        }
        let recs = recordings().lock().unwrap();
        assert_eq!(recs.len(), 100);
        assert_eq!(recs.first().unwrap().path, "/p30"); // 앞 30개 드레인
    }
}
