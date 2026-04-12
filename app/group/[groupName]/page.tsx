import { notFound } from "next/navigation";
import { GroupDashboardBootstrap } from "@/components/group-dashboard-bootstrap";
import { getAvailableGroups } from "@/lib/core/group-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface GroupPageProps {
  params: Promise<{ groupName: string }>;
}

export async function generateMetadata({ params }: GroupPageProps) {
  const { groupName } = await params;
  const name = decodeURIComponent(groupName);
  return {
    title: `${name} — Check CX`,
    description: `Service availability for ${name}`,
  };
}

export default async function GroupPage({ params }: GroupPageProps) {
  const { groupName } = await params;
  const name = decodeURIComponent(groupName);

  const available = await getAvailableGroups();
  if (!available.includes(name)) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">
        <GroupDashboardBootstrap groupName={name} />
      </div>
    </div>
  );
}
