import { actorOf, preflight, route } from "@/lib/api";
import { resetSettings, type SettingsSection, updateSettings } from "@/services/config";
import { settings } from "@/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Editing a setting is an operator action, not a user one: it changes the deployment for everyone.
 * The read (`GET /api/v1/settings`) stays open, so the product can render what it is configured
 * with; only the write is behind the admin token.
 */
export const PUT = route({ path: "/api/v1/settings/{section}", method: "put", auth: "admin" }, (ctx) => {
  updateSettings(
    ctx.rt,
    ctx.params.section! as SettingsSection,
    (ctx.body ?? {}) as Record<string, unknown>,
    actorOf(ctx.auth),
  );
  // The full settings view, not just the section: a limits change moves `features`, and a
  // connection change moves `connection.mode`, so returning a fragment would leave the screen
  // showing a stale version of the thing next to the thing that changed.
  return settings(ctx.rt);
});

export const DELETE = route(
  { path: "/api/v1/settings/{section}", method: "delete", auth: "admin" },
  (ctx) => {
    resetSettings(ctx.rt, ctx.params.section! as SettingsSection, actorOf(ctx.auth));
    return settings(ctx.rt);
  },
);

export const OPTIONS = preflight;
