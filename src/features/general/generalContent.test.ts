import { describe, expect, it } from "vitest";
import type { GeneralItem } from "@gongkao/contracts";
import { generalTopics, publishedGeneralItems } from "./generalContent";

const item = (stableId: string, title: string, topic: string, keywords: string[], status: "published" | "withdrawn" = "published"): GeneralItem => ({
  stableId, revision: 1, knowledgeId: `knowledge-${stableId}`, module: "general", region: "national", title, topic, keywords,
  sourceRefs: [{ id: `source-${stableId}`, title: "官方资料", url: "https://www.gov.cn/example", publisher: "示例单位", publishedAt: "2026-09-01", verifiedAt: "2026-09-20", rightsNote: "原文权利归发布单位" }],
  sourcePublishedAt: "2026-09-01", validFrom: "2026-09-01", reviewedAt: "2026-09-20", rightsNote: "原创摘要", status,
  examEvidence: [], editorRecommended: false, concept: `${title}概念`, explanation: `${title}解释`,
});

describe("常识内容检索", () => {
  const items = [item("law", "行政法原则", "法律", ["依法行政"]), item("tech", "量子通信", "科技", ["通信安全"]), item("hidden", "未发布草稿", "法律", ["草稿"], "withdrawn")];

  it("按标题、关键词和主题检索已发布内容", () => {
    expect(publishedGeneralItems(items, { query: "行政法" }).map((entry) => entry.stableId)).toEqual(["law"]);
    expect(publishedGeneralItems(items, { query: "通信安全" }).map((entry) => entry.stableId)).toEqual(["tech"]);
    expect(publishedGeneralItems(items, { topic: "法律" }).map((entry) => entry.stableId)).toEqual(["law"]);
  });

  it("不可检索撤回内容并只返回已发布主题", () => {
    expect(publishedGeneralItems(items, { query: "草稿" })).toEqual([]);
    expect(generalTopics(items)).toEqual(["法律", "科技"]);
  });
});
