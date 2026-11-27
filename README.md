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

Sign in as `admin@botlane.io` (admin) or `sales@botlane.io` (presenter) with the password from `.dev.vars`. This password exists only when `AUTH_MODE=dev`. Do not deploy with `AUTH_MODE=dev`.

## Seed

The manufacturing library, the botLane org, the flag catalog, and the two team users are inserted on first boot if the org row is missing. Restarting `npm run dev` against an empty local D1 is enough.

The same schema is in `worker/migrations/0001_init.sql` for a real database:

```bash
npx wrangler d1 migrations apply workflow-mapper --local
```

Local data lives under `.wrangler/` and is gitignored. The twelve manufacturing templates are labelled **Sample** on the session picker. They contain no client results, quotes, or statistics. Hour figures stay empty until someone types them, and every estimate is marked "Rough estimate for discussion, not a result."

Check the phase 1 behaviour, including the client WebSocket privacy proof:

```bash
npm test
npm run dev
node scripts/verify-phase1.mjs
```

`verify-phase1.mjs` needs the dev server and Chrome. It checks that private notes never appear in client frames, that concurrent typing keeps every character, and that Lighthouse accessibility on the client view is at least 95.

## Deploy to a preview Worker

Do not deploy to production. There is no production environment in this repo.

1. Create a preview D1 database and put its id in `wrangler.jsonc` under `env.preview` (add a `d1_databases` block there; preview does not inherit a placeholder id safely).
2. Apply migrations to that database: `npx wrangler d1 migrations apply workflow-mapper --env preview --remote`.
3. Set secrets on the preview Worker only:

```bash
npx wrangler secret put AUTH_SECRET --env preview
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN --env preview
npx wrangler secret put CF_ACCESS_AUD --env preview
```

`CF_ACCESS_TEAM_DOMAIN` is the team name only, for example `botlane`, which the Worker turns into `https://botlane.cloudflareaccess.com`. Leave `AUTH_MODE` as `access`. Do not set `DEV_LOGIN_PASSWORD` on the preview Worker.

4. Put Cloudflare Access in front of `/app/*`, `/api/presenter/*`, and `/api/auth/*`. Leave `/join/*`, `/api/join/*`, `/api/public/*`, and the room WebSocket public. The room still checks the join token or a presenter identity.
5. Build and deploy the preview Worker:

```bash
npm run deploy:preview
```

`deploy:preview` runs `vite build` and `wrangler deploy --env preview`. The first boot of an empty database seeds the sample library. Replace `admin@botlane.io` and `sales@botlane.io` with the real Google Workspace addresses that Access will send, or those people cannot sign in.

This environment was not deployed from here: there are no Cloudflare credentials in this workspace.

## Layout

- `worker/` Hono API and the `SessionRoom` Durable Object
- `web/` React app. Presenter routes live under `/app`, client routes under `/join`
- `shared/` types, the estimate formula, and the seed data
- `DECISIONS.md` choices the brief left open
