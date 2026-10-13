import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * No sign-up while AGS is in private beta: old links land on the sign-in
 * page, which offers the "first to know" list instead.
 */
export default function SignUpPage() {
  redirect("/auth/sign-in");
}
