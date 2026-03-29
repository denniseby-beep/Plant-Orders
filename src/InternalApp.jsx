import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const STATUS = {
  UNACK: "Unacknowledged",
  ACK: "Acknowledged",
  LOADED: "Loaded",
  COMPLETE: "Completed",
  CANCELLED: "Cancelled",
};

const LOAD_13 = 13.5;
const LOAD_38 = 38.5;

function normalizeStatus(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "unack" || v === "unacknowledged") return STATUS.UNACK;
  if (v === "ack" || v === "acknowledged") return STATUS.ACK;
  if (v === "loaded") return STATUS.LOADED;
  if (v === "complete" || v === "completed") return STATUS.COMPLETE;
  if (v === "cancelled" || v === "canceled" || v === "cancel") return STATUS.CANCELLED;
  return STATUS.UNACK;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalISODate(d = new Date()) {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

function addDays(dateStr, delta) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toLocalISODate(dt);
}

function formatPrettyTime(hhmm) {
  if (!hhmm || !String(hhmm).includes(":")) return "-";
  const [hhStr, mmStr] = String(hhmm).split(":");
  const hh = parseInt(hhStr, 10);
  const mm = String(parseInt(mmStr, 10)).padStart(2, "0");
  if (Number.isNaN(hh)) return String(hhmm);
  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = ((hh + 11) % 12) + 1;
  return `${hour12}:${mm} ${ampm}`;
}

function parse24ToParts(hhmm) {
  if (!hhmm || !String(hhmm).includes(":")) {
    return { hour: "7", min: "00", ampm: "AM" };
  }
  const [hhStr, mmStr] = String(hhmm).split(":");
  const hh = parseInt(hhStr, 10);
  const mm = String(parseInt(mmStr, 10)).padStart(2, "0");
  if (Number.isNaN(hh)) return { hour: "7", min: "00", ampm: "AM" };
  const ampm = hh >= 12 ? "PM" : "AM";
  let hour12 = hh % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour: String(hour12), min: mm, ampm };
}

function partsTo24(hour, min, ampm) {
  let h = parseInt(hour, 10);
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function loadedTonnes(order) {
  const loaded13 = Number(order.loaded_13 || 0);
  const loaded38 = Number(order.loaded_38 || 0);
  const remainder = Number(order.loaded_remainder_tonne || 0);
  return loaded13 * LOAD_13 + loaded38 * LOAD_38 + remainder;
}

function remainingTonnes(order) {
  const qty = Number(order.quantity_tonne || 0);
  return Math.max(0, qty - loadedTonnes(order));
}

function emptyDraft(selectedDate) {
  return {
    customer: "",
    mix_type: "",
    quantity_tonne: "",
    order_date: selectedDate || toLocalISODate(),
    load_hour: "7",
    load_min: "00",
    load_ampm: "AM",
    job_number: "",
    po_number: "",
    foreman: "",
    address: "",
    site_contact_name: "",
    site_contact_phone: "",
    notes: "",
    weather_call: false,
    weather_hour: "7",
    weather_min: "00",
    weather_ampm: "AM",
    trucks_working: "",
    truck_schedule_mode: "stagger",
    stagger_minutes: "",
  };
}

function printJobTicket(order) {
  const truckCount = Number(order.trucks_working || 0);
  const stagger = Number(order.stagger_minutes || 0);
  const load = String(order.load_time || "");

  function addMinutes(hhmm, add) {
    if (!hhmm || !hhmm.includes(":")) return "";
    const [hh, mm] = hhmm.split(":").map(Number);
    let total = hh * 60 + mm + add;
    total = ((total % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
  }

  const truckTimes = [];
  if (truckCount > 0 && load) {
    for (let i = 0; i < truckCount; i += 1) {
      truckTimes.push(addMinutes(load, i * stagger));
    }
  }

  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Job Ticket</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 18px; }
      h1 { margin: 0 0 12px 0; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
      .box { border: 1px solid #111; border-radius: 8px; padding: 10px; }
      .full { grid-column: 1 / -1; }
      .label { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
      .value { font-size: 16px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #111; padding: 6px; text-align: left; }
      .notes { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Job Ticket</h1>
    <div class="grid">
      <div class="box"><div class="label">Customer</div><div class="value">${order.customer || "-"}</div></div>
      <div class="box"><div class="label">Mix</div><div class="value">${order.mix_type || "-"}</div></div>
      <div class="box"><div class="label">Quantity</div><div class="value">${order.quantity_tonne || "-"} T</div></div>
      <div class="box"><div class="label">Load Time</div><div class="value">${formatPrettyTime(order.load_time)}</div></div>
      <div class="box"><div class="label">Job #</div><div class="value">${order.job_number || "-"}</div></div>
      <div class="box"><div class="label">PO #</div><div class="value">${order.po_number || "-"}</div></div>
      <div class="box"><div class="label">Foreman</div><div class="value">${order.foreman || "-"}</div></div>
      <div class="box"><div class="label">Weather Call</div><div class="value">${order.weather_call ? `YES ${order.weather_call_time ? `• ${formatPrettyTime(order.weather_call_time)}` : ""}` : "NO"}</div></div>
      <div class="box full"><div class="label">Address</div><div class="value">${order.address || "-"}</div></div>
      <div class="box"><div class="label">Site Contact</div><div class="value">${order.site_contact_name || "-"}</div></div>
      <div class="box"><div class="label">Phone</div><div class="value">${order.site_contact_phone || "-"}</div></div>
      <div class="box full"><div class="label">Notes</div><div class="value notes">${order.notes || "-"}</div></div>
      <div class="box full">
        <div class="label">Truck Start Times</div>
        ${truckTimes.length ? `<table><thead><tr><th>Truck</th><th>Time</th></tr></thead><tbody>${truckTimes
          .map((t, i) => `<tr><td>${i + 1}</td><td>${formatPrettyTime(t)} (${t})</td></tr>`)
          .join("")}</tbody></table>` : "-"}
      </div>
    </div>
    <script>window.focus(); window.print();</script>
  </body>
  </html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    alert("Popup blocked. Allow popups to print.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export default function InternalApp({ access, readOnly }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(toLocalISODate());
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);
  const [showCancelledInUnack, setShowCancelledInUnack] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // Collapsible sidebar sections
  const [showBoardTools, setShowBoardTools] = useState(false);
  const [showPlantSummary, setShowPlantSummary] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(emptyDraft(toLocalISODate()));
  const [savingCreate, setSavingCreate] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyDraft(toLocalISODate()));
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    loadLists();
  }, []);

  useEffect(() => {
    loadOrders();
  }, [selectedDate]);

  useEffect(() => {
    const channel = supabase
      .channel("internal-orders-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => loadOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  async function loadLists() {
    const { data: customerData } = await supabase
      .from("customers")
      .select("name, is_active")
      .order("name", { ascending: true });

    const { data: productData } = await supabase
      .from("products")
      .select("name, is_active")
      .order("name", { ascending: true });

    setCustomers(
      (customerData || [])
        .filter((row) => row.is_active === true || row.is_active == null)
        .map((row) => String(row.name || "").trim())
        .filter(Boolean)
    );

    setProducts(
      (productData || [])
        .filter((row) => row.is_active === true || row.is_active == null)
        .map((row) => String(row.name || "").trim())
        .filter(Boolean)
    );
  }

  async function loadOrders() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("order_date", selectedDate)
      .order("load_time", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Load orders error:", error);
      setError(error.message || "Failed to load orders");
      setOrders([]);
      setLoading(false);
      return;
    }

    setOrders(
      (data || []).map((row) => ({
        ...row,
        status: normalizeStatus(row.status),
      }))
    );
    setLoading(false);
  }

  function setCreateField(name, value) {
    setCreateDraft((prev) => ({ ...prev, [name]: value }));
  }

  function setEditField(name, value) {
    setEditDraft((prev) => ({ ...prev, [name]: value }));
  }

  function openCreateModal() {
    setCreateDraft(emptyDraft(selectedDate));
    setCreateOpen(true);
  }

  function closeCreateModal() {
    setCreateOpen(false);
    setCreateDraft(emptyDraft(selectedDate));
    setSavingCreate(false);
  }

  async function submitCreateOrder(e) {
    e.preventDefault();
    if (readOnly) return;

    const customer = String(createDraft.customer || "").trim();
    const mixType = String(createDraft.mix_type || "").trim();
    const qty = Number(createDraft.quantity_tonne);

    if (!customer) return alert("Customer is required.");
    if (!mixType) return alert("Mix is required.");
    if (!Number.isFinite(qty) || qty <= 0) return alert("Quantity must be greater than 0.");

    setSavingCreate(true);

    const payload = {
      customer,
      mix_type: mixType,
      quantity_tonne: qty,
      order_date: createDraft.order_date,
      load_time: partsTo24(createDraft.load_hour, createDraft.load_min, createDraft.load_ampm),
      job_number: String(createDraft.job_number || "").trim(),
      po_number: String(createDraft.po_number || "").trim(),
      foreman: String(createDraft.foreman || "").trim(),
      address: String(createDraft.address || "").trim(),
      site_contact_name: String(createDraft.site_contact_name || "").trim(),
      site_contact_phone: String(createDraft.site_contact_phone || "").trim(),
      notes: String(createDraft.notes || "").trim(),
      weather_call: Boolean(createDraft.weather_call),
      weather_call_time: createDraft.weather_call
        ? partsTo24(createDraft.weather_hour, createDraft.weather_min, createDraft.weather_ampm)
        : null,
      trucks_working: createDraft.trucks_working === "" ? null : Number(createDraft.trucks_working),
      truck_schedule_mode: createDraft.truck_schedule_mode,
      stagger_minutes: createDraft.stagger_minutes === "" ? null : Number(createDraft.stagger_minutes),
      status: STATUS.UNACK,
    };

    const { error } = await supabase.from("orders").insert([payload]);
    if (error) {
      console.error("Create order error:", error);
      alert(error.message || "Failed to create order");
      setSavingCreate(false);
      return;
    }

    closeCreateModal();
    await loadOrders();
  }

  function openEditModal(order) {
    if (readOnly) return;
    if (order.status !== STATUS.UNACK) {
      alert("This order can no longer be edited. Please call the plant directly.");
      return;
    }

    const loadParts = parse24ToParts(order.load_time || "07:00");
    const weatherParts = parse24ToParts(order.weather_call_time || "07:00");

    setEditingOrder(order);
    setEditDraft({
      customer: String(order.customer || ""),
      mix_type: String(order.mix_type || ""),
      quantity_tonne: String(order.quantity_tonne || ""),
      order_date: String(order.order_date || selectedDate).slice(0, 10),
      load_hour: loadParts.hour,
      load_min: loadParts.min,
      load_ampm: loadParts.ampm,
      job_number: String(order.job_number || ""),
      po_number: String(order.po_number || ""),
      foreman: String(order.foreman || ""),
      address: String(order.address || ""),
      site_contact_name: String(order.site_contact_name || ""),
      site_contact_phone: String(order.site_contact_phone || ""),
      notes: String(order.notes || ""),
      weather_call: Boolean(order.weather_call),
      weather_hour: weatherParts.hour,
      weather_min: weatherParts.min,
      weather_ampm: weatherParts.ampm,
      trucks_working: order.trucks_working == null ? "" : String(order.trucks_working),
      truck_schedule_mode: String(order.truck_schedule_mode || "stagger"),
      stagger_minutes: order.stagger_minutes == null ? "" : String(order.stagger_minutes),
    });
    setEditOpen(true);
  }

  function closeEditModal() {
    setEditOpen(false);
    setEditingOrder(null);
    setEditDraft(emptyDraft(selectedDate));
    setSavingEdit(false);
  }

  async function submitEditOrder(e) {
    e.preventDefault();
    if (readOnly || !editingOrder) return;

    const customer = String(editDraft.customer || "").trim();
    const mixType = String(editDraft.mix_type || "").trim();
    const qty = Number(editDraft.quantity_tonne);

    if (!customer) return alert("Customer is required.");
    if (!mixType) return alert("Mix is required.");
    if (!Number.isFinite(qty) || qty <= 0) return alert("Quantity must be greater than 0.");

    setSavingEdit(true);

    const payload = {
      customer,
      mix_type: mixType,
      quantity_tonne: qty,
      order_date: editDraft.order_date,
      load_time: partsTo24(editDraft.load_hour, editDraft.load_min, editDraft.load_ampm),
      job_number: String(editDraft.job_number || "").trim(),
      po_number: String(editDraft.po_number || "").trim(),
      foreman: String(editDraft.foreman || "").trim(),
      address: String(editDraft.address || "").trim(),
      site_contact_name: String(editDraft.site_contact_name || "").trim(),
      site_contact_phone: String(editDraft.site_contact_phone || "").trim(),
      notes: String(editDraft.notes || "").trim(),
      weather_call: Boolean(editDraft.weather_call),
      weather_call_time: editDraft.weather_call
        ? partsTo24(editDraft.weather_hour, editDraft.weather_min, editDraft.weather_ampm)
        : null,
      trucks_working: editDraft.trucks_working === "" ? null : Number(editDraft.trucks_working),
      truck_schedule_mode: editDraft.truck_schedule_mode,
      stagger_minutes: editDraft.stagger_minutes === "" ? null : Number(editDraft.stagger_minutes),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("orders")
      .update(payload)
      .eq("id", editingOrder.id)
      .eq("status", STATUS.UNACK);

    if (error) {
      console.error("Edit order error:", error);
      alert(error.message || "Failed to update order");
      setSavingEdit(false);
      return;
    }

    closeEditModal();
    await loadOrders();
  }

  async function moveStatus(order, nextStatus) {
    if (readOnly) return;

    const updatePayload = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    if (nextStatus === STATUS.COMPLETE) {
      updatePayload.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id);

    if (error) {
      console.error("Status update error:", error);
      alert(error.message || "Failed to update order");
      return;
    }

    await loadOrders();
  }

  async function recallOrder(order) {
  if (readOnly) return;

  let prevStatus = null;

  if (order.status === STATUS.ACK) {
    prevStatus = STATUS.UNACK;
  } else if (order.status === STATUS.LOADED) {
    prevStatus = STATUS.ACK;
  } else if (order.status === STATUS.COMPLETE) {
    prevStatus = STATUS.LOADED;
  } else {
    return;
  }

  const patch = {
    status: prevStatus,
    updated_at: new Date().toISOString(),
  };

  if (order.status === STATUS.COMPLETE) {
    patch.completed_at = null;
  }

  const { error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", order.id);

  if (error) {
    console.error("Recall order error:", error);
    alert(error.message || "Failed to recall order");
    return;
  }

  await loadOrders();
}
  async function copyOrder(order) {
    if (readOnly) return;

    const payload = {
      customer: order.customer,
      mix_type: order.mix_type,
      quantity_tonne: order.quantity_tonne,
      order_date: selectedDate,
      load_time: order.load_time,
      job_number: order.job_number,
      po_number: order.po_number,
      foreman: order.foreman,
      address: order.address,
      site_contact_name: order.site_contact_name,
      site_contact_phone: order.site_contact_phone,
      notes: order.notes,
      weather_call: order.weather_call,
      weather_call_time: order.weather_call_time,
      trucks_working: order.trucks_working,
      truck_schedule_mode: order.truck_schedule_mode,
      stagger_minutes: order.stagger_minutes,
      status: STATUS.UNACK,
      completed_at: null,
      cancelled_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      loaded_13: 0,
      loaded_38: 0,
      loaded_remainder_tonne: 0,
    };

    const { error } = await supabase.from("orders").insert([payload]);
    if (error) {
      console.error("Copy order error:", error);
      alert(error.message || "Failed to copy order");
      return;
    }

    await loadOrders();
  }

  async function cancelOrder(order) {
    if (readOnly) return;
    const ok = window.confirm(`Cancel order for ${order.customer}?`);
    if (!ok) return;

    const { error } = await supabase
      .from("orders")
      .update({
        status: STATUS.CANCELLED,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (error) {
      console.error("Cancel order error:", error);
      alert(error.message || "Failed to cancel order");
      return;
    }

    await loadOrders();
  }

  async function applyStandardLoad(order, tonnes) {
    if (readOnly) return;
    if (order.status === STATUS.CANCELLED) return;

    const patch = {
      updated_at: new Date().toISOString(),
      status: order.status === STATUS.UNACK ? STATUS.ACK : STATUS.LOADED,
    };

    if (tonnes === LOAD_13) {
      patch.loaded_13 = Number(order.loaded_13 || 0) + 1;
    } else if (tonnes === LOAD_38) {
      patch.loaded_38 = Number(order.loaded_38 || 0) + 1;
    }

    const projected = {
      ...order,
      loaded_13: patch.loaded_13 ?? order.loaded_13,
      loaded_38: patch.loaded_38 ?? order.loaded_38,
      loaded_remainder_tonne: order.loaded_remainder_tonne,
      quantity_tonne: order.quantity_tonne,
    };

    if (remainingTonnes(projected) <= 0) {
      patch.status = STATUS.COMPLETE;
      patch.completed_at = new Date().toISOString();
    }

    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (error) {
      console.error("Load error:", error);
      alert(error.message || "Failed to record load");
      return;
    }

    await loadOrders();
  }

  async function applyCustomLoad(order) {
    if (readOnly) return;
    const raw = window.prompt("Enter custom load tonnes", "12.5");
    if (raw == null) return;
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) {
      alert("Invalid custom tonnes.");
      return;
    }

    const patch = {
      loaded_remainder_tonne: Number(order.loaded_remainder_tonne || 0) + val,
      updated_at: new Date().toISOString(),
      status: order.status === STATUS.UNACK ? STATUS.ACK : STATUS.LOADED,
    };

    const projected = {
      ...order,
      loaded_remainder_tonne: patch.loaded_remainder_tonne,
    };

    if (remainingTonnes(projected) <= 0) {
      patch.status = STATUS.COMPLETE;
      patch.completed_at = new Date().toISOString();
    }

    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (error) {
      console.error("Custom load error:", error);
      alert(error.message || "Failed to record custom load");
      return;
    }

    await loadOrders();
  }

  async function updateQuantity(order) {
    if (readOnly) return;
    const raw = window.prompt("Enter new quantity (tonnes)", String(order.quantity_tonne || ""));
    if (raw == null) return;
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) {
      alert("Invalid quantity. Please enter a number greater than 0.");
      return;
    }
    const alreadyLoaded = loadedTonnes(order);
    if (val < alreadyLoaded) {
      alert("New quantity cannot be less than already loaded tonnes.");
      return;
    }
    const patch = {
      quantity_tonne: val,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (error) {
      console.error("Update quantity error:", error);
      alert(error.message || "Failed to update quantity");
      return;
    }
    await loadOrders();
  }

  const filteredOrders = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    return orders.filter((o) => {
      if (!showCompleted && o.status === STATUS.COMPLETE) return false;
      if (!q) return true;
      return [o.customer, o.mix_type, o.job_number, o.po_number, o.foreman]
        .map((x) => String(x || "").toLowerCase())
        .some((x) => x.includes(q));
    });
  }, [orders, search, showCompleted]);

  const board = useMemo(() => {
    const unack = filteredOrders.filter((o) => {
      if (o.status === STATUS.UNACK) return true;
      if (showCancelledInUnack && o.status === STATUS.CANCELLED) return true;
      return false;
    });

    return {
      unack,
      ack: filteredOrders.filter((o) => o.status === STATUS.ACK),
      loaded: filteredOrders.filter((o) => o.status === STATUS.LOADED),
      complete: filteredOrders.filter((o) => o.status === STATUS.COMPLETE),
    };
  }, [filteredOrders, showCancelledInUnack]);

  const totals = useMemo(() => {
    const active = orders.filter((o) => o.status !== STATUS.CANCELLED);
    return {
      orderCount: active.length,
      totalTonnes: active.reduce((sum, o) => sum + Number(o.quantity_tonne || 0), 0),
      shipped: active.reduce((sum, o) => sum + loadedTonnes(o), 0),
    };
  }, [orders]);

  const remainingByMix = useMemo(() => {
    const map = new Map();
    for (const order of orders) {
      if (order.status === STATUS.CANCELLED || order.status === STATUS.COMPLETE) continue;
      const mix = String(order.mix_type || "(No Mix)");
      map.set(mix, (map.get(mix) || 0) + remainingTonnes(order));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders]);

  const styles = {
        collapseHeader: {
          width: "100%",
          background: "#0b1f3b",
          color: "#f8fafc",
          border: "none",
          borderRadius: 10,
          fontWeight: 900,
          fontSize: 15,
          padding: "10px 12px",
          margin: "10px 0 0 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          outline: "none",
          transition: "background 0.15s",
        },
        collapseIcon: {
          marginLeft: 8,
          fontSize: 18,
          fontWeight: 900,
          color: "#38bdf8",
          userSelect: "none",
          transition: "transform 0.2s",
          display: "inline-block",
        },
        collapseSection: {
          margin: "0 0 10px 0",
          padding: 0,
          background: "none",
          border: "none",
        },
    page: {
      minHeight: "100vh",
      background: "#041224",
      color: "#f8fafc",
      fontFamily: "Arial, sans-serif",
      padding: 14,
    },
    shell: {
      display: "grid",
      gridTemplateColumns: "340px 1fr 1fr 1fr",
      gap: 12,
      alignItems: "start",
      minWidth: 0,
    },
    sidebar: {
      background: "#08182e",
      border: "1px solid #173052",
      borderRadius: 18,
      padding: 16,
      position: "sticky",
      top: 10,
    },
    boardWrap: {
      gridColumn: "2 / span 3",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
      gap: 12,
      alignItems: "start",
      minWidth: 0,
    },
    ackGrid: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      gap: 12,
      alignItems: "start",
      minWidth: 0,
      width: "100%",
      maxWidth: "100%",
      overflow: "hidden",
    },
    bigTitle: {
      fontSize: 34,
      fontWeight: 900,
      lineHeight: 1.05,
      margin: 0,
      marginBottom: 14,
    },
    sub: {
      fontSize: 13,
      color: "#cbd5e1",
      marginBottom: 8,
    },
    createBtn: {
      width: "100%",
      padding: "14px 16px",
      borderRadius: 14,
      border: "none",
      background: "#2563eb",
      color: "#fff",
      fontWeight: 900,
      fontSize: 16,
      cursor: "pointer",
      marginBottom: 12,
    },
    smallBtn: {
      padding: "8px 12px",
      borderRadius: 10,
      border: "1px solid #314866",
      background: "#0b1f3b",
      color: "#fff",
      fontWeight: 800,
      cursor: "pointer",
    },
    search: {
      width: "100%",
      boxSizing: "border-box",
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #314866",
      background: "#fff",
      color: "#111827",
      fontSize: 15,
    },
    statBox: {
      background: "#0b1f3b",
      border: "1px solid #173052",
      borderRadius: 14,
      padding: 12,
      marginTop: 12,
    },
    statLine: {
      fontSize: 13,
      color: "#dbeafe",
      marginBottom: 4,
    },
    mixRow: {
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      alignItems: "center",
      fontWeight: 800,
      marginBottom: 10,
    },
    mixBar: {
      width: 36,
      height: 28,
      borderRadius: 6,
      background: "#a3e635",
      flexShrink: 0,
    },
    column: {
      background: "#08182e",
      border: "1px solid #173052",
      borderRadius: 16,
      minHeight: 600,
      overflow: "hidden",
      minWidth: 0,
    },
    columnHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "10px 12px",
      borderBottom: "1px solid #173052",
      fontWeight: 900,
      fontSize: 16,
      color: "#f8fafc",
    },
    columnBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 999,
      background: "#102747",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 900,
    },
    card: {
      margin: 0,
      padding: 10,
      borderRadius: 14,
      border: "1px solid #a11d2a",
      background: "#071427",
      cursor: "pointer",
      boxSizing: "border-box",
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      overflow: "hidden",
    },
    nightCard: {
      background: "#0e1e4a",
      border: "2.5px solid #38bdf8",
      boxShadow: "0 0 0 2px #38bdf8, 0 0 12px 0 #38bdf8a0",
    },
    completeCard: {
      border: "2px solid #22c55e",
      boxShadow: "0 0 0 2px rgba(34,197,94,0.18)",
    },
    weatherCard: {
      border: "2px solid #facc15",
      boxShadow: "0 0 0 2px rgba(250, 204, 21, 0.25)",
    },
    customer: {
      fontSize: 18,
      fontWeight: 900,
      marginBottom: 4,
      lineHeight: 1.1,
    },
    mix: {
      fontSize: 15,
      fontWeight: 800,
      marginBottom: 6,
    },
    info: {
      fontSize: 12,
      color: "#cbd5e1",
      marginBottom: 4,
      lineHeight: 1.25,
    },
    overdue: {
      color: "#ef4444",
      fontWeight: 900,
      fontSize: 12,
      marginBottom: 4,
    },
    statusPill: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "4px 10px",
      borderRadius: 999,
      border: "1px solid #2563eb",
      color: "#3b82f6",
      fontWeight: 900,
      fontSize: 12,
      marginBottom: 8,
    },
    btnRow: {
      display: "flex",
      gap: 4,
      flexWrap: "wrap",
      marginTop: 6,
      width: "100%",
      maxWidth: "100%",
      overflow: "hidden",
      alignItems: "center",
    },
    btn: {
      padding: "4px 8px",
      borderRadius: 8,
      border: "1px solid #314866",
      background: "#0b1f3b",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 11,
      lineHeight: 1.1,
      maxWidth: "100%",
      boxSizing: "border-box",
      flexShrink: 1,
    },
    btnPrimary: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #2563eb",
      background: "#2563eb",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box",
      marginTop: 10,
      display: "block",
    },
    btnDanger: {
      padding: "4px 8px",
      borderRadius: 8,
      border: "1px solid #dc2626",
      background: "#dc2626",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: 11,
      lineHeight: 1.1,
      maxWidth: "100%",
      boxSizing: "border-box",
      flexShrink: 1,
    },
    modalOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      padding: 20,
      zIndex: 1000,
      overflowY: "auto",
    },
    modalCard: {
      width: "min(900px, 100%)",
      background: "#111827",
      color: "#fff",
      borderRadius: 18,
      padding: 18,
      boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    },
    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 16,
      flexWrap: "wrap",
    },
    modalTitle: {
      margin: 0,
      fontSize: 28,
      fontWeight: 900,
    },
    formGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 14,
    },
    fieldWrap: {
      display: "grid",
      gap: 6,
    },
    fullWidth: {
      gridColumn: "1 / -1",
    },
    label: {
      fontSize: 13,
      fontWeight: 800,
      color: "#fff",
    },
    input: {
      width: "100%",
      boxSizing: "border-box",
      padding: "12px 12px",
      borderRadius: 12,
      border: "1px solid #d1d5db",
      fontSize: 15,
      background: "#fff",
      color: "#111827",
    },
    textarea: {
      width: "100%",
      boxSizing: "border-box",
      padding: "12px 12px",
      borderRadius: 12,
      border: "1px solid #d1d5db",
      fontSize: 15,
      minHeight: 90,
      resize: "vertical",
      background: "#fff",
      color: "#111827",
    },
    timeRow: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 8,
    },
    checkRow: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontWeight: 800,
      paddingTop: 8,
    },
  };

  // Tap-to-expand card UI
  const [activeOrder, setActiveOrder] = useState(null);

  function isNightOrder(order) {
    // Night is 18:00 (6pm) to 05:00 (5am next day)
    if (!order.load_time) return false;
    const [hh, mm] = String(order.load_time).split(":").map(Number);
    if (isNaN(hh)) return false;
    // 18:00 to 23:59 or 00:00 to 04:59
    return (hh >= 18 || hh < 5);
  }

  function renderCard(order) {
    // Only show key info and one status button in collapsed state
    const isComplete = order.status === STATUS.COMPLETE;
    const night = isNightOrder(order);
    return (
      <div
        key={order.id}
        style={{
          ...styles.card,
          ...(night ? styles.nightCard : {}),
          ...(order.weather_call ? styles.weatherCard : {}),
          ...(isComplete ? styles.completeCard : {}),
          minHeight: 110,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
        onClick={() => setActiveOrder(order)}
      >
        <div>
          <div style={styles.customer}>{order.customer || "-"}</div>
          <div style={styles.mix}>{order.mix_type || "-"}</div>
          <div style={styles.info}>Qty: {Number(order.quantity_tonne || 0).toFixed(2)} T</div>
          <div style={styles.info}>Load: {order.load_time || "-"}</div>
          {order.job_number ? <div style={styles.info}>Job: {order.job_number}</div> : null}
          {order.foreman ? <div style={styles.info}>Foreman: {order.foreman}</div> : null}
          {order.address ? <div style={styles.info}>Address: {order.address}</div> : null}
        </div>
        {order.status !== STATUS.COMPLETE && order.status !== STATUS.CANCELLED && (
          <button
            style={styles.btnPrimary}
            onClick={e => {
              e.stopPropagation();
              moveStatus(order, order.status === STATUS.UNACK ? STATUS.ACK : order.status === STATUS.ACK ? STATUS.LOADED : STATUS.COMPLETE);
            }}
          >
            {order.status === STATUS.UNACK ? "Acknowledge" : order.status === STATUS.ACK ? "Loaded" : "Complete"}
          </button>
        )}
      </div>
    );
  }


// Helper to get truck start times
function getTruckTimes(order) {
  const truckCount = Number(order.trucks_working || 0);
  const stagger = Number(order.stagger_minutes || 0);
  const load = String(order.load_time || "");
  function addMinutes(hhmm, add) {
    if (!hhmm || !hhmm.includes(":")) return "";
    const [hh, mm] = hhmm.split(":").map(Number);
    let total = hh * 60 + mm + add;
    total = ((total % 1440) + 1440) % 1440;
    return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
  }
  if (truckCount > 1 && load) {
    return Array.from({ length: truckCount }, (_, i) => addMinutes(load, i * stagger));
  }
  return [];
}

// OrderActionsModal as a proper component
function OrderActionsModal({
  order,
  onClose,
  readOnly,
  recallOrder,
  updateQuantity,
  printJobTicket,
  copyOrder,
  cancelOrder,
  loadOrders,
  styles,
}) {
  const [weatherCall, setWeatherCall] = React.useState(order?.weather_call);
  const [savingWeather, setSavingWeather] = React.useState(false);

  React.useEffect(() => {
    setWeatherCall(order?.weather_call);
  }, [order]);

  if (!order) return null;

  async function handleWeatherToggle(e) {
    if (readOnly) return;
    const newVal = e.target.checked;
    setWeatherCall(newVal);
    setSavingWeather(true);
    // If turning off, clear weather_call_time as well
    const patch = {
      weather_call: newVal,
      weather_call_time: newVal ? (order.weather_call_time || null) : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    setSavingWeather(false);
    if (error) {
      alert(error.message || "Failed to update weather call");
    } else {
      await loadOrders();
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Order Details</h2>
          <button style={styles.smallBtn} onClick={onClose}>Close</button>
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={styles.customer}>{order.customer || "-"}</div>
          <div style={styles.mix}>{order.mix_type || "-"}</div>
          <div style={styles.info}>Qty: {Number(order.quantity_tonne || 0).toFixed(2)} T</div>
          <div style={styles.info}>Load: {order.load_time || "-"}</div>
          {order.job_number ? <div style={styles.info}>Job: {order.job_number}</div> : null}
          {order.po_number ? <div style={styles.info}>PO: {order.po_number}</div> : null}
          {order.foreman ? <div style={styles.info}>Foreman: {order.foreman}</div> : null}
          {order.address ? <div style={styles.info}>Address: {order.address}</div> : null}
          {order.site_contact_name ? <div style={styles.info}>Site Contact: {order.site_contact_name}</div> : null}
          {order.site_contact_phone ? <div style={styles.info}>Phone: {order.site_contact_phone}</div> : null}
          {order.notes ? <div style={styles.info}>Notes: {order.notes}</div> : null}
          {/* Weather Call Toggle */}
          <div style={{ ...styles.info, display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900, color: weatherCall ? "#facc15" : "#cbd5e1" }}>
              <input
                type="checkbox"
                checked={!!weatherCall}
                disabled={readOnly || savingWeather}
                onChange={handleWeatherToggle}
                style={{ marginRight: 6 }}
              />
              Weather Call
              {weatherCall && order.weather_call_time ? (
                <span style={{ color: "#facc15", fontWeight: 900, marginLeft: 8 }}>
                  • {formatPrettyTime(order.weather_call_time)}
                </span>
              ) : null}
            </label>
            {savingWeather && <span style={{ color: "#facc15", fontSize: 12 }}>Saving...</span>}
          </div>
          <div style={styles.info}>Loaded: {loadedTonnes(order).toFixed(2)} T</div>
          <div style={styles.info}>Remaining: {remainingTonnes(order).toFixed(2)} T</div>
          <div style={styles.info}>Status: {order.status}</div>
          {/* Truck Start Times */}
          <div style={{ ...styles.info, marginTop: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 4 }}>Truck Start Times</div>
            {(() => {
              const times = getTruckTimes(order);
              if (times.length === 0) return <div>-</div>;
              return (
                <div>
                  {times.map((t, i) => (
                    <div key={i} style={{ marginBottom: 2 }}>
                      {formatPrettyTime(t)} ({t})
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
        <div style={styles.btnRow}>
          {/* Recall button for eligible statuses when not readOnly */}
          {!readOnly && (order.status === STATUS.ACK || order.status === STATUS.LOADED || order.status === STATUS.COMPLETE) && (
            <button style={styles.btn} onClick={() => { recallOrder(order); onClose(); }}>Recall</button>
          )}
          {/* Edit Qty button for all non-cancelled orders when not readOnly */}
          {!readOnly && order.status !== STATUS.CANCELLED && (
            <button style={styles.btn} onClick={() => { updateQuantity(order); onClose(); }}>Edit Qty</button>
          )}
          <button style={styles.btn} onClick={() => { printJobTicket(order); }}>Print</button>
          {!readOnly && <button style={styles.btn} onClick={() => { copyOrder(order); onClose(); }}>Copy</button>}
          {!readOnly && <button style={styles.btnDanger} onClick={() => { cancelOrder(order); onClose(); }}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

  function renderOrderModal(title, draft, setField, onSubmit, onClose, saving) {
    return (
      <div style={styles.modalOverlay} onClick={onClose}>
        <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
          <div style={styles.modalHeader}>
            <h2 style={styles.modalTitle}>{title}</h2>
            <button style={styles.smallBtn} onClick={onClose}>Close</button>
          </div>

          <form onSubmit={onSubmit}>
            <div style={styles.formGrid}>
              <div style={styles.fieldWrap}>
                <label style={styles.label}>Customer</label>
                <input list="internal-customers" style={styles.input} value={draft.customer} onChange={(e) => setField("customer", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Mix</label>
                <input list="internal-products" style={styles.input} value={draft.mix_type} onChange={(e) => setField("mix_type", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Quantity (tonnes)</label>
                <input type="number" step="0.01" style={styles.input} value={draft.quantity_tonne} onChange={(e) => setField("quantity_tonne", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Order Date</label>
                <input type="date" style={styles.input} value={draft.order_date} onChange={(e) => setField("order_date", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Load Time</label>
                <div style={styles.timeRow}>
                  <select style={styles.input} value={draft.load_hour} onChange={(e) => setField("load_hour", e.target.value)}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={String(h)}>{h}</option>)}
                  </select>
                  <select style={styles.input} value={draft.load_min} onChange={(e) => setField("load_min", e.target.value)}>
                    {Array.from({ length: 12 }, (_, i) => pad2(i * 5)).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select style={styles.input} value={draft.load_ampm} onChange={(e) => setField("load_ampm", e.target.value)}>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Job #</label>
                <input style={styles.input} value={draft.job_number} onChange={(e) => setField("job_number", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>PO #</label>
                <input style={styles.input} value={draft.po_number} onChange={(e) => setField("po_number", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Foreman</label>
                <input style={styles.input} value={draft.foreman} onChange={(e) => setField("foreman", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Site Contact</label>
                <input style={styles.input} value={draft.site_contact_name} onChange={(e) => setField("site_contact_name", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Site Phone</label>
                <input style={styles.input} value={draft.site_contact_phone} onChange={(e) => setField("site_contact_phone", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Trucks Working</label>
                <input type="number" style={styles.input} value={draft.trucks_working} onChange={(e) => setField("trucks_working", e.target.value)} />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Stagger Minutes</label>
                <input type="number" style={styles.input} value={draft.stagger_minutes} onChange={(e) => setField("stagger_minutes", e.target.value)} />
              </div>

              <div style={{ ...styles.fieldWrap, ...styles.fullWidth }}>
                <label style={styles.label}>Address</label>
                <textarea style={styles.textarea} value={draft.address} onChange={(e) => setField("address", e.target.value)} />
              </div>

              <div style={{ ...styles.fieldWrap, ...styles.fullWidth }}>
                <label style={styles.label}>Notes</label>
                <textarea style={styles.textarea} value={draft.notes} onChange={(e) => setField("notes", e.target.value)} />
              </div>

              <div style={{ ...styles.fieldWrap, ...styles.fullWidth }}>
                <label style={styles.checkRow}>
                  <input type="checkbox" checked={draft.weather_call} onChange={(e) => setField("weather_call", e.target.checked)} />
                  Weather Call
                </label>
              </div>

              {draft.weather_call && (
                <div style={styles.fieldWrap}>
                  <label style={styles.label}>Weather Call Time</label>
                  <div style={styles.timeRow}>
                    <select style={styles.input} value={draft.weather_hour} onChange={(e) => setField("weather_hour", e.target.value)}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={String(h)}>{h}</option>)}
                    </select>
                    <select style={styles.input} value={draft.weather_min} onChange={(e) => setField("weather_min", e.target.value)}>
                      {Array.from({ length: 12 }, (_, i) => pad2(i * 5)).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select style={styles.input} value={draft.weather_ampm} onChange={(e) => setField("weather_ampm", e.target.value)}>
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button type="button" style={styles.smallBtn} onClick={onClose}>Cancel</button>
              <button type="submit" style={styles.createBtn} disabled={saving}>
                {saving ? "Saving..." : title.includes("Edit") ? "Save Changes" : "Create Order"}
              </button>
            </div>
          </form>

          <datalist id="internal-customers">
            {customers.map((customer) => <option key={customer} value={customer} />)}
          </datalist>
          <datalist id="internal-products">
            {products.map((product) => <option key={product} value={product} />)}
          </datalist>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.sidebar}>
          <h1 style={styles.bigTitle}>Plant Orders</h1>

          {!readOnly && (
            <button style={styles.createBtn} onClick={openCreateModal}>
              + Create New Order
            </button>
          )}

          {/* Board Date controls always visible */}
          <div style={{ marginBottom: 12 }}>
            <div style={styles.sub}>Board Date</div>
            <input type="date" style={styles.search} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={styles.smallBtn} onClick={() => setSelectedDate(addDays(selectedDate, -1))}>◀</button>
              <button style={styles.smallBtn} onClick={() => setSelectedDate(toLocalISODate())}>Today</button>
              <button style={styles.smallBtn} onClick={() => setSelectedDate(addDays(selectedDate, 1))}>▶</button>
            </div>
          </div>

          {/* Board Tools collapsible section */}
          <button
            style={styles.collapseHeader}
            onClick={() => setShowBoardTools((v) => !v)}
            aria-expanded={showBoardTools}
            aria-controls="board-tools-section"
          >
            Board Tools
            <span style={{
              ...styles.collapseIcon,
              transform: showBoardTools ? "rotate(90deg)" : "rotate(0deg)",
            }}>
              ▶
            </span>
          </button>
          {showBoardTools && (
            <div id="board-tools-section" style={styles.collapseSection}>
              <div style={styles.sub}>Cloud: Pulled {orders.length} rows</div>
              <div style={styles.sub}>Logged in as: {access?.user?.email || "Unknown user"}</div>
              {error ? <div style={{ color: "#fca5a5", marginBottom: 10 }}>{error}</div> : null}

              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button style={styles.smallBtn} onClick={loadOrders}>Pull</button>
                <button style={styles.smallBtn} onClick={loadLists}>Refresh Lists</button>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 8 }}>
                  <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />{" "}
                  Show completed
                </label>
                <label style={{ display: "block", marginBottom: 8 }}>
                  <input type="checkbox" checked={showCancelledInUnack} onChange={(e) => setShowCancelledInUnack(e.target.checked)} />{" "}
                  Show cancelled in unack
                </label>
              </div>

              <input
                style={styles.search}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer, mix, job #, PO #, foreman..."
              />
            </div>
          )}

          {/* Plant Summary collapsible section */}
          <button
            style={styles.collapseHeader}
            onClick={() => setShowPlantSummary((v) => !v)}
            aria-expanded={showPlantSummary}
            aria-controls="plant-summary-section"
          >
            Plant Summary
            <span style={{
              ...styles.collapseIcon,
              transform: showPlantSummary ? "rotate(90deg)" : "rotate(0deg)",
            }}>
              ▶
            </span>
          </button>
          {showPlantSummary && (
            <div id="plant-summary-section" style={styles.collapseSection}>
              <div style={styles.statBox}>
                <div style={styles.statLine}>Shipped so far: {totals.shipped.toFixed(2)} T</div>
                <div style={styles.statLine}>Total ordered: {totals.totalTonnes.toFixed(2)} T</div>
                <div style={styles.statLine}>Active orders: {totals.orderCount}</div>
              </div>

              <div style={styles.statBox}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>Remaining by Mix</div>
                {remainingByMix.length === 0 ? (
                  <div style={styles.sub}>No remaining active mixes.</div>
                ) : (
                  remainingByMix.map(([mix, tonnes], idx) => (
                    <div key={mix} style={styles.mixRow}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ ...styles.mixBar, background: ["#fb7185", "#fbbf24", "#fb923c", "#a3e635", "#22c55e", "#38bdf8"][idx % 6] }} />
                        <div>{mix}</div>
                      </div>
                      <div>{tonnes.toFixed(2)} T</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Unacknowledged section always visible */}
          <div style={{ ...styles.column, marginTop: 12 }}>
            <div style={styles.columnHeader}>
              <span>Unacknowledged</span>
              <div style={styles.columnBadge}>{board.unack.length}</div>
            </div>
            {board.unack.map(renderCard)}
          </div>
        </div>

        <div style={styles.boardWrap}>
          <div style={{ gridColumn: "1 / span 2", background: "#08182e", border: "1px solid #173052", borderRadius: 16, minHeight: 600, overflow: "hidden", minWidth: 0 }}>
            <div style={styles.columnHeader}>
              <span>Acknowledged</span>
              <div style={styles.columnBadge}>{board.ack.length}</div>
            </div>
            <div style={styles.ackGrid}>
              {board.ack.map((order) => (
                <div key={order.id} style={styles.ackCell}>
                  {renderCard(order)}
                </div>
              ))}
            </div>
          </div>

          <div style={styles.column}>
            <div style={styles.columnHeader}>
              <span>Loading</span>
              <div style={styles.columnBadge}>{board.loaded.length}</div>
            </div>
            {board.loaded.map(renderCard)}
          </div>

          <div style={styles.column}>
            <div style={styles.columnHeader}>
              <span>Completed</span>
              <div style={styles.columnBadge}>{board.complete.length}</div>
            </div>
            {board.complete.map(renderCard)}
          </div>
        </div>
      </div>

      {createOpen && renderOrderModal(
        "Create New Order",
        createDraft,
        setCreateField,
        submitCreateOrder,
        closeCreateModal,
        savingCreate
      )}

      {editOpen && renderOrderModal(
        "Edit Order",
        editDraft,
        setEditField,
        submitEditOrder,
        closeEditModal,
        savingEdit
      )}

      {activeOrder && (
        <OrderActionsModal
          order={activeOrder}
          onClose={() => setActiveOrder(null)}
          readOnly={readOnly}
          recallOrder={recallOrder}
          updateQuantity={updateQuantity}
          printJobTicket={printJobTicket}
          copyOrder={copyOrder}
          cancelOrder={cancelOrder}
          loadOrders={loadOrders}
          styles={styles}
        />
      )}
    </div>
  );
}
