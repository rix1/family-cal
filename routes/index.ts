import { define } from "@/utils.ts";
import { htmlTemplate } from "@/lib/http.ts";

export const handler = define.handlers({
  GET() {
    return htmlTemplate("index.html");
  },
});
