import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BusinessListTable } from "@/features/businesses/components/business-list-table";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export default async function BusinessesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const list = await prisma.business.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Negocios</h1>
        <Button asChild>
          <Link href="/businesses/new">Nuevo negocio</Link>
        </Button>
      </div>
      <BusinessListTable businesses={list} />
    </div>
  );
}
