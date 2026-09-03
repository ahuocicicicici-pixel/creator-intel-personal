# Project lessons

## Published-store baseline must be verified before migration

- Trigger: a requested change refers to the currently published Chrome Web Store item.
- Error: an older or similarly named ZIP/source tree was treated as the baseline, which removed the personal edition's Google login and creator-review UI.
- Confirmed cause: the store item ID and published CRX were not resolved before choosing a repository.
- Future rule: query the Chrome update service with the exact item ID, download the published CRX, compare its manifest and payload to local candidates, and modify only the matching source tree.
- Verification: record the published version and CRX SHA-256, confirm all baseline payload files match locally, and add an acceptance test that asserts the review tab/API wiring remains present.

## Chrome OAuth redirects require an exact extension-ID allowlist

- Trigger: the server accepts `chromiumapp.org` return URLs from `chrome.identity.launchWebAuthFlow`.
- Error: validating only the hostname shape allows an attacker-controlled extension to receive a COCO one-time login code.
- Confirmed cause: the redirect validator accepted any 32-character Chrome extension ID.
- Future rule: allow only explicitly configured store extension IDs, defaulting to the published personal item ID; reject every other syntactically valid extension redirect.
- Verification: test the real published redirect and a distinct valid-looking attacker extension ID.

## Public X metrics must be monotonic and route-bounded

- Trigger: X timeline data is collected from incremental GraphQL and DOM updates.
- Error: later partial/lower counters can replace complete counters, impossible interaction rates can exceed 100%, and late filtering can read non-public route responses.
- Confirmed cause: metrics were overwritten rather than merged monotonically, and response bodies were cloned before route/operation/type/size checks.
- Future rule: merge cumulative counters by maximum, preserve complete GraphQL records, return unknown for incomplete/small/impossible rates, and filter public route plus operation before reading any response body.
- Verification: cover null/small/>100% inputs, monotonic merge including bookmarks, private-route disablement, pre-read response filtering, and packaged-source byte equality.

## “粉丝画像” means audience distribution, not account metadata

- Trigger: the personal card has a Followers tab or the user requests the verified follower-profile feature.
- Error: basic follower/following/post counts and an account-profile refresh button were labeled as “粉丝画像”, leaving out the expected analysis action and distribution result.
- Confirmed cause: the published personal UI shell was restored without tracing the separate verified Instagram audience-analysis pipeline.
- Future rule: preserve the basic profile stats, but treat “粉丝画像” as an explicit, cost-disclosed analysis of recent public audience accounts with progress, effective sample size, country/tier distribution, cache reuse, refresh, and failure states.
- Verification: assert that the IG Followers panel contains the analysis button and result wiring, unit-test TikHub response parsing/aggregation, and confirm review, engagement-rate, and X-radar regression tests still pass.

## TikHub About-country parsing must follow semantic keys and invalidate poisoned caches

- Trigger: Instagram audience analysis receives the current Bloks payload from `instagram/v3/get_user_about`.
- Error: valid countries were returned under `IG_ABOUT_THIS_ACCOUNT:about_this_account_country`, but the parser required the rendered English label `Account based in`; every result became `null`, and the 24-hour negative cache made retries repeat `0/20`.
- Confirmed cause: tests covered only the older label-shaped payload and did not include the current semantic-key response.
- Future rule: parse the exact non-visibility country key and its `initial`/value field, keep `Not shared` as unavailable, and bump both the per-user country cache and derived audience-result cache schemas whenever parsing semantics change.
- Verification: use a fixture matching the live Bloks payload, assert the country is recognized, assert old negative and aggregate entries are discarded before any cached return, and keep the insufficient-sample message explicit about inspected versus valid counts.

## Costed background analysis must persist independently of its page

- Trigger: a user-started TikHub audience analysis outlives the originating Instagram tab.
- Error: refreshing or closing the tab disconnected the content-script port, cancelled the job, and left only partial country entries without a final aggregate.
- Confirmed cause: the page port was treated as the job lifetime instead of only a result subscriber, and no persisted pending marker could resume work after a Manifest V3 service-worker restart.
- Future rule: keep the bounded job independent from subscribers, persist a minimal pending marker, request counter and partial country cache, use an alarm only to resume pending user-started work, and automatically reattach the UI when the same creator is reopened.
- Verification: simulate subscriber disconnect plus service-worker restart, assert the final aggregate is saved and the pending marker/alarm is cleared, prove the persisted request cap survives restarts, and verify the packaged UI states that refresh or tab close is safe.
