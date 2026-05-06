import "server-only";

import { cookies } from "next/headers";

import { normalizeSubscriptionId, SUBSCRIPTION_COOKIE_NAME, type Subscription } from "./subscription-cookie";

export type SubscriptionLoad = {
  cookieValue: string | null;
  loadedAt: string;
  requestId: string;
  subscription: Subscription | null;
};

export async function loadSubscription(): Promise<SubscriptionLoad> {
  let cookieValue: string | null = null;

  if (process.env.NODE_ENV !== "production") {
    const cookieStore = await cookies();
    cookieValue = cookieStore.get(SUBSCRIPTION_COOKIE_NAME)?.value ?? null;
  }

  const subscriptionId = normalizeSubscriptionId(cookieValue);

  await new Promise((resolve) => setTimeout(resolve, 700));

  return {
    cookieValue,
    loadedAt: new Date().toISOString(),
    requestId: crypto.randomUUID().slice(0, 8),
    subscription: subscriptionId ? { id: subscriptionId } : null,
  };
}
