import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";
import { cleanupExpiredReservations } from "@/lib/reservations";

const reserveSchema = z.object({
  productId: z.string().uuid("Invalid product ID format"),
  warehouseId: z.string().uuid("Invalid warehouse ID format"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
});

export async function POST(req: NextRequest) {
  try {
    const idempotencyKey = req.headers.get("Idempotency-Key");
    
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // Validate body
    const validationResult = reserveSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid request data", details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = validationResult.data;

    // Run the reservation action through the idempotency wrapper
    const result = await withIdempotency(idempotencyKey, async () => {
      // 1. Run lazy expiry cleanup first to reclaim stock before checking
      await cleanupExpiredReservations();

      // 2. Perform the atomic update inside a transaction
      const reservation = await prisma.$transaction(async (tx) => {
        // Run update query. Only update if total - reserved >= quantity
        const affected = await tx.$executeRaw`
          UPDATE "Stock"
          SET "reserved" = "reserved" + ${quantity}
          WHERE "productId" = ${productId}
            AND "warehouseId" = ${warehouseId}
            AND ("total" - "reserved") >= ${quantity}
        `;

        if (affected === 0) {
          return null; // Not enough stock
        }

        // Create reservation
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        const res = await tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt,
          },
          include: {
            product: true,
            warehouse: true,
          }
        });

        return res;
      });

      if (!reservation) {
        return {
          status: 409,
          body: { error: "Insufficient stock available at this warehouse" },
        };
      }

      return {
        status: 201,
        body: reservation,
      };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error: any) {
    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
