export class AnalysisUnavailableError extends Error {}

export function createAnalysisService({
  source,
  analyzer,
  maxCommentCharacters = 200,
  now = () => new Date(),
  debugPayloads = false,
}) {
  return {
    async analyze(videoId, limit, { signal } = {}) {
      const metadata = await source.getVideo(videoId, { signal });
      const extracted = await source.listComments(videoId, limit, { signal });
      if (debugPayloads) {
        console.log("youtube_extracted", JSON.stringify({ videoId, metadata, comments: extracted }));
      }

      const comments = cleanComments(extracted, maxCommentCharacters);
      if (comments.length === 0) {
        throw new AnalysisUnavailableError("no comments available for analysis");
      }
      if (comments.length < 4) {
        throw new AnalysisUnavailableError("at least four comments are required for analysis");
      }

      const description = normalizeAndTruncate(metadata.description, 5000);
      const draft = await analyzer.analyze(videoId, comments, { signal, description });
      return buildResult(videoId, metadata, comments, draft, now());
    },
  };
}

export function normalizeSentiment(sentiment) {
  const values = [sentiment.positive, sentiment.neutral, sentiment.negative];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("analysis sentiment values must be finite and non-negative");
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) throw new Error("analysis sentiment values must have a positive total");

  let largest = 0;
  values.forEach((value, index) => {
    if (value > values[largest]) largest = index;
  });
  const normalized = [0, 0, 0];
  let remaining = 100;
  values.forEach((value, index) => {
    if (index === largest) return;
    normalized[index] = round2(value / total * 100);
    remaining -= normalized[index];
  });
  normalized[largest] = round2(remaining);
  return {
    positive: normalized[0],
    neutral: normalized[1],
    negative: normalized[2],
  };
}

function cleanComments(items, maxCharacters) {
  const result = [];
  const seen = new Set();
  for (const source of items) {
    const id = String(source.id ?? "").trim();
    const text = normalizeAndTruncate(source.text, maxCharacters);
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      author: normalizeAndTruncate(source.author, 100) || "Usuário do YouTube",
      text,
      likes: Number.isSafeInteger(source.likes) && source.likes >= 0 ? source.likes : 0,
    });
  }
  return result;
}

function buildResult(videoId, metadata, comments, draft, generatedAt) {
  const title = normalizeAndTruncate(metadata.title, 160);
  const channel = normalizeAndTruncate(metadata.channel, 100);
  if (!title || !channel) throw new Error("YouTube video metadata is incomplete");

  const overview = normalizeAndTruncate(draft.overview, 420);
  const summary = normalizeAndTruncate(draft.summary, 360);
  if (!overview || !summary) throw new Error("analysis overview and summary are required");
  if (!Array.isArray(draft.tags) || draft.tags.length < 4 || draft.tags.length > 10) {
    throw new Error(`analysis returned ${draft.tags?.length ?? 0} tags, expected between 4 and 10`);
  }
  if (!Array.isArray(draft.takeaways) || draft.takeaways.length < 2 || draft.takeaways.length > 6) {
    throw new Error("analysis must return between 2 and 6 takeaways");
  }

  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const assigned = new Set();
  const tagIds = new Set();
  const tags = draft.tags.map((tag, index) => {
    const id = String(tag.id ?? "").trim();
    if (!id) throw new Error(`tag ${index} has an empty ID`);
    if (tagIds.has(id)) throw new Error(`tag ID ${id} is repeated`);
    tagIds.add(id);
    if (!["positive", "neutral", "negative"].includes(tag.sentiment)) {
      throw new Error(`tag ${id} has invalid sentiment`);
    }
    const label = normalizeAndTruncate(tag.label, 36);
    const description = normalizeAndTruncate(tag.description, 180);
    if (!label || !description) throw new Error(`tag ${id} has incomplete text`);
    if (!Array.isArray(tag.commentIds) || tag.commentIds.length === 0) {
      throw new Error(`tag ${id} has no comments`);
    }
    if (!Array.isArray(tag.keywords) || tag.keywords.length > 6) {
      throw new Error(`tag ${id} has too many keywords`);
    }

    const tagComments = tag.commentIds.map((commentId) => {
      const comment = byId.get(commentId);
      if (!comment) throw new Error(`tag ${id} references unknown comment ${commentId}`);
      if (assigned.has(commentId)) throw new Error(`comment ${commentId} was assigned more than once`);
      assigned.add(commentId);
      return comment;
    });
    return {
      id,
      label,
      description,
      commentCount: tagComments.length,
      sentiment: tag.sentiment,
      keywords: tag.keywords.map((keyword) => normalizeAndTruncate(keyword, 30)).filter(Boolean),
      comments: tagComments,
    };
  });

  const takeaways = draft.takeaways.map((value, index) => {
    const takeaway = normalizeAndTruncate(value, 220);
    if (!takeaway) throw new Error(`takeaway ${index} is empty`);
    return takeaway;
  });

  return {
    generatedAt: generatedAt.toISOString(),
    overview,
    video: {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      channel,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      commentCountAnalyzed: assigned.size,
      summary,
      sentiment: normalizeSentiment(draft.sentiment),
      tags,
    },
    takeaways,
  };
}

function normalizeAndTruncate(value, limit) {
  if (limit <= 0) return "";
  const normalized = String(value ?? "").trim().split(/\s+/u).filter(Boolean).join(" ");
  return Array.from(normalized).slice(0, limit).join("");
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
