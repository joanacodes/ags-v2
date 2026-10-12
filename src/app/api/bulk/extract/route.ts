/**
 * POST /api/bulk/extract — read birth data from several photos and
 * spreadsheet/text files at once, so a person whose data is spread over
 * several screenshots comes back as one entry.
 *   { files: [
 *       { kind: "image", fileName: "IMG_1.jpg", mediaType: "image/jpeg", data: "<base64>" },
 *       { kind: "text", fileName: "clients.csv", text: "…" } ] }
 * → { people: ExtractedPerson[] }
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

export const maxDuration = 120;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BASE64 = 7_000_000; // ~5 MB image
const MAX_TOTAL_BASE64 = 24_000_000; // stays under the API's 32 MB request limit
const MAX_TEXT = 200_000;
const MAX_FILES = 20;

type FileBody =
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
  const body = (await request.json().catch(() => null)) as { files?: FileBody[] } | FileBody | null;
  if (body === null) return badRequest("Invalid request.");
  const files: FileBody[] = "files" in body && Array.isArray(body.files) ? body.files : [body as FileBody];
  if (files.length === 0) return badRequest("No files.");
  if (files.length > MAX_FILES) return badRequest(`At most ${MAX_FILES} files at once.`);

  const content: unknown[] = [];
  let totalImage = 0;
  for (const [index, file] of files.entries()) {
    const name = (file.fileName ?? "").trim() || `file-${index + 1}`;
    if (file.kind === "image") {
      if (typeof file.data !== "string" || file.data.length === 0) return badRequest(`${name}: missing image.`);
      if (file.data.length > MAX_IMAGE_BASE64) return badRequest(`${name}: image too large (max ~5 MB).`);
      totalImage += file.data.length;
      const mediaType = IMAGE_TYPES.includes(file.mediaType ?? "") ? file.mediaType : "image/jpeg";
      content.push(
        { type: "text", text: `File: ${name}` },
        { type: "image", source: { type: "base64", media_type: mediaType, data: file.data } },
      );
    } else if (file.kind === "text") {
      if (typeof file.text !== "string" || file.text.trim().length === 0) continue;
      content.push({
        type: "text",
        text: `File: ${name}\n<file>\n${file.text.slice(0, MAX_TEXT)}\n</file>`,
      });
    } else {
      return badRequest(`${name}: unknown kind.`);
    }
  }
  if (totalImage > MAX_TOTAL_BASE64) return badRequest("Too many large images at once: send fewer.");
  if (content.length === 0) return badRequest("The files are empty.");
  content.push({
    type: "text",
    text:
      files.length > 1
        ? `These ${files.length} files arrived together. Extract the birth data, one entry per person, combining a person's data across files.`
        : "Extract the birth data.",
  });

  const allowFallback = allowFallbackFrom(request);
  const prompts = await PromptsStore.getPrompts();
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: anthropicHeaders(apiKey, allowFallback),
      body: JSON.stringify({
        model: DEFAULT_AI_MODEL,
        max_tokens: 12000,
        system: prompts["bulk.extract"],
        output_config: { effort: "medium", format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
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
