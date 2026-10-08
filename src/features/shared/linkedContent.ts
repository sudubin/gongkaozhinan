import type { ContentItem, Module } from "@gongkao/contracts";

export interface LinkedContentTarget {
  stableId: string;
  title: string;
  module: Module;
  status: "available" | "withdrawn" | "module-disabled";
  knowledgeId: string;
}

export function resolveLinkedContent(items: ContentItem[], source: ContentItem, enabledModules: ReadonlySet<Module>): LinkedContentTarget[] {
  return items
    .filter((item) => item.knowledgeId === source.knowledgeId && item.stableId !== source.stableId)
    .map((item) => ({
      stableId: item.stableId,
      title: item.title,
      module: item.module,
      status: item.status === "withdrawn" ? "withdrawn" : enabledModules.has(item.module) ? "available" : "module-disabled",
      knowledgeId: item.knowledgeId,
    }));
}

export const masteryKey = (item: ContentItem): string => item.knowledgeId;
