# Creator Intel Personal

COCO 形象的个人达人情报助手。Chrome 扩展在 TikTok、Instagram、YouTube 与 X 的达人主页显示页面公开指标，并可从个人 VPS 上的只读达人库精确匹配历史数据；TikHub 用于可选的受众画像补充。

## 数据边界

任何 Google 账号都可以登录，但普通账号只接收平台、handle、公开主页链接、公开粉丝量和公开平均播放量。只有服务端核验为 `ahuocicicicici@gmail.com` 的账号才会接收历史价格和过往合作字段。

客户 Campaign、公司项目、联系人、沟通备注、黑名单、员工账号、公司 Google/飞书会话、访问审计和公司 API 密钥均不进入本项目。达人评价使用个人 VPS 上独立的评价库；后端只提供精确单条查询，不提供列表、搜索、导出或同步接口；所有者权限在服务端判定，前端不能自行开启。

X 流速雷达只读取当前 X 标签页已经加载的公开帖子数据，在浏览器本地计算平均曝光流速与本次浏览热帖榜，不调用 X API，也不上传帖子内容或计算结果。

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

扩展以 Chrome 的“加载已解压的扩展程序”方式加载 `extension/`，在弹窗中使用 Google 登录。TikHub Key 可选并仅保存在当前浏览器。
