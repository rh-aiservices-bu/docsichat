# HOWTO: Browser (CORS) access to a Kuadrant-protected RHOAI MaaS route

**Audience:** cluster admin on the MaaS cluster. **Status: undocumented, unsupported,
cluster-specific.** Nothing in RHOAI/Kuadrant docs describes CORS support for
`maas.apps.*` model routes (verified 2026-09-22 against the RHOAI 3.5 MaaS book,
rh-aiservices-bu MaaS guide, opendatahub-io/models-as-a-service, Kuadrant/Authorino
docs — zero CORS mentions). This howto composes documented Kuadrant/Authorino
primitives into an admin workaround. Claims marked [INFERENCE] are not doc-verified.

## Background: why the browser is blocked

Browsers never send `Authorization` on a CORS *preflight* (per the fetch spec,
preflights are credentialless). The MaaS gateway's AuthPolicy answers `OPTIONS`
with 401 before any CORS handling:

```
$ curl -i -X OPTIONS "https://maas.apps.ocp.cloud.rhai-tmm.dev/prelude-maas/<model>/chat/completions" \
    -H "Origin: https://rh-aiservices-bu.github.io" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: authorization, content-type"
HTTP/2 401
www-authenticate: request.headers.authorization realm="api-keys"
www-authenticate: Bearer realm="kubernetes-tokens"
x-ext-auth-reason: Authentication required
```

No JS workaround exists. Two server-side pieces fix it:

1. **Preflight skips auth** — AuthPolicy with a `when` gate + `anonymous` rule
   (documented Kuadrant syntax; there is no `disabled`/`matches[].method` field on
   AuthPolicy — that is HTTPRoute syntax).
2. **CORS response headers** — preferred: Istio EnvoyFilter on the gateway
   (precedent: the MaaS controller itself creates EnvoyFilters for
   `authorino-tls-bootstrap`, so admin EnvoyFilters on this gateway are an expected
   primitive); fallback: Authorino response headers in the AuthPolicy.

## Step 0 — discover your cluster's real names

All names below are placeholders. Fill them in first:

```sh
# The Istio-based gateway MaaS creates (name + namespace):
oc get gateway -A | grep -i maas          # expect maas-default-gateway in openshift-ingress [INFERENCE: name]
# The model HTTPRoute(s) the MaaS controller manages:
oc get httproute -A | grep -i <model-prefix>   # e.g. prelude-maas tenant prefix
# The MaaS-owned AuthPolicies (do NOT edit these — see caveats):
oc get authpolicy -A | grep -i maas
# The route host you are fixing:
oc get route -A | grep -i maas            # e.g. maas.apps.ocp.cloud.rhai-tmm.dev [INFERENCE: Route vs Gateway host]
```

Write down: `GATEWAY_NAME`, `GATEWAY_NS`, `HTTPROUTE_NAME`, `HTTPROUTE_NS`,
`HOST` (the maas.apps.* host).

## Step 1 — let preflights skip auth (AuthPolicy)

Target the specific model HTTPRoute(s) (surgical) rather than the Gateway. Create
`authpolicy-preflight.yaml`:

```yaml
apiVersion: kuadrant.io/v1
kind: AuthPolicy
metadata:
  name: allow-cors-preflight
  namespace: <HTTPROUTE_NS>
spec:
  targetRef:
    group: gateway.networking.k8s.io
    kind: HTTPRoute
    name: <HTTPROUTE_NAME>
  defaults:
    strategy: merge                # coexist with MaaS-owned policies
    when:
    - predicate: "request.method != 'OPTIONS'"
    rules:
      authentication:
        anonymous:
          anonymous: {}            # documented no-op identity evaluator
```

Apply and verify the preflight is no longer 401:

```sh
oc apply -f authpolicy-preflight.yaml
sleep 5   # let the controller reconcile
curl -sS -o /dev/null -D - -X OPTIONS "https://<HOST>/prelude-maas/<model>/chat/completions" \
  -H "Origin: https://rh-aiservices-bu.github.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type" | tr -d '\r'
# EXPECT: not 401 (200 or 204). If still 401: the MaaS gateway-default AuthPolicy
# is winning — check `oc get authpolicy -n <GATEWAY_NS> -o yaml` for merge/override
# precedence, or target the Gateway itself instead of the HTTPRoute.
```

If the merge is ignored, try `overrides:` instead of `defaults:` (documented
precedence semantics: overrides win over lower-targeting policies), or scope to the
Gateway targetRef. [INFERENCE: MaaS controller reconciliation behavior with a second
AuthPolicy on the same target is not doc-verified.]

## Step 2 — add CORS response headers (EnvoyFilter)

Create `envoyfilter-cors.yaml`. This injects the standard CORS headers on both the
preflight response and the actual responses from the gateway route:

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: EnvoyFilter
metadata:
  name: maas-cors-headers
  namespace: <GATEWAY_NS>          # openshift-ingress — where the gateway Deployment lives
spec:
  workloadSelector:
    labels:
      istio: ingressgateway        # [INFERENCE: verify with `oc get pod -n <GATEWAY_NS> --show-labels`]
  configPatches:
  - applyTo: HTTP_FILTER
    match:
      context: GATEWAY
      listener:
        filterChain:
          filter:
            name: envoy.filters.network.http_connection_manager
    patch:
      operation: INSERT_FIRST      # before the Kuadrant WASM/ext-authz filter
      value:
        name: envoy.filters.http.cors_mutation
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.filters.http.cors_mutation.v3.CorsMutation   # [INFERENCE: exact type URL per Envoy version]
          mutation:
            allow_origin: ["https://rh-aiservices-bu.github.io"]
            allow_methods: "GET, POST, OPTIONS"
            allow_headers: "authorization, content-type, x-maas-subscription"
```

**Caveats (real risks, not boilerplate):**

- The exact Envoy filter name/type URL depends on the mesh's Envoy version; if the
  patch is rejected, check the proxy version
  (`oc get pod -n <GATEWAY_NS> -o jsonpath='{.items[0].spec.containers[0].image}'`)
  and use the matching Envoy API version. [INFERENCE]
- Filter-chain ordering vs the Kuadrant WASM shim is a real risk: the MaaS
  disconnected doc shows the gateway falls back to deny-all when the WASM filter
  fails. If chat requests start failing after this step, remove the filter first:
  `oc delete envoyfilter maas-cors-headers -n <GATEWAY_NS>`.
- The gateway controller may regenerate EnvoyFilters on reconcile (the MaaS
  disconnected doc shows aggressive operator-managed filter behavior). Re-check
  after any platform upgrade.

**Fallback if EnvoyFilter fights the mesh (Authorino response headers, documented
CRD fields):** add to the AuthPolicy from Step 1 (or the MaaS-owned one, accepting
it may be reverted):

```yaml
  defaults:
    response:
      unauthenticated:
        headers:
          access-control-allow-origin:
            value: "https://rh-aiservices-bu.github.io"
          access-control-allow-methods:
            value: "GET, POST, OPTIONS"
          access-control-allow-headers:
            value: "authorization, content-type"
```

This makes at least the 401 carry CORS headers (error bodies readable in-browser);
it does NOT add headers to success responses — success-response CORS needs the
EnvoyFilter. [INFERENCE on Authorino injecting headers in the success path.]

## Step 3 — verify the full browser path

```sh
# 1. Preflight: expect non-401 WITH access-control-allow-origin present
curl -sS -o /dev/null -D - -X OPTIONS "https://<HOST>/prelude-maas/<model>/chat/completions" \
  -H "Origin: https://rh-aiservices-bu.github.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, content-type" | tr -d '\r'

# 2. Actual request WITH a real key: expect 200 + CORS headers
curl -sS -o /dev/null -D - "https://<HOST>/prelude-maas/<model>/models" \
  -H "Origin: https://rh-aiservices-bu.github.io" \
  -H "Authorization: Bearer <REAL_MAAS_API_KEY>" | tr -d '\r'
```

Then open docsichat (deployed or `python3 scripts/serve.py` on localhost:3010),
save the MaaS endpoint + key on the Configuration page, click **Test connection**.
Expect "Connected — N model(s)". If it still fails in-browser: the preflight
passed but success responses lack CORS headers → Step 2's EnvoyFilter is not
applying (check proxy logs: `oc logs -n <GATEWAY_NS> deploy/<gateway-deploy> -c istio-proxy | grep -i cors`).

## Security notes (read before doing this in any shared cluster)

- **The API key still sits in the page.** Browser requests carry
  `Authorization: Bearer <key>`; the key must be pasted into docsichat's
  localStorage and is visible in devtools. Only use a short-lived demo key
  (MaaS keys support `expiresIn`). [INFERENCE on the risk judgment; the mechanism
  claims are doc-verified.]
- **Anonymous OPTIONS** lets any origin probe the endpoint. Impact is limited to
  metadata leakage from error bodies (auth still gates real requests), but it is a
  real surface. [INFERENCE]
- Prefer `allow_origin` pinned to the exact Pages origin over `*`.
- Rollback: `oc delete authpolicy allow-cors-preflight -n <HTTPROUTE_NS>` and
  `oc delete envoyfilter maas-cors-headers -n <GATEWAY_NS>`.

## If reconciliation clobbers everything

If the MaaS controller keeps reverting the AuthPolicy/EnvoyFilter [INFERENCE: not
doc-verified], the robust path is a same-cluster reverse proxy that holds the MaaS
key server-side, sets CORS itself, and forwards requests — browser → proxy Route →
MaaS gateway. Fully outside RHOAI docs; out of scope for this howto.
