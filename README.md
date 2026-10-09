# 公考指南

一个面向公务员考试备考的 Android 学习工具。本仓库保留通用开源版的源码和安装包，同时新增浙江完整版的版本下载；完整版源码暂不在本仓库公开。

## 版本下载

| 版本 | 内容与安装方式 | 下载 |
| --- | --- | --- |
| 浙江完整版 1.1（新增测试版） | 保留浙江省情、浙江时政；内置 106 条学习卡和 81 道原创练习。包名 `cn.gongkao.guide`，与原浙江版本签名相同，可作为原版升级包。 | [下载完整版 APK](https://github.com/sudubin/gongkaozhinan/releases/download/v1.1-full/gongkao-guide-zhejiang-full-1.1.apk) · [版本说明](docs/releases/v1.1-full.md) |
| 通用开源版 1.0（保留） | 全国时政、常识、成语、申论和速算；内置 100 条学习卡和 75 道原创练习。独立包名 `cn.gongkao.guide.opensource`，可与完整版共存。 | [下载开源版 APK](https://github.com/sudubin/gongkaozhinan/releases/download/v1.0-open-source/gongkao-guide-open-source.apk) · [版本说明](docs/releases/v1.0-open-source.md) |

两个安装包均为测试 APK，Android 7.0 及以上可安装；学习记录各自保存在本机，不会因安装另一个版本自动迁移。升级或卸载前建议先导出学习备份。也可从仓库的 [下载文件目录](downloads/) 获取安装包。

**完整版状态：** 学习功能和本地增量同步已实现，但每日云端生成/分发尚未上线，会员和收费也尚未接通。安装包没有内置维护者的 API key；公开下载不代表已具备付费使用限制。开源版原有源码、内容库和更新任务此次均未覆盖。

## 浙江完整版界面

| 浙江学习首页 | 完整版更新设置 |
| --- | --- |
| <img src="docs/images/zhejiang-full-home.png" alt="浙江完整版学习首页，保留浙江时政和浙江特色省情" width="300" /> | <img src="docs/images/zhejiang-full-updates.png" alt="完整版自动同步设置，明确提示云端服务尚未配置" width="300" /> |

## 开源版界面预览

| 学习首页 | 全国时政 |
| --- | --- |
| ![学习首页](docs/images/learn-home.png) | ![全国时政](docs/images/national-affairs.png) |

![自动内容更新](docs/images/automatic-updates.png)

## 初始内容与自动更新

安装包内置 **100 条学习卡**：全国时政、常识、成语、申论各 25 条，另配 75 道原创练习。首次打开即可离线学习，不需要先配置 API。时政初始卡是 2026 年政府工作报告的分主题历史考点，不是 25 个最新独立事件；事件日和来源发布日期分别展示。申论句段是原创写作示范，不是政策原文或名人引语。

云端任务可每天自动生成增量内容，默认目标每模块 5 条、合计 20 条；每批立即保存，重复内容跳过，来源不足时不强行凑数。App 在联网打开、恢复前台及前台定时检查时自动合并新内容，保留原库、收藏、笔记、复习和作答记录。手机关闭时由云端生成，不承诺 Android 在后台准点下载。

仓库管理员须一次性设置加密 API 配置并启用任务；当前代码不会自动读取或上传手机端密钥。详见 [自动更新配置](docs/content-automation.md)。生成内容只经过自动结构、引用和证据片段检查，不等于逐条人工审校；所有 AI 题标记为练习题，不是真题。

## 已实现

- 今日 / 学习 / 复习 / 我的四导航
- 全国时政、常识、成语、申论、速算入口
- 搜索空状态与主题筛选面板
- 知识卡、来源与适用期、收藏
- 单选题提交、文字化对错反馈、错因与区别笔记
- 成语回忆揭示、易混对照和辨析题
- 申论素材分区及个人摘记
- 基期量公式、精算/估算切换、数字键盘、±2% 边界判分
- 浏览器本地保存学习状态

## 本地运行

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

## Android 打包

需要 JDK 21 和 Android Studio / Android SDK：

```bash
npm run android:apk
```

构建产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`。开源版 Android 包名为 `cn.gongkao.guide.opensource`，可与原版同时安装。

无需在本机安装打包工具也可使用 [GitHub 云端打包](https://github.com/sudubin/gongkaozhinan/actions/workflows/android-apk.yml)：源码更新后自动构建，也可手动运行。成功后从对应运行记录的 Artifacts 下载 `gongkao-guide-open-source-debug-apk`，解压得到 APK；下载需登录 GitHub，产物保留 90 天。当前为调试安装包，不是正式签名发行版；不同云端构建的签名可能变化，跨构建升级前请备份学习记录。

仓库根目录仍为开源版源码，不是浙江完整版的完整源码。早期上传的开源源码压缩包保留作历史备份，不代表当前版本。GitHub 发布页自动生成的 Source code 压缩包同样是此仓库的开源源码，不含未公开的完整版源码。

## 项目范围

学习记录保存在本机，公共学习内容从本仓库自动同步。API 密钥与个人学习数据不会进入公共内容包。开源仓库包含独立构建所需的内部组件，不依赖原版项目目录；原版项目保留不变。

## 开源协议

本仓库的开源版源码继续采用 [MIT License](LICENSE)，原许可文件保持不变。完整版 APK 内保留其复用部分的 `OPEN-SOURCE-NOTICES.txt`；这次没有上传完整版源码，也没有新增商业授权或收费条款。
