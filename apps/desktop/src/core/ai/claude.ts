import { invoke, Channel } from "@tauri-apps/api/core";
import type { AiChatRequest, AiCompleteRequest, AiEvent, AiDetect } from "./types";
import type { AiHandle, AiProvider } from "./provider";

export const claudeProvider: AiProvider = {
  id: "claude",
  displayName: "Claude",

  async detect(): Promise<AiDetect> {
    return invoke<AiDetect>("ai_detect");
  },

  async complete(req: AiCompleteRequest): Promise<string> {
    return invoke<string>("ai_complete", {
      args: {
        prompt: req.prompt,
        system: req.system,
        model: req.model,
        schema: req.schema,
        claudePath: req.claudePath,
      },
    });
  },

  chat(req: AiChatRequest, onEvent: (e: AiEvent) => void): AiHandle {
    const channel = new Channel<AiEvent>();
    channel.onmessage = (e) => onEvent(e);
    // 비동기로 실행(완료를 기다리지 않음). 에러는 error 이벤트로 변환.
    invoke("ai_chat", {
      args: {
        reqId: req.reqId,
        prompt: req.prompt,
        system: req.system,
        model: req.model,
        sessionId: req.sessionId,
        claudePath: req.claudePath,
      },
      onEvent: channel,
    }).catch((err) => onEvent({ kind: "error", message: String(err) }));

    return {
      cancel: () => {
        invoke("ai_cancel", { reqId: req.reqId }).catch(() => {});
      },
    };
  },
};
