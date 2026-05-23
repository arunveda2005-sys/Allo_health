const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function runTest() {
  console.log("==========================================");
  console.log("Starting Idempotency Verification Test...");
  console.log(`Targeting: ${BASE_URL}`);
  console.log("==========================================\n");

  // 1. Fetch products
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

  const hoodie = products.find((p: any) => p.sku === "ALLO-HD-002");
  if (!hoodie) {
    throw new Error("Could not find developer hoodie in seeded products!");
  }

  const nyStock = hoodie.stocks.find((s: any) => s.warehouseName === "New York Depot");
  if (!nyStock) {
    throw new Error("Could not find New York Depot stock for the hoodie!");
  }

  console.log(`Found Product: ${hoodie.name} (${hoodie.id})`);
  console.log(`NY Depot Stock - Total: ${nyStock.total}, Reserved: ${nyStock.reserved}, Available: ${nyStock.available}`);

  // Generate a random key
  const idempotencyKey = `idemp-test-key-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
  console.log(`Using Idempotency-Key: ${idempotencyKey}`);

  // 2. Fire two reservation requests simultaneously
  console.log("\nFiring two reservation requests simultaneously...");
  const body = {
    productId: hoodie.id,
    warehouseId: nyStock.warehouseId,
    quantity: 1,
  };

  const req1 = fetch(`${BASE_URL}/api/reservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const req2 = fetch(`${BASE_URL}/api/reservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const [res1, res2] = await Promise.all([req1, req2]);
  const data1 = await res1.json();
  const data2 = await res2.json();

  console.log(`Request 1 Response: Status ${res1.status}, Body:`, JSON.stringify(data1));
  console.log(`Request 2 Response: Status ${res2.status}, Body:`, JSON.stringify(data2));

  if (res1.status !== res2.status) {
    console.error("❌ FAILURE: Status codes do not match!");
  } else if (data1.id !== data2.id) {
    console.error("❌ FAILURE: Returned reservation IDs do not match!");
  } else {
    console.log("✅ SUCCESS: Simultaneous requests returned identical responses and created only one reservation!");
  }

  // 3. Fire a third request with a delay (checking caching)
  console.log("\nFiring a third request after 1 second with the same key...");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  const res3 = await fetch(`${BASE_URL}/api/reservations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const data3 = await res3.json();
  console.log(`Request 3 Response: Status ${res3.status}, Body:`, JSON.stringify(data3));

  if (res3.status === res1.status && data3.id === data1.id) {
    console.log("✅ SUCCESS: Delayed request returned cached response perfectly!");
  } else {
    console.error("❌ FAILURE: Delayed request did not return cached response!");
  }

  const reservationId = data1.id;
  if (!reservationId) {
    console.error("No reservation ID returned. Cannot test confirm endpoint.");
    return;
  }

  // 4. Test confirm idempotency
  const confirmKey = `confirm-test-key-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
  console.log(`\nTesting Confirm Idempotency with key: ${confirmKey}`);
  
  console.log("Firing two confirm requests simultaneously...");
  const creq1 = fetch(`${BASE_URL}/api/reservations/${reservationId}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": confirmKey,
    },
  });

  const creq2 = fetch(`${BASE_URL}/api/reservations/${reservationId}/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": confirmKey,
    },
  });

  const [cres1, cres2] = await Promise.all([creq1, creq2]);
  const cdata1 = await cres1.json();
  const cdata2 = await cres2.json();

  console.log(`Confirm 1 Response: Status ${cres1.status}, Body:`, JSON.stringify(cdata1));
  console.log(`Confirm 2 Response: Status ${cres2.status}, Body:`, JSON.stringify(cdata2));

  if (cres1.status !== cres2.status) {
    console.error("❌ FAILURE: Confirm status codes do not match!");
  } else if (cdata1.status !== cdata2.status) {
    console.error("❌ FAILURE: Confirm reservation statuses do not match!");
  } else {
    console.log("✅ SUCCESS: Confirm idempotency works perfectly!");
  }
}

runTest().catch((err) => {
  console.error("Test runner crashed:", err);
});

export {};
