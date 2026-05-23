import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanupExpiredReservations } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Run lazy expiry cleanup to ensure stock counts are accurate
    await cleanupExpiredReservations();

    // Get products with stock and warehouse info
    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    // Format the response
    const formattedProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      sku: product.sku,
      imageUrl: product.imageUrl,
      price: Number(product.price),
      stocks: product.stocks.map((stock) => ({
        warehouseId: stock.warehouseId,
        warehouseName: stock.warehouse.name,
        warehouseLocation: stock.warehouse.location,
        total: stock.total,
        reserved: stock.reserved,
        available: Math.max(0, stock.total - stock.reserved),
      })),
    }));

    return NextResponse.json(formattedProducts);
  } catch (error: any) {
    console.error("GET /api/products error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
