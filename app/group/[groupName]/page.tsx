import {notFound} from "next/navigation";
import Link from "next/link";
import {ChevronLeft} from "lucide-react";
import {Button} from "@/components/ui/button";

import {GroupDashboardBootstrap} from "@/components/group-dashboard-bootstrap";
import {getAvailableGroups} from "@/lib/core/group-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface GroupPageProps {
  params: Promise<{ groupName: string }>;
}

export async function generateMetadata({ params }: GroupPageProps) {
  const { groupName } = await params;
  const decodedGroupName = decodeURIComponent(groupName);

  return {
    title: `${decodedGroupName} - 模型健康面板`,
    description: `查看 ${decodedGroupName} 分组下的模型健康状态`,
  };
}

export default async function GroupPage({ params }: GroupPageProps) {
  const { groupName } = await params;
  const decodedGroupName = decodeURIComponent(groupName);

  const availableGroups = await getAvailableGroups();
  if (!availableGroups.includes(decodedGroupName)) {
    notFound();
  }

  return (
    <div className="min-h-screen py-8 md:py-16">
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 sm:gap-8 sm:px-6 lg:px-12">
        <Button variant="ghost" size="sm" asChild className="w-fit rounded-full border border-border/40 bg-background/60 backdrop-blur-sm">
          <Link href="/">
            <ChevronLeft className="h-4 w-4" />
            返回首页
          </Link>
        </Button>

        <GroupDashboardBootstrap groupName={decodedGroupName} />
      </main>
    </div>
  );
}
