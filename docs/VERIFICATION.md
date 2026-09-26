# Verification notes

Checked on 26 September 2026 with Node.js 24 and Chromium.

## Automated checks

`npm run check` passes TypeScript checking, 61 regression tests, and the production Worker/browser build. GitHub Actions runs the same command on pushes to `main` and pull requests.

The regression tests cover:

- Private first-time setup, concurrent setup attempts, password changes, session revocation, rate limits, cross-origin requests, and database failures.
- Fresh and existing D1 schemas, saved-token privacy, input validation, bot/task association checks, and Telegram error handling.
- Overlapping scheduled runs, queue/offset atomicity, repeated updates, pause/resume behavior, partial batch failures, and Telegram cooldowns.
- Public and private Telegram message links, supported chat identifiers, and rejection of unrelated or deceptive URLs.
- Compatibility with old extension selections: stored selections no longer filter incoming messages or carry into new saved setups.
- Task classification after pausing combined history/new-message tasks, including completed history, cancelled history, and attention states.
- Empty DELETE streams, deletion authorization, invalid-body rejection, cascading queue/activity cleanup, and preservation of saved setups.
- Authenticated light/dark/system preferences, logout/login persistence, concurrent partial changes, obsolete theme settings, strict input validation, and database failures.

The dependency audit reported no known vulnerabilities after updating the lockfile. An audit reflects the advisory database at the time it runs; it is not a guarantee about future issues.

## Browser checks

First-time setup, sign-in, HttpOnly session cookies, and sign-out were exercised against the local Cloudflare Workers runtime and a local D1 database.

Task, bot, and saved-setup deletion were also checked through the browser against the real local Worker and D1 using synthetic records, including cancelling the confirmation and compatibility with older empty DELETE requests.

Telegram-dependent screens used synthetic API responses. These checks covered:

- Light and dark modes on ten routes at 320px, 390px, 768px, and 1440px, plus dialogs and enlarged text: 85 combinations with no horizontal overflow or browser errors.
- Saved appearance restored after reload, logout/login, and sign-in from a fresh browser. Follow device responds to device appearance changes; signed-out pages follow the device.
- Phone navigation, all four task-creation steps, Telegram chat-link normalization, pause/resume, task search and views, task editing, and the bot connection dialog.
- Failed appearance-save rollback and recovery when a save succeeds but its response is lost.
- Task editing without restarting the cursor, no extension fields in creation/editing, and optional filters collapsed by default.
- Task details at 320px width with text enlarged to 200%.
- 1,414 visible text and SVG color checks across both modes met the chosen contrast thresholds (4.5:1 for normal text, 3:1 for large text and icons). This is a focused color check, not a full accessibility certification.

The repository screenshots show synthetic example data, not messages from a real Telegram account.

## Live-service checks still required

This verification did not deploy to the owner's Cloudflare account or send messages through a real Telegram bot. After deployment, connect a dedicated bot to two test chats and verify a small history range, a new message, pause/resume, and a scheduled run with the browser closed.

Actual throughput depends on Cloudflare account limits, Telegram limits, and the bot's permissions. Telegram sending and D1 progress writes are separate operations, so a process failure between them can repeat a message. See the README for setup instructions and copying limitations.
