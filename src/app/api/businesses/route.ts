import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { businessScope } from "@/lib/scope";
import { flattenBusinessPhoneNumber } from "@/lib/business-phone-compat";
import { createBusinessForOwner, validateCreateBusinessInput } from "@/lib/businesses/create";
import { ownsCredentials } from "@/lib/credentials/usage";

// GET stays open to any authenticated caller (scoped by businessScope) — it
// also backs the client-facing business picker on /appointments/new, not
// just the admin management UI.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const list = await prisma.business.findMany({
    where: businessScope(user),
    orderBy: { name: "asc" },
    include: { phoneNumbers: true },
  });
  return NextResponse.json(list.map(flattenBusinessPhoneNumber));
}

// Creating a business (registering a client's phone number) is admin-only —
// numbers are managed from Admin > Clients > [client], never self-service.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const { ownerId } = body;

  if (!ownerId) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  const validationError = validateCreateBusinessInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!owner) {
    return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
  }

  if (body.aiCredentialId || body.whatsappCredentialId) {
    const owned = await ownsCredentials(admin.id, [
      body.aiCredentialId,
      body.whatsappCredentialId,
    ]);
    if (!owned) {
      return NextResponse.json({ error: "Credencial inválida" }, { status: 400 });
    }
  }

  try {
    const b = await createBusinessForOwner(ownerId, body);
    return NextResponse.json(flattenBusinessPhoneNumber(b));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Ese número ya está registrado en otro cliente" },
        { status: 409 }
      );
    }
    throw err;
  }
}
