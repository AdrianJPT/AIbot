import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { BusinessFormContainer } from "@/features/businesses/containers/business-form-container";

// Business-first onboarding: the business starts owned by the admin (no
// client picked here) and gets handed to a client later — from its edit
// page or the invite flow.
export default async function NewBusinessPage() {
  const user = await requireAdmin();
  if (!user) redirect("/");

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
