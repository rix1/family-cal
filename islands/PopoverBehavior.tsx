import { useEffect } from "preact/hooks";

/**
 * App-wide behavior for popover menus: any open `<details data-popover>` closes
 * when you click outside it or press Escape. Mounted once (in AppHeader, which is
 * on every page) and delegated at the document level, so every popover gets this
 * for free — just add `data-popover` to the <details>. Replaces the per-popover
 * copies that used to live in each island.
 */
export function PopoverBehavior() {
  useEffect(() => {
    const openPopovers = () =>
      document.querySelectorAll<HTMLDetailsElement>("details[data-popover][open]");

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      for (const el of openPopovers()) {
        if (!el.contains(target)) el.removeAttribute("open");
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      for (const el of openPopovers()) el.removeAttribute("open");
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return <span hidden aria-hidden="true" />;
}
