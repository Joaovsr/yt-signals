import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Logo } from "../components/Logo";
import { analyzeVideo } from "../lib/api";
import type { AnalysisResult } from "../lib/analysis";
import { HISTORY_KEY, readSearchHistory, rememberSearch } from "../lib/history";
import { currentVideoId, requestKey, selectionKey } from "./context";
import "../styles.css";
import "./sidepanel.css";

const requestSchema = z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), nonce: z.string().min(1), requestedAt: z.number().nonnegative() });
const selectionSchema = z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/), pageUrl: z.string().url() });

export function VideoInsights({ videoId, requestId }: { videoId: string | null; requestId?: string | null }) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadedVideoId, setLoadedVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const consumedRequest = useRef<string | null>(null);

  const analyze = useCallback(async () => {
    if (!videoId || activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true); setError(null); setSaved(false);
    try {
      const analysis = await analyzeVideo(`https://www.youtube.com/watch?v=${videoId}`, controller.signal);
      if (activeRequest.current !== controller || controller.signal.aborted) return;
      setResult(analysis);
      await rememberSearch(analysis.video.url, analysis);
      if (activeRequest.current === controller) setSaved(true);
    } catch (caught) {
      if (activeRequest.current === controller) setError(caught instanceof Error ? caught.message : "Não foi possível analisar o vídeo.");
    } finally {
      if (activeRequest.current === controller) { activeRequest.current = null; setLoading(false); }
    }
  }, [videoId]);

  useEffect(() => {
    let disposed = false;
    setResult(null); setSaved(false); setError(null); setLoading(false); setLoadedVideoId(null);
    if (videoId) {
      void readSearchHistory().then((items) => {
        if (disposed) return;
        const item = items.find((entry) => entry.result.video.videoId === videoId);
        if (item) { setResult(item.result); setSaved(true); }
        setLoadedVideoId(videoId);
      }).catch(() => { if (!disposed) setError("Não foi possível carregar as análises salvas."); });
    }
    const sync = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local" || !changes[HISTORY_KEY] || activeRequest.current) return;
      void readSearchHistory().then((items) => {
        if (disposed) return;
        const item = items.find((entry) => entry.result.video.videoId === videoId);
        if (item) setResult(item.result);
        setSaved(Boolean(item));
      }).catch(() => { if (!disposed) setError("Não foi possível atualizar as análises salvas."); });
    };
    if (typeof chrome !== "undefined" && chrome.runtime?.id) chrome.storage.onChanged.addListener(sync);
    return () => {
      disposed = true;
      if (typeof chrome !== "undefined" && chrome.runtime?.id) chrome.storage.onChanged.removeListener(sync);
      const controller = activeRequest.current;
      activeRequest.current = null;
      controller?.abort();
    };
  }, [videoId]);

  const visibleResult = result?.video.videoId === videoId ? result : null;
  useEffect(() => {
    if (videoId && loadedVideoId === videoId && requestId && consumedRequest.current !== requestId) {
      consumedRequest.current = requestId;
      if (!visibleResult) void analyze();
    }
  }, [videoId, loadedVideoId, requestId, visibleResult, analyze]);

  const openAnalytics = async () => {
    if (!visibleResult || !saved || loading) return;
    try { await chrome.tabs.create({ url: chrome.runtime.getURL(`index.html?videoId=${videoId}`) }); }
    catch { setError("Não foi possível abrir a análise completa. Tente novamente."); }
  };
  const saveAgain = async () => {
    if (!visibleResult) return;
    try { await rememberSearch(visibleResult.video.url, visibleResult); setSaved(true); setError(null); }
    catch { setError("Não foi possível salvar a análise. Libere espaço e tente novamente."); }
  };

  return <main className="extension-panel">
    <header className="extension-header"><div className="brand"><Logo /><span>YT SIGNALS</span></div><span className="extension-caption">INSIGHTS</span></header>
    {!videoId ? <section className="extension-empty"><p className="kicker">NO YOUTUBE</p><h1>Escolha um vídeo para analisar.</h1><p>Clique em “Ver insights” no card de um vídeo da página inicial ou da busca. Você não precisa abrir o vídeo.</p></section> : <>
      <section className="extension-video"><p className="kicker">LEITURA DA AUDIÊNCIA</p><h1>{visibleResult?.video.title ?? "Insights deste vídeo"}</h1><p>{visibleResult?.video.channel ?? "Resumo da descrição e dos comentários públicos."}</p></section>
      {error && <div className="error-message" role="alert">{error}</div>}
      {loading && <div className="extension-loading" role="status"><span className="extension-spinner" /><div><strong>Analisando o vídeo</strong><p>Pode levar alguns minutos. Mantenha este painel aberto.</p></div></div>}
      {visibleResult && <>
        <section className="extension-section"><h2>Resumo</h2><p className="extension-summary">{visibleResult.video.summary}</p><small>Base: descrição do criador e amostra de comentários.</small></section>
        <section className="extension-section"><div className="extension-section-heading"><h2>Sentimento</h2><small>{visibleResult.video.commentCountAnalyzed} comentários</small></div>
          <div className="extension-sentiment-bar" aria-hidden="true">{(["positive", "neutral", "negative"] as const).map((kind) => <span key={kind} className={kind} style={{ width: `${visibleResult.video.sentiment[kind]}%` }} />)}</div>
          <dl className="extension-sentiments">{([["positive", "Positivo"], ["neutral", "Neutro"], ["negative", "Negativo"]] as const).map(([kind, label]) => <div key={kind}><dt>{label}</dt><dd>{visibleResult.video.sentiment[kind]}%</dd></div>)}</dl>
        </section>
        <section className="extension-section"><h2>Principais temas</h2><ul className="extension-topics">{[...visibleResult.video.tags].sort((a, b) => b.commentCount - a.commentCount).slice(0, 4).map((tag) => <li key={tag.id}><span>{tag.label}</span><span>{tag.commentCount}</span></li>)}</ul></section>
        <section className="extension-section"><h2>O que se destaca</h2><ul className="extension-takeaways">{visibleResult.takeaways.slice(0, 3).map((text) => <li key={text}>{text}</li>)}</ul></section>
        <p className="extension-date">Análise de {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(visibleResult.generatedAt))}</p>
        <button className="analyze-button" type="button" disabled={!saved || loading} onClick={() => void openAnalytics()}>Abrir análise completa <span aria-hidden="true">↗</span></button>
        {!saved && !loading && <button className="extension-secondary" type="button" onClick={() => void saveAgain()}>Tentar salvar novamente</button>}
      </>}
      <button className={visibleResult ? "extension-secondary" : "analyze-button"} type="button" disabled={loading} onClick={() => void analyze()}>{loading ? "Analisando…" : visibleResult ? "Atualizar análise" : "Analisar este vídeo"}</button>
      {!visibleResult && !loading && <p className="extension-note">Até 100 comentários relevantes. A análise começa quando você solicita.</p>}
    </>}
  </main>;
}

export default function SidePanel() {
  const [context, setContext] = useState<{ videoId: string | null; requestId?: string | null }>({ videoId: null });
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
    let disposed = false;
    let tabId: number | undefined;
    let revision = 0;
    const fixedId = new URLSearchParams(location.search).get("tabId");
    const load = async () => {
      const version = ++revision;
      const tab = fixedId !== null && /^\d+$/.test(fixedId) ? await chrome.tabs.get(Number(fixedId)) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (disposed || version !== revision) return;
      tabId = tab?.id;
      const key = tabId === undefined ? null : requestKey(tabId);
      const selectedKey = tabId === undefined ? null : selectionKey(tabId);
      const stored = key && selectedKey ? await chrome.storage.session.get([key, selectedKey]) : {};
      if (disposed || version !== revision) return;
      const selected = selectionSchema.safeParse(selectedKey ? stored[selectedKey] : null);
      const videoId = selected.success && selected.data.pageUrl === tab?.url
        ? selected.data.videoId : currentVideoId(tab?.url ?? "");
      const request = requestSchema.safeParse(key ? stored[key] : null);
      const valid = request.success && request.data.videoId === videoId && Date.now() - request.data.requestedAt >= 0 && Date.now() - request.data.requestedAt < 15_000;
      setContext({ videoId, requestId: valid ? request.data.nonce : null });
      if (key && stored[key]) await chrome.storage.session.remove(key);
    };
    const update = (id: number, change: chrome.tabs.OnUpdatedInfo) => { if (id === tabId && change.url) void load().catch(() => setContext({ videoId: null })); };
    const storageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "session" && tabId !== undefined && changes[requestKey(tabId)]?.newValue) void load().catch(console.error);
    };
    const activated = () => { if (fixedId === null) void load().catch(console.error); };
    chrome.tabs.onUpdated.addListener(update);
    chrome.tabs.onActivated.addListener(activated);
    chrome.storage.onChanged.addListener(storageChanged);
    void load().catch(() => setContext({ videoId: null }));
    return () => { disposed = true; chrome.tabs.onUpdated.removeListener(update); chrome.tabs.onActivated.removeListener(activated); chrome.storage.onChanged.removeListener(storageChanged); };
  }, []);
  return <VideoInsights {...context} />;
}
