# 初始 100 条与无人值守内容更新

## 已提供的能力

- 内置 100 条学习卡：全国时政、常识、成语、申论各 25 条，另有 75 道原创练习。
- 手机不配置 API 也可首次离线使用。首次载入为增量合并，不清空已有学习内容或记录。
- GitHub 每日任务默认目标为 20 条新卡，每模块 5 条；分批调用，不把几百条塞入一次模型响应。
- 每批完成立即写入公共内容包。某个模块失败，不丢弃其他模块的结果。
- 标题归一化去重，内容标识由模块和归一化标题生成，同一天多批次不覆盖旧条目。
- 每模块每天最多 3 次 API 调用，防止反复失败、重复生成导致费用失控。
- App 默认自动同步。打开、恢复前台或前台联网后检查，不需要每天按按钮或批准。
- 关闭自动同步会记住设置，已有内容继续保留。

## 一次性启用（仓库管理员）

打开仓库 **Settings → Secrets and variables → Actions**。

在 Repository secrets 中配置三个值：

| 名称 | 含义 |
| --- | --- |
| `CONTENT_API_KEY` | 现有兼容 Chat Completions 接口的 API 密钥 |
| `CONTENT_API_BASE_URL` | HTTPS 接口基础地址，通常以 `/v1` 结束；不要附加 `/chat/completions` |
| `CONTENT_MODEL` | 服务商提供的模型 ID |

不要把密钥写入代码、README、公开文件或聊天；只放到 GitHub 的加密 Secrets。

在 Repository variables 中添加 `AUTO_CONTENT_ENABLED`，值为 `true`。可选变量 `CONTENT_DAILY_PER_MODULE` 默认为 `5`，允许 `1` 至 `25`。更大目标仍受每日调用次数和输出长度约束，并不保证每天凑满。

### 百炼 Qwen3.7 Flash

- `CONTENT_MODEL` 填 `qwen3.7-flash`（注意连字符）。
- `CONTENT_API_BASE_URL` 使用与密钥同地域的 OpenAI 兼容地址。例如北京地域为 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`；替换为自己的业务空间 ID，不能原样填占位符，也不要追加 `/chat/completions`。
- `CONTENT_API_KEY` 填该地域的百炼密钥，仅放在 Repository secrets。
- 脚本对百炼官方地址上的这个型号及其日期快照启用 JSON Object 输出，并设置 `enable_thinking=false`。这减少思考过程的额外等待与消耗，但不能保证事实正确，现有来源、证据和结构校验仍执行。
- 这里只修改云端生成请求，不需要重新安装 App。未配置密钥并完成真实运行前，不能宣称日更已接通。

依据：[百炼接口与地域说明](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)、[深度思考参数](https://help.aliyun.com/zh/model-studio/deep-thinking)、[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)。

在 Actions 中允许运行工作流，保证 `GITHUB_TOKEN` 可写仓库内容，且分支规则允许机器人提交内容包。首次可手动运行 **Daily study content** 验证连接，此后无需每日操作。

计划时间是北京时间每天 07:17，但 GitHub 调度可能延迟；公共仓库长期没有活动时，GitHub 也可能暂停计划任务。不能把计划时间当作严格准点保证。详见 [GitHub 官方计划任务说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

API 调用可能按服务商计费。工作流默认不启用，只有配置变量为 `true` 才会调用；想暂停时将其改为 `false` 即可。没有有效密钥、没有启用工作流或没有新来源时，不会自动新增内容，原有 100 条保持可用。

## 公共内容与手机同步

- 内置包：`public/content/seed.json`，随安装包携带。
- 云端累计内容包：`public/content/latest.json`，从 100 条开始持续增加。
- 断点进度：`public/content/generation-state.json`，记录每日各模块成功数和调用数，无密钥。
- App 的订阅地址：本仓库 `main` 分支的 `public/content/latest.json`。Fork 后须修改 `src/infrastructure/publishedContent.ts` 中的 `CONTENT_FEED`。

手机打开后无需手动操作即可同步；手机彻底关闭、断网或被系统停止时不承诺即时下载。内容生成在 GitHub 运行，不依赖手机每天打开。下次使用时会取得累计增量，因此错过数日也不需要逐日补点。

App 对内容包校验摘要、模块范围和题目关联，只合并新增条目或更高修订，不倒退修订号，不清空本机题库和学习记录。摘要用于完整性检查，不是第三方数字签名；内容信任来自本仓库的 HTTPS 地址和仓库写入权限。

## 内容质量边界

自动检查能排除错误格式、未知来源、未来事件日、题目标识冲突，以及明确冒充真题的标签。事实类卡片还须提供能在输入原文中定位的证据片段。但它不能替代事实审校，也不能保证模型推理准确。

时政和常识生成时从官方正文的短片段中选择证据编号，服务器核对编号和来源并原样填入引用，不接受模型自行改写成“原文”的片段。四模块分别使用明确字段类型的模板，申论的 `questions` 必须为空数组。结构或证据检查失败的批次不发布，达到当天调用上限后等待下一日，不重置次数追求凑满。

初始时政卡使用明确日期的历史政府工作报告，不是“今天发生的新闻”。申论表达与成语例句是原创示范。所有题为 AI 辅助原创练习，明确标注 `practice`。使用时应核对来源；需要高可信发布时，应增加人工审核环节。

## 验证与维护

本地运行 `npm test` 检查数量、去重、证据、断点保存和失败保护；`npm run build` 自动生成并校验内置 100 条后构建。正常构建不会重置云端累计内容包。

资料抓取直接读取国家统计局公开目录和中国政府网公开的 `ZUIXINZHENGCE.json` 文章列表，再获取文章正文；不会执行来源网页的脚本。统计局动态标题为空时使用静态页面标题。页脚导航、站外链接、超过 31 天或未来日期的文章不会作为新材料。

运行日志只输出公开来源的域名、检查数量和固定错误码，不输出密钥、模型接口地址或原始错误响应。`no_recent_official_sources` 表示没有取得合格资料，发生在付费生成前；`provider_http_401` / `provider_http_403` 表示接口拒绝鉴权或访问；`provider_invalid_json` 等表示生成结果未通过检查。抓取失败时不要直接重填密钥，也不要取消内容校验。

若 GitHub 提示访问权限不足，应检查仓库 Actions 权限和分支规则；不要通过公开提交密钥或放宽整个账号权限来处理。
