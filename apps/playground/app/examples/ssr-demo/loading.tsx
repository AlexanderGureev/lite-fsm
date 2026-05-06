import { WidgetSkeleton } from "./components/Skeleton";

export default function SSRDemoLoading() {
  return (
    <div className="flex flex-col gap-6">
      <WidgetSkeleton />
      <WidgetSkeleton />
    </div>
  );
}
