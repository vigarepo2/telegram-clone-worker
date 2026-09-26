# Verification notes

Checked on 26 September 2026 with Node.js 24 and Chromium.

## Automated checks

`npm run check` passes TypeScript checking, 62 regression tests, and the production Worker/browser build. GitHub Actions runs the same command on pushes to `main` and pull requests.

The regression tests cover:

- Private first-time setup, concurrent setup attempts, password changes, session revocation, rate limits, cross-origin requests, and database failures.
- Fresh and existing D1 schemas, saved-token privacy, input validation, bot/task association checks, and Telegram error handling.
- Overlapping scheduled runs, queue/offset atomicity, repeated updates, pause/resume behavior, partial batch failures, and Telegram cooldowns.
- Public and private Telegram message links, supported chat identifiers, and rejection of unrelated or deceptive URLs.
- Extension normalization, filename and MIME matching, malformed or unknown metadata, schema upgrades, saved setups, and filtering before delivery.
- Authenticated workspace preferences, all twenty theme IDs, logout/login persistence, concurrent partial changes, strict input validation, and database failures.

The dependency audit reported no known vulnerabilities after updating the lockfile. An audit reflects the advisory database at the time it runs; it is not a guarantee about future issues.

## Browser checks

First-time setup, sign-in, HttpOnly session cookies, and sign-out were exercised against the local Cloudflare Workers runtime and a local D1 database.

Telegram-dependent screens used synthetic API responses. These checks covered:

- All twenty themes across 360px, 768px, and 1440px widths on the dashboard, task details, settings, help, and task setup: 300 combinations with no horizontal overflow or browser errors.
- Navigation on a phone, theme selection, and saved appearance restored after reload, logout/login, and sign-in from a fresh browser. Chat-link normalization, all four task-creation steps, validation feedback, and submitted task settings were also checked.
- History and live-message pause/resume controls, task editing, bot renaming, and the bot connection form.
- Display preferences and task defaults, rapid theme changes, failed-save rollback, and recovery when a save succeeds but its response is lost.
- Creating a task with selected video, photo, and document extensions; editing an existing selection; contextual help dialogs; and FAQ search.
- Task details at 320px width with text enlarged to 200%, plus phone dialog and sign-in layouts.

The repository screenshots show synthetic example data, not messages from a real Telegram account.

## Live-service checks still required

This verification did not deploy to the owner's Cloudflare account or send messages through a real Telegram bot. After deployment, connect a dedicated bot to two test chats and verify a small history range, a new message, pause/resume, and a scheduled run with the browser closed.

Actual throughput depends on Cloudflare account limits, Telegram limits, and the bot's permissions. Telegram sending and D1 progress writes are separate operations, so a process failure between them can repeat a message. See the README for setup instructions and copying limitations.
