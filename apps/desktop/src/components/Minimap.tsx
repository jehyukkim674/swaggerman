import { useEffect, useRef, useState } from "react";
import { buildMinimapBuckets } from "../core/minimap";

interface Props {
  lines: string[];
  scrollRef: React.RefObject<HTMLElement | null>;
  matchLines: Set<number>;
  /** 줄 인덱스 → CSS 색상 문자열. diff 위치 표시용(검색 매치보다 낮은 우선순위로 그림). */
  marks?: Map<number, string>;
}

/** 응답 본문 미니맵: 버킷 축소 렌더 + 뷰포트 인디케이터 + 검색 매치 마크 + diff 위치 마크 + 클릭/드래그 이동. */
export function Minimap({ lines, scrollRef, matchLines, marks }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const dragging = useRef(false);

  // 버킷 + 매치 그리기 (대용량 응답에서도 안전하도록 줄 단위가 아닌 버킷 단위)
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

    // 버킷당 약 2px. 줄 수보다 많을 수는 없음.
    const bucketCount = Math.min(lines.length, Math.max(Math.floor(h / 2), 1));
    const buckets = buildMinimapBuckets(lines, bucketCount, matchLines, marks);
    if (buckets.length === 0) return;
    const bucketH = Math.max(h / buckets.length, 0.6);
    for (let b = 0; b < buckets.length; b++) {
      const y = b * bucketH;
      if (buckets[b].match) {
        ctx.fillStyle = "#d29922";
        ctx.fillRect(2, y, w - 4, Math.max(bucketH, 1));
        continue;
      }
      // match가 없고 diff 마크 색이 있으면 그 색으로 막대(검색 매치보다 낮은 우선순위)
      const color = buckets[b].color;
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(2, y, w - 4, Math.max(bucketH, 1));
        continue;
      }
      if (buckets[b].len === 0) continue;
      ctx.fillStyle = "rgba(139,148,158,0.42)";
      const barW = Math.min(buckets[b].len * (w - 8), w - 8);
      ctx.fillRect(4, y, barW, Math.max(bucketH * 0.6, 0.6));
    }
  }, [lines, matchLines, marks]);

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
  }, [scrollRef, lines]);

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
