// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SidePanel, { VideoInsights } from "./SidePanel";
import { analyzeVideo } from "../lib/api";
import { readSearchHistory, rememberSearch } from "../lib/history";
import { analysisFixture } from "../test/analysisFixture";
import { requestKey, selectionKey } from "./context";

vi.mock("../lib/api", () => ({ analyzeVideo: vi.fn() }));
vi.mock("../lib/history", () => ({ readSearchHistory: vi.fn(), rememberSearch: vi.fn() }));

beforeEach(() => {
  vi.mocked(readSearchHistory).mockResolvedValue([]);
  vi.mocked(rememberSearch).mockResolvedValue([]);
  vi.mocked(analyzeVideo).mockResolvedValue(analysisFixture);
  vi.stubGlobal("chrome", { tabs: { create: vi.fn().mockResolvedValue({}) }, runtime: { getURL: (path: string) => `chrome-extension://signals/${path}` } });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("extension insights", () => {
  it("shows instructions outside a video without calling the API", () => {
    render(<VideoInsights videoId={null} requestId="click" />);
    expect(screen.getByRole("heading", { name: "Escolha um vídeo para analisar." })).toBeTruthy();
    expect(analyzeVideo).not.toHaveBeenCalled();
  });

  it("reuses a saved result and opens exactly that video without another analysis", async () => {
    vi.mocked(readSearchHistory).mockResolvedValue([{ id: "saved", url: analysisFixture.video.url, title: analysisFixture.video.title, channel: analysisFixture.video.channel, searchedAt: analysisFixture.generatedAt, result: analysisFixture }]);
    render(<VideoInsights videoId={analysisFixture.video.videoId} requestId="click" />);
    expect(await screen.findByText(analysisFixture.video.summary)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Abrir análise completa/ }));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `chrome-extension://signals/index.html?videoId=${analysisFixture.video.videoId}` });
    expect(analyzeVideo).not.toHaveBeenCalled();
  });

  it("does not start an analysis just because the current video changed", async () => {
    const { rerender } = render(<VideoInsights videoId={analysisFixture.video.videoId} />);
    await screen.findByRole("button", { name: "Analisar este vídeo" });
    rerender(<VideoInsights videoId="dQw4w9WgXcQ" />);
    await waitFor(() => expect(readSearchHistory).toHaveBeenCalledTimes(2));
    expect(analyzeVideo).not.toHaveBeenCalled();
  });

  it("ignores repeated open requests during an analysis and discards a late result after navigation", async () => {
    let finish!: (value: typeof analysisFixture) => void;
    vi.mocked(analyzeVideo).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { rerender } = render(<VideoInsights videoId={analysisFixture.video.videoId} requestId="first" />);
    await screen.findByRole("status");
    const signal = vi.mocked(analyzeVideo).mock.calls[0][1];
    rerender(<VideoInsights videoId={analysisFixture.video.videoId} requestId="second" />);
    expect(analyzeVideo).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(false);
    rerender(<VideoInsights videoId="dQw4w9WgXcQ" />);
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish(analysisFixture); });
    expect(screen.queryByText(analysisFixture.video.summary)).toBeNull();
    expect(rememberSearch).not.toHaveBeenCalled();
  });

  it("keeps a result visible when saving fails and retries saving without paying for a new analysis", async () => {
    vi.mocked(rememberSearch).mockRejectedValueOnce(new Error("Não foi possível salvar a análise."));
    render(<VideoInsights videoId={analysisFixture.video.videoId} requestId="click" />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(analysisFixture.video.summary)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Abrir análise completa/ }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Tentar salvar novamente" }));
    await waitFor(() => expect((screen.getByRole("button", { name: /Abrir análise completa/ }) as HTMLButtonElement).disabled).toBe(false));
    expect(analyzeVideo).toHaveBeenCalledOnce();
  });

  it("analyzes a card selected on the home page and clears its context after navigation", async () => {
    const tab = { id: 7, url: "https://www.youtube.com/" };
    const session: Record<string, unknown> = {
      [selectionKey(7)]: { videoId: analysisFixture.video.videoId, pageUrl: tab.url },
      [requestKey(7)]: { videoId: analysisFixture.video.videoId, nonce: "home-click", requestedAt: Date.now() },
    };
    let update!: (id: number, change: chrome.tabs.OnUpdatedInfo) => void;
    vi.stubGlobal("chrome", {
      runtime: { id: "signals", getURL: (path: string) => `chrome-extension://signals/${path}` },
      tabs: {
        query: vi.fn().mockResolvedValue([tab]), get: vi.fn().mockResolvedValue(tab),
        onUpdated: { addListener: (fn: typeof update) => { update = fn; }, removeListener: vi.fn() },
        onActivated: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        session: {
          get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map((key) => [key, session[key]]))),
          remove: vi.fn(async (key: string) => { delete session[key]; }),
        },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });
    render(<SidePanel />);
    expect(await screen.findByText(analysisFixture.video.summary)).toBeTruthy();
    expect(analyzeVideo).toHaveBeenCalledWith(analysisFixture.video.url, expect.any(AbortSignal));
    expect(session[requestKey(7)]).toBeUndefined();
    expect(session[selectionKey(7)]).toBeTruthy();
    tab.url = "https://www.youtube.com/results?search_query=another";
    await act(async () => { update(7, { url: tab.url }); });
    expect(await screen.findByRole("heading", { name: "Escolha um vídeo para analisar." })).toBeTruthy();
    expect(analyzeVideo).toHaveBeenCalledOnce();
  });
});
