"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Package,
  Warehouse as WarehouseIcon,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Play,
  Key,
  Database,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Info,
  DollarSign,
  ShoppingCart
} from "lucide-react";

interface Stock {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  total: number;
  reserved: number;
  available: number;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  imageUrl: string | null;
  price: number;
  stocks: Stock[];
}

interface LocalReservation {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  expiresAt: string;
  status: "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";
  errorMsg?: string;
  statusCode?: number;
}

export default function Dashboard() {
  // Products & Warehouse state
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Reservation Form State per Product SKU
  const [selectedWarehouse, setSelectedWarehouse] = useState<Record<string, string>>({});
  const [reserveQuantity, setReserveQuantity] = useState<Record<string, number>>({});
  const [reservingSku, setReservingSku] = useState<string | null>(null);

  // Active holds (persisted in local storage)
  const [localReservations, setLocalReservations] = useState<LocalReservation[]>([]);
  
  // Action state (confirm/release)
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Testing Lab Console State
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [testingConcurrency, setTestingConcurrency] = useState(false);
  const [testingIdempotency, setTestingIdempotency] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Log message helper
  const addLog = (msg: string) => {
    setConsoleLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs]);

  // Load products & local reservations
  const fetchProducts = async (showPulse = false) => {
    if (showPulse) setRefreshing(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
        
        // Initialize defaults
        const defaultWh: Record<string, string> = {};
        const defaultQty: Record<string, number> = {};
        data.forEach((p: Product) => {
          if (p.stocks.length > 0) {
            // Find first warehouse with stock, or default to first
            const availableWh = p.stocks.find(s => s.available > 0) || p.stocks[0];
            defaultWh[p.sku] = availableWh.warehouseId;
            defaultQty[p.sku] = 1;
          }
        });
        setSelectedWarehouse(prev => ({ ...defaultWh, ...prev }));
        setReserveQuantity(prev => ({ ...defaultQty, ...prev }));
      } else {
        addLog("Failed to fetch products: " + res.statusText);
      }
    } catch (err: any) {
      addLog("Error fetching products: " + err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchProducts();
    const stored = localStorage.getItem("allo_reservations");
    if (stored) {
      try {
        setLocalReservations(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse local storage reservations");
      }
    }
    addLog("Dashboard initialized. Ready to simulate inventory holds.");
  }, []);

  // Save reservations to localstorage
  const saveReservations = (updated: LocalReservation[]) => {
    setLocalReservations(updated);
    localStorage.setItem("allo_reservations", JSON.stringify(updated));
  };

  // Live Timer Countdown Effect
  useEffect(() => {
    const timer = setInterval(() => {
      let changed = false;
      const now = Date.now();
      const updated = localReservations.map((res) => {
        if (res.status === "PENDING") {
          const expiryTime = new Date(res.expiresAt).getTime();
          if (expiryTime <= now) {
            changed = true;
            addLog(`Hold expired locally for reservation ${res.id.substring(0, 8)}...`);
            return { ...res, status: "EXPIRED" as const };
          }
        }
        return res;
      });

      if (changed) {
        saveReservations(updated);
        // Refresh products to reclaim stock levels
        fetchProducts(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [localReservations]);

  // Reserve Stock API call
  const handleReserve = async (product: Product) => {
    const sku = product.sku;
    const warehouseId = selectedWarehouse[sku];
    const quantity = reserveQuantity[sku] || 1;
    
    if (!warehouseId) {
      alert("Please select a warehouse");
      return;
    }

    const wh = product.stocks.find(s => s.warehouseId === warehouseId);
    if (!wh) return;

    setReservingSku(sku);
    addLog(`Creating reservation: ${quantity}x ${product.name} at ${wh.warehouseName}...`);

    try {
      const idempotencyKey = `reserve-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
      
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId,
          quantity,
        }),
      });

      const data = await res.json();

      if (res.status === 201) {
        addLog(`Reservation successful! Hold ID: ${data.id.substring(0, 8)}`);
        
        // Add to active holds list
        const newHold: LocalReservation = {
          id: data.id,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          warehouseId,
          warehouseName: wh.warehouseName,
          quantity,
          expiresAt: data.expiresAt,
          status: "PENDING",
        };

        saveReservations([newHold, ...localReservations]);
        await fetchProducts(true);
      } else {
        addLog(`Reservation rejected (Status ${res.status}): ${data.error || JSON.stringify(data)}`);
        
        // Add dummy entry to local list with error status so the user sees it failed
        const failedHold: LocalReservation = {
          id: `err-${Date.now()}`,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          warehouseId,
          warehouseName: wh.warehouseName,
          quantity,
          expiresAt: new Date(Date.now() + 5000).toISOString(),
          status: "RELEASED",
          statusCode: res.status,
          errorMsg: data.error || "Stock conflict",
        };
        saveReservations([failedHold, ...localReservations]);
      }
    } catch (err: any) {
      addLog(`Network error during reservation: ${err.message}`);
    } finally {
      setReservingSku(null);
    }
  };

  // Confirm Purchase API Call
  const handleConfirm = async (hold: LocalReservation) => {
    setActionLoading(hold.id);
    addLog(`Confirming payment for Hold ID: ${hold.id.substring(0, 8)}...`);

    try {
      const idempotencyKey = `confirm-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
      
      const res = await fetch(`/api/reservations/${hold.id}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
      });

      const data = await res.json();

      if (res.status === 200) {
        addLog(`Hold confirmed! Payment captured. Stock permanently decremented.`);
        
        const updated = localReservations.map(r => 
          r.id === hold.id ? { ...r, status: "CONFIRMED" as const } : r
        );
        saveReservations(updated);
        await fetchProducts(true);
      } else {
        addLog(`Confirmation failed (Status ${res.status}): ${data.error || JSON.stringify(data)}`);
        
        const updated = localReservations.map(r => 
          r.id === hold.id ? { 
            ...r, 
            status: res.status === 410 ? ("EXPIRED" as const) : r.status,
            statusCode: res.status, 
            errorMsg: data.error || "Confirmation failed" 
          } : r
        );
        saveReservations(updated);
        await fetchProducts(true);
      }
    } catch (err: any) {
      addLog(`Network error during confirmation: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Release/Cancel Hold API Call
  const handleRelease = async (hold: LocalReservation) => {
    if (hold.id.startsWith("err-")) {
      // Just delete from UI if it was a failed reservation log
      const updated = localReservations.filter(r => r.id !== hold.id);
      saveReservations(updated);
      return;
    }

    setActionLoading(hold.id);
    addLog(`Releasing hold early for Hold ID: ${hold.id.substring(0, 8)}...`);

    try {
      const idempotencyKey = `release-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
      
      const res = await fetch(`/api/reservations/${hold.id}/release`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
      });

      const data = await res.json();

      if (res.status === 200) {
        addLog(`Hold released successfully! Units returned to stock pool.`);
        
        const updated = localReservations.map(r => 
          r.id === hold.id ? { ...r, status: "RELEASED" as const } : r
        );
        saveReservations(updated);
        await fetchProducts(true);
      } else {
        addLog(`Release failed (Status ${res.status}): ${data.error || JSON.stringify(data)}`);
        
        const updated = localReservations.map(r => 
          r.id === hold.id ? { ...r, statusCode: res.status, errorMsg: data.error || "Release failed" } : r
        );
        saveReservations(updated);
        await fetchProducts(true);
      }
    } catch (err: any) {
      addLog(`Network error during release: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete hold card from UI list
  const deleteFromUI = (id: string) => {
    const updated = localReservations.filter(r => r.id !== id);
    saveReservations(updated);
  };

  // Clear local reservations UI history
  const clearHoldHistory = () => {
    saveReservations([]);
    addLog("UI hold history cleared.");
  };

  // CONCURRENCY LAB: Simulate 10 simultaneous requests
  const runConcurrencyTest = async () => {
    if (products.length === 0) return;
    
    // Find the wireless mouse (SKU: ALLO-MSE-003)
    const mouse = products.find(p => p.sku === "ALLO-MSE-003");
    if (!mouse) {
      addLog("Error: Could not find wireless mouse for concurrency test.");
      return;
    }

    // Find San Francisco Hub stock
    const sfStock = mouse.stocks.find(s => s.warehouseName === "San Francisco Hub");
    if (!sfStock) {
      addLog("Error: Could not find SF Hub stock for mouse.");
      return;
    }

    if (sfStock.available === 0) {
      addLog("--------------------------------------------------");
      addLog("❌ CANNOT RUN CONCURRENCY TEST: Stock available is 0.");
      addLog("Please release the active hold in 'Active Checkout Holds' or click 'Seed Database' to restore available stock to 1 first.");
      addLog("--------------------------------------------------");
      return;
    }

    setTestingConcurrency(true);
    addLog("--------------------------------------------------");
    addLog("STARTING CONCURRENCY RACE CONDITION TEST");
    addLog(`Target: 10 concurrent requests for last unit of ${mouse.name}`);
    addLog(`Stock available before test: ${sfStock.available}`);
    addLog("Firing requests simultaneously...");

    const timestamp = Date.now();
    const requests = Array.from({ length: 10 }).map(async (_, idx) => {
      try {
        const res = await fetch("/api/reservations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `concurrency-ui-${idx}-${timestamp}`,
          },
          body: JSON.stringify({
            productId: mouse.id,
            warehouseId: sfStock.warehouseId,
            quantity: 1,
          }),
        });
        const data = await res.json();
        return { status: res.status, data };
      } catch (err: any) {
        return { status: 500, error: err.message };
      }
    });

    try {
      const results = await Promise.all(requests);
      
      let successCount = 0;
      let conflictCount = 0;
      let otherCount = 0;

      results.forEach((r, idx) => {
        addLog(`Request #${idx + 1}: Status ${r.status} -> ${r.status === 201 ? "SUCCESS (Hold created: " + r.data.id.substring(0, 8) + ")" : "REJECTED (" + (r.data?.error || "Error") + ")"}`);
        if (r.status === 201) {
          successCount++;
          // Add this successful hold to local holds list so user can interact with it
          const newHold: LocalReservation = {
            id: r.data.id,
            productId: mouse.id,
            productName: mouse.name,
            productSku: mouse.sku,
            warehouseId: sfStock.warehouseId,
            warehouseName: sfStock.warehouseName,
            quantity: 1,
            expiresAt: r.data.expiresAt,
            status: "PENDING",
          };
          setLocalReservations(prev => [newHold, ...prev]);
        }
        else if (r.status === 409) conflictCount++;
        else otherCount++;
      });

      addLog(`--- SUMMARY: Successes: ${successCount}, Conflicts: ${conflictCount}, Others: ${otherCount}`);
      if (successCount === 1) {
        addLog("✅ RESULT: Concurrency protection active! Exactly 1 succeeded, others got 409.");
      } else {
        addLog("❌ RESULT: Race condition failed! Success count: " + successCount);
      }
      addLog("--------------------------------------------------");

      // Persist the holds
      localStorage.setItem("allo_reservations", JSON.stringify(localReservations));
      await fetchProducts(true);
    } catch (err: any) {
      addLog(`Error running concurrency test: ${err.message}`);
    } finally {
      setTestingConcurrency(false);
    }
  };

  // IDEMPOTENCY LAB: Send duplicate key requests
  const runIdempotencyTest = async () => {
    if (products.length === 0) return;
    
    const hoodie = products.find(p => p.sku === "ALLO-HD-002");
    if (!hoodie) {
      addLog("Error: Could not find developer hoodie for idempotency test.");
      return;
    }

    const nyStock = hoodie.stocks.find(s => s.warehouseName === "New York Depot");
    if (!nyStock) {
      addLog("Error: Could not find New York Depot stock for hoodie.");
      return;
    }

    setTestingIdempotency(true);
    addLog("--------------------------------------------------");
    addLog("STARTING IDEMPOTENCY TEST");
    const testKey = `idemp-ui-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
    addLog(`Generating Idempotency-Key: ${testKey}`);
    addLog("Sending Request #1 and Request #2 in parallel...");

    const body = {
      productId: hoodie.id,
      warehouseId: nyStock.warehouseId,
      quantity: 1,
    };

    const req1 = fetch("/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": testKey,
      },
      body: JSON.stringify(body),
    });

    const req2 = fetch("/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": testKey,
      },
      body: JSON.stringify(body),
    });

    try {
      const [res1, res2] = await Promise.all([req1, req2]);
      const data1 = await res1.json();
      const data2 = await res2.json();

      addLog(`Request #1: Status ${res1.status} -> ID: ${data1.id?.substring(0, 8) || "N/A"}`);
      addLog(`Request #2: Status ${res2.status} -> ID: ${data2.id?.substring(0, 8) || "N/A"}`);

      if (res1.status === res2.status && data1.id === data2.id) {
        addLog("✅ RESULT: Idempotency confirmed! Both requests received identical responses and created a single hold.");
        
        if (res1.status === 201) {
          const newHold: LocalReservation = {
            id: data1.id,
            productId: hoodie.id,
            productName: hoodie.name,
            productSku: hoodie.sku,
            warehouseId: nyStock.warehouseId,
            warehouseName: nyStock.warehouseName,
            quantity: 1,
            expiresAt: data1.expiresAt,
            status: "PENDING",
          };
          saveReservations([newHold, ...localReservations]);
        }
      } else {
        addLog("❌ RESULT: Idempotency failed. Mismatched responses or duplicate side effects.");
      }
      addLog("--------------------------------------------------");
      await fetchProducts(true);
    } catch (err: any) {
      addLog(`Error running idempotency test: ${err.message}`);
    } finally {
      setTestingIdempotency(false);
    }
  };

  // Run Manual Cron Expiry sweep
  const triggerManualSweep = async () => {
    setCleaningUp(true);
    addLog("Sweeping database for expired holds...");
    try {
      const res = await fetch("/api/cron/cleanup");
      const data = await res.json();
      if (res.ok) {
        addLog(`Sweep complete: ${data.message || JSON.stringify(data)}`);
        await fetchProducts(true);
      } else {
        addLog(`Sweep failed: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      addLog(`Error running sweep: ${err.message}`);
    } finally {
      setCleaningUp(false);
    }
  };

  // Format expiry countdown text
  const getCountdownText = (expiresAtStr: string) => {
    const remaining = Math.max(0, Math.floor((new Date(expiresAtStr).getTime() - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate percentage of hold time remaining (assumes 10 minutes total)
  const getTimerPercent = (expiresAtStr: string) => {
    const remaining = Math.max(0, Math.floor((new Date(expiresAtStr).getTime() - Date.now()) / 1000));
    return (remaining / 600) * 100;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-violet-600 selection:text-white pb-12">
      {/* Navbar Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                Allo Fulfillment
              </span>
              <span className="ml-2 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded">
                Console v1.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => fetchProducts(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-violet-400" : ""}`} />
              Sync Inventory
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Product Inventory Listing (8 Cols) */}
        <section className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Active Stock Levels</h2>
              <p className="text-sm text-zinc-400 mt-1">
                Real-time stock totals and active customer reservation holds across warehouses.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-80 bg-zinc-900/30 border border-zinc-900 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {products.map((product) => {
                const sku = product.sku;
                const activeWhId = selectedWarehouse[sku];
                const activeWhStock = product.stocks.find((s) => s.warehouseId === activeWhId);
                const quantity = reserveQuantity[sku] || 1;

                return (
                  <div
                    key={product.id}
                    className="bg-zinc-900/40 border border-zinc-900 rounded-2xl overflow-hidden hover:border-zinc-800 transition-all flex flex-col group"
                  >
                    {/* Image / Banner */}
                    <div className="h-44 bg-zinc-950 relative overflow-hidden flex items-center justify-center">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="object-cover w-full h-full opacity-60 group-hover:scale-105 transition-all duration-500"
                        />
                      ) : (
                        <Package className="h-12 w-12 text-zinc-700" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent" />
                      
                      <div className="absolute top-4 right-4 bg-zinc-950/80 backdrop-blur border border-zinc-800 text-violet-400 text-sm font-mono font-bold px-3 py-1 rounded-full">
                        ${product.price.toFixed(2)}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex-1">
                        <span className="text-[10px] font-mono font-semibold tracking-wider text-zinc-500 uppercase">
                          SKU: {product.sku}
                        </span>
                        <h3 className="text-lg font-bold text-white mt-1 group-hover:text-violet-400 transition-colors">
                          {product.name}
                        </h3>
                        <p className="text-xs text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
                          {product.description || "No description provided."}
                        </p>

                        {/* Warehouses Stocks */}
                        <div className="mt-5 space-y-3.5 border-t border-zinc-900 pt-4">
                          <span className="text-xs font-semibold text-zinc-300 block">Warehouse Allocation:</span>
                          {product.stocks.map((stock) => {
                            const available = stock.available;
                            const isOut = available === 0;
                            const isCritical = available > 0 && available <= 2;
                            
                            return (
                              <div key={stock.warehouseId} className="space-y-1.5">
                                <div className="flex justify-between text-xs font-medium">
                                  <div className="flex items-center gap-1.5 text-zinc-400">
                                    <WarehouseIcon className="h-3.5 w-3.5" />
                                    <span>{stock.warehouseName}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-zinc-500">Avail:</span>
                                    <span className={`font-mono font-bold ${
                                      isOut ? "text-rose-500" : isCritical ? "text-amber-500" : "text-emerald-500"
                                    }`}>
                                      {available}
                                    </span>
                                    <span className="text-zinc-600">/</span>
                                    <span className="text-zinc-500 font-mono text-[10px]">{stock.total}</span>
                                  </div>
                                </div>

                                {/* Stock progress bar */}
                                <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden flex">
                                  <div
                                    style={{ width: `${(stock.available / Math.max(1, stock.total)) * 100}%` }}
                                    className={`h-full rounded-full transition-all ${
                                      isOut 
                                        ? "bg-rose-500" 
                                        : isCritical 
                                          ? "bg-amber-500 animate-pulse" 
                                          : "bg-emerald-500"
                                    }`}
                                  />
                                  {stock.reserved > 0 && (
                                    <div
                                      style={{ width: `${(stock.reserved / Math.max(1, stock.total)) * 100}%` }}
                                      className="h-full bg-violet-500 opacity-60"
                                      title={`${stock.reserved} units currently reserved`}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Checkout Simulation Controls */}
                      <div className="mt-6 pt-5 border-t border-zinc-900 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          {/* Warehouse Select */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
                              Checkout Wh
                            </label>
                            <select
                              value={activeWhId || ""}
                              onChange={(e) =>
                                setSelectedWarehouse((prev) => ({ ...prev, [sku]: e.target.value }))
                              }
                              className="w-full bg-zinc-950 border border-zinc-900 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-xs text-zinc-300 rounded-xl px-3 py-2 cursor-pointer font-medium"
                            >
                              {product.stocks.map((s) => (
                                <option key={s.warehouseId} value={s.warehouseId}>
                                  {s.warehouseName}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quantity Selector */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
                              Quantity
                            </label>
                            <div className="flex bg-zinc-950 border border-zinc-900 rounded-xl overflow-hidden items-center justify-between">
                              <button
                                type="button"
                                onClick={() =>
                                  setReserveQuantity((prev) => ({
                                    ...prev,
                                    [sku]: Math.max(1, (prev[sku] || 1) - 1),
                                  }))
                                }
                                className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                              >
                                -
                              </button>
                              <span className="text-xs font-mono font-bold text-white px-2">
                                {quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setReserveQuantity((prev) => ({
                                    ...prev,
                                    [sku]: (prev[sku] || 1) + 1,
                                  }))
                                }
                                className="px-2.5 py-2 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Reserve CTA */}
                        <button
                          onClick={() => handleReserve(product)}
                          disabled={reservingSku === sku || !activeWhStock || activeWhStock.available === 0}
                          className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-zinc-900 disabled:to-zinc-900 text-white disabled:text-zinc-600 text-xs font-bold rounded-xl transition-all shadow-md shadow-violet-600/10 active:scale-[0.98] disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                        >
                          {reservingSku === sku ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : activeWhStock?.available === 0 ? (
                            "Out of Stock"
                          ) : (
                            <>
                              Proceed to Checkout
                              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Side: Active Holds Console & Testing Lab (4 Cols) */}
        <aside className="lg:col-span-4 space-y-8">
          
          {/* Checkout Reservations Card */}
          <div className="bg-zinc-900/50 border border-zinc-900 rounded-3xl p-6 backdrop-blur space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-violet-400" />
                <h2 className="text-lg font-bold text-white">Active Checkout Holds</h2>
              </div>
              {localReservations.length > 0 && (
                <button
                  onClick={clearHoldHistory}
                  className="text-[10px] font-bold text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Clear Logs
                </button>
              )}
            </div>

            {localReservations.length === 0 ? (
              <div className="border border-dashed border-zinc-800 rounded-2xl py-12 px-6 text-center text-zinc-500">
                <Clock className="h-8 w-8 mx-auto text-zinc-700 stroke-1 mb-3" />
                <p className="text-xs font-medium">No active reservations.</p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Select a product and click &apos;Proceed to Checkout&apos; to trigger a 10-minute hold.
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
                {localReservations.map((hold) => {
                  const isPending = hold.status === "PENDING";
                  const isConfirmed = hold.status === "CONFIRMED";
                  const isReleased = hold.status === "RELEASED";
                  const isExpired = hold.status === "EXPIRED";

                  return (
                    <div
                      key={hold.id}
                      className={`border rounded-2xl p-4 transition-all ${
                        isConfirmed
                          ? "bg-emerald-950/10 border-emerald-950/40 text-emerald-300"
                          : isReleased
                            ? "bg-zinc-900/20 border-zinc-900 text-zinc-500"
                            : isExpired
                              ? "bg-rose-950/10 border-rose-950/20 text-rose-400"
                              : "bg-zinc-900/70 border-zinc-800 text-zinc-100"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[9px] font-mono uppercase bg-zinc-950 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                            Hold: {hold.id.substring(0, 8)}
                          </span>
                          <h4 className="text-sm font-bold text-white mt-2 leading-tight">
                            {hold.productName}
                          </h4>
                          <p className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1">
                            <WarehouseIcon className="h-3 w-3 inline text-zinc-500" />
                            {hold.warehouseName}
                          </p>
                          <p className="text-xs font-semibold mt-1">
                            Quantity Reserved: <span className="font-mono text-white">{hold.quantity}</span>
                          </p>
                        </div>

                        {/* Status Badge & Circular Timer */}
                        <div className="flex flex-col items-end gap-2">
                          {isPending && (
                            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                              {getCountdownText(hold.expiresAt)}
                            </div>
                          )}

                          {isConfirmed && (
                            <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Paid
                            </div>
                          )}

                          {isReleased && (
                            <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 text-zinc-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                              <XCircle className="h-3.5 w-3.5" />
                              Released
                            </div>
                          )}

                          {isExpired && (
                            <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                              <AlertCircle className="h-3.5 w-3.5" />
                              Expired
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Display exact Errors from Server if they happen */}
                      {hold.errorMsg && (
                        <div className="mt-3 bg-rose-500/5 border border-rose-500/10 rounded-xl p-2.5 flex items-start gap-1.5 text-[10px] text-rose-400">
                          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Error {hold.statusCode}:</span> {hold.errorMsg}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {isPending && (
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleConfirm(hold)}
                            disabled={actionLoading === hold.id}
                            className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white disabled:text-zinc-600 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-md shadow-emerald-700/10"
                          >
                            {actionLoading === hold.id ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Pay Now"
                            )}
                          </button>
                          <button
                            onClick={() => handleRelease(hold)}
                            disabled={actionLoading === hold.id}
                            className="py-2 px-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 text-zinc-300 hover:text-white disabled:text-zinc-600 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 border border-zinc-700"
                          >
                            Cancel Hold
                          </button>
                        </div>
                      )}

                      {/* Clean up logs from UI button */}
                      {(isConfirmed || isReleased || isExpired) && (
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => deleteFromUI(hold.id)}
                            className="text-[9px] font-semibold text-zinc-500 hover:text-zinc-300 cursor-pointer"
                          >
                            Remove Card
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Verification Lab Console */}
          <div className="bg-zinc-900/50 border border-zinc-900 rounded-3xl p-6 backdrop-blur space-y-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-400" />
              <h2 className="text-lg font-bold text-white">Concurrency & Testing Lab</h2>
            </div>

            <div className="space-y-3.5">
              {/* Concurrency Simulator */}
              <div className="space-y-1">
                <button
                  onClick={runConcurrencyTest}
                  disabled={testingConcurrency || refreshing || loading}
                  className="w-full py-2.5 px-4 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-violet-400 disabled:border-zinc-900 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {testingConcurrency ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Testing Race Conditions...
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Test Concurrency (10 requests)
                    </>
                  )}
                </button>
                <p className="text-[10px] text-zinc-500 leading-normal px-1">
                  Fires 10 concurrent requests to reserve the last unit of the Wireless Mouse at SF Hub. Under concurrency, exactly 1 should get 201, and 9 should get 409.
                </p>
              </div>

              {/* Idempotency Simulator */}
              <div className="space-y-1 pt-2">
                <button
                  onClick={runIdempotencyTest}
                  disabled={testingIdempotency || refreshing || loading}
                  className="w-full py-2.5 px-4 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-violet-400 disabled:border-zinc-900 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {testingIdempotency ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Testing Idempotency...
                    </>
                  ) : (
                    <>
                      <Key className="h-3.5 w-3.5" />
                      Test Idempotency-Key
                    </>
                  )}
                </button>
                <p className="text-[10px] text-zinc-500 leading-normal px-1">
                  Sends two simultaneous requests with an identical Idempotency-Key. Verifies that only one side-effect is recorded and both receive matching responses.
                </p>
              </div>

              {/* Database Cron and Utilities */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={triggerManualSweep}
                  disabled={cleaningUp}
                  className="py-2.5 px-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  Sweep Expirations
                </button>
                <button
                  onClick={async () => {
                    setSeeding(true);
                    addLog("Triggering database re-seed...");
                    try {
                      const res = await fetch("/api/seed", { method: "POST" });
                      const data = await res.json();
                      if (res.ok) {
                        addLog("✅ Database seeded successfully!");
                        saveReservations([]);
                        await fetchProducts(true);
                      } else {
                        addLog("❌ Seeding failed: " + (data.error || "Unknown error"));
                      }
                    } catch (err: any) {
                      addLog("❌ Network error during seeding: " + err.message);
                    } finally {
                      setSeeding(false);
                    }
                  }}
                  disabled={seeding}
                  className="py-2.5 px-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Database className="h-3.5 w-3.5 text-blue-500" />
                  Seed Database
                </button>
              </div>
            </div>

            {/* Simulated terminal logging */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Terminal Outputs:</span>
              <div className="bg-black border border-zinc-900 rounded-2xl p-4 h-48 overflow-y-auto font-mono text-[10px] text-zinc-400 space-y-1.5">
                {consoleLogs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed break-all">
                    {log.startsWith("[") ? (
                      <>
                        <span className="text-zinc-600">{log.substring(0, 10)}</span>
                        <span className={
                          log.includes("✅") ? "text-emerald-400" :
                          log.includes("❌") ? "text-rose-400" :
                          log.includes("successful") ? "text-violet-400" :
                          log.includes("expired") ? "text-amber-400" : "text-zinc-300"
                        }>
                          {log.substring(10)}
                        </span>
                      </>
                    ) : (
                      log
                    )}
                  </div>
                ))}
                <div ref={consoleEndRef} />
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
