import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { message?: string };
}) {
  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to choose a new password."
      message={searchParams.message}
      footer={
        <Link href="/auth/sign-in" className="text-accent-hover hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form action={requestPasswordReset} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <Button type="submit" variant="primary" className="w-full">
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
