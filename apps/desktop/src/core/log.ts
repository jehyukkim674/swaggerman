// 경량 구조화 로깅. 콘솔(웹뷰 devtools/Tauri 로그)로 출력한다.
// 모든 console 호출을 한곳에 모아 일관된 포맷(타임스탬프 + 스코프)을 유지한다.

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, scope: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  const prefix = `[${ts}] [SwaggerMan:${scope}]`;
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : level === "debug"
          ? console.debug
          : console.info;
  if (data !== undefined) fn(prefix, msg, data);
  else fn(prefix, msg);
}

export const log = {
  debug: (scope: string, msg: string, data?: unknown) => emit("debug", scope, msg, data),
  info: (scope: string, msg: string, data?: unknown) => emit("info", scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) => emit("warn", scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) => emit("error", scope, msg, data),
};
