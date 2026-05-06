import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FSMHydrationBoundary } from "@lite-fsm/react";

import { loadSubscription } from "../server-subscription";
import { SUBSCRIPTION_COOKIE_NAME } from "../subscription-cookie";
import { FSMConfigType, type AppEvents } from "../store";

import { AuthCookieToggle } from "./AuthCookieToggle";

export async function ServerLoad({ children }: React.PropsWithChildren) {
  const { cookieValue, loadedAt, requestId, subscription } = await loadSubscription();
  const subscriptionId = subscription?.id ?? null;

  return (
    <FSMHydrationBoundary<FSMConfigType, AppEvents>
      snapshot={{
        machines: {
          profile: {
            state: "READY",
            context: {
              loadedAt,
              requestId,
              subscription,
            },
          },
        },
      }}
      transitionAfterHydrate={{ type: "SUBSCRIPTION_HYDRATED" }}
    >
      <div className="flex flex-col gap-4">
        <Card size="sm" className="shadow-card">
          <CardHeader className="border-b">
            <div>
              <CardTitle>Cookie auth probe</CardTitle>
              <CardDescription>subscription id приходит из cookie в серверный snapshot</CardDescription>
            </div>
            <CardAction>
              <AuthCookieToggle isAuthorized={subscriptionId !== null} />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="flex min-h-24 flex-col justify-between rounded-lg bg-muted p-3">
              <span className="text-caption-strong text-muted-foreground">cookie</span>
              <div className="flex flex-col gap-2">
                <Badge variant={subscriptionId ? "default" : "secondary"}>
                  {subscriptionId ? "authorized" : "guest"}
                </Badge>
                <code className="truncate font-mono text-fine-print text-muted-foreground">
                  {SUBSCRIPTION_COOKIE_NAME}={cookieValue ?? "empty"}
                </code>
              </div>
            </div>
            <div className="flex min-h-24 flex-col justify-between rounded-lg bg-muted p-3">
              <span className="text-caption-strong text-muted-foreground">server request</span>
              <div className="flex flex-col gap-2">
                <span className="font-mono text-body-strong">{requestId}</span>
                <span className="font-mono text-fine-print text-muted-foreground">{loadedAt}</span>
              </div>
            </div>
            <div className="flex min-h-24 flex-col justify-between rounded-lg bg-muted p-3">
              <span className="text-caption-strong text-muted-foreground">snapshot</span>
              <div className="flex flex-col gap-2">
                <span className="text-body-strong">{subscriptionId ?? "null"}</span>
                <span className="text-caption text-muted-foreground">profile.READY</span>
              </div>
            </div>
          </CardContent>
        </Card>
        {children}
      </div>
    </FSMHydrationBoundary>
  );
}
