import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import "./App.css";
import { loadSpec as loadSpecFromUrl } from "./core/spec-loader";
import { executeRequest } from "./core/http-client";
import {
  buildRequest,
  buildRequestUrl,
  captureSample,
  deriveBaseURL,
  restoreInputs,
  type RequestInputs,
  type RequestParam,
  type RequestSample,
} from "./core/request-builder";
import { buildCurl } from "./core/curl-builder";
import { savedToRequest, type Collection, type SavedRequest } from "./core/collections";
import { validateResponseBody, type ValidationIssue } from "./core/schema-validate";
import { computeSecurityHeaders } from "./core/security";
import {
  applyExtractRules,
  runAssertions,
  type Assertion,
  type AssertionResult,
  type ExtractRule,
} from "./core/variables";
import { emptyOAuth2Config, fetchOAuth2Token, type OAuth2Config } from "./core/oauth2";
import { findActiveEnv } from "./core/env";
import { checkUpdateStatus, type AvailableUpdate } from "./core/updater";
import {
  loadDonationDismissedAt,
  saveDonationDismissedAt,
  shouldShowDonationBanner,
} from "./core/donation";
import { loadJSON, saveJSON } from "./core/storage";
import { loadNotes, saveNotes, emptyNote, type NotesMap, type ApiNote } from "./core/notes";
import { log } from "./core/log";
import { newId, clampHistoryBody, type HistoryItem } from "./core/history";
import { openNewWindow } from "./core/window";
import { CloseCircleIcon, CoffeeIcon } from "./components/icons";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { Select } from "./components/Select";
import { ConfirmDialog } from "./components/ConfirmDialog";
import {
  defaultNetworkSettings,
  type HTTPMethod,
  type HTTPRequest,
  type HTTPResponse,
  type NetworkSettings,
  type ParsedOperation,
  type ParsedSpec,
} from "./core/types";
import { Sidebar } from "./components/Sidebar";
import { RequestEditor } from "./components/RequestEditor";
import { ResponseView } from "./components/ResponseView";
import { AuthorizeModal } from "./components/AuthorizeModal";
import { CurlImportModal } from "./components/CurlImportModal";
import { CollectionsModal } from "./components/CollectionsModal";
import { RunnerModal, type RunResult } from "./components/RunnerModal";
import { CommandPalette } from "./components/CommandPalette";
import { SettingsModal } from "./components/SettingsModal";
import { EnvironmentsModal } from "./components/EnvironmentsModal";
import { GlobalHeadersModal } from "./components/GlobalHeadersModal";
import { ProjectsModal } from "./components/ProjectsModal";
import { CompareModal } from "./components/CompareModal";
import { DonationModal } from "./components/DonationModal";
import { MockServerModal } from "./components/MockServerModal";
import { ShareModal } from "./components/ShareModal";
import { AiPanel } from "./components/AiPanel";
import { getProvider } from "./core/ai/provider";
import { buildAiContext } from "./core/ai/context";
import { applySuggestion, applySuggestionForOp, filterKnownParams } from "./core/ai/schema";
import { diagnosePrompt, explainPrompt } from "./core/ai/prompts";
import type { RequestSuggestion } from "./core/ai/types";
import type { ShareableRequest } from "./core/share";

const DEFAULT_SPEC_URL = "http://localhost:8000/v3/api-docs";

interface Project {
  url: string;
  title: string;
}

export interface EnvVar {
  key: string;
  value: string;
}

export interface Env {
  name: string;
  baseURL: string;
  vars?: EnvVar[];
}

export default function App() {
  const [specUrl, setSpecUrl] = useState(() =>
    loadJSON("swaggerman.lastSpecUrl", DEFAULT_SPEC_URL),
  );
  const [activeSpecUrl, setActiveSpecUrl] = useState("");
  const [spec, setSpec] = useState<ParsedSpec | null>(null);
  const [baseURL, setBaseURL] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ParsedOperation | null>(null);
  const [inputs, setInputs] = useState<RequestInputs | null>(null);

  const [response, setResponse] = useState<HTTPResponse | null>(null);
  const [lastRequest, setLastRequest] = useState<HTTPRequest | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [authValues, setAuthValues] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [notes, setNotes] = useState<NotesMap>({});
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [responseTab, setResponseTab] = useState<"docs" | "response">("docs");
  // 현재 보고 있는 히스토리 항목(선택 시 표기). 직접 선택/전송하면 해제.
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);

  // 환경(여러 baseURL + 변수) — 프로젝트별 저장
  const [envs, setEnvs] = useState<Env[]>([]);
  const [envModalOpen, setEnvModalOpen] = useState(false);
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.envs.${activeSpecUrl}`, envs);
  }, [envs, activeSpecUrl]);

  // 활성 환경 이름(같은 baseURL 환경이 여러 개여도 구분). 빈 문자열 = 사용자 지정.
  const [activeEnvName, setActiveEnvName] = useState<string>("");
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.activeEnv.${activeSpecUrl}`, activeEnvName);
  }, [activeEnvName, activeSpecUrl]);

  // 요청 체이닝으로 추출된 런타임 변수(응답에서 뽑은 값). 환경 변수보다 우선.
  const [chainVars, setChainVars] = useState<Record<string, string>>({});

  // 오퍼레이션별 응답 추출 규칙 / 어서션 — 프로젝트별 저장
  const [extractRules, setExtractRules] = useState<Record<string, ExtractRule[]>>({});
  const [assertions, setAssertions] = useState<Record<string, Assertion[]>>({});
  const [assertResults, setAssertResults] = useState<AssertionResult[]>([]);
  const [schemaIssues, setSchemaIssues] = useState<ValidationIssue[]>([]);
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.extract.${activeSpecUrl}`, extractRules);
  }, [extractRules, activeSpecUrl]);
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.assert.${activeSpecUrl}`, assertions);
  }, [assertions, activeSpecUrl]);

  // 현재 적용 중인 변수 맵: 환경 변수 < 체인 변수
  const activeVars = useMemo(() => {
    const map: Record<string, string> = {};
    const env = findActiveEnv(envs, activeEnvName, baseURL);
    for (const v of env?.vars ?? []) if (v.key) map[v.key] = v.value;
    for (const [k, val] of Object.entries(chainVars)) map[k] = val;
    return map;
  }, [envs, activeEnvName, baseURL, chainVars]);

  // 변수명 → {값, 출처} — 입력 호버 툴팁 표시용
  const varDetails = useMemo(() => {
    const map: Record<string, { value: string; source: string }> = {};
    const env = findActiveEnv(envs, activeEnvName, baseURL);
    for (const v of env?.vars ?? []) {
      if (v.key) map[v.key] = { value: v.value, source: env?.name ? `환경: ${env.name}` : "환경 변수" };
    }
    for (const [k, val] of Object.entries(chainVars)) {
      map[k] = { value: val, source: "체이닝 추출" };
    }
    return map;
  }, [envs, activeEnvName, baseURL, chainVars]);

  // 전역 헤더(모든 요청에 적용) — 프로젝트별 저장
  const [globalHeaders, setGlobalHeaders] = useState<RequestParam[]>([]);
  const [headerModalOpen, setHeaderModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [curlModalOpen, setCurlModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [mockOpen, setMockOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // 새 창 열기 확인 다이얼로그 (실수 클릭으로 창이 늘어나는 것 방지)
  const [newWindowConfirm, setNewWindowConfirm] = useState(false);

  // 컬렉션 러너: 저장 요청 1건 실행 → 결과 반환
  async function runSaved(s: SavedRequest): Promise<RunResult> {
    const { operation, inputs: ins, baseURL: b } = savedToRequest(s);
    const securityHeaders = computeSecurityHeaders(spec?.securitySchemes ?? [], authValues);
    const request = buildRequest(b, operation, ins, securityHeaders, globalHeaders, activeVars);
    const t0 = Date.now();
    try {
      const res = await executeRequest(request, netSettings);
      return {
        status: res.statusCode,
        ok: res.statusCode >= 200 && res.statusCode < 300,
        durationMs: res.durationMs,
      };
    } catch (e) {
      return { status: 0, ok: false, durationMs: Date.now() - t0, error: String(e) };
    }
  }

  // 컬렉션(저장 요청) — 전역 저장
  const [collections, setCollections] = useState<Collection[]>(() =>
    loadJSON("swaggerman.collections", [] as Collection[]),
  );
  useEffect(() => {
    saveJSON("swaggerman.collections", collections);
  }, [collections]);

  // 전역 네트워크 설정(타임아웃/SSL/프록시) — 전역 저장
  const [netSettings, setNetSettings] = useState<NetworkSettings>(() =>
    loadJSON("swaggerman.net", defaultNetworkSettings()),
  );
  useEffect(() => {
    saveJSON("swaggerman.net", netSettings);
  }, [netSettings]);

  // AI: claude 실행파일 경로 수동 지정(비우면 자동 탐지) — 전역 저장
  const [claudePath, setClaudePath] = useState<string>(() => loadJSON("swaggerman.claudePath", ""));
  useEffect(() => {
    saveJSON("swaggerman.claudePath", claudePath);
  }, [claudePath]);

  // OAuth2 토큰 발급 설정 — 프로젝트별 저장
  const [oauth2Config, setOauth2Config] = useState<OAuth2Config>(emptyOAuth2Config());
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.oauth2.${activeSpecUrl}`, oauth2Config);
  }, [oauth2Config, activeSpecUrl]);
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.headers.${activeSpecUrl}`, globalHeaders);
  }, [globalHeaders, activeSpecUrl]);

  // 오퍼레이션별 요청 샘플(Query/Headers/Body 묶음) — 프로젝트별 저장.
  // 옛 데이터(body만 저장)도 RequestSample로 그대로 호환된다.
  const [bodySamples, setBodySamples] = useState<Record<string, RequestSample[]>>({});
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.samples.${activeSpecUrl}`, bodySamples);
  }, [bodySamples, activeSpecUrl]);

  function saveSample(opId: string, name: string, ins: RequestInputs) {
    setBodySamples((prev) => {
      const list = (prev[opId] ?? []).filter((s) => s.name !== name);
      return { ...prev, [opId]: [...list, captureSample(name, ins)] };
    });
  }
  function deleteSample(opId: string, name: string) {
    setBodySamples((prev) => ({
      ...prev,
      [opId]: (prev[opId] ?? []).filter((s) => s.name !== name),
    }));
  }

  // 프로젝트(spec URL) 목록 — 전역 저장
  const [projects, setProjects] = useState<Project[]>(() =>
    loadJSON("swaggerman.projects", [] as Project[]),
  );
  useEffect(() => {
    saveJSON("swaggerman.projects", projects);
  }, [projects]);

  // 테마(다크/라이트) — 전역 저장
  const [theme, setTheme] = useState<"dark" | "light">(() => loadJSON("swaggerman.theme", "dark"));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    saveJSON("swaggerman.theme", theme);
  }, [theme]);

  // 커맨드 팔레트(⌘K)
  const [paletteOpen, setPaletteOpen] = useState(false);

  // AI 어시스턴트 패널(우측) 토글 — 전역 저장
  const [aiOpen, setAiOpen] = useState<boolean>(() => loadJSON("swaggerman.aiOpen", true));
  useEffect(() => {
    saveJSON("swaggerman.aiOpen", aiOpen);
  }, [aiOpen]);

  // 응답 기반 AI 액션: 패널을 열고 보류 프롬프트를 내려 자동 전송시킨다.
  const [aiPendingPrompt, setAiPendingPrompt] = useState<string | null>(null);
  function askAiAboutResponse(kind: "diagnose" | "explain") {
    setAiOpen(true);
    setAiPendingPrompt(kind === "diagnose" ? diagnosePrompt() : explainPrompt());
  }

  // AI 패널 접기(folding) — 열린 상태에서 좁게 접기/펼치기, 전역 저장
  const [aiCollapsed, setAiCollapsed] = useState<boolean>(() =>
    loadJSON("swaggerman.aiCollapsed", false),
  );
  useEffect(() => {
    saveJSON("swaggerman.aiCollapsed", aiCollapsed);
  }, [aiCollapsed]);
  const aiPanelRef = useRef<ImperativePanelHandle>(null);

  const aiProvider = useMemo(() => getProvider("claude"), []);

  // AI에 줄 현재 컨텍스트 조립(엔드포인트/폼/응답/환경변수명)
  function currentAiContext(opts?: { forForm?: boolean }): string {
    if (!selected) return "현재 선택된 엔드포인트가 없습니다.";
    const env = findActiveEnv(envs, activeEnvName, baseURL);
    const envVarNames = (env?.vars ?? []).map((v) => v.key).filter(Boolean);
    return buildAiContext({
      op: selected,
      inputs,
      response,
      envVarNames,
      baseURL,
      // 폼 채우기는 요청만 필요 → 응답 스키마 제외로 입력 토큰/지연 감소.
      includeResponseSchema: !opts?.forForm,
    });
  }

  // AI 제안 적용 후 하이라이팅할 키 목록 (2초 뒤 자동 해제)
  const [highlightedKeys, setHighlightedKeys] = useState<string[]>([]);
  const highlightTimerRef = useRef<number | null>(null);

  // AI 답변이 언급한 파라미터명 하이라이팅(노랑 점선, 적용=파랑과 구분)
  const [mentionedKeys, setMentionedKeys] = useState<string[]>([]);

  // 현재 선택된 오퍼레이션의 파라미터명 목록(AiPanel에 전달해 언급 감지에 사용)
  const opParamNames = useMemo(
    () => (selected ? selected.parameters.map((p) => p.name) : []),
    [selected],
  );

  // AI 제안을 현재 폼에 적용(실행하지 않음 — 사용자가 ⌘Enter로 실행)
  function applyAiSuggestion(s: RequestSuggestion) {
    if (!inputs) return;
    // 제안 카드는 op 전환·히스토리 복원 후에도 남으므로, 적용 시점에 현재 op 기준으로
    // 다시 필터링한다(다른 op의 path/query 키가 폼에 새는 것 방지).
    setInputs(applySuggestionForOp(inputs, s, opParamNames));
    const filtered = filterKnownParams(s, opParamNames);
    const keys = [
      ...Object.keys(filtered.pathParams ?? {}),
      ...Object.keys(filtered.queryParams ?? {}),
      ...Object.keys(filtered.headers ?? {}),
    ];
    setHighlightedKeys(keys);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedKeys([]), 2000);
    log.info("ai", "요청 제안을 폼에 적용");
  }

  function copyCurlFromSuggestion(s: RequestSuggestion) {
    if (!selected || !inputs) return;
    const merged = applySuggestion(inputs, s);
    const securityHeaders = computeSecurityHeaders(spec?.securitySchemes ?? [], authValues);
    const request = buildRequest(baseURL, selected, merged, securityHeaders, globalHeaders, activeVars);
    navigator.clipboard?.writeText(buildCurl(request)).then(
      () => log.info("ai", "제안을 cURL로 복사"),
      () => log.warn("ai", "클립보드 복사 실패"),
    );
  }

  function saveVarsFromSuggestion(s: RequestSuggestion) {
    const pairs = { ...(s.pathParams ?? {}), ...(s.queryParams ?? {}) };
    const entries = Object.entries(pairs).filter(([k, v]) => k && v && !v.includes("{{"));
    if (entries.length === 0) return;
    setEnvs((prev) => {
      const env = findActiveEnv(prev, activeEnvName, baseURL);
      if (!env) return prev;
      const vars = [...(env.vars ?? [])];
      for (const [k, v] of entries) {
        const ex = vars.find((x) => x.key === k);
        if (ex) ex.value = v;
        else vars.push({ key: k, value: v });
      }
      return prev.map((e) => (e === env ? { ...e, vars } : e));
    });
    log.info("ai", "제안 값을 환경 변수로 저장");
  }

  // 전역 줌 (Cmd/Ctrl +/-/0)
  const [zoom, setZoom] = useState<number>(() => loadJSON("swaggerman.zoom", 1));
  useEffect(() => {
    saveJSON("swaggerman.zoom", zoom);
    getCurrentWebview()
      .setZoom(zoom)
      .catch(() => {});
  }, [zoom]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 요청 취소(소프트): 진행 중 요청 id가 바뀌면 결과를 무시한다.
  const sendIdRef = useRef(0);

  // 오퍼레이션별 상태 캐시(입력값/응답). 다른 화면 갔다 와도 결과가 유지되도록.
  const opCacheRef = useRef<
    Map<
      string,
      {
        inputs: RequestInputs;
        response: HTTPResponse | null;
        lastRequest: HTTPRequest | null;
        sendError: string | null;
        assertResults: AssertionResult[];
      }
    >
  >(new Map());

  // 마지막 요청 정보 영속화: 오퍼레이션별 입력값을 프로젝트별로 저장(앱 재시작 후에도 복원).
  // 응답은 용량 문제로 저장하지 않음(히스토리가 보관).
  const [savedInputs, setSavedInputs] = useState<Record<string, RequestInputs>>({});
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.inputs.${activeSpecUrl}`, savedInputs);
  }, [savedInputs, activeSpecUrl]);
  // 입력값이 바뀔 때마다 해당 오퍼레이션의 저장본을 갱신
  useEffect(() => {
    if (selected && inputs) {
      setSavedInputs((prev) => ({ ...prev, [selected.id]: inputs }));
    }
  }, [inputs, selected]);
  // 마지막으로 보던 오퍼레이션 저장(앱 재시작 시 자동 선택)
  useEffect(() => {
    if (activeSpecUrl && selected) saveJSON(`swaggerman.lastOp.${activeSpecUrl}`, selected.id);
  }, [selected, activeSpecUrl]);

  // 영속화: 스펙별 키로 저장
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.fav.${activeSpecUrl}`, favorites);
  }, [favorites, activeSpecUrl]);
  useEffect(() => {
    if (activeSpecUrl) saveNotes(activeSpecUrl, notes);
  }, [notes, activeSpecUrl]);
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.hist.${activeSpecUrl}`, history);
  }, [history, activeSpecUrl]);
  useEffect(() => {
    if (activeSpecUrl) saveJSON(`swaggerman.auth.${activeSpecUrl}`, authValues);
  }, [authValues, activeSpecUrl]);

  // 시작 시 마지막으로 사용한 spec 자동 로드
  useEffect(() => {
    if (specUrl) loadSpec(specUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 시작 시 업데이트 확인(가능한 환경에서만)
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
  useEffect(() => {
    // 시작 시 1회 확인. 실패하면 사유를 표시해 두어(특히 사내망/프록시 환경)
    // 사용자가 원인을 알 수 있게 한다. "최신"이면 조용히 넘어감.
    // 앱의 네트워크 설정(프록시/타임아웃)을 업데이터에도 적용한다.
    checkUpdateStatus({ proxy: netSettings.proxy, timeoutMs: netSettings.timeoutMs }).then((r) => {
      if (r.kind === "available") {
        setUpdate(r.update);
      } else if (r.kind === "error") {
        setUpdateMsg(`업데이트 확인 실패: ${r.message}`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 후원 배너: 닫은 지 30분 지나면 다시 표시 (1분 간격 체크)
  const [showDonation, setShowDonation] = useState(() =>
    shouldShowDonationBanner(loadDonationDismissedAt(), Date.now()),
  );
  const [donationOpen, setDonationOpen] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      setShowDonation(shouldShowDonationBanner(loadDonationDismissedAt(), Date.now()));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  function dismissDonation() {
    saveDonationDismissedAt(Date.now());
    setShowDonation(false);
  }
  /** 카카오페이 링크는 모바일 전용이라 브라우저로 열지 않고 QR 모달을 띄운다. */
  function openDonation() {
    setDonationOpen(true);
    dismissDonation();
  }

  async function manualCheckUpdate() {
    setCheckingUpdate(true);
    setUpdateMsg(null);
    const result = await checkUpdateStatus({
      proxy: netSettings.proxy,
      timeoutMs: netSettings.timeoutMs,
    });
    if (result.kind === "available") {
      setUpdate(result.update);
      setUpdateMsg(`새 버전 v${result.update.version} 사용 가능`);
    } else if (result.kind === "latest") {
      setUpdateMsg("최신 버전입니다");
    } else {
      setUpdateMsg(`확인 실패: ${result.message}`);
    }
    setCheckingUpdate(false);
  }

  async function loadSpec(targetUrl: string = specUrl) {
    setSpecUrl(targetUrl);
    setLoading(true);
    setLoadError(null);
    log.info("spec", `로딩 시작: ${targetUrl}`);
    try {
      const parsed = await loadSpecFromUrl(targetUrl, netSettings.insecure);
      log.info(
        "spec",
        `로딩 성공: "${parsed.info.title}" (오퍼레이션 ${parsed.operations.length}개)`,
      );
      setSpec(parsed);
      setBaseURL(deriveBaseURL(targetUrl, parsed.servers));
      setActiveSpecUrl(targetUrl);
      saveJSON("swaggerman.lastSpecUrl", targetUrl);
      // 프로젝트 목록에 upsert(최근 것을 맨 앞으로). 기존 프로젝트의 사용자 지정
      // 이름이 있으면 보존하고, 신규일 때만 스펙 title을 사용한다.
      setProjects((prev) => {
        const existing = prev.find((p) => p.url === targetUrl);
        return [
          { url: targetUrl, title: existing?.title || parsed.info.title || targetUrl },
          ...prev.filter((p) => p.url !== targetUrl),
        ];
      });
      setFavorites(loadJSON(`swaggerman.fav.${targetUrl}`, [] as string[]));
      setNotes(loadNotes(targetUrl));
      setHistory(loadJSON(`swaggerman.hist.${targetUrl}`, [] as HistoryItem[]));
      setAuthValues(loadJSON(`swaggerman.auth.${targetUrl}`, {} as Record<string, string>));
      setEnvs(loadJSON(`swaggerman.envs.${targetUrl}`, [] as Env[]));
      setActiveEnvName(loadJSON(`swaggerman.activeEnv.${targetUrl}`, ""));
      setChainVars({});
      setExtractRules(
        loadJSON(`swaggerman.extract.${targetUrl}`, {} as Record<string, ExtractRule[]>),
      );
      setAssertions(loadJSON(`swaggerman.assert.${targetUrl}`, {} as Record<string, Assertion[]>));
      setAssertResults([]);
      setSchemaIssues([]);
      setOauth2Config(loadJSON(`swaggerman.oauth2.${targetUrl}`, emptyOAuth2Config()));
      setBodySamples(
        loadJSON(`swaggerman.samples.${targetUrl}`, {} as Record<string, RequestSample[]>),
      );
      setGlobalHeaders(loadJSON(`swaggerman.headers.${targetUrl}`, [] as RequestParam[]));
      opCacheRef.current.clear();
      // 마지막 위치·요청 정보 복원: 저장된 입력값 로드 + 마지막으로 보던 오퍼레이션 자동 선택
      const savedIns = loadJSON(
        `swaggerman.inputs.${targetUrl}`,
        {} as Record<string, RequestInputs>,
      );
      setSavedInputs(savedIns);
      const lastOpId = loadJSON(`swaggerman.lastOp.${targetUrl}`, "");
      const lastOp = parsed.operations.find((o) => o.id === lastOpId);
      if (lastOp) {
        setSelected(lastOp);
        setInputs(restoreInputs(savedIns, lastOp));
        log.info("ui", `마지막 위치 복원: ${lastOp.method} ${lastOp.path}`);
      } else {
        setSelected(null);
        setInputs(null);
      }
      setResponse(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error("spec", `로딩 실패: ${msg}`);
      setLoadError(msg);
      setSpec(null);
    } finally {
      setLoading(false);
    }
  }

  function removeProject(url: string) {
    setProjects((prev) => prev.filter((p) => p.url !== url));
    localStorage.removeItem(`swaggerman.fav.${url}`);
    localStorage.removeItem(`swaggerman.hist.${url}`);
    localStorage.removeItem(`swaggerman.auth.${url}`);
    localStorage.removeItem(`swaggerman.inputs.${url}`);
    localStorage.removeItem(`swaggerman.lastOp.${url}`);
  }

  // 프로젝트 관리 모달(목록 추가/수정/삭제)
  const [projectsOpen, setProjectsOpen] = useState(false);

  // 히스토리 비교 모달(2건)
  const [compareItems, setCompareItems] = useState<[HistoryItem, HistoryItem] | null>(null);
  function addProject(title: string, url: string) {
    const u = url.trim();
    if (!u) return;
    setProjects((prev) => [{ url: u, title: title.trim() || u }, ...prev.filter((p) => p.url !== u)]);
    setProjectsOpen(false);
    loadSpec(u); // title은 위에서 등록돼 loadSpec이 보존
  }

  // 현재 오퍼레이션의 라이브 상태를 캐시에 저장
  function stashCurrent() {
    if (selected && inputs) {
      opCacheRef.current.set(selected.id, {
        inputs,
        response,
        lastRequest,
        sendError,
        assertResults,
      });
    }
  }

  function selectOperation(op: ParsedOperation) {
    stashCurrent();
    setSelectedHistory(null);
    setHighlightedKeys([]);
    setMentionedKeys([]);
    setSelected(op);
    const cached = opCacheRef.current.get(op.id);
    if (cached) {
      setInputs(cached.inputs);
      setResponse(cached.response);
      setLastRequest(cached.lastRequest);
      setSendError(cached.sendError);
      setAssertResults(cached.assertResults ?? []);
      setResponseTab(cached.response ? "response" : "docs");
    } else {
      // 메모리 캐시 없음 → 저장된 입력값(앱 재시작 전 마지막 값) → 스펙 기본값
      setInputs(restoreInputs(savedInputs, op));
      setResponse(null);
      setLastRequest(null);
      setSendError(null);
      setAssertResults([]);
      setSchemaIssues([]);
      setResponseTab("docs");
    }
    log.debug("ui", `오퍼레이션 선택: ${op.method} ${op.path}`);
  }

  async function sendWith(op: ParsedOperation, ins: RequestInputs) {
    const myId = ++sendIdRef.current;
    setSelectedHistory(null);
    setSending(true);
    setSendError(null);
    try {
      const securityHeaders = computeSecurityHeaders(spec?.securitySchemes ?? [], authValues);
      const request = buildRequest(baseURL, op, ins, securityHeaders, globalHeaders, activeVars);
      setLastRequest(request);
      log.info("request", `${request.method} ${request.url}`);
      const res = await executeRequest(request, netSettings);
      if (sendIdRef.current !== myId) {
        log.debug("request", "응답 무시(취소됨)");
        return; // 취소됨
      }
      log.info("request", `응답 ${res.statusCode} (${res.durationMs}ms, ${res.size}B)`);
      setResponse(res);
      setResponseTab("response");
      // 체이닝: 응답에서 변수 추출 → 다음 요청에 사용
      const extracted = applyExtractRules(res.body, extractRules[op.id] ?? []);
      if (Object.keys(extracted).length > 0) {
        log.info("chain", `변수 추출: ${Object.keys(extracted).join(", ")}`);
        setChainVars((prev) => ({ ...prev, ...extracted }));
      }
      // 어서션: 응답 검증 결과 표시
      const results = runAssertions(res.statusCode, res.body, assertions[op.id] ?? []);
      if (results.length > 0) {
        log.info("assert", `${results.filter((r) => r.ok).length}/${results.length} 통과`);
      }
      setAssertResults(results);
      // 스펙 인지: 응답을 OpenAPI 응답 스키마와 대조
      // 대용량 본문은 자동 스키마 검증 생략(동기 JSON.parse 비용)
      const SCHEMA_VALIDATE_LIMIT = 5 * 1024 * 1024; // 5MB
      const skipSchemaValidate = res.body.length > SCHEMA_VALIDATE_LIMIT;
      if (skipSchemaValidate) log.info("schema", "본문 5MB 초과: 스키마 검증 생략");
      const issues = skipSchemaValidate
        ? []
        : validateResponseBody(op, res.statusCode, res.body);
      if (issues.length > 0) log.warn("schema", `응답 스키마 불일치 ${issues.length}건`);
      setSchemaIssues(issues);
      opCacheRef.current.set(op.id, {
        inputs: ins,
        response: res,
        lastRequest: request,
        sendError: null,
        assertResults: results,
      });
      const clamped = clampHistoryBody(res.body);
      const item: HistoryItem = {
        id: newId(),
        opId: op.id,
        method: op.method,
        path: op.path,
        url: request.url,
        status: res.statusCode,
        durationMs: res.durationMs,
        size: res.size,
        executedAt: Date.now(),
        inputs: ins,
        responseHeaders: res.headers,
        responseBody: clamped.body,
        bodyTruncated: clamped.truncated || undefined,
      };
      setHistory((prev) => [item, ...prev].slice(0, 200));
    } catch (e) {
      if (sendIdRef.current !== myId) return; // 취소됨
      const msg = e instanceof Error ? e.message : String(e);
      log.error("request", `요청 실패: ${msg}`);
      setSendError(msg);
      setResponse(null);
      setAssertResults([]);
      setSchemaIssues([]);
    } finally {
      if (sendIdRef.current === myId) setSending(false);
    }
  }

  function send() {
    if (selected && inputs) sendWith(selected, inputs);
  }

  function cancelSend() {
    sendIdRef.current += 1;
    setSending(false);
  }

  // cURL 가져오기: ad-hoc 오퍼레이션으로 요청 화면에 표시
  function importCurl(op: ParsedOperation, ins: RequestInputs, importedBaseURL: string) {
    stashCurrent();
    setSelectedHistory(null);
    setAssertResults([]);
    setSchemaIssues([]);
    setBaseURL(importedBaseURL);
    setSelected(op);
    setInputs(ins);
    setResponse(null);
    setLastRequest(null);
    setSendError(null);
    setResponseTab("docs");
    log.info("curl", `import: ${op.method} ${importedBaseURL}${op.path}`);
  }

  // 현재 화면 요청을 공유 페이로드로 변환(선택된 operation + inputs 기준).
  function currentShareable(): ShareableRequest | null {
    if (!selected || !inputs) return null;
    const url = buildRequestUrl(baseURL, selected, inputs, false, activeVars);
    const note = notes[selected.id];
    return {
      v: 1,
      method: selected.method,
      url,
      baseURL,
      pathParams: inputs.pathParams,
      queryParams: inputs.queryParams.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled })),
      headers: inputs.headers.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled })),
      body: inputs.body,
      bodyMode: inputs.bodyMode,
      note: note ? { text: note.text, status: note.status } : undefined,
    };
  }

  // 공유 코드 적용: ad-hoc operation으로 요청 화면에 반영(cURL import와 동일 경로).
  function applyShared(req: ShareableRequest) {
    let pathname = "/";
    let origin = req.baseURL ?? "";
    try {
      const u = new URL(req.url);
      pathname = u.pathname || "/";
      if (!origin) origin = u.origin;
    } catch {
      /* URL 파싱 실패 시 기본값 유지 */
    }
    const op: ParsedOperation = {
      id: `share:${req.method} ${pathname}`,
      method: req.method as HTTPMethod,
      path: pathname,
      tags: ["공유"],
      summary: "공유받은 요청",
      parameters: [],
      requestBody: req.body ? { required: false, contentType: "application/json" } : undefined,
      responses: [],
    };
    const ins: RequestInputs = {
      pathParams: req.pathParams ?? {},
      queryParams: req.queryParams ?? [],
      headers: req.headers ?? [],
      body: req.body ?? "",
      bodyMode: req.bodyMode as RequestInputs["bodyMode"],
    };
    importCurl(op, ins, origin);
    // 메모가 포함됐으면 해당 operation에 적용
    if (req.note) {
      updateNote(op.id, { text: req.note.text, status: req.note.status as ApiNote["status"], updatedAt: Date.now() });
    }
  }

  // 최신 send를 ref로 보관(전역 단축키에서 stale closure 방지)
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘/Ctrl + Enter: 전송
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!sending) sendRef.current();
      }
      // ⌘/Ctrl + K: 커맨드 팔레트
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen(true);
      }
      // ⌘/Ctrl + N: 새 창 (다른 프로젝트를 동시에 보기) — 확인 다이얼로그를 거친다
      if ((e.metaKey || e.ctrlKey) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setNewWindowConfirm(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sending]);

  function toggleFavorite(opId: string) {
    setFavorites((prev) =>
      prev.includes(opId) ? prev.filter((x) => x !== opId) : [...prev, opId],
    );
  }

  function updateNote(opId: string, note: ApiNote) {
    setNotes((prev) => ({ ...prev, [opId]: note }));
  }

  function selectHistory(item: HistoryItem) {
    stashCurrent();
    setAssertResults([]);
    setSchemaIssues([]);
    setHighlightedKeys([]);
    setMentionedKeys([]);
    setSelectedHistory(item);
    const op = spec?.operations.find((o) => o.id === item.opId);
    if (op) {
      setSelected(op);
      setInputs(item.inputs);
    }
    setResponse({
      statusCode: item.status,
      headers: item.responseHeaders,
      body: item.responseBody,
      durationMs: item.durationMs,
      size: item.size,
    });
    setSendError(null);
    setResponseTab("response");
  }

  function replayHistory(item: HistoryItem) {
    const op = spec?.operations.find((o) => o.id === item.opId);
    if (!op) return;
    setSelected(op);
    setInputs(item.inputs);
    sendWith(op, item.inputs);
  }

  const title = useMemo(() => spec?.info.title ?? "Swagger Man", [spec]);

  return (
    <div className="app">
      {loading && <LoadingOverlay url={specUrl} />}
      {update && (
        <div className="update-banner">
          <span>🚀 새 버전 v{update.version} 사용 가능</span>
          <button
            className="btn small primary"
            disabled={updating}
            onClick={async () => {
              setUpdating(true);
              setUpdateError(null);
              try {
                await update.install();
              } catch (e) {
                setUpdating(false);
                setUpdateError(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            {updating ? "설치 중…" : "지금 설치 후 재시작"}
          </button>
          <button className="btn small" onClick={() => setUpdate(null)}>
            나중에
          </button>
          {updateError && <span className="update-error">설치 실패: {updateError}</span>}
        </div>
      )}
      {showDonation && (
        <div className="donation-banner">
          <CoffeeIcon size={18} />
          <span>이 앱이 도움이 됐다면 개발자에게 커피 한 잔 어때요?</span>
          <button className="btn small donate" onClick={openDonation}>
            ☕ 커피 사주기
          </button>
          <button
            className="icon-btn donation-close"
            title="닫기 (30분 뒤 다시 표시)"
            onClick={dismissDonation}
          >
            <CloseCircleIcon size={16} />
          </button>
        </div>
      )}
      <header className="topbar">
        <span className="brand">{title}</span>
        {projects.length > 0 && (
          <Select
            className="project-select"
            value={activeSpecUrl}
            onChange={(url) => loadSpec(url)}
            title="저장된 프로젝트 전환"
            placeholder="프로젝트 선택…"
            options={projects.map((p) => ({ value: p.url, label: p.title }))}
          />
        )}
        <button
          className="btn"
          title="프로젝트 관리(목록 추가·수정·삭제)"
          onClick={() => setProjectsOpen(true)}
        >
          ✏️
        </button>
        <input
          className="spec-url"
          value={specUrl}
          onChange={(e) => setSpecUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadSpec()}
          placeholder="OpenAPI spec URL (예: /v3/api-docs, /swagger-ui/index.html)"
          spellCheck={false}
        />
        <button
          className="btn primary"
          onClick={() => loadSpec()}
          disabled={loading}
          title="입력한 OpenAPI 스펙 URL을 불러와 좌측에 엔드포인트 목록을 채웁니다 (입력란에서 Enter로도 가능)"
        >
          {loading ? "로딩…" : "Load"}
        </button>
        <button
          className="btn"
          title="cURL 명령을 붙여넣어 요청으로 가져오기"
          onClick={() => setCurlModalOpen(true)}
        >
          cURL
        </button>
        <button
          className="btn"
          title="현재 요청을 공유 코드로 내보내거나, 받은 코드를 가져옵니다"
          onClick={() => setShareOpen(true)}
        >
          공유
        </button>
        <button
          className="btn"
          title="컬렉션(저장 요청) · Postman/네이티브 가져오기·내보내기"
          onClick={() => setCollectionsOpen(true)}
        >
          컬렉션
        </button>
        <button
          className="btn"
          title="컬렉션의 요청을 일괄 실행하고 통과/실패 리포트(러너)"
          onClick={() => setRunnerOpen(true)}
        >
          러너
        </button>
        <button
          className="btn"
          title="Mock 서버 — 스펙 기반 가짜 API 서버를 로컬에 띄웁니다"
          onClick={() => setMockOpen(true)}
          disabled={!spec}
        >
          Mock
        </button>
        <button
          className="btn"
          title="새 창 열기 — 다른 프로젝트를 동시에 볼 수 있습니다 (⌘N)"
          onClick={() => setNewWindowConfirm(true)}
        >
          새 창
        </button>
        <button
          className="gear-icon-btn"
          title="네트워크 설정(타임아웃/SSL/프록시) · 쿠키 관리"
          onClick={() => setSettingsOpen(true)}
          aria-label="설정"
        >
          ⚙︎
        </button>
        {activeSpecUrl && projects.some((p) => p.url === activeSpecUrl) && (
          <button
            className="btn btn-icon"
            title="이 프로젝트를 목록에서 삭제(히스토리/즐겨찾기 포함)"
            onClick={() => removeProject(activeSpecUrl)}
          >
            <CloseCircleIcon size={14} />
          </button>
        )}
      </header>

      {spec && (
        <div className="config-bar">
          <button
            className="btn small"
            title="명세 새로고침(다시 불러오기)"
            onClick={() => loadSpec(activeSpecUrl || specUrl)}
            disabled={loading}
          >
            ↻
          </button>
          <label className="config-field">
            <span className="config-label">Base URL</span>
            <input
              className="base-url"
              value={baseURL}
              onChange={(e) => {
                setBaseURL(e.target.value);
                // 수동 입력 = 사용자 지정 → 활성 환경 해제
                setActiveEnvName("");
              }}
              placeholder="https://api.example.com"
              spellCheck={false}
            />
          </label>
          <div className="env-bar">
            <Select
              className="env-select"
              value={activeEnvName || (findActiveEnv(envs, "", baseURL)?.name ?? "")}
              onChange={(name) => {
                setActiveEnvName(name);
                const env = envs.find((x) => x.name === name);
                if (env) setBaseURL(env.baseURL);
              }}
              title="환경(Base URL) 전환"
              options={[
                { value: "", label: "사용자 지정" },
                ...envs.map((env) => ({ value: env.name, label: env.name, hint: env.baseURL })),
              ]}
            />
            <button
              className="btn small"
              title="환경 추가/수정/삭제"
              onClick={() => setEnvModalOpen(true)}
            >
              환경 관리
            </button>
            <button
              className="btn small"
              title="모든 요청에 적용되는 전역 헤더 관리"
              onClick={() => setHeaderModalOpen(true)}
            >
              전역 헤더 설정
              {globalHeaders.filter((h) => h.enabled && h.key).length > 0 && (
                <span className="count-badge">
                  {globalHeaders.filter((h) => h.enabled && h.key).length}개
                </span>
              )}
            </button>
          </div>
          {spec.securitySchemes.length > 0 &&
            (() => {
              const activeCount = spec.securitySchemes.filter(
                (s) => (authValues[s.name] ?? "").trim() !== "",
              ).length;
              return (
                <button
                  className="btn small authorize-btn"
                  title="인증(보안 스킴) 토큰 설정"
                  onClick={() => setAuthModalOpen(true)}
                >
                  {activeCount > 0 ? "🔓" : "🔒"} Authorize
                  {activeCount > 0 && (
                    <span className="count-badge">
                      {activeCount}/{spec.securitySchemes.length}
                    </span>
                  )}
                </button>
              );
            })()}
          <button
            className="btn small"
            title="업데이트 확인"
            onClick={manualCheckUpdate}
            disabled={checkingUpdate}
          >
            {checkingUpdate ? "확인 중…" : "업데이트 확인"}
          </button>
          {updateMsg && <span className="update-msg">{updateMsg}</span>}
          <button
            className={aiOpen ? "btn small primary" : "btn small"}
            title="AI 어시스턴트 패널 열기/닫기"
            onClick={() => setAiOpen((v) => !v)}
          >
            ✦ AI
          </button>
          <button
            className="btn small"
            title={theme === "dark" ? "라이트 테마로" : "다크 테마로"}
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "☀︎" : "☾"}
          </button>
          <div className="zoom-controls">
            <button
              className="btn small"
              onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))}
            >
              −
            </button>
            <span className="muted">{Math.round(zoom * 100)}%</span>
            <button
              className="btn small"
              onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
            >
              +
            </button>
          </div>
        </div>
      )}

      <PanelGroup direction="horizontal" className="panes" autoSaveId="swaggerman-panes">
        <Panel id="sidebar" order={1} defaultSize={24} minSize={14} className="pane">
          <Sidebar
            spec={spec}
            loading={loading}
            error={loadError}
            selectedId={selected?.id ?? null}
            onSelect={selectOperation}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            history={history}
            onSelectHistory={selectHistory}
            onCompareHistory={(a, b) => setCompareItems([a, b])}
            onReplayHistory={replayHistory}
            onDeleteHistory={(id) => setHistory((prev) => prev.filter((h) => h.id !== id))}
            onClearHistory={() => setHistory([])}
            selectedHistoryId={selectedHistory?.id ?? null}
            notes={notes}
          />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel id="request" order={2} defaultSize={38} minSize={20} className="pane">
          <RequestEditor
            operation={selected}
            inputs={inputs}
            baseURL={baseURL}
            globalHeaders={globalHeaders}
            vars={activeVars}
            varDetails={varDetails}
            sending={sending}
            onChange={setInputs}
            onSend={send}
            onCancel={cancelSend}
            samples={selected ? (bodySamples[selected.id] ?? []) : []}
            onSaveSample={(name) => {
              if (selected && inputs) saveSample(selected.id, name, inputs);
            }}
            onDeleteSample={(name) => {
              if (selected) deleteSample(selected.id, name);
            }}
            historyItem={selectedHistory}
            extractRules={selected ? (extractRules[selected.id] ?? []) : []}
            assertions={selected ? (assertions[selected.id] ?? []) : []}
            assertResults={assertResults}
            onExtractChange={(rules) => {
              if (selected) setExtractRules((prev) => ({ ...prev, [selected.id]: rules }));
            }}
            onAssertChange={(asserts) => {
              if (selected) setAssertions((prev) => ({ ...prev, [selected.id]: asserts }));
            }}
            highlightKeys={highlightedKeys}
            mentionKeys={mentionedKeys}
            note={selected ? (notes[selected.id] ?? emptyNote()) : emptyNote()}
            onNoteChange={(note) => {
              if (selected) updateNote(selected.id, note);
            }}
          />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel id="response" order={3} defaultSize={38} minSize={20} className="pane">
          <ResponseView
            response={response}
            request={lastRequest}
            operation={selected}
            sending={sending}
            error={sendError}
            tab={responseTab}
            onTab={setResponseTab}
            historyItem={selectedHistory}
            schemaIssues={schemaIssues}
            onAskAi={askAiAboutResponse}
          />
        </Panel>
        {aiOpen && (
          <>
            <PanelResizeHandle className="resize-handle" />
            <Panel
              id="ai"
              order={4}
              ref={aiPanelRef}
              collapsible
              collapsedSize={4}
              defaultSize={aiCollapsed ? 4 : 26}
              minSize={16}
              onCollapse={() => setAiCollapsed(true)}
              onExpand={() => setAiCollapsed(false)}
              className="pane"
            >
              {/* 접힘 스트립과 본문을 둘 다 마운트해 두고 CSS로 전환한다.
                  AiPanel을 언마운트하면 대화(messages) state가 사라지므로,
                  접어도 unmount하지 않고 display로만 숨겨 대화를 보존한다. */}
              {aiCollapsed && (
                <button
                  className="ai-collapsed-strip"
                  title="AI 패널 펼치기"
                  onClick={() => aiPanelRef.current?.expand()}
                >
                  ✦
                </button>
              )}
              <div className="ai-panel-wrap" style={{ display: aiCollapsed ? "none" : "flex" }}>
                <div className="ai-collapse-bar">
                  <button
                    className="ai-collapse-btn"
                    title="AI 패널 접기"
                    onClick={() => aiPanelRef.current?.collapse()}
                  >
                    »
                  </button>
                </div>
                <div className="ai-panel-body">
                  <AiPanel
                    provider={aiProvider}
                    buildContext={currentAiContext}
                    onApplySuggestion={applyAiSuggestion}
                    paramNames={opParamNames}
                    onMentions={setMentionedKeys}
                    specUrl={activeSpecUrl}
                    pendingPrompt={aiPendingPrompt ?? undefined}
                    onPendingConsumed={() => setAiPendingPrompt(null)}
                    onCopyCurl={copyCurlFromSuggestion}
                    onSaveVars={saveVarsFromSuggestion}
                    claudePath={claudePath || undefined}
                  />
                </div>
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>

      {envModalOpen && (
        <EnvironmentsModal
          envs={envs}
          currentBaseURL={baseURL}
          onChange={setEnvs}
          onApply={setBaseURL}
          onClose={() => setEnvModalOpen(false)}
        />
      )}
      {headerModalOpen && (
        <GlobalHeadersModal
          headers={globalHeaders}
          onChange={setGlobalHeaders}
          onClose={() => setHeaderModalOpen(false)}
        />
      )}
      {curlModalOpen && (
        <CurlImportModal onImport={importCurl} onClose={() => setCurlModalOpen(false)} />
      )}
      {compareItems && (
        <CompareModal a={compareItems[0]} b={compareItems[1]} onClose={() => setCompareItems(null)} />
      )}
      {projectsOpen && (
        <ProjectsModal
          projects={projects}
          activeUrl={activeSpecUrl}
          onUpdate={setProjects}
          onLoad={(url) => {
            setProjectsOpen(false);
            loadSpec(url);
          }}
          onDelete={removeProject}
          onAdd={addProject}
          onClose={() => setProjectsOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          settings={netSettings}
          onChange={setNetSettings}
          onClose={() => setSettingsOpen(false)}
          claudePath={claudePath}
          onClaudePathChange={setClaudePath}
        />
      )}
      {donationOpen && <DonationModal onClose={() => setDonationOpen(false)} />}
      {paletteOpen && (
        <CommandPalette
          operations={spec?.operations ?? []}
          collections={collections}
          onSelectOperation={selectOperation}
          onSelectSaved={(s) => {
            const { operation, inputs: ins, baseURL: b } = savedToRequest(s);
            importCurl(operation, ins, b);
          }}
          onClose={() => setPaletteOpen(false)}
          onAskAiResponse={askAiAboutResponse}
          hasResponse={!!response}
          responseIsError={!!response && response.statusCode >= 400}
        />
      )}
      {runnerOpen && (
        <RunnerModal collections={collections} onRun={runSaved} onClose={() => setRunnerOpen(false)} />
      )}
      {mockOpen && spec && (
        <MockServerModal
          spec={spec}
          specUrl={activeSpecUrl || specUrl}
          history={history}
          onClose={() => setMockOpen(false)}
        />
      )}
      {shareOpen && (
        <ShareModal
          current={currentShareable()}
          onApply={applyShared}
          onClose={() => setShareOpen(false)}
        />
      )}
      {collectionsOpen && (
        <CollectionsModal
          collections={collections}
          onChange={setCollections}
          current={
            selected && inputs
              ? {
                  method: selected.method,
                  url: buildRequestUrl(baseURL, selected, inputs, false, activeVars),
                  headers: inputs.headers,
                  body: inputs.body,
                }
              : null
          }
          onLoad={(s) => {
            const { operation, inputs: ins, baseURL: b } = savedToRequest(s);
            importCurl(operation, ins, b);
          }}
          onClose={() => setCollectionsOpen(false)}
        />
      )}
      {authModalOpen && spec && (
        <AuthorizeModal
          schemes={spec.securitySchemes}
          values={authValues}
          onChange={setAuthValues}
          onClose={() => setAuthModalOpen(false)}
          oauth2={oauth2Config}
          onOauth2Change={setOauth2Config}
          onFetchToken={(cfg) => fetchOAuth2Token(cfg, (req) => executeRequest(req, netSettings))}
        />
      )}
      {newWindowConfirm && (
        <ConfirmDialog
          title="새 창 열기"
          message={"추가로 SwaggerMan 창을 생성하시겠습니까?\n다른 프로젝트를 동시에 볼 수 있습니다."}
          confirmLabel="새 창 열기"
          onConfirm={() => {
            setNewWindowConfirm(false);
            openNewWindow((msg) => setUpdateMsg(`새 창 생성 실패: ${msg}`));
          }}
          onCancel={() => setNewWindowConfirm(false)}
        />
      )}
    </div>
  );
}
