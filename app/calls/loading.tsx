import { TableSkeleton } from "@/components/kit";

/**
 * The calls list's own loading boundary.
 *
 * Without it the root `app/loading.tsx` — six stat tiles and four chart cards — was shown while
 * navigating to a table, so a drill-through from the dashboard flashed a *dashboard* skeleton,
 * then a table skeleton, then the workspace's own. Three different shapes back to back read as one
 * long, broken wait. A screen's loading state should look like that screen.
 */
export default function Loading() {
  return (
    <div className="arag-content">
      <TableSkeleton rows={10} cols={8} />
    </div>
  );
}
