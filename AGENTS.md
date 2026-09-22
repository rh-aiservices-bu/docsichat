# Repository Guidelines

Docsify-based static documentation site for **docsichat** — an in-browser API settings/curl helper rendered as documentation pages. Pure static files: no build step, no bundler, no server-side code.

## Project Overview

- Documentation site (docsify v5, loaded from jsDelivr CDN) with one custom vanilla-JS plugin, `docs/api-config.js`, that renders interactive widgets inside markdown pages: an API endpoint/key settings form, masked-key placeholders, a copyable curl command, and a model-list fetcher.
- Data lives only in the browser: settings persist to `localStorage` under `docsichat:api:endpoint` / `docsichat:api:key`. No backend.

## Architecture & Data Flow

1. Browser loads `docs/index.html` → pulls docsify@5 core theme, `docsify.js`, search plugin, then local `api-config.css` + `api-config.js`.
2. `api-config.js` is an IIFE that **prepends** `apiConfigPlugin(hook)` onto `window.$docsify.plugins` before docsify initializes.
3. `hook.doneEach` (runs after every page render) queries the DOM for mount points and renders widgets:
   - `#api-config-form` → settings form (on `settings.md`)
   - `#api-curl-command` → masked curl command + Copy button (on `curl.md`)
   - `#api-models` → "List models" button doing `GET {endpoint}/models` with `Bearer` key
   - `.api-config[data-field="endpoint|key"]` spans → refreshed placeholders site-wide
4. Form → `localStorage` (all access `try/catch`-wrapped for private mode) → placeholders refreshed on next `doneEach`.
5. Key is **masked in display** (first 10 chars + `••••••••`); the full key goes only to the clipboard or the network request. Preserve this behavior.

## Key Directories

| Path | Purpose |
| --- | --- |
| `docs/` | Entire source tree and deploy root (GitHub Pages, `docs/.nojekyll`) |
| `docs/api-config.js` | Docsify plugin: widget rendering, localStorage, key masking, curl builder |
| `docs/api-config.css` | Plugin styles; uses docsify CSS custom properties with fallbacks (`var(--docsify-brand, #42b983)`) |
| `docs/*.md`, `docs/_sidebar.md` | Pages and nav; every `.md` in `docs/` is a route (`guide.md` → `#/guide`) |
| `.gitignore` | OS/editor junk, secrets, `node_modules` (reserved for future tooling) |

## Development Commands

No `package.json`, no npm scripts, no build, no CI.

```sh
# Serve locally (from repo root); port 3010 — 3000 is occupied by another project on this machine
python3 -m http.server 3010
# then open http://localhost:3010/docs/
```

Deploy = push to the default branch; GitHub Pages serves `/docs` (`.nojekyll` present).

## Code Conventions & Common Patterns

- **Plugin JS (`api-config.js`)**: IIFE + `'use strict'`, ES5 style (`var`, function declarations), ALL_CAPS module constants (`STORAGE_PREFIX`, `FIELDS`, `MASK`, `PREVIEW_LEN`). Keep new plugin code in this file.
- **HTML escaping**: user-influenced values are escaped before `innerHTML` — never interpolate raw values.
- **Mount-point pattern**: markdown pages embed empty `<div id="...">` mounts and `<span class="api-config" data-field="...">` slots; the plugin fills them in `doneEach`. Add a widget = add mount div in a page + branch in `apiConfigPlugin`.
- **Public API**: `window.DocsifyApiConfig = { get, set, mask }` — extend, don't rename.
- **CSS**: scope under `.api-config*`; theme colors via docsify custom properties with literal fallbacks.
- **Markdown pages**: H1 title, prose, code fences with language tags; new page = create `.md` + link in `docs/_sidebar.md` (bulleted link list).

## Important Files

- `docs/index.html` — entry point; `window.$docsify = { name: 'docsichat', loadSidebar: true, subMaxLevel: 2 }`. Plugin script tags must stay **after** `docsify.js` and `window.$docsify` config.
- `docs/api-config.js` — all custom logic.
- `docs/_sidebar.md` — navigation; every page must be linked here or it's unreachable.

## Runtime/Tooling Preferences

- Plain ES5-friendly browser JS; no transpilation, no imports/modules, no dependencies to install.
- Do not add a build step — editing files and refreshing is the workflow. `.gitignore` intentionally excludes `dist/`/`build/` ("docsify needs none").
- **Cache gotcha (local dev)**: `python3 -m http.server` sends `Last-Modified`, so Chrome heuristic-caches edited `api-config.js`/`api-config.css` — changes silently don't load on reload. Verify with `fetch('/docs/api-config.js')` in the page console and force-pick-up via `Page.reload {ignoreCache:true}` (CDP) or manual hard reload (Cmd+Shift+R).

## Testing & QA

- No test framework. Verify manually in a browser against the served site:
  1. Pages render, sidebar works, no console errors.
  2. `settings.md`: save endpoint/key → reload → values persist; key shown masked.
  3. `curl.md`: Copy puts the **full** key on clipboard while display stays masked; "List models" fetches `{endpoint}/models` with `Bearer` auth.
  4. Private-mode safety: form degrades gracefully with storage unavailable.
