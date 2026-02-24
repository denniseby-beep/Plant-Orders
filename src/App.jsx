// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/*
===========================================================
SUPABASE TABLE (orders) COLUMNS YOU NEED
===========================================================
orders:
- id uuid/text PK
- created_at timestamptz
- updated_at timestamptz
- completed_at timestamptz
- cancelled_at timestamptz

- customer text
- mix_type text
- quantity_tonne numeric
- load_time text (HH:MM)
- order_date date

- job_number text
- po_number text
- foreman text
- status text

- pail_of_colas boolean default false

NEW:
- address text
- planned_13 int default 0
- planned_38 int default 0
- loaded_13 int default 0
- loaded_38 int default 0

customers:
- name text UNIQUE
- is_active boolean default true

products:
- name text UNIQUE
- is_active boolean default true
*/

/* ==================== Storage keys ==================== */
const STORAGE_KEYS = {
  contractors: "plant_orders_contractors_v1",
  mixes: "plant_orders_mixes_v1",
  orders: "plant_orders_orders_v1",
  ui: "plant_orders_ui_v1",
};

/* ==================== Defaults ==================== */
const DEFAULTS = {
  quantityPresets: [1, 3, 5, 10, 13, 38],
  contractors: ["City Works", "Ridgeview Homes", "Highway Paving", "Westside Developments"],
  mixes: ["Mix 12.5", "Mix 19.0", "Mix 25.0"],
};

/* ==================== Truck sizes ==================== */
const LOAD_13 = 13; // 13 tonne (2x)
const LOAD_38 = 38; // 38 tonne (T4)

/* ==================== Status model ==================== */
const STATUS = {
  UNACK: "Unacknowledged",
  ACK: "Acknowledged",
  LOADED: "Loaded",
  COMPLETE: "Completed",
  CANCELLED: "Cancelled",
};
const STATUS_CYCLE = [STATUS.ACK, STATUS.LOADED, STATUS.COMPLETE];

/* ==================== Helpers ==================== */
function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeStatus(s) {
  const v = String(s || "").trim().toLowerCase();
  if (v === "unacknowledged" || v === "unack") return STATUS.UNACK;
  if (v === "acknowledged" || v === "ack") return STATUS.ACK;
  if (v === "loaded") return STATUS.LOADED;
  if (v === "completed" || v === "complete") return STATUS.COMPLETE;
  if (v === "canceled" || v === "cancelled" || v === "cancel") return STATUS.CANCELLED;
  return STATUS.UNACK;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Local date -> YYYY-MM-DD */
function toLocalISODate(d = new Date()) {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

function addDays(yyyyMmDd, delta) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toLocalISODate(dt);
}

function nowISO() {
  return new Date().toISOString();
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function minutesUntil(loadTimeHHmm, orderDateYYYYMMDD) {
  if (!loadTimeHHmm || !orderDateYYYYMMDD) return null;
  const [y, m, d] = orderDateYYYYMMDD.split("-").map((x) => Number(x));
  const [hh, mm] = loadTimeHHmm.split(":").map((x) => Number(x));
  if ([y, m, d, hh, mm].some((x) => Number.isNaN(x))) return null;

  const target = new Date(y, m - 1, d, hh, mm, 0, 0);
  const diffMs = target.getTime() - Date.now();
  return Math.round(diffMs / 60000);
}

function clampNumber(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.min(max, Math.max(min, x));
}

function clampInt(n, min, max) {
  const x = Number.parseInt(String(n), 10);
  if (!Number.isFinite(x)) return null;
  return Math.min(max, Math.max(min, x));
}

/* ==================== Depletion math ==================== */
function loadedTonnes(o) {
  const l13 = Number(o.loaded13 || 0);
  const l38 = Number(o.loaded38 || 0);
  return l13 * LOAD_13 + l38 * LOAD_38;
}
function remainingTonnes(o) {
  const qty = Number(o.quantityTonne || 0);
  return Math.max(0, qty - loadedTonnes(o));
}

/* ==================== Supabase mapping ==================== */
function toDbOrder(o) {
  return {
    id: o.id,
    created_at: o.createdAt ?? null,
    updated_at: o.updatedAt ?? null,
    completed_at: o.completedAt ?? null,
    cancelled_at: o.cancelledAt ?? null,

    customer: o.customer ?? "",
    mix_type: o.mixType ?? "",
    quantity_tonne: o.quantityTonne ?? null,

    load_time: o.loadTime ?? "",
    order_date: o.orderDate ?? null,

    job_number: o.jobNumber ?? "",
    po_number: o.poNumber ?? "",
    foreman: o.foreman ?? "",
    status: o.status ?? STATUS.UNACK,

    pail_of_colas: Boolean(o.pailOfColas),

    address: o.address ?? "",
    planned_13: Number(o.planned13 ?? 0),
    planned_38: Number(o.planned38 ?? 0),
    loaded_13: Number(o.loaded13 ?? 0),
    loaded_38: Number(o.loaded38 ?? 0),
  };
}

function fromDbOrder(r) {
  const normalizedOrderDate = r.order_date
    ? String(r.order_date).slice(0, 10)
    : r.orderDate
    ? String(r.orderDate).slice(0, 10)
    : toLocalISODate();

  const qRaw = r.quantity_tonne ?? r.quantityTonne ?? r.quantity ?? r.Quantity ?? null;
  const qNum = qRaw === "" || qRaw == null ? null : Number(qRaw);

  return {
    id: r.id,

    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    completedAt: r.completed_at ?? null,
    cancelledAt: r.cancelled_at ?? null,

    customer: r.customer ?? "",
    mixType: r.mix_type ?? r["Mix Type"] ?? "",
    quantityTonne: Number.isFinite(qNum) ? qNum : null,

    loadTime: r.load_time ?? "",
    orderDate: normalizedOrderDate,

    jobNumber: r.job_number ?? "",
    poNumber: r.po_number ?? "",
    foreman: r.foreman ?? "",
    status: normalizeStatus(r.status),

    pailOfColas: Boolean(r.pail_of_colas ?? r.pailOfColas ?? false),

    address: r.address ?? "",
    planned13: Number(r.planned_13 ?? r.planned13 ?? 0),
    planned38: Number(r.planned_38 ?? r.planned38 ?? 0),
    loaded13: Number(r.loaded_13 ?? r.loaded13 ?? 0),
    loaded38: Number(r.loaded_38 ?? r.loaded38 ?? 0),
  };
}

async function updateOrderInCloud(supabase, orderId, patch) {
  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
  if (error) throw error;
  return true;
}

/* ==================== App ==================== */
export default function App() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  const supabaseEnabled = Boolean(envUrl && envKey);

  const supabase = useMemo(() => {
    if (!supabaseEnabled) return null;
    return createClient(envUrl, envKey);
  }, [envUrl, envKey, supabaseEnabled]);

  async function testDbWrites() {
    if (!supabase) return alert("Supabase is OFF (env vars missing).");

    const stamp = Date.now();

    const cust = await supabase.from("customers").insert([{ name: "TEST CUSTOMER " + stamp, is_active: true }]).select();
    const prod = await supabase.from("products").insert([{ name: "TEST PRODUCT " + stamp, is_active: true }]).select();

    console.log("TEST INSERT customers:", cust);
    console.log("TEST INSERT products:", prod);

    alert(`customers: ${cust.error ? cust.error.message : "OK"}\nproducts: ${prod.error ? prod.error.message : "OK"}`);
  }

  // UI prefs
  const [darkMode, setDarkMode] = useState(false);
  const [bigMode, setBigMode] = useState(false);

  // Date selection
  const [selectedDate, setSelectedDate] = useState(toLocalISODate());
  const [showCompleted, setShowCompleted] = useState(false);

  // Local config lists (used by Setup panel)
  const [contractors, setContractors] = useState(DEFAULTS.contractors);
  const [mixes, setMixes] = useState(DEFAULTS.mixes);

  // Orders
  const [orders, setOrders] = useState([]);

  // Cloud lists (used by datalist pickers)
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // New order form
  const [customer, setCustomer] = useState("");
  const [mixType, setMixType] = useState("");
  const [quantityTonne, setQuantityTonne] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [foreman, setForeman] = useState("");
  const [loadTime, setLoadTime] = useState(""); // HH:MM
  const [orderDate, setOrderDate] = useState(toLocalISODate());
  const [pailOfColas, setPailOfColas] = useState(false);

  // NEW fields
  const [address, setAddress] = useState("");
  const [planned13, setPlanned13] = useState("");
  const [planned38, setPlanned38] = useState("");

  // Edit modal
  const [editingId, setEditingId] = useState(null);
  const editingOrder = useMemo(() => orders.find((o) => o.id === editingId) || null, [orders, editingId]);
  const [editDraft, setEditDraft] = useState(null);

  // Config panel
  const [configOpen, setConfigOpen] = useState(false);
  const [newContractorName, setNewContractorName] = useState("");
  const [newMixName, setNewMixName] = useState("");

  // Supabase status
  const [cloudStatus, setCloudStatus] = useState(supabaseEnabled ? "Cloud: Ready" : "Cloud: OFF (missing env)");
  const [cloudError, setCloudError] = useState("");
  const syncingRef = useRef(false);

  async function loadLists() {
    if (!supabase) return;

    const custRes = await supabase.from("customers").select("name, is_active").order("name");
    const prodRes = await supabase.from("products").select("name, is_active").order("name");

    if (custRes.error) console.log("customers load error", custRes.error);
    else {
      const names = (custRes.data || [])
        .filter((r) => r.is_active === true || r.is_active == null)
        .map((r) => r.name);
      setCustomers(names);
    }

    if (prodRes.error) console.log("products load error", prodRes.error);
    else {
      const names = (prodRes.data || [])
        .filter((r) => r.is_active === true || r.is_active == null)
        .map((r) => r.name);
      setProducts(names);
    }
  }

  async function ensureCustomerInDb(name) {
    if (!supabase) return;
    const n = String(name || "").trim();
    if (!n) return;

    const { error } = await supabase.from("customers").upsert([{ name: n, is_active: true }], { onConflict: "name" });

    if (error) {
      console.error("ensureCustomerInDb error:", error);
      alert("Customer DB save failed: " + error.message);
    }
  }

  async function ensureProductInDb(name) {
    if (!supabase) return;
    const n = String(name || "").trim();
    if (!n) return;

    const { error } = await supabase.from("products").upsert([{ name: n, is_active: true }], { onConflict: "name" });

    if (error) {
      console.error("ensureProductInDb error:", error);
      alert("Product DB save failed: " + error.message);
    }
  }

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* -------------------- Load from localStorage -------------------- */
  useEffect(() => {
    const savedContractors = safeJsonParse(localStorage.getItem(STORAGE_KEYS.contractors), null);
    const savedMixes = safeJsonParse(localStorage.getItem(STORAGE_KEYS.mixes), null);
    const savedOrders = safeJsonParse(localStorage.getItem(STORAGE_KEYS.orders), null);
    const savedUi = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ui), null);

    if (Array.isArray(savedContractors) && savedContractors.length) setContractors(savedContractors);
    if (Array.isArray(savedMixes) && savedMixes.length) setMixes(savedMixes);
    if (Array.isArray(savedOrders)) setOrders(savedOrders);

    if (savedUi && typeof savedUi === "object") {
      if (typeof savedUi.darkMode === "boolean") setDarkMode(savedUi.darkMode);
      if (typeof savedUi.bigMode === "boolean") setBigMode(savedUi.bigMode);
      if (typeof savedUi.selectedDate === "string") setSelectedDate(savedUi.selectedDate);
      if (typeof savedUi.showCompleted === "boolean") setShowCompleted(savedUi.showCompleted);
    }
  }, []);

  /* -------------------- Save to localStorage -------------------- */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.contractors, JSON.stringify(contractors));
  }, [contractors]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.mixes, JSON.stringify(mixes));
  }, [mixes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ui, JSON.stringify({ darkMode, bigMode, selectedDate, showCompleted }));
  }, [darkMode, bigMode, selectedDate, showCompleted]);

  /* -------------------- Theme + sizing -------------------- */
  const ui = useMemo(() => {
    const scale = bigMode ? 1.18 : 1.0;
    const card = darkMode ? "#111827" : "#ffffff";
    const bg = darkMode ? "#0b0f17" : "#f6f7fb";
    const text = darkMode ? "#e5e7eb" : "#0f172a";
    const muted = darkMode ? "#9ca3af" : "#64748b";
    const border = darkMode ? "#223047" : "#e5e7eb";
    const accent = "#2563eb";
    const ok = "#16a34a";
    const warn = "#f59e0b";
    const danger = "#dc2626";
    return { scale, card, bg, text, muted, border, accent, ok, warn, danger };
  }, [darkMode, bigMode]);

  useEffect(() => {
    document.documentElement.style.background = ui.bg;
    document.body.style.background = ui.bg;
    document.body.style.margin = "0";
    document.body.style.color = ui.text;
    document.body.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
  }, [ui.bg, ui.text]);

  /* -------------------- Cloud: Pull all orders -------------------- */
  async function cloudPull() {
    if (!supabase) {
      setCloudStatus("Cloud: OFF");
      return;
    }
    try {
      setCloudError("");
      setCloudStatus("Cloud: Pulling…");
      syncingRef.current = true;

      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;

      const mapped = Array.isArray(data) ? data.map(fromDbOrder) : [];
      setOrders(mapped);

      setCloudStatus(`Cloud: Pulled ${mapped.length} rows`);
    } catch (e) {
      setCloudStatus("Cloud: Error");
      setCloudError(String(e?.message || e));
    } finally {
      syncingRef.current = false;
    }
  }

  /* -------------------- Cloud: Upsert a single order -------------------- */
  async function cloudUpsert(orderObj) {
    if (!supabase) return;
    try {
      setCloudError("");
      setCloudStatus("Cloud: Saving…");

      const payload = toDbOrder(orderObj);
      const { error } = await supabase.from("orders").upsert(payload, { onConflict: "id" });
      if (error) throw error;

      setCloudStatus("Cloud: Saved");
    } catch (e) {
      setCloudStatus("Cloud: Error");
      setCloudError(String(e?.message || e));
    }
  }

  // Pull once when client is available
  useEffect(() => {
    if (supabase) cloudPull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* -------------------- Date feature: filter board by selectedDate -------------------- */
  const ordersForSelectedDate = useMemo(() => {
    return orders
      .filter((o) => o.orderDate === selectedDate)
      .filter((o) => (showCompleted ? true : o.status !== STATUS.COMPLETE))
      .filter((o) => o.status !== STATUS.CANCELLED)
      .sort((a, b) => {
        const tA = a.loadTime || "99:99";
        const tB = b.loadTime || "99:99";
        if (tA < tB) return -1;
        if (tA > tB) return 1;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      });
  }, [orders, selectedDate, showCompleted]);

  // 3-column buckets
  const boardCols = useMemo(() => {
    const list = ordersForSelectedDate;
    return {
      unack: list.filter((o) => o.status === STATUS.UNACK),
      ack: list.filter((o) => o.status === STATUS.ACK),
      loaded: list.filter((o) => o.status === STATUS.LOADED),
      complete: list.filter((o) => o.status === STATUS.COMPLETE),
    };
  }, [ordersForSelectedDate]);

  /* -------------------- Dashboard: remaining tonnes by mix -------------------- */
  const remainingByMix = useMemo(() => {
    const map = new Map();
    for (const o of orders.filter((x) => x.orderDate === selectedDate)) {
      if (o.status === STATUS.CANCELLED) continue;
      if (o.status === STATUS.COMPLETE) continue;
      const mix = o.mixType || "(No Mix)";
      const qty = remainingTonnes(o);
      map.set(mix, (map.get(mix) || 0) + (Number.isFinite(qty) ? qty : 0));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders, selectedDate]);

  const totalsForDate = useMemo(() => {
    let completed = 0;
    let pending = 0;

    for (const o of orders.filter((x) => x.orderDate === selectedDate)) {
      if (o.status === STATUS.CANCELLED) continue;

      const qty = Number(o.quantityTonne || 0);
      if (!Number.isFinite(qty)) continue;

      if (o.status === STATUS.COMPLETE) completed += qty;
      else pending += remainingTonnes(o);
    }

    return { total: completed + pending, completed, pending };
  }, [orders, selectedDate]);

  /* -------------------- Actions -------------------- */
  function upsertUnique(list, value) {
    const v = value.trim();
    if (!v) return list;
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return list;
    return [...list, v].sort((a, b) => a.localeCompare(b));
  }

  async function addOrder() {
    const cust = customer.trim();
    const mix = mixType.trim();

    const qty = clampNumber(quantityTonne, 0.01, 999999);
    if (!cust || !mix || !qty || !loadTime) {
      alert("Missing required fields: Customer, Mix Type, Quantity (Tonne), Load Time");
      return;
    }

    await ensureCustomerInDb(cust);
    await ensureProductInDb(mix);

    setContractors((prev) => upsertUnique(prev, cust));
    setMixes((prev) => upsertUnique(prev, mix));

    const p13 = clampInt(planned13 || 0, 0, 9999) ?? 0;
    const p38 = clampInt(planned38 || 0, 0, 9999) ?? 0;

    const newOrder = {
      id: uid(),
      customer: cust,
      mixType: mix,
      quantityTonne: qty,
      loadTime,
      orderDate: orderDate || selectedDate,
      jobNumber: jobNumber.trim() || "",
      poNumber: poNumber.trim() || "",
      foreman: foreman.trim() || "",
      status: STATUS.UNACK,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      completedAt: null,
      cancelledAt: null,

      pailOfColas: Boolean(pailOfColas),

      address: address.trim() || "",
      planned13: p13,
      planned38: p38,
      loaded13: 0,
      loaded38: 0,
    };

    setOrders((prev) => [newOrder, ...prev]);
    await cloudUpsert(newOrder);

    loadLists();

    setCustomer("");
    setMixType("");
    setQuantityTonne("");
    setJobNumber("");
    setPoNumber("");
    setForeman("");
    setLoadTime("");
    setOrderDate(selectedDate);
    setPailOfColas(false);

    setAddress("");
    setPlanned13("");
    setPlanned38("");
  }

  async function cycleStatus(orderId) {
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;
    if (target.status === STATUS.CANCELLED) return;

    let next;
    if (target.status === STATUS.UNACK) next = STATUS.ACK;
    else {
      const idx = STATUS_CYCLE.indexOf(target.status);
      next = STATUS_CYCLE[Math.min(idx + 1, STATUS_CYCLE.length - 1)] || STATUS.COMPLETE;
    }

    const now = nowISO();

    let updated = null;
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        updated = {
          ...o,
          status: next,
          updatedAt: now,
          completedAt: next === STATUS.COMPLETE ? now : o.completedAt,
        };
        return updated;
      })
    );

    try {
      await updateOrderInCloud(supabase, orderId, {
        status: next,
        updated_at: now,
        completed_at: next === STATUS.COMPLETE ? now : null,
      });
    } catch (e) {
      console.log("STATUS UPDATE FAILED:", e);
      alert("Cloud update failed: " + (e?.message || "Unknown error"));
    }
  }

  async function cancelOrder(orderId) {
    if (!confirm("Cancel this order?")) return;

    const now = nowISO();
    let updated = null;

    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        updated = { ...o, status: STATUS.CANCELLED, cancelledAt: now, updatedAt: now };
        return updated;
      })
    );

    if (!updated) return;

    try {
      await updateOrderInCloud(supabase, orderId, {
        status: STATUS.CANCELLED,
        cancelled_at: now,
        updated_at: now,
      });
    } catch (e) {
      alert("Cloud cancel failed: " + (e?.message || "Unknown error"));
    }
  }

  // Pop-up: if a load would overrun remaining, ask to add more mix
  async function maybeAddMoreMix(order, neededTonnes) {
    const rem = remainingTonnes(order);
    if (rem >= neededTonnes) return { ok: true, added: 0 };

    const yes = confirm(
      `Remaining is ${rem.toFixed(2)} T.\n` +
        `Loading ${neededTonnes} T will exceed remaining.\n\n` +
        `Do you want to add more mix to this order?`
    );
    if (!yes) return { ok: false, added: 0 };

    const suggested = Math.max(neededTonnes - rem, 0);
    const input = prompt(`How many tonnes do you want to add?`, suggested ? String(suggested) : "");
    if (input == null) return { ok: false, added: 0 };

    const addT = clampNumber(input, 0.01, 999999);
    if (!addT) {
      alert("Invalid tonnes amount.");
      return { ok: false, added: 0 };
    }

    const now = nowISO();
    let updated = null;

    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== order.id) return o;
        updated = {
          ...o,
          quantityTonne: Number(o.quantityTonne || 0) + addT,
          updatedAt: now,
          // If it was complete but you're adding tonnes, reopen it (optional but practical)
          status: o.status === STATUS.COMPLETE ? STATUS.LOADED : o.status,
          completedAt: o.status === STATUS.COMPLETE ? null : o.completedAt,
        };
        return updated;
      })
    );

    try {
      await updateOrderInCloud(supabase, order.id, {
        quantity_tonne: Number(order.quantityTonne || 0) + addT,
        updated_at: now,
        status: order.status === STATUS.COMPLETE ? STATUS.LOADED : order.status,
        completed_at: null,
      });
    } catch (e) {
      alert("Cloud update failed (add mix): " + (e?.message || "Unknown error"));
      return { ok: false, added: 0 };
    }

    return { ok: true, added: addT };
  }

  async function applyLoad(orderId, tonnes) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.status === STATUS.CANCELLED) return;

    // If completed already, allow adding mix then loading (optional)
    if (order.status === STATUS.COMPLETE && remainingTonnes(order) <= 0) {
      const ok = confirm("This order is completed. Do you want to add more mix and keep loading?");
      if (!ok) return;
    }

    // Ask to add mix if needed
    const gate = await maybeAddMoreMix(order, tonnes);
    if (!gate.ok) return;

    const now = nowISO();
    let updated = null;

    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;

        const next = { ...o };
        if (tonnes === LOAD_13) next.loaded13 = Number(next.loaded13 || 0) + 1;
        if (tonnes === LOAD_38) next.loaded38 = Number(next.loaded38 || 0) + 1;

        const rem = remainingTonnes(next);
        next.updatedAt = now;

        // If any loading occurs, we should at least be ACK
        if (next.status === STATUS.UNACK) next.status = STATUS.ACK;

        // Auto-complete when depleted
        if (rem <= 0) {
          next.status = STATUS.COMPLETE;
          next.completedAt = now;
        } else {
          // If not complete and it was complete earlier (after add mix), make sure completedAt is clear
          if (next.status !== STATUS.COMPLETE) next.completedAt = null;
        }

        updated = next;
        return next;
      })
    );

    if (!updated) return;

    try {
      await updateOrderInCloud(supabase, orderId, {
        loaded_13: updated.loaded13,
        loaded_38: updated.loaded38,
        status: updated.status,
        updated_at: updated.updatedAt,
        completed_at: updated.status === STATUS.COMPLETE ? updated.completedAt : null,
      });
    } catch (e) {
      alert("Cloud update failed: " + (e?.message || "Unknown error"));
    }
  }

  function startEdit(orderId) {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;
    setEditingId(orderId);
    setEditDraft({
      customer: o.customer || "",
      mixType: o.mixType || "",
      quantityTonne: String(o.quantityTonne ?? ""),
      loadTime: o.loadTime || "",
      orderDate: o.orderDate || toLocalISODate(),
      jobNumber: o.jobNumber || "",
      poNumber: o.poNumber || "",
      foreman: o.foreman || "",
      pailOfColas: Boolean(o.pailOfColas),

      address: o.address || "",
      planned13: String(o.planned13 ?? 0),
      planned38: String(o.planned38 ?? 0),
    });
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;

    const cust = editDraft.customer.trim();
    const mix = editDraft.mixType.trim();
    const qty = clampNumber(editDraft.quantityTonne, 0.01, 999999);
    const lt = editDraft.loadTime;

    if (!cust || !mix || !qty || !lt) {
      alert("Missing required fields: Customer, Mix Type, Quantity (Tonne), Load Time");
      return;
    }

    await ensureCustomerInDb(cust);
    await ensureProductInDb(mix);

    setContractors((prev) => upsertUnique(prev, cust));
    setMixes((prev) => upsertUnique(prev, mix));

    const p13 = clampInt(editDraft.planned13 || 0, 0, 9999) ?? 0;
    const p38 = clampInt(editDraft.planned38 || 0, 0, 9999) ?? 0;

    const now = nowISO();
    let updated = null;

    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== editingId) return o;
        updated = {
          ...o,
          customer: cust,
          mixType: mix,
          quantityTonne: qty,
          loadTime: lt,
          orderDate: editDraft.orderDate || o.orderDate,
          jobNumber: editDraft.jobNumber.trim(),
          poNumber: editDraft.poNumber.trim(),
          foreman: editDraft.foreman.trim(),
          updatedAt: now,
          pailOfColas: Boolean(editDraft.pailOfColas),

          address: String(editDraft.address || "").trim(),
          planned13: p13,
          planned38: p38,
        };

        // If qty increased and it was complete, reopen it (practical)
        if (updated.status === STATUS.COMPLETE && remainingTonnes(updated) > 0) {
          updated.status = STATUS.LOADED;
          updated.completedAt = null;
        }

        return updated;
      })
    );

    setEditingId(null);
    setEditDraft(null);

    if (updated) {
      await cloudUpsert(updated);
      loadLists();
    }
  }

  function closeEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function addContractor() {
    const name = newContractorName.trim();
    if (!name) return;

    if (!supabase) return alert("Supabase OFF (missing env vars).");

    const payload = { name, is_active: true };
    const { error } = await supabase.from("customers").insert([payload]).select();
    if (error) {
      console.error("customers insert error:", error);
      alert("Customer insert failed: " + error.message);
      return;
    }

    setContractors((prev) => upsertUnique(prev, name));
    setNewContractorName("");
    loadLists();
  }

  function removeContractor(name) {
    if (!confirm(`Remove customer "${name}"?`)) return;
    setContractors((prev) => prev.filter((x) => x !== name));
  }

  async function addMix() {
    const name = newMixName.trim();
    if (!name) return;

    if (!supabase) return alert("Supabase OFF (missing env vars).");

    const payload = { name, is_active: true };
    const { error } = await supabase.from("products").insert([payload]).select();
    if (error) {
      console.error("products insert error:", error);
      alert("Product insert failed: " + error.message);
      return;
    }

    setMixes((prev) => upsertUnique(prev, name));
    setNewMixName("");
    loadLists();
  }

  function removeMix(name) {
    if (!confirm(`Remove mix "${name}"?`)) return;
    setMixes((prev) => prev.filter((x) => x !== name));
  }

  /* -------------------- Urgent highlighting -------------------- */
  function urgencyStyle(o) {
    if (o.status === STATUS.COMPLETE || o.status === STATUS.CANCELLED) return {};
    const mins = minutesUntil(o.loadTime, o.orderDate);
    if (mins == null) return {};
    if (mins < 0) return { borderColor: ui.danger, boxShadow: `0 0 0 2px ${ui.danger}55` };
    if (mins <= 10) return { borderColor: ui.danger, boxShadow: `0 0 0 2px ${ui.danger}44` };
    if (mins <= 30) return { borderColor: ui.warn, boxShadow: `0 0 0 2px ${ui.warn}44` };
    return {};
  }

  /* -------------------- Styles -------------------- */
  const styles = {
    page: {
      transform: `scale(${ui.scale})`,
      transformOrigin: "top left",
      padding: 16,
      display: "grid",
      gridTemplateColumns: "360px 1fr",
      gap: 16,
    },
    card: {
      background: ui.card,
      border: `1px solid ${ui.border}`,
      borderRadius: 14,
      padding: 14,
    },
    h1: { margin: "0 0 10px 0", fontSize: 22 },
    row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    label: { fontSize: 12, color: ui.muted, marginBottom: 6 },
    input: {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${ui.border}`,
      background: darkMode ? "#0f172a" : "#ffffff",
      color: ui.text,
      outline: "none",
      fontSize: 14,
    },
    btn: {
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${ui.border}`,
      background: darkMode ? "#0f172a" : "#ffffff",
      color: ui.text,
      cursor: "pointer",
      fontWeight: 650,
    },
    btnPrimary: {
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${ui.accent}`,
      background: ui.accent,
      color: "#fff",
      cursor: "pointer",
      fontWeight: 750,
    },
    btnDanger: {
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${ui.danger}`,
      background: ui.danger,
      color: "#fff",
      cursor: "pointer",
      fontWeight: 750,
    },
    pill: {
      padding: "6px 10px",
      borderRadius: 999,
      border: `1px solid ${ui.border}`,
      fontSize: 12,
      color: ui.muted,
      background: darkMode ? "#0f172a" : "#f8fafc",
    },
    orderCard: {
      background: ui.card,
      border: `2px solid ${ui.border}`,
      borderRadius: 14,
      padding: 12,
    },
    divider: { height: 1, background: ui.border, margin: "10px 0" },
    small: { fontSize: 12, color: ui.muted },
    cloudBar: {
      display: "flex",
      gap: 8,
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 12px",
      borderRadius: 12,
      border: `1px solid ${ui.border}`,
      background: darkMode ? "#0f172a" : "#f8fafc",
    },

    boardGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 },
    col: { display: "flex", flexDirection: "column", gap: 10 },
    colHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      padding: "8px 10px",
      borderRadius: 12,
      border: `1px solid ${ui.border}`,
      background: darkMode ? "#0f172a" : "#f8fafc",
      fontWeight: 850,
    },
  };

  function renderOrderCard(o) {
    const mins = minutesUntil(o.loadTime, o.orderDate);
    const isOverdue = mins != null && mins < 0 && o.status !== STATUS.COMPLETE && o.status !== STATUS.CANCELLED;

    const statusColor =
      o.status === STATUS.COMPLETE
        ? ui.ok
        : o.status === STATUS.CANCELLED
        ? ui.danger
        : o.status === STATUS.LOADED
        ? ui.warn
        : ui.accent;

    const statusLabel =
      o.status === STATUS.UNACK ? "Acknowledge" : o.status === STATUS.ACK ? "Loaded" : o.status === STATUS.LOADED ? "Complete" : "Complete";

    const loadedT = loadedTonnes(o);
    const remainingT = remainingTonnes(o);

    return (
      <div key={o.id} style={{ ...styles.orderCard, ...urgencyStyle(o) }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{o.customer}</div>
            <div style={{ fontWeight: 700 }}>{o.mixType}</div>

            {o.address ? <div style={styles.small}>📍 {o.address}</div> : null}

            <div style={styles.small}>
              Load: <b>{o.loadTime || "--:--"}</b>{" "}
              {mins != null && o.status !== STATUS.COMPLETE && o.status !== STATUS.CANCELLED && (
                <span style={{ marginLeft: 8, color: isOverdue ? ui.danger : ui.muted }}>
                  {isOverdue ? `Overdue (${Math.abs(mins)} min)` : `In ${mins} min`}
                </span>
              )}
            </div>

            <div style={styles.small}>
              Order: <b>{Number(o.quantityTonne || 0).toFixed(2)}</b> T • Loaded: <b>{loadedT.toFixed(2)}</b> T • Remaining:{" "}
              <b>{remainingT.toFixed(2)}</b> T
              {o.pailOfColas ? <span style={{ marginLeft: 10 }}>• 🧴 Pail of Colas</span> : null}
            </div>

            <div style={styles.small}>
              13T Loads: <b>{Number(o.loaded13 || 0)}</b> • 38T Loads: <b>{Number(o.loaded38 || 0)}</b>
              {(Number(o.planned13 || 0) || Number(o.planned38 || 0)) ? (
                <>
                  {" "}
                  • Planned 13T: <b>{Number(o.planned13 || 0)}</b> • Planned 38T: <b>{Number(o.planned38 || 0)}</b>
                </>
              ) : null}
            </div>

            {(o.jobNumber || o.poNumber || o.foreman) && (
              <div style={styles.small}>
                {o.jobNumber ? (
                  <>
                    Job: <b>{o.jobNumber}</b>{" "}
                  </>
                ) : null}
                {o.poNumber ? (
                  <>
                    • PO: <b>{o.poNumber}</b>
                  </>
                ) : null}
                {o.foreman ? (
                  <>
                    {" "}
                    • Foreman: <b>{o.foreman}</b>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 220 }}>
            <div style={{ ...styles.pill, borderColor: statusColor, color: statusColor, textAlign: "center", fontWeight: 800 }}>
              {o.status}
            </div>

            <button
              style={{
                ...styles.btnPrimary,
                background: o.status === STATUS.COMPLETE ? ui.ok : ui.accent,
                borderColor: o.status === STATUS.COMPLETE ? ui.ok : ui.accent,
                opacity: o.status === STATUS.CANCELLED ? 0.6 : 1,
                cursor: o.status === STATUS.CANCELLED ? "not-allowed" : "pointer",
              }}
              onClick={() => cycleStatus(o.id)}
              disabled={o.status === STATUS.CANCELLED}
              type="button"
            >
              {statusLabel}
            </button>

            {/* Depletion buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={styles.btn}
                onClick={() => applyLoad(o.id, LOAD_13)}
                disabled={o.status === STATUS.CANCELLED}
                type="button"
                title="Subtract 13 tonnes from remaining"
              >
                +13 Loaded
              </button>
              <button
                style={styles.btn}
                onClick={() => applyLoad(o.id, LOAD_38)}
                disabled={o.status === STATUS.CANCELLED}
                type="button"
                title="Subtract 38 tonnes from remaining"
              >
                +38 Loaded
              </button>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btn} onClick={() => startEdit(o.id)} type="button">
                Edit
              </button>
              <button style={styles.btnDanger} onClick={() => cancelOrder(o.id)} type="button">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- Render -------------------- */
  return (
    <div style={styles.page}>
      {/* LEFT */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <h1 style={styles.h1}>Plant Orders</h1>
            <div style={styles.row}>
              <button style={styles.btn} onClick={() => setDarkMode((v) => !v)} type="button">
                {darkMode ? "Light" : "Dark"}
              </button>
              <button style={styles.btn} onClick={() => setBigMode((v) => !v)} type="button">
                {bigMode ? "Normal" : "Big"}
              </button>
            </div>
          </div>

          {/* Cloud bar */}
          <div style={{ ...styles.cloudBar, marginTop: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontWeight: 800 }}>{cloudStatus}</div>
              {cloudError ? <div style={{ ...styles.small, color: ui.danger }}>{cloudError}</div> : null}
              <div style={styles.small}>
                ENV URL: {supabaseEnabled ? "OK" : "MISSING"} • ENV KEY: {supabaseEnabled ? "OK" : "MISSING"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btn} onClick={cloudPull} disabled={!supabaseEnabled} type="button">
                Pull from Cloud
              </button>
            </div>
          </div>

          {/* DATE BAR */}
          <div style={{ ...styles.row, marginTop: 10 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={styles.label}>Board Date (view orders for this day)</div>
              <input
                style={styles.input}
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setOrderDate(e.target.value);
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
              <button style={styles.btn} onClick={() => setSelectedDate((d) => addDays(d, -1))} type="button">
                ◀︎ Prev
              </button>
              <button
                style={styles.btn}
                onClick={() => {
                  const t = toLocalISODate();
                  setSelectedDate(t);
                  setOrderDate(t);
                }}
                type="button"
              >
                Today
              </button>
              <button style={styles.btn} onClick={() => setSelectedDate((d) => addDays(d, 1))} type="button">
                Next ▶︎
              </button>
            </div>
          </div>

          <div style={{ ...styles.row, marginTop: 10 }}>
            <label style={styles.row}>
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
              <span style={styles.small}>Show completed on board</span>
            </label>

            <button style={styles.btn} onClick={() => setConfigOpen((v) => !v)} type="button">
              {configOpen ? "Close Setup" : "Setup Customers/Mixes"}
            </button>
          </div>
        </div>

        <button style={styles.btn} onClick={testDbWrites} type="button">
          Test DB Writes
        </button>

        {/* Dashboard */}
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Tally (Remaining by Mix)</div>
            <div style={styles.pill}>{selectedDate}</div>
          </div>
          <div style={{ ...styles.small, marginTop: 6 }}>
            Total: <b>{totalsForDate.total.toFixed(2)}</b> Tonne • Completed: <b>{totalsForDate.completed.toFixed(2)}</b> • Remaining:{" "}
            <b>{totalsForDate.pending.toFixed(2)}</b>
          </div>

          <div style={styles.divider} />

          {remainingByMix.length === 0 ? (
            <div style={styles.small}>No remaining orders for this date.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {remainingByMix.map(([mix, qty]) => (
                <div key={mix} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 700 }}>{mix}</div>
                  <div style={{ fontWeight: 800 }}>{qty.toFixed(2)} Tonne</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Order */}
        <div style={styles.card}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Create Order</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div>
              <div style={styles.label}>Customer (required)</div>
              <input
                style={styles.input}
                list="customersList"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Start typing or pick..."
              />
              <datalist id="customersList">
                {(customers.length ? customers : contractors).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <div style={styles.label}>Mix Type (required)</div>
              <input
                style={styles.input}
                list="productList"
                value={mixType}
                onChange={(e) => setMixType(e.target.value)}
                placeholder="Start typing or pick..."
              />
              <datalist id="productList">
                {(products.length ? products : mixes).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>

            <div>
              <div style={styles.label}>Load Time (required)</div>
              <input style={styles.input} type="time" value={loadTime} onChange={(e) => setLoadTime(e.target.value)} />
            </div>

            <div>
              <div style={styles.label}>Production Date (required)</div>
              <input style={styles.input} type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              <div style={styles.small}>Tip: usually same as Board Date.</div>
            </div>

            <div>
              <div style={styles.label}>Quantity (Tonne) (required)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DEFAULTS.quantityPresets.map((q) => (
                  <button key={q} style={styles.btn} onClick={() => setQuantityTonne(String(q))} type="button">
                    {q}
                  </button>
                ))}
              </div>
              <div style={{ height: 8 }} />
              <input
                style={styles.input}
                inputMode="decimal"
                value={quantityTonne}
                onChange={(e) => setQuantityTonne(e.target.value)}
                placeholder="Enter tonnes (e.g. 12.5)"
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={styles.label}>Job Number (optional)</div>
                <input style={styles.input} value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} />
              </div>
              <div>
                <div style={styles.label}>PO# (optional)</div>
                <input style={styles.input} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
              </div>
            </div>

            <div>
              <div style={styles.label}>Foreman (optional)</div>
              <input style={styles.input} value={foreman} onChange={(e) => setForeman(e.target.value)} />
            </div>

            {/* NEW: Address + planned trucks */}
            <div>
              <div style={styles.label}>Address (optional)</div>
              <input style={styles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jobsite address..." />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={styles.label}>Planned 13T loads (optional)</div>
                <input style={styles.input} inputMode="numeric" value={planned13} onChange={(e) => setPlanned13(e.target.value)} placeholder="0" />
              </div>
              <div>
                <div style={styles.label}>Planned 38T loads (optional)</div>
                <input style={styles.input} inputMode="numeric" value={planned38} onChange={(e) => setPlanned38(e.target.value)} placeholder="0" />
              </div>
            </div>

            {/* Pail of colas */}
            <label style={{ ...styles.row, alignItems: "center" }}>
              <input type="checkbox" checked={pailOfColas} onChange={(e) => setPailOfColas(e.target.checked)} />
              <span style={styles.small}>Pail of Colas</span>
            </label>

            <button style={styles.btnPrimary} onClick={addOrder} type="button">
              Post Order
            </button>
          </div>
        </div>

        {/* Config panel */}
        {configOpen && (
          <div style={styles.card}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Setup</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 750, marginBottom: 6 }}>Customers</div>
                <div style={styles.row}>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    value={newContractorName}
                    onChange={(e) => setNewContractorName(e.target.value)}
                    placeholder="Add customer..."
                  />
                  <button style={styles.btnPrimary} onClick={addContractor} type="button">
                    Add
                  </button>
                </div>

                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {contractors.map((c) => (
                    <div key={c} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 650 }}>{c}</div>
                      <button style={styles.btn} onClick={() => removeContractor(c)} type="button">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={styles.divider} />

              <div>
                <div style={{ fontWeight: 750, marginBottom: 6 }}>Mix Types</div>
                <div style={styles.row}>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    value={newMixName}
                    onChange={(e) => setNewMixName(e.target.value)}
                    placeholder="Add mix..."
                  />
                  <button style={styles.btnPrimary} onClick={addMix} type="button">
                    Add
                  </button>
                </div>

                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {mixes.map((m) => (
                    <div key={m} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 650 }}>{m}</div>
                      <button style={styles.btn} onClick={() => removeMix(m)} type="button">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={styles.small}>Note: Removing a customer/mix does not delete old orders — it only removes it from the pick list.</div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Board */}
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Load Board</div>
            <div style={styles.small}>
              Showing orders for <b>{selectedDate}</b>
            </div>
          </div>
          <div style={styles.pill}>{ordersForSelectedDate.length} orders</div>
        </div>

        <div style={{ height: 12 }} />

        <div style={styles.boardGrid}>
          <div style={styles.col}>
            <div style={styles.colHeader}>
              <span>Unack</span>
              <span style={styles.small}>{boardCols.unack.length}</span>
            </div>
            {boardCols.unack.length ? boardCols.unack.map(renderOrderCard) : <div style={styles.small}>None</div>}
          </div>

          <div style={styles.col}>
            <div style={styles.colHeader}>
              <span>Ack</span>
              <span style={styles.small}>{boardCols.ack.length}</span>
            </div>
            {boardCols.ack.length ? boardCols.ack.map(renderOrderCard) : <div style={styles.small}>None</div>}
          </div>

          <div style={styles.col}>
            <div style={styles.colHeader}>
              <span>Loaded</span>
              <span style={styles.small}>{boardCols.loaded.length}</span>
            </div>
            {boardCols.loaded.length ? boardCols.loaded.map(renderOrderCard) : <div style={styles.small}>None</div>}

            {showCompleted ? (
              <>
                <div style={{ height: 10 }} />
                <div style={styles.colHeader}>
                  <span>Completed</span>
                  <span style={styles.small}>{boardCols.complete.length}</span>
                </div>
                {boardCols.complete.length ? boardCols.complete.map(renderOrderCard) : <div style={styles.small}>None</div>}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editingId && editDraft && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#00000088",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
          onClick={closeEdit}
        >
          <div
            style={{
              width: "min(780px, 100%)",
              background: ui.card,
              border: `1px solid ${ui.border}`,
              borderRadius: 16,
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Edit Order</div>
              <div style={styles.small}>{editingOrder?.id}</div>
            </div>

            <div style={styles.divider} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={styles.label}>Customer (required)</div>
                <input style={styles.input} value={editDraft.customer} onChange={(e) => setEditDraft((d) => ({ ...d, customer: e.target.value }))} />
              </div>

              <div>
                <div style={styles.label}>Mix Type (required)</div>
                <input style={styles.input} value={editDraft.mixType} onChange={(e) => setEditDraft((d) => ({ ...d, mixType: e.target.value }))} />
              </div>

              <div>
                <div style={styles.label}>Load Time (required)</div>
                <input style={styles.input} type="time" value={editDraft.loadTime} onChange={(e) => setEditDraft((d) => ({ ...d, loadTime: e.target.value }))} />
              </div>

              <div>
                <div style={styles.label}>Production Date (required)</div>
                <input style={styles.input} type="date" value={editDraft.orderDate} onChange={(e) => setEditDraft((d) => ({ ...d, orderDate: e.target.value }))} />
              </div>

              <div>
                <div style={styles.label}>Quantity (Tonne) (required)</div>
                <input style={styles.input} inputMode="decimal" value={editDraft.quantityTonne} onChange={(e) => setEditDraft((d) => ({ ...d, quantityTonne: e.target.value }))} />
              </div>

              <div>
                <div style={styles.label}>Foreman (optional)</div>
                <input style={styles.input} value={editDraft.foreman} onChange={(e) => setEditDraft((d) => ({ ...d, foreman: e.target.value }))} />
              </div>

              <div>
                <div style={styles.label}>Job Number (optional)</div>
                <input style={styles.input} value={editDraft.jobNumber} onChange={(e) => setEditDraft((d) => ({ ...d, jobNumber: e.target.value }))} />
              </div>

              <div>
                <div style={styles.label}>PO# (optional)</div>
                <input style={styles.input} value={editDraft.poNumber} onChange={(e) => setEditDraft((d) => ({ ...d, poNumber: e.target.value }))} />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div style={styles.label}>Address (optional)</div>
                <input style={styles.input} value={editDraft.address} onChange={(e) => setEditDraft((d) => ({ ...d, address: e.target.value }))} />
              </div>

              <div>
                <div style={styles.label}>Planned 13T loads (optional)</div>
                <input style={styles.input} inputMode="numeric" value={editDraft.planned13} onChange={(e) => setEditDraft((d) => ({ ...d, planned13: e.target.value }))} />
              </div>

              <div>
                <div style={styles.label}>Planned 38T loads (optional)</div>
                <input style={styles.input} inputMode="numeric" value={editDraft.planned38} onChange={(e) => setEditDraft((d) => ({ ...d, planned38: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={styles.row}>
                <input type="checkbox" checked={Boolean(editDraft.pailOfColas)} onChange={(e) => setEditDraft((d) => ({ ...d, pailOfColas: e.target.checked }))} />
                <span style={styles.small}>Pail of Colas</span>
              </label>
            </div>

            <div style={{ ...styles.row, justifyContent: "space-between", marginTop: 14 }}>
              <div style={styles.small}>
                Loaded so far:{" "}
                <b>
                  {(Number(editingOrder?.loaded13 || 0) * LOAD_13 + Number(editingOrder?.loaded38 || 0) * LOAD_38).toFixed(2)}
                </b>{" "}
                T • Remaining: <b>{editingOrder ? remainingTonnes(editingOrder).toFixed(2) : "0.00"}</b> T
              </div>

              <div style={styles.row}>
                <button style={styles.btn} onClick={closeEdit} type="button">
                  Close
                </button>
                <button style={styles.btnPrimary} onClick={saveEdit} type="button">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}