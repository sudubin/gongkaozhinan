import type { AffairsItem, ContentItem } from "@gongkao/contracts";

export interface AffairsFilter {
  region: "national" | "zhejiang";
  query?: string;
  day?: string;
  month?: string;
}

export function publishedAffairs(items: ContentItem[], filter: AffairsFilter): AffairsItem[] {
  const query = filter.query?.trim().toLocaleLowerCase() ?? "";
  return items
    .filter((item): item is AffairsItem => item.module === "affairs" && item.status === "published" && item.region === filter.region)
    .filter((item) => !filter.day || item.eventDate === filter.day)
    .filter((item) => !filter.month || item.eventDate.startsWith(`${filter.month}-`))
    .filter((item) => !query || [item.title, item.topic, item.summary, ...item.keywords, ...item.examPoints].some((value) => value.toLocaleLowerCase().includes(query)))
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate) || left.title.localeCompare(right.title, "zh-CN"));
}

export function affairMonths(items: ContentItem[], region: "national" | "zhejiang"): string[] {
  return [...new Set(publishedAffairs(items, { region }).map((item) => item.eventDate.slice(0, 7)))].sort().reverse();
}
