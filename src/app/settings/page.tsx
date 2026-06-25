import { redirect } from "next/navigation";
import { SettingsScreen } from "@/components/settings/settings-screen";
import { adminEmail, currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Section = "connections" | "security" | "activity";

function resolveSection(value: string | string[] | undefined): Section {
  if (value === "security" || value === "activity") {
    return value;
  }
  return "connections";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const session = await currentSession();
  if (!session) {
    redirect("/login");
  }

  const { section } = await searchParams;

  return (
    <SettingsScreen
      email={adminEmail()}
      expiresAt={session.expiresAt}
      initialSection={resolveSection(section)}
    />
  );
}
