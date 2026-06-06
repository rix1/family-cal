import { useEffect, useState } from "preact/hooks";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => setTheme(currentTheme()), []);

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("family-calendar-theme", next);
    setTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      class="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Use ${dark ? "light" : "dark"} theme`}
      title={`Use ${dark ? "light" : "dark"} theme`}
    >
      <span aria-hidden="true">{dark ? "☀️" : "🌙"}</span>
      <span class="theme-toggle-label">{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
