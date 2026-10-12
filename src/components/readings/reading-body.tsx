"use client";

import { Lightbulb } from "lucide-react";
import { motion } from "framer-motion";
import type { ReadingSection } from "@/types";
import { renderInline } from "@/lib/rich-text";

/** The long-form reading content: sections, pull quotes, key insights. */
export function ReadingBody({ sections }: { sections: ReadingSection[] }) {
  return (
    <div className="space-y-10">
      {sections.map((section, index) => (
        <motion.section
          key={section.id}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.35, delay: index === 0 ? 0.05 : 0, ease: "easeOut" }}
          aria-labelledby={`heading-${section.id}`}
        >
          <h2 id={`heading-${section.id}`} className="text-lg font-semibold text-ink">
            {section.heading}
          </h2>
          <div className="mt-3.5 space-y-4">
            {section.paragraphs.map((paragraph, pIndex) => (
              <p key={pIndex} className="text-[15px] leading-[1.85] text-ink-secondary">
                {renderInline(paragraph)}
              </p>
            ))}
          </div>

          {section.pullQuote && (
            <blockquote className="mt-6 border-l-2 border-accent bg-surface-raised px-6 py-5 font-serif text-[15px] italic leading-relaxed text-ink">
              &ldquo;{section.pullQuote}&rdquo;
            </blockquote>
          )}

          {section.keyInsight && (
            <aside className="mt-6 rounded-card border border-accent/40 bg-accent-soft/20 p-5">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-hover">
                <Lightbulb size={13} />
                {section.keyInsight.eyebrow}
              </p>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-secondary">
                {section.keyInsight.body}
              </p>
            </aside>
          )}
        </motion.section>
      ))}
    </div>
  );
}
