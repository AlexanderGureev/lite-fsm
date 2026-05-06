"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { screenConfigs } from "./store/ssr";

const target = `/examples/ssr-demo-2/${screenConfigs[0].id}`;

export default function SSRDemo2IndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(target);
  }, [router]);
  return null;
}
