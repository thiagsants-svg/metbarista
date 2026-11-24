"use client";

/** The old "My Stats" (levels and badges): replaced by /stats */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function BaristaRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/stats"); }, [router]);
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
      <Loader2 className="h-5 w-5 animate-spin text-[#ffc400]/60" />
    </div>
  );
}
