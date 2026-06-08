import { AppStyles } from "@/components/AppStyles.tsx";
import { define } from "@/utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html lang="en">
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
        <AppStyles />
      </head>
      <body
        style={{
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontFeatureSettings: '"ss01", "ss02", "cv01"',
        }}
      >
        <Component />
      </body>
    </html>
  );
});
