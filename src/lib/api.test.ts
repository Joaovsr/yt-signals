import { describe, expect, it, vi } from "vitest";
import { analysisFixture } from "../test/analysisFixture";
import { analyzeVideo } from "./api";

describe("analyzeVideo", () => {
  it("calls the analysis API with the video ID and validates the result", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify(analysisFixture),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    const result = await analyzeVideo(
      "https://youtu.be/_RvNczunfsQ?t=10",
      undefined,
      { fetchImpl, baseUrl: "https://api.example.com/" },
    );

    expect(result.video.videoId).toBe("_RvNczunfsQ");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/videos/_RvNczunfsQ/comment-analysis",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ maxComments: 100 }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("translates known API errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: "comments_unavailable", message: "upstream text" } }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ));

    await expect(analyzeVideo("https://youtu.be/_RvNczunfsQ", undefined, { fetchImpl }))
      .rejects.toThrow("não possui comentários suficientes");
  });

  it("rejects an invalid success payload before it reaches the UI", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ videoId: "_RvNczunfsQ", summary: "contrato antigo" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    await expect(analyzeVideo("https://youtu.be/_RvNczunfsQ", undefined, { fetchImpl }))
      .rejects.toThrow("formato inesperado");
  });

  it("rejects malformed URLs without calling the API", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(analyzeVideo("https://example.com/video", undefined, { fetchImpl }))
      .rejects.toThrow("URL do YouTube inválida");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("aborts a request that exceeds the configured timeout", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));

    await expect(analyzeVideo(
      "https://youtu.be/_RvNczunfsQ",
      undefined,
      { fetchImpl, timeoutMs: 1 },
    )).rejects.toThrow("tempo limite");
  });
});
