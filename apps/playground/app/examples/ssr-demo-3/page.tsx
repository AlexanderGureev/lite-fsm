"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { screenConfigs } from "./store/ssr";

const target = `/examples/ssr-demo-3/${screenConfigs[0].id}`;

export default function SSRDemo3IndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(target);
  }, [router]);
  return null;
}
