"use client";

/** MetBarista's live view: the Station does it now */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LiveRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/station"); }, [router]);
  return null;
}
