"use server";

/**
 * Auth server actions (adapted from the prior backend branch, restyled
 * error handling). Redirect-based flows; messages are shown by the pages.
 */
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function withMessage(path: string, message: string): never {
  redirect(`${path}?message=${encodeURIComponent(message)}`);
}

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

const NOT_CONFIGURED =
  "Persistence is not configured. Add the Supabase variables to .env.local first.";

export async function signIn(formData: FormData): Promise<void> {
  const supabase = createSupabaseServerClient();
  if (supabase === null) withMessage("/auth/sign-in", NOT_CONFIGURED);
  const email = field(formData, "email");
  const password = field(formData, "password");
  if (email === "" || password === "") {
    withMessage("/auth/sign-in", "Enter your email and password.");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error !== null) {
    const code = errorCode(error);
    if (code === "email_not_confirmed") {
      withMessage("/auth/sign-in", "Confirm your email before signing in.");
    }
    if (code === "invalid_credentials") {
      withMessage("/auth/sign-in", "The email or password is incorrect.");
    }
    withMessage("/auth/sign-in", "Sign-in could not be completed. Please try again.");
  }
  redirect("/dashboard");
}

export async function signUp(formData: FormData): Promise<void> {
  const supabase = createSupabaseServerClient();
  if (supabase === null) withMessage("/auth/sign-up", NOT_CONFIGURED);
  const email = field(formData, "email");
  const password = field(formData, "password");
  if (email === "" || password.length < 8) {
    withMessage("/auth/sign-up", "Enter an email and a password of at least 8 characters.");
  }
  const { error } = await supabase.auth.signUp({ email, password });
  if (error !== null) {
    const code = errorCode(error);
    if (code === "user_already_exists" || code === "email_exists") {
      withMessage(
        "/auth/sign-up",
        "An account already exists for this email. Try signing in instead.",
      );
    }
    withMessage("/auth/sign-up", "Sign-up could not be completed. Please try again.");
  }
  withMessage("/auth/sign-in", "Account created. Check your inbox to confirm your email.");
}

export async function signOut(): Promise<void> {
  const supabase = createSupabaseServerClient();
  if (supabase !== null) await supabase.auth.signOut();
  redirect("/dashboard");
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
