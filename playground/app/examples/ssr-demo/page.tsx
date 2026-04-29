"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { demoScreens } from "./store/ssr";

const target = `/examples/ssr-demo/${demoScreens[0].id}`;

export default function SSRDemoIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(target);
  }, [router]);
  return null;
}
