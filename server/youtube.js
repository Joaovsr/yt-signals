const DEFAULT_BASE_URL = "https://www.googleapis.com/youtube/v3";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export function createYouTubeClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
  timeoutMs = 20_000,
}) {
  const root = baseUrl.replace(/\/$/, "");

  return {
    async getVideo(videoId, { signal } = {}) {
      const url = endpoint(root, "videos", {
        part: "snippet",
        id: videoId,
        key: apiKey,
      });
      const payload = await getJson(fetchImpl, url, requestSignal(signal, timeoutMs));
      const snippet = payload.items?.[0]?.snippet;
      if (!snippet) throw new Error("YouTube video was not found");
      return {
        title: snippet.title,
        description: snippet.description ?? "",
        channel: snippet.channelTitle,
        thumbnail: snippet.thumbnails?.high?.url ?? "",
      };
    },

    async listComments(videoId, limit, { signal } = {}) {
      const comments = [];
      let pageToken = "";

      while (comments.length < limit) {
        const params = {
          part: "snippet",
          videoId,
          maxResults: String(Math.min(100, limit - comments.length)),
          order: "relevance",
          textFormat: "plainText",
          key: apiKey,
        };
        if (pageToken) params.pageToken = pageToken;

        const payload = await getJson(
          fetchImpl,
          endpoint(root, "commentThreads", params),
          requestSignal(signal, timeoutMs),
        );
        const items = payload.items ?? [];
        for (const item of items) {
          const top = item.snippet?.topLevelComment;
          if (!top?.snippet) continue;
          comments.push({
            id: top.id,
            author: top.snippet.authorDisplayName,
            text: top.snippet.textDisplay,
            likes: top.snippet.likeCount,
          });
          if (comments.length === limit) break;
        }
        pageToken = payload.nextPageToken ?? "";
        if (!pageToken || items.length === 0) break;
      }

      return comments;
    },
  };
}

function requestSignal(signal, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function endpoint(root, resource, params) {
  const url = new URL(`${root}/${resource}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url;
}

async function getJson(fetchImpl, url, signal) {
  const response = await fetchImpl(url, { signal });
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    throw new Error("YouTube API response exceeded the size limit");
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("YouTube API returned invalid JSON");
  }
  if (!response.ok) {
    const message = payload?.error?.message || response.statusText;
    throw new Error(`YouTube API: ${message}`);
  }
  return payload;
}
