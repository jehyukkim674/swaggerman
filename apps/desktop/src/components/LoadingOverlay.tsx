/** 스펙 로딩 중 화면 전체를 덮는 오버레이(스피너 + 로딩 대상 표시). 입력을 차단한다. */
export function LoadingOverlay({ url }: { url: string }) {
  return (
    <div className="loading-overlay">
      <div className="loading-box">
        <div className="spinner" aria-label="로딩 중" />
        <div className="loading-text">프로젝트 로딩 중…</div>
        {url && <div className="loading-url">{url}</div>}
      </div>
    </div>
  );
}
