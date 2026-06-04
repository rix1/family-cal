import { define } from "@/utils.ts";

export const handler = define.handlers({
  GET() {
    return new Response("ok", { headers: { "content-type": "text/plain" } });
  },
});
