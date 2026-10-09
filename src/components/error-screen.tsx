"use client";
import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { actionReportPageError } from "@/server-actions/errors";
import { LogoMark } from "@/components/dashboard/logo";
import { Button } from "@/components/ui/button";

// What error.tsx and global-error.tsx show. Errors with a digest happened on
// the server, which reported them already; the rest are reported from here.
export function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (error.digest) return;
    actionReportPageError({
      message: `${error.name}: ${error.message}`,
      stack: error.stack?.slice(0, 4000),
      path: window.location.pathname,
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <LogoMark className="size-10" />
      <h1 className="mt-6 font-display text-[34px] leading-tight text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-[15px] text-pretty text-muted">
        This page didn&apos;t load. We&apos;ve been told about it. Try again, or go back to the start.
      </p>
      <div className="mt-7 flex items-center gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw /> Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Go to the start</Link>
        </Button>
      </div>
    </main>
  );
}
