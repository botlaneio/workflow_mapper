# botLane Workflow Mapper

Live discovery workshops. A presenter and a client draw the client's current process on the same map, in real time. This repository is `botlaneio/workflow_mapper`. It does not touch the botLane website.

Phase 1 is the live session: sign-in, a manufacturing library, a join link, five chapters, the swimlane map, and a private presenter layer that is filtered on the server.

## Run it locally

Requirements: Node 22 and npm.

```bash
cp .dev.vars.example .dev.vars
# Set AUTH_SECRET and DEV_LOGIN_PASSWORD. Never commit .dev.vars.
npm install
npm run dev
```

Open http://127.0.0.1:5173 . `npm run dev` is Vite with the Cloudflare plugin, which runs the Worker, the Durable Object, and local D1 together. That is the local equivalent of `wrangler dev`.

Sign in as `admin@botlane.io` with the password from `.dev.vars`. That address is the only one on the team allowlist (`team` in the botLane org config). Add another presenter by appending an email there. This password exists only when `AUTH_MODE=dev`. Do not deploy with `AUTH_MODE=dev`.

## Seed

The manufacturing library, the botLane org, the flag catalog, and the team allowlist are inserted on first boot if the org row is missing. Restarting `npm run dev` against an empty local D1 is enough. The allowlist is re-synced on later boots.

The schema is in `worker/migrations/` (`0001_init.sql` and `0002_phase2.sql`) for a real database:

```bash
npx wrangler d1 migrations apply workflow-mapper --local
```

Local data lives under `.wrangler/` and is gitignored. The twelve manufacturing templates are labelled **Sample** on the session picker. They contain no client results, quotes, or statistics. Hour figures stay empty until someone types them, and every estimate is marked "Rough estimate for discussion, not a result."

Check the live session and the phase 2 close:

```bash
npm test
npm run dev
node scripts/verify-phase1.mjs
node scripts/verify-phase2.mjs
```

`verify-phase2.mjs` checks the summary payload and the client socket for private fields, and runs Lighthouse on the client view and the summary page.

## After the call

The presenter can play the before/after reveal, copy a summary link (`/s/<token>`), turn that link off, download a PDF, and send the map to CRM. The summary link expires with the session, has no trackers, and is built from a server-filtered payload: the map, pains in the client's words, solution-area names, and rough hours. It does not include private notes, pricing hints, factors, or suggested-fix sentences.

CRM calls Comp AI only when the Worker has `CRM_API_KEY`. Without that secret, `CRM_ADAPTER=noop` (the default) does not call the network, and `CRM_ADAPTER=mock` only remembers the last push in the local Worker. The key is never written into this repo, `.dev.vars.example`, or the client.

To connect it, Solo creates a dedicated key in the CRM:

1. Open [ops.botlane.io](https://ops.botlane.io) → Settings → API keys.
2. Name the key `workflow-mapper`. Pick an expiry (1 to 365 days, or none).
3. Copy the `crm_...` value once. It is shown only once. Do not reuse the website key.
4. From this repo, set the Worker secret:

```bash
npx wrangler secret put CRM_API_KEY
```

For the preview Worker, add `--env preview`. Revoke the key in the same Settings screen. The REST base defaults to `https://ops-api.botlane.io/rest` and can be changed per org with `crmBaseUrl`. A push finds or creates the company, then the contact (first name, role as title, no email), then adds a note with the plain-text summary and the summary link. The CRM ids stay on the presenter's private map. A failed push shows "Not sent to CRM" with Retry, or "CRM key missing or expired" on a 401, and does not block the map.

Admins open **Library admin** to add a template, archive one, or approve a presenter's "Save as template" / "Suggest improvement" before it enters the library.

`verify-phase1.mjs` needs the dev server and Chrome. It checks that private notes never appear in client frames, that concurrent typing keeps every character, and that Lighthouse accessibility on the client view is at least 95.

## Deploy to a preview Worker

Use the preview Worker to try changes before production (see below).

1. Create a preview D1 database and put its id in `wrangler.jsonc` under `env.preview` (add a `d1_databases` block there; preview does not inherit a placeholder id safely).
2. Apply migrations to that database: `npx wrangler d1 migrations apply workflow-mapper --env preview --remote`.
3. Set secrets on the preview Worker only:

```bash
npx wrangler secret put AUTH_SECRET --env preview
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env preview
npx wrangler secret put CF_ACCESS_AUD --env preview
npx wrangler secret put CRM_API_KEY --env preview
```

`CF_ACCESS_TEAM_DOMAIN` is the team name only, for example `botlane`, which the Worker turns into `https://botlane.cloudflareaccess.com`. Leave `AUTH_MODE` as `access`. Do not set `DEV_LOGIN_PASSWORD` on the preview Worker.

4. Put Cloudflare Access in front of `/app/*`, `/api/presenter/*`, and `/api/auth/*`. Leave `/join/*`, `/api/join/*`, `/api/public/*`, and the room WebSocket public. The room still checks the join token or a presenter identity.
5. Build and deploy the preview Worker:

```bash
npm run deploy:preview
```

`deploy:preview` runs `vite build` and `wrangler deploy --env preview`. The first boot of an empty database seeds the sample library. Cloudflare Access should allow the same addresses as `team` in the org config. Today that list is only `admin@botlane.io`. The canonical domain is `map.botlane.io`, set on the org and as `PUBLIC_ORIGIN`, and join links still follow the host you are actually using.

This environment was not deployed from here: there are no Cloudflare credentials in this workspace.

## Deploy to map.botlane.io (production)

The top-level Worker `workflow-mapper` is bound to `map.botlane.io` as a Workers Custom Domain (`routes` in `wrangler.jsonc`, `workers_dev` off). The first deploy creates the proxied DNS record and certificate for `map.botlane.io` in the botlane.io zone. It does not touch the apex, `www`, `ops`, or the `bot-central` Worker. Do these in order, all from this repo after `npx wrangler login`:

1. `npx wrangler d1 create workflow-mapper` and paste the returned id into the top-level `d1_databases[0].database_id`.
2. `npx wrangler d1 migrations apply workflow-mapper --remote`.
3. Zero Trust, Access, Applications: add a self-hosted app on `map.botlane.io` for the paths `/app/*`, `/api/presenter/*`, `/api/auth/*`, with a policy that allows `admin@botlane.io`. Copy its Application Audience (AUD) tag.
4. Secrets (each prompts for the value; never paste them anywhere else):

```bash
npx wrangler secret put AUTH_SECRET
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
npx wrangler secret put CF_ACCESS_AUD
npx wrangler secret put CRM_API_KEY
```

5. `npm run deploy:prod`. This is the step that makes `map.botlane.io` live.

To take it down, remove the custom domain under Workers & Pages, workflow-mapper, Settings, Domains & Routes (that also removes its DNS record).

## Layout

- `worker/` Hono API and the `SessionRoom` Durable Object
- `web/` React app. Presenter routes live under `/app`, client routes under `/join`
- `shared/` types, the estimate formula, and the seed data
- `DECISIONS.md` choices the brief left open
