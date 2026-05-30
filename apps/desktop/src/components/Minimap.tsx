import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  text: string;
  scrollRef: React.RefObject<HTMLElement | null>;
  matchLines: Set<number>;
}

/** 응답 본문 미니맵: 라인 축소 렌더 + 뷰포트 인디케이터 + 검색 매치 마크 + 클릭/드래그 이동. */
export function Minimap({ text, scrollRef, matchLines }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const dragging = useRef(false);
  const lines = useMemo(() => text.split("\n"), [text]);

  // 라인 + 매치 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const lineH = Math.max(h / Math.max(lines.length, 1), 0.6);
    const maxLen = Math.max(...lines.map((l) => l.length), 30);
    lines.forEach((line, i) => {
      const y = i * lineH;
      if (matchLines.has(i)) {
        ctx.fillStyle = "#d29922";
        ctx.fillRect(2, y, w - 4, Math.max(lineH, 1));
        return;
      }
      const len = line.trim().length;
      if (len === 0) return;
      ctx.fillStyle = "rgba(139,148,158,0.42)";
      const barW = Math.min((line.length / maxLen) * (w - 8), w - 8);
      ctx.fillRect(4, y, barW, Math.max(lineH * 0.6, 0.6));
    });
  }, [lines, matchLines]);

  // 스크롤 ↔ 뷰포트 동기화
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const h = canvasRef.current?.clientHeight ?? 0;
      const total = Math.max(el.scrollHeight, 1);
      setViewport({
        top: (el.scrollTop / total) * h,
        height: Math.min((el.clientHeight / total) * h, h),
      });
    };
    update();
    el.addEventListener("scroll", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [scrollRef, text]);

  const scrollTo = (clientY: number) => {
    const el = scrollRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    el.scrollTop = frac * el.scrollHeight - el.clientHeight / 2;
  };

  return (
    <div
      className="minimap"
      onMouseDown={(e) => {
        dragging.current = true;
        scrollTo(e.clientY);
      }}
      onMouseMove={(e) => dragging.current && scrollTo(e.clientY)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
    >
      <canvas ref={canvasRef} className="minimap-canvas" />
      <div
        className="minimap-viewport"
        style={{ top: `${viewport.top}px`, height: `${viewport.height}px` }}
      />
    </div>
  );
}
