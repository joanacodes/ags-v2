import { Suspense } from "react";
import { Loading } from "@/components/studio/ui";
import { VideoStudio } from "./video-studio";

export const metadata = { title: "Video studio" };

export default function VideoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <VideoStudio />
    </Suspense>
  );
}
