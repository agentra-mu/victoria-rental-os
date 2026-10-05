"use client";

import { useEffect, useRef } from "react";

/** Beeps and raises a browser notification when the number of red (urgent) conversations goes up. */
export default function RedAlert({ count }: { count: number }) {
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    if (prev.current !== null && count > prev.current) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } catch {
        // audio not available / blocked until user interaction
      }
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        new Notification("Victoria Car Rental", {
          body: "A conversation needs attention",
        });
      }
    }
    prev.current = count;
  }, [count]);
  return null;
}
