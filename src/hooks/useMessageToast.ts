import { useCallback, useRef, useState } from "react";

// Generic "show a message briefly" toast — same shape as useCompletionToast,
// for confirmations that aren't tied to task completion (e.g. export copied).
export function useMessageToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(null), 2400);
  }, []);

  return { message, showMessage };
}
