# cURL Commands

The command below lists the models available at your saved API endpoint. It calls the OpenAI-compatible `GET {endpoint}/models` route with your API key as a bearer token.

<div id="api-curl-command"></div>

## Equivalent: run it here

<div id="api-models"></div>

Click **List models** to run the same request in your browser and display the returned model list.

## Notes

- The URL comes from your [API Endpoint](configuration.md) with `/models` appended.
- The displayed command masks the API key after its first 10 characters. **Copy command** places the full command — with the real key — on your clipboard; it is never rendered on the page.

## If the browser can't reach your endpoint

- **`TypeError: Failed to fetch`** in any widget means the request never got through — blocked by the network, by CORS, or by an auth layer that rejects the browser's preflight. The same request from a terminal usually works, because CORS only binds browsers.
- Browser fetches that send `Authorization` or `Content-Type` headers force a CORS preflight that the server must answer; a server that never answers the preflight can never serve a browser, no matter how correct the endpoint and key are.
- If your endpoint (for example an OpenShift AI model route) does not send CORS headers, use the curl commands on this page as the fallback for RHOAI endpoints.
- A Kuadrant/AuthPolicy-protected route (for example some OpenShift AI MaaS gateways) may reject the CORS preflight itself with 401 — the browser then shows `TypeError: Failed to fetch` no matter how correct the endpoint and key are. The commands on this page are the working path for such endpoints.
