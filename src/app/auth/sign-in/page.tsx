import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage({
  searchParams,
}: {
  searchParams: { message?: string };
}) {
  return (
    <AuthCard
      title="Sign in"
      description="Your charts are saved to your account and only visible to you."
      message={searchParams.message}
      footer={
        <>
          No account yet?{" "}
          <Link href="/auth/sign-up" className="text-accent-hover hover:underline">
            Create one
          </Link>
          {" · "}
          <Link href="/auth/reset-password" className="text-accent-hover hover:underline">
            Forgot password
          </Link>
        </>
      }
    >
      <form action={signIn} className="space-y-4">
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
