const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function runTest() {
  console.log("==========================================");
  console.log("Starting Concurrency Verification Test...");
  console.log(`Targeting: ${BASE_URL}`);
  console.log("==========================================\n");

  // 1. Fetch products to get the mouse ID and SF Hub warehouse ID
  console.log("Fetching products...");
  let res;
  try {
    res = await fetch(`${BASE_URL}/api/products`);
  } catch (err: any) {
    console.error(`Error connecting to server. Is the Next.js dev server running on ${BASE_URL}?`, err.message);
    process.exit(1);
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch products: ${res.statusText}`);
  }
  const products = await res.json();

  const mouse = products.find((p: any) => p.sku === "ALLO-MSE-003");
  if (!mouse) {
    throw new Error("Could not find wireless mouse in seeded products!");
  }

  const sfStock = mouse.stocks.find((s: any) => s.warehouseName === "San Francisco Hub");
  if (!sfStock) {
    throw new Error("Could not find San Francisco Hub stock for the mouse!");
  }

  console.log(`Found Product: ${mouse.name} (${mouse.id})`);
  console.log(`SF Hub Stock - Total: ${sfStock.total}, Reserved: ${sfStock.reserved}, Available: ${sfStock.available}`);

  if (sfStock.available !== 1) {
    console.log(`\nNOTE: Available stock is ${sfStock.available}. Testing will request 1 unit.`);
    if (sfStock.available === 0) {
      console.log("No stock available. Let's trigger a cleanup or database reset before testing.");
      console.log("Attempting to run database cleanup...");
      const cleanRes = await fetch(`${BASE_URL}/api/cron/cleanup`);
      const cleanData = await cleanRes.json();
      console.log("Cleanup response:", cleanData);
      
      // Re-fetch products
      const pRes = await fetch(`${BASE_URL}/api/products`);
      const pData = await pRes.json();
      const updatedMouse = pData.find((p: any) => p.sku === "ALLO-MSE-003");
      const updatedSfStock = updatedMouse.stocks.find((s: any) => s.warehouseName === "San Francisco Hub");
      console.log(`Updated Available Stock: ${updatedSfStock.available}`);
    }
  }

  // 2. Fire 10 concurrent requests
  console.log("\nFiring 10 concurrent reservation requests for the last unit...");
  const requests = Array.from({ length: 10 }).map(async (_, idx) => {
    try {
      const startTime = Date.now();
      const response = await fetch(`${BASE_URL}/api/reservations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Send different idempotency keys so they are processed as separate shoppers
          "Idempotency-Key": `concurrency-test-key-${idx}-${Date.now()}`,
        },
        body: JSON.stringify({
          productId: mouse.id,
          warehouseId: sfStock.warehouseId,
          quantity: 1,
        }),
      });
      const duration = Date.now() - startTime;
      const data = await response.json();
      return { status: response.status, data, duration };
    } catch (err: any) {
      return { status: 500, error: err.message, duration: 0 };
    }
  });

  const results = await Promise.all(requests);

  // 3. Count successes and 409 conflicts
  let successCount = 0;
  let conflictCount = 0;
  let otherCount = 0;

  console.log("\nResponses:");
  results.forEach((r, idx) => {
    console.log(`Request #${idx + 1}: Status ${r.status} in ${r.duration}ms. Response:`, JSON.stringify(r.data));
    if (r.status === 201) successCount++;
    else if (r.status === 409) conflictCount++;
    else otherCount++;
  });

  console.log("\n==========================================");
  console.log("--- CONCURRENCY TEST SUMMARY ---");
  console.log(`Successes (201 Created):  ${successCount} (Expected: 1)`);
  console.log(`Conflicts (409 Conflict): ${conflictCount} (Expected: 9 if exactly 1 was available)`);
  console.log(`Others (Errors):          ${otherCount} (Expected: 0)`);
  console.log("==========================================");

  if (successCount === 1) {
    console.log("✅ SUCCESS: Exactly one reservation request succeeded! Concurrency lock works perfectly.");
  } else {
    console.error("❌ FAILURE: Concurrency bug detected! Success count was " + successCount);
  }
}

runTest().catch((err) => {
  console.error("Test runner crashed:", err);
});

export {};
