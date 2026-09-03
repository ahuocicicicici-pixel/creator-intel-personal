# COCO Creator Intel

中文 | [English](README.en.md)

一款达人情报 Chrome 扩展，让你无需离开 TikTok、Instagram、YouTube 或 X 的达人主页，就能评估公开数据。

[从 Chrome 应用商店安装](https://chromewebstore.google.com/detail/coco-creator-intel/ogmmgjpedgjhhdpmmjiadgphenmineaa) · [查看 Mark 的作品集](https://mccoco.xyz/portfolio)

![COCO Creator Intel 显示在达人主页旁](https://mccoco.xyz/portfolio/assets/projects/kol-intel/coco-store-mock-1280x800.jpg)

## 主要功能

- 识别四个平台的达人主页。
- 在一个紧凑面板中展示公开粉丝量、播放量和互动率。
- 可选分析 Instagram 公开互动样本中的受众国家分布。
- 在浏览器本地计算 X 帖子的曝光流速和当前标签页热帖榜。
- 通过独立托管的 API，对个人达人库进行精确、只读查询。
- 在服务端权限控制下提供达人评价和历史合作字段。

## 产品边界

这个扩展是独立的个人达人情报产品，不是公司内部系统的复制品。客户 Campaign、公司项目、联系人、沟通备注、黑名单、员工账号、公司会话和公司 API 密钥均不进入本项目。

普通登录用户只会收到公开达人信息。受限的历史字段仅在服务端确认当前账号具有权限后返回。API 只提供精确查询，不提供列表、搜索、导出或同步接口。

X 流速雷达只读取当前标签页已经渲染的公开帖子数据。曝光流速和排行均在浏览器本地计算，帖子内容和计算结果不会上传。

完整披露请查看 [`extension/PRIVACY.md`](extension/PRIVACY.md)。

## 仓库结构

```text
extension/  Chrome Manifest V3 扩展
server/     登录认证与只读精确查询 API
store/      Chrome 应用商店文案与审核材料
scripts/    打包与发布检查脚本
```

## 本地验证

```sh
cd server
npm test
PERSONAL_API_KEY='at-least-32-characters-for-legacy-test' \
SESSION_SECRET='at-least-32-characters-for-session-signing' \
GOOGLE_CLIENT_ID='google-web-client-id' \
GOOGLE_CLIENT_SECRET='google-web-client-secret' \
SNAPSHOT_PATH='./data/snapshot.json' node src/index.js
```

在 Chrome 的“加载已解压的扩展程序”中选择 `extension/`，然后从弹窗登录。TikHub API Key 为可选项，并且只保存在当前浏览器中。

## 源码条款

源码公开用于产品评估和作品集审阅。本仓库未授予开源许可，也未授予复制、再分发或运营竞争性托管服务的权限。
