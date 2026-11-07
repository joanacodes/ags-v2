import { route } from "@/studio/server/api";
import { missingEnv, OAUTH } from "@/studio/outbox/oauth";
import { CONNECTION_LABELS, CONNECTIONS, CONNECTION_OF } from "@/studio/outbox/types";
import { PLATFORMS, PLATFORM_LABELS } from "@/studio/types";

export const dynamic = "force-dynamic";

/** One card per connection: its state, account, scopes and expiry; never the token. */
export const GET = route(async ({ ctx }) => {
  const rows = await ctx.store.connections();
  return {
    connections: CONNECTIONS.map((key) => {
      const row = rows.find((r) => r.platform === key);
      return {
        key,
        label: CONNECTION_LABELS[key],
        kind: OAUTH[key] ? "oauth" : "form",
        platforms: PLATFORMS.filter((p) => CONNECTION_OF[p] === key).map((p) => ({ id: p, label: PLATFORM_LABELS[p], mode: ctx.settings.postingMode(p), enabled: ctx.settings.platform(p).enabled })),
        status: row?.status ?? "disconnected",
        account: row?.account_label ?? null,
        scopes: row?.scopes ?? [],
        expiresAt: row?.expires_at ?? null,
        updatedAt: row?.updated_at ?? null,
        missingEnv: missingEnv(key),
      };
    }),
    byHand: PLATFORMS.filter((p) => !CONNECTION_OF[p]).map((p) => ({ id: p, label: PLATFORM_LABELS[p] })),
  };
});
