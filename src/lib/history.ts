import { z } from "zod";
import { analysisResultSchema, type AnalysisResult } from "./analysis";

export const HISTORY_KEY = "yt-signals:search-history:v2";
const MAX_HISTORY_ITEMS = 6;

const searchHistoryItemSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  channel: z.string().min(1),
  searchedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Data inválida."),
  result: analysisResultSchema,
});

const searchHistorySchema = z.array(searchHistoryItemSchema).max(MAX_HISTORY_ITEMS);

export type SearchHistoryItem = z.infer<typeof searchHistoryItemSchema>;

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseSearchHistory(value: unknown): SearchHistoryItem[] {
  const parsed = searchHistorySchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export async function readSearchHistory(storage?: Storage): Promise<SearchHistoryItem[]> {
  if (!storage && typeof chrome !== "undefined" && chrome.runtime?.id) {
    const stored = await chrome.storage.local.get(HISTORY_KEY);
    return parseSearchHistory(stored[HISTORY_KEY]);
  }
  const target = resolveStorage(storage);
  if (!target) return [];
  try {
    const raw = target.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return parseSearchHistory(parsed);
  } catch {
    return [];
  }
}

export function mergeSearchHistory(
  persisted: SearchHistoryItem[],
  url: string,
  result: AnalysisResult,
): SearchHistoryItem[] {
  const video = result.video;
  const item = { id: `${video.videoId}:${result.generatedAt}`, url, title: video.title, channel: video.channel, searchedAt: new Date().toISOString(), result };
  return [item, ...persisted.filter((entry) => entry.result.video.videoId !== video.videoId)].slice(0, MAX_HISTORY_ITEMS);
}

export async function rememberSearch(
  url: string,
  result: AnalysisResult,
  storage?: Storage,
): Promise<SearchHistoryItem[]> {
  analysisResultSchema.parse(result);
  if (!storage && typeof chrome !== "undefined" && chrome.runtime?.id) {
    const response = await chrome.runtime.sendMessage({ type: "history:save", url, result });
    if (!response?.ok) throw new Error("Não foi possível salvar a análise. Tente salvar novamente.");
    return parseSearchHistory(response.history);
  }
  const target = resolveStorage(storage);
  const persisted = target ? await readSearchHistory(target) : [];
  const next = mergeSearchHistory(persisted, url, result);
  if (!target) return next;
  try {
    target.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Keep the current session usable when localStorage is unavailable or full.
  }
  return next;
}

export async function clearSearchHistory(storage?: Storage): Promise<void> {
  if (!storage && typeof chrome !== "undefined" && chrome.runtime?.id) {
    const response = await chrome.runtime.sendMessage({ type: "history:clear" });
    if (!response?.ok) throw new Error("Não foi possível limpar o histórico.");
    return;
  }
  const target = resolveStorage(storage);
  if (!target) return;
  try {
    target.removeItem(HISTORY_KEY);
  } catch {
    // Clearing persisted history should not break the UI.
  }
}
