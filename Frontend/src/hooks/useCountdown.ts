import { useEffect, useRef, useState } from "react";

export function useCountdown(initialSeconds: number) {
  const [seconds, setSeconds] = useState(Math.max(0, initialSeconds));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (initialSeconds <= 0) return;

    setSeconds(Math.max(0, initialSeconds));
    intervalRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [initialSeconds]);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return {
    hours:    String(h).padStart(2, "0"),
    minutes:  String(m).padStart(2, "0"),
    seconds:  String(s).padStart(2, "0"),
    raw:      seconds,
    isLive:   seconds <= 0 && initialSeconds > 0,
    isUrgent: seconds > 0 && seconds <= 300,
    isCritical: seconds > 0 && seconds <= 60,
  };
}
