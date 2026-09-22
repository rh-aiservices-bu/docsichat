# docsichat Backlog

Candidate work for the docsichat app (docsify v5 static site + `docs/api-config.js` plugin).
Grounded in a code review of 2026-09-22. Another agent instance is actively building the
chat/streaming widgets — check `git status` before picking up an item.

**Decided intent (2026-09-22):** audience = tutorial participants (RHOAI GenAI users who just
deployed a model and got an endpoint + token); primary uses = sanity-check the endpoint and
show serving perf (TTFT / tok/s); endpoints = RHOAI (namespace/name ids) and generic
OpenAI-compatible, first-class; direction = docs+playground hybrid. Priorities follow the
participant journey: configure → verify → iterate → demo.

## In flight (another instance — do not duplicate)

- Basic Chat page: single non-streaming `POST {endpoint}/chat/completions`, usage metrics (`basic-chat.md`, `mountChat`).
- Streaming page: `stream:true`, rendered/raw SSE toggle, TTFT + tok/s metrics (`streaming.md`, `mountStream`) — raw view to be dropped, see P1 item 5.

## P1 — configure & verify (participant's first session)

1. **"Test connection" on Settings.** Save, then `GET {endpoint}/models` and show status inline. A participant's first question is "did I paste this right?" — today they only find out on the curl page.
2. **Model-list failure UX.** On fetch failure the select shows "Model list unavailable" with no reason and no retry. Add the error message + a Retry button (the request code already builds a good message in `mountModels`). Participants hit CORS/401/typo constantly; the reason is the diagnostic.
3. **Send full model id; display short name.** Correctness issue, not polish: `normalizeModelId` strips a `namespace/name` prefix for the `<option>` value too, so requests use the stripped id — RHOAI model servers 404. Keep the full id as the value, show the short name as the label.
4. **Clear-key control on Settings.** `mountForm` intentionally keeps the saved key when the field is left empty, so there is no way to unset the key from the UI. Participants re-deploy and get new tokens; add a "Clear saved key" button (calls `set('key', '')`, which already removes the item).
5. **Drop the raw SSE view from Streaming.** Decision (2026-09-22): "I'll never need the raw view." Remove the Rendered/Raw radio toggle and the raw panel from the streaming widget; keep rendered output only. Lands on top of the in-flight streaming work — coordinate before editing.
6. **Fix `docs/README.md` preview port.** Says `python3 -m http.server 3000 --directory docs`; 3000 is occupied on this machine and AGENTS.md standardizes on 3010. Tutorial setup instructions must be copy-pasteable.

## P2 — iterate & demo (serving perf)

7. **Cache the model list.** `listModelsForSelect` refetches `/models` on every visit to Basic Chat and Streaming. Short TTL cache (sessionStorage) with a manual refresh — demo-day navigation shouldn't re-hit the server.
8. **Remember UI state per widget.** Every `doneEach` re-mounts widgets: model select resets to the first model and prompts are wiped on navigation. Persist selected model and last prompt/system draft under `docsichat:api:ui:*` — mid-demo navigation loses the demo prompt.
9. **Abort/stop for streaming.** In-flight requests can't be cancelled: add `AbortController` + Stop button, disable Run while streaming.
10. **Side-by-side model comparison.** Same prompt to two models, responses + metrics in columns — the clearest way to *show* serving perf.
11. **Session request history.** Last N requests in sessionStorage with re-run; makes repeated perf runs during a demo comparable without retyping prompts.
12. **Streaming render perf.** Batch token appends via rAF so long streams stay smooth when projected in a demo; keep the rendered buffer bounded.
13. **Connection profiles.** Multiple named endpoint+key pairs (staging/prod) with a switcher in Settings; stored under `docsichat:api:profile:*`. Useful across workshops/environments.
14. **Model metadata.** Show `owned_by`/`created` from `/models` next to names.

## P3 — lower fit / hardening

15. **Curl variants for chat completions.** `curl.md` only generates the `GET {endpoint}/models` command; add generated basic/streaming completion curl from the saved prompt/model. Demoted — learning the API shape was not a chosen use; keep for docs+curl-twin completeness.
16. **Raw-JSON toggle on chat results.** Demoted — see the raw-view decision (P1 item 5); only revisit if debugging demands it.
17. **Vendor docsify locally + pin the exact version.** `docsify@5` floats to the latest 5.x on jsDelivr — surprise-breakage and offline-workshop risk. Pinned CDN version as a cheap partial.
18. **Manual dark-mode toggle.** Currently OS-preference only via the `media=(prefers-color-scheme: dark)` addon; demo projectors vary.
19. **404 page.** Docsify `notFound` config for bad routes.
20. **Content-Security-Policy meta.** All rendering is hand-escaped `innerHTML`; CSP as backstop.
21. **Accessibility pass.** Focus management after widget mount, `aria-live` on streamed output, visible focus states on custom buttons.
22. **Token estimate before send.** Rough chars/4 hint in the test forms.
23. **Dev-server cache fix.** `python3 -m http.server` sends `Last-Modified`, so Chrome heuristic-caches edited plugin JS/CSS (documented gotcha in AGENTS.md). A `no-store` dev server script or `?v=` asset query would remove the hard-reload dance.
24. **Export/import settings JSON.** Explicit warning that the export includes the full key.
25. **Smoke-check script.** No test framework; a small CDP/Playwright smoke script (widgets mount, storage round-trip, key never renders unmasked) would guard regressions without adding a build step.
26. **Sidebar grouping.** Flat list today; group into Configuration / Playground as pages grow.

## Parked — prompt power (beyond the tutorial core)

- **Sampling parameters in test forms.** Temperature, max_tokens, top_p, stop — `chatRequestBody` currently sends only messages/model/stream.
- **Multi-turn mode for Basic Chat.** Optional message-history toggle instead of single-shot.
- **Markdown rendering toggle for responses.** Escaped `<pre>` today; opt-in safe markdown render.
- **Embeddings playground.** `POST {endpoint}/embeddings` — only models/chat are covered today.
