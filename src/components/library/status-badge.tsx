import type { ChartStatus } from "@/types";
import { Badge, StatusDot } from "@/components/ui/badge";

const STATUS_LABELS: Record<ChartStatus, string> = {
  active: "Active",
  processing: "Processing",
  failed: "Failed",
  archived: "Archived",
};

export function StatusBadge({ status }: { status: ChartStatus }) {
  const tone =
    status === "active" ? "success"
    : status === "processing" ? "warning"
    : status === "failed" ? "warning"
    : "muted";
  return (
    <Badge tone={tone}>
      {status !== "archived" && <StatusDot />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}
