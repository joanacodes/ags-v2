import React from "react";

/**
 * Minimal inline formatting for report paragraphs:
 *   **bold**   _italic_   ==highlight==
 * Deterministic, safe (no HTML injection — pure text parsing).
 */
export function renderInline(text: string): React.ReactNode[] {
  const pattern = /(\*\*.+?\*\*|==.+?==|_[^_\s][^_]*_)/g;
  const parts = text.split(pattern);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("==") && part.endsWith("==")) {
      return (
        <mark key={index} className="rounded-sm bg-warning-soft px-0.5 text-ink">
          {part.slice(2, -2)}
        </mark>
      );
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}
