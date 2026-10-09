import { Logo } from "@/components/dashboard/logo";
import paper from "@/components/ui/paper.module.css";
import { cn } from "@/lib/utils";

// The pages people see before they're in the app (sign-in, invitations): the
// logo in the corner and the form centred on paper.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className={cn(paper.paper, "flex min-h-dvh flex-col px-6 sm:px-10")}>
      <div className="flex h-20 shrink-0 items-center">
        <Logo />
      </div>
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[400px]">{children}</div>
      </div>
      {/* Matches the logo row, so the form sits in the middle of the screen. */}
      <div className="h-20 shrink-0" aria-hidden />
    </main>
  );
}
