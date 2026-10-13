"use client";

/**
 * Live Paris time, ticking on the second (whatever the visitor's own time
 * zone). Rendered after mount, so the server and the browser never disagree.
 */
import { useEffect, useState } from "react";

const TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const DAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export function ParisClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(new Date());
      // Next tick right on the next second.
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className={className} aria-label="Time in Paris">
      <time
        dateTime={now?.toISOString()}
        className="block font-mono text-lg tabular-nums leading-none tracking-wider text-white/85 sm:text-xl"
      >
        {now === null ? "--:--:--" : TIME.format(now)}
      </time>
      <span className="mt-1.5 block text-[11px] uppercase tracking-[0.18em] text-white/45">
        Paris{now === null ? "" : ` · ${DAY.format(now)}`}
      </span>
    </div>
  );
}
