import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { AnalysisUnavailableError } from "./analysis-service.js";
import { createApp } from "./app.js";

describe("comment analysis endpoint", () => {
  it("returns the canonical service result", async () => {
    const result = { video: { commentCountAnalyzed: 4 }, overview: "Visão" };
    const analysisService = { analyze: vi.fn().mockResolvedValue(result) };

    const response = await request(createApp({ analysisService, logger: null }), {
      body: { maxComments: 80 },
    });

    expect(response.status).toBe(200);
    expect(response.json).toEqual(result);
    expect(response.headers["x-request-id"]).toMatch(/^[a-f0-9]{16}$/);
    expect(analysisService.analyze).toHaveBeenCalledWith(
      "dQw4w9WgXcQ",
      80,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects unknown request properties", async () => {
    const analysisService = { analyze: vi.fn() };

    const response = await request(createApp({ analysisService, logger: null }), {
      body: { maxComments: 100, extra: true },
    });

    expect(response.status).toBe(400);
    expect(response.json.error.code).toBe("invalid_request");
    expect(analysisService.analyze).not.toHaveBeenCalled();
  });

  it("maps unavailable comments without leaking the internal error", async () => {
    const analysisService = {
      analyze: vi.fn().mockRejectedValue(new AnalysisUnavailableError("internal detail")),
    };

    const response = await request(createApp({ analysisService, logger: null }));

    expect(response.status).toBe(422);
    expect(response.json).toEqual({
      error: {
        code: "comments_unavailable",
        message: "O vídeo não possui comentários suficientes para gerar o mapa.",
      },
    });
  });

  it("cancels when the panel disconnects and does not write to the closed response", async () => {
    let started;
    const ready = new Promise((resolve) => { started = resolve; });
    let analysisSignal;
    const analysisService = { analyze: vi.fn((_video, _limit, { signal }) => {
      analysisSignal = signal;
      started();
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    }) };
    const input = Readable.from(['{"maxComments":100}']);
    input.method = "POST";
    input.url = "/api/v1/videos/dQw4w9WgXcQ/comment-analysis";
    const response = new MockResponse();
    const end = vi.spyOn(response, "end");
    const pending = createApp({ analysisService, logger: null })(input, response);
    await ready;
    response.destroyed = true;
    response.emit("close");
    await pending;
    expect(analysisSignal.aborted).toBe(true);
    expect(end).not.toHaveBeenCalled();
  });
});

async function request(app, { body = { maxComments: 100 } } = {}) {
  const input = Readable.from([JSON.stringify(body)]);
  input.method = "POST";
  input.url = "/api/v1/videos/dQw4w9WgXcQ/comment-analysis";
  const response = new MockResponse();
  await app(input, response);
  return {
    status: response.statusCode,
    headers: response.headers,
    json: JSON.parse(response.body),
  };
}

class MockResponse extends EventEmitter {
  statusCode = 200;
  headers = {};
  body = "";
  writableEnded = false;

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  end(value = "") {
    this.body += value;
    this.writableEnded = true;
  }
}
