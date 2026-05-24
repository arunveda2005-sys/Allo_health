import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Clean existing records to avoid duplicates on re-seed
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.product.deleteMany();
  await prisma.idempotencyKey.deleteMany();

  // Create Warehouses
  const blr = await prisma.warehouse.create({
    data: {
      name: "Indiranagar Fulfillment Hub",
      location: "Bangalore, KA",
    },
  });

  const hyd = await prisma.warehouse.create({
    data: {
      name: "Banjara Hills Dispatch Centre",
      location: "Hyderabad, TS",
    },
  });

  const mum = await prisma.warehouse.create({
    data: {
      name: "Borivali Fulfillment Centre",
      location: "Mumbai, MH",
    },
  });

  console.log("Warehouses created.");

  // Create Products
  const eroxon = await prisma.product.create({
    data: {
      name: "Eroxon Topical Gel (ED)",
      description: "Fast-acting topical gel treatment for erectile dysfunction. Clinically proven to help achieve an erection within 10 minutes.",
      sku: "ALO-001",
      price: 999.00,
      imageUrl: "https://images.unsplash.com/photo-1550572017-edd951b55104?q=80&w=300&auto=format&fit=crop",
    },
  });

  const testKit = await prisma.product.create({
    data: {
      name: "Testosterone Test Kit (Home)",
      description: "Easy-to-use, lab-verified home blood collection kit measuring total testosterone levels with secure, discreet digital results.",
      sku: "ALO-002",
      price: 1499.00,
      imageUrl: "https://images.unsplash.com/photo-1619014029026-b1fd7551aa12?q=80&w=300&auto=format&fit=crop",
    },
  });

  const tadalafil = await prisma.product.create({
    data: {
      name: "Tadalafil 10mg Strip (10 tabs)",
      description: "Prescription ED medication strip. Helps increase blood flow to specific areas for sustained performance and treatment.",
      sku: "ALO-003",
      price: 799.00,
      imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=300&auto=format&fit=crop",
    },
  });

  const dapoxetine = await prisma.product.create({
    data: {
      name: "Dapoxetine 30mg Strip (PE)",
      description: "Clinically approved PE medication strip designed to improve control and prolong performance significantly.",
      sku: "ALO-004",
      price: 649.00,
      imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=300&auto=format&fit=crop",
    },
  });

  const libidoBoost = await prisma.product.create({
    data: {
      name: "Libido Boost Supplement",
      description: "Daily natural wellness supplement targeting stress reduction, stamina improvement, and hormonal vitality.",
      sku: "ALO-005",
      price: 1199.00,
      imageUrl: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?q=80&w=300&auto=format&fit=crop",
    },
  });

  console.log("Products created.");

  // Create Stocks
  // Eroxon stocks
  await prisma.stock.createMany({
    data: [
      { productId: eroxon.id, warehouseId: blr.id, total: 15, reserved: 0 },
      { productId: eroxon.id, warehouseId: hyd.id, total: 10, reserved: 0 },
      { productId: eroxon.id, warehouseId: mum.id, total: 8, reserved: 0 },
    ],
  });

  // Testosterone Kit stocks
  await prisma.stock.createMany({
    data: [
      { productId: testKit.id, warehouseId: blr.id, total: 5, reserved: 0 },
      { productId: testKit.id, warehouseId: hyd.id, total: 8, reserved: 0 },
      { productId: testKit.id, warehouseId: mum.id, total: 3, reserved: 0 },
    ],
  });

  // Tadalafil stocks
  await prisma.stock.createMany({
    data: [
      { productId: tadalafil.id, warehouseId: blr.id, total: 4, reserved: 0 },
      { productId: tadalafil.id, warehouseId: hyd.id, total: 3, reserved: 0 },
      { productId: tadalafil.id, warehouseId: mum.id, total: 1, reserved: 0 }, // Critical stock at Mumbai clinic for concurrency race condition testing!
    ],
  });

  // Dapoxetine stocks
  await prisma.stock.createMany({
    data: [
      { productId: dapoxetine.id, warehouseId: blr.id, total: 8, reserved: 0 },
      { productId: dapoxetine.id, warehouseId: hyd.id, total: 0, reserved: 0 }, // Out of stock
      { productId: dapoxetine.id, warehouseId: mum.id, total: 6, reserved: 0 },
    ],
  });

  // Libido Boost stocks
  await prisma.stock.createMany({
    data: [
      { productId: libidoBoost.id, warehouseId: blr.id, total: 12, reserved: 0 },
      { productId: libidoBoost.id, warehouseId: hyd.id, total: 15, reserved: 0 },
      { productId: libidoBoost.id, warehouseId: mum.id, total: 10, reserved: 0 },
    ],
  });

  console.log("Stock levels seeded.");
  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
