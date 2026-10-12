/**
 * Per-user AI prompt overrides (Settings → AI prompts).
 *
 * Signed-out or unconfigured mode uses the defaults. A read failure (for
 * example the migration has not been run) is logged and also falls back to
 * the defaults, so generation keeps working; saving reports the error.
 */
import { createSupabaseServerClient, getServerUserId } from "@/lib/supabase/server";
import { mergePrompts, defaultPrompts, type PromptKey, type PromptSet } from "@/interpretation/prompts";

export const PromptsStore = {
  /** The signed-in user's saved prompt texts, keyed by prompt key. */
  async getOverrides(): Promise<{ overrides: Record<string, string>; error?: string }> {
    const supabase = createSupabaseServerClient();
    if (supabase === null) return { overrides: {} };
    const userId = await getServerUserId();
    if (userId === null) return { overrides: {} };
    const { data, error } = await supabase
      .from("prompt_overrides")
      .select("key, text")
      .eq("user_id", userId);
    if (error !== null) {
      console.error(`[prompts] could not read prompt_overrides: ${error.message}`);
      return { overrides: {}, error: error.message };
    }
    const overrides: Record<string, string> = {};
    for (const row of (data ?? []) as { key: string; text: string }[]) overrides[row.key] = row.text;
    return { overrides };
  },

  /** The prompts to send: defaults with the user's edits on top. */
  async getPrompts(): Promise<PromptSet> {
    const { overrides } = await this.getOverrides();
    return Object.keys(overrides).length === 0 ? defaultPrompts() : mergePrompts(overrides);
  },

  async save(key: PromptKey, text: string): Promise<void> {
    const supabase = createSupabaseServerClient();
    const userId = await getServerUserId();
    if (supabase === null || userId === null) throw new Error("Sign in to save your own prompts.");
    const { error } = await supabase
      .from("prompt_overrides")
      .upsert({ user_id: userId, key, text, updated_at: new Date().toISOString() });
    if (error !== null) throw new Error(`Could not save the prompt: ${error.message}`);
  },

  async reset(key: PromptKey): Promise<void> {
    const supabase = createSupabaseServerClient();
    const userId = await getServerUserId();
    if (supabase === null || userId === null) throw new Error("Sign in to reset your prompts.");
    const { error } = await supabase
      .from("prompt_overrides")
      .delete()
      .eq("user_id", userId)
      .eq("key", key);
    if (error !== null) throw new Error(`Could not reset the prompt: ${error.message}`);
  },
};
