<!--
Draft bug report for the upstream model, ready to post (needs HuggingFace login).
Suggested target: a new Community discussion on
https://huggingface.co/norallm/normistral-11b-thinking-gguf/discussions
cross-linking the existing discussion #1. See scripts/model/README.md for context.
-->

# GGUF unusable out-of-the-box: Go-template in the `chat_template` slot + `<think>` as CONTROL tokens (root cause + fix)

Thanks for this model — the Norwegian quality is excellent. Two metadata issues in
the Q5_K_M GGUF make it fail to load / misbehave out-of-the-box, both fixable
without retraining. Sharing a full diagnosis and the local fix that worked.

## 1. `tokenizer.chat_template` contains an Ollama Go-template, not Jinja

The field value starts:

```
{{- if .System }}<system_prompt>{{- if eq (slice .System 0 1) " " }}…
```

Since this slot is parsed as Jinja, both llama.cpp and a bare `ollama pull` crash
at load:

```
Parser Error: Expected }} (Got eq)
```

(This is the error in discussion #1.) Only a manual Ollama Modelfile `TEMPLATE`
override works around it.

## 2. `<think>` (id 9) and `</think>` (id 10) are CONTROL tokens

They're therefore stripped during normal detokenization, so the reasoning leaks
into the output with no delimiter to split on, and runtimes that auto-detect a
"thinking" capability still can't separate reasoning from answer.

## Fix that worked (no retraining)

1. Replace the embedded template with the canonical Jinja from the main repo:
   ```
   gguf-new-metadata --chat-template-file chat_template.jinja  in.gguf  out.gguf
   ```
2. Flip `<think>`/`</think>` from CONTROL → NORMAL in `tokenizer.ggml.token_type`
   so they render and can be stripped.

After that, the GGUF loads cleanly in llama.cpp and `ollama pull` works without a
custom Modelfile.

Would you consider re-baking the GGUFs with the Jinja template embedded and the
think tokens as NORMAL (or USER_DEFINED)? Happy to share the exact script.
