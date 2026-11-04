import { currentVideoId } from "./context";

// shortcut: depends on YouTube's card markup; update selectors if its renderers change.
const CARD_SELECTOR = "yt-lockup-view-model, ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer";
const AD_SELECTOR = "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer";
const HOST_CLASS = "yt-signals-insight-action";

function cardVideo(card: Element) {
  if (card.closest(AD_SELECTOR) || card.querySelector("feed-ad-metadata-view-model, ad-badge-view-model")) return null;
  const link = card.querySelector<HTMLAnchorElement>("a#video-title[href], a#video-title-link[href], a.ytLockupMetadataViewModelTitle[href], a.ytLockupViewModelContentImage[href], a#thumbnail[href]");
  if (!link || link.closest(CARD_SELECTOR) !== card) return null;
  let url: URL;
  try { url = new URL(link.href); } catch { return null; }
  // A mix/playlist is a collection, so it must not silently analyze its first video.
  if (url.searchParams.has("list")) return null;
  const videoId = currentVideoId(url.href);
  const target = card.querySelector(".ytLockupMetadataViewModelTextContainer, #meta, #details");
  if (!videoId || !target || target.closest("a")) return null;
  const title = card.querySelector("#video-title, #video-title-link, .ytLockupMetadataViewModelTitle")?.textContent?.trim() || link.getAttribute("title") || "vídeo";
  return { videoId, target, title };
}

export function installContentButton() {
  const records = new Map<Element, { host: HTMLDivElement; button: HTMLButtonElement }>();
  let scheduled = false;
  let disposed = false;
  const ready = chrome.runtime.sendMessage({ type: "content:ready" }).then((response) => Boolean(response?.ok)).catch(() => false);

  function action(key: Element, target: Element, title: string, resolveVideo: () => string | null, watch = false) {
    let record = records.get(key);
    if (!record) {
      const host = document.createElement("div");
      host.className = HOST_CLASS;
      if (watch) host.id = "yt-signals-button";
      const shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ":host{display:block;margin:8px 0 2px;width:max-content;max-width:100%;position:relative;z-index:1}button{display:flex;align-items:center;gap:6px;min-height:32px;font:600 13px system-ui;padding:5px 12px;border:1px solid var(--yt-spec-10-percent-layer,#53636b);border-radius:16px;color:var(--yt-spec-text-primary,#f4f4f4);background:var(--yt-spec-badge-chip-background,#193039);cursor:pointer;white-space:nowrap}button:hover{background:var(--yt-spec-10-percent-layer,#254550)}button:focus-visible{outline:2px solid #46a9be;outline-offset:3px}button:disabled{opacity:.6;cursor:wait}";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Ver insights";
      button.disabled = true;
      shadow.append(style, button);
      record = { host, button };
      records.set(key, record);
      void ready.then((connected) => {
        button.disabled = !connected;
        if (!connected) button.title = "Recarregue o YouTube para conectar a extensão.";
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const videoId = resolveVideo();
        if (!event.isTrusted || !videoId) return;
        void chrome.runtime.sendMessage({ type: "panel:open", videoId }).then((response) => {
          if (!response?.ok) button.title = "Não foi possível abrir os insights. Recarregue o YouTube e tente novamente.";
        }).catch(() => { button.title = "Recarregue o YouTube para conectar a extensão."; });
      });
    }
    record.button.setAttribute("aria-label", `Ver insights: ${title}`);
    if (record.host.parentElement !== target) target.append(record.host);
  }

  function update() {
    scheduled = false;
    if (disposed) return;
    const active = new Set<Element>();
    if (currentVideoId(location.href)) {
      const target = document.querySelector("ytd-watch-metadata #actions, #above-the-fold #actions");
      if (target) {
        active.add(target);
        action(target, target, "vídeo atual", () => currentVideoId(location.href), true);
      }
    }
    for (const card of document.querySelectorAll(CARD_SELECTOR)) {
      const video = cardVideo(card);
      if (!video) continue;
      active.add(card);
      action(card, video.target, video.title, () => cardVideo(card)?.videoId ?? null);
    }
    for (const [key, { host }] of records) {
      if (!active.has(key)) { host.remove(); records.delete(key); }
    }
  }

  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
  }
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((change) => change.type === "attributes" || change.removedNodes.length > 0 || [...change.addedNodes].some((node) => !(node instanceof Element && node.classList.contains(HOST_CLASS))))) schedule();
  });
  observer.observe(document.querySelector("ytd-page-manager") ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  document.addEventListener("yt-navigate-finish", schedule);
  window.addEventListener("popstate", schedule);
  update();
  return () => {
    disposed = true;
    observer.disconnect();
    document.removeEventListener("yt-navigate-finish", schedule);
    window.removeEventListener("popstate", schedule);
    for (const { host } of records.values()) host.remove();
    records.clear();
  };
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) installContentButton();
