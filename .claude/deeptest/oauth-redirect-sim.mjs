// 딥 테스트용 OAuth 리다이렉트 시뮬레이터 (의존성 없음, Node 내장 http만 사용)
//
// 목적: "서비스 → 인증 provider(다른 오리진) → 서비스 복귀 후 XHR" 흐름을 재현해
// 리버스 프록시가 우회당하는 상황을 만든다. 브라우저 캡처(CDP)는 오리진이 바뀌어도
// 같은 브라우저 안이므로 복귀 후 XHR을 모두 잡아야 한다.
//
// 실행:  node .claude/deeptest/oauth-redirect-sim.mjs
//   - 서비스(SP) :  http://127.0.0.1:7001   ← 앱 '브라우저' 모드의 시작 URL로 사용
//   - 인증 provider(IdP, Okta 역할) : http://127.0.0.1:7002  (다른 포트=다른 오리진)
//
// 시나리오:
//   1) 7001/ 에서 '로그인' 클릭 → 7002/authorize 로 이동(오리진 전환)
//   2) 7002 에서 '로그인' 제출 → 7001/callback?code=... 로 302(오리진 복귀)
//   3) 7001/callback 이 세션 쿠키 설정 + 앱 페이지 제공 → 페이지가 XHR 2건 호출
//        GET /api/items  (배열 응답 → Mock dataset 후보)
//        GET /api/profile (객체 응답 → Mock body 후보)
//   => 캡처 목록에 /api/items, /api/profile 이 떠야 성공.

import http from "node:http";

const SP_PORT = 7001;
const IDP_PORT = 7002;
const SP = `http://127.0.0.1:${SP_PORT}`;
const IDP = `http://127.0.0.1:${IDP_PORT}`;

function html(res, body, headers = {}) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...headers });
  res.end(body);
}
function json(res, obj) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

// ── 서비스(SP) ───────────────────────────────────────────────
http
  .createServer((req, res) => {
    const url = new URL(req.url, SP);
    if (url.pathname === "/") {
      return html(
        res,
        `<h1>데모 서비스</h1>
         <p>리버스 프록시는 아래 로그인 후 ${IDP} 로 바운스되면 추적을 놓칩니다.</p>
         <a id="login" href="${IDP}/authorize?redirect_uri=${encodeURIComponent(SP + "/callback")}">로그인 (Okta 역할로 이동)</a>`,
      );
    }
    if (url.pathname === "/callback") {
      // 인증 완료 → 세션 쿠키 + XHR을 쏘는 앱 페이지
      return html(
        res,
        `<h1>로그인 완료 — 앱 화면</h1>
         <pre id="out">불러오는 중…</pre>
         <script>
           (async () => {
             const items = await fetch('/api/items').then(r => r.json());
             const profile = await fetch('/api/profile').then(r => r.json());
             document.getElementById('out').textContent =
               JSON.stringify({ items, profile }, null, 2);
           })();
         </script>`,
        { "set-cookie": "session=demo-" + Date.now() + "; Path=/" },
      );
    }
    if (url.pathname === "/api/items") {
      return json(res, [
        { id: 1, name: "alpha" },
        { id: 2, name: "beta" },
      ]);
    }
    if (url.pathname === "/api/profile") {
      return json(res, { user: "tester", role: "admin", authed: true });
    }
    res.writeHead(404).end("not found");
  })
  .listen(SP_PORT, "127.0.0.1", () => console.log(`[SP ] 서비스      ${SP}  ← 시작 URL로 사용`));

// ── 인증 provider(IdP, Okta 역할) ────────────────────────────
http
  .createServer((req, res) => {
    const url = new URL(req.url, IDP);
    if (url.pathname === "/authorize") {
      const redirect = url.searchParams.get("redirect_uri") || SP + "/callback";
      return html(
        res,
        `<h1>로그인 (Okta 역할)</h1>
         <p>다른 오리진(${IDP}) 입니다.</p>
         <form method="GET" action="/login">
           <input type="hidden" name="redirect_uri" value="${redirect}" />
           <button type="submit">계속 (제출하면 서비스로 복귀)</button>
         </form>`,
      );
    }
    if (url.pathname === "/login") {
      const redirect = url.searchParams.get("redirect_uri") || SP + "/callback";
      // redirect_uri 는 서비스가 정한 실제 호스트 — 프록시를 거치지 않고 직접 복귀
      res.writeHead(302, { location: redirect + "?code=demo-auth-code" });
      return res.end();
    }
    res.writeHead(404).end("not found");
  })
  .listen(IDP_PORT, "127.0.0.1", () => console.log(`[IdP] 인증 provider ${IDP}  (다른 오리진)`));

console.log("\n준비 완료. 앱의 '브라우저' 모드 시작 URL에  " + SP + "  를 넣고 시작 → 로그인 클릭 → 계속.");
console.log("캡처 목록에 GET /api/items, GET /api/profile 이 뜨면 성공.\n중지: Ctrl+C\n");
