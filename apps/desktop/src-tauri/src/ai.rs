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
#[derive(Serialize, Clone)]
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
}
