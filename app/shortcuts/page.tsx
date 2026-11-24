"use client";

/** MetBarista's iOS shortcut guide: retired (add the Station to the home screen from Chrome) */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ShortcutsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/estacao"); }, [router]);
  return null;
}
