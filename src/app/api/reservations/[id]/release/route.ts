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
      const transactionResult = await prisma.$transaction(async (tx) => {
        // Query with FOR UPDATE pessimistic lock
        const reservations = await tx.$queryRawUnsafe<any[]>(
          `SELECT * FROM "Reservation" WHERE "id" = $1 FOR UPDATE`,
          id
        );

        if (!reservations || reservations.length === 0) {
          return { status: 404, body: { error: "Reservation not found" } };
        }

        const reservation = reservations[0];

        if (reservation.status === "RELEASED") {
          return { status: 200, body: reservation };
        }

        if (reservation.status === "CONFIRMED") {
          return { status: 400, body: { error: "Cannot release a confirmed reservation" } };
        }

        // Mark as RELEASED
        const releasedRes = await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
          include: {
            product: true,
            warehouse: true,
          }
        });

        // Revert reserved stock
        await tx.$executeRaw`
          UPDATE "Stock"
          SET "reserved" = GREATEST(0, "reserved" - ${reservation.quantity})
          WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
        `;

        return { status: 200, body: releasedRes };
      });

      return transactionResult;
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error: any) {
    console.error("POST /api/reservations/release error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
