import { useEffect, useRef, useState } from "react";
import type { AiProvider, AiHandle } from "../core/ai/provider";
import type { AiEvent, RequestSuggestion } from "../core/ai/types";
import { parseSuggestion, requestSuggestionSchema } from "../core/ai/schema";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, COMPLETE_MODEL } from "../core/ai/models";
import { AiSuggestionCard } from "./AiSuggestionCard";

interface Message {
  role: "user" | "assistant";
  text: string;
  suggestion?: RequestSuggestion;
  usage?: { input: number; output: number };
}

interface Props {
  provider: AiProvider;
  buildContext: () => string;
  onApplySuggestion: (s: RequestSuggestion) => void;
}

const REQUEST_PREFIX = "/요청";
const CHAT_SYSTEM =
  "당신은 OpenAPI 클라이언트의 어시스턴트입니다. 사용자가 보고 있는 엔드포인트 컨텍스트를 바탕으로 한국어로 간결히 답하세요.";
const REQUEST_SYSTEM =
  "사용자 의도에 맞는 HTTP 요청 필드를 채우세요. 주어진 JSON 스키마에 맞는 객체만 출력합니다. 환경 변수는 {{이름}} 형태로 참조할 수 있습니다.";

// 요청 식별용 단조 증가 카운터(취소 매칭용). 모듈 스코프 — 단일 패널 인스턴스 가정.
let reqCounter = 1;

export function AiPanel({ provider, buildContext, onApplySuggestion }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [totals, setTotals] = useState({ input: 0, output: 0 });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const sessionRef = useRef<string | undefined>(undefined);
  const handleRef = useRef<AiHandle | null>(null);
  const genRef = useRef(0);

  function reset() {
    genRef.current++;
    handleRef.current?.cancel();
    handleRef.current = null;
    setMessages([]);
    setTotals({ input: 0, output: 0 });
    sessionRef.current = undefined;
    setError(null);
    setBusy(false);
  }

  async function handleRequestBuild(question: string) {
    const myGen = genRef.current;
    setBusy(true);
    setError(null);
    try {
      const prompt = `${buildContext()}\n\n## 요청\n${question}`;
      const raw = await provider.complete({
        prompt,
        system: REQUEST_SYSTEM,
        model: COMPLETE_MODEL,
        schema: JSON.stringify(requestSuggestionSchema),
      });
      if (genRef.current !== myGen) return;
      const suggestion = parseSuggestion(raw);
      if (!suggestion) {
        setError("제안을 해석하지 못했습니다. 다시 시도해 주세요.");
      } else {
        setMessages((m) => [...m, { role: "assistant", text: suggestion.notes ?? "요청을 제안했습니다.", suggestion }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleChat(question: string) {
    setBusy(true);
    setError(null);
    const prompt = `${buildContext()}\n\n## 질문\n${question}`;
    let acc = "";
    setMessages((m) => [...m, { role: "assistant", text: "" }]);
    const onEvent = (e: AiEvent) => {
      if (e.kind === "delta") {
        acc += e.text;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", text: acc };
          return copy;
        });
      } else if (e.kind === "done") {
        if (e.sessionId) sessionRef.current = e.sessionId;
        const inTok = e.inputTokens ?? 0;
        const outTok = e.outputTokens ?? 0;
        if (inTok || outTok) {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = { ...last, usage: { input: inTok, output: outTok } };
            }
            return copy;
          });
          setTotals((t) => ({ input: t.input + inTok, output: t.output + outTok }));
        }
        setBusy(false);
        handleRef.current = null;
      } else if (e.kind === "error") {
        setError(e.message);
        setBusy(false);
        handleRef.current = null;
      }
    };
    handleRef.current = provider.chat(
      { reqId: reqCounter++, prompt, system: CHAT_SYSTEM, model, sessionId: sessionRef.current },
      onEvent,
    );
  }

  // 언마운트 시 진행 중인 스트림을 취소한다(스테일 콜백/좀비 프로세스 방지).
  useEffect(() => {
    return () => {
      handleRef.current?.cancel();
    };
  }, []);

  // 마운트 시 claude CLI 가용성 확인(없으면 경고 표시).
  useEffect(() => {
    let alive = true;
    provider.detect().then((d) => {
      if (alive) setUnavailable(!d.claude);
    }).catch(() => { if (alive) setUnavailable(true); });
    return () => { alive = false; };
  }, [provider]);

  function send() {
    const q = input.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    if (q.startsWith(REQUEST_PREFIX)) {
      handleRequestBuild(q.slice(REQUEST_PREFIX.length).trim());
    } else {
      handleChat(q);
    }
  }

  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <span className="ai-panel-title">✦ AI</span>
        <select className="ai-model" value={model} onChange={(e) => setModel(e.target.value)}>
          {CHAT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button className="btn small" onClick={reset} title="새 대화">
          새 대화
        </button>
        {(totals.input > 0 || totals.output > 0) && (
          <span className="ai-usage-total" title="이번 대화 누적 토큰(입력/출력)">
            ↑{totals.input.toLocaleString()} ↓{totals.output.toLocaleString()}
          </span>
        )}
      </div>

      <div className="ai-messages">
        {unavailable && (
          <div className="ai-error">
            claude CLI를 찾을 수 없습니다. 설치 후 PATH에 추가하거나, 터미널에서 `which claude`로 경로를 확인하세요.
          </div>
        )}
        {messages.length === 0 && (
          <div className="ai-empty">
            질문하거나 <code>/요청 …</code> 으로 요청 폼을 자동 작성하세요.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-msg-text">{m.text}</div>
            {m.usage && (
              <div className="ai-msg-usage">↑{m.usage.input.toLocaleString()} ↓{m.usage.output.toLocaleString()} 토큰</div>
            )}
            {m.suggestion && (
              <AiSuggestionCard
                suggestion={m.suggestion}
                onApply={onApplySuggestion}
                onDismiss={() =>
                  setMessages((arr) => {
                    const copy = [...arr];
                    copy[i] = { ...copy[i], suggestion: undefined };
                    return copy;
                  })
                }
              />
            )}
          </div>
        ))}
        {error && <div className="ai-error">{error}</div>}
      </div>

      <div className="ai-input">
        <textarea
          value={input}
          placeholder="질문 또는 /요청 …  (Enter 전송, Shift+Enter 줄바꿈)"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
        />
        <button className="btn small primary" onClick={send} disabled={busy}>
          {busy ? "…" : "전송"}
        </button>
      </div>
    </div>
  );
}
