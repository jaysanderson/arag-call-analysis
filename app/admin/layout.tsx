import type { Metadata } from "next";
import { getRuntime } from "@/lib/runtime";

export async function generateMetadata(): Promise<Metadata> {
  const { branding } = await getRuntime();
  return {
    title: `${branding.productName} · Admin`,
    description: "Operations console: health, configuration, usage, jobs, logs, agents and cache.",
  };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="pb-4">{children}</div>;
}
