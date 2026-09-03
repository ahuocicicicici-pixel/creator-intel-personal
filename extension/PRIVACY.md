# Privacy Policy

Last updated: September 3, 2026

COCO Creator Intel processes public creator profile information on supported social media pages and performs an exact lookup against a read-only creator library. Only after an explicit user action does it request additional public profile information from the TikHub API.

## Data stored locally

The extension stores the following data in Chrome local extension storage:

- The TikHub API Key entered by the user.
- A signed COCO Creator Intel session containing the Google account identity returned by the service.
- Whether the on-page panel is enabled.
- The selected cache duration.
- X velocity-radar preferences, including whether badges and the local leaderboard are enabled and their thresholds.
- Up to 100 cached public creator profile results and their timestamps.

This locally stored data is not synchronized through a Chrome account. The signed session is sent only to `https://mccoco.xyz/creator-intel-api`; the TikHub key is sent only to TikHub.

## Google sign-in

Any Google account may sign in. The service processes the verified Google subject identifier, email address, display name, and profile image to issue a session and enforce access. It requests only the `openid`, `email`, and `profile` scopes and does not request or read Gmail, Drive, Calendar, contacts, or Google passwords.

Signed-in users may voluntarily submit a creator rating label and review text. The personal COCO service stores the review with the verified account identity for authorship and moderation. Other signed-in users see the display name, rating, review text, and date, but not the author's email address. Authors may delete their own reviews; the owner may moderate all reviews.

Historical prices and past collaboration records are returned only when the verified email exactly matches the configured owner account. All other accounts receive public creator fields only. This access rule is enforced by the server, not by the extension interface.

## Network requests

The extension sends exact platform-and-handle lookups to `https://mccoco.xyz/creator-intel-api` using the signed login session. The service exposes no list or export endpoint. The extension sends requests directly from the browser to `https://api.tikhub.io` using the separate TikHub API Key supplied by the user. TikHub creator requests are initiated only when the user clicks the query button. Key validation requests may be sent when the user saves settings.

## Social media pages

The extension reads public page content and statistics already loaded by TikTok, Instagram, YouTube, or X to display local estimates. On X, it locally calculates each visible public post's average exposure velocity from its public cumulative views and published time, and may show a local leaderboard for posts seen in the current tab. It does not call the X API or upload post content, post metrics, velocity results, or leaderboard data. It sends only the public platform and handle to the personal library for an exact lookup; locally calculated page statistics are not uploaded.

## Data sharing and sale

The extension does not sell personal data, use data for advertising, or share data with third parties other than TikHub when the user explicitly requests a TikHub API operation.

## Data deletion

Users can delete local extension data at any time by removing the extension or clearing the extension's site data in Chrome. Review authors can delete their own reviews from the creator card. Users may contact the support address below for a broader review or account-data deletion request.

## Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Contact

Support and privacy contact: `ahuocicicicici@gmail.com`.
