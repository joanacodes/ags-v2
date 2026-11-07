import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/studio/ui";
import { isBrand } from "@/studio/email/model";
import { EmailHome } from "./email-home";

export const metadata = { title: "Email" };

export default function EmailPage({ params }: { params: { brand: string } }) {
  if (!isBrand(params.brand)) notFound();
  return (
    <Suspense fallback={<Loading />}>
      <EmailHome brand={params.brand} />
    </Suspense>
  );
}
