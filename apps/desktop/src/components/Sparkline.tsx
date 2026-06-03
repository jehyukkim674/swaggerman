// 숫자 배열을 SVG polyline 미니차트로. 외부 라이브러리 없음.
interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ values, width = 80, height = 22, color = "var(--muted)" }: Props) {
  if (values.length === 0) {
    return <svg className="sparkline" width={width} height={height} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const points = values
    .map((v, i) => {
      const x = n === 1 ? width / 2 : (i / (n - 1)) * (width - 2) + 1;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // 단일 값은 수평선이 되도록 양 끝점 복제
  const finalPoints = n === 1 ? `1,${(height / 2).toFixed(1)} ${width - 1},${(height / 2).toFixed(1)}` : points;
  return (
    <svg className="sparkline" width={width} height={height} aria-hidden>
      <polyline points={finalPoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
