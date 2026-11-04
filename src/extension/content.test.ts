// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.youtube.com/watch?v=_RvNczunfsQ" }
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installContentButton } from "./content";
import { currentVideoId } from "./context";

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals(); document.body.replaceChildren(); window.history.replaceState({}, "", "/watch?v=_RvNczunfsQ"); });

describe("YouTube integration", () => {
  it("accepts only supported HTTPS watch pages", () => {
    expect(currentVideoId("https://www.youtube.com/watch?v=_RvNczunfsQ")).toBe("_RvNczunfsQ");
    for (const url of ["https://www.youtube.com/", "https://www.youtube.com/shorts/_RvNczunfsQ", "https://www.youtube.com.evil.test/watch?v=_RvNczunfsQ", "http://www.youtube.com/watch?v=_RvNczunfsQ", "invalid"]) expect(currentVideoId(url)).toBeNull();
  });

  it("keeps one accessible button across DOM replacement and removes it outside videos", async () => {
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) } });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    document.body.innerHTML = '<ytd-watch-metadata><div id="actions"></div></ytd-watch-metadata>';
    dispose = installContentButton();
    const host = document.getElementById("yt-signals-button")!;
    const button = host.shadowRoot!.querySelector("button")!;
    expect(button.textContent).toBe("Ver insights");
    await waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
    document.getElementById("actions")!.replaceChildren();
    await waitFor(() => expect(document.getElementById("yt-signals-button")).not.toBeNull());
    expect(document.querySelectorAll("#yt-signals-button")).toHaveLength(1);
    window.history.pushState({}, "", "/");
    document.dispatchEvent(new Event("yt-navigate-finish"));
    await waitFor(() => expect(document.getElementById("yt-signals-button")).toBeNull());
  });

  it.each(["/", "/results?search_query=javascript"])("adds one action per video on %s and updates recycled cards", async (url) => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    window.history.replaceState({}, "", url);
    document.body.innerHTML = `
      <ytd-rich-item-renderer><yt-lockup-view-model>
        <a class="ytLockupViewModelContentImage" href="/watch?v=_RvNczunfsQ"></a>
        <div class="ytLockupMetadataViewModelTextContainer"><h3><a class="ytLockupMetadataViewModelTitle" href="/watch?v=_RvNczunfsQ">Primeiro vídeo</a></h3></div>
      </yt-lockup-view-model></ytd-rich-item-renderer>
      <ytd-video-renderer><div id="meta"><h3><a id="video-title" href="/watch?v=dQw4w9WgXcQ">Segundo vídeo</a></h3></div></ytd-video-renderer>
      <yt-lockup-view-model><a class="ytLockupViewModelContentImage" href="/watch?v=_RvNczunfsQ&list=RD_RvNczunfsQ"></a><div class="ytLockupMetadataViewModelTextContainer"></div></yt-lockup-view-model>
      <yt-lockup-view-model><feed-ad-metadata-view-model></feed-ad-metadata-view-model><a class="ytLockupViewModelContentImage" href="/watch?v=_RvNczunfsQ"></a><div class="ytLockupMetadataViewModelTextContainer"></div></yt-lockup-view-model>`;
    dispose = installContentButton();
    const hosts = () => document.querySelectorAll<HTMLElement>(".yt-signals-insight-action");
    expect(hosts()).toHaveLength(2);
    const first = hosts()[0].shadowRoot!.querySelector("button")!;
    await waitFor(() => expect(first.disabled).toBe(false));
    expect(first.getAttribute("aria-label")).toBe("Ver insights: Primeiro vídeo");
    expect(hosts()[0].closest("a")).toBeNull();
    const parentClick = vi.fn();
    document.querySelector("ytd-rich-item-renderer")!.addEventListener("click", parentClick);
    first.click();
    expect(parentClick).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledOnce();
    document.querySelector("a.ytLockupMetadataViewModelTitle")!.setAttribute("href", "/watch?v=dQw4w9WgXcQ");
    document.querySelector("a.ytLockupMetadataViewModelTitle")!.textContent = "Vídeo reciclado";
    await waitFor(() => expect(first.getAttribute("aria-label")).toBe("Ver insights: Vídeo reciclado"));
    expect(hosts()).toHaveLength(2);
    document.querySelector("ytd-video-renderer")!.remove();
    await waitFor(() => expect(hosts()).toHaveLength(1));
  });
});
