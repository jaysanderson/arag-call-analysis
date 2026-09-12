import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Call Analysis · Admin",
  description: "Operations console: health, configuration, usage, jobs, logs, agents and cache.",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="pb-4">{children}</div>;
}
