import Link from "next/link";
import { signUp } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignUpPage({
  searchParams,
}: {
  searchParams: { message?: string };
}) {
  return (
    <AuthCard
      title="Create your account"
      description="Charts you create are saved privately to your workspace."
      message={searchParams.message}
      footer={
        <>
          Already registered?{" "}
          <Link href="/auth/sign-in" className="text-accent-hover hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form action={signUp} className="space-y-4">
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
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="pt-1 text-xs text-ink-faint">At least 8 characters.</p>
        </div>
        <Button type="submit" variant="primary" className="w-full">
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
