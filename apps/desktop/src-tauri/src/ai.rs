use serde::{Deserialize, Serialize};

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
    Done { session_id: Option<String> },
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
        "--model".into(),
        a.model.clone(),
        "--json-schema".into(),
        a.schema.clone(),
        "--append-system-prompt".into(),
        a.system.clone(),
    ]
}

use serde_json::Value;

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
            Some(AiEvent::Done { session_id })
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
            Some(AiEvent::Done { session_id }) => assert_eq!(session_id.as_deref(), Some("abc")),
            _ => panic!("expected done"),
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
    fn pick_executable_returns_existing() {
        // 현재 소스 파일은 반드시 존재 → 첫 존재 경로를 고른다.
        let me = file!().to_string();
        let picked = pick_executable(&["/definitely/not/here".into(), me.clone()]);
        assert_eq!(picked, Some(me));
    }

    #[test]
    fn pick_executable_none_when_missing() {
        assert_eq!(pick_executable(&["/nope/a".into(), "/nope/b".into()]), None);
    }
}
