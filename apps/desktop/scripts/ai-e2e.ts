// 실제 claude CLI를 호출해 stream-json/structured_output 포맷 회귀를 감지한다.
// 옵트인: `npm run ai:e2e` (네트워크·비용 발생, CI/`npm test`에서 제외).
import { spawn } from "node:child_process";

function run(args: string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("claude", args, { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}`))));
    p.stdin.write(input);
    p.stdin.end();
  });
}

async function main() {
  const stream = await run(
    ["-p", "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--tools", "--strict-mcp-config", "--model", "haiku"],
    "한 단어로 인사",
  );
  const hasTextDelta = stream.split("\n").some((l) => l.includes('"text_delta"'));
  console.log("stream-json text_delta:", hasTextDelta ? "OK" : "FAIL");

  const schema = JSON.stringify({ type: "object", additionalProperties: false, properties: { body: { type: "string" } } });
  const completed = await run(
    ["-p", "--output-format", "json", "--tools", "--strict-mcp-config", "--model", "haiku", "--json-schema", schema],
    "body에 hi 를 넣어줘",
  );
  const obj = JSON.parse(completed);
  const hasStructured = obj.structured_output && typeof obj.structured_output === "object";
  console.log("json-schema structured_output:", hasStructured ? "OK" : "FAIL");

  if (!hasTextDelta || !hasStructured) process.exit(1);
}

main().catch((e) => {
  console.error("E2E 실패:", e);
  process.exit(1);
});
