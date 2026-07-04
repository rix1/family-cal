import { setLocale } from "@/lib/i18n.ts";
import { define } from "@/utils.ts";

export default define.page(function App({ Component, state }) {
  setLocale(state.locale);
  return (
    <html lang={state.locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              `try{const saved=localStorage.getItem("family-calendar-theme");const theme=saved==="light"||saved==="dark"?saved:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch{}`,
          }}
        />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
