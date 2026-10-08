export type LearningModuleId = "affairs" | "general" | "idiom" | "essay" | "speed";

export interface LearningModuleRegistration {
  id: LearningModuleId;
  title: string;
  route: string;
  status: "prototype" | "enabled" | "disabled";
}

// 新模块、路由和跨模块目标只在这里装配；功能模块不互相导入内部实现。
export const learningModules: readonly LearningModuleRegistration[] = [
  { id: "affairs", title: "时政", route: "/learn/affairs", status: "prototype" },
  { id: "general", title: "常识", route: "/learn/general", status: "prototype" },
  { id: "idiom", title: "成语", route: "/learn/idiom", status: "prototype" },
  { id: "essay", title: "申论", route: "/learn/essay", status: "prototype" },
  { id: "speed", title: "速算", route: "/learn/speed", status: "prototype" },
] as const;

export const moduleById = (id: LearningModuleId): LearningModuleRegistration | undefined =>
  learningModules.find((module) => module.id === id);
