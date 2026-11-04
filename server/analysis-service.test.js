import { describe, expect, it, vi } from "vitest";
import { analysisResultSchema } from "../src/lib/analysis.ts";
import { createAnalysisService, normalizeSentiment } from "./analysis-service.js";

describe("analysis service", () => {
  it("cleans comments and builds the frontend contract", async () => {
    const analyzer = { analyze: vi.fn().mockResolvedValue(validDraft()) };
    const service = createAnalysisService({
      source: fakeSource([
        { id: "c1", author: "Ana", text: "á".repeat(250), likes: 10 },
        { id: "c1", author: "Duplicada", text: "ignorar", likes: 99 },
        { id: "c2", author: "Beto", text: "  texto   com\n espaços  ", likes: 5 },
        { id: "c3", author: "Caio", text: "Pergunta", likes: 1 },
        { id: "c4", author: "Dani", text: "Sugestão", likes: 0 },
      ]),
      analyzer,
      now: () => new Date("2026-08-10T15:00:00.000Z"),
    });

    const result = await service.analyze("dQw4w9WgXcQ", 100);

    expect(analysisResultSchema.safeParse(result).success).toBe(true);
    expect(result.video.commentCountAnalyzed).toBe(4);
    expect(result.video.tags[0].comments[0]).toMatchObject({ author: "Ana", likes: 10 });
    const modelComments = analyzer.analyze.mock.calls[0][1];
    expect(Array.from(modelComments[0].text)).toHaveLength(200);
    expect(modelComments[1].text).toBe("texto com espaços");
    expect(analyzer.analyze.mock.calls[0][2].description).toBe("á".repeat(5000));
  });

  it("rejects a comment assigned to two tags", async () => {
    const draft = validDraft();
    draft.tags[1].commentIds = ["c1"];
    const service = createAnalysisService({
      source: fakeSource(baseComments()),
      analyzer: { analyze: vi.fn().mockResolvedValue(draft) },
    });

    await expect(service.analyze("dQw4w9WgXcQ", 100)).rejects.toThrow(
      "assigned more than once",
    );
  });

  it("normalizes rounded percentages to exactly 100", () => {
    const result = normalizeSentiment({ positive: 87, neutral: 8, negative: 4 });

    expect(result.positive + result.neutral + result.negative).toBe(100);
    expect(result.positive).toBeGreaterThan(87);
  });
});

function fakeSource(comments) {
  return {
    getVideo: vi.fn().mockResolvedValue({ title: "Vídeo teste", channel: "Canal teste", description: `  ${"á".repeat(5001)}\n` }),
    listComments: vi.fn().mockResolvedValue(comments),
  };
}

function baseComments() {
  return ["c1", "c2", "c3", "c4"].map((id) => ({ id, text: id, likes: 0 }));
}

function validDraft() {
  return {
    overview: "Visão geral",
    summary: "Resumo",
    sentiment: { positive: 50, neutral: 25, negative: 25 },
    takeaways: ["Sinal um", "Sinal dois"],
    tags: [
      tag("elogios", "Elogios", "positive", "c1"),
      tag("debate", "Debate", "neutral", "c2"),
      tag("duvidas", "Dúvidas", "neutral", "c3"),
      tag("sugestoes", "Sugestões", "positive", "c4"),
    ],
  };
}

function tag(id, label, sentiment, commentId) {
  return {
    id,
    label,
    description: "Descrição",
    sentiment,
    keywords: ["tema"],
    commentIds: [commentId],
  };
}
