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
      class={`toast fixed bottom-4 left-1/2 z-50 -translate-x-1/2 ${visible ? "visible" : ""}`}
    >
      {message}
    </div>
  );
}
