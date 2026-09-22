# Repository Guidelines

Docsify-based static documentation site for **docsichat** — an in-browser API companion for Red Hat OpenShift AI model endpoints (and any OpenAI-compatible API): settings form, copyable curl commands, chat/streaming playground with serving metrics, rendered as documentation pages. Pure static files: no build step, no bundler, no server-side code.

## Project Overview

- Documentation site (docsify **pinned to 5.0.0** on jsDelivr — the latest 5.x; don't float `@5`) with one custom vanilla-JS plugin, `docs/api-config.js`, that renders interactive widgets inside markdown pages: an API endpoint/key settings form, masked-key placeholders, a copyable curl command, a model-list fetcher, and basic/streaming chat testers with usage + latency metrics (TTFT, tok/s).
- Data lives only in the browser: settings persist to `localStorage` under `docsichat:api:endpoint` / `docsichat:api:key`; per-widget UI state (prompts, selected model) to `sessionStorage` under `docsichat:api:ui:chat` / `ui:stream`; the model list to a 5-min TTL sessionStorage cache `docsichat:api:ui:modelCache` keyed by endpoint. No backend.
- Pages: Home (`README.md`), `guide.md`, `configuration.md` (settings; renamed from `settings.md`), `curl.md`, `basic-chat.md`, `streaming.md`, plus `docs/_404.md` (404 page).

## Architecture & Data Flow

1. Browser loads `docs/index.html` → pulls docsify@5.0.0 core theme, dark addon (with a manual light/dark/OS toggle button in index.html), `docsify.js`, search plugin, then local `api-config.css` + `api-config.js`. A CSP meta tag governs sources (`connect-src *` — arbitrary user endpoints).
2. `api-config.js` is an IIFE that **prepends** `apiConfigPlugin(hook)` onto `window.$docsify.plugins` before docsify initializes.
3. `hook.doneEach` (runs after every page render) queries the DOM for mount points and renders widgets:
   - `#api-config-form` → settings form with **Test connection**, **Clear**, and a storage-failure banner (on `configuration.md`)
   - `#api-curl-command` → masked curl command + Copy button (on `curl.md`)
   - `#api-models` → "List models" button doing `GET {endpoint}/models` with `Bearer` key
   - `#api-test-chat` → single-shot chat completion + usage metrics (on `basic-chat.md`), with a **Load example** button
   - `#api-test-stream` → streaming chat with **Stop** (AbortController), live output (aria-live), and TTFT/tok-s metrics (on `streaming.md`)
   - `.api-config[data-field="endpoint|key"]` spans → refreshed placeholders site-wide
   - `mountSettingsHeader()` → sticky saved-config header on playground pages
4. Form → `localStorage` (all access `try/catch`-wrapped for private mode; `storageAvailable()` probe drives the banner) → placeholders refreshed on next `doneEach`. UI state restores on mount (`restoreTestForm`/`restoreTestModel`), so navigation doesn't lose prompts.
5. Key is **masked in display** (first 6 chars — or `eyJ…` for JWT-shaped keys — + `••••••••`); the full key goes only to the clipboard or the network request. Preserve this behavior.
6. Endpoints are normalized on save: `normalizeEndpoint` appends `/v1` only when no path exists. Model `<option>` values are the **full** model id from the API (RHOAI needs `namespace/name`); `normalizeModelId` shortens labels only. All requests flow through `checkConnection(endpoint, key, done)`.
7. CORS reality (probed 2026-09-22): browser use requires the endpoint to answer CORS preflights. `litemaas.rhoai.rh-aiservices-bu.com/v1` does (uvicorn echoes any Origin); Kuadrant-protected MaaS routes (e.g. `maas.apps.ocp.cloud.rhai-tmm.dev/prelude-maas/*`) reject the preflight with 401 and no CORS headers — browsers cannot reach them at all, so `curl.md` is the documented fallback and fetch failures say so.

## Key Directories

| Path | Purpose |
| --- | --- |
| `docs/` | Entire source tree and deploy root (GitHub Pages, `docs/.nojekyll`) |
| `docs/api-config.js` | Docsify plugin: widget rendering, storage, key masking, curl builder, chat/stream testers, model cache, connection checks |
| `docs/api-config.css` | Plugin styles; uses docsify CSS custom properties with fallbacks |
| `docs/*.md`, `docs/_sidebar.md` | Pages and grouped nav (Configuration / Playground); every `.md` in `docs/` is a route (`guide.md` → `#/guide`) |
| `docs/index.html` | Entry point: pinned docsify, CSP meta, dark-mode toggle |
| `scripts/serve.py` | Dev server: SimpleHTTPRequestHandler + `Cache-Control: no-store` on every response (replaces plain `http.server`) |
## Development Commands

```sh
# Serve locally (from repo root); port 3010 — 3000 is occupied by another project on this machine
python3 scripts/serve.py        # serves docs/ at http://localhost:3010/ (no path segment)
# plain `python3 -m http.server 3010` from the REPO ROOT serves the same files at http://localhost:3010/docs/
# then open http://localhost:3010/ (scripts/serve.py) or http://localhost:3010/docs/ (plain http.server)
```

Deploy = push to the default branch; GitHub Pages serves `docs/` at the project URL, e.g. `https://rh-aiservices-bu.github.io/docsichat/` (`.nojekyll` present). CORS probes used `https://rh-aiservices-bu.github.io` as the Pages origin — a subpath under the same origin.

## Code Conventions & Common Patterns

- **Plugin JS (`api-config.js`)**: IIFE + `'use strict'`, ES5 style (`var`, function declarations), ALL_CAPS module constants (`STORAGE_PREFIX`, `FIELDS`, `MASK`, `PREVIEW_LEN`, `ENDPOINT_PREVIEW_LEN`, `UI_KEYS`, `MODEL_CACHE_TTL`). Keep new plugin code in this file.
- **HTML escaping**: user-influenced values are escaped before `innerHTML` — never interpolate raw values.
- **Mount-point pattern**: markdown pages embed empty `<div id="...">` mounts and `<span class="api-config" data-field="...">` slots; the plugin fills them in `doneEach`. Add a widget = add mount div in a page + branch in `apiConfigPlugin`.
- **Public API**: `window.DocsifyApiConfig = { get, set, mask }` — extend, don't rename.
- **CSS**: scope under `.api-config*` / `.api-test*`; custom buttons get a shared `:focus-visible` outline (docsify core has none).
- **Markdown pages**: H1 title, prose, code fences with language tags; new page = create `.md` + link in `docs/_sidebar.md` (grouped: Configuration / Playground).

## Important Files

- `docs/index.html` — entry point; `window.$docsify = { name: 'docsichat', loadSidebar: true, subMaxLevel: 2, notFoundPage: true }` with pinned 5.0.0 URLs and the CSP meta. Plugin script tags must stay **after** `docsify.js` and `window.$docsify` config. The dark-mode toggle script and button live here.
- `docs/api-config.js` — all custom logic.
- `docs/_sidebar.md` — navigation; every page must be linked here or it's unreachable.
- `BACKLOG.md` — prioritized backlog with per-item status and evidence; keep statuses current when landing work.

## Runtime/Tooling Preferences

- Plain ES5-friendly browser JS; no transpilation, no imports/modules, no dependencies to install.
- Do not add a build step — editing files and refreshing is the workflow. `.gitignore` intentionally excludes `dist/`/`build/` ("docsify needs none").
- **Cache gotcha (local dev)**: plain `python3 -m http.server` sends `Last-Modified`, so Chrome heuristic-caches edited `api-config.js`/`api-config.css` — changes silently don't load on reload. Prefer `scripts/serve.py` (`Cache-Control: no-store`); with plain http.server, hard-reload (Cmd+Shift+R) or verify via `fetch('/api-config.js')` in the page console.
- **Verification preference (measured 2026-09-22)**: in-browser agent verification is very slow (44m and 28m jobs) and this machine's Chrome 153 closes the CDP DevTools WebSocket after the first command (reproduced at byte level; `scripts/smoke-check.js` takes its designed SKIP path here). Sub-agents should land code and verify with mock servers / Node units / `node --check` only; do one fast browser smoke at the end, or none — mock/Node checks caught every real bug, the browser caught none.
- **Concurrency gotcha**: when multiple agents work this repo, `docs/api-config.js` is a single serialization point — parallelize only across file-disjoint work and hand the plugin through one owner at a time. Re-check `git status`/`git diff` before pickup: file references went stale within hours (e.g. `settings.md` → `configuration.md`).

## Testing & QA

- No test framework. Fast checks first, browser last:
  1. `node --check docs/api-config.js` after every plugin edit — but note it only catches *syntax*: a called-but-undefined function (e.g. the `parseUsage` bug fixed in f2cf13e) parses fine and throws at runtime on every chat/stream completion. Scan call sites for definitions when adding/removing helpers.
  2. Mock-verified request paths (scratch-port mock servers for SSE/usage shapes; Node unit runs for pure helpers like `parseUsage`/`normalizeEndpoint`).
  3. `node scripts/smoke-check.js` against the served site — per-check PASS/FAIL (widget mounts, settings round-trip, full key never in DOM, console errors); needs a Chrome with a working DevTools socket, otherwise clean SKIP.
  4. Manual browser spot-check (only for visual changes): pages render, sidebar works, no console errors; `configuration.md` save → reload → values persist, key shown masked (6 chars / `eyJ…`); `curl.md` Copy puts the **full** key on clipboard while display stays masked; private-mode safety: storage-failure banner shows, form degrades gracefully.
