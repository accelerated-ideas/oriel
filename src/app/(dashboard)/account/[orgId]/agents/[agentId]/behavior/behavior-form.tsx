"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";
import { actionUpdateAgent } from "@/server-actions/agents";
import { runAction } from "@/lib/run-action";
import { LANGUAGE_OPTIONS, VOICE_OPTIONS } from "@/config/voices";
import {
  CHAT_MODELS,
  CHAT_PROVIDER_NAMES,
  DEFAULT_CHAT_MODEL_ID,
  FALLBACK_AFTER_MS,
  resolveChatModels,
  type ChatModelId,
} from "@/config/ai";
import type { Agent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const INSTRUCTION_IDEAS = [
  "If someone asks about pricing, mention the 14-day free trial.",
  "Never promise refunds; hand those to the team.",
  "Our users are mostly marketers, so avoid technical jargon.",
];

// Each section saves its own fields.
const SECTION_FIELDS = {
  identity: ["assistant_name", "site_name", "site_url"],
  greeting: ["greeting"],
  instructions: ["instructions"],
  voice: ["voice_id", "language"],
  model: ["chat_model", "fallback_model"],
  conversation: ["text_mode_enabled", "share_page_content", "feedback_interviews_enabled"],
  handoffs: ["handoff_email", "handoff_webhook_url"],
} as const;
type Section = keyof typeof SECTION_FIELDS;

const PROVIDER_KEYS = { google: "GOOGLE_API_KEY", anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" } as const;
const NO_FALLBACK = "none";

// Models whose provider has no API key on the server are shown, but can't be picked.
function modelOptions(available: string[]) {
  return CHAT_MODELS.map((model) => {
    const ready = available.includes(model.id);
    const notes = [CHAT_PROVIDER_NAMES[model.provider]];
    if (model.id === DEFAULT_CHAT_MODEL_ID) notes.push("default");
    return {
      value: model.id,
      label: model.name,
      description: ready ? notes.join(" · ") : `Set ${PROVIDER_KEYS[model.provider]} to use it`,
      disabled: !ready,
    };
  });
}

export function BehaviorForm({ agent, availableModels }: { agent: Agent; availableModels: string[] }) {
  const router = useRouter();
  const initial = useMemo(
    () => ({
      assistant_name: agent.assistant_name,
      site_name: agent.site_name,
      site_url: agent.site_url,
      greeting: agent.greeting,
      instructions: agent.instructions,
      language: agent.language,
      voice_id: agent.voice_id,
      text_mode_enabled: agent.text_mode_enabled,
      share_page_content: agent.share_page_content,
      feedback_interviews_enabled: agent.feedback_interviews_enabled,
      handoff_email: agent.handoff_email ?? "",
      handoff_webhook_url: agent.handoff_webhook_url ?? "",
      chat_model: agent.chat_model as ChatModelId,
      fallback_model: agent.fallback_model as ChatModelId | null,
    }),
    [agent],
  );
  const models = useMemo(() => modelOptions(availableModels), [availableModels]);
  const keyFor = (id: string | null) => {
    const model = CHAT_MODELS.find((item) => item.id === id);
    return model && !availableModels.includes(model.id) ? PROVIDER_KEYS[model.provider] : null;
  };
  const [values, setValues] = useState(initial);
  const chatKey = keyFor(values.chat_model);
  const fallbackKey = keyFor(values.fallback_model);
  const [saving, setSaving] = useState<Section | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  type Values = typeof values;
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }));
  const pick = (from: Values, section: Section) =>
    Object.fromEntries(SECTION_FIELDS[section].map((key) => [key, from[key]])) as Partial<Values>;
  const dirty = (section: Section) => SECTION_FIELDS[section].some((key) => values[key] !== initial[key]);
  const discard = (section: Section) => setValues((current) => ({ ...current, ...pick(initial, section) }));

  // After a save, the section takes the saved values (trimmed and so on) from the server.
  const savedRef = useRef<Section | null>(null);
  useEffect(() => {
    const section = savedRef.current;
    if (!section) return;
    savedRef.current = null;
    setValues((current) => ({ ...current, ...pick(initial, section) }));
  }, [initial]);

  function preview(voiceId: string, url: string) {
    audioRef.current?.pause();
    if (playing === voiceId) {
      setPlaying(null);
      return;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    void audio.play();
    setPlaying(voiceId);
  }

  async function save(section: Section) {
    setSaving(section);
    await runAction(() => actionUpdateAgent(agent.id, pick(values, section)), {
      success: "Saved",
      onSuccess: () => {
        savedRef.current = section;
        router.refresh();
      },
    });
    setSaving(null);
  }

  // Save and Discard at the bottom of a section, once something in it changed.
  const footer = (section: Section, ready = true) =>
    dirty(section) ? (
      <>
        <Button variant="ghost" size="sm" onClick={() => discard(section)}>
          Discard
        </Button>
        <Button size="sm" loading={saving === section} disabled={!ready} onClick={() => void save(section)}>
          Save
        </Button>
      </>
    ) : undefined;

  return (
    <div className="mt-8 flex flex-col">
      <SectionCard
        title="Identity"
        description="The name people hear, and optionally the product it represents."
        footer={footer("identity", Boolean(values.assistant_name.trim()))}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Assistant name" htmlFor="assistant-name">
            <Input
              id="assistant-name"
              required
              maxLength={40}
              value={values.assistant_name}
              onChange={(e) => set("assistant_name", e.target.value)}
              placeholder="Ava"
            />
          </Field>
          <Field label="Product name" htmlFor="site-name" optional>
            <Input
              id="site-name"
              maxLength={80}
              value={values.site_name}
              onChange={(e) => set("site_name", e.target.value)}
              placeholder="Acme"
            />
          </Field>
        </div>
        <Field label="Website" htmlFor="site-url" optional>
          <Input id="site-url" value={values.site_url} onChange={(e) => set("site_url", e.target.value)} placeholder="https://acme.com" />
        </Field>
      </SectionCard>

      <SectionCard
        title="Opening line"
        description="The first thing it says when someone starts a call or opens the chat."
        footer={footer("greeting", Boolean(values.greeting.trim()))}
      >
        <Textarea minRows={2} value={values.greeting} onChange={(e) => set("greeting", e.target.value)} />
      </SectionCard>

      <SectionCard
        title="Instructions"
        description="Rules, tone and context it should always follow. Facts about your product belong in Knowledge."
        footer={footer("instructions")}
      >
        <Textarea
          minRows={7}
          value={values.instructions}
          onChange={(e) => set("instructions", e.target.value)}
          placeholder={INSTRUCTION_IDEAS.join("\n")}
        />
      </SectionCard>

      <SectionCard title="Voice" description="How it sounds on calls, and the language it listens and speaks in." footer={footer("voice")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {VOICE_OPTIONS.map((voice) => {
            const selected = values.voice_id === voice.id;
            return (
              <div
                key={voice.id}
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => set("voice_id", voice.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    set("voice_id", voice.id);
                  }
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-3 transition-[background-color,box-shadow] duration-150",
                  selected
                    ? "bg-accent-soft/60 shadow-[0_0_0_1.5px_var(--color-accent)]"
                    : "bg-surface shadow-border hover:shadow-border-hover",
                )}
              >
                <div>
                  <p className="text-[14px] font-medium">{voice.name}</p>
                  <p className="text-[12.5px] text-muted">{voice.description}</p>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    preview(voice.id, voice.previewUrl);
                  }}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full transition-[background-color,color,scale] duration-150 active:scale-[0.96]",
                    playing === voice.id ? "bg-accent text-white" : "bg-surface text-ink shadow-border hover:bg-zinc-50",
                  )}
                  aria-label={playing === voice.id ? `Stop ${voice.name}` : `Play ${voice.name}`}
                >
                  {playing === voice.id ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
                </button>
              </div>
            );
          })}
        </div>
        <Field
          label="Language"
          htmlFor="language"
          hint="Calls listen and speak in this language. In text chat it follows whatever language the visitor writes in."
        >
          <Select
            id="language"
            value={values.language}
            onValueChange={(value) => set("language", value)}
            options={LANGUAGE_OPTIONS.map((language) => ({ value: language.code, label: `${language.flag}  ${language.name}` }))}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Model" description="The AI model that writes its replies, on calls and in chat." footer={footer("model")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Model"
            htmlFor="chat-model"
            hint={
              chatKey
                ? `Off until ${chatKey} is set on the server. Until then it uses ${resolveChatModels(values, availableModels).primary.name}.`
                : undefined
            }
          >
            <Select
              id="chat-model"
              value={values.chat_model}
              onValueChange={(value) =>
                setValues((current) => ({
                  ...current,
                  chat_model: value as ChatModelId,
                  // Picking the fallback as the model swaps the two.
                  fallback_model: current.fallback_model === value ? current.chat_model : current.fallback_model,
                }))
              }
              options={models}
            />
          </Field>
          <Field
            label="Fallback"
            htmlFor="fallback-model"
            hint={
              fallbackKey
                ? `Off until ${fallbackKey} is set on the server, so there's no fallback for now.`
                : `Answers instead if the model fails or hasn't started replying after ${FALLBACK_AFTER_MS / 1000} seconds.`
            }
          >
            <Select
              id="fallback-model"
              value={values.fallback_model ?? NO_FALLBACK}
              onValueChange={(value) => set("fallback_model", value === NO_FALLBACK ? null : (value as ChatModelId))}
              options={[...models.filter((model) => model.value !== values.chat_model), { value: NO_FALLBACK, label: "No fallback" }]}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Conversation" footer={footer("conversation")}>
        <ToggleRow
          title="Allow typing"
          description="Visitors can switch from voice to text at any time."
          checked={values.text_mode_enabled}
          onChange={(value) => set("text_mode_enabled", value)}
        />
        <ToggleRow
          title="Read the current page"
          description="Shares the visible text and links of the page the visitor is on, so answers match what they see."
          checked={values.share_page_content}
          onChange={(value) => set("share_page_content", value)}
        />
        <ToggleRow
          title="Dig into problems"
          description="When someone is stuck or unhappy, it asks follow-up questions and logs what it learns in Insights."
          checked={values.feedback_interviews_enabled}
          onChange={(value) => set("feedback_interviews_enabled", value)}
        />
      </SectionCard>

      <SectionCard
        title="Follow-ups"
        description="Where to send requests it can't resolve, so your team can get back to the visitor. They always appear in Insights too."
        footer={footer("handoffs")}
      >
        <Field label="Email" htmlFor="handoff-email">
          <Input
            id="handoff-email"
            type="email"
            value={values.handoff_email}
            onChange={(e) => set("handoff_email", e.target.value)}
            placeholder="support@acme.com"
          />
        </Field>
        <Field label="Webhook" htmlFor="handoff-webhook" hint="We POST a JSON summary with a link to the transcript.">
          <Input
            id="handoff-webhook"
            value={values.handoff_webhook_url}
            onChange={(e) => set("handoff_webhook_url", e.target.value)}
            placeholder="https://hooks.slack.com/…"
          />
        </Field>
      </SectionCard>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6">
      <span>
        <span className="block text-[14px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  );
}
