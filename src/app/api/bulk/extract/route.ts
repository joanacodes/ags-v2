/**
 * POST /api/bulk/extract — read birth data from one photo or one
 * spreadsheet/text file with the AI.
 *   { kind: "image", mediaType: "image/jpeg", data: "<base64>" }
 *   { kind: "text", fileName: "clients.csv", text: "…" }
 * → { people: ExtractedPerson[] }
 * One file per request: the page sends them one after another.
 */
import { NextResponse } from "next/server";
import {
  DEFAULT_AI_MODEL,
  allowFallbackFrom,
  anthropicHeaders,
  readMessagesResponse,
} from "@/interpretation/ai-models";
import { EXTRACTION_SCHEMA, parseExtraction } from "@/bulk/extracted";
import { PromptsStore } from "@/server/prompts-store";

export const maxDuration = 60;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BASE64 = 7_000_000; // ~5 MB image
const MAX_TEXT = 200_000;

type Body =
  | { kind: "image"; mediaType?: string; data?: string; fileName?: string }
  | { kind: "text"; text?: string; fileName?: string };

function badRequest(message: string) {
  return NextResponse.json({ error: { code: "VALIDATION_FAILED", message } }, { status: 400 });
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    return NextResponse.json(
      { error: { code: "AI_NOT_CONFIGURED", message: "No ANTHROPIC_API_KEY configured on the server." } },
      { status: 503 },
    );
  }
  const body = (await request.json().catch(() => null)) as Body | null;
  if (body === null) return badRequest("Invalid request.");

  let content: unknown[];
  if (body.kind === "image") {
    if (typeof body.data !== "string" || body.data.length === 0) return badRequest("Missing image.");
    if (body.data.length > MAX_IMAGE_BASE64) return badRequest("Image too large (max ~5 MB).");
    const mediaType = IMAGE_TYPES.includes(body.mediaType ?? "") ? body.mediaType : "image/jpeg";
    content = [
      { type: "image", source: { type: "base64", media_type: mediaType, data: body.data } },
      { type: "text", text: `File: ${body.fileName ?? "photo"}. Extract the birth data.` },
    ];
  } else if (body.kind === "text") {
    if (typeof body.text !== "string" || body.text.trim().length === 0) return badRequest("Empty file.");
    content = [
      {
        type: "text",
        text: `File: ${body.fileName ?? "data.txt"}\n\n<file>\n${body.text.slice(0, MAX_TEXT)}\n</file>\n\nExtract the birth data.`,
      },
    ];
  } else {
    return badRequest("Unknown kind.");
  }

  const allowFallback = allowFallbackFrom(request);
  const prompts = await PromptsStore.getPrompts();
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders(apiKey, allowFallback),
      body: JSON.stringify({
        model: DEFAULT_AI_MODEL,
        max_tokens: 8000,
        system: prompts["bulk.extract"],
        output_config: { effort: "low", format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
        ...(allowFallback ? { fallbacks: "default" } : {}),
        messages: [{ role: "user", content }],
      }),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: { code: "AI_PROVIDER_ERROR", message: `Anthropic API ${response.status}: ${(await response.text()).slice(0, 200)}` } },
        { status: 502 },
      );
    }
    const result = readMessagesResponse(await response.json(), DEFAULT_AI_MODEL);
    if (!result.ok) {
      return NextResponse.json(
        { error: { code: result.refused ? "AI_REFUSED" : "AI_PROVIDER_ERROR", message: result.message } },
        { status: result.refused ? 422 : 502 },
      );
    }
    return NextResponse.json({ people: parseExtraction(result.text) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: { code: "EXTRACT_FAILED", message } }, { status: 500 });
  }
}
