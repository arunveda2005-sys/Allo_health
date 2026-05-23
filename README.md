# Allo Inventory & Order-Fulfillment Platform (Take-Home)

- **Live Production URL**: [https://allo-health-arun.vercel.app](https://allo-health-arun.vercel.app)
- **GitHub Repository**: [https://github.com/arunveda2005-sys/Allo_health](https://github.com/arunveda2005-sys/Allo_health)

Allo is a multi-warehouse retail and D2C inventory platform that resolves check-out race conditions using temporary reservations (holds) to avoid double-allocation, without tanking conversion rates on abandoned carts.

This repository contains a **Next.js (App Router)** implementation using **Prisma + PostgreSQL** with database-enforced concurrency control, lazy-reclamation expiration sweep, client idempotency caching, and an interactive admin dashboard.

---

## 🚀 How to Run the App Locally

### 1. Prerequisites
- **Node.js**: v18+ (tested on Next.js 16/React 19)
- **Hosted PostgreSQL**: A database URL from Neon, Supabase, Railway, etc.

### 2. Environment Setup
Create a `.env` file in the root of the project:
```env
# Your hosted PostgreSQL database connection string
DATABASE_URL="postgresql://user:password@hostname:port/dbname?sslmode=require"

# Base URL of the application (default for Next dev server)
BASE_URL="http://localhost:3000"
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup & Migrations
Synchronize the PostgreSQL database schema with Prisma:
```bash
npx prisma db push
```

### 5. Seed Initial Mock Data
Populate the database with test warehouses, products, and stock levels:
```bash
npm run seed
```
*Note: This seeds a critical stock level of `1 available unit` for the "Allo Precision Wireless Mouse" at the "San Francisco Hub" to make concurrency testing straightforward.*

### 6. Run the Dev Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚡ Concurrency Safety (Race-Condition Free)

### The Problem
If two customers checkout the last physical unit of a SKU simultaneously, a naive check-then-save sequence allows both checkouts to succeed, resulting in an oversold unit and bad operational overhead.

### The Solution
We perform stock deduction atomically at the database level inside a transaction:
```sql
UPDATE "Stock"
SET "reserved" = "reserved" + :quantity
WHERE "productId" = :productId
  AND "warehouseId" = :warehouseId
  AND ("total" - "reserved") >= :quantity;
```
- In PostgreSQL, executing an `UPDATE` on a specific row acquires a row-level lock. Concurrent updates to the same row are executed sequentially.
- If the first update succeeds, `reserved` stock is incremented. The database returns `1` affected row.
- The second update is processed next. It evaluates the condition `("total" - "reserved") >= :quantity`. Since `reserved` is now equal to `total`, this evaluates to false, updating `0` rows.
- If `1` row is affected, we create the `Reservation` and commit. If `0` rows are affected, we rollback and immediately return `409 Conflict`.
- This ensures 100% race-condition-free reservations under extreme concurrency.

---

## ⏳ Expiry & Reclamation Mechanism

Reservations hold stock for a 10-minute window. If payment fails or is abandoned, stock must be returned to the available pool.

### How it works in Production
1. **Lazy Reclamation (Primary)**:
   Any query to read products (`GET /api/products`) or write reservations (`POST /api/reservations`) calls `cleanupExpiredReservations()`. This runs a quick, non-blocking transactional cleanup sweep for expired pending reservations:
   - Sets reservation status to `RELEASED`.
   - Decrements `reserved` stock:
     ```sql
     UPDATE "Stock" SET "reserved" = GREATEST(0, "reserved" - :quantity) ...
     ```
   - This guarantees that available stock levels are always 100% up-to-date before checkout decisions.
2. **Periodic Sweep (Cron)**:
   The app exposes `POST /api/cron/cleanup`. In production, a Vercel Cron or GitHub Action can poll this endpoint periodically (e.g. every minute) to sweep abandoned carts and keep the inventory active.

---

## 🔑 Idempotency Implementation (Bonus)

Idempotence is supported on the reserve (`POST /api/reservations`) and confirm (`POST /api/reservations/:id/confirm`) endpoints via the `Idempotency-Key` header:
- **Locking & Caching**: When a request with the header arrives, we attempt to insert a record into the `IdempotencyKey` table with `status = 'PROCESSING'`.
- **Parallel Retries**: If a duplicate key is sent simultaneously (due to client double-tap or retries), the database returns a unique key constraint error. The second request polls the database (up to 3 seconds) until the first request completes, returning the identical cached status and response body.
- **Fault Tolerance**: If the handler throws a database connection or code error, the key is deleted, allowing the client to safely retry.

---

## 🧪 Verification & Testing Scripts

We have provided CLI test scripts to demonstrate correctness:
- **Concurrency Test**: Fires 10 simultaneous reservations for the last unit of a SKU. Exactly 1 will succeed (201) and 9 will fail (409).
  ```bash
  npm run test:concurrency
  ```
- **Idempotency Test**: Fires duplicate requests with the same key to verify cached response and single side-effect:
  ```bash
  npm run test:idempotency
  ```

---

## ⚖️ Trade-offs & Future Improvements

1. **Distributed Locks vs DB Constraints**: 
   Using raw SQL conditional updates is highly performant and requires zero external infrastructure (like Redis). However, for very high scale where database row locks could cause transaction timeouts, moving stock locks to a distributed key-value store like Upstash Redis (Redlock) is a viable trade-off.
2. **Lazy Cleanups Scale**:
   Lazy cleanup adds a slight database latency overhead to reads. In a massive scale catalog, this should be replaced entirely by an async worker listening to a Queue (like BullMQ or SQS) with delayed jobs.
3. **Optimistic UI vs Confirm Delays**:
   Confirming payment can take minutes. The frontend keeps active holds in `localStorage` and ticks down visually. This creates a smooth user flow that remains persistent even if the shopper closes the tab.
