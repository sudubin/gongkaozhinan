import { describe, expect, it } from "vitest";
import type { ContentItem } from "@gongkao/contracts";
import { masteryKey, resolveLinkedContent } from "./linkedContent";

const base = { revision: 1, knowledgeId: "shared-k", region: "zhejiang", topic: "治理", keywords: [], sourceRefs: [], sourcePublishedAt: "2026-01-01", validFrom: "2026-01-01", reviewedAt: "2026-09-21", rightsNote: "原创", examEvidence: [], editorRecommended: false } as const;
const items = [
  { ...base, stableId: "zj", module: "zhejiang", title: "省情", status: "published", category: "governance-livelihood", keyPoint: "重点", confusions: [], applicableYears: [2026] },
  { ...base, stableId: "affair", module: "affairs", title: "时政", status: "published", eventDate: "2026-01-01", summary: "摘要", examPoints: [] },
  { ...base, stableId: "essay", module: "essay", title: "申论", status: "published", facts: [], expressions: [], scenarios: [], aiSuggestions: [] },
  { ...base, stableId: "old", module: "general", title: "撤回常识", status: "withdrawn", withdrawnReason: "已更新", concept: "概念", explanation: "解释" },
] as unknown as ContentItem[];

describe("跨模块知识关联", () => {
  it("同 knowledgeId 使用同一掌握键并解析可用/禁用/撤回状态", () => {
    expect(new Set(items.map(masteryKey))).toEqual(new Set(["shared-k"]));
    expect(resolveLinkedContent(items, items[0]!, new Set(["affairs", "general", "zhejiang"]))).toEqual([
      { stableId: "affair", title: "时政", module: "affairs", status: "available", knowledgeId: "shared-k" },
      { stableId: "essay", title: "申论", module: "essay", status: "module-disabled", knowledgeId: "shared-k" },
      { stableId: "old", title: "撤回常识", module: "general", status: "withdrawn", knowledgeId: "shared-k" },
    ]);
  });
});
