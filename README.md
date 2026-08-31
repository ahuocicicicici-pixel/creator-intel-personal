# Creator Intel Personal

个人版达人公开情报徽章。Chrome 扩展在 TikTok、Instagram、YouTube 与 X 的达人主页显示页面公开指标，并可从个人 VPS 上的只读达人库精确匹配历史公开指标；TikHub 是可选的实时增强来源。

## 数据边界

个人库只包含平台、handle、公开主页链接、公开粉丝量和公开平均播放量。公司 Campaign、客户项目、报价、联系人、黑名单、合作记录、评价、员工账号、Google/飞书会话、访问审计和公司 API 密钥均不进入本项目。

后端只提供带个人 API Key 的精确单条查询，不提供列表、搜索、导出或同步接口。

## 本地验证

```sh
cd server
npm test
PERSONAL_API_KEY='at-least-32-characters-for-local-test' SNAPSHOT_PATH='./data/snapshot.json' node src/index.js
```

扩展以 Chrome 的“加载已解压的扩展程序”方式加载 `extension/`，在弹窗中保存个人库 API Key。TikHub Key 可选并仅保存在当前浏览器。
