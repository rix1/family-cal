#!/usr/bin/env python3
"""Flip <think>/</think> (ids 9,10) from CONTROL to NORMAL so they survive
detokenization, while keeping the (already-fixed) Jinja chat template."""
import sys
import gguf
from gguf import GGUFReader, GGUFValueType
from gguf.scripts.gguf_new_metadata import copy_with_new_metadata, MetadataDetails, get_field_data

inp, out = sys.argv[1], sys.argv[2]
reader = GGUFReader(inp)

tt_field = reader.get_field("tokenizer.ggml.token_type")
types = list(tt_field.contents())            # one int per vocab token
sub_type = tt_field.types[-1]                # element type (INT32)

NORMAL = 1
for tid in (9, 10):                          # <think>, </think>
    print(f"token {tid}: {types[tid]} -> {NORMAL}")
    types[tid] = NORMAL

arch = get_field_data(reader, gguf.Keys.General.ARCHITECTURE)
writer = gguf.GGUFWriter(out, arch=arch, endianess=reader.endianess)
alignment = get_field_data(reader, gguf.Keys.General.ALIGNMENT)
if alignment is not None:
    writer.data_alignment = alignment

new_metadata = {
    "tokenizer.ggml.token_type": MetadataDetails(GGUFValueType.ARRAY, types, sub_type=sub_type),
}
copy_with_new_metadata(reader, writer, new_metadata, [])
print("done:", out)
