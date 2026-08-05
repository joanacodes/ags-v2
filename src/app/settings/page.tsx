"use client";

import { useEffect, useState } from "react";
import { Globe2, MessageSquareHeart, Palette, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { AuthStatus } from "@/components/auth/auth-status";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  LANGUAGE_LABELS,
  getDefaultStyle,
  getReadingLanguage,
  setDefaultStyle,
  setReadingLanguage,
  type ReadingLanguage,
} from "@/lib/reading-prefs";
import type { WritingStyle } from "@/types";

export default function SettingsPage() {
  const [language, setLanguage] = useState<ReadingLanguage>("en");
  const [style, setStyle] = useState<WritingStyle>("clinical");

  useEffect(() => {
    setLanguage(getReadingLanguage());
    setStyle(getDefaultStyle());
  }, []);

  return (
    <AppShell>
      <PageHeader title="Settings" crumbs={[{ label: "Workspace" }, { label: "Settings" }]} />
      <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-2xl space-y-5">
          <Card className="p-5">
            <SectionTitle icon={<UserRound size={14} />} title="Account" />
            <p className="pb-3 text-xs leading-relaxed text-ink-muted">
              Sign in to save charts and readings to your private workspace.
            </p>
            <div className="rounded-lg border border-line">
              <AuthStatus />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={<Globe2 size={14} />} title="Reading generation" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="reading-language">Output language</Label>
                <Select
                  id="reading-language"
                  value={language}
                  onChange={(event) => {
                    const value = event.target.value as ReadingLanguage;
                    setLanguage(value);
                    setReadingLanguage(value);
                  }}
                >
                  {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </Select>
                <p className="pt-1 text-xs text-ink-faint">
                  New readings and AI interpretations are written in this language.
                </p>
              </div>
              <div>
                <Label htmlFor="default-style">Default writing style</Label>
                <Select
                  id="default-style"
                  value={style}
                  onChange={(event) => {
                    const value = event.target.value as WritingStyle;
                    setStyle(value);
                    setDefaultStyle(value);
                  }}
                >
                  <option value="clinical">Clinical</option>
                  <option value="conversational">Conversational</option>
                  <option value="poetic">Poetic</option>
                </Select>
                <p className="pt-1 text-xs text-ink-faint">
                  Applied when generating readings; changeable per reading.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={<Palette size={14} />} title="Appearance" />
            <div className="rounded-lg border border-line px-1 py-1">
              <ThemeToggle variant="row" />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle icon={<MessageSquareHeart size={14} />} title="Coming next" />
            <ul className="space-y-2 text-xs leading-relaxed text-ink-muted">
              <li>
                <span className="font-medium text-ink-secondary">Readee links</span> — share a
                reading through a link so the person it describes can rate each section and
                leave comments on what is exact or off.
              </li>
              <li>
                <span className="font-medium text-ink-secondary">Temporal module</span> —
                Saturn returns, solar returns over the next six years, and evolution through
                secondary progressions.
              </li>
            </ul>
          </Card>
        </div>
      </main>
    </AppShell>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
      <span className="text-accent-hover">{icon}</span>
      {title}
    </h2>
  );
}
