/**
 * "Is the person looking at this screen an operator?", for server components.
 *
 * The API answers this per request in `lib/api.ts`; a server component has no `Request`, so it
 * reads the same cookie through `next/headers` and applies the same constant-time comparison. It
 * exists so a screen can render *editable* controls for an operator and an honest read-only view —
 * with a route to sign in — for everyone else, rather than showing everyone a form that 401s when
 * they press Save.
 *
 * This is a UI affordance, never the access control: every write is checked again at the route.
 */

import { cookies } from "next/headers";
import { getRuntime } from "@/lib/runtime";
import { constantTimeEqual } from "@/vendor/arag-platform/src/index.ts";

export async function isOperator(): Promise<boolean> {
  const rt = await getRuntime();
  if (!rt.env.adminToken) return false;
  const jar = await cookies();
  const token = jar.get("arag_admin")?.value;
  return Boolean(token) && constantTimeEqual(token as string, rt.env.adminToken);
}

/**
 * True when this deployment has no operator token at all, so the admin panel — and with it every
 * settings *edit* — is switched off rather than merely locked. The distinction matters to the
 * copy: "sign in to change this" is useless advice when there is nothing to sign in to.
 */
export async function adminDisabled(): Promise<boolean> {
  const rt = await getRuntime();
  return !rt.env.adminToken;
}

/**
 * Can *this viewer* create, delete or re-run a call?
 *
 * Not "does this deployment allow writes" — that was the bug. `enforceAuth`'s `write` mode needs
 * the admin token or an API key from **the caller**, and a browser holding only the freely issued
 * demo session has neither. Deriving the affordance from the deployment's configuration instead
 * meant that on every real deployment (one with an `ADMIN_TOKEN`) the calls table offered Delete,
 * Re-run analysis and Upload to a visitor who would get a 401 on the click — exactly what
 * DECISIONS D-CA-33 says must never happen.
 *
 * A server component cannot see an `X-API-Key` header (there is none on a page navigation), so for
 * a browser the answer is: signed in as an operator, or a deployment with no credentials at all
 * outside production, which is the one case `enforceAuth` lets through anonymously.
 */
export async function canWrite(): Promise<boolean> {
  const rt = await getRuntime();
  if (await isOperator()) return true;
  const unconfigured = !rt.env.adminToken && !(await hasAnyApiKey(rt));
  return unconfigured && rt.env.nodeEnv !== "production";
}

async function hasAnyApiKey(rt: Awaited<ReturnType<typeof getRuntime>>): Promise<boolean> {
  const { apiKeysEnforced } = await import("@/services/apikeys");
  return apiKeysEnforced(rt);
}
