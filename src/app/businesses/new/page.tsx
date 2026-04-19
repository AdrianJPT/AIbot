import { BusinessForm } from "@/components/business-form";
import Link from "next/link";

export default function NewBusinessPage() {
  return (
    <div>
      <Link href="/businesses" className="mb-4 inline-block text-slate-400 hover:text-white">
        ← Negocios
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-white">Nuevo negocio</h1>
      <BusinessForm />
    </div>
  );
}
