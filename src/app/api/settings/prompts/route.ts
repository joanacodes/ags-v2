/**
 * GET    /api/settings/prompts            — every prompt: default, saved version, fixed formats
 * PUT    /api/settings/prompts {key,text} — save the user's version of one prompt
 * DELETE /api/settings/prompts?key=…      — back to the default
 */
import { NextResponse } from "next/server";
import { PromptsStore } from "@/server/prompts-store";
import {
  PROMPT_DEFINITIONS,
  PROMPT_KEYS,
  READING_OUTPUT_FORMAT,
  TEMPORAL_OUTPUT_FORMAT,
  isPromptKey,
} from "@/interpretation/prompts";

export async function GET() {
  const { overrides, error } = await PromptsStore.getOverrides();
  return NextResponse.json({
    prompts: PROMPT_KEYS.map((key) => ({
      ...PROMPT_DEFINITIONS[key],
      defaultText: PROMPT_DEFINITIONS[key].text,
      text: overrides[key] ?? PROMPT_DEFINITIONS[key].text,
      edited: overrides[key] !== undefined,
    })),
    fixedFormats: { reading: READING_OUTPUT_FORMAT, temporal: TEMPORAL_OUTPUT_FORMAT },
    storageError: error ?? null,
  });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { key?: unknown; text?: unknown };
  if (!isPromptKey(body.key) || typeof body.text !== "string" || body.text.trim().length === 0) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "A known prompt key and a non-empty text are required." } },
      { status: 400 },
    );
  }
  if (body.text.length > 20000) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Prompts are limited to 20,000 characters." } },
      { status: 400 },
    );
  }
  try {
    await PromptsStore.save(body.key, body.text);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: { code: "SAVE_FAILED", message } }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!isPromptKey(key)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_FAILED", message: "Unknown prompt key." } },
      { status: 400 },
    );
  }
  try {
    await PromptsStore.reset(key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: { code: "RESET_FAILED", message } }, { status: 400 });
  }
}
