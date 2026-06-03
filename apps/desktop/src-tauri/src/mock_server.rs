//! Mock HTTP 서버 — axum 기반 경로 매칭·페이징·단건 조회·CORS·요청 로그
//!
//! TS 측에서 전달한 MockRoute 배열을 받아 실제 HTTP 서버를 구동한다.
//! 외부 클라이언트(브라우저/앱)가 localhost:PORT 로 호출하면 응답을 돌려준다.

use axum::{
    body::Body,
    extract::{Request, State},
    http::{HeaderValue, Method, StatusCode},
    response::Response,
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::oneshot;

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────

/// TS MockRoute 인터페이스와 1:1 대응 (camelCase JSON).
#[derive(Clone, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MockRoute {
    pub method: String,
    /// 경로 템플릿 — `{x}` 형태의 파라미터 포함 가능 (예: `/pets/{petId}`)
    pub path: String,
    pub status: u16,
    #[serde(default)]
    pub dataset: Option<Vec<Value>>,
    #[serde(default)]
    pub body: Option<Value>,
    #[serde(default)]
    pub delay_ms: u64,
    /// 단건 조회 시 아이템의 id 필드명
    #[serde(default)]
    pub id_field: Option<String>,
    /// 목록 응답 래퍼 키 (예: `"content"`)
    #[serde(default)]
    pub list_wrapper: Option<String>,
}

/// mock_start 에 전달되는 설정
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockConfig {
    pub port: u16,
    pub routes: Vec<MockRoute>,
}

/// 요청 로그 1건
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MockLogEntry {
    pub at_ms: u64,
    pub method: String,
    pub path: String,
    pub status: u16,
}

/// mock_status 응답
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MockStatus {
    pub running: bool,
    pub port: u16,
    pub logs: Vec<MockLogEntry>,
}

// ─────────────────────────────────────────────
// 전역 상태 (OnceLock + Mutex)
// ─────────────────────────────────────────────

/// 현재 실행 중인 서버 핸들
struct RunningServer {
    /// graceful shutdown 트리거
    shutdown_tx: Option<oneshot::Sender<()>>,
    /// 바인딩된 포트
    port: u16,
}

static SERVER_HANDLE: OnceLock<Mutex<Option<RunningServer>>> = OnceLock::new();
fn server_handle() -> &'static Mutex<Option<RunningServer>> {
    SERVER_HANDLE.get_or_init(|| Mutex::new(None))
}

static REQUEST_LOG: OnceLock<Mutex<Vec<MockLogEntry>>> = OnceLock::new();
fn request_log() -> &'static Mutex<Vec<MockLogEntry>> {
    REQUEST_LOG.get_or_init(|| Mutex::new(Vec::new()))
}

// ─────────────────────────────────────────────
// 순수 함수 (단위 테스트 가능, HTTP와 분리)
// ─────────────────────────────────────────────

/// 경로 템플릿(`/pets/{id}`)과 실제 경로(`/pets/3`)를 비교한다.
/// 매칭 성공 시 `Some(캡처된 파라미터 값 배열)` 반환, 실패 시 `None`.
/// 세그먼트 수가 다르면 무조건 `None`.
pub fn match_path(template: &str, actual: &str) -> Option<Vec<String>> {
    // 쿼리스트링 제거
    let actual = actual.split('?').next().unwrap_or(actual);

    let tmpl_segs: Vec<&str> = template.split('/').filter(|s| !s.is_empty()).collect();
    let real_segs: Vec<&str> = actual.split('/').filter(|s| !s.is_empty()).collect();

    if tmpl_segs.len() != real_segs.len() {
        return None;
    }

    let mut params = Vec::new();
    for (t, r) in tmpl_segs.iter().zip(real_segs.iter()) {
        if t.starts_with('{') && t.ends_with('}') {
            // 와일드카드 세그먼트 — 파라미터 값 캡처
            params.push((*r).to_string());
        } else if *t != *r {
            return None;
        }
    }
    Some(params)
}

/// `page`(0-base) + `size` 또는 `offset` + `limit` 쿼리 파라미터로 페이징을 적용한다.
/// 둘 다 없으면 `None`, 있으면 `Some((슬라이스, page, size))` 반환.
pub fn paginate(
    dataset: &[Value],
    query: &HashMap<String, String>,
) -> Option<(Vec<Value>, usize, usize)> {
    if let (Some(page_str), Some(size_str)) = (query.get("page"), query.get("size")) {
        let page: usize = page_str.parse().unwrap_or(0);
        let size: usize = size_str.parse().unwrap_or(20).max(1);
        let start = page * size;
        let end = (start + size).min(dataset.len());
        let items = if start >= dataset.len() {
            vec![]
        } else {
            dataset[start..end].to_vec()
        };
        return Some((items, page, size));
    }
    if let (Some(offset_str), Some(limit_str)) = (query.get("offset"), query.get("limit")) {
        let offset: usize = offset_str.parse().unwrap_or(0);
        let limit: usize = limit_str.parse().unwrap_or(20).max(1);
        let end = (offset + limit).min(dataset.len());
        let items = if offset >= dataset.len() {
            vec![]
        } else {
            dataset[offset..end].to_vec()
        };
        // offset/limit → page/size 로 변환하여 반환
        let page = offset.checked_div(limit).unwrap_or(0);
        return Some((items, page, limit));
    }
    None
}

/// 라우트 정보·경로 파라미터·쿼리맵으로 최종 응답 `(status, body)` 를 결정한다.
pub fn build_response(
    route: &MockRoute,
    path_params: &[String],
    query: &HashMap<String, String>,
) -> (u16, Value) {
    // ① dataset + id_field + 경로 파라미터 → 단건 조회
    if let (Some(dataset), Some(id_field)) = (&route.dataset, &route.id_field) {
        if let Some(id_val) = path_params.last() {
            // id_field 값이 마지막 경로 파라미터와 일치하는 아이템을 찾는다
            let found = dataset.iter().find(|item| {
                item.get(id_field)
                    .map(|v| match v {
                        Value::String(s) => s == id_val,
                        Value::Number(n) => n.to_string() == id_val.as_str(),
                        // bool/null 등: JSON 직렬화 문자열과 비교
                        #[allow(clippy::cmp_owned)]
                        other => other.to_string() == id_val.as_str(),
                    })
                    .unwrap_or(false)
            });
            return match found {
                Some(item) => (route.status, item.clone()),
                None => (404, json!({"error": "not found"})),
            };
        }
    }

    // ② dataset만 있으면 → 목록 응답 (페이징 + 래퍼 적용)
    if let Some(dataset) = &route.dataset {
        let total = dataset.len();

        let (items, page, size) = if let Some(paged) = paginate(dataset, query) {
            paged
        } else {
            (dataset.clone(), 0, dataset.len().max(1))
        };

        let body = if let Some(wrapper) = &route.list_wrapper {
            let total_pages = total.div_ceil(size);
            json!({
                wrapper: items,
                "totalElements": total,
                "totalPages": total_pages,
                "page": page,
                "size": size,
            })
        } else {
            Value::Array(items)
        };

        return (route.status, body);
    }

    // ③ 그 외 → 고정 body 또는 {"ok": true}
    let body = route.body.clone().unwrap_or_else(|| json!({"ok": true}));
    (route.status, body)
}

// ─────────────────────────────────────────────
// axum 서버 내부 구조
// ─────────────────────────────────────────────

/// 핸들러에서 공유하는 앱 상태
#[derive(Clone)]
struct AppState {
    routes: Vec<MockRoute>,
}

/// 모든 요청을 받아 라우트 테이블과 매칭하는 fallback 핸들러
async fn fallback_handler(
    State(state): State<AppState>,
    req: Request<Body>,
) -> Response {
    let method = req.method().clone();
    let uri = req.uri().clone();
    let path = uri.path().to_string();
    let query_str = uri.query().unwrap_or("").to_string();

    // CORS preflight — OPTIONS 는 204로 즉시 응답
    if method == Method::OPTIONS {
        return build_cors_response(StatusCode::NO_CONTENT, Value::Null);
    }

    // 쿼리 파라미터 파싱
    let query: HashMap<String, String> = query_str
        .split('&')
        .filter(|s| !s.is_empty())
        .filter_map(|pair| {
            let mut it = pair.splitn(2, '=');
            let k = it.next()?.to_string();
            let v = it.next().unwrap_or("").to_string();
            // URL 디코딩은 생략 — 테스트 범위 밖
            Some((k, v))
        })
        .collect();

    // 메서드 + 경로 매칭
    let matched = state.routes.iter().find_map(|route| {
        if route.method.to_uppercase() != method.as_str() {
            return None;
        }
        let params = match_path(&route.path, &path)?;
        Some((route.clone(), params))
    });

    let (status_code, body_val, delay_ms) = match matched {
        Some((route, params)) => {
            let delay = route.delay_ms;
            let (status, body) = build_response(&route, &params, &query);
            (status, body, delay)
        }
        None => (404, json!({"error": "no mock route"}), 0),
    };

    // 딜레이 적용
    if delay_ms > 0 {
        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
    }

    // 로그 기록 (최근 200개 유지)
    {
        let at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let mut log = request_log().lock().unwrap();
        log.push(MockLogEntry {
            at_ms,
            method: method.to_string(),
            path: path.clone(),
            status: status_code,
        });
        if log.len() > 200 {
            let drain_to = log.len() - 200;
            log.drain(..drain_to);
        }
    }

    build_cors_response(
        StatusCode::from_u16(status_code).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
        body_val,
    )
}

/// CORS 헤더가 포함된 JSON 응답을 생성한다.
fn build_cors_response(status: StatusCode, body: Value) -> Response {
    let body_bytes = if body.is_null() {
        String::new()
    } else {
        body.to_string()
    };

    let mut resp = Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .header(
            "access-control-allow-origin",
            HeaderValue::from_static("*"),
        )
        .header(
            "access-control-allow-methods",
            HeaderValue::from_static("*"),
        )
        .header(
            "access-control-allow-headers",
            HeaderValue::from_static("*"),
        )
        .body(Body::from(body_bytes))
        .unwrap();

    // OPTIONS 는 body 없이
    if status == StatusCode::NO_CONTENT {
        *resp.body_mut() = Body::empty();
    }

    resp
}

// ─────────────────────────────────────────────
// Tauri 커맨드
// ─────────────────────────────────────────────

/// Mock 서버를 시작하고 바인딩된 포트를 반환한다.
/// 이미 실행 중이면 먼저 중지한 뒤 재시작한다.
#[tauri::command]
pub async fn mock_start(config: MockConfig) -> Result<u16, String> {
    // 이미 실행 중이면 먼저 중지
    stop_server_internal();

    // TcpListener 바인딩
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", config.port))
        .await
        .map_err(|e| format!("PORT_IN_USE: {e}"))?;

    let bound_port = listener.local_addr().map_err(|e| e.to_string())?.port();

    // graceful shutdown 채널
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    // axum 앱 구성
    let state = AppState {
        routes: config.routes,
    };
    let app = Router::new()
        .fallback(fallback_handler)
        .with_state(state);

    // 서버 핸들 저장
    {
        let mut handle = server_handle().lock().unwrap();
        *handle = Some(RunningServer {
            shutdown_tx: Some(shutdown_tx),
            port: bound_port,
        });
    }

    // 요청 로그 초기화
    request_log().lock().unwrap().clear();

    // 서버를 별도 태스크로 실행
    tokio::spawn(async move {
        let serve = axum::serve(listener, app).with_graceful_shutdown(async {
            let _ = shutdown_rx.await;
        });
        if let Err(e) = serve.await {
            eprintln!("[mock_server] 서버 오류: {e}");
        }
    });

    Ok(bound_port)
}

/// 실행 중인 Mock 서버를 중지한다.
/// 실행 중이 아니어도 오류 없이 반환한다.
#[tauri::command]
pub async fn mock_stop() -> Result<(), String> {
    stop_server_internal();
    Ok(())
}

/// 현재 Mock 서버 상태(실행 여부·포트·로그)를 반환한다.
#[tauri::command]
pub fn mock_status() -> MockStatus {
    let handle = server_handle().lock().unwrap();
    let (running, port) = match handle.as_ref() {
        Some(s) => (true, s.port),
        None => (false, 0),
    };
    let logs = request_log().lock().unwrap().clone();
    MockStatus { running, port, logs }
}

/// 서버를 중지하는 내부 함수 (비동기 아님).
/// lib.rs의 Tauri RunEvent::Exit 훅에서 호출해 포트 점유를 방지한다.
pub(crate) fn stop_server_internal() {
    let mut handle = server_handle().lock().unwrap();
    if let Some(server) = handle.take() {
        if let Some(tx) = server.shutdown_tx {
            let _ = tx.send(());
        }
    }
}

// ─────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ── TS ↔ Rust IPC 직렬화 경계 테스트 ──────────────────────
    // (UI E2E를 대신하는 검증: TS mock-client/mock-config가 보내는/받는
    //  JSON 모양이 Rust serde 타입과 정확히 호환되는지 고정한다)

    #[test]
    fn mock_config_deserializes_ts_camelcase_json() {
        // TS buildMockRoutes → startMockServer가 보내는 실제 JSON 형태 (camelCase)
        let ts_json = r#"{
            "port": 9090,
            "routes": [
                {
                    "method": "GET",
                    "path": "/pets/{petId}",
                    "status": 200,
                    "dataset": [{"id": 1, "name": "코코"}],
                    "delayMs": 100,
                    "idField": "petId",
                    "listWrapper": "content"
                },
                {
                    "method": "POST",
                    "path": "/pets",
                    "status": 201,
                    "body": {"ok": true},
                    "delayMs": 0
                }
            ]
        }"#;
        let config: MockConfig = serde_json::from_str(ts_json).expect("TS JSON 역직렬화 실패");
        assert_eq!(config.port, 9090);
        assert_eq!(config.routes.len(), 2);
        let r0 = &config.routes[0];
        assert_eq!(r0.delay_ms, 100);
        assert_eq!(r0.id_field.as_deref(), Some("petId"));
        assert_eq!(r0.list_wrapper.as_deref(), Some("content"));
        assert_eq!(r0.dataset.as_ref().unwrap()[0]["name"], "코코");
        let r1 = &config.routes[1];
        assert_eq!(r1.status, 201);
        assert!(r1.dataset.is_none());
        assert_eq!(r1.body.as_ref().unwrap()["ok"], true);
    }

    #[test]
    fn mock_status_serializes_to_ts_camelcase() {
        // Rust mock_status() 응답 → TS MockStatus 인터페이스(camelCase 필드)와 일치해야 함
        let status = MockStatus {
            running: true,
            port: 9090,
            logs: vec![MockLogEntry {
                at_ms: 1717000000000,
                method: "GET".into(),
                path: "/pets".into(),
                status: 200,
            }],
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["running"], true);
        assert_eq!(json["port"], 9090);
        // TS 인터페이스 필드명: atMs (snake_case at_ms가 아니어야 함)
        assert_eq!(json["logs"][0]["atMs"], 1717000000000u64);
        assert!(json["logs"][0].get("at_ms").is_none());
    }

    // ── match_path 테스트 ──────────────────────

    #[test]
    fn match_path_exact() {
        // 파라미터 없는 정확 매칭
        assert_eq!(match_path("/pets", "/pets"), Some(vec![]));
    }

    #[test]
    fn match_path_single_param() {
        // 파라미터 1개 추출
        assert_eq!(
            match_path("/pets/{id}", "/pets/42"),
            Some(vec!["42".to_string()])
        );
    }

    #[test]
    fn match_path_two_params() {
        // 파라미터 2개 추출
        assert_eq!(
            match_path("/users/{uid}/posts/{pid}", "/users/1/posts/99"),
            Some(vec!["1".to_string(), "99".to_string()])
        );
    }

    #[test]
    fn match_path_mismatch() {
        // 리터럴 세그먼트 불일치 → None
        assert_eq!(match_path("/cats/{id}", "/dogs/42"), None);
    }

    #[test]
    fn match_path_segment_count_diff() {
        // 세그먼트 수 차이 → None
        assert_eq!(match_path("/pets/{id}", "/pets/42/extra"), None);
    }

    #[test]
    fn match_path_with_query_string() {
        // 쿼리스트링은 무시하고 매칭
        assert_eq!(
            match_path("/pets/{id}", "/pets/7?foo=bar"),
            Some(vec!["7".to_string()])
        );
    }

    // ── 목록 응답 테스트 ──────────────────────

    #[test]
    fn list_no_paging_returns_all() {
        let route = MockRoute {
            method: "GET".into(),
            path: "/items".into(),
            status: 200,
            dataset: Some(vec![json!({"id":1}), json!({"id":2}), json!({"id":3})]),
            body: None,
            delay_ms: 0,
            id_field: None,
            list_wrapper: None,
        };
        let query = HashMap::new();
        let (status, body) = build_response(&route, &[], &query);
        assert_eq!(status, 200);
        let arr = body.as_array().unwrap();
        assert_eq!(arr.len(), 3);
    }

    // ── 페이징 테스트 ──────────────────────────

    #[test]
    fn paginate_page1_size3_returns_correct_slice() {
        let dataset: Vec<Value> = (0..10).map(|i| json!({"n": i})).collect();
        let mut query = HashMap::new();
        query.insert("page".into(), "1".into());
        query.insert("size".into(), "3".into());
        let (items, page, size) = paginate(&dataset, &query).unwrap();
        // page=1, size=3 → 인덱스 3·4·5
        assert_eq!(page, 1);
        assert_eq!(size, 3);
        assert_eq!(items.len(), 3);
        assert_eq!(items[0]["n"], 3);
    }

    // ── 래퍼 테스트 ──────────────────────────

    #[test]
    fn list_wrapper_includes_meta() {
        let items: Vec<Value> = (0..5).map(|i| json!({"id": i})).collect();
        let route = MockRoute {
            method: "GET".into(),
            path: "/items".into(),
            status: 200,
            dataset: Some(items),
            body: None,
            delay_ms: 0,
            id_field: None,
            list_wrapper: Some("content".into()),
        };
        let mut query = HashMap::new();
        query.insert("page".into(), "0".into());
        query.insert("size".into(), "2".into());
        let (status, body) = build_response(&route, &[], &query);
        assert_eq!(status, 200);
        assert!(body["content"].is_array());
        assert_eq!(body["totalElements"], 5);
        assert_eq!(body["totalPages"], 3);
        assert_eq!(body["page"], 0);
        assert_eq!(body["size"], 2);
    }

    // ── 단건 조회 테스트 ──────────────────────

    #[test]
    fn single_item_id_match_found() {
        let route = MockRoute {
            method: "GET".into(),
            path: "/pets/{id}".into(),
            status: 200,
            dataset: Some(vec![
                json!({"petId": "1", "name": "Fido"}),
                json!({"petId": "2", "name": "Rex"}),
            ]),
            body: None,
            delay_ms: 0,
            id_field: Some("petId".into()),
            list_wrapper: None,
        };
        let query = HashMap::new();
        let (status, body) = build_response(&route, &["2".to_string()], &query);
        assert_eq!(status, 200);
        assert_eq!(body["name"], "Rex");
    }

    #[test]
    fn single_item_id_not_found_returns_404() {
        let route = MockRoute {
            method: "GET".into(),
            path: "/pets/{id}".into(),
            status: 200,
            dataset: Some(vec![json!({"petId": "1", "name": "Fido"})]),
            body: None,
            delay_ms: 0,
            id_field: Some("petId".into()),
            list_wrapper: None,
        };
        let query = HashMap::new();
        let (status, body) = build_response(&route, &["99".to_string()], &query);
        assert_eq!(status, 404);
        assert_eq!(body["error"], "not found");
    }

    // ── 고정 body 테스트 ──────────────────────

    #[test]
    fn fixed_body_post_201() {
        let route = MockRoute {
            method: "POST".into(),
            path: "/pets".into(),
            status: 201,
            dataset: None,
            body: Some(json!({"id": 100, "created": true})),
            delay_ms: 0,
            id_field: None,
            list_wrapper: None,
        };
        let query = HashMap::new();
        let (status, body) = build_response(&route, &[], &query);
        assert_eq!(status, 201);
        assert_eq!(body["created"], true);
        assert_eq!(body["id"], 100);
    }

    // ── 통합 테스트 (실제 HTTP 서버) ─────────
    // 주의: mock 서버는 전역 싱글톤(SERVER_HANDLE)이라 서버를 띄우는 tokio 테스트가
    // 병렬로 돌면 서로의 서버를 중지시켜 깨진다. 라이프사이클 검증은 모두
    // 이 테스트 하나에서 순차로 수행한다.

    #[tokio::test]
    async fn integration_start_request_stop() {
        // 포트 0 → OS가 임의 포트 할당
        let config = MockConfig {
            port: 0,
            routes: vec![
                MockRoute {
                    method: "GET".into(),
                    path: "/hello".into(),
                    status: 200,
                    dataset: None,
                    body: Some(json!({"msg": "world"})),
                    delay_ms: 0,
                    id_field: None,
                    list_wrapper: None,
                },
            ],
        };

        let port = mock_start(config).await.expect("서버 시작 실패");
        assert!(port > 0);

        // 상태 확인
        let status = mock_status();
        assert!(status.running);
        assert_eq!(status.port, port);

        // reqwest 로 실제 HTTP 호출
        let client = reqwest::Client::new();
        let url = format!("http://127.0.0.1:{port}/hello");
        let resp = client
            .get(&url)
            .send()
            .await
            .expect("GET 요청 실패");

        assert_eq!(resp.status().as_u16(), 200);

        // CORS 헤더 검증
        let headers = resp.headers().clone();
        assert_eq!(
            headers.get("access-control-allow-origin").and_then(|v| v.to_str().ok()),
            Some("*")
        );

        let text = resp.text().await.expect("본문 읽기 실패");
        let body: Value = serde_json::from_str(&text).expect("JSON 파싱 실패");
        assert_eq!(body["msg"], "world");

        // 로그 기록 확인
        let status2 = mock_status();
        assert!(
            status2.logs.iter().any(|l| l.path == "/hello" && l.status == 200),
            "로그에 /hello 요청이 없음: {:?}",
            status2.logs
        );

        // 서버 중지
        mock_stop().await.expect("서버 중지 실패");

        // 잠깐 대기 후 상태 확인
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        let status3 = mock_status();
        assert!(!status3.running);

        // ── stop_server_internal(pub(crate)) 검증: 재시작 후 동기 정리 호출 ──
        // (앱 종료 시 Tauri RunEvent 훅이 호출하는 경로)
        let port2 = mock_start(MockConfig { port: 0, routes: vec![] })
            .await
            .expect("재시작 실패");
        assert!(port2 > 0);
        assert!(mock_status().running);

        stop_server_internal();
        assert!(
            !mock_status().running,
            "stop_server_internal 후 running이 true"
        );
    }
}
