import Script from "next/script";

// Dogfooding: set NEXT_PUBLIC_DEMO_AGENT_ID to put a live assistant on the landing page.
export function DemoBubble() {
  const agentId = process.env.NEXT_PUBLIC_DEMO_AGENT_ID;
  if (!agentId) return null;
  return <Script src="/embed.js" data-agent-id={agentId} strategy="afterInteractive" />;
}
