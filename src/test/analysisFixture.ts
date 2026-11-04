import type { AnalysisResult } from "../lib/analysis.js";

export const analysisFixture: AnalysisResult = {
  generatedAt: "2026-08-08T15:00:00.000Z",
  overview: "A audiência discute foco, constância e tolerância ao tédio.",
  video: {
    videoId: "_RvNczunfsQ",
    url: "https://www.youtube.com/watch?v=_RvNczunfsQ",
    title: "Master boredom to get ahead",
    channel: "Daniel Barada",
    thumbnail: "https://i.ytimg.com/vi/_RvNczunfsQ/hqdefault.jpg",
    commentCountAnalyzed: 100,
    summary: "A descrição apresenta a tolerância ao tédio como caminho para o foco; os comentários relatam dificuldades com distrações e valorizam a constância.",
    sentiment: { positive: 70, neutral: 20, negative: 10 },
    tags: Array.from({ length: 4 }, (_, index) => {
      const commentCount = 22 + index * 2;
      const previousComments = index === 0 ? 0 : Array.from({ length: index }, (_, prior) => 22 + prior * 2)
        .reduce((total, count) => total + count, 0);
      return {
        id: `tag-${index}`,
        label: `Tema ${index + 1}`,
        description: "Descrição do tema identificado nos comentários.",
        commentCount,
        sentiment: "positive" as const,
        keywords: ["foco", "constância"],
        comments: Array.from({ length: commentCount }, (_, commentIndex) => ({
          id: `comment-${previousComments + commentIndex}`,
          author: `@viewer-${previousComments + commentIndex}`,
          text: `Comentário ${previousComments + commentIndex} da audiência.`,
          likes: commentIndex,
        })),
      };
    }),
  },
  takeaways: ["Persistência é o tema central.", "Distrações digitais aparecem com frequência."],
};
