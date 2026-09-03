# Chrome Web Store privacy-practices answers

## Data categories handled

- Personally identifiable information: Google email, display name, profile picture and subject identifier for sign-in and access control.
- Authentication information: a signed COCO session stored in Chrome local storage.
- Website content: public creator handle and public metrics loaded on supported pages, public X post timestamps/metrics used only for local velocity calculations, and public Instagram audience-account identifiers/usernames/location fields used only after an explicit audience-analysis request.
- Web browsing activity: only the current supported profile URL/handle needed to recognize the profile and perform the requested lookup; X page context is used locally to keep the current-tab velocity leaderboard separated by page.
- User-provided content: optional creator rating label and review text submitted by a signed-in user.
- User-provided API credential: optional TikHub key stored locally and sent only to TikHub.
- Local pending-job metadata: the public Instagram handle, start/update timestamps and reserved TikHub request count are stored only while an explicitly user-started audience analysis is pending, then removed when it finishes or fails.

## Data usage

All handled data is necessary for the extension's single purpose: showing creator-research context on supported social-media pages. Data is not sold, used for advertising, used for creditworthiness, or transferred to data brokers. Google identity data is sent only to the COCO service for authentication, review authorship/moderation and access control. Optional review text is sent only when the user submits it. The optional TikHub key is sent only to TikHub when the user requests public profile data or Instagram audience-country analysis. A pending audience job may continue after its tab closes; Chrome alarms only resume that explicitly user-started request and do not schedule periodic collection. X post content, public metrics, velocity results and leaderboard data remain in the current browser tab and are not uploaded; Instagram audience analysis is aggregated and cached locally.

## Remote code

No remote code is executed. All extension JavaScript is included in the submitted package. Network responses are treated only as data.

## Certifications

- Data use complies with the Chrome Web Store User Data Policy, including Limited Use requirements.
- Data is transmitted over HTTPS.
- The extension has one narrow disclosed purpose.
- Human access to user data is not part of normal operation.
