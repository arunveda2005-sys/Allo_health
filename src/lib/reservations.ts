import { prisma } from "@/lib/prisma";

/**
 * Sweeps the database for expired pending reservations, marks them as RELEASED,
 * and returns their reserved stock levels back to the available pool.
 */
export async function cleanupExpiredReservations(): Promise<number> {
  const now = new Date();

  // Find all expired reservations that are still PENDING
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
  });

  if (expired.length === 0) return 0;

  console.log(`[Expiry] Found ${expired.length} expired reservations to clean up.`);

  let cleanedCount = 0;

  // Process them inside individual transactions to avoid broad locking
  for (const res of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        // Re-fetch and check status to avoid double-processing
        const current = await tx.reservation.findUnique({
          where: { id: res.id },
        });

        if (current && current.status === "PENDING") {
          // Update status to RELEASED
          await tx.reservation.update({
            where: { id: res.id },
            data: { status: "RELEASED" },
          });

          // Revert reserved stock level
          await tx.$executeRaw`
            UPDATE "Stock"
            SET "reserved" = GREATEST(0, "reserved" - ${res.quantity})
            WHERE "productId" = ${res.productId} AND "warehouseId" = ${res.warehouseId}
          `;
          
          cleanedCount++;
          console.log(`[Expiry] Successfully reclaimed ${res.quantity} units from reservation ${res.id}`);
        }
      });
    } catch (err) {
      console.error(`[Expiry] Error cleaning up reservation ${res.id}:`, err);
    }
  }

  return cleanedCount;
}
