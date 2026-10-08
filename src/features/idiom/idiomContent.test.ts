import { describe, expect, it } from "vitest";
import type { IdiomItem } from "@gongkao/contracts";
import { idiomTopics, publishedIdioms } from "./idiomContent";

const idiom = (stableId: string, title: string, topic: string, status: "published" | "withdrawn" = "published"): IdiomItem => ({
  stableId, revision: 1, knowledgeId: `knowledge-${stableId}`, module: "idiom", region: "national", title, topic, keywords: [title],
  sourceRefs: [{ id: `source-${stableId}`, title: "辞书资料", url: "https://www.gov.cn/idiom", publisher: "示例单位", publishedAt: "2026-09-01", verifiedAt: "2026-09-21", rightsNote: "原创整理" }],
  sourcePublishedAt: "2026-09-01", validFrom: "2026-09-01", reviewedAt: "2026-09-21", rightsNote: "原创整理", status,
  examEvidence: [], editorRecommended: false, pronunciation: "pīn yīn", definition: `${title}释义`, collocations: ["常见搭配"], example: `${title}原创例句`, confusableWith: [{ term: "易混词", difference: "用法有别" }],
});

describe("成语内容检索", () => {
  const items = [idiom("first", "鱼目混珠", "近义辨析"), idiom("second", "按图索骥", "语境运用"), idiom("hidden", "未审词条", "近义辨析", "withdrawn")];
  it("按词形、释义、主题和易混词搜索", () => {
    expect(publishedIdioms(items, "鱼目").map((item) => item.stableId)).toEqual(["first"]);
    expect(publishedIdioms(items, "易混词", "语境运用").map((item) => item.stableId)).toEqual(["second"]);
  });
  it("排除撤回内容并返回已发布主题", () => {
    expect(publishedIdioms(items, "未审")).toEqual([]);
    expect(idiomTopics(items)).toEqual(["近义辨析", "语境运用"]);
  });
});
