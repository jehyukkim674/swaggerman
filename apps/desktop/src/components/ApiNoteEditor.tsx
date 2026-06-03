// 요청 화면 상단 메모 영역: 상태 태그(공용 Select) + 자유 텍스트. 빈 노트는 접어둔다.
import { useState } from "react";
import { Select } from "./Select";
import { STATUS_META, STATUS_ORDER, isEmptyNote, type ApiNote, type ApiStatus } from "../core/notes";

interface Props {
  note: ApiNote;
  onChange: (note: ApiNote) => void;
}

export function ApiNoteEditor({ note, onChange }: Props) {
  // 빈 노트는 기본 접힘. 사용자가 펼치면 열림.
  const [expanded, setExpanded] = useState(!isEmptyNote(note));

  const patch = (p: Partial<ApiNote>) => onChange({ ...note, ...p, updatedAt: Date.now() });

  if (!expanded) {
    return (
      <button className="api-note-add" onClick={() => setExpanded(true)}>
        📝 메모 추가
      </button>
    );
  }

  return (
    <div className="api-note">
      <div className="api-note-head">
        <span className="api-note-title">📝 메모</span>
        <Select
          className="api-note-status"
          value={note.status}
          onChange={(v) => patch({ status: v as ApiStatus })}
          options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }))}
        />
      </div>
      <textarea
        className="api-note-text"
        value={note.text}
        onChange={(e) => patch({ text: e.target.value })}
        placeholder="이 API에 대한 메모 (예: 6월 제거 예정, 백엔드 문의 6/3)"
        spellCheck={false}
        rows={2}
      />
    </div>
  );
}
