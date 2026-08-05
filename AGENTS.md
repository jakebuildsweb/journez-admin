# AGENTS.md — Admin Portal (`admin-portal/`)

> **READ THIS FIRST** before editing any `.js` here. Pushing does not deploy — see the deploy path below.

## Owns
The Journez admin portal front-end: the `/admin-locations` and `/admin-events` pages' behaviour — auth/session, Supabase CRUD, the CSV importers, hours editor, image upload.

- `admin-core.js` — shared: Supabase client, session/auth (`requireSession`, `signOut`), `sbFetch`, image upload, toasts, modal helpers.
- `locations.js` — locations page: CRUD, hours editor, locations CSV import.
- `events.js` — events page: CRUD, events CSV import (different schema from locations).

## Out of scope
The location dataset itself and the pipeline that produces the CSVs → `../assets/data/AGENTS.md`. Supabase schema/RLS, TTS/audio → root `CLAUDE.md`. Webflow page *markup/CSS* lives in each page's custom code in Webflow, not here.

## Repo identity
Clone of **`jakebuildsweb/journez-admin`** (GitHub, public). `origin` is the real remote — commits and pushes here go to the actual repo.

## Branches — consolidated 2026-08-05
**`main` is the single source of truth, and the only branch.**

History: production used to run from a branch called `jakebuildsweb-patch-1` while `main` sat stale, diverged, and missing `admin-core.js` entirely (its HEAD was literally `Delete admin-core.js`). On 2026-08-05 that branch was merged into `main`, both Webflow pages were repointed at `main`, the site was published, and the old branch was deleted after verifying nothing referenced it.

## How a change reaches production
Editing files here does **not** update the live site. The Webflow pages load this code over jsDelivr from GitHub:

1. Commit and push to `main`.
2. Update the `<script src>` refs in the Webflow page's **footer custom code** to the new commit SHA (Webflow MCP: `data_scripts_tool` → `get_page_freeform_code` / `set_page_freeform_code`, or just edit in the Webflow UI — the tags are the last two lines of the footer block).
3. Publish the Webflow site.

Page IDs: `admin-locations` = `641b296798b82f3f8410de21`, `admin-events` = `69aa75a90845c838f5c68065`.

**Prefer pinned commit SHAs over branch refs.** A branch ref auto-deploys on every push and jsDelivr caches it for ~12h, so you get delayed, unpredictable rollouts. A pinned SHA is immutable and cached permanently — deploys happen only when you deliberately bump the ref.

### Currently live (as of 2026-08-05)
Both pages are pinned to commit **`f4c07ea4458a4e5a4efbe5cfcbd378d452582681`**:

- `admin-locations` → `admin-core.js` + `locations.js` at that SHA
- `admin-events` → `admin-core.js` + `events.js` at that SHA

Each footer also contains one or two **commented-out** `@main/...?v=1` script lines left over from the old workflow. They are inert — don't mistake them for the active refs.

### Editing the footer safely
The footer block is ~8–10KB of modal HTML with the script tags as the last two lines. `set_page_freeform_code` replaces the **entire** block, so never hand-retype it. The safe procedure, used for the 2026-08-05 repoint:

1. `get_page_freeform_code` and save the current footer to a local backup file.
2. Do the ref swap **programmatically** (string replace on the exact old tag), and `diff` old vs new to prove only the script lines changed.
3. Sanity-check that every `onclick="handler(...)"` in the footer is still exported by the matching `.js` (`window.handler = ...`) — this catches a dropped element better than eyeballing.
4. `set_page_freeform_code`, publish, then verify the live HTML with `curl | grep jsdelivr`.

## Invariants (never violate)
- **Never commit secrets.** `admin-core.js` contains the Supabase URL and the **anon** key — public by design, RLS enforces access. Any service-role key, or any third-party API key (e.g. Speechify), must never land here — those go through a Supabase Edge Function. Mirrors the root `CLAUDE.md` hard rule.
- **Never delete a branch or commit that a live `<script src>` still points at.** jsDelivr resolves refs at request time; the page 404s the moment the ref disappears.
- CSV importer behaviour is contract, not implementation detail — `../assets/data/AGENTS.md` documents the exact contract the 13 shipped CSVs rely on. Changing validation, city/category matching, or hours parsing can silently break a 271-row import.

## Confuses new engineers
- **A push does not deploy.** Both pages are pinned to commit SHAs, so a push changes nothing live until the Webflow ref is bumped and the site republished. (This is deliberate — `admin-core.js` used to sit on a branch ref and auto-deploy, which made rollouts unpredictable.)
- The events CSV schema is **not** the locations schema — different columns entirely (dates/times, no category, no hours, no phone).
- An unmatched CSV city name does not error on import — the row silently inserts with `city_id: null`. See the importer contract in `../assets/data/AGENTS.md`.
- The footer custom code in Webflow is ~20KB of modal HTML with the script tags at the very end. When editing refs, change only those last lines — rewriting the whole block risks breaking the page's modals.
