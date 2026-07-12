import { setLocale, t } from "@/lib/i18n.ts";
import { define } from "@/utils.ts";

export default define.page(function App({ Component, state, url }) {
  setLocale(state.locale);
  const ogImage = new URL("/og-image.png", Deno.env.get("BASE_URL") || url).href;
  return (
    <html lang={state.locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={t("app.name")} />
        <meta property="og:description" content={t("app.description")} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImage} />
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
