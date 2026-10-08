import type { ContentItem, EssayItem } from "@gongkao/contracts";

export function publishedEssays(items: ContentItem[], query = "", topic = ""): EssayItem[] {
  const keyword = query.trim().toLowerCase();
  return items
    .filter((item): item is EssayItem => item.module === "essay" && item.status === "published")
    .filter((item) => !topic || item.topic === topic)
    .filter((item) => !keyword || [item.title, item.topic, ...item.keywords, ...item.facts, ...item.expressions, ...item.scenarios].join(" ").toLowerCase().includes(keyword));
}

export function essayTopics(items: ContentItem[]): string[] {
  return [...new Set(publishedEssays(items).map((item) => item.topic))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export function essaySourceStatus(item: EssayItem): { sourced: boolean; message: string } {
  return item.sourceRefs.length
    ? { sourced: true, message: "来源事实与编辑整理内容分区展示" }
    : { sourced: false, message: "未提供来源，不作为官方结论" };
}

export function essayPresentation(item: EssayItem) {
  return {
    viewpoints: item.expressions.slice(0, 1),
    normalizedExpressions: item.expressions.slice(1),
    facts: item.facts,
    scenarios: item.scenarios,
    aiSuggestions: item.aiSuggestions,
    source: essaySourceStatus(item),
  };
}
