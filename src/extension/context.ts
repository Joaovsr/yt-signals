import { extractVideoId } from "../lib/youtube";

export function currentVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    return url.origin === "https://www.youtube.com" && url.pathname === "/watch" ? extractVideoId(value) : null;
  } catch {
    return null;
  }
}

export const requestKey = (tabId: number) => `yt-signals:request:${tabId}`;
export const selectionKey = (tabId: number) => `yt-signals:selection:${tabId}`;
