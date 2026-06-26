# Local newsletter-intro model (`normistral-clean`)

The newsletter intro is drafted by a **local** model (family names in the prompt
must never leave the machine — see `lib/intro_writer.ts`). We use
[`norallm/normistral-11b-thinking`](https://huggingface.co/norallm/normistral-11b-thinking)
at Q5_K_M for its Norwegian fluency.

The upstream GGUF (`norallm/normistral-11b-thinking-gguf`) ships broken, in two ways:

1. Its `tokenizer.chat_template` metadata contains an **Ollama Go-template**, but
   that field is supposed to hold **Jinja**. Both llama.cpp and a bare `ollama pull`
   crash trying to parse it (`Parser Error: Expected }} (Got eq)`).
2. `<think>` / `</think>` are **CONTROL** tokens, so they're stripped during
   detokenization — the chain-of-thought then leaks into the output with no
   delimiter to strip on.

## Rebuilding `normistral-clean`

Requires `pip install gguf` and the original GGUF blob (e.g. from
`ollama pull hf.co/norallm/normistral-11b-thinking-gguf:Q5_K_M`, then find the
model layer under `~/.ollama/models/blobs/`).

```sh
# 1. Restore the canonical Jinja chat template into the GGUF metadata.
gguf-new-metadata --chat-template-file normistral-chat-template.jinja \
    <original>.gguf  fixed.gguf

# 2. Flip <think>/</think> (token ids 9,10) from CONTROL to NORMAL so they render
#    and can be stripped from the output.
python3 flip_think_tokens.py  fixed.gguf  clean.gguf

# 3. Import into Ollama (copies the blob into Ollama's store; the file is then
#    disposable).
printf 'FROM ./clean.gguf\nPARAMETER temperature 0.3\nPARAMETER stop "</s>"\n' > Modelfile
ollama create normistral-clean -f Modelfile
```

`normistral-chat-template.jinja` is the canonical template from
`huggingface.co/norallm/normistral-11b-thinking/raw/main/chat_template.jinja`.

## Using it

Call Ollama's HTTP `/api/generate` (the model stays warm; fits the `INTRO_CMD`
timeout), then keep only the text after the final `</think>`. Do **not** use
`ollama run` (it emits ANSI cursor codes even when piped) or the llama.cpp CLI
(cold-loads 8 GB per call). Ollama detects the `thinking` capability but its
native parser returns an empty `thinking` field for this custom model, so we
strip `</think>` ourselves rather than relying on `think:true`.
