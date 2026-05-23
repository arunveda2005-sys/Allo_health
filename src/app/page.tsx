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

  const consoleContainerRef = useRef<HTMLDivElement>(null);

  // Log message helper
  const addLog = (msg: string) => {
    setConsoleLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    if (consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
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
    
    // Find the at-home diagnostic kit (SKU: ALLO-HLTH-003)
    const mouse = products.find(p => p.sku === "ALLO-HLTH-003");
    if (!mouse) {
      addLog("Error: Could not find at-home diagnostic kit for concurrency test.");
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
    
    const hoodie = products.find(p => p.sku === "ALLO-HLTH-002");
    if (!hoodie) {
      addLog("Error: Could not find daily vitality supplement for idempotency test.");
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
    <div className="min-h-screen bg-[#F9F8FC] text-zinc-900 font-sans selection:bg-[#D2F53C] selection:text-black pb-12">
      {/* Navbar Header */}
      <header className="border-b border-zinc-100 bg-white/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#D2F53C] flex items-center justify-center text-black border border-[#BEDD35] shadow-sm">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-zinc-950">
                Allo Fulfillment
              </span>
              <span className="ml-2 px-2.5 py-0.5 text-[9px] font-bold tracking-wide uppercase bg-purple-100 text-purple-800 rounded-full">
                Console v2.0
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => fetchProducts(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-zinc-700 hover:text-black border border-zinc-200 hover:border-zinc-300 bg-zinc-50 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-purple-600" : ""}`} />
              Sync Inventory
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Zara Style Hero Editorial Banner */}
        <div className="bg-[#EADEFF] rounded-3xl p-8 mb-8 border border-[#D9C4FA] relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
          <div className="space-y-3.5 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#D2F53C] rounded-full text-[10px] font-bold uppercase tracking-wider text-black border border-[#BFDF33] shadow-sm">
              ✨ Intimate health & daily vitality
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-955 leading-tight">
              We&apos;re securing inventory for your health.
            </h1>
            <p className="text-sm text-zinc-800 leading-relaxed font-medium">
              Allo&apos;s fulfillment platform coordinates stock allocations dynamically across localized depots using database locks. Checkout holds expire in 10 minutes to maintain active inventory flow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <span className="px-4 py-2 bg-white/70 backdrop-blur border border-purple-200/50 rounded-full text-xs font-bold text-purple-950 shadow-sm">Intimate Care</span>
            <span className="px-4 py-2 bg-white/70 backdrop-blur border border-purple-200/50 rounded-full text-xs font-bold text-purple-950 shadow-sm">At-Home Tests</span>
            <span className="px-4 py-2 bg-white/70 backdrop-blur border border-purple-200/50 rounded-full text-xs font-bold text-purple-950 shadow-sm">Therapy</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Side: Product Inventory Listing (8 Cols) */}
          <section className="lg:col-span-8 space-y-6">
            <div>
              <h2 className="text-2xl font-black text-zinc-950 tracking-tight">Active Stock Levels</h2>
              <p className="text-sm text-zinc-500 mt-1 font-medium">
                Real-time stock totals and active customer reservation holds across warehouses.
              </p>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-80 bg-zinc-100 animate-pulse rounded-3xl border border-zinc-200" />
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
                      className="bg-white border border-zinc-100 rounded-3xl overflow-hidden hover:border-zinc-200 hover:shadow-md transition-all flex flex-col group relative"
                    >
                      {/* Price Tag Badge */}
                      <div className="absolute top-4 right-4 bg-[#D2F53C] border border-[#BFDF33] text-black text-xs font-mono font-bold px-3.5 py-1 rounded-full shadow-sm z-10">
                        ${product.price.toFixed(2)}
                      </div>

                      {/* Image / Banner */}
                      <div className="h-52 bg-zinc-50 relative overflow-hidden flex items-center justify-center">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="object-cover w-full h-full opacity-90 group-hover:scale-105 transition-all duration-500"
                          />
                        ) : (
                          <Package className="h-12 w-12 text-zinc-300" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
                      </div>

                      {/* Metadata */}
                      <div className="p-6 flex-1 flex flex-col">
                        <div className="flex-1">
                          <span className="text-[10px] font-bold tracking-wider text-purple-600 uppercase">
                            SKU: {product.sku}
                          </span>
                          <h3 className="text-lg font-extrabold text-zinc-950 mt-1 group-hover:text-purple-700 transition-colors">
                            {product.name}
                          </h3>
                          <p className="text-xs text-zinc-500 mt-2 line-clamp-2 leading-relaxed font-medium">
                            {product.description || "No description provided."}
                          </p>

                          {/* Warehouses Stocks */}
                          <div className="mt-5 space-y-3.5 border-t border-zinc-100 pt-4">
                            <span className="text-xs font-bold text-zinc-800 block">Warehouse Allocation:</span>
                            {product.stocks.map((stock) => {
                              const available = stock.available;
                              const isOut = available === 0;
                              const isCritical = available > 0 && available <= 2;
                              
                              return (
                                <div key={stock.warehouseId} className="space-y-1.5">
                                  <div className="flex justify-between text-xs font-semibold">
                                    <div className="flex items-center gap-1.5 text-zinc-600">
                                      <WarehouseIcon className="h-3.5 w-3.5 text-purple-600" />
                                      <span>{stock.warehouseName}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-zinc-500">
                                      <span>Avail:</span>
                                      <span className={`font-mono font-bold ${
                                        isOut ? "text-rose-500" : isCritical ? "text-amber-500" : "text-emerald-600"
                                      }`}>
                                        {available}
                                      </span>
                                      <span className="text-zinc-300">/</span>
                                      <span className="text-zinc-500 font-mono text-[10px]">{stock.total}</span>
                                    </div>
                                  </div>

                                  {/* Stock progress bar */}
                                  <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden flex">
                                    <div
                                      style={{ width: `${(stock.available / Math.max(1, stock.total)) * 100}%` }}
                                      className={`h-full rounded-full transition-all ${
                                        isOut 
                                          ? "bg-rose-500" 
                                          : isCritical 
                                            ? "bg-amber-400" 
                                            : "bg-[#D2F53C]"
                                      }`}
                                    />
                                    {stock.reserved > 0 && (
                                      <div
                                        style={{ width: `${(stock.reserved / Math.max(1, stock.total)) * 100}%` }}
                                        className="h-full bg-purple-400 opacity-60"
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
                        <div className="mt-6 pt-5 border-t border-zinc-100 space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            {/* Warehouse Select */}
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
                                Checkout Wh
                              </label>
                              <select
                                value={activeWhId || ""}
                                onChange={(e) =>
                                  setSelectedWarehouse((prev) => ({ ...prev, [sku]: e.target.value }))
                                }
                                className="w-full bg-zinc-50 border border-zinc-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-xs text-zinc-800 rounded-xl px-3 py-2.5 cursor-pointer font-bold transition-all"
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
                              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
                                Quantity
                              </label>
                              <div className="flex bg-zinc-50 border border-zinc-200 rounded-xl overflow-hidden items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReserveQuantity((prev) => ({
                                      ...prev,
                                      [sku]: Math.max(1, (prev[sku] || 1) - 1),
                                    }))
                                  }
                                  className="px-3 py-2 text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer font-bold"
                                >
                                  -
                                </button>
                                <span className="text-xs font-mono font-bold text-zinc-900 px-2">
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
                                  className="px-3 py-2 text-zinc-500 hover:text-black hover:bg-zinc-100 transition-colors cursor-pointer font-bold"
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
                            className="w-full py-3.5 px-4 bg-zinc-950 hover:bg-zinc-900 disabled:bg-zinc-100 text-white disabled:text-zinc-400 text-xs font-bold rounded-2xl transition-all shadow-sm active:scale-[0.98] disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                          >
                            {reservingSku === sku ? (
                              <RefreshCw className="h-4 w-4 animate-spin text-white" />
                            ) : activeWhStock?.available === 0 ? (
                              "Out of Stock"
                            ) : (
                              <>
                                Proceed to Checkout
                                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform text-[#D2F53C]" />
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
            <div className="bg-[#F3EEFF] border border-[#E2D5FA] rounded-3xl p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-purple-600 shadow-sm border border-purple-100">
                    <ShoppingCart className="h-4 w-4" />
                  </div>
                  <h2 className="text-md font-extrabold text-purple-950">Active Holds</h2>
                </div>
                {localReservations.length > 0 && (
                  <button
                    onClick={clearHoldHistory}
                    className="text-[10px] font-bold text-purple-600 hover:text-rose-600 transition-colors cursor-pointer"
                  >
                    Clear Logs
                  </button>
                )}
              </div>

              {localReservations.length === 0 ? (
                <div className="border border-dashed border-[#DFD1FB] rounded-2xl py-12 px-6 text-center text-purple-500/80 bg-white/40">
                  <Clock className="h-8 w-8 mx-auto text-purple-400 stroke-1 mb-3 animate-pulse" />
                  <p className="text-xs font-bold">No active reservations.</p>
                  <p className="text-[10px] text-purple-600 mt-2 leading-relaxed">
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
                        className={`border rounded-2xl p-4 transition-all shadow-sm ${
                          isConfirmed
                            ? "bg-emerald-50/50 border-emerald-200/50 text-emerald-800"
                            : isReleased
                              ? "bg-zinc-50/50 border-zinc-200 text-zinc-500"
                              : isExpired
                                ? "bg-rose-50/50 border-rose-200/50 text-rose-800"
                                : "bg-white border-purple-200/80 text-zinc-800"
                        }`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="text-[9px] font-mono font-bold uppercase bg-zinc-100 border border-zinc-200 text-zinc-600 px-2 py-0.5 rounded">
                              Hold: {hold.id.substring(0, 8)}
                            </span>
                            <h4 className="text-sm font-extrabold text-zinc-950 mt-2.5 leading-tight">
                              {hold.productName}
                            </h4>
                            <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1 font-semibold">
                              <WarehouseIcon className="h-3 w-3 inline text-purple-600" />
                              {hold.warehouseName}
                            </p>
                            <p className="text-xs font-bold mt-1 text-zinc-700">
                              Quantity: <span className="font-mono text-purple-600">{hold.quantity}</span>
                            </p>
                          </div>

                          {/* Status Badge & Circular Timer */}
                          <div className="flex flex-col items-end gap-2">
                            {isPending && (
                              <div className="flex items-center gap-1.5 bg-amber-5 border border-amber-200 text-amber-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                                {getCountdownText(hold.expiresAt)}
                              </div>
                            )}

                            {isConfirmed && (
                              <div className="flex items-center gap-1 bg-emerald-5 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Paid
                              </div>
                            )}

                            {isReleased && (
                              <div className="flex items-center gap-1 bg-zinc-100 border border-zinc-200 text-zinc-600 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                                <XCircle className="h-3.5 w-3.5" />
                                Released
                              </div>
                            )}

                            {isExpired && (
                              <div className="flex items-center gap-1 bg-rose-5 border border-rose-200 text-rose-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                                <AlertCircle className="h-3.5 w-3.5" />
                                Expired
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Display exact Errors from Server if they happen */}
                        {hold.errorMsg && (
                          <div className="mt-3 bg-rose-5 border border-rose-100 rounded-xl p-2.5 flex items-start gap-1.5 text-[10px] text-rose-700 font-medium leading-relaxed">
                            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
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
                              className="py-2.5 px-3 bg-[#D2F53C] hover:bg-[#C2DF32] disabled:bg-zinc-100 text-black disabled:text-zinc-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm border border-[#BFDF33]"
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
                              className="py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200 disabled:bg-zinc-100 text-zinc-700 hover:text-black disabled:text-zinc-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 border border-zinc-200 shadow-sm"
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
                              className="text-[9px] font-bold text-zinc-400 hover:text-zinc-600 cursor-pointer"
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
            <div className="bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-[#EADEFF] flex items-center justify-center text-purple-600 border border-purple-200">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h2 className="text-md font-extrabold text-zinc-950">Concurrency Lab</h2>
              </div>

              <div className="space-y-3.5">
                {/* Concurrency Simulator */}
                <div className="space-y-1">
                  <button
                    onClick={runConcurrencyTest}
                    disabled={testingConcurrency || refreshing || loading}
                    className="w-full py-3 px-4 bg-zinc-950 hover:bg-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400 text-[#D2F53C] disabled:border-zinc-200 text-xs font-bold rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                  >
                    {testingConcurrency ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />
                        Testing Race Conditions...
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        Test Concurrency (10 requests)
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-zinc-500 leading-normal px-1 font-semibold pt-1">
                    Fires 10 concurrent requests to reserve the last unit of the At-Home Diagnostic Kit at SF Hub. Under concurrency, exactly 1 should get 201, and 9 should get 409.
                  </p>
                </div>

                {/* Idempotency Simulator */}
                <div className="space-y-1 pt-2">
                  <button
                    onClick={runIdempotencyTest}
                    disabled={testingIdempotency || refreshing || loading}
                    className="w-full py-3 px-4 bg-white hover:bg-zinc-50 border border-zinc-300 hover:border-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-400 text-zinc-800 disabled:border-zinc-200 text-xs font-bold rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                  >
                    {testingIdempotency ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-600" />
                        Testing Idempotency...
                      </>
                    ) : (
                      <>
                        <Key className="h-3.5 w-3.5 text-purple-600" />
                        Test Idempotency-Key
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-zinc-500 leading-normal px-1 font-semibold pt-1">
                    Sends two simultaneous requests with an identical Idempotency-Key. Verifies that only one side-effect is recorded and both receive matching responses.
                  </p>
                </div>

                {/* Database Cron and Utilities */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={triggerManualSweep}
                    disabled={cleaningUp}
                    className="py-2.5 px-3 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-black text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
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
                    className="py-2.5 px-3 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-black text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Database className="h-3.5 w-3.5 text-blue-500" />
                    Seed Database
                  </button>
                </div>
              </div>

              {/* Simulated terminal logging */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Terminal Outputs:</span>
                <div 
                  ref={consoleContainerRef}
                  className="bg-[#18181B] border border-zinc-900 rounded-2xl p-4 h-48 overflow-y-auto font-mono text-[10px] text-zinc-300 space-y-1.5 shadow-inner"
                >
                  {consoleLogs.map((log, idx) => (
                    <div key={idx} className="leading-relaxed break-all">
                      {log.startsWith("[") ? (
                        <>
                          <span className="text-zinc-500">{log.substring(0, 10)}</span>
                          <span className={
                            log.includes("✅") ? "text-emerald-400 font-bold" :
                            log.includes("❌") ? "text-rose-400 font-bold" :
                            log.includes("successful") ? "text-[#D2F53C] font-semibold" :
                            log.includes("expired") ? "text-amber-400" : "text-zinc-100"
                          }>
                            {log.substring(10)}
                          </span>
                        </>
                      ) : (
                        log
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
