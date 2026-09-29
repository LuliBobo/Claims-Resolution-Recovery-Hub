"use client";

import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input name="email" type="email" required placeholder="Email" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        <input name="password" type="password" required placeholder="Password" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Signing in..." : "Sign in"}</Button>
      </form>
    </main>
  );
}
