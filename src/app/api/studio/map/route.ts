import { route } from "@/studio/server/api";
import { mapView } from "@/studio/views/map";

export const dynamic = "force-dynamic";
export const GET = route(async ({ ctx }) => mapView(ctx));
