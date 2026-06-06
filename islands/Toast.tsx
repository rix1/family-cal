import { useEffect, useState } from "preact/hooks";

interface Props {
  message: string;
}

export function Toast({ message }: Props) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2600);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      role="status"
      class={`pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg transition-all ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {message}
    </div>
  );
}
