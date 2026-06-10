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
