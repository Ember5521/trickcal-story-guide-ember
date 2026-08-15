# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Korean-language story-order guide for the game **트릭컬 (Trickcal)**. Renders story episodes as a pannable node graph (React Flow) so players can follow a recommended viewing order. Static Next.js export hosted on GitHub Pages; all content lives in Supabase.

## Commands

```bash
npm run dev      # local dev (admin editing only works here — see below)
npm run build    # next build -> static export into ./out
npm run lint
npx tsx scripts/migrate.ts   # one-off copy of tables + storage between two Supabase projects
```

No test suite exists.

## Deployment

`.github/workflows/deploy.yml` builds and pushes to GitHub Pages on push to **`main`**. Day-to-day work happens on `develop`; nothing deploys until merged to `main`.

- Live site: https://ember5521.github.io/trickcal-story-guide-ember/
- The repo was renamed (`trickcal-story-guide` → `trickcal-story-guide-ember`); the local `origin` still uses the old name and works via GitHub's 301 redirect.
- `next.config.js` hardcodes `repoName = 'trickcal-story-guide-ember'` for `basePath`/`assetPrefix` under `NODE_ENV=production`. Changing the repo name means changing this too.
- `NEXT_PUBLIC_*` values are injected at build time from GitHub Actions vars/secrets. They are baked into the client bundle.

## Two Supabase projects

`.env.local` holds both:

- **dev** (`NEXT_PUBLIC_SUPABASE_URL`) — what `npm run dev` reads and writes. Editing happens here.
- **deploy** (`DEPLOY_SUPABASE_URL`) — what the built site reads.

`src/app/api/sync-db/route.ts` (`POST /api/sync-db`, `mode: 'push' | 'pull'`) copies tables and the `story-images` bucket between them, rewriting the project-ref inside every stored URL as it goes. It syncs incrementally using `admin_settings.last_synced_at` on the target.

**This route only runs under `next dev`.** `output: 'export'` means the static build ships no server, so the API route and the `"use server"` action in `src/app/actions.ts` are dead code in production. Same for admin mode, which is gated on `!isProd && NEXT_PUBLIC_ENABLE_ADMIN === 'true'`. The published site is strictly read-only.

## Data model

Four tables, normalized so that content and placement are separate:

- **`master_stories`** — the episode itself: `label`, `type`, `image`, `youtube_url`, `full_video_url`, `protagonist`, `importance`, `part_label`, `split_type`. One row per episode, shared across all views.
- **`story_layouts`** — one row per `(view_type, season)` pair, holding a `nodes` JSON array and an `edges` JSON array. Each layout node stores only `id`, `story_id`, `x/y/w/h`, plus `m_x`/`m_y` (separate mobile coordinates) and `splitType`.
- **`admin_settings`** — single row (`id = 1`), password + `last_synced_at`.
- **`app_updates`** — changelog entries surfaced as an in-app notification bell.

Load path (`StoryCanvas.tsx` ~line 1010, mirrored in `MobileCanvas.tsx` ~line 130): fetch the one `story_layouts` row for the current `(viewType, season)`, collect its `story_id`s, then fetch those `master_stories` in a single `.in()` query and merge. Layout nodes typed `annotationNode` carry inline `content` and have no `story_id`.

`view_type` is one of `recommended | chrono | release | elflix`. `season` is an integer (1–3 currently).

All writes go through Postgres RPC functions, never direct table writes: `verify_admin_password`, `save_story_layout`, `update_master_story`, `create_master_story`, `save_app_update`. Each takes the admin password and checks it inside the database. The SQL for these lives only in Supabase (`*.sql` is gitignored).

## Client state

Nothing about the user is stored server-side. All per-user state is `localStorage`:

`view_mode` (pc/mobile override) · `user_settings` (season + viewType) · `watched_history_s{season}` · `last_watched_story` · `user_story_memo` · `intro_completed` · `last_read_update_at`

## Image pipeline

Images live in the Supabase `story-images` bucket under `nodes/{season}/`. Stored URLs in the deploy DB already point at the Cloudflare Worker (`NEXT_PUBLIC_IMAGE_PROXY_URL`); `sync-db`'s `transformUrls` rewrites them during push.

`getProxyUrl()` is duplicated verbatim in `StoryCanvas.tsx`, `MobileCanvas.tsx`, and `StoryNode.tsx` — it maps `https://{ref}.supabase.co/storage/v1/object/public/{path}` to `{proxy}/{ref}/{path}`. Change one, change all three.

**Known problem:** the Worker is a pass-through and caches nothing. Every image request still reaches Supabase's Smart CDN, and Supabase bills those bytes as *Cached Egress* — which is currently over the free-tier limit. Verified by requesting the same image repeatedly through the same Cloudflare colo: `sb-request-id` differs every time, and the response carries only Supabase's headers. The proxy hides the hostname; it does not reduce egress. Fixing this means either adding `caches.default` to the Worker (source is in the Cloudflare dashboard, not this repo) or moving the ~12.5 MB of images into `public/` so GitHub Pages serves them.

## Layout code

`StoryCanvas.tsx` (PC, ~3000 lines) and `MobileCanvas.tsx` (~1600 lines) are near-independent implementations of the same app, chosen in `src/app/page.tsx` by user-agent and viewport width, with a manual toggle persisted to `view_mode`. Fixes to shared behavior usually need applying twice; mobile reads `m_x`/`m_y` where PC reads `x`/`y`.

PC zoom is scaled: `SCALE_OUTER = 0.55` means React Flow's internal zoom `0.55` is displayed to the user as `100%`. Use `toDisplayZoom` / `fromDisplayZoom` rather than raw zoom values.
