import { useEffect } from "react";

/** ESC 키로 모달을 닫는 공용 훅. 입력 컴포넌트가 ESC를 소비(stopPropagation)하면 닫지 않는다. */
export function useEscToClose(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
