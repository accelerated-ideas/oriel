import { PageBody } from "@/components/dashboard/app-shell";

// What a dashboard page shows while it loads: the outline of a header and a
// panel. It fades in after a moment, so pages that load quickly never flash it.
export function PageSkeleton() {
  return (
    <PageBody role="status" aria-label="Loading" className="[animation:fade-in_200ms_ease-out_150ms_both]">
      <div className="h-9 w-56 max-w-full rounded-lg bg-surface-2 sm:h-[42px]" />
      <div className="mt-3.5 h-4 w-96 max-w-full rounded-md bg-surface-2" />
      <div className="mt-10 h-[320px] rounded-2xl bg-surface-2/70" />
    </PageBody>
  );
}
