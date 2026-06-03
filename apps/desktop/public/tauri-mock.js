// tauri-mock.js — 브라우저 모드용 Tauri API 대체 구현
//
// 목적: 데스크탑(Tauri) 없이 `npm run dev`(Vite)만으로 브라우저에서 UI를 실행한다.
//   - 매뉴얼 스크린샷 자동 촬영(Chrome DevTools)
//   - UI 빠른 개발/확인
//
// 동작: 실제 Tauri 런타임에서는 window.__TAURI_INTERNALS__가 이미 주입되어 있으므로
//       이 스크립트는 아무것도 하지 않는다(no-op). 브라우저에서만 mock이 활성화된다.
//
// 대체 범위:
//   - http_request  → 브라우저 fetch (CORS 허용 서버만 가능. Petstore 데모용)
//   - ai_detect/ai_chat/ai_complete → 가짜 claude 응답(데모 텍스트 스트리밍)
//   - cookies/fs/updater/version → 무해한 기본값
(function () {
  "use strict";
  if (window.__TAURI_INTERNALS__) return; // 실제 Tauri 앱에서는 no-op

  // ---------------------------------------------------------------
  // 콜백 레지스트리 (Channel 스트리밍 지원)
  // ---------------------------------------------------------------
  let nextCallbackId = 1;
  const callbacks = new Map();

  function transformCallback(callback, _once) {
    const id = nextCallbackId++;
    callbacks.set(id, callback);
    return id;
  }

  function unregisterCallback(id) {
    callbacks.delete(id);
  }

  /** Channel(id)로 메시지 배열을 순서 보장 프로토콜에 맞춰 스트리밍 전송 */
  async function streamToChannel(channelId, messages, delayMs) {
    for (let i = 0; i < messages.length; i++) {
      const cb = callbacks.get(channelId);
      if (!cb) return; // 채널이 해제됨(취소)
      cb({ index: i, message: messages[i] });
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }
    const cb = callbacks.get(channelId);
    if (cb) cb({ index: messages.length, end: true });
  }

  // ---------------------------------------------------------------
  // HTTP: Rust(reqwest) 대신 브라우저 fetch
  // ---------------------------------------------------------------
  // 사내/내부 URL 차단 — 공개 매뉴얼 스크린샷에 내부 데이터가 노출되는 것을 방지
  const BLOCKED_URLS = [/localhost:8000/, /\.nip\.io/, /^https?:\/\/(10|172|192\.168|14\.63)\./, /svc-dev/];

  async function httpRequest(args) {
    if (BLOCKED_URLS.some(function (re) { return re.test(args.url); })) {
      throw "error sending request: browser-mock이 내부 URL을 차단했습니다 (" + args.url + ")";
    }
    const start = performance.now();
    const init = { method: args.method, headers: args.headers || {} };

    if (args.form) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(args.form)) params.append(key, value);
      init.body = params;
    } else if (args.body !== undefined && args.body !== null && args.method !== "GET") {
      init.body = args.body;
    }

    let resp;
    try {
      resp = await fetch(args.url, init);
    } catch (e) {
      // Rust 에러 메시지 형식과 비슷하게 맞춘다 (앱의 에러 처리 분기 호환)
      throw "error sending request: " + (e && e.message ? e.message : String(e));
    }
    const body = await resp.text();
    const headers = {};
    resp.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      status: resp.status,
      headers,
      body,
      durationMs: Math.round(performance.now() - start),
      size: new TextEncoder().encode(body).length,
    };
  }

  // ---------------------------------------------------------------
  // AI: 로컬 claude CLI 대신 데모 응답
  // ---------------------------------------------------------------
  const AI_CHAT_DEMO = [
    "이 엔드포인트는 **상태(status)로 펫 목록을 조회**하는 API입니다.\n\n",
    "## 사용 방법\n",
    "- `status` 쿼리 파라미터에 `available`(판매중) / `pending`(예약중) / `sold`(판매완료) 중 하나를 지정합니다\n",
    "- 예: `GET /pet/findByStatus?status=available`\n\n",
    "## 응답\n",
    "- **200** — Pet 객체 배열: 각 펫의 `id`, `name`, `category`, `photoUrls`, `tags`, `status`\n",
    "- **400** — 잘못된 status 값을 보낸 경우\n\n",
    "판매중인 펫만 보려면 status를 `available`로 두고 ⌘Enter로 전송해 보세요.",
  ];

  const AI_FORMFILL_DEMO = JSON.stringify({
    queryParams: { status: "available" },
    headers: {},
    notes: "판매중인 펫 목록을 조회합니다. status 쿼리 파라미터를 available로 설정했습니다.",
  });

  function aiChat(payload) {
    const channel = payload.onEvent;
    const reqId = payload.args && payload.args.reqId;
    // 본문 텍스트를 작은 조각으로 쪼개 스트리밍처럼 보낸다
    const deltas = [];
    for (const paragraph of AI_CHAT_DEMO) {
      const chunks = paragraph.match(/.{1,14}/gs) || [];
      for (const text of chunks) deltas.push({ kind: "delta", text });
    }
    deltas.push({ kind: "done", sessionId: "demo-session-" + (reqId || 1), inputTokens: 812, outputTokens: 264 });
    streamToChannel(channel.id, deltas, 35);
    return Promise.resolve(null);
  }

  // ---------------------------------------------------------------
  // invoke 라우터
  // ---------------------------------------------------------------
  async function invoke(cmd, args, _options) {
    args = args || {};
    switch (cmd) {
      // --- HTTP ---
      case "http_request":
        return httpRequest(args.args);

      // --- AI (claude CLI) ---
      case "ai_detect":
        return { claude: { path: "/Users/demo/.local/bin/claude", version: "2.0.76 (Claude Code)" } };
      case "ai_chat":
        return aiChat(args);
      case "ai_complete":
        // /요청 폼 채우기 — RequestSuggestion JSON 문자열 반환
        await new Promise((r) => setTimeout(r, 1200));
        return AI_FORMFILL_DEMO;
      case "ai_cancel":
        return null;

      // --- Mock 서버 ---
      case "mock_start":
        return Promise.reject(new Error("브라우저 모드에서는 Mock 서버를 사용할 수 없습니다 (데스크톱 앱 전용)"));
      case "mock_stop":
        return Promise.resolve();
      case "mock_status":
        return Promise.resolve({ running: false, port: 0, logs: [] });

      // --- 전역 단축키 (브라우저 모드 no-op) ---
      case "register_global_shortcut":
        return Promise.resolve();
      case "unregister_global_shortcut":
        return Promise.resolve();

      // --- 쿠키/파일 ---
      case "list_cookies":
        return [
          { name: "session-demo", value: "8f3a91c2", domain: "petstore3.swagger.io", path: "/" },
        ];
      case "clear_cookies":
        return null;
      case "write_text_file":
        return null;
      case "read_text_file":
        throw "browser mode: 파일 읽기는 지원하지 않습니다";

      // --- Tauri 플러그인 ---
      case "plugin:app|version":
        return "0.3.23";
      case "plugin:app|name":
        return "SwaggerMan";
      case "plugin:updater|check":
        return null; // 업데이트 없음(최신)
      case "plugin:event|listen":
      case "plugin:event|unlisten":
      case "plugin:event|emit":
        return null;

      default:
        throw "browser-mock: 지원하지 않는 커맨드 " + cmd;
    }
  }

  // ---------------------------------------------------------------
  // __TAURI_INTERNALS__ 주입
  // ---------------------------------------------------------------
  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback,
    unregisterCallback,
    convertFileSrc: function (path) {
      return path;
    },
    metadata: {
      currentWebview: { label: "main" },
      currentWindow: { label: "main" },
    },
    plugins: {},
  };

  console.info("[tauri-mock] 브라우저 모드 활성화 — HTTP는 fetch, AI는 데모 응답으로 동작합니다");
})();
