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

  console.log("Warehouses created.");

  // Create Products
  const mug = await prisma.product.create({
    data: {
      name: "Allo Sexual Wellness Kit",
      description: "A comprehensive, expert-curated wellness kit for intimate care, containing daily health guides and premium supplements.",
      sku: "ALLO-HLTH-001",
      price: 29.99,
      imageUrl: "https://images.unsplash.com/photo-1611078489935-0cb964de46d6?q=80&w=300&auto=format&fit=crop",
    },
  });

  const hoodie = await prisma.product.create({
    data: {
      name: "Allo Daily Vitality Supplement",
      description: "Scientifically formulated daily natural supplements targeting energy boost, stress reduction, and hormonal balance.",
      sku: "ALLO-HLTH-002",
      price: 45.00,
      imageUrl: "https://images.unsplash.com/photo-1584017911766-d451b3d0e843?q=80&w=300&auto=format&fit=crop",
    },
  });

  const mouse = await prisma.product.create({
    data: {
      name: "Allo At-Home Diagnostic Kit",
      description: "Confidential, lab-verified health screening kit with pre-paid home pickup and secure digital results in 24 hours.",
      sku: "ALLO-HLTH-003",
      price: 89.99,
      imageUrl: "https://images.unsplash.com/photo-1603398938378-e54eab446dde?q=80&w=300&auto=format&fit=crop",
    },
  });

  const kb = await prisma.product.create({
    data: {
      name: "Allo Digital Therapy Journal",
      description: "A structured wellness and mindfulness companion containing cognitive prompts and clinician-designed progress trackers.",
      sku: "ALLO-HLTH-004",
      price: 14.99,
      imageUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?q=80&w=300&auto=format&fit=crop",
    },
  });

  console.log("Products created.");

  // Create Stocks
  // Mug stocks
  await prisma.stock.createMany({
    data: [
      { productId: mug.id, warehouseId: sf.id, total: 15, reserved: 0 },
      { productId: mug.id, warehouseId: ny.id, total: 20, reserved: 0 },
      { productId: mug.id, warehouseId: chi.id, total: 0, reserved: 0 }, // Out of stock
    ],
  });

  // Hoodie stocks
  await prisma.stock.createMany({
    data: [
      { productId: hoodie.id, warehouseId: sf.id, total: 8, reserved: 0 },
      { productId: hoodie.id, warehouseId: ny.id, total: 12, reserved: 0 },
      { productId: hoodie.id, warehouseId: chi.id, total: 5, reserved: 0 },
    ],
  });

  // Mouse stocks
  await prisma.stock.createMany({
    data: [
      { productId: mouse.id, warehouseId: sf.id, total: 1, reserved: 0 }, // Critical stock: test concurrency!
      { productId: mouse.id, warehouseId: ny.id, total: 3, reserved: 0 },
      { productId: mouse.id, warehouseId: chi.id, total: 2, reserved: 0 },
    ],
  });

  // Keyboard stocks
  await prisma.stock.createMany({
    data: [
      { productId: kb.id, warehouseId: sf.id, total: 4, reserved: 0 },
      { productId: kb.id, warehouseId: ny.id, total: 0, reserved: 0 }, // Out of stock
      { productId: kb.id, warehouseId: chi.id, total: 6, reserved: 0 },
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
