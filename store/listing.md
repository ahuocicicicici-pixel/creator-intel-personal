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

Display concise creator metrics, follower context and account-based reviews on supported profiles, plus locally calculated public-post velocity context on X.

## Permission justifications

- `storage`: stores the signed login session, panel and X-radar preferences, optional user-supplied TikHub key, cached public creator/audience results and a bounded public country-result cache locally.
- `identity`: opens the Google OAuth flow and returns the result to the extension. Only `openid`, `email` and `profile` are requested.
- `https://mccoco.xyz/*`: signs users in and performs an exact creator-library lookup.
- `https://api.tikhub.io/*`: retrieves optional public creator details or, on explicit request, recent Instagram Reels, public liker identifiers and public account-location fields used to calculate an aggregate audience-country result locally.
- TikTok, Instagram, YouTube, X and Twitter page access: recognizes creator profile pages and reads public profile/content metrics already loaded in the active page. On X, public post views and timestamps are also used locally to calculate average exposure velocity and a current-tab leaderboard; post content and calculations are not uploaded.

## Reviewer notes

1. Install version 1.3.3 and open a supported creator profile.
2. The COCO card appears near the profile avatar and immediately shows locally read public metrics when available.
3. The Overview, Followers and Reviews tabs separate the main record, public profile context / optional Instagram audience analysis and signed-in user reviews.
4. Open the extension popup and choose Google sign-in. Any Google account can sign in using only `openid email profile`.
5. A non-owner account receives only public creator-library fields and may add or delete its own creator reviews.
6. The configured owner account receives an additional clearly labeled owner-only price/collaboration section and can moderate reviews. These authorization decisions are enforced by the server from the verified Google email.
7. TikHub is optional. On an Instagram profile, the Followers tab shows “Analyze follower profile.” Before the click, the UI discloses a cap of about 313 requests and US$2.43 at the currently verified public rate; actual billing is controlled by TikHub. The UI then shows progress, effective sample size, country distribution and a local cached result. With no TikHub key, page data and exact personal-library lookup continue to work.
8. The store screenshot uses a fully synthetic COCO Studio creator profile, synthetic media and sample metrics to protect creator privacy; it demonstrates the extension layout without identifying a real creator.
9. On an X home, search, list, profile or post page, the local X velocity radar appears after public posts load. Its settings are available in the extension popup.

No reviewer credentials are required to test the public experience.
