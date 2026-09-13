import { PrismaClient } from "@prisma/client";

const CHANNEL = "whatsapp";
const PROVIDER = "meta";

type BackfillClient = PrismaClient;
type PhoneNumberRow = {
  id: string;
  businessId: string;
  phoneNumberId: string;
};
type ExistingConnection = {
  id: string;
  businessId: string;
  channel: string;
  externalId: string;
};

export type BackfillCollision = {
  businessId: string;
  externalId: string;
  reason: "identity_owned_by_other_business" | "invalid_external_id";
};

export type BackfillResult = {
  created: number;
  skipped: number;
  collisions: BackfillCollision[];
};

type BackfillPlan = {
  creates: PhoneNumberRow[];
  existingMappings: Array<{ phoneNumberId: string; connectionId: string }>;
  collisions: BackfillCollision[];
};

class BackfillAbortedError extends Error {
  constructor(readonly collisions: BackfillCollision[]) {
    super(reportCollisions(collisions));
  }
}

function planBackfill(
  phoneNumbers: PhoneNumberRow[],
  connections: ExistingConnection[],
): BackfillPlan {
  const connectionsByExternalId = new Map(
    connections.map((connection) => [connection.externalId, connection]),
  );
  const creates: PhoneNumberRow[] = [];
  const existingMappings: BackfillPlan["existingMappings"] = [];
  const collisions: BackfillCollision[] = [];

  for (const phoneNumber of phoneNumbers) {
    if (!phoneNumber.phoneNumberId.trim()) {
      collisions.push({
        businessId: phoneNumber.businessId,
        externalId: phoneNumber.phoneNumberId,
        reason: "invalid_external_id",
      });
      continue;
    }

    const existing = connectionsByExternalId.get(phoneNumber.phoneNumberId);
    if (!existing) {
      creates.push(phoneNumber);
      continue;
    }

    if (
      existing.businessId !== phoneNumber.businessId ||
      existing.channel !== CHANNEL
    ) {
      collisions.push({
        businessId: phoneNumber.businessId,
        externalId: phoneNumber.phoneNumberId,
        reason: "identity_owned_by_other_business",
      });
      continue;
    }

    existingMappings.push({
      phoneNumberId: phoneNumber.id,
      connectionId: existing.id,
    });
  }

  return { creates, existingMappings, collisions };
}

export function reportCollisions(collisions: BackfillCollision[]): string {
  return collisions
    .map(
      ({ businessId, externalId, reason }) =>
        `${reason}: business=${businessId}, provider=${PROVIDER}, externalId=${externalId}`,
    )
    .join("\n");
}

export async function backfillChannelConnections(
  client: BackfillClient,
): Promise<BackfillResult> {
  try {
    return await client.$transaction(async (tx) => {
      const phoneNumbers = await tx.phoneNumber.findMany({
        select: { id: true, businessId: true, phoneNumberId: true },
      });
      const connections = await tx.channelConnection.findMany({
        where: {
          provider: PROVIDER,
          externalId: {
            in: phoneNumbers.map((phoneNumber) => phoneNumber.phoneNumberId),
          },
        },
        select: { id: true, businessId: true, channel: true, externalId: true },
      });
      const plan = planBackfill(phoneNumbers, connections);

      if (plan.collisions.length > 0) {
        throw new BackfillAbortedError(plan.collisions);
      }

      const createdMappings = await Promise.all(
        plan.creates.map(async (phoneNumber) => {
          const connection = await tx.channelConnection.create({
            data: {
              businessId: phoneNumber.businessId,
              channel: CHANNEL,
              provider: PROVIDER,
              externalId: phoneNumber.phoneNumberId,
            },
          });
          return { phoneNumberId: phoneNumber.id, connectionId: connection.id };
        }),
      );

      await Promise.all(
        [...plan.existingMappings, ...createdMappings].map(
          ({ phoneNumberId, connectionId }) =>
            tx.phoneNumber.update({
              where: { id: phoneNumberId },
              data: { channelConnectionId: connectionId },
            }),
        ),
      );

      return {
        created: createdMappings.length,
        skipped: plan.existingMappings.length,
        collisions: [],
      };
    });
  } catch (error) {
    if (error instanceof BackfillAbortedError) {
      return { created: 0, skipped: 0, collisions: error.collisions };
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await backfillChannelConnections(prisma);
    if (result.collisions.length > 0) {
      console.error(reportCollisions(result.collisions));
      process.exitCode = 1;
      return;
    }
    console.log(`Created ${result.created}; skipped ${result.skipped}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("backfill-channel-connections.ts")) {
  void main();
}
