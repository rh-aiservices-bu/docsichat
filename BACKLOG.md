# docsichat Backlog

Candidate work for the docsichat app (docsify v5 static site + `docs/api-config.js` plugin).
Grounded in a code review of 2026-09-22; stress-tested by a devils-advocate review the same
day (verdict: fragile as first written — findings applied below: stale item dropped, ordering
corrected, CORS verification added, scope creep demoted).

**Decided intent (2026-09-22):** audience = tutorial participants (RHOAI GenAI users who just
deployed a model and got an endpoint + token); primary uses = sanity-check the endpoint and
show serving perf (TTFT / tok/s); endpoints = RHOAI (namespace/name ids) and generic
OpenAI-compatible, first-class; direction = docs+playground hybrid; raw SSE view dropped
("I'll never need the raw view"). Priorities follow the participant journey:
configure → verify → iterate → demo.

**Working rules:** another agent instance works `docs/*` concurrently — run `git status`/`git diff`
and re-read affected files before picking up ANY item, not just In-flight ones (the list went
stale within a day once already). File references: the settings page is now
`docs/configuration.md` (renamed from `settings.md`).

## In flight / just landed (another instance)

- Basic Chat + Streaming widgets (`basic-chat.md`, `streaming.md`, `mountChat`/`mountStream`) — in flight, may be transiently broken mid-write.
- Landed while this backlog was written: Clear button on the Configuration form (clears key + endpoint), settings page rename to `configuration.md`.

## P1 — configure & verify

0. **Verify browser reachability/CORS against real endpoints.** Both primary uses are in-browser `fetch` with `Authorization`/`Content-Type` headers → forced CORS preflight; the plugin itself notes "CORS is required for this call to work at all". If preflight fails, every widget shows `TypeError: Failed to fetch` while curl on the same endpoint succeeds — a false negative on the tool's core promise, for the non-CLI audience least able to diagnose it. Do first: `curl -X OPTIONS` with `Origin` + `Access-Control-Request-Method: POST` against one real RHOAI model server route and one vLLM server, from the GitHub Pages origin and `localhost:3010`. Then: document that "Failed to fetch" means CORS/network, not auth; if RHOAI routes don't echo CORS headers, the curl twin becomes the documented fallback for RHOAI endpoints.
1. **Send full model id; display short name.** The most blocking correctness bug for RHOAI users: `normalizeModelId` strips a `namespace/name` prefix for the `<option>` value too, so every chat request uses the stripped id — RHOAI model servers 404. Keep the full id as the value, show the short name as the label.
2. **"Test connection" on Configuration.** Save, then `GET {endpoint}/models` and show status inline — a participant's first question is "did I paste this right?". Design note: share one `checkConnection(endpoint, key)` helper with the model-select fetch rather than parallel one-offs.
3. **Model-list failure UX.** On failure the model `<select>` shows "Model list unavailable" with no reason and no retry. Participants hit CORS/401/typo constantly; the reason is the diagnostic. Implementation note: the select path (`listModelsForSelect` catch) discards the error object entirely — thread the error through; reusing the `mountModels` message alone is not enough. Add a Retry button.
4. **`/v1` validation on save.** Non-CLI participants paste the RHOAI route URL; `modelsUrl` blindly appends `/models`, so a missing `/v1` yields a bare 404 with no hint — the most plausible week-one failure. Normalize (append `/v1` if absent) or warn inline on save.
5. **Drop the raw SSE view from Streaming.** Decision (2026-09-22): "I'll never need the raw view." Remove the Rendered/Raw radio toggle and raw panel from `mountStream`; keep rendered output, `stream_options.include_usage`, and the TTFT/tok-s metrics. Scope notes: (a) the raw panel is currently the only window into actual SSE bytes — add a replacement diagnostic (last N raw SSE events to `console.debug`, or a paste-able failure summary) so mid-stream errors and missing usage chunks stay debuggable; (b) `docs/streaming.md` prose still promises "(or view the raw SSE)" — update it in the same change; (c) do this LAST in P1, only after the in-flight streaming work lands.
6. **Docs accuracy quick fixes.** `docs/README.md` says `python3 -m http.server 3000 --directory docs` — 3000 is occupied and AGENTS.md standardizes on 3010; setup instructions must be copy-pasteable. `docs/configuration.md` prose ("To change it, replace it in the form above") doesn't mention the Clear button that now exists.

## P2 — iterate & demo (serving perf)

7. **Remember UI state per widget.** Every `doneEach` re-mounts widgets: model select resets and prompts are wiped on navigation. Persist selected model and last prompt/system draft under `docsichat:api:ui:*` — this is the mid-demo data-loss fix; also the recovery path for token-expiry 401s (re-paste in Configuration, come back, prompt still there). Before the cache item.
8. **Cache the model list.** `listModelsForSelect` refetches `/models` on every visit to Basic Chat and Streaming. Short TTL cache (sessionStorage) with manual refresh — demo-day navigation shouldn't re-hit the server.
9. **Abort/stop for streaming.** In-flight requests can't be cancelled: add `AbortController` + Stop button, disable Run while streaming.
10. **tok/s fallback when usage is missing.** If the final usage chunk never arrives (gateways that strip `stream_options`, older RHOAI stacks), output tokens correctly show "(no usage in stream)" but tok/s still renders "0.0 tok/s" — on a projector, in a perf demo, that reads as a broken deployment. Suppress the tok/s row when usage is missing, or estimate from delta count and say so inline.
11. **One-click example prompt.** A fresh participant lands on Basic Chat with three empty fields; sanity-check in one click needs a pre-filled example (`Load example` link or `data-prompt` on the mount). Directly serves both primary uses; removes first-run friction.
12. **Side-by-side model comparison.** Same prompt to two models, responses + metrics in columns — the clearest way to *show* serving perf.
13. **Session request history.** Last N requests in sessionStorage with re-run; makes repeated perf runs comparable without retyping prompts.
14. **Streaming render perf.** Batch token appends via rAF so long streams stay smooth when projected; keep the rendered buffer bounded.
15. **"Interpreting your metrics" note.** Zero code: a paragraph on the Streaming page giving expected TTFT/tok-s ballparks, so participants know whether 15 tok/s is healthy. Completes the "show serving perf" use.
16. **Storage-failure warning.** `set()` silently no-ops when storage is unavailable (private/IT-managed browsers): a participant "saves" and loses everything on reload with no message. Detect and warn.

## P3 — lower fit / hardening

17. **Model metadata.** Show `owned_by`/`created` from `/models` next to names. Demoted — near-zero participant value.
18. **Curl variants for chat completions.** `curl.md` only generates the `GET {endpoint}/models` command; add generated basic/streaming completion curl from the saved prompt/model. Demoted — learning the API shape was not a chosen use; keep for docs+curl-twin completeness.
19. **Raw-JSON toggle on chat results.** Demoted — see the raw-view decision (P1 item 5); only revisit if debugging demands it.
20. **Vendor docsify locally + pin the exact version.** `docsify@5` floats on jsDelivr; venue wifi or an IT proxy that blocks the CDN leaves a blank page — this breaks the whole journey, not just polish. Also undocumented coupling: `mountSettingsHeader` hard-codes docsify's DOM (`main section.content`) and silently stops matching if 5.x changes it. Pinned CDN version is the cheap partial.
21. **Manual dark-mode toggle.** Currently OS-preference only; demo projectors vary.
22. **404 page.** Docsify `notFound` config for bad routes.
23. **Content-Security-Policy meta.** All rendering is hand-escaped `innerHTML`; CSP as backstop.
24. **Accessibility pass.** Focus management after widget mount, `aria-live` on streamed output, visible focus states on custom buttons.
25. **Key-preview entropy note.** `PREVIEW_LEN = 10` feeds the Settings table, form placeholder, and the persistent header on every page. JWT-shaped tokens (constant `eyJ…` prefix) leak nothing, but 10 chars of a short opaque secret is shoulder-surfable in a workshop room. Shorten to 4–6 chars or detect the `eyJ` prefix, and say in `configuration.md` what the preview reveals.
26. **Token estimate before send.** Rough chars/4 hint in the test forms.
27. **Dev-server cache fix.** `python3 -m http.server` sends `Last-Modified`, so Chrome heuristic-caches edited plugin JS/CSS (documented gotcha in AGENTS.md). A `no-store` dev server script or `?v=` asset query would remove the hard-reload dance.
28. **Smoke-check script.** No test framework; a small CDP/Playwright smoke script (widgets mount, storage round-trip, key never renders unmasked) would guard regressions without adding a build step.
29. **Sidebar grouping.** Flat list today; group into Configuration / Playground as pages grow.

## Parked — beyond the tutorial core

- **Sampling parameters in test forms.** Temperature, max_tokens, top_p, stop — `chatRequestBody` currently sends only messages/model/stream.
- **Multi-turn mode for Basic Chat.** Optional message-history toggle instead of single-shot.
- **Markdown rendering toggle for responses.** Escaped `<pre>` today; opt-in safe markdown render.
- **Embeddings playground.** `POST {endpoint}/embeddings` — only models/chat are covered today.
- **Connection profiles.** Multiple named endpoint+key pairs with a switcher. Demoted — participants have exactly one endpoint+key; this is workshop-organizer tooling.
- **Export/import settings JSON.** Demoted with it; would need an explicit warning that the export includes the full key.

## Open questions (from the devils-advocate review)

- Does a real RHOAI model server route echo `Access-Control-Allow-Origin` for a GitHub Pages origin, and does its auth layer accept the `Authorization` preflight? One `curl -X OPTIONS` resolves P1 item 0.
- Are participant tokens JWT-shaped or opaque? Resolves the severity of P3 item 25.
- Is the in-flight instance done with `mountStream`? P1 item 5 stays blocked until it lands.
