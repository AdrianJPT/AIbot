import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBusinessForOwner, validateCreateBusinessInput } from "@/lib/businesses/create";
import { ownsCredentials } from "@/lib/credentials/usage";

// Invites a new client, optionally with a business: `businessId` hands over
// an existing (admin-built) business, `business` creates a new one inline,
// and with neither the client is invited bare (a business can be assigned
// later from its edit page). Order: validate everything -> send the
// Supabase invite (creates the auth user + emails the magic link) -> create
// the Prisma User row -> attach/create the business. If that last step
// fails after the invite was already sent, the client row still exists and
// the business can be assigned afterwards — that recovery path is surfaced
// in the error.
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = await req.json();
  const { email, name, business, businessId } = body as {
    email?: string;
    name?: string;
    business?: unknown;
    businessId?: string;
  };

  if (!email) {
    return NextResponse.json({ error: "Falta el email" }, { status: 400 });
  }

  const businessInput = business as Record<string, unknown> | undefined;

  if (businessId && businessInput) {
    return NextResponse.json(
      { error: "Elegí un negocio existente o creá uno nuevo, no ambos" },
      { status: 400 }
    );
  }

  let existingBusiness = null;
  if (businessId) {
    existingBusiness = await prisma.business.findUnique({ where: { id: businessId } });
    if (!existingBusiness) {
      return NextResponse.json({ error: "Negocio inválido" }, { status: 400 });
    }
  }

  if (businessInput) {
    const validationError = validateCreateBusinessInput(businessInput);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    if (businessInput.aiCredentialId || businessInput.whatsappCredentialId) {
      const owned = await ownsCredentials(admin.id, [
        businessInput.aiCredentialId as string | null | undefined,
        businessInput.whatsappCredentialId as string | null | undefined,
      ]);
      if (!owned) {
        return NextResponse.json({ error: "Credencial inválida" }, { status: 400 });
      }
    }

    // Checked before inviting (not just relying on the P2002 catch below) so
    // the most common failure — a mistyped/duplicate phoneNumberId — doesn't
    // burn a real invite email on a client that's about to get stuck without
    // a business.
    if (businessInput.phoneNumberId) {
      const duplicatePhoneNumber = await prisma.phoneNumber.findUnique({
        where: { phoneNumberId: businessInput.phoneNumberId as string },
      });
      if (duplicatePhoneNumber) {
        return NextResponse.json(
          { error: "Ese número ya está registrado en otro cliente" },
          { status: 409 }
        );
      }
    }
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: name ? { full_name: name } : undefined,
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message || "No se pudo invitar al cliente" },
      { status: 400 }
    );
  }

  let client;
  try {
    client = await prisma.user.create({
      data: {
        id: data.user.id,
        email,
        name: name || null,
        role: "client",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe un cliente con ese email" },
        { status: 409 }
      );
    }
    throw err;
  }

  try {
    if (existingBusiness) {
      await prisma.business.update({
        where: { id: existingBusiness.id },
        data: { ownerId: client.id },
      });
    } else if (businessInput) {
      await createBusinessForOwner(
        client.id,
        businessInput as Parameters<typeof createBusinessForOwner>[1]
      );
    }
  } catch (err) {
    // Whatever the cause, the invite email is already out and the client
    // row already exists — always surface a recovery path instead of a
    // bare 500, since the business can be assigned afterwards.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: `El cliente se invitó, pero no se pudo asignar el negocio (${detail}). Asignáselo desde la edición del negocio.`,
      },
      { status: 409 }
    );
  }

  return NextResponse.json(client);
}
