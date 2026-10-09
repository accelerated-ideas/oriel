import { Toaster } from "sonner";
import { getUser } from "@/lib/auth/get-user";
import { APP_ASSISTANT_ID, appAssistantToken } from "@/lib/app-assistant";
import { AppAssistant } from "@/components/dashboard/app-assistant";
import { Analytics } from "@/components/consent/analytics";
import { ConsentBanner } from "@/components/consent/consent-banner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The app's own help assistant, when one is set up (npm run app-assistant).
  const user = APP_ASSISTANT_ID ? await getUser() : null;
  const token = user ? await appAssistantToken(user) : null;

  return (
    <>
      {children}
      {APP_ASSISTANT_ID && user && <AppAssistant agentId={APP_ASSISTANT_ID} token={token} />}
      {/* Measured without cookies until they allow them (see analytics.tsx). */}
      <Analytics cookieless />
      <ConsentBanner place="dashboard" />
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: "!rounded-xl !border-line !bg-surface !text-ink !shadow-pop !font-sans",
            description: "!text-muted",
          },
        }}
      />
    </>
  );
}
