# Mozilla reviewer notes — v0.1.2

## Changes in this version

- Replaced the inaccurate `none` data declaration with required `authenticationInfo` and `browsingActivity`.
- Removed the unused `storage` API permission.
- Added the ISC license and privacy policy to both the repository and extension package.
- Added a visible data-transfer disclosure and local privacy policy link above the Export button.
- Export logic is unchanged from v0.1.1.

## Data declaration rationale

`authenticationInfo`: the current Discord session token is sent directly to Discord in the Authorization header of HTTPS requests.

`browsingActivity`: requests identify the Discord channel or DM being accessed, related guild IDs, and message pagination cursors. The category covers the visited channel/DM location disclosed through these API requests; the extension does not collect general browsing history.

Message content is fetched from Discord and processed locally. It is not uploaded to a developer service. No analytics, telemetry, advertising, native application, or developer backend is used. Generated HTML can load attachment images from original remote URLs; this is disclosed in the privacy policy. This declaration describes transmitted data, rather than claiming every locally processed message field is uploaded.

The extension requires Firefox 142 or newer and uses Firefox's built-in consent prompt for required data categories. The user must explicitly click Export before session discovery or API fetching starts.

## Testing

1. Use Firefox 142 or newer and sign in to discord.com with a dedicated test account.
2. Open a channel, DM, or thread that the test account may read and that contains test messages.
3. Open the extension popup and inspect the visible transmission disclosure and privacy policy link.
4. Choose a date/time range containing the test messages, select formats, and click Export.
5. Confirm that the download files are created and progress appears on the Discord page.
6. A range with no messages should report that no messages were found.

No paid service, developer account registration, or external hardware is required. A Discord account and access to a populated test conversation are required. Do not include live account tokens or private conversations in public bug reports. Temporary loading is useful for functional checks; the install/upgrade consent prompt should also be checked through Mozilla's signed installation flow.

## Authentication implementation

After the user clicks Export, a self-contained function runs in the page's MAIN world through browser.scripting.executeScript. It collects runtimes from webpackChunkdiscord_app and searches loaded exports for an object exposing getToken and isAuthenticated. The token passes through extension messaging to the content script and is used with https://discord.com/api/v9. It is not persisted by the extension or deliberately added to exported files.

This uses a normal user session and Discord's private API, not the official bot/OAuth2 flow. The Discord account-policy risk is disclosed in the README, privacy policy, and extension UI. This release does not claim Discord authorization or Mozilla approval.

## Source and build

Source: https://github.com/Havlight/discord-exporter/tree/v0.1.2

All executable JavaScript, HTML, and CSS is readable and included in the extension ZIP. There is no transpilation, minification, obfuscation, remote executable code, or code generation. web-ext is a development/packaging dependency and is not bundled into the extension.

Packaging environment: Windows, Node.js v26.13.0, npm 11.20.0. Dependency versions are pinned by package-lock.json.

From the v0.1.2 source archive or checkout, run:

```sh
npm ci
npm test
npm run lint
npm run build
```

Output: dist/discord_channel_exporter-0.1.2.zip. The build packages the files in src/ without transforming them. ZIP timestamps or container metadata may differ across builds. src/LICENSE and src/privacy.txt are packaged copies of the root LICENSE and PRIVACY.md; keep each pair identical when editing them.

The separately supplied discord-exporter-0.1.2-source.zip contains the tracked source, lockfile, tests, and these instructions. It is not the installable extension package. The extension ZIP is unsigned and intended for submission to Mozilla or temporary development loading.
