import Link from "next/link";
import { notFound } from "next/navigation";
import { BusinessForm } from "@/components/business-form";
import { prisma } from "@/lib/db";

export default async function EditBusinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) notFound();

  return (
    <div>
      <Link href="/businesses" className="mb-4 inline-block text-slate-400 hover:text-white">
        ← Negocios
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-white">Editar negocio</h1>
      <BusinessForm business={business} />
    </div>
  );
}
