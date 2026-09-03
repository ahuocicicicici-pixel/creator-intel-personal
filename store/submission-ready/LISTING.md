# Chrome Web Store listing

## Name

COCO Creator Intel

## Summary

COCO adds creator metrics, reviews and optional Instagram audience insights, plus a local post-velocity radar on X.

## Detailed description

COCO Creator Intel places a compact research card next to supported creator profiles. It reads public metrics already visible on the current page, calculates lightweight recent-content averages when enough public samples are available, and performs an exact lookup against the COCO creator library.

Main features:

- Works on TikTok, Instagram, YouTube and X creator profiles.
- On X, shows locally calculated per-post average exposure velocity and a current-tab leaderboard without calling the X API.
- Shows public follower, view and engagement context without requiring an API key.
- Keeps average views and engagement rate visible in the compact default card.
- Organizes creator history, follower data and signed-in user reviews into separate tabs.
- Lets signed-in users add creator reviews; authors can delete their own reviews and the owner can moderate them.
- Lets any Google account sign in for public creator-library matches.
- Restricts historical prices and past collaboration records to the verified library owner.
- Lets the user explicitly run an optional Instagram audience-country analysis with their own TikHub key and a visible cap of about 313 requests / US$2.43 at the currently verified public rate.
- Keeps preferences, login session, optional TikHub key and cached public results in Chrome local storage.
- Continues an explicitly started Instagram audience analysis in the extension background, saving progress and results locally even if its tab is refreshed or closed.

COCO Creator Intel does not read Gmail, Drive, Calendar, contacts or Google passwords. It does not provide bulk creator-list export, automated outreach or advertising functionality.

## Category and language

- Category: Productivity
- Primary language: English
- Additional supported interface language: Chinese (Simplified)

## URLs

- Website: https://mccoco.xyz/
- Support: https://mccoco.xyz/creator-intel-api/support
- Privacy policy: https://mccoco.xyz/creator-intel-api/privacy
- Terms: https://mccoco.xyz/creator-intel-api/terms

## Single purpose

Display creator metrics, optional Instagram audience-country insights, account-based reviews, and locally calculated X post-velocity context on supported social-media profiles.

## Permission justifications

- `storage`: stores the signed login session, panel and X-radar preferences, optional user-supplied TikHub key, cached public creator/audience results and a bounded public country-result cache locally. While a user-started Instagram audience job is pending, it also stores the public handle, start/update timestamps and reserved TikHub request count; these pending fields are removed when the job finishes or fails.
- `identity`: opens the Google OAuth flow and returns the result to the extension. Only `openid`, `email` and `profile` are requested.
- `alarms`: uses Chrome alarms only to resume a pending, user-started Instagram audience analysis if Chrome suspends the extension service worker; it does not schedule periodic creator collection.
- `https://mccoco.xyz/*`: signs users in and performs an exact creator-library lookup.
- `https://api.tikhub.io/*`: retrieves optional public creator details or, on explicit request, recent Instagram Reels, public liker identifiers and public account-location fields used to calculate an aggregate audience-country result locally.
- TikTok, Instagram, YouTube, X and Twitter page access: recognizes creator profile pages and reads public profile/content metrics already loaded in the active page. On X, public post views and timestamps are also used locally to calculate average exposure velocity and a current-tab leaderboard; post content and calculations are not uploaded.

## Reviewer notes

No credentials required. Install v1.3.5; open a TikTok, Instagram, YouTube or X profile. The COCO card shows Overview, Audience Insights and Reviews; public metrics work without sign-in. Google sign-in accepts any account; non-owners see public fields and can manage their reviews. On X, load posts to test the local velocity radar. On Instagram Audience Insights, add your own TikHub key to test optional audience-country analysis; the request/cost cap appears first. Owner-only history is server-enforced.
