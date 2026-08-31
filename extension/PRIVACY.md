# Privacy Policy

Last updated: July 14, 2026

Creator Intel Personal processes public creator profile information on supported social media pages, performs an exact lookup against the user's read-only personal creator library, and only after an explicit user action requests additional public profile information from the TikHub API.

## Data stored locally

The extension stores the following data in Chrome local extension storage:

- The TikHub API Key entered by the user.
- The personal creator-library API Key entered by the user.
- Whether the on-page panel is enabled.
- The selected cache duration.
- Up to 100 cached public creator profile results and their timestamps.

This locally stored data is not synchronized through a Chrome account. The personal-library key is sent only to `https://mccoco.xyz/creator-intel-api`; the TikHub key is sent only to TikHub.

## Network requests

The extension sends exact platform-and-handle lookups to `https://mccoco.xyz/creator-intel-api` using the personal API Key supplied by the user. The service exposes no list or export endpoint. The extension sends requests directly from the browser to `https://api.tikhub.io` using the separate TikHub API Key supplied by the user. TikHub creator requests are initiated only when the user clicks the query button. Key validation requests may be sent when the user saves settings.

## Social media pages

The extension reads public page content and statistics already loaded by TikTok, Instagram, YouTube, or X to display local estimates. It sends only the public platform and handle to the personal library for an exact lookup; locally calculated page statistics are not uploaded.

## Data sharing and sale

The extension does not sell personal data, use data for advertising, or share data with third parties other than TikHub when the user explicitly requests a TikHub API operation.

## Data deletion

Users can delete all extension data at any time by removing the extension or clearing the extension's site data in Chrome.

## Contact

Support and privacy contact: `ahuocicicicici@gmail.com`.
