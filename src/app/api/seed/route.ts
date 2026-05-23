import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    console.log("[Seed API] Seeding database...");

    // Clean existing records to avoid duplicates on re-seed
    await prisma.reservation.deleteMany();
    await prisma.stock.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.product.deleteMany();
    await prisma.idempotencyKey.deleteMany();

    // Create Warehouses
    const sf = await prisma.warehouse.create({
      data: {
        name: "San Francisco Hub",
        location: "San Francisco, CA",
      },
    });

    const ny = await prisma.warehouse.create({
      data: {
        name: "New York Depot",
        location: "Brooklyn, NY",
      },
    });

    const chi = await prisma.warehouse.create({
      data: {
        name: "Chicago Center",
        location: "Chicago, IL",
      },
    });

    // Create Products
    const mug = await prisma.product.create({
      data: {
        name: "Allo Premium Ceramic Mug",
        description: "A beautiful, minimalist matte black ceramic mug designed for developers. Ergonomic grip and keeps your coffee hot.",
        sku: "ALLO-MUG-001",
        price: 18.50,
        imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=300&auto=format&fit=crop",
      },
    });

    const hoodie = await prisma.product.create({
      data: {
        name: "Allo Developer Hoodie",
        description: "Ultra-soft cotton blend hoodie with hidden pockets and embroidered subtle branding. Perfect for long coding sessions.",
        sku: "ALLO-HD-002",
        price: 65.00,
        imageUrl: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?q=80&w=300&auto=format&fit=crop",
      },
    });

    const mouse = await prisma.product.create({
      data: {
        name: "Allo Precision Wireless Mouse",
        description: "Ergonomic vertical wireless mouse with multi-device switching and customizable shortcut keys. Smooth tracking on all surfaces.",
        sku: "ALLO-MSE-003",
        price: 89.99,
        imageUrl: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?q=80&w=300&auto=format&fit=crop",
      },
    });

    const kb = await prisma.product.create({
      data: {
        name: "Allo Mechanical Keyboard (75%)",
        description: "Hot-swappable tactile mechanical keyboard. RGB backlighting, dual-mode connectivity, and premium aluminum case.",
        sku: "ALLO-KB-004",
        price: 149.00,
        imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?q=80&w=300&auto=format&fit=crop",
      },
    });

    // Create Stocks
    await prisma.stock.createMany({
      data: [
        { productId: mug.id, warehouseId: sf.id, total: 15, reserved: 0 },
        { productId: mug.id, warehouseId: ny.id, total: 20, reserved: 0 },
        { productId: mug.id, warehouseId: chi.id, total: 0, reserved: 0 },
      ],
    });

    await prisma.stock.createMany({
      data: [
        { productId: hoodie.id, warehouseId: sf.id, total: 8, reserved: 0 },
        { productId: hoodie.id, warehouseId: ny.id, total: 12, reserved: 0 },
        { productId: hoodie.id, warehouseId: chi.id, total: 5, reserved: 0 },
      ],
    });

    await prisma.stock.createMany({
      data: [
        { productId: mouse.id, warehouseId: sf.id, total: 1, reserved: 0 }, // Critical stock
        { productId: mouse.id, warehouseId: ny.id, total: 3, reserved: 0 },
        { productId: mouse.id, warehouseId: chi.id, total: 2, reserved: 0 },
      ],
    });

    await prisma.stock.createMany({
      data: [
        { productId: kb.id, warehouseId: sf.id, total: 4, reserved: 0 },
        { productId: kb.id, warehouseId: ny.id, total: 0, reserved: 0 },
        { productId: kb.id, warehouseId: chi.id, total: 6, reserved: 0 },
      ],
    });

    console.log("[Seed API] Database seeded successfully.");

    return NextResponse.json({
      success: true,
      message: "Database re-seeded successfully!",
    });
  } catch (error: any) {
    console.error("[Seed API] Seeding error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
