import { Suspense } from "react";
import { Loading } from "@/components/studio/ui";
import { SettingsScreen } from "./settings-screen";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SettingsScreen />
    </Suspense>
  );
}
