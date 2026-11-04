import { randomBytes } from "node:crypto";
import { AnalysisUnavailableError } from "./analysis-service.js";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function createApp({ analysisService, logger = console } = {}) {
  return async function app(request, response, next) {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, { name: "yt-signals", status: "ok" });
      return;
    }

    const match = url.pathname.match(/^\/api\/v1\/videos\/([^/]+)\/comment-analysis$/);
    if (request.method === "POST" && match) {
      await analyze(request, response, decodeURIComponent(match[1]), analysisService, logger);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      writeJson(response, 404, {
        error: { code: "not_found", message: "Recurso não encontrado." },
      });
      return;
    }

    if (next) {
      await next();
      return;
    }

    writeJson(response, 404, {
      error: { code: "not_found", message: "Recurso não encontrado." },
    });
  };
}

async function analyze(request, response, videoId, analysisService, logger) {
  const startedAt = Date.now();
  const requestId = randomBytes(8).toString("hex");
  response.setHeader("X-Request-ID", requestId);
  let maxComments = 0;
  let analyzedComments = 0;
  let outcome = "invalid_request";
  let failure = "";

  try {
    if (!VIDEO_ID_PATTERN.test(videoId)) {
      writeError(response, 400, "invalid_video_id", "O identificador do vídeo do YouTube é inválido.");
      return;
    }
    const body = await readJsonBody(request);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      writeError(response, 400, "invalid_request", "O corpo da requisição é inválido.");
      return;
    }
    if (Object.keys(body).some((key) => key !== "maxComments")) {
      writeError(response, 400, "invalid_request", "O corpo da requisição é inválido.");
      return;
    }
    maxComments = body.maxComments ?? 100;
    if (!Number.isInteger(maxComments) || maxComments < 1 || maxComments > 100) {
      writeError(response, 400, "invalid_request", "maxComments deve estar entre 1 e 100.");
      return;
    }
    if (!analysisService) throw new Error("analysis service is not configured");

    const controller = new AbortController();
    request.once?.("aborted", () => controller.abort());
    response.once?.("close", () => {
      if (!response.writableEnded) controller.abort();
    });
    const result = await analysisService.analyze(videoId, maxComments, {
      signal: controller.signal,
    });
    analyzedComments = result.video.commentCountAnalyzed;
    outcome = "ok";
    writeJson(response, 200, result);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    if (error instanceof SyntaxError || error?.code === "request_too_large") {
      writeError(response, 400, "invalid_request", "O corpo da requisição é inválido.");
      return;
    }
    if (error instanceof AnalysisUnavailableError) {
      outcome = "comments_unavailable";
      writeError(response, 422, "comments_unavailable", "O vídeo não possui comentários suficientes para gerar o mapa.");
      return;
    }
    outcome = "analysis_failed";
    writeError(response, 502, "analysis_failed", "Não foi possível analisar os comentários do vídeo.");
  } finally {
    logger?.info?.("analysis_request", {
      requestId,
      videoId,
      durationMs: Date.now() - startedAt,
      maxComments,
      analyzedComments,
      outcome,
      error: failure,
    });
  }
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 4 * 1024) {
      const error = new Error("request body exceeded the size limit");
      error.code = "request_too_large";
      throw error;
    }
  }
  return body.trim() ? JSON.parse(body) : {};
}

function writeError(response, status, code, message) {
  writeJson(response, status, { error: { code, message } });
}

export function writeJson(response, status, value) {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(value)}\n`);
}
