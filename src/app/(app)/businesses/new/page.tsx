import Link from "next/link";
import { BusinessFormContainer } from "@/features/businesses/containers/business-form-container";

export default function NewBusinessPage() {
  return (
    <div>
      <Link
        href="/businesses"
        className="mb-4 inline-block text-muted-foreground hover:text-foreground"
      >
        ← Negocios
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Nuevo negocio</h1>
      <BusinessFormContainer />
    </div>
  );
}
