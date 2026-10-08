import { describe, expect, it } from "vitest";
import type { AffairsItem } from "@gongkao/contracts";
import { affairMonths, publishedAffairs } from "./affairsContent";

const affair = (stableId: string, region: "national" | "zhejiang", eventDate: string, status: "published" | "withdrawn" = "published"): AffairsItem => ({
  stableId, revision: 1, knowledgeId: `knowledge-${stableId}`, module: "affairs", region, title: `${region}-${stableId}`, topic: "政策", keywords: ["关键词"],
  sourceRefs: [{ id: `source-${stableId}`, title: "官方原文", url: "https://www.gov.cn/affair", publisher: "示例单位", publishedAt: eventDate, verifiedAt: "2026-09-21", rightsNote: "原文权利归发布单位" }],
  sourcePublishedAt: eventDate, validFrom: eventDate, reviewedAt: "2026-09-21", rightsNote: "原创摘要", status, examEvidence: [], editorRecommended: false,
  eventDate, summary: `${stableId}原创摘要`, examPoints: ["考点"],
});

describe("时政检索与归档", () => {
  const items = [affair("n-dec", "national", "2025-12-31"), affair("n-jan", "national", "2026-01-01"), affair("z-jan", "zhejiang", "2026-01-02"), affair("hidden", "national", "2026-01-03", "withdrawn")];
  it("地区严格隔离并支持跨月跨年归档", () => {
    expect(publishedAffairs(items, { region: "national", month: "2025-12" }).map((item) => item.stableId)).toEqual(["n-dec"]);
    expect(publishedAffairs(items, { region: "national", month: "2026-01" }).map((item) => item.stableId)).toEqual(["n-jan"]);
    expect(publishedAffairs(items, { region: "zhejiang" }).map((item) => item.stableId)).toEqual(["z-jan"]);
  });
  it("支持日归档、搜索并排除撤回内容", () => {
    expect(publishedAffairs(items, { region: "national", day: "2026-01-01", query: "原创摘要" }).map((item) => item.stableId)).toEqual(["n-jan"]);
    expect(publishedAffairs(items, { region: "national", query: "hidden" })).toEqual([]);
    expect(affairMonths(items, "national")).toEqual(["2026-01", "2025-12"]);
  });
});
