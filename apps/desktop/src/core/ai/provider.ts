import type { AiChatRequest, AiCompleteRequest, AiEvent, AiDetect } from "./types";

export interface AiHandle {
  cancel: () => void;
}

export interface AiProvider {
  id: "claude" | "codex";
  displayName: string;
  detect: () => Promise<AiDetect>;
  chat: (req: AiChatRequest, onEvent: (e: AiEvent) => void) => AiHandle;
  complete: (req: AiCompleteRequest) => Promise<string>;
}

import { claudeProvider } from "./claude";
import { log } from "../log";

const PROVIDERS: Record<string, AiProvider> = {
  claude: claudeProvider,
};

export function getProvider(id: "claude" | "codex" = "claude"): AiProvider {
  const p = PROVIDERS[id];
  if (!p) {
    log.warn("ai", `알 수 없는 provider '${id}', claude로 폴백`);
    return claudeProvider;
  }
  return p;
}
