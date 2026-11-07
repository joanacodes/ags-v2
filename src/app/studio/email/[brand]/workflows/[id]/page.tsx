import { notFound } from "next/navigation";
import { isBrand } from "@/studio/email/model";
import { WorkflowBuilder } from "./workflow-builder";

export const metadata = { title: "Email workflow" };

export default function WorkflowPage({ params }: { params: { brand: string; id: string } }) {
  if (!isBrand(params.brand)) notFound();
  return <WorkflowBuilder brand={params.brand} id={params.id} />;
}
