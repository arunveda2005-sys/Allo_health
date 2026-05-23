import { prisma } from "@/lib/prisma";

export async function withIdempotency(
  key: string | null,
  action: () => Promise<{ status: number; body: any }>
): Promise<{ status: number; body: any }> {
  if (!key) {
    return action();
  }

  // Clean key to prevent issues
  const cleanKey = key.trim();
  if (!cleanKey) {
    return action();
  }

  // Try to create the idempotency key record as PROCESSING
  try {
    await prisma.idempotencyKey.create({
      data: {
        key: cleanKey,
        status: "PROCESSING",
      },
    });
  } catch (err: any) {
    // Unique constraint violation (P2002) - key already exists
    if (err.code === "P2002") {
      console.log(`[Idempotency] Key ${cleanKey} already exists, checking status...`);
      // Poll until the status is COMPLETED
      let attempts = 0;
      while (attempts < 30) { // Max 3 seconds
        const existing = await prisma.idempotencyKey.findUnique({
          where: { key: cleanKey },
        });

        if (existing) {
          if (existing.status === "COMPLETED") {
            console.log(`[Idempotency] Returning cached response for key ${cleanKey}`);
            return {
              status: existing.statusCode ?? 200,
              body: JSON.parse(existing.responseBody ?? "{}"),
            };
          }
          // If it's still PROCESSING, wait and check again
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
      return {
        status: 409,
        body: { error: "Duplicate request in progress. Please try again shortly." },
      };
    }
    throw err;
  }

  // If we successfully created it, run the action
  try {
    const result = await action();
    await prisma.idempotencyKey.update({
      where: { key: cleanKey },
      data: {
        status: "COMPLETED",
        statusCode: result.status,
        responseBody: JSON.stringify(result.body),
      },
    });
    return result;
  } catch (err) {
    console.error(`[Idempotency] Action failed for key ${cleanKey}, deleting idempotency key...`, err);
    // If the action failed, we delete the idempotency key record so the client can retry
    await prisma.idempotencyKey.delete({
      where: { key: cleanKey },
    }).catch(() => {});
    throw err;
  }
}
