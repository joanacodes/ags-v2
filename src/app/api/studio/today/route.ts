import { route } from "@/studio/server/api";
import { todayView } from "@/studio/views/today";

export const dynamic = "force-dynamic";
export const GET = route(async ({ ctx }) => todayView(ctx));
