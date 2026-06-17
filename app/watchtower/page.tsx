'use client';

import dynamic from "next/dynamic";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

const Watchtower = dynamic(() => import("@/pages_vite/Watchtower"), { ssr: false });

export default function WatchtowerPage() {
  return (
    <TooltipProvider>
      <div className="h-screen min-h-screen w-screen overflow-hidden bg-background">
        <Watchtower />
      </div>
      <Toaster />
      <Sonner />
    </TooltipProvider>
  );
}
