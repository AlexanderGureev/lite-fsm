import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { Provider } from "./components/Provider";
import { ServerLoad } from "./components/ServerLoad";

export default function TestExampleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Provider>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <Suspense fallback={<ServerLoadFallback />}>
          <ServerLoad>{children}</ServerLoad>
        </Suspense>
      </main>
    </Provider>
  );
}

function ServerLoadFallback() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-36 rounded-xl" />
    </div>
  );
}
