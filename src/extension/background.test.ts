import { afterEach, expect, it, vi } from "vitest";
import { analysisFixture } from "../test/analysisFixture";
import { HISTORY_KEY } from "../lib/history";
import { requestKey, selectionKey } from "./context";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("rejects history access from content scripts and serializes concurrent valid saves", async () => {
  let listener!: (message: unknown, sender: chrome.runtime.MessageSender, respond: (response: unknown) => void) => boolean;
  const values: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    runtime: { id: "signals", getURL: (path: string) => `chrome-extension://signals/${path}`, onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } },
    storage: { local: {
      setAccessLevel: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(async (key: string) => ({ [key]: values[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(values, items); }),
      remove: vi.fn(async (key: string) => { delete values[key]; }),
    }, session: { set: vi.fn(), remove: vi.fn() } },
    action: { onClicked: { addListener: vi.fn() } },
    tabs: { onUpdated: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() }, query: vi.fn().mockResolvedValue([]) },
    sidePanel: { setOptions: vi.fn().mockResolvedValue(undefined), open: vi.fn().mockResolvedValue(undefined) },
  });
  await import("./background");
  const homeSender = { id: "signals", frameId: 0, tab: { id: 7, url: "https://www.youtube.com/" }, url: "https://www.youtube.com/" } as chrome.runtime.MessageSender;
  const opened = new Promise((resolve) => {
    expect(listener({ type: "panel:open", videoId: analysisFixture.video.videoId }, homeSender, resolve)).toBe(true);
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 7 });
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
  });
  expect(await opened).toEqual({ ok: true });
  expect(chrome.storage.session.set).toHaveBeenCalledWith({
    [selectionKey(7)]: { videoId: analysisFixture.video.videoId, pageUrl: homeSender.url },
    [requestKey(7)]: { videoId: analysisFixture.video.videoId, nonce: expect.any(String), requestedAt: expect.any(Number) },
  });
  for (const videoId of [undefined, "", "invalid", "https://evil.test", 123]) {
    expect(listener({ type: "panel:open", videoId }, homeSender, vi.fn())).toBe(false);
  }
  expect(listener({ type: "panel:open", videoId: analysisFixture.video.videoId }, { ...homeSender, frameId: 1 }, vi.fn())).toBe(false);
  expect(listener({ type: "panel:open", videoId: analysisFixture.video.videoId }, { ...homeSender, url: "https://www.youtube.com.evil.test/" }, vi.fn())).toBe(false);
  expect(chrome.sidePanel.open).toHaveBeenCalledOnce();
  const save = { type: "history:save", url: analysisFixture.video.url, result: analysisFixture };
  expect(listener(save, { id: "signals", url: "https://www.youtube.com/watch?v=_RvNczunfsQ" }, vi.fn())).toBe(false);
  const sender = { id: "signals", url: "chrome-extension://signals/sidepanel.html" };
  const otherId = "dQw4w9WgXcQ";
  const other = { ...analysisFixture, video: { ...analysisFixture.video, videoId: otherId, url: `https://www.youtube.com/watch?v=${otherId}`, thumbnail: `https://i.ytimg.com/vi/${otherId}/hqdefault.jpg` } };
  const [first, second] = await Promise.all([
    new Promise((resolve) => listener(save, sender, resolve)),
    new Promise((resolve) => listener({ ...save, url: other.video.url, result: other }, sender, resolve)),
  ]);
  expect(first).toMatchObject({ ok: true }); expect(second).toMatchObject({ ok: true });
  expect(values[HISTORY_KEY]).toHaveLength(2);
  const invalid = await new Promise((resolve) => listener({ ...save, result: {} }, sender, resolve));
  expect(invalid).toEqual({ ok: false });
  expect(values[HISTORY_KEY]).toHaveLength(2);
});
