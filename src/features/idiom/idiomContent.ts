import type { ContentItem, IdiomItem } from "@gongkao/contracts";

export function publishedIdioms(items: ContentItem[], query = "", topic = ""): IdiomItem[] {
  const keyword = query.trim().toLocaleLowerCase();
  return items
    .filter((item): item is IdiomItem => item.module === "idiom" && item.status === "published")
    .filter((item) => !topic || item.topic === topic)
    .filter((item) => !keyword || [item.title, item.topic, item.definition, ...item.keywords, ...item.collocations, ...item.confusableWith.flatMap((entry) => [entry.term, entry.difference])].some((value) => value.toLocaleLowerCase().includes(keyword)))
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

export const idiomTopics = (items: ContentItem[]): string[] => [...new Set(publishedIdioms(items).map((item) => item.topic))].sort((left, right) => left.localeCompare(right, "zh-CN"));
