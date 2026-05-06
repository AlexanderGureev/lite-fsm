import { Skeleton } from "@/components/ui/skeleton";

export function WidgetSkeleton() {
  return (
    <section className="grid gap-4 rounded-lg bg-canvas p-5 ring-1 ring-hairline">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32 rounded-md" />
          <Skeleton className="h-6 w-52 rounded-md" />
        </div>
        <Skeleton className="h-6 w-28 rounded-md" />
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-md bg-canvas-parchment p-3">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="mt-2 h-3 w-24 rounded-md" />
          </div>
        ))}
      </div>

      <Skeleton className="h-9 w-36 rounded-pill" />
    </section>
  );
}

export function GridSkeleton() {
  return (
    <section className="flex flex-col gap-6">
      {Array.from({ length: 2 }).map((_, index) => (
        <WidgetSkeleton key={index} />
      ))}
    </section>
  );
}
