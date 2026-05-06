"use client";

import { LogIn, LogOut, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { PREMIUM_SUBSCRIPTION_ID, SUBSCRIPTION_COOKIE_NAME } from "../subscription-cookie";

type AuthCookieToggleProps = {
  isAuthorized: boolean;
};

export function AuthCookieToggle({ isAuthorized }: AuthCookieToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const Icon = isPending ? LoaderCircle : isAuthorized ? LogOut : LogIn;

  const toggleCookie = () => {
    startTransition(() => {
      document.cookie = isAuthorized
        ? `${SUBSCRIPTION_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
        : `${SUBSCRIPTION_COOKIE_NAME}=${PREMIUM_SUBSCRIPTION_ID}; Path=/; SameSite=Lax`;
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant={isAuthorized ? "outline" : "default"}
      aria-pressed={isAuthorized}
      disabled={isPending}
      onClick={toggleCookie}
    >
      <Icon data-icon="inline-start" className={isPending ? "animate-spin" : undefined} aria-hidden="true" />
      {isPending ? "Обновляем" : isAuthorized ? "Сбросить cookie" : "Записать premium"}
    </Button>
  );
}
