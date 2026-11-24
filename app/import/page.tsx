"use client";

/** MetBarista's profile import: retired */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ImportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/profiles"); }, [router]);
  return null;
}
