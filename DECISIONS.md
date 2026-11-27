# Decisions

Choices the brief left open, and a few places the implementation is narrower than the full product on purpose. Phase 2 and phase 3 items are not built.

## Stack

Vite with `@cloudflare/vite-plugin` serves the React app and the Worker on one local port. `npm run dev` is the local `wrangler dev`. Durable Objects are SQLite-backed (`new_sqlite_classes`), which is the current Workers default and still supports the WebSocket hibernation API. D1 holds the org, users, catalog, templates, and session index. R2 is not bound until PDFs exist in phase 2.

## Real time

One Durable Object per session holds two Yjs documents: `shared` and `private`. Sockets use the hibernation API. Updates are JSON text frames with base64 Yjs payloads so a test can decode every client frame. The server applies updates in order and broadcasts a shared update only to sockets that are allowed to see that document. A client frame that names the private document is ignored and not relayed.

Text fields use Y.Text. The input binding sends the smallest insert or delete, so two people typing in the same title or company name do not overwrite each other. Reconnect keeps the local document and exchanges state vectors. Incremental updates that arrive before the first snapshot are queued and applied after it. Empty Yjs maps are omitted from a state snapshot, so readers use `doc.share.has` before `getMap` / `getArray` and do not create types during render.

Presence ("Ravi is editing step 3") and a coloured name chip on the focused step are synced as small JSON messages, not stored in either document. Pixel carets inside plain inputs are not tracked.

## Privacy

`showEstimates` is Durable Object storage, not a field in the shared document, so a client cannot flip it by editing the Yjs doc. Solo confirmed estimates stay hidden until the presenter turns them on. While they are off, client sockets receive `estimates: null` and no hour totals. When a presenter turns them on, the server sends formatted totals, the top step titles, and the solution-area names (the six public names from the website, for the areas that have hours). Factors, suggested fixes, private notes, pricing hints, deal tags, area overrides, and the discovery-question checklist are never included.

The six solution areas are public brand (they are on the botLane site) and are available from `/api/public/brand` without factors. The mapping of this session's steps onto those areas is presenter-only, so the colour square on a step card is drawn only in the presenter map. Flag labels and icons are public because the client has to choose them. Their factors and fixes live in the catalog row and in `shared/src/catalog.ts`, which the client bundle does not import.

The copy-summary button runs in the presenter browser. The presenter is choosing to copy that text. It includes the rough hour figures and the suggested fixes, and it excludes private notes and internal tags. It is not pushed down the client socket.

A client cannot change `orgId`, `templateId`, `industry`, or the process name. The server restores those keys if a client update touches them.

## Join links

The brief's example URL is `/join/ACME-4821`. A short code in a public path is guessable, so the link is `/join/<code>/<token>`. The code is eight Crockford characters, grouped `XXXX-XXXX`, and is what you read aloud. The token is 32 random bytes, stored as a SHA-256 hash for comparison, and also stored so the presenter can copy the link again. The code alone opens a page that says the link is incomplete. Links expire after 7 days. Ending a session or turning the link off rejects new client sockets. The spoken code is not enough to join.

Join links use the origin of the request, so local and preview links stay on the host you are actually using. Solo confirmed the canonical domain is `map.botlane.io`. It stays in the org config and in `PUBLIC_ORIGIN`, so it can still be changed without a code search.

## Auth

Production and preview use `AUTH_MODE=access`. The Worker verifies the Cloudflare Access JWT against the team JWKS and then requires that email to be on the org's `team` list. Local development uses `AUTH_MODE=dev` and a password from `.dev.vars`, checked with a constant-time compare, and sets an HttpOnly cookie. The dev login route is not registered in access mode.

Solo confirmed the allowlist starts with only `admin@botlane.io` (Solo, admin). Add the next presenter by appending `{ id, email, name, role }` to `team` in the org config. Boot syncs that list into the users table and removes anyone who is no longer on it. The `team` list is not included in the public brand response.

There is no password system in the product. Dev login must not be deployed.

## Chapters and the two screens

The client view asks one question at a time, in large type, and follows the presenter's chapter unless follow-me is turned off. The presenter keeps the whole workshop on screen (map, steps, opportunities, private notes) and uses the chapter rail to move the client's slide. That matches how a facilitator actually runs a call, and it keeps the client view to a single question.

Chapter 5 records "If this ran itself, what would change for you?" The animated before/after reveal is phase 2, so it is not in this build. When the presenter has chosen to show estimates, chapter 5 can show the rough figures with both required labels: "Illustrative, based on what you told us today" and "Rough estimate for discussion, not a result."

## Library and estimates

All twelve manufacturing processes are seeded. The first four follow the brief step for step. The rest are operational outlines with roles, tools, discovery questions, and common flags. Common flags are stored as suggestions and are not applied, so a new map does not invent the client's pain or any hours. Templates are marked Sample. A live session is not marked Sample, because it is the client's own call.

The estimate is the brief's formula: hands-on minutes × runs per week ÷ 60 × the highest factor among the step's flags. The area is the area of the first flag in the listed order, unless the presenter overrides it in the private document. Pains with no area stay under "In their words". They are not forced into Business Operations.

Flags, factors, fixes, and area names are org catalog rows (`catalogs`), copied into the Durable Object when the session is created so a later edit does not change an open call.

## Org and brand

Every D1 row that represents a tenant record has `org_id`. The shared document stores `orgId` in meta. botLane is the only seeded org. Brand (wordmark, product name, colours, domain, and the logo file paths) is the org config. The client loads `/api/public/brand` and sets the CSS variables and favicon from it. Defaults in the stylesheet match botLane so the first paint is correct.

The header uses the brand kit's navy horizontal lockup (`botlane-horizontal-primary-transparent.svg`): the official orb plus the outlined "botLane" wordmark. The favicon is the same navy orb. Those files live under `web/public/brand/` and the org config points at them, so another org can point at its own files. The prototype orb and the orange-pink-purple hero streak are gone. Orange, pink, and purple in the interface are flat tints on chips and area badges. Buttons stay navy `#061B31`. Icons in the UI are Lucide, plus Simple Icons for WhatsApp, Gmail, and Google Sheets. The orb SVG keeps the soft navy shading that is part of the supplied mark. It is not redrawn.

Simple Icons supplies WhatsApp, Gmail, and Google Sheets. Excel, Tally, and IndiaMART are not in the current Simple Icons set, so those tools use a Lucide icon rather than a made-up mark. Instrument Sans is self-hosted. The client view does not call Google Fonts or any other third party. Pages send `noindex` and `no-referrer`.

## Phase 2

The reveal is a shared flag the presenter starts at chapter 5. The client follows. "Today" is the map as described. "With botLane" marks flagged steps as automated and draws their waits back, using opacity and transform only. The top three titles are chosen on the server from the estimate ranking and sent without hour figures or fix text. The caption is "Illustrative, based on what you told us today." Reduced motion jumps to the end state.

The summary link is `/s/<token>`, a second unguessable token, expiring with the session, and switchable off. JSON, the React page, the server-rendered HTML, and the PDF are all built from `buildClientSummary`. That object is an allow-list: map, pains, "what we noticed" with public area names and rough hours, and the two disclaimer sentences. Suggested fixes, factors, notes, tags, and overrides are not copied into it.

The PDF is a text PDF generated in the Worker, with no headless browser and no third-party renderer. The server-rendered HTML is the print fallback for the same page.

CRM is a server-side adapter. `CRM_ADAPTER=noop` (the default) returns without a network call. `CRM_ADAPTER=mock` keeps the last push in the isolate for a local check. Neither calls Comp AI. `bot_central` was not read or changed, so the real HTTP shape was not guessed.

To wire the real adapter, Solo needs to provide:

1. The API base URL to call (the brief names `ops-api.botlane.io`; confirm it).
2. Auth: the header name, the scheme, and a dedicated secret for this Worker. Do not reuse the website key in the repo.
3. Find-or-create company: method, path, which field matches an existing company, and the request and response JSON.
4. Find-or-create contact: method, path, how the contact links to the company, and whether an email is required. The workshop only collects a first name and a role today.
5. Add note: method, path, and the fields for the title `Workflow map: <process>`, the plain-text body, and the summary URL.
6. The error shape, and what should happen if the same map is pushed twice.

Library changes from a live map are `template_proposals` rows with `org_id`. Approve writes or updates a template. Reject leaves the library unchanged. An admin can also add or archive a template directly. Presenters cannot approve.

## Still later

- AI routes under `/api/ai/*` return 501 to a signed-in presenter and call no model.
- Real Estate and Clinics.
- The real Comp AI HTTP adapter, once the list above is answered.
