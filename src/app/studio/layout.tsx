import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { Shell } from "@/components/studio/shell";
import { viewer } from "@/studio/server/owner";
import { contextFromEnv } from "@/studio/server/context";
import { isLive } from "@/studio/agents/context";
import { signOut } from "@/app/auth/actions";
import "./studio.generated.css";
import "@xyflow/react/dist/style.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "The Studio", template: "%s · The Studio" },
  description: "The Astro Study's content studio: agents write, the owner approves.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f3f1ea" };

/**
 * Every screen is the owner's: AGS's middleware sends a signed-out visitor to sign in, this layout checks
 * the owner on the server, and every route and the tables' row security check again.
 *
 * The Studio keeps its own look inside AGS: `.studio` scopes its styles (studio.tailwind.css, compiled
 * with tailwind.studio.config.ts), so AGS's dark theme and the Studio's paper never touch. The outer div
 * only carries the scope; utilities apply to what is inside it.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const v = await viewer();
  if (v.kind === "signed-out") redirect("/auth/sign-in?next=/studio");
  if (v.kind === "stranger")
    return (
      <div className="studio">
        <main className="mx-auto max-w-md px-6 py-24">
          <h1 className="text-3xl">This Studio has one owner</h1>
          <p className="mt-3 text-sm text-ink-2">You are signed in, but not as its owner. If this is your Studio, set STUDY_OWNER_USER_ID to your Supabase user id.</p>
          <form action={signOut} className="mt-6">
            <button className="btn">Sign out</button>
          </form>
        </main>
      </div>
    );
  let paused = false;
  try {
    paused = (await contextFromEnv("interactive")).settings.get("global").paused;
  } catch {
    // The screens say what is missing; the shell still draws.
  }
  return (
    <div className="studio">
      <Shell live={isLive()} paused={paused} signOut={signOut}>
        {children}
      </Shell>
    </div>
  );
}
