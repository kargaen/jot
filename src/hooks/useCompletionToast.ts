import { useCallback, useRef, useState } from "react";
import { randomCompletionMessage } from "../utils/presentation/completionMessage";

export interface CompletionToastState {
  quote: string;
  count: number;
}

// Manages the "task completed" toast: a random encouraging message plus a
// running count of tasks completed today, auto-dismissed after a short delay.
export function useCompletionToast() {
  const [toast, setToast] = useState<CompletionToastState | null>(null);
  const completedRef = useRef<{ date: string; count: number }>({ date: "", count: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback(() => {
    const today = new Date().toISOString().split("T")[0];
    if (completedRef.current.date !== today) completedRef.current = { date: today, count: 0 };
    completedRef.current.count += 1;
    setToast({ quote: randomCompletionMessage(), count: completedRef.current.count });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  return { toast, notify };
}
