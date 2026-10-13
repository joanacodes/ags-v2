import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { NewsletterForm } from "@/components/landing/newsletter-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage({
  searchParams,
}: {
  searchParams: { message?: string; next?: string };
}) {
  return (
    <AuthCard
      title="Sign in"
      description="AGS is in beta: only testers can sign in for now."
      message={searchParams.message}
      footer={
        <Link href="/auth/reset-password" className="text-accent-hover hover:underline">
          Forgot password
        </Link>
      }
      after={
        <Card className="mt-6 bg-surface-raised/80 p-6 backdrop-blur-md">
          <h2 className="text-sm font-semibold text-ink">I want to be the first to know</h2>
          <p className="pb-5 pt-1 text-xs leading-relaxed text-ink-muted">
            New accounts aren&apos;t open yet. Leave your first name and email: you&apos;ll hear from me as soon as
            there&apos;s news.
          </p>
          <NewsletterForm source="Sign-in page" withName />
        </Card>
      }
    >
      <form action={signIn} className="space-y-4">
        {searchParams.next !== undefined && <input type="hidden" name="next" value={searchParams.next} />}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" variant="primary" className="w-full">
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}
