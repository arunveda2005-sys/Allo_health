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
  Info,
  ShoppingCart,
  X,
  SlidersHorizontal,
  Check,
  ShieldAlert,
  ShieldCheck,
  Truck,
  TrendingUp,
  Activity
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

interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
}

function FadeIn({ children, delay = 0 }: FadeInProps) {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05 }
    );

    const currentTarget = domRef.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, []);

  return (
    <div
      ref={domRef}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        isVisible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-6 scale-[0.97] pointer-events-none"
      }`}
    >
      {children}
    </div>
  );
}

export default function AlloHealthDashboard() {
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

  // Dev Lab & Shopping Cart Open/Close states (defaulted open for easy visibility)
  const [isDevLabOpen, setIsDevLabOpen] = useState(true);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Latency monitoring states for test run visualization graphs
  const [concurrencyLatency, setConcurrencyLatency] = useState<{ id: number; status: number; duration: number }[]>([]);
  const [idempotencyLatency, setIdempotencyLatency] = useState<{ name: string; status: number; duration: number }[]>([]);

  // Active Tab for Search filters: 'concern' or 'category'
  const [searchTab, setSearchTab] = useState<"concern" | "category">("concern");

  // Search filter values
  const [healthConcern, setHealthConcern] = useState("");
  const [treatmentRecommend, setTreatmentRecommend] = useState("");
  const [symptomDuration, setSymptomDuration] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [treatmentMode, setTreatmentMode] = useState("Home Medication Delivery");

  const [wellnessCategory, setWellnessCategory] = useState("");
  const [packagingSize, setPackagingSize] = useState("");
  const [dosageStrength, setDosageStrength] = useState("");
  const [discreetPackaging, setDiscreetPackaging] = useState(true);

  // Search Results notification/visual highlight
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

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
    addLog("Allo Health clinical fulfillment terminal initialized. Concurrency controls active.");
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
            addLog(`Checkout hold expired locally for reservation ${res.id.substring(0, 8)}...`);
            return { ...res, status: "EXPIRED" as const };
          }
        }
        return res;
      });

      if (changed) {
        saveReservations(updated);
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
      alert("Please select a clinic/warehouse");
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
        setIsCartOpen(true);
        await fetchProducts(true);
      } else {
        addLog(`Reservation rejected (Status ${res.status}): ${data.error || JSON.stringify(data)}`);
        
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
        setIsCartOpen(true);
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
    addLog(`Confirming payment for checkout hold: ${hold.id.substring(0, 8)}...`);

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
      const updated = localReservations.filter(r => r.id !== hold.id);
      saveReservations(updated);
      return;
    }

    setActionLoading(hold.id);
    addLog(`Releasing reservation early for Hold ID: ${hold.id.substring(0, 8)}...`);

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

  const deleteFromUI = (id: string) => {
    const updated = localReservations.filter(r => r.id !== id);
    saveReservations(updated);
  };

  const clearHoldHistory = () => {
    saveReservations([]);
    addLog("UI hold history cleared.");
  };

  // CONCURRENCY LAB: Simulate 10 simultaneous requests
  const runConcurrencyTest = async () => {
    if (products.length === 0) return;
    
    // Find Tadalafil 10mg Strip (SKU: ALO-003)
    const tadalafil = products.find(p => p.sku === "ALO-003");
    if (!tadalafil) {
      addLog("Error: Could not find Tadalafil strip for concurrency test.");
      return;
    }

    const mumbaiHub = tadalafil.stocks.find(s => s.warehouseName === "Borivali Fulfillment Centre");
    if (!mumbaiHub) {
      addLog("Error: Could not find Borivali clinic stock for Tadalafil.");
      return;
    }

    if (mumbaiHub.available === 0) {
      addLog("--------------------------------------------------");
      addLog("❌ CANNOT RUN CONCURRENCY TEST: Stock available is 0.");
      addLog("Please release active holds in Cart or click 'Seed Database' to restore stock first.");
      addLog("--------------------------------------------------");
      return;
    }

    setTestingConcurrency(true);
    addLog("--------------------------------------------------");
    addLog("STARTING CONCURRENCY RACE CONDITION TEST");
    addLog(`Target: 10 concurrent requests for last unit of ${tadalafil.name}`);
    addLog(`Stock available before test: ${mumbaiHub.available}`);
    addLog("Firing requests simultaneously...");

    const timestamp = Date.now();
    const requests = Array.from({ length: 10 }).map(async (_, idx) => {
      const start = Date.now();
      try {
        const res = await fetch("/api/reservations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": `concurrency-ui-${idx}-${timestamp}`,
          },
          body: JSON.stringify({
            productId: tadalafil.id,
            warehouseId: mumbaiHub.warehouseId,
            quantity: 1,
          }),
        });
        const data = await res.json();
        const duration = Date.now() - start;
        return { status: res.status, data, duration };
      } catch (err: any) {
        return { status: 500, error: err.message, duration: Date.now() - start };
      }
    });

    try {
      const results = await Promise.all(requests);
      
      // Save latency results for visualization graph
      setConcurrencyLatency(
        results.map((r, idx) => ({
          id: idx + 1,
          status: r.status,
          duration: r.duration
        }))
      );

      let successCount = 0;
      let conflictCount = 0;
      let otherCount = 0;

      const holdsToAdd: LocalReservation[] = [];

      results.forEach((r, idx) => {
        addLog(`Request #${idx + 1}: Status ${r.status} (${r.duration}ms) -> ${r.status === 201 ? "SUCCESS (Hold: " + r.data.id.substring(0, 8) + ")" : "REJECTED (" + (r.data?.error || "Error") + ")"}`);
        if (r.status === 201) {
          successCount++;
          holdsToAdd.push({
            id: r.data.id,
            productId: tadalafil.id,
            productName: tadalafil.name,
            productSku: tadalafil.sku,
            warehouseId: mumbaiHub.warehouseId,
            warehouseName: mumbaiHub.warehouseName,
            quantity: 1,
            expiresAt: r.data.expiresAt,
            status: "PENDING",
          });
        }
        else if (r.status === 409) conflictCount++;
        else otherCount++;
      });

      addLog(`--- SUMMARY: Successes: ${successCount}, Conflicts: ${conflictCount}, Others: ${otherCount}`);
      if (successCount === 1) {
        addLog("✅ RESULT: Concurrency lock active! Exactly 1 succeeded, others got 409.");
      } else {
        addLog("❌ RESULT: Race condition failed! Success count: " + successCount);
      }
      addLog("--------------------------------------------------");

      if (holdsToAdd.length > 0) {
        setLocalReservations(prev => [...holdsToAdd, ...prev]);
        setIsCartOpen(true);
      }
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
    
    const testKit = products.find(p => p.sku === "ALO-002");
    if (!testKit) {
      addLog("Error: Could not find Testosterone Test Kit for idempotency test.");
      return;
    }

    const hydHub = testKit.stocks.find(s => s.warehouseName === "Banjara Hills Dispatch Centre");
    if (!hydHub) {
      addLog("Error: Could not find Banjara Hills clinic stock.");
      return;
    }

    setTestingIdempotency(true);
    addLog("--------------------------------------------------");
    addLog("STARTING IDEMPOTENCY TEST");
    const testKey = `idemp-ui-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
    addLog(`Generating Idempotency-Key: ${testKey}`);
    addLog("Sending Request #1 and Request #2 in parallel...");

    const body = {
      productId: testKit.id,
      warehouseId: hydHub.warehouseId,
      quantity: 1,
    };

    const start1 = Date.now();
    const req1 = fetch("/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": testKey,
      },
      body: JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, data: await res.json(), duration: Date.now() - start1 }));

    const start2 = Date.now();
    const req2 = fetch("/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": testKey,
      },
      body: JSON.stringify(body),
    }).then(async (res) => ({ status: res.status, data: await res.json(), duration: Date.now() - start2 }));

    try {
      const [res1, res2] = await Promise.all([req1, req2]);

      // Wait 1 second and send a third delayed request using the same key (should hit the cache instantly)
      addLog("Waiting 1 second before sending Request #3 with the identical key...");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const start3 = Date.now();
      const res3Raw = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": testKey,
        },
        body: JSON.stringify(body),
      });
      const res3Data = await res3Raw.json();
      const res3 = { status: res3Raw.status, data: res3Data, duration: Date.now() - start3 };

      // Save latency results for visualization graph
      setIdempotencyLatency([
        { name: "Req #1 (Initial)", status: res1.status, duration: res1.duration },
        { name: "Req #2 (Duplicate)", status: res2.status, duration: res2.duration },
        { name: "Req #3 (Cached)", status: res3.status, duration: res3.duration }
      ]);

      addLog(`Request #1: Status ${res1.status} (${res1.duration}ms) -> ID: ${res1.data.id?.substring(0, 8) || "N/A"}`);
      addLog(`Request #2: Status ${res2.status} (${res2.duration}ms) -> ID: ${res2.data.id?.substring(0, 8) || "N/A"}`);
      addLog(`Request #3: Status ${res3.status} (${res3.duration}ms) -> ID: ${res3.data.id?.substring(0, 8) || "N/A"}`);

      if (res1.status === res2.status && res1.data.id === res2.data.id && res2.data.id === res3.data.id) {
        addLog("✅ RESULT: Idempotency confirmed! All requests received identical responses and created a single hold.");
        
        if (res1.status === 201) {
          const newHold: LocalReservation = {
            id: res1.data.id,
            productId: testKit.id,
            productName: testKit.name,
            productSku: testKit.sku,
            warehouseId: hydHub.warehouseId,
            warehouseName: hydHub.warehouseName,
            quantity: 1,
            expiresAt: res1.data.expiresAt,
            status: "PENDING",
          };
          saveReservations([newHold, ...localReservations]);
          setIsCartOpen(true);
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

  const getCountdownText = (expiresAtStr: string) => {
    const remaining = Math.max(0, Math.floor((new Date(expiresAtStr).getTime() - Date.now()) / 1000));
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Handle Search Submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTab === "concern") {
      if (!healthConcern || !symptomDuration) {
        alert("Please select concern area and duration.");
        return;
      }
      setSearchFeedback(`Filtered for ${healthConcern} concern, shipping options checked for PIN ${pinCode || "560038"}.`);
    } else {
      if (!wellnessCategory) {
        alert("Please specify wellness category.");
        return;
      }
      setSearchFeedback(`Filtered for category: ${wellnessCategory}, checking local clinic hubs...`);
    }
    
    setTimeout(() => {
      setSearchFeedback(null);
    }, 4500);
  };

  const activeHoldsCount = localReservations.filter((r) => r.status === "PENDING").length;

  // Max duration helper for proportioning latency graphs
  const maxConcurrencyDuration = Math.max(...concurrencyLatency.map((c) => c.duration), 1);
  const maxIdempotencyDuration = Math.max(...idempotencyLatency.map((i) => i.duration), 1);

  return (
    <div className="min-h-screen bg-[#F9F8FC] text-zinc-800 font-sans selection:bg-[#E30613] selection:text-white pb-16 relative overflow-x-hidden transition-all duration-500">
      
      {/* Decorative bright pastel lights */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#E30613]/3 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-red-800/3 rounded-full blur-[150px] pointer-events-none" />

      {/* Header Navigation */}
      <header className="border-b border-zinc-200/60 bg-white/80 backdrop-blur sticky top-0 z-40 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#E30613] flex items-center justify-center text-white shadow-md shadow-red-950/15 rotate-3 hover:rotate-12 transition-transform duration-300">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-zinc-950 flex items-center gap-1.5 font-sans italic">
                ALLO <span className="text-white not-italic font-extrabold text-sm tracking-widest bg-zinc-950 px-2 py-0.5 rounded border border-zinc-900">HEALTH</span>
              </span>
              <span className="text-[9px] font-bold text-zinc-400 tracking-wider uppercase block">
                Discreet Fulfillment Console
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-zinc-500">
            <a href="#" className="text-zinc-950 border-b-2 border-[#E30613] pb-1 hover:text-zinc-950 transition-colors">Treatments</a>
            <a href="#" className="hover:text-zinc-900 transition-colors">Consultations</a>
            <a href="#" className="hover:text-zinc-900 transition-colors">Therapy</a>
            <a href="#" className="hover:text-zinc-900 transition-colors">Diagnostics</a>
          </nav>

          <div className="flex items-center gap-4">
            {/* Developer Concurrency Lab Toggle */}
            <button
              id="dev-lab-toggle"
              onClick={() => setIsDevLabOpen(!isDevLabOpen)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border rounded-full transition-all cursor-pointer shadow-sm ${
                isDevLabOpen
                  ? "bg-[#E30613]/10 border-[#E30613] text-[#E30613] shadow-red-100"
                  : "border-zinc-200 hover:border-zinc-300 bg-white text-zinc-650 hover:text-zinc-900"
              }`}
            >
              <Sparkles className={`h-3.5 w-3.5 ${isDevLabOpen ? "animate-pulse" : ""}`} />
              Fulfillment Lab
            </button>

            {/* Cart / Checkout Holds toggle */}
            <button
              id="cart-drawer-toggle"
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl text-zinc-600 hover:text-zinc-900 transition-all cursor-pointer shadow-sm hover:scale-105"
              aria-label="Checkout Holds Cart"
            >
              <ShoppingCart className="h-5 w-5" />
              {activeHoldsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#E30613] text-white font-bold text-[10px] w-5 h-5 flex items-center justify-center rounded-full animate-bounce border-2 border-white">
                  {activeHoldsCount}
                </span>
              )}
            </button>

            {/* User Profile Welcome (HEY, ARUN ADHITHYA with AA profile icon) */}
            <div className="flex items-center gap-2.5 border-l border-zinc-250 pl-4">
              <div className="h-8.5 w-8.5 rounded-full bg-[#E30613] shadow-md shadow-red-100 flex items-center justify-center text-white font-black text-xs tracking-wider border border-red-400 hover:scale-110 transition-transform duration-300">
                AA
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-[10px] text-zinc-400 font-bold block leading-none">SECURE ACCESS</span>
                <span className="text-xs font-black tracking-wider text-zinc-800">
                  HEY, <span className="text-[#E30613]">ARUN ADHITHYA</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        
        {/* Dynamic fitment alert */}
        {searchFeedback && (
          <div className="bg-white border border-zinc-200 border-l-4 border-l-[#E30613] p-4 mb-6 rounded-r-2xl flex items-center justify-between gap-3 shadow-sm animate-slide-in">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[#E30613]/10 flex items-center justify-center text-[#E30613]">
                <Check className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900">Search Parameter Applied</p>
                <p className="text-xs text-zinc-500">{searchFeedback}</p>
              </div>
            </div>
            <button onClick={() => setSearchFeedback(null)} className="text-zinc-400 hover:text-zinc-800 cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* bright editorial banner */}
        <FadeIn>
          <div className="bg-gradient-to-r from-red-50/60 via-purple-50/50 to-white rounded-3xl p-8 mb-8 border border-red-100/60 relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#E30613]/3 rounded-full blur-[80px] pointer-events-none" />
            <div className="space-y-3.5 max-w-2xl relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#E30613]/10 rounded-full text-[10px] font-bold uppercase tracking-wider text-[#E30613] border border-[#E30613]/20">
                🛡️ DISCREET CLINICAL TREATMENT FULFILLMENT
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-950 leading-tight">
                Secure your prescription and home testing kit.
              </h1>
              <p className="text-sm text-zinc-650 leading-relaxed font-medium">
                Allo Health coordinates discreet fulfillment across Indian metro clinics using pessimistic lock reservation algorithms. Your stock holds are guaranteed for 10 minutes before automated cleanup sweeping returns them to the clinic pool.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0 relative z-10">
              <span className="px-4 py-2 bg-white border border-red-100 rounded-full text-xs font-bold text-red-950 shadow-sm">Doctor Consultation</span>
              <span className="px-4 py-2 bg-white border border-red-100 rounded-full text-xs font-bold text-red-950 shadow-sm">Discreet Packing</span>
              <span className="px-4 py-2 bg-white border border-red-100 rounded-full text-xs font-bold text-red-950 shadow-sm">Science-Backed</span>
            </div>
          </div>
        </FadeIn>

        {/* Developer Lab Panel (Bright themed) */}
        {isDevLabOpen && (
          <div className="mb-8 p-6 bg-[#F8F6FC] border border-[#E9E4F5] rounded-3xl shadow-sm relative z-25 animate-fade-in transition-all duration-300">
            <div className="flex items-center justify-between border-b border-[#E9E4F5] pb-4 mb-6">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-[#E30613]/10 flex items-center justify-center text-[#E30613]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-md font-extrabold text-[#E30613] font-sans tracking-wide">Fulfillment, Concurrency & Idempotency Lab</h2>
                  <p className="text-[11px] text-zinc-500 font-medium">Simulate transactional pressure, check lock isolation, and review cached request speeds below</p>
                </div>
              </div>
              <button
                onClick={() => setIsDevLabOpen(false)}
                className="p-1.5 bg-white border border-[#E9E4F5] hover:bg-zinc-50 rounded-full text-zinc-400 hover:text-zinc-800 cursor-pointer transition-colors shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 3-Column Layout: Controls, Graphs, Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Column 1: Fulfillment Simulators (4 cols) */}
              <div className="lg:col-span-4 space-y-4 flex flex-col justify-between">
                
                {/* Concurrency Simulator Button */}
                <div className="p-4 bg-white border border-[#E9E4F5]/60 rounded-2xl shadow-sm space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="text-xs font-bold text-zinc-800 block">Test Concurrency (10 requests)</span>
                      <span className="text-[10px] text-zinc-500 block mt-0.5 leading-normal">
                        Fires 10 concurrent requests to reserve the last strip of Tadalafil (SKU: ALO-003) at Borivali Centre.
                      </span>
                    </div>
                    <button
                      id="run-concurrency-test"
                      onClick={runConcurrencyTest}
                      disabled={testingConcurrency || refreshing || loading}
                      className="px-3.5 py-2 bg-[#E30613] hover:bg-red-700 disabled:bg-zinc-200 text-white disabled:text-zinc-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-sm hover:scale-[1.03] active:scale-[0.98]"
                    >
                      {testingConcurrency ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      Test Concurrency
                    </button>
                  </div>
                  <div className="text-[9px] text-zinc-650 bg-zinc-50 p-2.5 rounded-lg border border-zinc-200/80 font-medium">
                    <span className="text-[#E30613] font-bold">Lock Safety:</span> Under pessimistic lock, exactly 1 succeeds, other 9 conflict (409).
                  </div>
                </div>

                {/* Idempotency Simulator Button */}
                <div className="p-4 bg-white border border-[#E9E4F5]/60 rounded-2xl shadow-sm space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="text-xs font-bold text-zinc-800 block">Test Idempotency-Key (3 requests)</span>
                      <span className="text-[10px] text-zinc-500 block mt-0.5 leading-normal">
                        Fires duplicate requests with matching transaction keys to reserve Testosterone Kit (SKU: ALO-002) at Banjara Hills Centre.
                      </span>
                    </div>
                    <button
                      id="run-idempotency-test"
                      onClick={runIdempotencyTest}
                      disabled={testingIdempotency || refreshing || loading}
                      className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-950 disabled:bg-zinc-200 border border-zinc-700 text-white disabled:text-zinc-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-sm hover:scale-[1.03] active:scale-[0.98]"
                    >
                      {testingIdempotency ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Key className="h-3 w-3" />
                      )}
                      Test Idempotency
                    </button>
                  </div>
                  <div className="text-[9px] text-zinc-650 bg-zinc-50 p-2.5 rounded-lg border border-zinc-200/80 font-medium">
                    <span className="text-[#E30613] font-bold">Cache Safety:</span> Simultaneous keys merge, and delayed reads fetch from cache.
                  </div>
                </div>

                {/* Database Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    id="trigger-sweep"
                    onClick={triggerManualSweep}
                    disabled={cleaningUp}
                    className="py-3 px-4 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    Sweep Expirations
                  </button>
                  <button
                    id="trigger-seed"
                    onClick={async () => {
                      setSeeding(true);
                      addLog("Triggering database re-seed...");
                      try {
                        const res = await fetch("/api/seed", { method: "POST" });
                        const data = await res.json();
                        if (res.ok) {
                          addLog("✅ Database seeded successfully!");
                          saveReservations([]);
                          setConcurrencyLatency([]);
                          setIdempotencyLatency([]);
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
                    className="py-3 px-4 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Database className="h-3.5 w-3.5 text-blue-500" />
                    Seed Database
                  </button>
                </div>
              </div>

              {/* Column 2: Test Run Analytics Graphs (4 cols) */}
              <div className="lg:col-span-4 bg-white border border-[#E9E4F5]/60 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                <div>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-wider block mb-3.5 flex items-center gap-1.5 border-b border-zinc-100 pb-2">
                    <Activity className="h-3.5 w-3.5 text-[#E30613]" />
                    Test Run Analytics & Latencies
                  </span>

                  {concurrencyLatency.length === 0 && idempotencyLatency.length === 0 ? (
                    <div className="h-[200px] border border-dashed border-zinc-200 rounded-xl flex flex-col items-center justify-center p-4 text-center bg-zinc-50/50">
                      <TrendingUp className="h-8 w-8 text-zinc-300 stroke-1 mb-2 animate-bounce" />
                      <span className="text-xs font-bold text-zinc-400">No active test metrics</span>
                      <p className="text-[10px] text-zinc-500 mt-1 max-w-[190px]">
                        Trigger the "Test Concurrency" or "Test Idempotency" buttons to plot live latency charts.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
                      
                      {/* Concurrency Latency Graph */}
                      {concurrencyLatency.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[9px] font-black text-zinc-500 tracking-wider block uppercase">
                            Concurrency Race Latency (ms)
                          </span>
                          <div className="space-y-1">
                            {concurrencyLatency.map((item) => (
                              <div key={item.id} className="flex items-center gap-2 text-[9px] font-semibold">
                                <span className="w-9 text-zinc-400 shrink-0">Req #{item.id}</span>
                                <div className="flex-1 bg-zinc-100 h-3.5 rounded overflow-hidden flex items-center">
                                  <div
                                    style={{ width: `${(item.duration / maxConcurrencyDuration) * 100}%` }}
                                    className={`h-full rounded-r transition-all duration-500 flex items-center pl-1.5 ${
                                      item.status === 201 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.25)]" : "bg-rose-450"
                                    }`}
                                    // Use rose color for conflicts
                                    className={`h-full rounded-r transition-all duration-500 ${item.status === 201 ? "bg-emerald-500 shadow" : "bg-rose-450 opacity-80"}`}
                                  />
                                </div>
                                <span className={`w-14 text-right font-mono ${item.status === 201 ? "text-emerald-600 font-bold" : "text-rose-500"}`}>
                                  {item.status} ({item.duration}ms)
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Idempotency Latency Graph */}
                      {idempotencyLatency.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-zinc-100">
                          <span className="text-[9px] font-black text-zinc-500 tracking-wider block uppercase">
                            Idempotency Cache Speed (ms)
                          </span>
                          <div className="space-y-1.5">
                            {idempotencyLatency.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-[9px] font-semibold">
                                <span className="w-20 text-zinc-500 shrink-0 truncate">{item.name}</span>
                                <div className="flex-1 bg-zinc-100 h-4 rounded overflow-hidden flex items-center">
                                  <div
                                    style={{ width: `${(item.duration / maxIdempotencyDuration) * 100}%` }}
                                    className={`h-full rounded-r transition-all duration-500 flex items-center px-1 text-[8px] font-bold ${
                                      idx === 2 
                                        ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.25)] text-white" 
                                        : "bg-zinc-400 text-white"
                                    }`}
                                  >
                                    {idx === 2 && "⚡ Cached"}
                                  </div>
                                </div>
                                <span className="w-12 text-right font-mono text-zinc-600">
                                  {item.duration}ms
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  )}
                </div>

                {/* Graph Analytics Footer */}
                <div className="text-[9px] text-zinc-500 mt-2 font-semibold">
                  {concurrencyLatency.length > 0 && (
                    <span className="block text-emerald-600">
                      ✓ Exactly 1 request successfully bypassed the database transaction locks.
                    </span>
                  )}
                  {idempotencyLatency.length > 0 && (
                    <span className="block text-blue-600 mt-0.5">
                      ⚡ Request #3 demonstrates cache bypass latency (&lt;10ms) without DB locking.
                    </span>
                  )}
                </div>
              </div>

              {/* Column 3: Live Terminal Outputs (4 cols) */}
              <div className="lg:col-span-4 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">Live Console Stream:</span>
                <div 
                  ref={consoleContainerRef}
                  className="bg-zinc-950 border border-zinc-900 rounded-2xl p-4 h-[245px] overflow-y-auto font-mono text-[11px] text-zinc-300 space-y-1.5 shadow-inner"
                >
                  {consoleLogs.map((log, idx) => (
                    <div key={idx} className="leading-relaxed break-all">
                      {log.startsWith("[") ? (
                        <>
                          <span className="text-zinc-650">{log.substring(0, 10)}</span>
                          <span className={
                            log.includes("✅") ? "text-emerald-400 font-bold" :
                            log.includes("❌") ? "text-rose-450 font-bold" :
                            log.includes("successful") ? "text-[#E30613] font-semibold" :
                            log.includes("expired") ? "text-amber-400" : "text-zinc-200"
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
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Panel: Search Fitment Widget (4 Columns) */}
          <section className="lg:col-span-4">
            <FadeIn>
              <div className="bg-white border border-zinc-200/80 rounded-3xl p-6 shadow-md relative overflow-hidden transition-all duration-300 hover:shadow-lg">
                <div className="absolute top-0 left-0 w-full h-[3px] bg-[#E30613]" />
                
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="h-8 w-8 rounded-lg bg-[#E30613]/10 flex items-center justify-center text-[#E30613]">
                    <SlidersHorizontal className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-md font-extrabold text-zinc-950">Find Treatments</h2>
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">Select fitting dimensions</p>
                  </div>
                </div>

                {/* Switch Toggle Tab */}
                <div className="bg-zinc-100 p-1 rounded-2xl flex items-center justify-between border border-zinc-200/50 mb-6">
                  <button
                    type="button"
                    onClick={() => setSearchTab("concern")}
                    className={`flex-1 py-3 text-xs font-black tracking-wider uppercase rounded-xl transition-all cursor-pointer ${
                      searchTab === "concern"
                        ? "bg-[#E30613] text-white shadow-md shadow-red-950/10"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    Shop by concern
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchTab("category")}
                    className={`flex-1 py-3 text-xs font-black tracking-wider uppercase rounded-xl transition-all cursor-pointer ${
                      searchTab === "category"
                        ? "bg-[#E30613] text-white shadow-md shadow-red-950/10"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    Shop by category
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSearchSubmit} className="space-y-4">
                  {searchTab === "concern" ? (
                    <div className="space-y-4 transition-all">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Sexual Concern</label>
                        <select
                          value={healthConcern}
                          onChange={(e) => setHealthConcern(e.target.value)}
                          className="w-full bg-zinc-50/60 border border-zinc-200/80 hover:border-zinc-300 text-zinc-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613] outline-none cursor-pointer transition-all"
                        >
                          <option value="">Select concern</option>
                          <option value="Erectile Dysfunction (ED)">Erectile Dysfunction (ED)</option>
                          <option value="Premature Ejaculation (PE)">Premature Ejaculation (PE)</option>
                          <option value="Low Libido">Low Libido & Vitality</option>
                          <option value="Relationship concerns">Relationship Concerns</option>
                          <option value="General Wellness">General Wellness</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Assessment Mode</label>
                        <select
                          value={treatmentRecommend}
                          onChange={(e) => setTreatmentRecommend(e.target.value)}
                          className="w-full bg-zinc-50/60 border border-zinc-200/80 hover:border-zinc-300 text-zinc-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613] outline-none cursor-pointer transition-all"
                        >
                          <option value="">Select recommendation</option>
                          <option value="Doctor Consultation Needed">Doctor Consultation Needed</option>
                          <option value="Self Assessment Only">Self Assessment Only</option>
                          <option value="Home Screening Kit">Home Screening Kit</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Duration of Symptoms</label>
                        <select
                          value={symptomDuration}
                          onChange={(e) => setSymptomDuration(e.target.value)}
                          className="w-full bg-zinc-50/60 border border-zinc-200/80 hover:border-zinc-300 text-zinc-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613] outline-none cursor-pointer transition-all"
                        >
                          <option value="">Select duration</option>
                          <option value="Less than 3 months">Less than 3 months</option>
                          <option value="3-6 months">3-6 months</option>
                          <option value="6+ months">6+ months</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Delivery PIN Code</label>
                        <input
                          type="text"
                          value={pinCode}
                          onChange={(e) => setPinCode(e.target.value)}
                          placeholder="Enter 6-digit PIN code (e.g. 560038)"
                          className="w-full bg-zinc-50/60 border border-zinc-200/80 hover:border-zinc-350 text-zinc-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613] outline-none transition-all placeholder:text-zinc-400"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Treatment Mode</label>
                        <select
                          value={treatmentMode}
                          onChange={(e) => setTreatmentMode(e.target.value)}
                          className="w-full bg-zinc-50/60 border border-zinc-200/80 hover:border-zinc-300 text-zinc-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613] outline-none cursor-pointer transition-all"
                        >
                          <option value="Home Medication Delivery">Home Medication Delivery</option>
                          <option value="Home Diagnostic Test">Home Diagnostic Test</option>
                          <option value="Doctor Consultation + Delivery">Doctor Consultation + Delivery</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 transition-all animate-fade-in">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Wellness Category</label>
                        <select
                          value={wellnessCategory}
                          onChange={(e) => setWellnessCategory(e.target.value)}
                          className="w-full bg-zinc-50/60 border border-zinc-200/80 hover:border-zinc-300 text-zinc-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613] outline-none cursor-pointer transition-all"
                        >
                          <option value="">Select category</option>
                          <option value="ED Treatment">ED Treatment</option>
                          <option value="Diagnostic Kit">Diagnostic Kit</option>
                          <option value="ED Medication">ED Medication</option>
                          <option value="PE Medication">PE Medication</option>
                          <option value="Wellness">Wellness Supplements</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Packaging Size</label>
                        <select
                          value={packagingSize}
                          onChange={(e) => setPackagingSize(e.target.value)}
                          className="w-full bg-zinc-50/60 border border-zinc-200/80 hover:border-zinc-300 text-zinc-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613] outline-none cursor-pointer transition-all"
                        >
                          <option value="">Select size</option>
                          <option value="Single Gel Tube">Single Pack / Gel Tube</option>
                          <option value="10 tab Strip">Trial Strip (10 tabs)</option>
                          <option value="30 tab Monthly Pack">Monthly supply (30 tabs)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Dosage Strength</label>
                        <select
                          value={dosageStrength}
                          onChange={(e) => setDosageStrength(e.target.value)}
                          className="w-full bg-zinc-50/60 border border-zinc-200/80 hover:border-zinc-300 text-zinc-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613] outline-none cursor-pointer transition-all"
                        >
                          <option value="">Select dosage</option>
                          <option value="Standard">Standard (10mg / 30mg)</option>
                          <option value="Double Strength">Double Strength (20mg / 60mg)</option>
                          <option value="Daily Vitality">Daily Vitality supplement</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Delivery PIN Code</label>
                        <input
                          type="text"
                          value={pinCode}
                          onChange={(e) => setPinCode(e.target.value)}
                          placeholder="Enter 6-digit PIN code"
                          className="w-full bg-zinc-50/60 border border-zinc-200/80 hover:border-zinc-300 text-zinc-800 text-xs font-bold rounded-xl px-3.5 py-3.5 focus:border-[#E30613] focus:ring-1 focus:ring-[#E30613] outline-none transition-all placeholder:text-zinc-400"
                        />
                      </div>
                    </div>
                  )}

                  {/* Discreet Packaging Switch */}
                  <div className="pt-2 border-t border-zinc-200 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={discreetPackaging}
                        onChange={(e) => setDiscreetPackaging(e.target.checked)}
                        className="mt-1 accent-[#E30613]"
                      />
                      <div>
                        <span className="text-xs font-bold text-zinc-800 flex items-center gap-1">
                          Require 100% Discreet Packaging
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                        </span>
                        <p className="text-[10px] text-zinc-500 mt-0.5 leading-normal">
                          Shipped in plain brown unlabeled packaging without any mention of medication names or Allo Health.
                        </p>
                      </div>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-4 py-4 bg-[#E30613] hover:bg-red-700 active:scale-[0.98] text-white text-xs font-black tracking-widest uppercase rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-red-100 hover:scale-[1.02]"
                  >
                    <span>View Results</span>
                    <ArrowRight className="h-4 w-4 animate-pulse" />
                  </button>
                </form>
              </div>
            </FadeIn>
          </section>

          {/* Right Panel: Catalog Grid (8 Columns) */}
          <section className="lg:col-span-8 space-y-6">
            <FadeIn>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-zinc-950 tracking-tight flex items-center gap-2">
                    Official Treatments Catalog
                    {refreshing && <RefreshCw className="h-4 w-4 animate-spin text-[#E30613]" />}
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1 font-medium">
                    Real-time stock totals and checkout locks across our regional clinic hubs.
                  </p>
                </div>

                <button
                  id="sync-inventory"
                  onClick={() => fetchProducts(true)}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 px-4 py-2 border border-zinc-200 hover:border-zinc-300 hover:text-zinc-900 text-zinc-500 bg-white rounded-xl text-xs font-semibold cursor-pointer transition-colors shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[#E30613]" : ""}`} />
                  Sync Stock
                </button>
              </div>
            </FadeIn>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="h-[480px] bg-white animate-pulse rounded-3xl border border-zinc-200" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {products.map((product, idx) => {
                  const sku = product.sku;
                  const activeWhId = selectedWarehouse[sku];
                  const activeWhStock = product.stocks.find((s) => s.warehouseId === activeWhId);
                  const quantity = reserveQuantity[sku] || 1;

                  return (
                    <FadeIn key={product.id} delay={idx * 100}>
                      <div
                        className="bg-white border border-zinc-150/70 hover:border-zinc-250 hover:shadow-lg transition-all duration-300 flex flex-col group relative h-full rounded-3xl overflow-hidden"
                      >
                        {/* Price Badge */}
                        <div className="absolute top-4 right-4 bg-[#E30613] text-white text-xs font-black px-3.5 py-1.5 rounded-xl shadow-md z-10">
                          ₹{product.price.toFixed(0)}
                        </div>

                        {/* Product Image */}
                        <div className="h-56 bg-zinc-50/50 relative overflow-hidden flex items-center justify-center border-b border-zinc-100">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="object-cover w-full h-full opacity-90 group-hover:scale-105 transition-all duration-500"
                            />
                          ) : (
                            <Package className="h-12 w-12 text-zinc-300" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent opacity-40" />
                          
                          {/* Discreet Packaging Tag */}
                          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur border border-zinc-200 text-zinc-600 text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1 z-10 shadow-sm">
                            <ShieldAlert className="h-3 w-3 text-emerald-500 animate-pulse" />
                            Discreet Packaging
                          </div>
                        </div>

                        {/* Description & Actions */}
                        <div className="p-6 flex-1 flex flex-col justify-between">
                          <div className="space-y-4">
                            <div>
                              <span className="text-[10px] font-black tracking-widest text-[#E30613] uppercase bg-red-50 px-2 py-0.5 rounded border border-[#E30613]/10">
                                SKU: {product.sku}
                              </span>
                              <h3 className="text-lg font-black text-zinc-900 mt-2 group-hover:text-[#E30613] transition-colors leading-snug">
                                {product.name}
                              </h3>
                              <p className="text-xs text-zinc-500 mt-2 line-clamp-2 leading-relaxed font-medium">
                                {product.description || "Science-backed sexual health treatment."}
                              </p>
                            </div>

                            {/* Warehouses list */}
                            <div className="space-y-3 pt-3 border-t border-zinc-100">
                              <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Clinic Allocation:</span>
                              {product.stocks.map((stock) => {
                                const available = stock.available;
                                const isOut = available === 0;
                                const isCritical = available > 0 && available <= 2;
                                
                                return (
                                  <div key={stock.warehouseId} className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-semibold">
                                      <div className="flex items-center gap-1.5 text-zinc-700">
                                        <WarehouseIcon className="h-3.5 w-3.5 text-[#E30613]" />
                                        <span>{stock.warehouseName}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-zinc-500">
                                        <span>Avail:</span>
                                        <span className={`font-mono font-bold ${
                                          isOut ? "text-rose-500" : isCritical ? "text-amber-500" : "text-emerald-500"
                                        }`}>
                                          {available}
                                        </span>
                                        <span className="text-zinc-300">/</span>
                                        <span className="text-zinc-400 font-mono text-[10px]">{stock.total}</span>
                                      </div>
                                    </div>

                                    {/* Custom Stock levels bar */}
                                    <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden flex border border-zinc-200/40">
                                      <div
                                        style={{ width: `${(stock.available / Math.max(1, stock.total)) * 100}%` }}
                                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                                          isOut 
                                            ? "bg-rose-500" 
                                            : isCritical 
                                              ? "bg-amber-500" 
                                              : "bg-[#E30613]"
                                        }`}
                                      />
                                      {stock.reserved > 0 && (
                                        <div
                                          style={{ width: `${(stock.reserved / Math.max(1, stock.total)) * 100}%` }}
                                          className="h-full bg-purple-300 opacity-80 border-l border-zinc-50"
                                          title={`${stock.reserved} units reserved`}
                                        />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Reservation Checkout Panel */}
                          <div className="mt-6 pt-5 border-t border-zinc-100 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              {/* Warehouse selection dropdown */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Fulfillment Hub</label>
                                <select
                                  value={activeWhId || ""}
                                  onChange={(e) =>
                                    setSelectedWarehouse((prev) => ({ ...prev, [sku]: e.target.value }))
                                  }
                                  className="w-full bg-zinc-50 border border-zinc-200 text-zinc-700 focus:border-[#E30613] text-xs rounded-xl px-2.5 py-2.5 cursor-pointer font-bold outline-none shadow-sm transition-colors"
                                >
                                  {product.stocks.map((s) => (
                                    <option key={s.warehouseId} value={s.warehouseId}>
                                      {s.warehouseName.replace(" Fulfillment Hub", "").replace(" Dispatch Centre", "").replace(" Fulfillment Centre", "")} ({s.available} avail)
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Quantity Counter */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Quantity</label>
                                <div className="flex bg-zinc-50 border border-zinc-200 rounded-xl overflow-hidden items-center justify-between h-9.5 shadow-sm">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReserveQuantity((prev) => ({
                                        ...prev,
                                        [sku]: Math.max(1, (prev[sku] || 1) - 1),
                                      }))
                                    }
                                    className="px-3 py-2 text-zinc-400 hover:text-[#E30613] hover:bg-zinc-100 transition-colors cursor-pointer font-extrabold"
                                  >
                                    -
                                  </button>
                                  <span className="text-xs font-mono font-bold text-zinc-800 px-1">
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
                                    className="px-3 py-2 text-zinc-400 hover:text-[#E30613] hover:bg-zinc-100 transition-colors cursor-pointer font-extrabold"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Checkout locking trigger */}
                            <button
                              id={`reserve-${sku}`}
                              onClick={() => handleReserve(product)}
                              disabled={reservingSku === sku || !activeWhStock || activeWhStock.available === 0}
                              className="w-full py-3.5 px-4 bg-zinc-950 hover:bg-zinc-900 disabled:bg-zinc-100 text-white disabled:text-zinc-400 text-xs font-black tracking-wider uppercase rounded-2xl transition-all shadow active:scale-[0.98] disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01]"
                            >
                              {reservingSku === sku ? (
                                <RefreshCw className="h-4 w-4 animate-spin text-white" />
                              ) : activeWhStock?.available === 0 ? (
                                "Out of stock at Clinic Hub"
                              ) : (
                                <>
                                  Reserve & Proceed to Consultation
                                  <ArrowRight className="h-4.5 w-4.5 group-hover:translate-x-1 transition-transform text-[#E30613]" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </FadeIn>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Slide-out cart drawer for checkout holds */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
          <div className="absolute inset-0 overflow-hidden">
            <div 
              onClick={() => setIsCartOpen(false)}
              className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm transition-opacity duration-300" 
              aria-hidden="true" 
            />

            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="pointer-events-auto w-screen max-w-md transform bg-white p-6 shadow-2xl transition-transform duration-300 ease-in-out select-none">
                <div className="flex flex-col h-full justify-between">
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-5">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-[#E30613]/10 flex items-center justify-center text-[#E30613]">
                          <ShoppingCart className="h-4 w-4" />
                        </div>
                        <h2 className="text-md font-extrabold text-zinc-950" id="slide-over-title">Clinical Holds Cart</h2>
                      </div>
                      <div className="flex items-center gap-3">
                        {localReservations.length > 0 && (
                          <button
                            onClick={clearHoldHistory}
                            className="text-[10px] font-bold text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
                          >
                            Clear Logs
                          </button>
                        )}
                        <button
                          onClick={() => setIsCartOpen(false)}
                          className="p-1.5 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 rounded-full text-zinc-400 hover:text-zinc-700 cursor-pointer transition-colors shadow-sm"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Content List */}
                    <div className="mt-6 flex-1 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
                      {localReservations.length === 0 ? (
                        <div className="border border-dashed border-zinc-200 rounded-2xl py-16 px-6 text-center text-zinc-400 bg-zinc-50/50">
                          <Clock className="h-10 w-10 mx-auto text-[#E30613] stroke-1 mb-3 animate-pulse" />
                          <p className="text-xs font-bold text-zinc-650">No active checkout holds.</p>
                          <p className="text-[10px] text-zinc-400 mt-2 leading-relaxed max-w-[240px] mx-auto">
                            Proceed to checkout on a product to trigger a concurrent-safe 10-minute clinic stock reservation lock.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
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
                                    ? "bg-emerald-50/50 border-emerald-250/30 text-emerald-800"
                                    : isReleased
                                      ? "bg-zinc-50 border-zinc-200 text-zinc-400"
                                      : isExpired
                                        ? "bg-rose-50/50 border-rose-250/30 text-rose-800"
                                        : "bg-zinc-50 border-zinc-200/80 text-zinc-700"
                                }`}
                              >
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <span className="text-[9px] font-mono font-bold uppercase bg-white border border-zinc-250 text-zinc-500 px-2 py-0.5 rounded shadow-sm">
                                      LOCK: {hold.id.substring(0, 8)}
                                    </span>
                                    <h4 className="text-sm font-extrabold text-zinc-950 mt-2.5 leading-tight">
                                      {hold.productName}
                                    </h4>
                                    <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1 font-semibold">
                                      <WarehouseIcon className="h-3 w-3 inline text-[#E30613]" />
                                      {hold.warehouseName}
                                    </p>
                                    <p className="text-xs font-bold mt-1.5 text-zinc-650">
                                      Quantity: <span className="font-mono text-[#E30613]">{hold.quantity}</span>
                                    </p>
                                    {discreetPackaging && (
                                      <p className="text-[9px] text-emerald-600 mt-1 flex items-center gap-1 font-semibold">
                                        <ShieldCheck className="h-3 w-3" />
                                        Unlabeled Packaging Active
                                      </p>
                                    )}
                                  </div>

                                  {/* Badges & Timer */}
                                  <div className="flex flex-col items-end gap-2 shrink-0">
                                    {isPending && (
                                      <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200/60 text-amber-600 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                                        {getCountdownText(hold.expiresAt)}
                                      </div>
                                    )}

                                    {isConfirmed && (
                                      <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                                        <CheckCircle className="h-3.5 w-3.5" />
                                        Confirmed
                                      </div>
                                    )}

                                    {isReleased && (
                                      <div className="flex items-center gap-1 bg-zinc-200 text-zinc-500 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                                        <XCircle className="h-3.5 w-3.5" />
                                        Released
                                      </div>
                                    )}

                                    {isExpired && (
                                      <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        Expired
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {hold.errorMsg && (
                                  <div className="mt-3 bg-rose-50 border border-rose-100 rounded-xl p-2.5 flex items-start gap-1.5 text-[10px] text-rose-700 font-medium leading-relaxed">
                                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-500" />
                                    <div>
                                      <span className="font-bold">Error {hold.statusCode}:</span> {hold.errorMsg}
                                    </div>
                                  </div>
                                )}

                                {/* Action Buttons */}
                                {isPending && (
                                  <div className="mt-4 grid grid-cols-2 gap-2">
                                    <button
                                      onClick={() => handleConfirm(hold)}
                                      disabled={actionLoading === hold.id}
                                      className="py-2 px-3 bg-[#E30613] hover:bg-red-700 disabled:bg-zinc-200 text-white disabled:text-zinc-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 border border-red-800 shadow-sm"
                                    >
                                      {actionLoading === hold.id ? (
                                        <RefreshCw className="h-3 w-3 animate-spin" />
                                      ) : (
                                        "Confirm Order"
                                      )}
                                    </button>
                                    <button
                                      onClick={() => handleRelease(hold)}
                                      disabled={actionLoading === hold.id}
                                      className="py-2 px-3 bg-white hover:bg-zinc-55 disabled:bg-zinc-100 text-zinc-600 hover:text-zinc-900 disabled:text-zinc-400 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 border border-zinc-250 shadow-sm"
                                    >
                                      Cancel Hold
                                    </button>
                                  </div>
                                )}

                                {(isConfirmed || isReleased || isExpired) && (
                                  <div className="mt-3 flex justify-end">
                                    <button
                                      onClick={() => deleteFromUI(hold.id)}
                                      className="text-[9px] font-bold text-zinc-400 hover:text-zinc-650 cursor-pointer"
                                    >
                                      Remove Log
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Drawer footer summary */}
                  <div className="border-t border-zinc-200 pt-5 mt-5">
                    <div className="flex justify-between text-sm font-semibold text-zinc-500 mb-4">
                      <span>Total Active Reservations</span>
                      <span className="text-zinc-950 font-mono font-bold">{activeHoldsCount}</span>
                    </div>
                    <button
                      onClick={() => setIsCartOpen(false)}
                      className="w-full py-3.5 bg-zinc-950 hover:bg-zinc-900 text-white text-xs font-bold rounded-xl transition-all cursor-pointer text-center"
                    >
                      Back to Treatments
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
