import { useEffect, useRef } from "preact/hooks";

export function AccountMenuBehavior() {
  const marker = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const menu = marker.current?.closest("details");
    if (!menu) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!menu.contains(event.target as Node)) menu.removeAttribute("open");
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") menu.removeAttribute("open");
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return <span ref={marker} hidden />;
}
