import { Suspense } from "react";
import { Loading } from "@/components/studio/ui";
import { LibraryScreen } from "./library-screen";

export const metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LibraryScreen />
    </Suspense>
  );
}
