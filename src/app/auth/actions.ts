"use server";

/**
 * Auth server actions (adapted from the prior backend branch, restyled
 * error handling). Redirect-based flows; messages are shown by the pages.
 */
import { redirect } from "next/navigation";
import { afterSignInPath } from "@/lib/auth-paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function withMessage(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}message=${encodeURIComponent(message)}`);
}

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

const NOT_CONFIGURED =
  "Persistence is not configured. Add the Supabase variables to .env.local first.";

export async function signIn(formData: FormData): Promise<void> {
  // Back to the page that asked for a sign-in, if any.
  const next = afterSignInPath(field(formData, "next"));
  const here = next === "/dashboard" ? "/auth/sign-in" : `/auth/sign-in?next=${encodeURIComponent(next)}`;
  const supabase = createSupabaseServerClient();
  if (supabase === null) withMessage(here, NOT_CONFIGURED);
  const email = field(formData, "email");
  const password = field(formData, "password");
  if (email === "" || password === "") {
    withMessage(here, "Enter your email and password.");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error !== null) {
    const code = errorCode(error);
    if (code === "email_not_confirmed") {
      withMessage(here, "Confirm your email before signing in.");
    }
    if (code === "invalid_credentials") {
      withMessage(here, "The email or password is incorrect.");
    }
    withMessage(here, "Sign-in could not be completed. Please try again.");
  }
  redirect(next);
}

// No sign-up while AGS is in private beta: accounts are added from the Supabase dashboard.

export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient();
  if (supabase !== null) await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const supabase = createSupabaseServerClient();
  if (supabase === null) withMessage("/auth/reset-password", NOT_CONFIGURED);
  const email = field(formData, "email");
  if (email === "") withMessage("/auth/reset-password", "Enter your email.");
  await supabase.auth.resetPasswordForEmail(email);
  // Same message either way: never reveal whether an email exists.
  withMessage(
    "/auth/reset-password",
    "If an account exists for this email, a reset link is on its way.",
  );
}

export async function updatePassword(formData: FormData): Promise<void> {
  const supabase = createSupabaseServerClient();
  if (supabase === null) withMessage("/auth/update-password", NOT_CONFIGURED);
  const password = field(formData, "password");
  if (password.length < 8) {
    withMessage("/auth/update-password", "The new password needs at least 8 characters.");
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error !== null) {
    withMessage("/auth/update-password", "Password update failed. Open the reset link again.");
  }
  withMessage("/auth/sign-in", "Password updated. You can sign in.");
}
