"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminFetch } from "@/components/admin/AdminShell";
import { Button, Card } from "@/components/ui";

/**
 * Exchanges the admin token for an HttpOnly cookie via POST /api/v1/admin/login. The token is
 * never stored in localStorage and never read back by client JavaScript.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminFetch("/api/v1/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[55vh] max-w-md items-center">
      <Card className="w-full p-6">
        <h1 className="font-display text-xl font-semibold text-ink-950">Admin sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the <code className="font-mono text-xs">ADMIN_TOKEN</code> configured for this
          deployment.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="admin-token">
            Admin token
          </label>
          <input
            id="admin-token"
            name="token"
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full rounded-md border border-brand-200 px-3 py-2 font-mono text-sm text-ink-950 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="••••••••••••"
          />
          {error && (
            <div role="alert" className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger-fg">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy || !token.trim()} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
