/**
 * The frame shared by the landing and auth pages: the real night sky over
 * Paris behind, and the dark palette inside whatever the app's theme (the
 * sky is always night).
 */
import { cn } from "@/lib/utils";
import { NightSky } from "./night-sky";

export function NightPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="dark min-h-[100svh] bg-[#04050d] text-ink">
      <NightSky />
      <div className={cn("relative z-10", className)}>{children}</div>
    </div>
  );
}
