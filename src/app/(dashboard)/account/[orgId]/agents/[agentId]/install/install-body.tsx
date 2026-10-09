"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Keyboard, Plus, RotateCcw, X } from "lucide-react";
import { WaveIcon } from "@/components/ui/wave-icon";
import { AVATAR_STYLES, type AvatarStyle } from "@/config/avatars";
import { BRAND } from "@/config/brand";
import { actionRotateIdentitySecret, actionUpdateAgent } from "@/server-actions/agents";
import { runAction } from "@/lib/run-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/dashboard/agent-avatar";
import { CodeBlock, CopyButton } from "@/components/dashboard/code-block";
import { Avatar } from "@/components/widget/avatar/avatar";
import { useDemoCall } from "@/components/widget/avatar/demo";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SectionCard, segmentedItem, segmentedTrack } from "@/components/ui/misc";
import { textOn } from "@/lib/color";

type InstallAgent = {
  id: string;
  assistant_name: string;
  accent_color: string;
  avatar_style: AvatarStyle;
  launcher_label: string;
  launcher_position: "left" | "center" | "right";
  show_branding: boolean;
  allowed_origins: string[];
  identity_secret: string;
};

// The first is the default iris; the rest cover common brand colors.
const SWATCHES = ["#6352F2", "#18181B", "#2563EB", "#0D9488", "#16A34A", "#E11D48", "#F59E0B"];

// Whether this workspace's plan can hide "Powered by Oriel", and where to get one that can.
type Branding = { removable: boolean; plan: string | null; billingHref: string };

export function InstallBody({ agent, scriptUrl, branding }: { agent: InstallAgent; scriptUrl: string; branding: Branding }) {
  const router = useRouter();
  const G = BRAND.embedGlobal;

  const snippet = `<script src="${scriptUrl}" data-agent-id="${agent.id}" async></script>`;

  const serverSnippet = `// On your server: sign who's logged in. Keep the secret server-side.
import { SignJWT } from "jose";

const token = await new SignJWT({
  user_id: user.id,
  email: user.email,
  name: user.name,
  // Optional: enables Stripe actions for this user.
  stripe_customer_id: user.stripeCustomerId,
  // Any other fields become context, e.g. their plan.
  plan: user.plan,
})
  .setProtectedHeader({ alg: "HS256" })
  .setExpirationTime("12h")
  .sign(new TextEncoder().encode(process.env.ASSISTANT_IDENTITY_SECRET));`;

  const clientSnippet = `// In the browser, once you have the token:
${G}("identify", { token });`;

  const appSnippet = `// Single-page apps: navigate without a full reload.
${G}("setNavigator", (path) => router.push(path));

// Let the assistant run things in your app (define them under Actions).
${G}("registerAction", "create_campaign", async ({ campaign_name }) => {
  const campaign = await api.campaigns.create({ name: campaign_name });
  return \`Created \${campaign.name}\`;
});`;

  // ---- appearance ----
  const [label, setLabel] = useState(agent.launcher_label);
  const [color, setColor] = useState(agent.accent_color);
  const [position, setPosition] = useState(agent.launcher_position);
  const [look, setLook] = useState(agent.avatar_style);
  const [showBranding, setShowBranding] = useState(agent.show_branding);
  const appearanceDirty =
    label !== agent.launcher_label ||
    color !== agent.accent_color ||
    position !== agent.launcher_position ||
    look !== agent.avatar_style ||
    showBranding !== agent.show_branding;
  const demo = useDemoCall();

  // ---- domains ----
  const [origins, setOrigins] = useState(agent.allowed_origins);
  const [newOrigin, setNewOrigin] = useState("");
  const domainsDirty = JSON.stringify(origins) !== JSON.stringify(agent.allowed_origins);

  // ---- identity ----
  const [secret, setSecret] = useState(agent.identity_secret);
  const [revealed, setRevealed] = useState(false);

  const [saving, setSaving] = useState<string | null>(null);
  async function save(section: string, patch: Parameters<typeof actionUpdateAgent>[1]) {
    setSaving(section);
    await runAction(() => actionUpdateAgent(agent.id, patch), { success: "Saved", onSuccess: () => router.refresh() });
    setSaving(null);
  }

  return (
    <div className="mt-8 flex flex-col">
      <SectionCard
        title="Add the snippet"
        description="Paste it before the closing </body> tag on every page where the bubble should appear."
      >
        <CodeBlock code={snippet} language="index.html" syntax="html" />
      </SectionCard>

      <SectionCard
        title="Identify signed-in users"
        description="Optional, but needed for anything account-specific, like billing. Without it, everyone is an anonymous visitor."
      >
        <Field label="Identity secret" htmlFor="identity-secret" hint="Keep this on your server only.">
          <div className="flex items-center gap-2">
            <Input
              id="identity-secret"
              readOnly
              value={revealed ? secret : "•".repeat(48)}
              className="flex-1 font-mono text-[12.5px]"
            />
            <Button variant="ghost" size="icon" onClick={() => setRevealed((value) => !value)} aria-label={revealed ? "Hide" : "Reveal"}>
              {revealed ? <EyeOff /> : <Eye />}
            </Button>
            <CopyButton value={secret} className="h-9 border border-line-strong px-3 hover:bg-surface-3" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Rotate secret"
              title="Rotate secret"
              onClick={() =>
                runAction(() => actionRotateIdentitySecret(agent.id), {
                  success: "New secret created. Update your server.",
                  onSuccess: (result) => {
                    setSecret(result.data.secret);
                    setRevealed(true);
                  },
                })
              }
            >
              <RotateCcw />
            </Button>
          </div>
        </Field>
        <CodeBlock code={serverSnippet} language="server.ts" />
        <CodeBlock code={clientSnippet} language="app.js" />
      </SectionCard>

      <SectionCard
        title="Connect it to your app"
        description="So it can move around a single-page app and run the in-page actions you define."
      >
        <CodeBlock code={appSnippet} language="app.js" />
      </SectionCard>

      <SectionCard
        title="Allowed domains"
        description="The bubble only loads on these sites. Leave empty to allow any site while you're testing."
        footer={
          domainsDirty ? (
            <Button size="sm" loading={saving === "domains"} onClick={() => save("domains", { allowed_origins: origins })}>
              Save domains
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-2">
          {origins.map((origin) => (
            <div key={origin} className="flex items-center justify-between rounded-[10px] bg-surface py-1.5 pr-1.5 pl-3 shadow-border">
              <span className="font-mono text-[13px]">{origin}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${origin}`}
                onClick={() => setOrigins((current) => current.filter((value) => value !== origin))}
              >
                <X />
              </Button>
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const value = newOrigin.trim();
              if (!value) return;
              setOrigins((current) => [...new Set([...current, value])]);
              setNewOrigin("");
            }}
          >
            <Input
              value={newOrigin}
              onChange={(e) => setNewOrigin(e.target.value)}
              placeholder="https://app.acme.com or https://*.acme.com"
              className="flex-1 font-mono text-[13px]"
              aria-label="Domain"
            />
            <Button type="submit" variant="outline" disabled={!newOrigin.trim()}>
              <Plus /> Add
            </Button>
          </form>
        </div>
      </SectionCard>

      <SectionCard
        title="Appearance"
        description="How the assistant and its launcher look on your site."
        footer={
          appearanceDirty ? (
            <Button
              size="sm"
              loading={saving === "appearance"}
              onClick={() =>
                save("appearance", {
                  launcher_label: label,
                  accent_color: color,
                  launcher_position: position,
                  avatar_style: look,
                  show_branding: showBranding,
                })
              }
            >
              Save appearance
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Button text" htmlFor="launcher-label">
            <Input id="launcher-label" value={label} maxLength={32} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Position" htmlFor="launcher-position">
            <div id="launcher-position" className={cn(segmentedTrack, "grid grid-cols-3")}>
              {(["left", "center", "right"] as const).map((side) => (
                <button key={side} type="button" onClick={() => setPosition(side)} className={segmentedItem(position === side)}>
                  {side === "left" ? "Left" : side === "center" ? "Center" : "Right"}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <Field label="Avatar" hint="On a call, it moves with the assistant's voice.">
          <div role="radiogroup" aria-label="Avatar" className="grid max-w-md grid-cols-3 gap-2">
            {AVATAR_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                role="radio"
                aria-checked={look === style.id}
                onClick={() => setLook(style.id)}
                className={cn(
                  "flex flex-col items-center gap-3 overflow-hidden rounded-xl bg-surface px-2 pt-5 pb-3 text-[13.5px] font-medium shadow-border transition-shadow duration-150 hover:shadow-border-hover",
                  look === style.id && "ring-2 ring-ink",
                )}
              >
                <span className="grid size-16 place-items-center" style={{ "--accent": color } as React.CSSProperties}>
                  <Avatar look={style.id} color={color} size={56} level={demo.level} bands={demo.bands} state={demo.state} />
                </span>
                {style.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Accent color" htmlFor="accent">
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                className={cn(
                  "size-8 rounded-full ring-offset-2 transition-shadow",
                  color.toLowerCase() === swatch.toLowerCase() && "ring-2 ring-ink",
                )}
                style={{ background: swatch }}
                aria-label={`Use ${swatch}`}
              />
            ))}
            <Input id="accent" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-28 font-mono text-[13px]" />
          </div>
        </Field>

        <div
          className={cn(
            "flex h-36 items-end rounded-xl bg-[linear-gradient(135deg,#fafafa,#f4f4f5)] p-5 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.05)]",
            position === "left" ? "justify-start" : position === "center" ? "justify-center" : "justify-end",
          )}
        >
          <div className={cn("flex items-center gap-2", position === "left" && "flex-row-reverse")}>
            <span className="flex size-11 items-center justify-center rounded-full bg-white shadow-pop">
              <Keyboard className="size-[18px] text-ink" />
            </span>
            <span className="flex h-[52px] items-center gap-2.5 rounded-full bg-zinc-950 py-0 pr-5 pl-1.5 text-[15px] font-semibold text-white shadow-float">
              <LauncherAvatar look={look} color={color} />
              {label || "Ask anything"}
            </span>
          </div>
        </div>

        <label className={cn("flex items-start justify-between gap-6", branding.removable && "cursor-pointer")}>
          <span>
            <span className="block text-[14px] font-medium">Show &ldquo;Powered by {BRAND.name}&rdquo;</span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
              {branding.removable ? (
                `A small link to ${BRAND.name} under the assistant's text box.`
              ) : (
                <>
                  Hiding it is part of the {branding.plan ?? "top"} plan.{" "}
                  <Link href={branding.billingHref} className="font-medium text-accent-ink hover:underline">
                    Upgrade
                  </Link>
                </>
              )}
            </span>
          </span>
          <Switch
            checked={showBranding}
            onCheckedChange={setShowBranding}
            // Turning it back on is always allowed.
            disabled={!branding.removable && showBranding}
            className="mt-0.5"
          />
        </label>
      </SectionCard>
    </div>
  );
}

// The avatar as the launcher draws it. The face's square corners need more room
// inside the pill's round end, so it's a little smaller.
function LauncherAvatar({ look, color }: { look: AvatarStyle; color: string }) {
  if (look === "face") return <AgentAvatar look="face" color={color} className="mx-1 size-8" />;
  if (look === "hive") return <AgentAvatar look="hive" color={color} on="dark" className="size-10" />;
  return (
    <span
      className="orb-fill flex size-10 items-center justify-center rounded-full shadow-[inset_0_-3px_6px_rgb(0_0_0/0.2)]"
      style={{ "--accent": color, color: textOn(color) } as React.CSSProperties}
    >
      <WaveIcon className="size-[18px]" />
    </span>
  );
}
