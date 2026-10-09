import { DEFAULT_AVATAR_STYLE, isAvatarStyle } from "@/config/avatars";
import type { Agent } from "@/lib/types";

// The subset of agent settings the widget is allowed to see. `branding`:
// whether it shows "Powered by Oriel" (showsBranding in src/lib/billing/limits.ts).
export function publicAgentConfig(agent: Agent, { branding }: { branding: boolean }) {
  return {
    id: agent.id,
    assistantName: agent.assistant_name,
    siteName: agent.site_name,
    greeting: agent.greeting,
    accentColor: agent.accent_color,
    avatarStyle: isAvatarStyle(agent.avatar_style) ? agent.avatar_style : DEFAULT_AVATAR_STYLE,
    launcherLabel: agent.launcher_label,
    launcherPosition: agent.launcher_position,
    textModeEnabled: agent.text_mode_enabled,
    voiceEnabled: Boolean(process.env.ELEVENLABS_API_KEY),
    language: agent.language,
    branding,
  };
}

export type PublicAgentConfig = ReturnType<typeof publicAgentConfig>;

export function originAllowed(agent: Pick<Agent, "allowed_origins">, origin: string | null, appOrigin: string) {
  if (!origin) return agent.allowed_origins.length === 0;
  if (origin === appOrigin) return true;
  if (agent.allowed_origins.length === 0) return true;
  return agent.allowed_origins.some((allowed) => {
    if (allowed === origin) return true;
    // Wildcard subdomains: https://*.example.com
    const match = allowed.match(/^(https?):\/\/\*\.(.+)$/);
    if (!match) return false;
    try {
      const url = new URL(origin);
      return url.protocol === `${match[1]}:` && (url.hostname === match[2] || url.hostname.endsWith(`.${match[2]}`));
    } catch {
      return false;
    }
  });
}
