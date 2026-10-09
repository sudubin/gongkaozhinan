import { seedEntries } from "./base-seed.mjs";

export const FULL_SEED_DATE = "2026-10-09";
const recent = { id: "zhejiang-meeting-127", title: "省政府党组第104次会议暨省政府第127次常务会议召开", url: "https://www.zj.gov.cn/col/col1554467/art/2026/art_a5c0ac3429044dffb39c2d848f985520.html", publisher: "浙江省人民政府", publishedAt: "2026-10-01", verifiedAt: FULL_SEED_DATE, rightsNote: "官方报道事实的原创学习摘要，原文通过链接查阅。" };
const previous = { ...recent, id: "zhejiang-meeting-126", title: "省政府党组第103次会议暨省政府第126次常务会议召开", url: "https://www.zj.gov.cn/col/col1554467/art/2026/art_b2212e8119e54b0db25fa9ea082a78bc.html", publishedAt: "2026-09-15" };
const common = (module, title, index, source) => ({ stableId: `full-seed-v1-${module}-${index}`, revision: 1, knowledgeId: `full-seed-v1-${module}-${index}`, module, region: "zhejiang", title, topic: "浙江治理与发展", keywords: ["浙江", title], sourceRefs: [source], sourcePublishedAt: source.publishedAt, validFrom: FULL_SEED_DATE, reviewedAt: FULL_SEED_DATE, rightsNote: "根据官方原文整理的学习摘要与原创辨析，非真题；请结合来源复核。", status: "published", examEvidence: [], editorRecommended: false });

export function fullSeedEntries() {
  const original = seedEntries();
  const affairs = [
    ["浙江先进制造业的发展方向", "9月30日省政府会议提出，制造业发展应兼顾智能化、绿色化和融合化。", ["只强调产量扩张", "只强调单一技术", "不考虑绿色转型"]],
    ["浙江数字贸易发展安排", "9月30日省政府会议部署货物贸易、服务贸易和数字贸易的协同发展。", ["以数字贸易替代所有贸易", "停止发展服务贸易", "仅关注货物数量"]],
    ["浙江国庆假期安全防范", "9月30日省政府会议要求强化值班值守，并关注交通、景区和人员密集场所安全。", ["节日期间取消值守", "只检查单一场所", "将隐患整改留到节后"]],
  ].map(([title, summary, wrong], index) => ({ ...common("affairs", title, index + 1, recent), eventDate: "2026-09-30", summary, examPoints: ["区分会议日期与报道发布日期；不当作今日新闻。"], wrong }));
  const province = [
    ["基本公共服务的基础性与兜底性", "governance-livelihood", "浙江省政府9月14日会议强调，基本公共服务一体化改革要把握基础保障与兜底定位。", "基本公共服务与所有公共服务的范围不能混同。", ["基本公共服务等于所有服务", "只面向单一群体", "不需要关注人口变化"]],
    ["人工智能与安全生产治理", "ideas-practice", "浙江省政府9月14日会议提出探索人工智能在安全生产中的应用，并压实安全责任。", "技术手段不能代替安全责任落实。", ["技术应用可取代全部责任", "只采购设备即可", "无需排查风险"]],
    ["督导事项的闭环落实", "economy-coordination", "浙江省政府9月14日会议要求，督导发现的问题按清单、责任和时限推进闭环解决。", "发现问题与完成整改是不同环节。", ["发现问题即代表整改完成", "没有落实时限", "只记录不处理"]],
  ].map(([title, category, keyPoint, confusion, wrong], index) => ({ ...common("zhejiang", title, index + 1, previous), category, keyPoint, confusions: [confusion], applicableYears: [2026], wrong }));
  const regional = [...affairs, ...province];
  const questions = regional.map(({ wrong, ...item }) => ({ stableId: `${item.stableId}-practice`, revision: 1, knowledgeId: item.knowledgeId, module: item.module, prompt: `依据所附官方报道，关于“${item.title}”哪项理解正确？`, options: [{ id: "A", text: item.summary ?? item.keyPoint }, ...wrong.map((text, index) => ({ id: "BCD"[index], text }))], correctOptionId: "A", explanation: `${item.summary ?? item.keyPoint} 本题为原创识记练习，并非真题。`, sourceRefs: item.sourceRefs.map(source => source.id), reviewedAt: FULL_SEED_DATE, generatedByAi: true, label: "practice" }));
  return { items: [...original.items, ...regional.map(({ wrong, ...item }) => item)], questions: [...original.questions, ...questions] };
}
