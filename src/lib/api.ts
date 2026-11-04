import { analysisResultSchema, type AnalysisResult } from "./analysis";
import { extractVideoId } from "./youtube";

const DEFAULT_TIMEOUT_MS = 390_000;

type AnalyzeVideoOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

class ApiClientError extends Error {}

export async function analyzeVideo(
  url: string,
  signal?: AbortSignal,
  options: AnalyzeVideoOptions = {},
): Promise<AnalysisResult> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new ApiClientError("URL do YouTube inválida. Use um link de vídeo, Shorts ou live.");
  }

  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const baseUrl = (options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
  const endpoint = `${baseUrl}/api/v1/videos/${encodeURIComponent(videoId)}/comment-analysis`;

  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxComments: 100 }),
      signal: controller.signal,
    });

    const payload = await readJSON(response);
    if (!response.ok) {
      throw new ApiClientError(errorMessage(response.status));
    }

    const parsed = analysisResultSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiClientError("A API retornou uma análise em formato inesperado.");
    }
    if (parsed.data.video.videoId !== videoId) {
      throw new ApiClientError("A API retornou a análise de outro vídeo.");
    }
    return parsed.data;
  } catch (error) {
    if (timedOut) {
      throw new ApiClientError("A análise excedeu o tempo limite. Tente novamente.");
    }
    if (signal?.aborted) {
      throw new ApiClientError("A análise foi cancelada.");
    }
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError("Não foi possível conectar à API de análise.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function readJSON(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    if (response.ok) {
      throw new ApiClientError("A API retornou uma análise em formato inesperado.");
    }
    return null;
  }
}

function errorMessage(status: number): string {
  switch (status) {
    case 400:
      return "A URL ou os parâmetros enviados são inválidos.";
    case 401:
    case 403:
      return "A API recusou a análise. Verifique a configuração de acesso.";
    case 422:
      return "O vídeo não possui comentários suficientes para gerar o mapa.";
    case 429:
      return "O limite de análises foi atingido. Aguarde um pouco e tente novamente.";
    case 502:
    case 503:
    case 504:
      return "O serviço de análise está temporariamente indisponível.";
    default:
      return "Não foi possível concluir a análise.";
  }
}
