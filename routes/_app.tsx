import { AppStyles } from "@/components/AppStyles.tsx";
import { define } from "@/utils.ts";

export default define.page(function App({ Component }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
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
