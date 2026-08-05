import { updatePassword } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: { message?: string };
}) {
  return (
    <AuthCard
      title="Choose a new password"
      description="You arrived here from a reset link — set your new password below."
      message={searchParams.message}
      footer={<span>AGS keeps your charts private to your account.</span>}
    >
      <form action={updatePassword} className="space-y-4">
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <Button type="submit" variant="primary" className="w-full">
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
