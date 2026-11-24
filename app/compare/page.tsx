"use client";

/** MetBarista's shot comparison: retired (each coffee's shots and brew chart are on Shots) */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CompareRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/shots"); }, [router]);
  return null;
}
