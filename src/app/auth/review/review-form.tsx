"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionReviewSignIn } from "@/server-actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function ReviewForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await actionReviewSignIn({ email, password }).catch(() => null);
    if (!result?.ok) {
      setError(result?.error ?? "Couldn't sign in. Try again.");
      setLoading(false);
      return;
    }
    router.replace("/account");
    router.refresh();
  }

  return (
    <form onSubmit={signIn} className="flex flex-col">
      <h1 className="headline text-center text-[44px] leading-[0.95] font-semibold tracking-[-0.045em] sm:text-[52px]">Sign in</h1>
      <Field label="Email" htmlFor="email" className="mt-8">
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-12 rounded-[14px] px-4 text-[15px]"
        />
      </Field>
      <Field label="Password" htmlFor="password" error={error ?? undefined} className="mt-4">
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={Boolean(error)}
          className="h-12 rounded-[14px] px-4 text-[15px]"
        />
      </Field>
      <Button type="submit" size="lg" variant="dark" loading={loading} className="mt-5 h-12 w-full rounded-full text-[15px]">
        Sign in
      </Button>
    </form>
  );
}
