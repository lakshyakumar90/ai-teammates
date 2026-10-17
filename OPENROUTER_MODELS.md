# Verified free OpenRouter models

Checked October 17, 2026 using the configured OpenRouter API key. Only synthetic prompts and images were sent. No key values are stored in this report.

Sources: [free model page](https://openrouter.ai/models?variant=free), [live chat model catalog](https://openrouter.ai/api/v1/models).

The chat catalog contained 16 free variants with zero input/output pricing; 15 advertised tools. Non-chat models from the page (embeddings, scoring, speech, etc.) are not candidates for this app.

## Enabled

| Model | Provider ID | Images |
| --- | --- | --- |
| Dots Studio: Dots3-Note Preview (free) | `dots-studio/dots-3-note-preview:free` | Yes, screenshot tool round-trip verified |
| LiquidAI: LFM2.5-2.6B (free) | `liquid/lfm-2.5-2.6b:free` | No |
| NVIDIA: Nemotron 3 Super (free) | `nvidia/nemotron-3-super-120b-a12b:free` | No |

Every enabled model passed the actual memory extractor, a streamed executable tool call, a grounded personal-fact extraction, and a normal visible streamed response. Dots3 additionally identified the color of an image returned by a tool.

The OpenRouter adapter now sends strict JSON schemas, preserves image content in tool results, and requests streaming usage totals. Google, Groq, Ollama, and the default model were unchanged.

## Excluded in this check

| Model | Observed reason |
| --- | --- |
| `xingchen-agi/xing4.0-29b-a4b:free` | OpenRouter (HTTP 429): Rate limit or quota exceeded. Wait before retrying or select another model. Provider returned error |
| `nvidia/nemotron-3.5-super-vl:free` | TimeoutError: The operation was aborted due to timeout |
| `thinkingmachines/inkling-small:free` | OpenRouter (HTTP 403): Authentication or access denied. Check the provider API key and model access. thinkingmachines/inkling-small:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps |
| `poolside/laguna-s-2.1:free` | OpenRouter (HTTP 429): Rate limit or quota exceeded. Wait before retrying or select another model. Provider returned error |
| `thinkingmachines/inkling:free` | OpenRouter (HTTP 403): Authentication or access denied. Check the provider API key and model access. thinkingmachines/inkling:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps |
| `poolside/laguna-xs-2.1:free` | AI_NoObjectGeneratedError: No object generated: could not parse the response. |
| `nvidia/nemotron-3.5-lightning:free` | TimeoutError: The operation was aborted due to timeout |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | OpenRouter (HTTP 503): The provider is temporarily unavailable. Retry or select another model. Upstream error from Nvidia: Service temporarily overloaded |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | OpenRouter (HTTP 502): The provider is temporarily unavailable. Retry or select another model. Upstream error from Nvidia: ResourceExhausted: Worker local total request limit reached (16/16) |
| `cohere/north-mini-code:free` | Passed initial tool/greeting checks, but grounded-memory confirmation failed the schema. |
| `google/gemma-4-26b-a4b-it:free` | OpenRouter (HTTP 400): The provider rejected this request. Provider returned error |
| `google/gemma-4-31b-it:free` | OpenRouter (HTTP 400): The provider rejected this request. Provider returned error |
| `nvidia/nemotron-3.5-content-safety:free` | Specialized safety model; no advertised tools. Not generation-tested. |

The old `openai/gpt-oss-120b` OpenRouter entry was also removed because it is a paid variant; it was not called during this free-only check.

These results describe observed behavior at test time. Rate limits, access rules, and provider capacity can change; excluded models are not necessarily permanently broken.
