"use client";

/** The old Dashboard: the Station took its place (machine details are in the Station's menu) */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/station"); }, [router]);
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
      <Loader2 className="h-5 w-5 animate-spin text-[#ffc400]/60" />
    </div>
  );
}
