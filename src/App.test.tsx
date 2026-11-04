// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://127.0.0.1:5173/" }

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { rememberSearch } from "./lib/history";
import { analysisFixture } from "./test/analysisFixture";

vi.mock("./components/InsightGraph", () => ({
  InsightGraph: ({
    result,
    onSelect,
  }: {
    result: typeof analysisFixture;
    onSelect: (node: {
      id: string;
      kind: "tag";
      radius: number;
      color: string;
      label: string;
      eyebrow: string;
      description: string;
      meta: string[];
      evidence: string[];
    }) => void;
  }) => (
    <div data-testid="insight-graph">
      {result.video.commentCountAnalyzed} comentários
      <button type="button" onClick={() => onSelect({
        id: "tag:test",
        kind: "tag",
        radius: 10,
        color: "#fff",
        label: "Tema completo",
        eyebrow: "Tag · Neutro",
        description: "Descrição",
        meta: ["5 comentários"],
        evidence: ["Evidência 1", "Evidência 2", "Evidência 3", "Evidência 4", "Evidência 5"],
      })}>
        Selecionar tema
      </button>
    </div>
  ),
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("App", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows loading and renders a complete API result", async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("URL do vídeo"), "https://youtu.be/_RvNczunfsQ");
    await user.click(screen.getByRole("button", { name: "Gerar mapa" }));

    expect(screen.getByRole("status").textContent).toContain("Analisando comentários");
    expect((screen.getByLabelText("URL do vídeo") as HTMLInputElement).disabled).toBe(true);

    resolveRequest(jsonResponse(analysisFixture));

    expect((await screen.findByRole("heading", { name: analysisFixture.video.title })).textContent)
      .toBe(analysisFixture.video.title);
    expect(screen.getByTestId("insight-graph").textContent).toContain("100 comentários");
    expect(screen.getByText(analysisFixture.takeaways[0])).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shows validation and API errors without replacing a previous result", async () => {
    await rememberSearch("https://youtu.be/_RvNczunfsQ", analysisFixture, window.localStorage);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      error: { code: "comments_unavailable", message: "sem comentários" },
    }, 422));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByLabelText("URL do vídeo");
    await user.clear(input);
    await user.type(input, "https://example.com/video");
    await user.click(screen.getByRole("button", { name: "Gerar mapa" }));

    expect(screen.getByRole("alert").textContent).toContain("URL do YouTube inválida");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: analysisFixture.video.title })).toBeTruthy();

    await user.clear(input);
    await user.type(input, "https://youtu.be/_RvNczunfsQ");
    await user.click(screen.getByRole("button", { name: "Gerar mapa" }));

    expect((await screen.findByRole("alert")).textContent)
      .toContain("não possui comentários suficientes");
    expect(await screen.findByRole("heading", { name: analysisFixture.video.title })).toBeTruthy();
  });

  it("restores a persisted result and clears the history list", async () => {
    await rememberSearch("https://youtu.be/_RvNczunfsQ", analysisFixture, window.localStorage);
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: analysisFixture.video.title })).toBeTruthy();
    expect(screen.getByText(analysisFixture.video.channel, { exact: false })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Limpar" }));

    expect(screen.queryByText("BUSCAS RECENTES")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("shows every comment evidence from the selected topic", async () => {
    await rememberSearch("https://youtu.be/_RvNczunfsQ", analysisFixture, window.localStorage);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Selecionar tema" }));

    expect(screen.getByText("Evidência 1")).toBeTruthy();
    expect(screen.getByText("Evidência 2")).toBeTruthy();
    expect(screen.getByText("Evidência 3")).toBeTruthy();
    expect(screen.getByText("Evidência 4")).toBeTruthy();
    expect(screen.getByText("Evidência 5")).toBeTruthy();
  });

  it("opens the requested saved video without making another API request", async () => {
    await rememberSearch(analysisFixture.video.url, analysisFixture, window.localStorage);
    window.history.replaceState({}, "", `/?videoId=${analysisFixture.video.videoId}`);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(await screen.findByRole("heading", { name: analysisFixture.video.title })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/");
  });

  it("does not fall back to another saved video when the requested analysis is missing", async () => {
    await rememberSearch(analysisFixture.video.url, analysisFixture, window.localStorage);
    window.history.replaceState({}, "", "/?videoId=dQw4w9WgXcQ");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("não está salva");
    expect(screen.queryByRole("heading", { name: analysisFixture.video.title })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/");
  });
});
