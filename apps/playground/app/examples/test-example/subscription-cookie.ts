export const SUBSCRIPTION_COOKIE_NAME = "lite_fsm_test_subscription_id";
export const PREMIUM_SUBSCRIPTION_ID = "premium";

export type SubscriptionId = typeof PREMIUM_SUBSCRIPTION_ID;
export type Subscription = { id: SubscriptionId };

export const normalizeSubscriptionId = (value: string | null | undefined): SubscriptionId | null =>
  value === PREMIUM_SUBSCRIPTION_ID ? value : null;
