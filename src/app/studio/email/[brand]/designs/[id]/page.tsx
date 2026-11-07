import { notFound } from "next/navigation";
import { isBrand } from "@/studio/email/model";
import { Designer } from "./designer";

export const metadata = { title: "Email design" };

export default function DesignPage({ params }: { params: { brand: string; id: string } }) {
  if (!isBrand(params.brand)) notFound();
  return <Designer brand={params.brand} id={params.id} />;
}
