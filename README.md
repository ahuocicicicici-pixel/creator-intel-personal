# COCO Creator Intel

A Chrome extension for evaluating public creator profiles without leaving TikTok, Instagram, YouTube or X.

[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/coco-creator-intel/ogmmgjpedgjhhdpmmjiadgphenmineaa) · [View Mark's portfolio](https://mccoco.xyz/portfolio)

![COCO Creator Intel displayed beside a creator profile](https://mccoco.xyz/portfolio/assets/projects/kol-intel/coco-store-mock-1280x800.jpg)

## What it does

- Detects supported creator profile pages across four platforms.
- Displays public follower, view and engagement metrics in one compact panel.
- Adds optional Instagram audience-country analysis from public engagement samples.
- Calculates X post exposure velocity and a current-tab leaderboard locally.
- Performs exact, read-only creator-library lookups through a separately hosted API.
- Keeps reviews and historical collaboration fields behind server-side authorization.

## Product boundary

The extension is designed as a personal creator-intelligence product rather than a copy of an internal company system. Customer campaigns, company projects, contacts, communication notes, blacklists, employee accounts, company sessions and company API keys are excluded.

Regular signed-in users receive only public creator information. Restricted historical fields are returned only when the server authorizes the signed-in account. The API exposes exact lookups rather than list, search, export or synchronization endpoints.

X Radar reads public post data already rendered in the active tab. Exposure velocity and ranking calculations stay in the browser; post content and calculated results are not uploaded.

For the complete disclosure, see [`extension/PRIVACY.md`](extension/PRIVACY.md).

## Repository map

```text
extension/  Chrome Manifest V3 extension
server/     Read-only authentication and exact-lookup API
store/      Chrome Web Store listing and review materials
scripts/    Packaging and release checks
```

## Local verification

```sh
cd server
npm test
PERSONAL_API_KEY='at-least-32-characters-for-legacy-test' \
SESSION_SECRET='at-least-32-characters-for-session-signing' \
GOOGLE_CLIENT_ID='google-web-client-id' \
GOOGLE_CLIENT_SECRET='google-web-client-secret' \
SNAPSHOT_PATH='./data/snapshot.json' node src/index.js
```

Load `extension/` through Chrome's **Load unpacked** option and sign in from the popup. A TikHub API key is optional and is stored only in the current browser.

## Source terms

The source is publicly viewable for product evaluation and portfolio review. No open-source license or permission to reproduce, redistribute or operate a competing hosted service is granted.
