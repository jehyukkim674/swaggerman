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

const PROVIDERS: Record<string, AiProvider> = {
  claude: claudeProvider,
};

export function getProvider(id: "claude" | "codex" = "claude"): AiProvider {
  return PROVIDERS[id] ?? claudeProvider;
}
