import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { businessScope } from "@/lib/scope";
import { ensureWhatsappCredential } from "@/lib/whatsapp";
import { ownsCredentials } from "@/lib/credentials/usage";

// GET stays open to any authenticated caller with access to the business
// (scoped by businessScope) — a client needs this to see their own numbers.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const business = await prisma.business.findFirst({
    where: { id, ...businessScope(user) },
    include: { phoneNumbers: { orderBy: { createdAt: "asc" } } },
  });
  if (!business) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json(business.phoneNumbers);
}

// Adding a number to an existing business is admin-only, same as creating
// the business itself.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { id } = await params;
  const business = await prisma.business.findFirst({ where: { id } });
  if (!business) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const { phoneNumberId, displayPhone, whatsappToken, whatsappCredentialId, isActive } = body;

  if (!phoneNumberId) {
    return NextResponse.json({ error: "Falta el ID técnico del número" }, { status: 400 });
  }

  if (whatsappCredentialId) {
    const owned = await ownsCredentials(admin.id, [whatsappCredentialId]);
    if (!owned) {
      return NextResponse.json({ error: "Credencial inválida" }, { status: 400 });
    }
  }

  const resolvedWhatsappCredentialId =
    whatsappCredentialId ||
    (whatsappToken
      ? await ensureWhatsappCredential(business.ownerId, `WhatsApp (${business.name})`, whatsappToken)
      : null);

  try {
    const phoneNumber = await prisma.phoneNumber.create({
      data: {
        businessId: id,
        phoneNumberId,
        displayPhone: displayPhone || null,
        whatsappCredentialId: resolvedWhatsappCredentialId,
        isActive: isActive !== false,
      },
    });
    return NextResponse.json(phoneNumber);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Ese número ya está registrado en otro negocio" },
        { status: 409 }
      );
    }
    throw err;
  }
}
