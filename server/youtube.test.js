import { describe, expect, it, vi } from "vitest";
import { createYouTubeClient } from "./youtube.js";

describe("YouTube client", () => {
  it("gets video metadata with the configured API key", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      items: [{
        snippet: {
          title: "Título",
          description: "Descrição do criador 🧠",
          channelTitle: "Canal",
          thumbnails: { high: { url: "https://img.test/high.jpg" } },
        },
      }],
    }));
    const client = createYouTubeClient({
      apiKey: "youtube-secret",
      baseUrl: "https://youtube.test/v3/",
      fetchImpl,
    });

    await expect(client.getVideo("_RvNczunfsQ")).resolves.toEqual({
      title: "Título",
      description: "Descrição do criador 🧠",
      channel: "Canal",
      thumbnail: "https://img.test/high.jpg",
    });

    const url = fetchImpl.mock.calls[0][0];
    expect(url.pathname).toBe("/v3/videos");
    expect(url.searchParams.get("id")).toBe("_RvNczunfsQ");
    expect(url.searchParams.get("key")).toBe("youtube-secret");
    expect(url.searchParams.get("part")).toBe("snippet");
  });

  it("lists top-level comments and follows pagination", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => commentItem(index));
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: firstPage, nextPageToken: "next" }))
      .mockResolvedValueOnce(jsonResponse({ items: [commentItem(100)] }));
    const client = createYouTubeClient({
      apiKey: "key",
      baseUrl: "https://youtube.test/v3",
      fetchImpl,
    });

    const comments = await client.listComments("_RvNczunfsQ", 101);

    expect(comments).toHaveLength(101);
    expect(comments[0]).toEqual({
      id: "id-0",
      author: "Autor 0",
      text: "Comentário 0",
      likes: 0,
    });
    expect(fetchImpl.mock.calls[1][0].searchParams.get("pageToken")).toBe("next");
    expect(fetchImpl.mock.calls[1][0].searchParams.get("maxResults")).toBe("1");
  });

  it("does not expose an upstream error body as a successful result", async () => {
    const client = createYouTubeClient({
      apiKey: "key",
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse(
        { error: { message: "quota exceeded" } },
        403,
      )),
    });

    await expect(client.getVideo("_RvNczunfsQ")).rejects.toThrow(
      "YouTube API: quota exceeded",
    );
  });
});

function commentItem(index) {
  return {
    snippet: {
      topLevelComment: {
        id: `id-${index}`,
        snippet: {
          authorDisplayName: `Autor ${index}`,
          textDisplay: `Comentário ${index}`,
          likeCount: index,
        },
      },
    },
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
