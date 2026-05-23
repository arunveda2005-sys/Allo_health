import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idempotencyKey = req.headers.get("Idempotency-Key");

    const result = await withIdempotency(idempotencyKey, async () => {
      const now = new Date();

      const transactionResult = await prisma.$transaction(async (tx) => {
        // Query with raw SQL to execute FOR UPDATE pessimistic lock on the reservation
        const reservations = await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "Reservation" WHERE "id" = $1 FOR UPDATE`,
          id
        );

        if (!reservations || reservations.length === 0) {
          return { status: 404, body: { error: "Reservation not found" } };
        }

        const reservation = reservations[0];

        if (reservation.status === "CONFIRMED") {
          return { status: 200, body: reservation };
        }

        if (reservation.status === "RELEASED") {
          return { status: 410, body: { error: "Reservation has expired or been cancelled" } };
        }

        if (new Date(reservation.expiresAt) < now) {
          // Mark as RELEASED and release stock
          await tx.reservation.update({
            where: { id },
            data: { status: "RELEASED" },
          });

          await tx.$executeRaw`
            UPDATE "Stock"
            SET "reserved" = GREATEST(0, "reserved" - ${reservation.quantity})
            WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
          `;

          return { status: 410, body: { error: "Reservation has expired" } };
        }

        // Confirm reservation
        const confirmedRes = await tx.reservation.update({
          where: { id },
          data: { status: "CONFIRMED" },
          include: {
            product: true,
            warehouse: true,
          }
        });

        // Permanently decrement total stock and reserved stock
        await tx.$executeRaw`
          UPDATE "Stock"
          SET "total" = GREATEST(0, "total" - ${reservation.quantity}),
              "reserved" = GREATEST(0, "reserved" - ${reservation.quantity})
          WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
        `;

        return { status: 200, body: confirmedRes };
      });

      return transactionResult;
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error: any) {
    console.error("POST /api/reservations/confirm error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
