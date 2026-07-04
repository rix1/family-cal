import { createDefine } from "fresh";
import type { Locale } from "@/lib/i18n.ts";

export interface State {
  locale: Locale;
}

export const define = createDefine<State>();
