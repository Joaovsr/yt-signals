import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { analysisResultSchema } from "../src/lib/analysis.ts";
import { createAnalysisService } from "./analysis-service.js";
import { createApp } from "./app.js";
import { createOpenAIAnalyzer } from "./openai.js";
import { createYouTubeClient } from "./youtube.js";

describe("full analysis pipeline", () => {
  it("turns fake YouTube and OpenAI responses into the public HTTP contract", async () => {
    const youtubeFetch = vi.fn(async (url) => {
      if (url.pathname.endsWith("/videos")) {
        return jsonResponse({ items: [{ snippet: {
          title: "Vídeo integrado",
          description: "Contexto do vídeo integrado",
          channelTitle: "Canal integrado",
          thumbnails: { high: { url: "https://img.test/high.jpg" } },
        } }] });
      }
      return jsonResponse({ items: [0, 1, 2, 3].map(commentItem) });
    });
    const openaiCreate = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        overview: "Visão integrada",
        summary: "Resumo integrado",
        sentiment: { positive: 60, neutral: 30, negative: 10 },
        tags: [
          tag("elogios", "positive", "comment-1"),
          tag("debate", "neutral", "comment-2"),
          tag("duvidas", "neutral", "comment-3"),
          tag("criticas", "negative", "comment-4"),
        ],
        takeaways: ["Primeiro sinal", "Segundo sinal"],
      }),
    });
    const service = createAnalysisService({
      source: createYouTubeClient({
        apiKey: "youtube-key",
        baseUrl: "https://youtube.test/v3",
        fetchImpl: youtubeFetch,
      }),
      analyzer: createOpenAIAnalyzer({
        client: { responses: { create: openaiCreate } },
      }),
      now: () => new Date("2026-08-10T15:00:00.000Z"),
    });

    const response = await callApp(createApp({ analysisService: service, logger: null }));

    expect(response.status).toBe(200);
    expect(analysisResultSchema.safeParse(response.json).success).toBe(true);
    expect(response.json.video).toMatchObject({
      title: "Vídeo integrado",
      channel: "Canal integrado",
      commentCountAnalyzed: 4,
    });
    expect(youtubeFetch).toHaveBeenCalledTimes(2);
    expect(openaiCreate).toHaveBeenCalledOnce();
    expect(openaiCreate.mock.calls[0][0].input).toContain('Descrição em JSON:\n"Contexto do vídeo integrado"');
  });
});

async function callApp(app) {
  const request = Readable.from([JSON.stringify({ maxComments: 100 })]);
  request.method = "POST";
  request.url = "/api/v1/videos/dQw4w9WgXcQ/comment-analysis";
  const response = new MockResponse();
  await app(request, response);
  return { status: response.statusCode, json: JSON.parse(response.body) };
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  writableEnded = false;
  body = "";
  setHeader() {}
  end(value = "") {
    this.body += value;
    this.writableEnded = true;
  }
}

function commentItem(index) {
  return { snippet: { topLevelComment: {
    id: `c${index + 1}`,
    snippet: {
      authorDisplayName: `Autor ${index + 1}`,
      textDisplay: `Comentário ${index + 1}`,
      likeCount: index,
    },
  } } };
}

function tag(id, sentiment, commentId) {
  return {
    id,
    label: id,
    description: "Descrição",
    sentiment,
    keywords: ["tema"],
    commentIds: [commentId],
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
