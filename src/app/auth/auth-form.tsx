"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { supabaseClient } from "@/lib/supabase/client";
import { IS_CLOUD } from "@/config/edition";
import { GoogleMark } from "@/components/brand/google-mark";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Matches otp_length in supabase/config.toml.
const CODE_LENGTH = 6;
const EASE_OUT = [0.2, 0, 0, 1] as const;

const step = {
  initial: { opacity: 0, x: 16, filter: "blur(4px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: -16, filter: "blur(4px)" },
  transition: { duration: 0.3, ease: EASE_OUT },
};

export function AuthForm({
  next,
  initialEmail,
  google,
  initialError,
}: {
  next: string;
  initialEmail: string;
  // Offer Google sign-in (only when it's switched on in Supabase Auth).
  google: boolean;
  initialError: string | null;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown under the Google button, so the email field isn't marked wrong.
  const [googleError, setGoogleError] = useState<string | null>(initialError);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: otpError } = await supabaseClient().auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setEmail(normalized);
    setStage("code");
    setCooldown(30);
  }

  // Off to Google, then back through /api/auth/callback to where they were headed.
  async function continueWithGoogle() {
    setGoogleLoading(true);
    setGoogleError(null);
    const callback = new URL("/api/auth/callback", window.location.origin);
    if (next !== "/account") callback.searchParams.set("next", next);
    const { error: oauthError } = await supabaseClient().auth.signInWithOAuth({
      provider: "google",
      // Lets people with more than one Google account pick the right one.
      options: { redirectTo: callback.toString(), queryParams: { prompt: "select_account" } },
    });
    if (oauthError) {
      setGoogleLoading(false);
      setGoogleError("We couldn't start Google sign-in. Try again, or use your email.");
    }
  }

  async function verify(token: string) {
    if (token.length < CODE_LENGTH) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: verifyError } = await supabaseClient().auth.verifyOtp({ email, token, type: "email" });
    if (verifyError) {
      setLoading(false);
      setCode("");
      setError("That code didn't work. Check it or send a new one.");
      requestAnimationFrame(() => codeRef.current?.focus());
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {stage === "email" ? (
        <motion.form key="email" onSubmit={sendCode} className="flex flex-col" {...step}>
          <h1 className="headline text-center text-[44px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[52px]">Welcome</h1>
          <Field label="Work email" htmlFor="email" error={error ?? undefined} className="mt-8">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(error)}
              className="h-12 rounded-[14px] px-4 text-[15px]"
            />
          </Field>
          <Button type="submit" size="lg" variant="dark" loading={loading} className="mt-5 h-12 w-full rounded-full text-[15px]">
            Email me a code
          </Button>
          {google && (
            <>
              <div className="my-5 flex items-center gap-3 text-[13px] text-muted" aria-hidden>
                <span className="h-px flex-1 bg-line-strong" />
                or
                <span className="h-px flex-1 bg-line-strong" />
              </div>
              <Button
                type="button"
                size="lg"
                variant="outline"
                loading={googleLoading}
                disabled={loading}
                onClick={() => void continueWithGoogle()}
                className="h-12 w-full gap-2.5 rounded-full text-[15px]"
              >
                <GoogleMark className="size-[18px]" />
                Continue with Google
              </Button>
            </>
          )}
          {googleError && (
            <p role="alert" className="mt-3 text-center text-[12.5px] text-danger">
              {googleError}
            </p>
          )}
          {IS_CLOUD && (
            <p className="mt-6 text-center text-[13px] leading-relaxed text-pretty text-muted">
              By continuing, you agree to the{" "}
              <Link href="/terms" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                Privacy policy
              </Link>
              .
            </p>
          )}
        </motion.form>
      ) : (
        <motion.form
          key="code"
          onSubmit={(event) => {
            event.preventDefault();
            void verify(code);
          }}
          className="flex flex-col"
          {...step}
        >
          <h1 className="headline text-[44px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[52px]">Check your email</h1>
          <p className="mt-4 text-[16px] leading-relaxed text-pretty text-muted">
            We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>.
          </p>
          <Field label="Code" htmlFor="code" error={error ?? undefined} className="mt-9">
            <CodeInput
              inputRef={codeRef}
              value={code}
              invalid={Boolean(error)}
              disabled={loading}
              onChange={(value) => {
                setCode(value);
                setError(null);
                // A full code goes straight through.
                if (value.length === CODE_LENGTH && !loading) void verify(value);
              }}
            />
          </Field>
          <Button type="submit" size="lg" variant="dark" loading={loading} className="mt-5 h-12 w-full rounded-full text-[15px]">
            Continue
          </Button>
          <div className="mt-5 flex items-center justify-between text-[14px]">
            <button
              type="button"
              onClick={() => {
                setStage("email");
                setCode("");
                setError(null);
              }}
              className="flex items-center gap-1.5 text-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-3.5" /> Different email
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || loading}
              onClick={() => void sendCode()}
              className="text-muted tabular-nums transition-colors hover:text-ink disabled:opacity-50 disabled:hover:text-muted"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}

// One box per digit. A single real input sits on top, so typing, pasting and
// the browser's one-time-code autofill all just work.
function CodeInput({
  value,
  onChange,
  invalid,
  disabled,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [focused, setFocused] = useState(false);
  const current = Math.min(value.length, CODE_LENGTH - 1);

  // autoFocus doesn't fire onFocus when the field first mounts, so check directly.
  useEffect(() => {
    if (document.activeElement === inputRef.current) setFocused(true);
  }, [inputRef]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id="code"
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-invalid={invalid}
        className="absolute inset-0 z-10 h-full w-full cursor-text text-[16px] opacity-0"
      />
      <div className="flex items-center gap-2" aria-hidden>
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const digit = value[index];
          const active = focused && index === current;
          return (
            <Fragment key={index}>
              {index === CODE_LENGTH / 2 && <span className="h-[2px] w-2.5 shrink-0 rounded-full bg-line-strong" />}
              <div
                className={cn(
                  "headline flex h-14 min-w-0 flex-1 items-center justify-center rounded-[14px] border bg-surface text-[26px] font-semibold tracking-[-0.02em] shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-150",
                  invalid
                    ? "border-danger"
                    : active
                      ? "border-accent shadow-[0_0_0_3px_rgb(99_82_242/0.15)]"
                      : "border-line-strong",
                  disabled && "opacity-60",
                )}
              >
                {digit ? (
                  <motion.span
                    key={`${index}-${digit}`}
                    initial={{ opacity: 0, y: 6, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.18, ease: EASE_OUT }}
                  >
                    {digit}
                  </motion.span>
                ) : active ? (
                  <motion.span
                    className="h-7 w-[1.5px] rounded-full bg-accent"
                    animate={{ opacity: [1, 1, 0, 0] }}
                    transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
                  />
                ) : null}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
