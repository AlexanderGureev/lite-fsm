import { Suspense } from "react";

import { Demo } from "./components/Demo";
import { ServerLoad } from "./components/ServerLoad";
import { Provider } from "./provider";

export default function Page() {
  return (
    <Provider>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <Suspense fallback={<div>loading...</div>}>
          <ServerLoad>
            <Demo />
          </ServerLoad>
        </Suspense>
      </main>
    </Provider>
  );
}
