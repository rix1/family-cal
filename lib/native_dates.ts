import { useEffect, useState } from "preact/hooks";

/**
 * True on touch-first devices, where the native date picker beats free
 * typing; desktop keeps a plain text input (faster to type, no forced
 * locale chrome). Decided after hydration, so SSR always renders text.
 */
export function useNativeDatePicker(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(matchMedia("(hover: none) and (pointer: coarse)").matches);
  }, []);
  return native;
}
