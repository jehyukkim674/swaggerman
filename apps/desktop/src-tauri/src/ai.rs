use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatArgs {
    pub req_id: u32,
    pub prompt: String,
    pub system: String,
    pub model: String,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub claude_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCompleteArgs {
    pub prompt: String,
    pub system: String,
    pub model: String,
    pub schema: String,
    #[serde(default)]
    pub claude_path: Option<String>,
}

// tag="kind"로 변환되고, variant 이름과 내부 필드 모두 camelCase로 직렬화한다.
// (rename_all은 variant 이름만 바꾸므로, session_id→sessionId를 위해
//  rename_all_fields가 필요하다. serde 1.0.157+.) TS AiEvent와 1:1로 맞춘다.
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AiEvent {
    Delta { text: String },
    Done {
        session_id: Option<String>,
        #[serde(default)]
        input_tokens: Option<u64>,
        #[serde(default)]
        output_tokens: Option<u64>,
    },
    Error { message: String },
}

/// 대화용 claude 인자(stream-json 스트리밍). prompt는 stdin으로 주므로 인자에 없다.
pub fn build_chat_args(a: &AiChatArgs) -> Vec<String> {
    let mut v = vec![
        "-p".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--include-partial-messages".into(),
        "--verbose".into(),
        // 도구/에이전트 동작 차단: SwaggerMan은 순수 텍스트 생성만 원한다.
        // (도구를 켜두면 claude가 사용자 환경의 MCP/Bash로 실제 실행을 시도해 느려지고 엉뚱한 응답을 낸다.)
        "--tools".into(),
        "--strict-mcp-config".into(),
        "--model".into(),
        a.model.clone(),
        "--append-system-prompt".into(),
        a.system.clone(),
    ];
    match &a.session_id {
        Some(id) if !id.is_empty() => {
            v.push("--resume".into());
            v.push(id.clone());
        }
        _ => {}
    }
    v
}

/// 단발 구조화 출력용 claude 인자. prompt는 stdin.
pub fn build_complete_args(a: &AiCompleteArgs) -> Vec<String> {
    vec![
        "-p".into(),
        "--output-format".into(),
        "json".into(),
        "--tools".into(),
        "--strict-mcp-config".into(),
        "--model".into(),
        a.model.clone(),
        "--json-schema".into(),
        a.schema.clone(),
        "--append-system-prompt".into(),
        a.system.clone(),
    ]
}

/// claude stream-json 한 줄을 AiEvent로 변환. 무관한 라인은 None.
/// 규칙: partial 텍스트 델타(stream_event/content_block_delta)만 Delta로,
/// 최종 result는 Done(session_id), result.is_error는 Error로 매핑한다.
/// (전체 assistant 메시지 라인은 partial과 중복되므로 무시.)
pub fn parse_stream_line(line: &str) -> Option<AiEvent> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let v: Value = serde_json::from_str(line).ok()?;
    let t = v.get("type")?.as_str()?;
    match t {
        "stream_event" => {
            let ev = v.get("event")?;
            if ev.get("type")?.as_str()? != "content_block_delta" {
                return None;
            }
            let delta = ev.get("delta")?;
            // text_delta만 취한다(thinking 등 제외)
            if delta.get("type").and_then(|x| x.as_str()) == Some("text_delta") {
                let text = delta.get("text")?.as_str()?.to_string();
                return Some(AiEvent::Delta { text });
            }
            None
        }
        "result" => {
            let is_error = v.get("is_error").and_then(|x| x.as_bool()).unwrap_or(false);
            if is_error {
                let msg = v
                    .get("result")
                    .and_then(|x| x.as_str())
                    .unwrap_or("알 수 없는 오류")
                    .to_string();
                return Some(AiEvent::Error { message: msg });
            }
            let session_id = v.get("session_id").and_then(|x| x.as_str()).map(|s| s.to_string());
            let usage = v.get("usage");
            let input_tokens = usage.and_then(|u| u.get("input_tokens")).and_then(|x| x.as_u64());
            let output_tokens = usage.and_then(|u| u.get("output_tokens")).and_then(|x| x.as_u64());
            Some(AiEvent::Done { session_id, input_tokens, output_tokens })
        }
        _ => None,
    }
}

/// 후보 경로 중 실제 존재하는 첫 실행파일을 고른다.
pub fn pick_executable(candidates: &[String]) -> Option<String> {
    candidates
        .iter()
        .find(|p| !p.is_empty() && std::path::Path::new(p).is_file())
        .cloned()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInfo {
    pub path: String,
    pub version: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiDetect {
    pub claude: Option<CliInfo>,
    pub codex: Option<CliInfo>,
}

/// 취소 요청된 req_id 집합.
fn cancelled() -> &'static Mutex<HashSet<u32>> {
    static C: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashSet::new()))
}

fn version_of(path: &str) -> Option<String> {
    let out = std::process::Command::new(path).arg("--version").output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn home() -> String {
    std::env::var("HOME").unwrap_or_default()
}

/// claude/codex 실행파일을 탐지한다(PATH 우선, 알려진 후보 보강).
#[tauri::command]
pub fn ai_detect() -> AiDetect {
    let mut d = AiDetect::default();

    let mut claude_candidates: Vec<String> = vec![];
    if let Ok(p) = which("claude") {
        claude_candidates.push(p);
    }
    claude_candidates.push(format!("{}/.claude/local/claude", home()));
    if let Some(path) = pick_executable(&claude_candidates) {
        if let Some(version) = version_of(&path) {
            d.claude = Some(CliInfo { path, version });
        }
    }

    let mut codex_candidates: Vec<String> = vec![];
    if let Ok(p) = which("codex") {
        codex_candidates.push(p);
    }
    codex_candidates.push("/opt/homebrew/bin/codex".into());
    if let Some(path) = pick_executable(&codex_candidates) {
        if let Some(version) = version_of(&path) {
            d.codex = Some(CliInfo { path, version });
        }
    }
    d
}

/// `which`의 최소 구현(PATH 탐색). 외부 의존성 없이.
fn which(bin: &str) -> Result<String, ()> {
    let path = std::env::var_os("PATH").ok_or(())?;
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join(bin);
        if candidate.is_file() {
            return Ok(candidate.to_string_lossy().into_owned());
        }
    }
    Err(())
}

fn resolve_claude(explicit: &Option<String>) -> Result<String, String> {
    if let Some(p) = explicit.as_ref().filter(|s| !s.is_empty()) {
        return Ok(p.clone());
    }
    ai_detect()
        .claude
        .map(|c| c.path)
        .ok_or_else(|| {
            "claude CLI를 찾을 수 없습니다. PATH에 claude가 있는지 확인하세요(예: `which claude`)."
                .to_string()
        })
}

/// claude --output-format json stdout에서 structured_output 객체가 있으면 그 객체의
/// JSON 문자열을, 없으면 원본을 돌려준다.
pub fn extract_structured(stdout: &str) -> String {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(stdout) {
        if let Some(so) = v.get("structured_output") {
            if so.is_object() {
                if let Ok(s) = serde_json::to_string(so) {
                    return s;
                }
            }
        }
    }
    stdout.to_string()
}

/// 단발 구조화 출력. claude stdout(JSON 문자열)을 그대로 반환.
#[tauri::command]
pub async fn ai_complete(args: AiCompleteArgs) -> Result<String, String> {
    // resolve_claude는 블로킹 I/O(std::process::Command)를 사용하므로 spawn_blocking으로 실행한다.
    let claude_path = args.claude_path.clone();
    let bin = tokio::task::spawn_blocking(move || resolve_claude(&claude_path))
        .await
        .map_err(|e| e.to_string())??;

    let cli_args = build_complete_args(&args);
    let mut child = tokio::process::Command::new(&bin)
        .args(&cli_args)
        .current_dir(std::env::temp_dir())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("claude 실행 실패: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(args.prompt.as_bytes())
            .await
            .map_err(|e| format!("stdin 쓰기 실패: {e}"))?;
        drop(stdin); // EOF
    }

    let out = child.wait_with_output().await.map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("claude 비정상 종료: {}", String::from_utf8_lossy(&out.stderr)));
    }
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    // claude --json-schema 결과는 structured_output(객체)에 담긴다.
    // 있으면 그 객체만 직렬화해 돌려주고, 없으면 원본 stdout을 그대로 반환한다.
    Ok(extract_structured(&stdout))
}

/// 스트리밍 대화. stdout 라인을 파싱해 Channel로 이벤트 전송.
#[tauri::command]
pub async fn ai_chat(args: AiChatArgs, on_event: Channel<AiEvent>) -> Result<(), String> {
    // resolve_claude는 블로킹 I/O(std::process::Command)를 사용하므로 spawn_blocking으로 실행한다.
    let claude_path = args.claude_path.clone();
    let bin = tokio::task::spawn_blocking(move || resolve_claude(&claude_path))
        .await
        .map_err(|e| e.to_string())??;

    let req_id = args.req_id;
    let cli_args = build_chat_args(&args);

    let mut child = tokio::process::Command::new(&bin)
        .args(&cli_args)
        .current_dir(std::env::temp_dir())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("claude 실행 실패: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        if let Err(e) = stdin.write_all(args.prompt.as_bytes()).await {
            let _ = on_event.send(AiEvent::Error { message: format!("stdin 쓰기 실패: {e}") });
            let _ = child.kill().await;
            return Ok(());
        }
        drop(stdin);
    }

    let stdout = child.stdout.take().ok_or("stdout 없음")?;
    // stderr를 동시에 비워 파이프가 가득 차 자식이 막히는 것을 방지한다.
    let stderr_drain = child.stderr.take().map(|err| {
        tokio::spawn(async move {
            let mut reader = BufReader::new(err);
            let mut buf = Vec::new();
            let _ = reader.read_to_end(&mut buf).await;
        })
    });

    let mut lines = BufReader::new(stdout).lines();

    loop {
        // 취소 확인
        if cancelled().lock().unwrap().remove(&req_id) {
            let _ = child.kill().await;
            break;
        }
        match lines.next_line().await {
            Ok(Some(line)) => {
                if let Some(ev) = parse_stream_line(&line) {
                    let _ = on_event.send(ev);
                }
            }
            Ok(None) => break, // EOF
            Err(e) => {
                let _ = on_event.send(AiEvent::Error { message: e.to_string() });
                break;
            }
        }
    }
    let _ = child.wait().await;

    // stderr 드레인 태스크가 완료될 때까지 기다린다.
    if let Some(task) = stderr_drain {
        let _ = task.await;
    }

    // 늦게 도착한 취소 요청이 집합에 남지 않도록 정리한다.
    cancelled().lock().unwrap().remove(&req_id);

    Ok(())
}

/// 진행 중 대화를 취소한다(다음 라인 처리 시 프로세스 kill).
#[tauri::command]
pub fn ai_cancel(req_id: u32) {
    cancelled().lock().unwrap().insert(req_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chat_args(session: Option<&str>) -> AiChatArgs {
        AiChatArgs {
            req_id: 1,
            prompt: "q".into(),
            system: "sys".into(),
            model: "sonnet".into(),
            session_id: session.map(|s| s.to_string()),
            claude_path: None,
        }
    }

    #[test]
    fn chat_args_include_stream_json_and_model() {
        let v = build_chat_args(&chat_args(None));
        assert!(v.contains(&"stream-json".to_string()));
        assert!(v.contains(&"sonnet".to_string()));
        assert!(v.windows(2).any(|w| w[0] == "--model" && w[1] == "sonnet"));
        // 세션 없으면 --resume 없음
        assert!(!v.contains(&"--resume".to_string()));
    }

    #[test]
    fn chat_args_resume_when_session_present() {
        let v = build_chat_args(&chat_args(Some("sess-123")));
        assert!(v.windows(2).any(|w| w[0] == "--resume" && w[1] == "sess-123"));
    }

    #[test]
    fn complete_args_include_json_schema() {
        let a = AiCompleteArgs {
            prompt: "q".into(),
            system: "sys".into(),
            model: "haiku".into(),
            schema: "{\"type\":\"object\"}".into(),
            claude_path: None,
        };
        let v = build_complete_args(&a);
        assert!(v.windows(2).any(|w| w[0] == "--json-schema" && w[1] == "{\"type\":\"object\"}"));
        assert!(v.windows(2).any(|w| w[0] == "--output-format" && w[1] == "json"));
    }

    #[test]
    fn chat_args_disable_tools_and_mcp() {
        let v = build_chat_args(&chat_args(None));
        assert!(v.contains(&"--tools".to_string()));
        assert!(v.contains(&"--strict-mcp-config".to_string()));
        // --tools 바로 뒤가 --strict-mcp-config 여야 빈 도구 목록이 보장된다.
        let i = v.iter().position(|s| s == "--tools").unwrap();
        assert_eq!(v[i + 1], "--strict-mcp-config");
    }

    #[test]
    fn complete_args_disable_tools_and_mcp() {
        let a = AiCompleteArgs {
            prompt: "q".into(), system: "sys".into(), model: "haiku".into(),
            schema: "{}".into(), claude_path: None,
        };
        let v = build_complete_args(&a);
        assert!(v.contains(&"--tools".to_string()));
        assert!(v.contains(&"--strict-mcp-config".to_string()));
        let i = v.iter().position(|s| s == "--tools").unwrap();
        assert_eq!(v[i + 1], "--strict-mcp-config");
    }

    #[test]
    fn parse_partial_text_delta() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"안녕"}}}"#;
        match parse_stream_line(line) {
            Some(AiEvent::Delta { text }) => assert_eq!(text, "안녕"),
            other => panic!("expected delta, got {other:?}"),
        }
    }

    #[test]
    fn parse_result_done_with_session() {
        let line = r#"{"type":"result","is_error":false,"session_id":"abc","result":"hi"}"#;
        match parse_stream_line(line) {
            Some(AiEvent::Done { session_id, .. }) => assert_eq!(session_id.as_deref(), Some("abc")),
            _ => panic!("expected done"),
        }
    }

    #[test]
    fn parse_result_done_extracts_usage_tokens() {
        let line = r#"{"type":"result","is_error":false,"session_id":"s","usage":{"input_tokens":12,"output_tokens":34}}"#;
        match parse_stream_line(line) {
            Some(AiEvent::Done { input_tokens, output_tokens, .. }) => {
                assert_eq!(input_tokens, Some(12));
                assert_eq!(output_tokens, Some(34));
            }
            _ => panic!("expected done with usage"),
        }
    }

    #[test]
    fn parse_result_error() {
        let line = r#"{"type":"result","is_error":true,"result":"boom"}"#;
        match parse_stream_line(line) {
            Some(AiEvent::Error { message }) => assert_eq!(message, "boom"),
            _ => panic!("expected error"),
        }
    }

    #[test]
    fn parse_ignores_unrelated_lines() {
        assert!(parse_stream_line(r#"{"type":"assistant","message":{}}"#).is_none());
        assert!(parse_stream_line("").is_none());
        assert!(parse_stream_line("not json").is_none());
    }

    #[test]
    fn parse_stream_sequence_yields_deltas_then_done_with_usage() {
        let lines = [
            r#"{"type":"system","subtype":"init"}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"안"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"무시"}}}"#,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"녕"}}}"#,
            r#"{"type":"result","is_error":false,"session_id":"s","usage":{"input_tokens":5,"output_tokens":7}}"#,
        ];
        let events: Vec<AiEvent> = lines.iter().filter_map(|l| parse_stream_line(l)).collect();
        let deltas: Vec<&str> = events.iter().filter_map(|e| match e {
            AiEvent::Delta { text } => Some(text.as_str()),
            _ => None,
        }).collect();
        assert_eq!(deltas, vec!["안", "녕"]);
        match events.last() {
            Some(AiEvent::Done { input_tokens, output_tokens, .. }) => {
                assert_eq!(*input_tokens, Some(5));
                assert_eq!(*output_tokens, Some(7));
            }
            _ => panic!("expected Done last"),
        }
    }

    #[test]
    fn extract_structured_prefers_structured_output() {
        let s = r#"{"result":"prose","structured_output":{"body":"{}","notes":"n"}}"#;
        let out = extract_structured(s);
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v.get("body").and_then(|x| x.as_str()), Some("{}"));
        assert!(v.get("result").is_none());
    }

    #[test]
    fn extract_structured_falls_back_to_raw() {
        let s = r#"{"result":"{\"body\":\"x\"}"}"#;
        assert_eq!(extract_structured(s), s);
    }

    #[test]
    fn extract_structured_passthrough_non_json() {
        assert_eq!(extract_structured("not json"), "not json");
    }

    #[test]
    fn pick_executable_returns_existing() {
        let dir = std::env::temp_dir();
        let f = dir.join("swaggerman_pick_exec_test.tmp");
        std::fs::write(&f, b"x").unwrap();
        let fp = f.to_string_lossy().to_string();
        let picked = pick_executable(&["/definitely/not/here".into(), fp.clone()]);
        assert_eq!(picked, Some(fp));
        let _ = std::fs::remove_file(&f);
    }

    #[test]
    fn pick_executable_none_when_missing() {
        assert_eq!(pick_executable(&["/nope/a".into(), "/nope/b".into()]), None);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn ai_complete_pipes_stdin_and_returns_stdout() {
        // 고정 JSON을 stdout으로 내는 가짜 claude 스크립트
        let dir = std::env::temp_dir();
        let script = dir.join("fake_claude_complete.sh");
        std::fs::write(
            &script,
            "#!/bin/sh\ncat > /dev/null\nprintf '{\"result\":\"{\\\\\"body\\\\\":\\\\\"{}\\\\\"}\"}'\n",
        )
        .unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let args = AiCompleteArgs {
            prompt: "만들어줘".into(),
            system: "sys".into(),
            model: "haiku".into(),
            schema: "{}".into(),
            claude_path: Some(script.to_string_lossy().to_string()),
        };
        let out = ai_complete(args).await.unwrap();
        assert_eq!(out.trim(), r#"{"result":"{\"body\":\"{}\"}"}"#);
        let _ = std::fs::remove_file(&script);
    }
}
