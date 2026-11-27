# Decisions

Choices the brief left open, and a few places the implementation is narrower than the full product on purpose. Phase 2 and phase 3 items are not built.

## Stack

Vite with `@cloudflare/vite-plugin` serves the React app and the Worker on one local port. `npm run dev` is the local `wrangler dev`. Durable Objects are SQLite-backed (`new_sqlite_classes`), which is the current Workers default and still supports the WebSocket hibernation API. D1 holds the org, users, catalog, templates, and session index. R2 is not bound until PDFs exist in phase 2.

## Real time

One Durable Object per session holds two Yjs documents: `shared` and `private`. Sockets use the hibernation API. Updates are JSON text frames with base64 Yjs payloads so a test can decode every client frame. The server applies updates in order and broadcasts a shared update only to sockets that are allowed to see that document. A client frame that names the private document is ignored and not relayed.

Text fields use Y.Text. The input binding sends the smallest insert or delete, so two people typing in the same title or company name do not overwrite each other. Reconnect keeps the local document and exchanges state vectors. Incremental updates that arrive before the first snapshot are queued and applied after it. Empty Yjs maps are omitted from a state snapshot, so readers use `doc.share.has` before `getMap` / `getArray` and do not create types during render.

Presence ("Ravi is editing step 3") and a coloured name chip on the focused step are synced as small JSON messages, not stored in either document. Pixel carets inside plain inputs are not tracked.

## Privacy

`showEstimates` is Durable Object storage, not a field in the shared document, so a client cannot flip it by editing the Yjs doc. While it is off, client sockets receive `estimates: null` and no hour totals. When a presenter turns it on, the server sends formatted totals only: a weekly figure, the top step titles, and area names. Factors, suggested fixes, private notes, pricing hints, deal tags, area overrides, and the discovery-question checklist are never included.

The six solution areas are public brand (they are on the botLane site) and are available from `/api/public/brand` without factors. The mapping of this session's steps onto those areas is presenter-only, so the colour square on a step card is drawn only in the presenter map. Flag labels and icons are public because the client has to choose them. Their factors and fixes live in the catalog row and in `shared/src/catalog.ts`, which the client bundle does not import.

The copy-summary button runs in the presenter browser. The presenter is choosing to copy that text. It includes the rough hour figures and the suggested fixes, and it excludes private notes and internal tags. It is not pushed down the client socket.

A client cannot change `orgId`, `templateId`, `industry`, or the process name. The server restores those keys if a client update touches them.

## Join links

The brief's example URL is `/join/ACME-4821`. A short code in a public path is guessable, so the link is `/join/<code>/<token>`. The code is eight Crockford characters, grouped `XXXX-XXXX`, and is what you read aloud. The token is 32 random bytes, stored as a SHA-256 hash for comparison, and also stored so the presenter can copy the link again. The code alone opens a page that says the link is incomplete. Links expire after 7 days. Ending a session or turning the link off rejects new client sockets. The spoken code is not enough to join.

Join links use the origin of the request, so local and preview links stay on the host you are actually using. The canonical domain remains `map.botlane.io` in the org config and `PUBLIC_ORIGIN`, until Solo confirms it.

## Auth

Production and preview use `AUTH_MODE=access`. The Worker verifies the Cloudflare Access JWT against the team JWKS and then requires that email to exist on the org. Local development uses `AUTH_MODE=dev` and a password from `.dev.vars`, checked with a constant-time compare, and sets an HttpOnly cookie. The dev login route is not registered in access mode. Seeded users are `admin@botlane.io` (Solo, admin) and `sales@botlane.io` (presenter). Those addresses are placeholders for the real Google Workspace emails.

There is no password system in the product. Dev login must not be deployed.

## Chapters and the two screens

The client view asks one question at a time, in large type, and follows the presenter's chapter unless follow-me is turned off. The presenter keeps the whole workshop on screen (map, steps, opportunities, private notes) and uses the chapter rail to move the client's slide. That matches how a facilitator actually runs a call, and it keeps the client view to a single question.

Chapter 5 records "If this ran itself, what would change for you?" The animated before/after reveal is phase 2, so it is not in this build. When the presenter has chosen to show estimates, chapter 5 can show the rough figures with both required labels: "Illustrative, based on what you told us today" and "Rough estimate for discussion, not a result."

## Library and estimates

All twelve manufacturing processes are seeded. The first four follow the brief step for step. The rest are operational outlines with roles, tools, discovery questions, and common flags. Common flags are stored as suggestions and are not applied, so a new map does not invent the client's pain or any hours. Templates are marked Sample. A live session is not marked Sample, because it is the client's own call.

The estimate is the brief's formula: hands-on minutes × runs per week ÷ 60 × the highest factor among the step's flags. The area is the area of the first flag in the listed order, unless the presenter overrides it in the private document. Pains with no area stay under "In their words". They are not forced into Business Operations.

Flags, factors, fixes, and area names are org catalog rows (`catalogs`), copied into the Durable Object when the session is created so a later edit does not change an open call.

## Org and brand

Every D1 row that represents a tenant record has `org_id`. The shared document stores `orgId` in meta. botLane is the only seeded org. Brand (wordmark, product name, colours, logo tints, domain) is the org config. The client loads `/api/public/brand` and sets the CSS variables from it. Defaults in the stylesheet match botLane so the first paint is correct.

The orb and the hero streak are the artwork from the supplied prototype. The brand kit was not in this workspace. They should be replaced with the official files when Solo provides `botlane-brand-kit.zip`. The geometry was not redrawn. The streak is used once, on the team home screen.

Simple Icons supplies WhatsApp, Gmail, and Google Sheets. Excel, Tally, and IndiaMART are not in the current Simple Icons set, so those tools use a Lucide icon rather than a made-up mark. Instrument Sans is self-hosted. The client view does not call Google Fonts or any other third party. Pages send `noindex` and `no-referrer`.

## Not in this phase

- The animated reveal, the summary link, the PDF, and the CRM push. The Comp AI calls will be copied from `bot_central` in phase 2. They were not guessed, and that repo was not modified.
- Library admin, "Save as template", and "Suggest improvement".
- AI routes under `/api/ai/*` return 501 to a signed-in presenter and call no model.
- Real Estate and Clinics.
