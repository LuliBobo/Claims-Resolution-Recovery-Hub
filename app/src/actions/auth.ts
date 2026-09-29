"use server";

import { AuthError as NextAuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export async function loginAction(_prev: string | undefined, formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/cases",
    });
  } catch (e) {
    if (e instanceof NextAuthError) return "Invalid email or password.";
    throw e; // redirect signal
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
