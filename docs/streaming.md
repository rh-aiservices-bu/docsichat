# Streaming

Send a chat completion with `stream:true`, watch tokens arrive live, and see usage + throughput metrics. Use **Stop** to cut a stream short.

## Interpreting your metrics

- **Time to first token (TTFT):** typically ~200 ms – 2 s, depending on model size and how busy the serving queue is. Sustained multi-second TTFTs usually mean the server is overloaded or the model is much larger than expected.
- **Output tokens/sec (tok/s):** 10–50+ tok/s is typical for GPU serving. Single-digit tok/s usually means the model is running on CPU or the request is sharing a small compute quota.
- **Total latency:** dominated by generation time once TTFT is paid. Compare tok/s against TTFT to see whether your bottleneck is queueing or throughput.

<div id="api-test-stream"></div>
