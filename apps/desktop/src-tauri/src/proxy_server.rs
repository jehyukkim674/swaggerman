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

/// Set-Cookie 값을 localhost 프록시용으로 재작성.
/// Domain 제거(타깃 도메인 쿠키는 localhost 응답에서 거부됨),
/// Secure 제거(http://localhost), SameSite=None 제거(None은 Secure 필수라 충돌).
pub fn rewrite_set_cookie(value: &str) -> String {
    value
        .split(';')
        .map(|s| s.trim())
        .filter(|s| {
            let lower = s.to_ascii_lowercase();
            !(lower.starts_with("domain=") || lower == "secure" || lower == "samesite=none")
        })
        .collect::<Vec<_>>()
        .join("; ")
}

/// Location이 타깃 base로 시작하면 프록시 주소로 재작성(내부 리다이렉트가 프록시를 벗어나지 않게).
/// 상대 경로·다른 호스트는 그대로 둔다.
pub fn rewrite_location(value: &str, target_base: &str, bound_port: u16) -> String {
    let base = target_base.trim_end_matches('/');
    match value.strip_prefix(base) {
        Some(rest) if rest.is_empty() || rest.starts_with('/') || rest.starts_with('?') => {
            format!("http://localhost:{bound_port}{rest}")
        }
        _ => value.to_string(),
    }
}

/// 포워딩용 reqwest 클라이언트. 리다이렉트는 추적하지 않는다(클라이언트가 302를 직접 보게).
/// insecure=true면 TLS 검증을 끈다(사내망 MITM CA 대응 — 앱 설정의 'SSL 검증 끄기'와 동일).
fn build_forward_client(
    insecure: bool,
    proxy: Option<&str>,
    timeout_ms: u64,
) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_millis(timeout_ms));
    if insecure {
        builder = builder.danger_accept_invalid_certs(true);
    }
    if let Some(p) = proxy.filter(|s| !s.trim().is_empty()) {
        builder = builder.proxy(reqwest::Proxy::all(p).map_err(|e| format!("프록시 설정 오류: {e}"))?);
    }
    builder.build().map_err(|e| e.to_string())
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
    bound_port: u16,
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
            // 업스트림 Content-Type을 본문 소비 전에 캡처한다.
            let upstream_ct = res
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_owned());
            // 주의: 바이너리/비-UTF8 응답은 text() 디코딩 시 손실될 수 있다.
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
            // 업스트림 Content-Type을 덮어써서 axum 기본값(text/plain)을 방지한다.
            if let Some(ct) = upstream_ct {
                if let Ok(val) = ct.parse::<axum::http::HeaderValue>() {
                    resp.headers_mut()
                        .insert(axum::http::header::CONTENT_TYPE, val);
                }
            }
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
pub async fn proxy_start(
    target_base_url: String,
    port: u16,
    insecure: Option<bool>,
    proxy: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<u16, String> {
    stop_proxy_internal();
    if target_base_url.trim().is_empty() {
        return Err("타깃 Base URL이 비어 있습니다".into());
    }
    let client = build_forward_client(
        insecure.unwrap_or(false),
        proxy.as_deref(),
        timeout_ms.unwrap_or(30_000),
    )?;
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|e| format!("PORT_IN_USE: {e}"))?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (tx, rx) = oneshot::channel::<()>();
    let state = ProxyState {
        target: Arc::new(target_base_url),
        client,
        bound_port: bound,
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

    #[test]
    fn forward_client_builds_with_options() {
        assert!(build_forward_client(true, None, 5_000).is_ok());
        assert!(build_forward_client(false, Some("http://127.0.0.1:8888"), 5_000).is_ok());
        assert!(build_forward_client(false, Some("::이상한값::"), 5_000).is_err());
    }

    #[test]
    fn set_cookie_rewritten_for_localhost() {
        // Domain(도메인 불일치 거부)·Secure(http localhost)·SameSite=None(Secure 필수) 제거
        assert_eq!(
            rewrite_set_cookie("sid=abc; Domain=.okta.com; Path=/; Secure; HttpOnly; SameSite=None"),
            "sid=abc; Path=/; HttpOnly"
        );
        // 그 외 속성은 보존
        assert_eq!(
            rewrite_set_cookie("a=1; Path=/; SameSite=Lax; Max-Age=3600"),
            "a=1; Path=/; SameSite=Lax; Max-Age=3600"
        );
    }

    #[test]
    fn location_rewritten_only_for_target_prefix() {
        assert_eq!(
            rewrite_location("https://api.test/login", "https://api.test", 9091),
            "http://localhost:9091/login"
        );
        // base 끝 슬래시 정리 + 경로 없는 정확 일치
        assert_eq!(
            rewrite_location("https://api.test", "https://api.test/", 9091),
            "http://localhost:9091"
        );
        // 다른 호스트(Okta 등)는 그대로
        assert_eq!(
            rewrite_location("https://acme.okta.com/authorize", "https://api.test", 9091),
            "https://acme.okta.com/authorize"
        );
        // 접두사가 우연히 같은 다른 호스트는 재작성하지 않음
        assert_eq!(
            rewrite_location("https://api.test.evil.com/x", "https://api.test", 9091),
            "https://api.test.evil.com/x"
        );
        // 상대 경로는 그대로
        assert_eq!(rewrite_location("/relative", "https://api.test", 9091), "/relative");
    }

    /// 업스트림이 application/json을 반환하면 프록시 응답에도 content-type이 보존되는지 확인한다.
    #[tokio::test]
    async fn proxy_preserves_upstream_content_type() {
        use axum::routing::get;
        use axum::Json;
        use serde_json::json;

        // ── 타깃 서버(로컬) 구동 ──────────────────────────────────────
        let target_app = Router::new().route(
            "/data",
            get(|| async { Json(json!({"ok": true})) }),
        );
        let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target_port = target_listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            axum::serve(target_listener, target_app).await.unwrap();
        });

        // ── 프록시 서버 구동 ──────────────────────────────────────────
        let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_port = proxy_listener.local_addr().unwrap().port();
        let state = ProxyState {
            target: Arc::new(format!("http://127.0.0.1:{target_port}")),
            client: build_forward_client(false, None, 30_000).unwrap(),
            bound_port: proxy_port,
        };
        let proxy_app = Router::new().fallback(forward_handler).with_state(state);
        tokio::spawn(async move {
            axum::serve(proxy_listener, proxy_app).await.unwrap();
        });

        // 서버가 바인드될 여유를 준다.
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        // ── 프록시를 통해 요청 ────────────────────────────────────────
        let client = reqwest::Client::new();
        let resp = client
            .get(format!("http://127.0.0.1:{proxy_port}/data"))
            .send()
            .await
            .expect("프록시 요청 실패");

        assert_eq!(resp.status().as_u16(), 200);
        let ct = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        assert!(
            ct.contains("application/json"),
            "Content-Type이 application/json이어야 하지만 '{ct}'",
        );
    }
}
