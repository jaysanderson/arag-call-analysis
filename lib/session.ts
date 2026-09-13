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
