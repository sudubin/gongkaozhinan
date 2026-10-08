import { describe, expect, it } from "vitest";
import type { ContentItem, EssayItem } from "@gongkao/contracts";
import { essayPresentation, essaySourceStatus, essayTopics, publishedEssays } from "./essayContent";

const source = { id: "s", title: "官方材料", url: "https://example.gov.cn/a", publisher: "示例单位", publishedAt: "2026-01-01", verifiedAt: "2026-09-21", rightsNote: "原文权利归发布单位" };
const essay = (stableId: string, topic: string, status: "published" | "withdrawn" = "published", withSource = true): EssayItem => ({
  stableId, revision: 1, knowledgeId: `k-${stableId}`, module: "essay", region: "zhejiang", title: `${topic}素材`, topic, keywords: ["长期主义"], sourceRefs: withSource ? [source] : [], sourcePublishedAt: "2026-01-01", validFrom: "2026-01-01", reviewedAt: "2026-09-21", rightsNote: "原创整理", status, examEvidence: [], editorRecommended: false,
  facts: ["来源事实"], expressions: ["观点提炼", "规范表达"], scenarios: ["议论文"], aiSuggestions: ["AI 建议"],
});

describe("申论内容", () => {
  const items: ContentItem[] = [essay("a", "基层治理"), essay("b", "绿色发展"), essay("c", "基层治理", "withdrawn")];

  it("只筛选已发布素材，并支持主题和全文检索", () => {
    expect(publishedEssays(items).map((item) => item.stableId)).toEqual(["a", "b"]);
    expect(publishedEssays(items, "长期主义", "基层治理").map((item) => item.stableId)).toEqual(["a"]);
    expect(essayTopics(items)).toEqual(["基层治理", "绿色发展"]);
  });

  it("将来源事实、编辑表达和 AI 建议分区，无来源时不伪装官方结论", () => {
    expect(essayPresentation(items[0] as EssayItem)).toMatchObject({ viewpoints: ["观点提炼"], normalizedExpressions: ["规范表达"], aiSuggestions: ["AI 建议"] });
    expect(essaySourceStatus(essay("none", "治理", "published", false))).toEqual({ sourced: false, message: "未提供来源，不作为官方结论" });
  });
});
