# Creator Intel Personal

独立个人版 Chrome 扩展。在 TikTok、Instagram、YouTube 和 X 的达人主页自动读取公开数据，精确匹配个人 VPS 上的公开达人历史库，并允许用户选择性使用自己的 TikHub API Key 获取增强资料。

## 功能

- 自动识别四个平台的达人主页。
- 读取页面已经加载的公开数据，估算近期平均播放与互动。
- 无需 API Key 即可抓取当前页面公开的粉丝、播放和互动数据。
- 使用个人库 API Key 查询 `mccoco.xyz` 上的只读达人库。
- 用户可选择主动点击并直连 TikHub API 获取增强资料。
- TikHub API Key 和查询缓存只保存在当前浏览器的 `chrome.storage.local`。
- 默认缓存 24 小时，可在扩展弹窗调整。

## 本地安装

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本目录。
4. 在弹窗中填写个人库 API Key；TikHub API Key 为可选设置。

## 费用提示

页面本地统计不会调用 TikHub。只有用户在达人面板中点击“获取 TikHub 资料”时才会请求 TikHub API，相关费用由用户自己的 TikHub 账户承担。YouTube 查询需要先解析频道 ID，再获取频道资料，可能产生两次 API 请求。

## 数据边界

本扩展不包含组织登录、团队协作、名单导入、营销触达或公司业务系统集成。个人库只保留公开身份和公开指标。详细说明见 [PRIVACY.md](PRIVACY.md)。
