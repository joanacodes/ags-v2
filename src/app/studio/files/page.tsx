import { Suspense } from "react";
import { Loading } from "@/components/studio/ui";
import { FilesScreen } from "./files-screen";

export const metadata = { title: "Files" };

export default function FilesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FilesScreen />
    </Suspense>
  );
}
