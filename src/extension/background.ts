import { analysisResultSchema } from "../lib/analysis";
import { HISTORY_KEY, mergeSearchHistory, parseSearchHistory } from "../lib/history";
import { extractVideoId } from "../lib/youtube";
import { currentVideoId, requestKey, selectionKey } from "./context";

const storageReady = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let writes: Promise<unknown> = storageReady;

async function configureTab(tabId: number, url = "") {
  const enabled = url.startsWith("https://www.youtube.com/");
  await chrome.sidePanel.setOptions({ tabId, enabled, ...(enabled ? { path: `sidepanel.html?tabId=${tabId}` } : {}) });
}

function openPanel(tabId: number, videoId: string | null, pageUrl: string) {
  // Preserve the user's gesture: opening must precede storage and other async work.
  return chrome.sidePanel.open({ tabId }).then(async () => {
    if (videoId) {
      await chrome.storage.session.set({
        [selectionKey(tabId)]: { videoId, pageUrl },
        [requestKey(tabId)]: { videoId, nonce: crypto.randomUUID(), requestedAt: Date.now() },
      });
    }
  });
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) void openPanel(tab.id, currentVideoId(tab.url ?? ""), tab.url ?? "").catch(console.error);
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url || change.status === "complete") void configureTab(tabId, tab.url).catch(console.error);
});
chrome.tabs.onRemoved.addListener((tabId) => { void chrome.storage.session.remove([requestKey(tabId), selectionKey(tabId)]); });
void chrome.tabs.query({ url: "https://www.youtube.com/*" }).then((tabs) => Promise.all(
  tabs.filter((tab) => tab.id !== undefined).map((tab) => configureTab(tab.id!, tab.url)),
)).catch(console.error);

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message !== "object") return false;
  if (message.type === "content:ready" || message.type === "panel:open") {
    if (sender.frameId !== 0 || sender.tab?.id === undefined || !sender.url?.startsWith("https://www.youtube.com/")) return false;
    if (message.type === "panel:open" && (typeof message.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(message.videoId))) return false;
    const operation = message.type === "content:ready"
      ? configureTab(sender.tab.id, sender.tab.url ?? sender.url)
      : openPanel(sender.tab.id, message.videoId, sender.tab.url ?? sender.url);
    void operation.then(() => respond({ ok: true }), () => respond({ ok: false }));
    return true;
  }
  if (!sender.url?.startsWith(chrome.runtime.getURL(""))) return false;
  if (message.type !== "history:save" && message.type !== "history:clear") return false;

  const operation = writes.then(async () => {
    await storageReady;
    if (message.type === "history:clear") {
      await chrome.storage.local.remove(HISTORY_KEY);
      return [];
    }
    const result = analysisResultSchema.parse(message.result);
    if (typeof message.url !== "string" || extractVideoId(message.url) !== result.video.videoId) throw new Error("Invalid video");
    const stored = await chrome.storage.local.get(HISTORY_KEY);
    const history = mergeSearchHistory(parseSearchHistory(stored[HISTORY_KEY]), message.url, result);
    await chrome.storage.local.set({ [HISTORY_KEY]: history });
    return history;
  });
  writes = operation.catch(() => undefined);
  void operation.then((history) => respond({ ok: true, history }), () => respond({ ok: false }));
  return true;
});
