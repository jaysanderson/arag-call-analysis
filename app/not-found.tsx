import { Button, Card } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="max-w-sm p-8 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-md bg-brand-50 text-brand-600">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </div>
        <h1 className="font-display text-lg font-semibold text-ink-950">Call not found</h1>
        <p className="mt-1.5 text-sm text-slate-500">That call doesn't exist, or may have been removed.</p>
        <Button href="/calls" className="mt-5">Back to all calls</Button>
      </Card>
    </div>
  );
}
