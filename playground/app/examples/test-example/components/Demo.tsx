"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { useSelector } from "../store";

export function Demo() {
  const onboardingState = useSelector((s) => s.onboarding.state);
  const hydrationChecks = useSelector((s) => s.onboarding.context.checks);
  const profile = useSelector((s) => s.profile.context);
  const subscriptionId = profile.subscription?.id ?? null;
  const isAuthorized = subscriptionId !== null;

  const interfaceLabel =
    onboardingState === "CHECK_ONBOARDING"
      ? "Проверяем подписку"
      : onboardingState === "VISIBLE"
        ? "Онбординг для premium"
        : "Гостевой интерфейс";

  return (
    <Card size="sm" className="shadow-card">
      <CardHeader className="border-b">
        <div>
          <CardTitle>{interfaceLabel}</CardTitle>
          <CardDescription>
            {isAuthorized ? "Подписка найдена в hydrated profile state" : "Подписки нет в hydrated profile state"}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <div className="flex min-h-24 flex-col justify-between rounded-lg bg-muted p-3">
          <span className="text-caption-strong text-muted-foreground">profile</span>
          <div className="flex flex-col gap-2">
            <Badge variant={isAuthorized ? "default" : "secondary"}>{subscriptionId ?? "guest"}</Badge>
            <span className="font-mono text-fine-print text-muted-foreground">request {profile.requestId ?? "-"}</span>
          </div>
        </div>
        <div className="flex min-h-24 flex-col justify-between rounded-lg bg-muted p-3">
          <span className="text-caption-strong text-muted-foreground">onboarding</span>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-body-strong">{onboardingState}</span>
            <span className="text-caption text-muted-foreground">{interfaceLabel}</span>
          </div>
        </div>
        <div className="flex min-h-24 flex-col justify-between rounded-lg bg-muted p-3">
          <span className="text-caption-strong text-muted-foreground">hydration events</span>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-body-strong">{hydrationChecks}</span>
            <span className="font-mono text-fine-print text-muted-foreground">{profile.loadedAt ?? "-"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
