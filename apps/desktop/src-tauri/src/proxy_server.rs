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

/// CORS credentials echo를 허용할 Origin인지 — localhost 계열만.
/// (임의 사이트가 녹화 중인 프록시로 쿠키 포함 요청을 보내 읽는 것을 차단)
fn is_local_origin(origin: &axum::http::HeaderValue) -> bool {
    let Ok(s) = origin.to_str() else { return false };
    let rest = match s.split_once("://") {
        Some((_, r)) => r,
        None => return false,
    };
    let host = if rest.starts_with('[') {
        match rest.find(']') {
            Some(i) => &rest[..=i],
            None => return false,
        }
    } else {
        rest.split(':').next().unwrap_or("")
    };
    matches!(host.to_ascii_lowercase().as_str(), "localhost" | "127.0.0.1" | "[::1]")
}

/// localhost 계열 Origin이면 echo + credentials, 그 외/없음은 `*`(credentials 없음 → 브라우저가 쿠키 요청 차단).
fn cors_headers(resp: &mut axum::http::HeaderMap, origin: Option<&axum::http::HeaderValue>) {
    match origin.filter(|o| is_local_origin(o)) {
        Some(o) => {
            resp.insert("Access-Control-Allow-Origin", o.clone());
            resp.insert("Access-Control-Allow-Credentials", "true".parse().unwrap());
            resp.insert("Vary", "Origin".parse().unwrap());
        }
        None => {
            resp.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
        }
    }
    resp.insert("Access-Control-Allow-Methods", "*".parse().unwrap());
}

/// 클라이언트로 그대로 보내지 않을 응답 헤더.
/// hop-by-hop + 본문 변형으로 무효(content-length/encoding) + CORS는 자체 계산.
fn skip_response_header(name: &str) -> bool {
    matches!(
        name,
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailers"
            | "transfer-encoding"
            | "upgrade"
            | "content-length"
            | "content-encoding"
    ) || name.starts_with("access-control-")
}

async fn forward_handler(
    State(st): State<ProxyState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> axum::response::Response {
    let origin = headers.get("origin").cloned();

    // OPTIONS preflight: 요청한 헤더·메서드를 echo(없으면 *)
    // credentials 모드에서 '*'는 와일드카드가 아닌 리터럴이므로 메서드도 echo해야 한다.
    if method == Method::OPTIONS {
        let mut resp = (axum::http::StatusCode::NO_CONTENT).into_response();
        let allow_headers = headers
            .get("access-control-request-headers")
            .cloned()
            .unwrap_or_else(|| "*".parse().unwrap());
        cors_headers(resp.headers_mut(), origin.as_ref());
        resp.headers_mut().insert("Access-Control-Allow-Headers", allow_headers);
        let allow_methods = headers
            .get("access-control-request-method")
            .cloned()
            .unwrap_or_else(|| "*".parse().unwrap());
        resp.headers_mut().insert("Access-Control-Allow-Methods", allow_methods);
        return resp;
    }

    let path = uri.path().to_string();
    let url = build_forward_url(&st.target, &path, uri.query());

    let rmethod =
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap_or(reqwest::Method::GET);
    let mut req = st.client.request(rmethod, &url).body(body.to_vec());
    // host 제외(타깃이 자기 호스트를 받도록), accept-encoding 제외(본문을 text로 다루므로
    // reqwest가 직접 gzip을 협상·해제하게 둔다 — 클라이언트 값(br/zstd)을 넘기면 본문이 깨진다)
    for (k, v) in headers.iter() {
        let name = k.as_str();
        if name.eq_ignore_ascii_case("host") || name.eq_ignore_ascii_case("accept-encoding") {
            continue;
        }
        if let Ok(val) = v.to_str() {
            req = req.header(name, val);
        }
    }

    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            // 본문 소비 전에 패스스루 응답 헤더를 수집·재작성.
            // is_append: Set-Cookie만 다중 값이라 append, 나머지는 insert(axum 기본 Content-Type 대체).
            let mut passthrough: Vec<(String, String, bool)> = Vec::new();
            for (k, v) in res.headers() {
                let name = k.as_str(); // reqwest는 소문자 보장
                if skip_response_header(name) {
                    continue;
                }
                let Ok(val) = v.to_str() else { continue };
                match name {
                    "set-cookie" => passthrough.push((name.into(), rewrite_set_cookie(val), true)),
                    "location" => passthrough.push((
                        name.into(),
                        rewrite_location(val, &st.target, st.bound_port),
                        false,
                    )),
                    _ => passthrough.push((name.into(), val.to_string(), false)),
                }
            }
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
            for (name, val, is_append) in passthrough {
                let Ok(n) = axum::http::HeaderName::from_bytes(name.as_bytes()) else { continue };
                let Ok(v) = val.parse::<axum::http::HeaderValue>() else { continue };
                if is_append {
                    resp.headers_mut().append(n, v);
                } else {
                    resp.headers_mut().insert(n, v);
                }
            }
            cors_headers(resp.headers_mut(), origin.as_ref());
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
            cors_headers(resp.headers_mut(), origin.as_ref());
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

    /// 쿠키·리다이렉트가 추적 없이 그대로 전달되고(Set-Cookie 재작성), CORS가 Origin echo인지 확인.
    #[tokio::test]
    async fn proxy_passes_cookies_redirect_and_cors() {
        use axum::routing::get;

        let target_app = Router::new().route(
            "/login",
            get(|| async {
                axum::http::Response::builder()
                    .status(302)
                    .header("Set-Cookie", "sid=abc; Domain=.api.test; Secure; Path=/; HttpOnly; SameSite=None")
                    .header("Set-Cookie", "csrf=xyz; Path=/")
                    .header("Location", "/home")
                    .body(axum::body::Body::empty())
                    .unwrap()
            }),
        );
        let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target_port = target_listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            axum::serve(target_listener, target_app).await.unwrap();
        });

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
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        // 테스트 클라이언트도 리다이렉트를 따라가지 않게 해서 302를 그대로 관찰
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let resp = client
            .get(format!("http://127.0.0.1:{proxy_port}/login"))
            .header("Origin", "http://localhost:5173")
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 302, "리다이렉트가 추적되지 않고 그대로 와야 한다");
        let cookies: Vec<String> = resp
            .headers()
            .get_all("set-cookie")
            .iter()
            .map(|v| v.to_str().unwrap().to_string())
            .collect();
        assert_eq!(
            cookies,
            vec!["sid=abc; Path=/; HttpOnly".to_string(), "csrf=xyz; Path=/".to_string()],
            "Set-Cookie 다중 값이 재작성되어 모두 전달돼야 한다"
        );
        assert_eq!(resp.headers().get("location").unwrap(), "/home", "상대 Location은 그대로");
        assert_eq!(
            resp.headers().get("access-control-allow-origin").unwrap(),
            "http://localhost:5173",
            "Origin이 있으면 echo"
        );
        assert_eq!(resp.headers().get("access-control-allow-credentials").unwrap(), "true");
    }

    /// credentials 모드에서 Allow-Methods '*'는 리터럴이므로 요청 메서드를 echo해야 한다.
    #[tokio::test]
    async fn preflight_echoes_requested_method_for_credentials() {
        let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_port = proxy_listener.local_addr().unwrap().port();
        let state = ProxyState {
            target: Arc::new("http://127.0.0.1:1".into()), // OPTIONS는 포워딩 전 반환되므로 무관
            client: build_forward_client(false, None, 30_000).unwrap(),
            bound_port: proxy_port,
        };
        let proxy_app = Router::new().fallback(forward_handler).with_state(state);
        tokio::spawn(async move {
            axum::serve(proxy_listener, proxy_app).await.unwrap();
        });
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let client = reqwest::Client::new();
        let resp = client
            .request(reqwest::Method::OPTIONS, format!("http://127.0.0.1:{proxy_port}/api/x"))
            .header("Origin", "http://localhost:5173")
            .header("Access-Control-Request-Method", "PUT")
            .header("Access-Control-Request-Headers", "content-type")
            .send()
            .await
            .unwrap();
        assert_eq!(resp.status().as_u16(), 204);
        assert_eq!(resp.headers().get("access-control-allow-methods").unwrap(), "PUT");
        assert_eq!(resp.headers().get("access-control-allow-headers").unwrap(), "content-type");
        assert_eq!(resp.headers().get("access-control-allow-credentials").unwrap(), "true");
    }

    #[test]
    fn local_origin_allowlist() {
        let hv = |s: &str| s.parse::<axum::http::HeaderValue>().unwrap();
        assert!(is_local_origin(&hv("http://localhost:5173")));
        assert!(is_local_origin(&hv("http://127.0.0.1:3000")));
        assert!(is_local_origin(&hv("http://[::1]:8080")));
        assert!(!is_local_origin(&hv("https://evil.example")));
        assert!(!is_local_origin(&hv("https://localhost.evil.example")));
        assert!(!is_local_origin(&hv("null")));
    }

    /// 절대 URL Location이 타깃 접두사면 프록시 주소로 재작성되는지 확인.
    #[tokio::test]
    async fn proxy_rewrites_absolute_location_to_proxy() {
        use axum::routing::get;

        let target_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let target_port = target_listener.local_addr().unwrap().port();
        let loc = format!("http://127.0.0.1:{target_port}/next");
        let target_app = Router::new().route(
            "/go",
            get(move || {
                let loc = loc.clone();
                async move {
                    axum::http::Response::builder()
                        .status(302)
                        .header("Location", loc)
                        .body(axum::body::Body::empty())
                        .unwrap()
                }
            }),
        );
        tokio::spawn(async move {
            axum::serve(target_listener, target_app).await.unwrap();
        });

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
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let resp = client
            .get(format!("http://127.0.0.1:{proxy_port}/go"))
            .send()
            .await
            .unwrap();
        assert_eq!(
            resp.headers().get("location").unwrap().to_str().unwrap(),
            format!("http://localhost:{proxy_port}/next"),
            "타깃 내부 리다이렉트는 프록시 주소로 재작성"
        );
    }
}
