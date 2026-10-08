import type { ContentItem, GeneralItem } from "@gongkao/contracts";

export interface GeneralContentFilter {
  query?: string;
  topic?: string;
}

export function publishedGeneralItems(items: ContentItem[], filter: GeneralContentFilter = {}): GeneralItem[] {
  const query = filter.query?.trim().toLocaleLowerCase() ?? "";
  const topic = filter.topic?.trim() ?? "";
  return items
    .filter((item): item is GeneralItem => item.module === "general" && item.status === "published")
    .filter((item) => !topic || item.topic === topic)
    .filter((item) => !query || [item.title, item.topic, item.concept, item.explanation, ...item.keywords].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

export function generalTopics(items: ContentItem[]): string[] {
  return [...new Set(publishedGeneralItems(items).map((item) => item.topic))].sort((left, right) => left.localeCompare(right, "zh-CN"));
}
