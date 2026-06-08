import { useEffect, useRef } from "preact/hooks";

export function AccountMenuBehavior() {
  const marker = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const menu = marker.current?.closest("details");
    if (!menu) return;
    const accountMenu = menu;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!accountMenu.contains(event.target as Node)) accountMenu.removeAttribute("open");
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") accountMenu.removeAttribute("open");
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
