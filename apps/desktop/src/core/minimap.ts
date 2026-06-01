// 미니맵 버킷 집계: 대용량(수십만 줄) 응답에서도 안전하게 동작하도록
// 줄 단위 드로잉 대신 버킷으로 요약한다. 스프레드(...) 미사용 — O(n) 루프 1패스.

export interface MinimapBucket {
  /** 버킷 내 최대 줄 길이를 전체 최대 길이로 나눈 0~1 정규화 값 */
  len: number;
  /** 버킷 내에 검색 매치 줄이 하나라도 있으면 true */
  match: boolean;
  /** 버킷 내 marks 색상(버킷에 속한 줄 중 첫 marks 색). 없으면 undefined. */
  color?: string;
}

/**
 * lines를 bucketCount개 버킷으로 집계한다.
 * - bucketCount<=0 또는 lines가 비면 빈 배열.
 * - lines.length <= bucketCount면 줄당 1버킷(lines.length개 반환).
 * - marks(줄 인덱스 → CSS 색상)를 주면 각 버킷에 첫 marks 색을 color로 채운다.
 */
export function buildMinimapBuckets(
  lines: string[],
  bucketCount: number,
  matchLines: Set<number>,
  marks?: Map<number, string>,
): MinimapBucket[] {
  const n = lines.length;
  if (bucketCount <= 0 || n === 0) return [];

  const count = Math.min(bucketCount, n);

  // 1패스: 각 버킷의 최대 줄 길이와 매치 여부, 첫 marks 색, 전체 최대 길이 동시 집계
  const maxLenOf = new Array<number>(count).fill(0);
  const matchOf = new Array<boolean>(count).fill(false);
  const colorOf = new Array<string | undefined>(count).fill(undefined);
  let globalMax = 0;

  for (let i = 0; i < n; i++) {
    const b = Math.floor((i * count) / n);
    const len = lines[i].length;
    if (len > maxLenOf[b]) maxLenOf[b] = len;
    if (len > globalMax) globalMax = len;
    if (matchLines.has(i)) matchOf[b] = true;
    // i가 증가하는 순서로 돌므로 첫 마크(가장 앞 줄) 색만 채택
    if (marks && colorOf[b] === undefined) {
      const c = marks.get(i);
      if (c !== undefined) colorOf[b] = c;
    }
  }

  const buckets = new Array<MinimapBucket>(count);
  const denom = globalMax || 1;
  for (let b = 0; b < count; b++) {
    buckets[b] = { len: maxLenOf[b] / denom, match: matchOf[b], color: colorOf[b] };
  }
  return buckets;
}
