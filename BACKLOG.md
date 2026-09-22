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
0. **Verify browser reachability/CORS against real endpoints — DONE 2026-09-22, endpoint-dependent.** Two probes: (1) `https://litemaas.rhoai.rh-aiservices-bu.com/v1` — preflight 200 from both `https://rh-aiservices-bu.github.io` and `http://localhost:3010` (uvicorn CORS middleware echoes any origin, `allow-credentials: true`, `allow-headers: authorization, content-type`); unauthenticated 401s still carry CORS headers, so errors are readable by the failure UX. Fully browser-reachable. (2) `https://maas.apps.ocp.cloud.rhai-tmm.dev/prelude-maas/glm-53-flash` — the OPTIONS preflight itself gets 401 from the Kuadrant auth layer (`www-authenticate: Bearer realm="kubernetes-tokens"`, zero CORS headers); browsers cannot preflight, so every widget fails with `TypeError: Failed to fetch` even with a valid key. **Workaround research (docs, 2026-09-22): NO documented/supported CORS mechanism exists for MaaS routes** (RHOAI 3.5 MaaS book, Kuadrant/Authorino docs, MaaS repo — all silent). Admin-only fix (undocumented but from documented primitives): AuthPolicy with `defaults.when: request.method != 'OPTIONS'` + `anonymous: {}` rule so preflights skip auth, plus CORS response headers via Istio EnvoyFilter on `maas-default-gateway` (precedent: MaaS docs create EnvoyFilters for authorino-tls-bootstrap); caveats: MaaS controller owns the AuthPolicies and may revert hand edits; browser still needs a key in-page (ephemeral demo keys only). Conclusion: playground works for CORS-enabled endpoints; for MaaS routes the curl-twin fallback + failure UX are the documented path until a cluster admin applies the fix above.
1. **Send full model id; display short name — DONE 2026-09-22.** Option value = full id, label = `normalizeModelId(id)`; verified chat POST sends the full id. Committed 476b69c.
2. **"Test connection" on Configuration — DONE 2026-09-22.** Shared `checkConnection(endpoint, key, done)` helper; Test connection button on the form runs it with current saved values and renders inline status. Committed 476b69c.
3. **Model-list failure UX — DONE 2026-09-22.** Reason threaded through `checkConnection` (no swallowing); select shows 'Model list unavailable — <reason>' + Retry button. Committed 476b69c.
4. **`/v1` validation on save — DONE 2026-09-22.** `normalizeEndpoint` appends `/v1` only when no path segment exists; wired into save, `modelsUrl`, `chatCompletionUrl`. Committed 476b69c.
5. **Drop the raw SSE view from Streaming.** Decision (2026-09-22): "I'll never need the raw view." In progress — StreamWidget agent owns mountStream + `docs/streaming.md` (radio/raw panel removal, console.debug ring-buffer diagnostic, prose update).
6. **Docs accuracy quick fixes — DONE 2026-09-22.** README port 3000→3010; `configuration.md` mentions the Clear button. Committed b51593c. The curl.md CORS section (P1 item 0 doc half) landed in the same commit.

## P2 — iterate & demo (serving perf)
7. **Remember UI state per widget — DONE 2026-09-22.** Per-widget state under sessionStorage `docsichat:api:ui:chat`/`ui:stream`, restored on mount. Committed bf5450d.
8. **Cache the model list — DONE 2026-09-22.** sessionStorage cache keyed by normalized endpoint, 5-min TTL, failed fetches never cached. Committed bf5450d.
9. **Abort/stop for streaming — DONE 2026-09-22.** AbortController + Stop button, Run disabled while streaming, abort shows 'Stopped.' not an error. Committed 4536033.
10. **tok/s fallback when usage is missing — DONE 2026-09-22.** Estimates from content-delta count, labeled 'est.'; 0.0 tok/s impossible. Committed 4536033.
11. **One-click example prompt — DONE 2026-09-22.** Load example button on Basic Chat fills system+prompt without submitting. Committed bf5450d.
12. **Side-by-side model comparison.** Not started — larger feature.
13. **Session request history.** Not started.
14. **Streaming render perf.** Not started.
15. **"Interpreting your metrics" note — DONE 2026-09-22.** Ballparks in docs/streaming.md (TTFT ~200ms-2s, 10-50+ tok/s GPU-typical). Committed 4536033.
16. **Storage-failure warning — DONE 2026-09-22.** storageAvailable() probe + dismissible banner on Configuration. Committed bf5450d.
## P3 — lower fit / hardening

17. **Model metadata.** Show `owned_by`/`created` from `/models` next to names. Demoted — near-zero participant value.
18. **Curl variants for chat completions.** `curl.md` only generates the `GET {endpoint}/models` command; add generated basic/streaming completion curl from the saved prompt/model. Demoted — learning the API shape was not a chosen use; keep for docs+curl-twin completeness.
19. **Raw-JSON toggle on chat results.** Demoted — see the raw-view decision (P1 item 5); only revisit if debugging demands it.
20. **Vendor docsify locally + pin the exact version.** `docsify@5` floats on jsDelivr; venue wifi or an IT proxy that blocks the CDN leaves a blank page — this breaks the whole journey, not just polish. Also undocumented coupling: `mountSettingsHeader` hard-codes docsify's DOM (`main section.content`) and silently stops matching if 5.x changes it. Pinned CDN version is the cheap partial — DONE as pin (b51593c); full vendoring still open.
21. **Manual dark-mode toggle — DONE 2026-09-22.** Cycle OS → light → dark, persisted under `docsichat:api:ui:theme`, ES5, aria-label/title per state. Committed b51593c.
22. **404 page — DONE 2026-09-22.** `notFoundPage: true` (verified key against docsify v5) + `docs/_404.md` with home link. Committed b51593c.
23. **Content-Security-Policy meta — DONE 2026-09-22.** Added with Google Fonts additions the first draft missed (style-src/font-src); verified zero console errors + all features working under CSP. Committed b51593c.
24. **Accessibility pass — DONE 2026-09-22.** aria-live='polite' + role='status' on the live stream panel, aria-label on Stop, shared :focus-visible outline rule for all custom buttons; no focus stealing. Committed d0e45f8.
25. **Key-preview entropy note — DONE 2026-09-22.** PREVIEW_LEN 10→6; JWT keys render 'eyJ…' + mask; configuration.md prose matches. Committed d0e45f8.
26. **Token estimate before send — DONE 2026-09-22.** Live '~N tokens est.' hint (chars/4) under the prompt textarea in both test forms. Committed d0e45f8.
27. **Dev-server cache fix — DONE 2026-09-22.** scripts/serve.py sends Cache-Control: no-store on every response (GET/HEAD/404); do_HEAD resolves directories to index.html. Replaces the plain http.server workflow. Committed ca7a8eb.
28. **Smoke-check script — DONE 2026-09-22.** scripts/smoke-check.js: standalone CDP smoke check; clean SKIP when no working CDP endpoint. Known machine limitation: Chrome 153 closes the DevTools WebSocket after the first command. Committed ca7a8eb.
29. **Sidebar grouping — DONE 2026-09-22.** Configuration / Playground sections, all pages reachable. Committed d0e45f8.


## Parked — beyond the tutorial core

- **Sampling parameters in test forms.** Temperature, max_tokens, top_p, stop — `chatRequestBody` currently sends only messages/model/stream.
- **Multi-turn mode for Basic Chat.** Optional message-history toggle instead of single-shot.
- **Markdown rendering toggle for responses.** Escaped `<pre>` today; opt-in safe markdown render.
- **Embeddings playground.** `POST {endpoint}/embeddings` — only models/chat are covered today.
- **Connection profiles.** Multiple named endpoint+key pairs with a switcher. Demoted — participants have exactly one endpoint+key; this is workshop-organizer tooling.
- **Export/import settings JSON.** Demoted with it; would need an explicit warning that the export includes the full key.

## Open questions (from the devils-advocate review)

- Is the in-flight instance done with `mountStream`? RESOLVED — committed at 476b69c; P1 item 5 unblocked and in progress via the serial plugin chain.

## Resolved (2026-09-22)

- CORS/browser reachability: RESOLVED — see P1 item 0 (preflight passes from GitHub Pages origin and localhost; errors carry CORS headers).

