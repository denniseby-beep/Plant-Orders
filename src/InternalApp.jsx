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

function minutesUntil(loadTimeHHmm, orderDateYYYYMMDD) {
  if (!loadTimeHHmm || !orderDateYYYYMMDD) return null;
  const [y, m, d] = String(orderDateYYYYMMDD).split("-").map(Number);
  const [hh, mm] = String(loadTimeHHmm).split(":").map(Number);
  if ([y, m, d, hh, mm].some((x) => Number.isNaN(x))) return null;
  const target = new Date(y, m - 1, d, hh, mm, 0, 0);
  const diffMs = target.getTime() - Date.now();
  return Math.round(diffMs / 60000);
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

function isNightOrder(order) {
  if (!order.load_time) return false;
  const [hh] = String(order.load_time).split(":").map(Number);
  if (Number.isNaN(hh)) return false;
  return hh >= 18 || hh < 5;
}

function OrderActionsModal({
  order,
  onClose,
  readOnly,
  recallOrder,
  updateQuantity,
  cancelOrder,
  copyOrder,
  loadOrders,
  styles,
}) {
  const [weatherCall, setWeatherCall] = useState(order?.weather_call);
  const [savingWeather, setSavingWeather] = useState(false);

  useEffect(() => {
    setWeatherCall(order?.weather_call);
  }, [order]);

  if (!order) return null;

  async function handleWeatherToggle(e) {
    if (readOnly) return;

    const newVal = e.target.checked;
    setWeatherCall(newVal);
    setSavingWeather(true);

    const patch = {
      weather_call: newVal,
      weather_call_time: newVal ? order.weather_call_time || null : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("orders")
      .update(patch)
      .eq("id", order.id);

    setSavingWeather(false);

    if (error) {
      alert(error.message || "Failed to update weather call");
      return;
    }

    await loadOrders();
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Order Details</h2>
          <button style={styles.btn} onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={styles.modalCustomer}>{order.customer || "-"}</div>
          <div style={styles.modalMix}>{order.mix_type || "-"}</div>

          <div style={styles.modalInfo}>
            Qty: {Number(order.quantity_tonne || 0).toFixed(2)} T
          </div>
          <div style={styles.modalInfo}>
            Load: {formatPrettyTime(order.load_time)} ({order.load_time || "-"})
          </div>
          {order.job_number ? (
            <div style={styles.modalInfo}>Job: {order.job_number}</div>
          ) : null}
          {order.po_number ? (
            <div style={styles.modalInfo}>PO: {order.po_number}</div>
          ) : null}
          {order.foreman ? (
            <div style={styles.modalInfo}>Foreman: {order.foreman}</div>
          ) : null}
          {order.site_contact_name ? (
            <div style={styles.modalInfo}>Site Contact: {order.site_contact_name}</div>
          ) : null}
          {order.site_contact_phone ? (
            <div style={styles.modalInfo}>Phone: {order.site_contact_phone}</div>
          ) : null}

          <div style={{ marginTop: 10 }}>
            <div style={{ ...styles.modalInfo, fontWeight: 900, marginBottom: 6 }}>
              Address
            </div>
            <div
              style={{
                ...styles.textarea,
                minHeight: 80,
                marginBottom: 10,
                whiteSpace: "pre-wrap",
              }}
            >
              {order.address || "-"}
            </div>
          </div>

          <div>
            <div style={{ ...styles.modalInfo, fontWeight: 900, marginBottom: 6 }}>
              Notes
            </div>
            <div
              style={{
                ...styles.textarea,
                minHeight: 90,
                whiteSpace: "pre-wrap",
              }}
            >
              {order.notes || "-"}
            </div>
          </div>

          <div
            style={{
              ...styles.modalInfo,
              display: "flex",
              alignItems: "center",
              gap: 10,
              margin: "8px 0",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 900,
                color: weatherCall ? "#111827" : "#cbd5e1",
                background: weatherCall ? "#facc15" : "transparent",
                padding: weatherCall ? "4px 8px" : 0,
                borderRadius: 999,
              }}
            >
              <input
                type="checkbox"
                checked={!!weatherCall}
                disabled={readOnly || savingWeather}
                onChange={handleWeatherToggle}
              />
              Weather Call
              {weatherCall && order.weather_call_time ? (
                <span style={{ fontWeight: 900 }}>
                  • {formatPrettyTime(order.weather_call_time)}
                </span>
              ) : null}
            </label>
            {savingWeather && (
              <span style={{ color: "#facc15", fontSize: 12 }}>Saving...</span>
            )}
          </div>

          <div style={styles.modalInfo}>
            Loaded: {loadedTonnes(order).toFixed(2)} T
          </div>
          <div style={styles.modalInfo}>
            Remaining: {remainingTonnes(order).toFixed(2)} T
          </div>
          <div style={styles.modalInfo}>Status: {order.status}</div>

          <div style={{ ...styles.modalInfo, marginTop: 12 }}>
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

        <div style={styles.modalActions}>
          {!readOnly &&
            (order.status === STATUS.ACK ||
              order.status === STATUS.LOADED ||
              order.status === STATUS.COMPLETE) && (
              <button
                style={styles.btn}
                onClick={() => {
                  recallOrder(order);
                  onClose();
                }}
                type="button"
              >
                Recall
              </button>
            )}

          {!readOnly && order.status !== STATUS.CANCELLED && (
            <button
              style={styles.btn}
              onClick={() => {
                updateQuantity(order);
                onClose();
              }}
              type="button"
            >
              Edit Qty
            </button>
          )}

          <button
            style={styles.btn}
            onClick={() => printJobTicket(order)}
            type="button"
          >
            Print
          </button>

          {!readOnly && (
            <button
              style={styles.btn}
              onClick={() => {
                copyOrder(order);
                onClose();
              }}
              type="button"
            >
              Copy
            </button>
          )}

          {!readOnly && (
            <button
              style={styles.btnDanger}
              onClick={() => {
                cancelOrder(order);
                onClose();
              }}
              type="button"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InternalApp({ access, readOnly }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(toLocalISODate());
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCancelledInUnack, setShowCancelledInUnack] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [configOpen, setConfigOpen] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(emptyDraft(toLocalISODate()));
  const [savingCreate, setSavingCreate] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyDraft(toLocalISODate()));
  const [savingEdit, setSavingEdit] = useState(false);

  const [modalActiveField, setModalActiveField] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);

  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("internal-dark-mode") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("internal-dark-mode", String(darkMode));
    } catch {}
  }, [darkMode]);

  async function loadLists() {
    try {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("name, is_active")
        .order("name", { ascending: true });

      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("name, is_active, color_hex")
        .order("name", { ascending: true });

      if (customerError) throw customerError;
      if (productError) throw productError;

      setCustomers(
        (customerData || [])
          .filter((row) => row.is_active === true || row.is_active == null)
          .map((row) => ({
            name: String(row.name || "").trim(),
          }))
          .filter((row) => row.name)
      );

      setProducts(
        (productData || [])
          .filter((row) => row.is_active === true || row.is_active == null)
          .map((row) => ({
            name: String(row.name || "").trim(),
            color_hex: row.color_hex || "#d1d5db",
          }))
          .filter((row) => row.name)
      );
    } catch (err) {
      setCustomers([]);
      setProducts([]);
      console.error("loadLists failed:", err);
    }
  }

  async function loadOrders() {
    try {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("order_date", selectedDate)
        .order("load_time", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      setOrders(
        (data || []).map((row) => ({
          ...row,
          status: normalizeStatus(row.status),
        }))
      );
    } catch (err) {
      console.error("loadOrders failed:", err);
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, [selectedDate]);

  useEffect(() => {
    loadLists();
  }, []);

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();

    return orders.filter((order) => {
      const matchesSearch =
        !term ||
        [
          order.customer,
          order.mix_type,
          order.job_number,
          order.po_number,
          order.foreman,
          order.address,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));

      return matchesSearch;
    });
  }, [orders, search]);

  const board = useMemo(() => {
    const unack = [];
    const ack = [];
    const loaded = [];
    const complete = [];

    for (const order of filteredOrders) {
      const status = normalizeStatus(order.status);

      if (status === STATUS.CANCELLED) {
        if (showCancelledInUnack) unack.push(order);
        continue;
      }

      if (status === STATUS.UNACK) unack.push(order);
      else if (status === STATUS.ACK) ack.push(order);
      else if (status === STATUS.LOADED) loaded.push(order);
      else if (status === STATUS.COMPLETE) complete.push(order);
    }

    return { unack, ack, loaded, complete };
  }, [filteredOrders, showCancelledInUnack]);

  const totals = useMemo(() => {
    const activeOrders = filteredOrders.filter(
      (o) =>
        normalizeStatus(o.status) !== STATUS.CANCELLED &&
        (showCompleted || normalizeStatus(o.status) !== STATUS.COMPLETE)
    );

    const totalTonnes = activeOrders.reduce(
      (sum, o) => sum + Number(o.quantity_tonne || 0),
      0
    );

    const shipped = activeOrders.reduce((sum, o) => sum + loadedTonnes(o), 0);

    return {
      totalTonnes,
      shipped,
      orderCount: activeOrders.length,
    };
  }, [filteredOrders, showCompleted]);

  const remainingByMix = useMemo(() => {
    const map = new Map();

    for (const order of filteredOrders) {
      const status = normalizeStatus(order.status);
      if (status === STATUS.CANCELLED || status === STATUS.COMPLETE) continue;

      const mix = order.mix_type || "Unknown";
      const remain = remainingTonnes(order);
      map.set(mix, (map.get(mix) || 0) + remain);
    }

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredOrders]);

  const mixColorMap = useMemo(() => {
    const map = new Map();
    for (const product of products || []) {
      if (product?.name) {
        map.set(product.name, product.color_hex || "#d1d5db");
      }
    }
    return map;
  }, [products]);

  const styles = {
    page: {
      minHeight: "100vh",
      background: darkMode ? "#0f172a" : "#f8fafc",
      color: darkMode ? "#e2e8f0" : "#0f172a",
      padding: 12,
      boxSizing: "border-box",
    },

    shell: {
      display: "grid",
      gridTemplateColumns: "320px 1fr 1fr 1fr 1fr",
      gap: 12,
      alignItems: "start",
    },

    sidebarWrap: {
      display: "flex",
      flexDirection: "column",
      gap: 12,
      minHeight: "100%",
    },

    panel: {
      background: darkMode ? "#111827" : "#ffffff",
      border: darkMode ? "1px solid #1f2937" : "1px solid #e2e8f0",
      borderRadius: 16,
      padding: 12,
      boxShadow: darkMode ? "none" : "0 4px 14px rgba(15,23,42,0.06)",
    },

    boardCol: {
      background: darkMode ? "#111827" : "#ffffff",
      border: darkMode ? "1px solid #1f2937" : "1px solid #e2e8f0",
      borderRadius: 16,
      padding: 12,
      minHeight: 400,
      boxShadow: darkMode ? "none" : "0 4px 14px rgba(15,23,42,0.06)",
    },

    colHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontWeight: 900,
      fontSize: 16,
    },

    h1: {
      margin: 0,
      fontSize: 24,
      fontWeight: 950,
    },

    row: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
    },

    small: {
      fontSize: 12,
      color: darkMode ? "#94a3b8" : "#64748b",
    },

    label: {
      fontSize: 12,
      fontWeight: 800,
      marginBottom: 6,
      display: "block",
    },

    input: {
      width: "100%",
      minHeight: 40,
      borderRadius: 10,
      border: darkMode ? "1px solid #334155" : "1px solid #cbd5e1",
      background: darkMode ? "#0f172a" : "#ffffff",
      color: darkMode ? "#e2e8f0" : "#0f172a",
      padding: "8px 10px",
      boxSizing: "border-box",
    },

    textarea: {
      width: "100%",
      minHeight: 90,
      borderRadius: 10,
      border: darkMode ? "1px solid #334155" : "1px solid #cbd5e1",
      background: darkMode ? "#0f172a" : "#ffffff",
      color: darkMode ? "#e2e8f0" : "#0f172a",
      padding: "8px 10px",
      boxSizing: "border-box",
      resize: "vertical",
    },

    btn: {
      border: darkMode ? "1px solid #334155" : "1px solid #cbd5e1",
      background: darkMode ? "#1e293b" : "#ffffff",
      color: darkMode ? "#e2e8f0" : "#0f172a",
      borderRadius: 10,
      padding: "8px 12px",
      fontWeight: 800,
      cursor: "pointer",
    },

    btnPrimary: {
      border: "1px solid #2563eb",
      background: "#2563eb",
      color: "#ffffff",
      borderRadius: 10,
      padding: "8px 12px",
      fontWeight: 900,
      cursor: "pointer",
    },

    btnDanger: {
      border: "1px solid #dc2626",
      background: "#dc2626",
      color: "#ffffff",
      borderRadius: 10,
      padding: "8px 12px",
      fontWeight: 900,
      cursor: "pointer",
    },

    keyBtn: {
      flex: 1,
      minHeight: 44,
      borderRadius: 10,
      border: darkMode ? "1px solid #334155" : "1px solid #cbd5e1",
      background: darkMode ? "#1e293b" : "#f8fafc",
      color: darkMode ? "#e2e8f0" : "#0f172a",
      fontWeight: 900,
      cursor: "pointer",
    },

    keyBtnWide: {
      flex: 2,
      minHeight: 44,
      borderRadius: 10,
      border: darkMode ? "1px solid #334155" : "1px solid #cbd5e1",
      background: darkMode ? "#1e293b" : "#f8fafc",
      color: darkMode ? "#e2e8f0" : "#0f172a",
      fontWeight: 900,
      cursor: "pointer",
    },

    btnBigCreate: {
      width: "100%",
      border: "1px solid #16a34a",
      background: "#16a34a",
      color: "#ffffff",
      borderRadius: 14,
      padding: "14px 16px",
      fontWeight: 900,
      fontSize: 16,
      cursor: "pointer",
    },

    pill: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      background: darkMode ? "#1e293b" : "#e2e8f0",
      color: darkMode ? "#e2e8f0" : "#334155",
    },

    divider: {
      height: 1,
      background: darkMode ? "#1f2937" : "#e2e8f0",
      margin: "12px 0",
    },

    cloudBar: {
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
    },

    orderCard: {
      background: darkMode ? "#0f172a" : "#ffffff",
      border: darkMode ? "1px solid #334155" : "1px solid #e2e8f0",
      boxShadow: darkMode ? "none" : "0 4px 12px rgba(15,23,42,0.08)",
    },

    nightCard: {
      border: "2px solid #8b5cf6",
    },

    weatherCard: {
      boxShadow: "0 0 0 2px #facc15 inset",
    },

    completeCard: {
      opacity: 0.82,
    },

    modalOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 1000,
    },

    modalCard: {
      width: "100%",
      maxWidth: 760,
      maxHeight: "90vh",
      overflow: "auto",
      background: darkMode ? "#111827" : "#ffffff",
      color: darkMode ? "#e2e8f0" : "#0f172a",
      borderRadius: 16,
      padding: 16,
      boxSizing: "border-box",
    },

    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
    },

    modalTitle: {
      margin: 0,
      fontSize: 22,
      fontWeight: 950,
    },

    modalCustomer: {
      fontSize: 20,
      fontWeight: 950,
      marginBottom: 4,
    },

    modalMix: {
      fontSize: 16,
      fontWeight: 800,
      marginBottom: 10,
    },

    modalInfo: {
      fontSize: 14,
      marginBottom: 6,
    },

    modalActions: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      marginTop: 16,
    },

    formGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 12,
    },

    fieldWrap: {
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
    },

    fullWidth: {
      gridColumn: "1 / -1",
    },

    timeRow: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 8,
    },

    checkRow: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontWeight: 800,
    },
  };

  const openCreateModal = () => {
    setCreateDraft(emptyDraft(selectedDate));
    setCreateOpen(true);
    setModalActiveField(null);
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    setCreateDraft(emptyDraft(selectedDate));
    setModalActiveField(null);
  };

  const setCreateField = (field, value) => {
    setCreateDraft((prev) => ({ ...prev, [field]: value }));
  };

  const openEditModal = (order) => {
    if (!order) return;

    const loadParts = parse24ToParts(order.load_time);
    const weatherParts = parse24ToParts(order.weather_call_time);

    setEditingOrder(order);
    setEditDraft({
      customer: order.customer || "",
      mix_type: order.mix_type || "",
      quantity_tonne: order.quantity_tonne ?? "",
      order_date: order.order_date || selectedDate,
      load_hour: loadParts.hour,
      load_min: loadParts.min,
      load_ampm: loadParts.ampm,
      job_number: order.job_number || "",
      po_number: order.po_number || "",
      foreman: order.foreman || "",
      address: order.address || "",
      site_contact_name: order.site_contact_name || "",
      site_contact_phone: order.site_contact_phone || "",
      notes: order.notes || "",
      weather_call: !!order.weather_call,
      weather_hour: weatherParts.hour,
      weather_min: weatherParts.min,
      weather_ampm: weatherParts.ampm,
      trucks_working: order.trucks_working ?? "",
      truck_schedule_mode: order.truck_schedule_mode || "stagger",
      stagger_minutes: order.stagger_minutes ?? "",
    });
    setEditOpen(true);
    setModalActiveField(null);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditingOrder(null);
    setEditDraft(emptyDraft(selectedDate));
    setModalActiveField(null);
  };

  const setEditField = (field, value) => {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  };

  function handleModalKeyPress(key) {
    if (!modalActiveField) return;

    const currentValue =
      modalActiveField === "address"
        ? String(createOpen ? createDraft.address || "" : editDraft.address || "")
        : modalActiveField === "notes"
          ? String(createOpen ? createDraft.notes || "" : editDraft.notes || "")
          : "";

    let nextValue = currentValue;

    if (key === "⌫") {
      nextValue = currentValue.slice(0, -1);
    } else if (key === "SPACE") {
      nextValue = currentValue + " ";
    } else if (key === "CLEAR") {
      nextValue = "";
    } else {
      nextValue = currentValue + key;
    }

    if (createOpen) {
      setCreateField(modalActiveField, nextValue);
    } else if (editOpen) {
      setEditField(modalActiveField, nextValue);
    }
  }

  function renderModalKeyboard() {
    const rows = [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
      ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
      ["Z", "X", "C", "V", "B", "N", "M"],
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            {row.map((key) => (
              <button
                key={key}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleModalKeyPress(key);
                }}
                style={styles.keyBtn}
              >
                {key}
              </button>
            ))}
          </div>
        ))}

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleModalKeyPress("SPACE");
            }}
            style={styles.keyBtnWide}
          >
            Space
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleModalKeyPress("⌫");
            }}
            style={styles.keyBtn}
          >
            ⌫
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleModalKeyPress("CLEAR");
            }}
            style={styles.keyBtn}
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  const submitCreateOrder = async (e) => {
    e.preventDefault();
    try {
      setSavingCreate(true);

      const payload = {
        customer: createDraft.customer || "",
        mix_type: createDraft.mix_type || "",
        quantity_tonne:
          createDraft.quantity_tonne === "" ? null : Number(createDraft.quantity_tonne),
        order_date: createDraft.order_date || selectedDate,
        load_time: partsTo24(
          createDraft.load_hour,
          createDraft.load_min,
          createDraft.load_ampm
        ),
        job_number: createDraft.job_number || "",
        po_number: createDraft.po_number || "",
        foreman: createDraft.foreman || "",
        address: createDraft.address || "",
        site_contact_name: createDraft.site_contact_name || "",
        site_contact_phone: createDraft.site_contact_phone || "",
        notes: createDraft.notes || "",
        weather_call: !!createDraft.weather_call,
        weather_call_time: createDraft.weather_call
          ? partsTo24(
              createDraft.weather_hour,
              createDraft.weather_min,
              createDraft.weather_ampm
            )
          : null,
        trucks_working:
          createDraft.trucks_working === "" ? null : Number(createDraft.trucks_working),
        truck_schedule_mode: createDraft.truck_schedule_mode || "stagger",
        stagger_minutes:
          createDraft.stagger_minutes === "" ? null : Number(createDraft.stagger_minutes),
        status: STATUS.UNACK,
      };

      const { error } = await supabase.from("orders").insert([payload]);
      if (error) throw error;

      closeCreateModal();
      await loadOrders();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to create order");
    } finally {
      setSavingCreate(false);
    }
  };

  const submitEditOrder = async (e) => {
    e.preventDefault();
    if (!editingOrder?.id) return;

    try {
      setSavingEdit(true);

      const payload = {
        customer: editDraft.customer || "",
        mix_type: editDraft.mix_type || "",
        quantity_tonne:
          editDraft.quantity_tonne === "" ? null : Number(editDraft.quantity_tonne),
        order_date: editDraft.order_date || selectedDate,
        load_time: partsTo24(editDraft.load_hour, editDraft.load_min, editDraft.load_ampm),
        job_number: editDraft.job_number || "",
        po_number: editDraft.po_number || "",
        foreman: editDraft.foreman || "",
        address: editDraft.address || "",
        site_contact_name: editDraft.site_contact_name || "",
        site_contact_phone: editDraft.site_contact_phone || "",
        notes: editDraft.notes || "",
        weather_call: !!editDraft.weather_call,
        weather_call_time: editDraft.weather_call
          ? partsTo24(editDraft.weather_hour, editDraft.weather_min, editDraft.weather_ampm)
          : null,
        trucks_working:
          editDraft.trucks_working === "" ? null : Number(editDraft.trucks_working),
        truck_schedule_mode: editDraft.truck_schedule_mode || "stagger",
        stagger_minutes:
          editDraft.stagger_minutes === "" ? null : Number(editDraft.stagger_minutes),
      };

      const { error } = await supabase
        .from("orders")
        .update(payload)
        .eq("id", editingOrder.id);

      if (error) throw error;

      closeEditModal();
      await loadOrders();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to update order");
    } finally {
      setSavingEdit(false);
    }
  };

  const moveStatus = async (order, newStatus) => {
    try {
      const patch = {
        status: normalizeStatus(newStatus),
        updated_at: new Date().toISOString(),
      };

      if (normalizeStatus(newStatus) === STATUS.COMPLETE) {
        patch.completed_at = new Date().toISOString();
      } else {
        patch.completed_at = null;
      }

      const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
      if (error) throw error;

      await loadOrders();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to update status");
    }
  };

  const recallOrder = async (order) => {
    const status = normalizeStatus(order.status);

    let previous = null;
    if (status === STATUS.COMPLETE) previous = STATUS.LOADED;
    else if (status === STATUS.LOADED) previous = STATUS.ACK;
    else if (status === STATUS.ACK) previous = STATUS.UNACK;

    if (!previous) return;

    try {
      const patch = {
        status: previous,
        updated_at: new Date().toISOString(),
      };

      if (previous !== STATUS.COMPLETE) {
        patch.completed_at = null;
      }

      const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
      if (error) throw error;

      await loadOrders();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to recall order");
    }
  };

  const cancelOrder = async (order) => {
    const ok = window.confirm("Cancel this order?");
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          status: STATUS.CANCELLED,
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (error) throw error;

      if (activeOrder?.id === order.id) setActiveOrder(null);
      await loadOrders();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to cancel order");
    }
  };

  const copyOrder = (order) => {
    const loadParts = parse24ToParts(order.load_time);
    const weatherParts = parse24ToParts(order.weather_call_time);

    setCreateDraft({
      customer: order.customer || "",
      mix_type: order.mix_type || "",
      quantity_tonne: order.quantity_tonne ?? "",
      order_date: selectedDate,
      load_hour: loadParts.hour,
      load_min: loadParts.min,
      load_ampm: loadParts.ampm,
      job_number: order.job_number || "",
      po_number: order.po_number || "",
      foreman: order.foreman || "",
      address: order.address || "",
      site_contact_name: order.site_contact_name || "",
      site_contact_phone: order.site_contact_phone || "",
      notes: order.notes || "",
      weather_call: !!order.weather_call,
      weather_hour: weatherParts.hour,
      weather_min: weatherParts.min,
      weather_ampm: weatherParts.ampm,
      trucks_working: order.trucks_working ?? "",
      truck_schedule_mode: order.truck_schedule_mode || "stagger",
      stagger_minutes: order.stagger_minutes ?? "",
    });
    setCreateOpen(true);
    setModalActiveField(null);
  };

  const updateQuantity = (order) => {
    openEditModal(order);
  };

  const applyStandardLoad = async (order, amount) => {
    try {
      const status = normalizeStatus(order.status);
      const remaining = remainingTonnes(order);

      let patch = {
        status:
          status === STATUS.UNACK
            ? STATUS.LOADED
            : status === STATUS.ACK
              ? STATUS.LOADED
              : status,
        updated_at: new Date().toISOString(),
      };

      if (Number(amount) === LOAD_13) {
        patch.loaded_13 = Number(order.loaded_13 || 0) + 1;
      } else if (Number(amount) === LOAD_38) {
        patch.loaded_38 = Number(order.loaded_38 || 0) + 1;
      }

      const newRemaining = Math.max(0, remaining - amount);
      if (newRemaining <= 0) {
        patch.status = STATUS.COMPLETE;
        patch.completed_at = new Date().toISOString();
      }

      const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
      if (error) throw error;

      await loadOrders();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to apply load");
    }
  };

  const applyCustomLoad = async (order) => {
    const input = window.prompt("Enter custom loaded tonnes:", "");
    if (input == null) return;

    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a valid positive number.");
      return;
    }

    try {
      const status = normalizeStatus(order.status);
      const remaining = remainingTonnes(order);
      const currentRemainder = Number(order.loaded_remainder_tonne || 0);

      let patch = {
        loaded_remainder_tonne: currentRemainder + amount,
        status:
          status === STATUS.UNACK
            ? STATUS.LOADED
            : status === STATUS.ACK
              ? STATUS.LOADED
              : status,
        updated_at: new Date().toISOString(),
      };

      const newRemaining = Math.max(0, remaining - amount);
      if (newRemaining <= 0) {
        patch.status = STATUS.COMPLETE;
        patch.completed_at = new Date().toISOString();
      }

      const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
      if (error) throw error;

      await loadOrders();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to apply custom load");
    }
  };

  function renderCard(order) {
  const isComplete = order.status === STATUS.COMPLETE;
  const isCancelled = order.status === STATUS.CANCELLED;
  const night = isNightOrder(order);
  const mins = minutesUntil(order.load_time, order.order_date);
  const isOverdue = mins != null && mins < 0 && !isComplete && !isCancelled;

  const nextStatusLabel =
    order.status === STATUS.UNACK
      ? "Acknowledge"
      : order.status === STATUS.ACK
        ? "Loading"
        : "Complete";

  const nextStatusValue =
    order.status === STATUS.UNACK
      ? STATUS.ACK
      : order.status === STATUS.ACK
        ? STATUS.LOADED
        : STATUS.COMPLETE;

  const mixColor = mixColorMap?.get?.(order.mix_type) || "#d1d5db";
  const tandemCount = Number(order.loaded_13 || 0);
  const transferCount = Number(order.loaded_38 || 0);

  return (
    <div
      key={order.id}
      style={{
        ...styles.orderCard,
        ...(night ? styles.nightCard : {}),
        ...(order.weather_call ? styles.weatherCard : {}),
        ...(isComplete ? styles.completeCard : {}),
        width: 288,
        minWidth: 288,
        maxWidth: 288,
        height: 288,
        minHeight: 288,
        maxHeight: 288,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        boxSizing: "border-box",
        padding: 12,
        borderRadius: 16,
        cursor: "pointer",
      }}
      onClick={() => setActiveOrder(order)}
    >
      <div style={{ overflow: "hidden", flex: 1 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            alignItems: "flex-start",
            marginBottom: 6,
          }}
        >
          <div
            style={{
              fontWeight: 950,
              fontSize: 16,
              lineHeight: 1.15,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {order.customer || "-"}
          </div>

          {order.weather_call ? (
            <div
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid #facc15",
                fontSize: 11,
                color: "#111827",
                background: "#facc15",
                fontWeight: 950,
                flexShrink: 0,
              }}
            >
              WC
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: mixColor,
              border: "1px solid #e5e7eb",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontWeight: 800,
              fontSize: 14,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {order.mix_type || "-"}
          </div>
        </div>

        <div
          style={{
            fontSize: 12,
            color: darkMode ? "#cbd5e1" : "#334155",
            marginBottom: 4,
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span style={{ fontWeight: 800, color: darkMode ? "#94a3b8" : "#64748b" }}>
            Load
          </span>
          <span>{formatPrettyTime(order.load_time)}</span>
        </div>

        <div
          style={{
            fontSize: 10,
            color: darkMode ? "#cbd5e1" : "#334155",
            marginBottom: 4,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ fontWeight: 800, color: darkMode ? "#94a3b8" : "#64748b" }}>
            Qty
          </span>
          <span>{Number(order.quantity_tonne || 0).toFixed(2)} T</span>
        </div>

        <div
          style={{
            fontSize: 10,
            color: darkMode ? "#cbd5e1" : "#334155",
            marginBottom: 4,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ fontWeight: 800, color: darkMode ? "#94a3b8" : "#64748b" }}>
            Remain
          </span>
          <span>{remainingTonnes(order).toFixed(2)} T</span>
        </div>

        {isOverdue ? (
          <div
            style={{
              fontSize: 10,
              color: "#dc2626",
              fontWeight: 800,
              marginBottom: 6,
            }}
          >
            Overdue {Math.abs(mins)} min
          </div>
        ) : mins != null && !isComplete && !isCancelled ? (
          <div
            style={{
              fontSize: 12,
              color: darkMode ? "#94a3b8" : "#64748b",
              marginBottom: 6,
            }}
          >
            In {mins} min
          </div>
        ) : null}

        {order.job_number ? (
          <div
            style={{
              fontSize: 10,
              color: darkMode ? "#cbd5e1" : "#475569",
              marginBottom: 3,
              display: "flex",
              justifyContent: "space-between",
              gap: 0,
            }}
          >
            <span style={{ fontWeight: 800, color: darkMode ? "#94a3b8" : "#64748b" }}>
              Job
            </span>
            <span
              style={{
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                textAlign: "right",
              }}
            >
              {order.job_number}
            </span>
          </div>
        ) : null}
        

        {order.po_number ? (
          <div
            style={{
              fontSize: 10,
              color: darkMode ? "#cbd5e1" : "#475569",
              marginBottom: 3,
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span style={{ fontWeight: 800, color: darkMode ? "#94a3b8" : "#64748b" }}>
              PO
            </span>
            <span
              style={{
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                textAlign: "right",
              }}
            >
              {order.po_number}
            </span>
          </div>
        ) : null}

{order.address ? (
  <div
    style={{
      fontSize: 10,
      marginTop: 4,
      paddingTop: 4,
      borderTop: `1px solid ${darkMode ? "#334155" : "#e2e8f0"}`,
      color: darkMode ? "#cbd5e1" : "#475569",
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis",
      lineHeight: 1.2,
      fontWeight: 600,
    }}
  >
    {String(order.address).split(",")[0]}
  </div>
) : null}
        
      </div>

      <div style={{ marginTop: 10 }}>
        {!readOnly && !isCancelled && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button
              style={{
                ...styles.btn,
                flex: 1,
                padding: "8px 6px",
                fontSize: 12,
              }}
              onClick={(e) => {
                e.stopPropagation();
                applyStandardLoad(order, LOAD_13);
              }}
              type="button"
            >
              {`2X • ${tandemCount}`}
            </button>

            <button
              style={{
                ...styles.btn,
                flex: 1,
                padding: "8px 6px",
                fontSize: 12,
              }}
              onClick={(e) => {
                e.stopPropagation();
                applyStandardLoad(order, LOAD_38);
              }}
              type="button"
            >
              {`T4 • ${transferCount}`}
            </button>

            <button
              style={{
                ...styles.btn,
                flex: 1,
                padding: "8px 6px",
                fontSize: 12,
              }}
              onClick={(e) => {
                e.stopPropagation();
                applyCustomLoad(order);
              }}
              type="button"
            >
              Custom
            </button>
          </div>
        )}

        {!readOnly && !isComplete && !isCancelled && (
          <button
            style={{
              ...styles.btnPrimary,
              width: "100%",
              marginTop: 0,
              padding: "10px 12px",
            }}
            onClick={(e) => {
              e.stopPropagation();
              moveStatus(order, nextStatusValue);
            }}
            type="button"
          >
            {nextStatusLabel}
          </button>
        )}
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
            <button style={styles.btn} onClick={onClose} type="button">
              Close
            </button>
          </div>

          <form onSubmit={onSubmit}>
            <div style={styles.formGrid}>
              <div style={styles.fieldWrap}>
                <label style={styles.label}>Customer</label>
                <input
                  list="internal-customers"
                  style={styles.input}
                  value={draft.customer}
                  onChange={(e) => setField("customer", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Mix</label>
                <input
                  list="internal-products"
                  style={styles.input}
                  value={draft.mix_type}
                  onChange={(e) => setField("mix_type", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Quantity (tonnes)</label>
                <input
                  type="number"
                  step="0.01"
                  style={styles.input}
                  value={draft.quantity_tonne}
                  onChange={(e) => setField("quantity_tonne", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Order Date</label>
                <input
                  type="date"
                  style={styles.input}
                  value={draft.order_date}
                  onChange={(e) => setField("order_date", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Load Time</label>
                <div style={styles.timeRow}>
                  <select
                    style={styles.input}
                    value={draft.load_hour}
                    onChange={(e) => setField("load_hour", e.target.value)}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                      <option key={h} value={String(h)}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <select
                    style={styles.input}
                    value={draft.load_min}
                    onChange={(e) => setField("load_min", e.target.value)}
                  >
                    {Array.from({ length: 12 }, (_, i) => pad2(i * 5)).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    style={styles.input}
                    value={draft.load_ampm}
                    onChange={(e) => setField("load_ampm", e.target.value)}
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Job #</label>
                <input
                  style={styles.input}
                  value={draft.job_number}
                  onChange={(e) => setField("job_number", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>PO #</label>
                <input
                  style={styles.input}
                  value={draft.po_number}
                  onChange={(e) => setField("po_number", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Foreman</label>
                <input
                  style={styles.input}
                  value={draft.foreman}
                  onChange={(e) => setField("foreman", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Site Contact</label>
                <input
                  style={styles.input}
                  value={draft.site_contact_name}
                  onChange={(e) => setField("site_contact_name", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Site Phone</label>
                <input
                  style={styles.input}
                  value={draft.site_contact_phone}
                  onChange={(e) => setField("site_contact_phone", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Trucks Working</label>
                <input
                  type="number"
                  style={styles.input}
                  value={draft.trucks_working}
                  onChange={(e) => setField("trucks_working", e.target.value)}
                />
              </div>

              <div style={styles.fieldWrap}>
                <label style={styles.label}>Stagger Minutes</label>
                <input
                  type="number"
                  style={styles.input}
                  value={draft.stagger_minutes}
                  onChange={(e) => setField("stagger_minutes", e.target.value)}
                />
              </div>

              <div style={{ ...styles.fieldWrap, ...styles.fullWidth }}>
                <label style={styles.label}>Address</label>
                <textarea
                  style={styles.textarea}
                  value={draft.address}
                  onChange={(e) => setField("address", e.target.value)}
                  onFocus={() => setModalActiveField("address")}
                />
              </div>

              <div style={{ ...styles.fieldWrap, ...styles.fullWidth }}>
                <label style={styles.label}>Notes</label>
                <textarea
                  style={styles.textarea}
                  value={draft.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  onFocus={() => setModalActiveField("notes")}
                />
              </div>

              <div style={{ ...styles.fieldWrap, ...styles.fullWidth }}>
                <label style={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={draft.weather_call}
                    onChange={(e) => setField("weather_call", e.target.checked)}
                  />
                  Weather Call
                </label>
              </div>

              {draft.weather_call && (
                <div style={styles.fieldWrap}>
                  <label style={styles.label}>Weather Call Time</label>
                  <div style={styles.timeRow}>
                    <select
                      style={styles.input}
                      value={draft.weather_hour}
                      onChange={(e) => setField("weather_hour", e.target.value)}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={String(h)}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <select
                      style={styles.input}
                      value={draft.weather_min}
                      onChange={(e) => setField("weather_min", e.target.value)}
                    >
                      {Array.from({ length: 12 }, (_, i) => pad2(i * 5)).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      style={styles.input}
                      value={draft.weather_ampm}
                      onChange={(e) => setField("weather_ampm", e.target.value)}
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {modalActiveField && (
              <div style={{ marginTop: 16 }}>
                <div style={{ ...styles.modalInfo, fontWeight: 900, marginBottom: 8 }}>
                  Typing into: {modalActiveField}
                </div>
                {renderModalKeyboard()}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button type="button" style={styles.btn} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" style={styles.btnPrimary} disabled={saving}>
                {saving ? "Saving..." : title.includes("Edit") ? "Save Changes" : "Create Order"}
              </button>
            </div>
          </form>

          <datalist id="internal-customers">
            {customers.map((customer) => (
              <option key={customer.name} value={customer.name} />
            ))}
          </datalist>

          <datalist id="internal-products">
            {products.map((product) => (
              <option key={product.name} value={product.name} />
            ))}
          </datalist>
        </div>
      </div>
    );
  }

  return (
    
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.sidebarWrap}>
          <div style={styles.panel}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <h1 style={styles.h1}>Plant Orders</h1>
              {readOnly ? <div style={styles.pill}>Read Only</div> : null}
            </div>
            {!readOnly && (
  <div>
    <button style={styles.btnBigCreate} onClick={openCreateModal} type="button">
      ➕ Create New Order
    </button>
  </div>
)}

            <div style={{ ...styles.cloudBar, marginTop: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontWeight: 950 }}>
                  Cloud: {loading ? "Loading..." : `Pulled ${orders.length} rows`}
                </div>
                {error ? <div style={{ ...styles.small, color: "#dc2626" }}>{error}</div> : null}
                <div style={styles.small}>
                  Logged in as: {access?.user?.email || "Unknown user"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button style={styles.btn} onClick={loadOrders} type="button">
                  Pull
                </button>
                <button style={styles.btn} onClick={loadLists} type="button">
                  Refresh Lists
                </button>
              </div>
            </div>

            <div style={{ ...styles.row, marginTop: 10 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={styles.label}>Board Date</div>
                <input
                  type="date"
                  style={styles.input}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
                <button
                  style={styles.btn}
                  onClick={() => setSelectedDate((d) => addDays(d, -1))}
                  type="button"
                >
                  ◀
                </button>
                <button
                  style={styles.btn}
                  onClick={() => setSelectedDate(toLocalISODate())}
                  type="button"
                >
                  Today
                </button>
                <button
                  style={styles.btn}
                  onClick={() => setSelectedDate((d) => addDays(d, 1))}
                  type="button"
                >
                  ▶
                </button>
              </div>
            </div>

            <div style={{ ...styles.row, marginTop: 10 }}>
              <label style={styles.row}>
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                />
                <span style={styles.small}>Show completed</span>
              </label>

              <label style={styles.row}>
                <input
                  type="checkbox"
                  checked={showCancelledInUnack}
                  onChange={(e) => setShowCancelledInUnack(e.target.checked)}
                />
                <span style={styles.small}>Show cancelled in unack</span>
              </label>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  style={styles.btn}
                  onClick={() => setConfigOpen((v) => !v)}
                  type="button"
                >
                  {configOpen ? "Close Tools" : "Tools"}
                </button>

                <button
                  style={styles.btn}
                  onClick={() => setDarkMode((v) => !v)}
                  type="button"
                >
                  {darkMode ? "Day Mode" : "Night Mode"}
                </button>
              </div>
            </div>

            {configOpen && (
              <>
                <div style={styles.divider} />
                <div>
                  <div style={styles.label}>Search</div>
                  <input
                    style={styles.input}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search customer, mix, job #, PO #, foreman..."
                  />
                </div>
              </>
            )}
          </div>

          <div style={styles.panel}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <div style={{ fontWeight: 950, fontSize: 16 }}>Remaining by Mix</div>
              <div style={styles.pill}>{selectedDate}</div>
            </div>

            <div style={{ ...styles.small, marginTop: 6 }}>
              Shipped so far: <b>{totals.shipped.toFixed(2)}</b> T • Total ordered:{" "}
              <b>{totals.totalTonnes.toFixed(2)}</b> T • Active orders:{" "}
              <b>{totals.orderCount}</b>
            </div>

            <div style={styles.divider} />

            {remainingByMix.length === 0 ? (
              <div style={styles.small}>No remaining active mixes.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {remainingByMix.map(([mix, tonnes]) => (
                  <div
                    key={mix}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="color"
                        value={mixColorMap.get(mix) || "#d1d5db"}
                        disabled={readOnly}
                        onChange={async (e) => {
                          const newColor = e.target.value;

                          const { error } = await supabase
                            .from("products")
                            .update({ color_hex: newColor })
                            .eq("name", mix);

                          if (error) {
                            alert("Failed to update color");
                          } else {
                            await loadLists();
                          }
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          border: "none",
                          background: "none",
                          cursor: readOnly ? "default" : "pointer",
                          padding: 0,
                        }}
                      />

                      <div style={{ fontWeight: 800 }}>{mix}</div>
                    </div>

                    <div style={{ fontWeight: 950 }}>{tonnes.toFixed(2)} T</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          
        </div>

        <div style={styles.boardCol}>
          <div style={styles.colHeader}>
            <span>Unack</span>
            <span style={styles.small}>{board.unack.length}</span>
          </div>
          <div style={{ height: 10 }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 200,
              alignItems: "center",
            }}
          >
            {board.unack.length ? board.unack.map(renderCard) : <div style={styles.small}>None</div>}
          </div>
        </div>

        <div style={styles.boardCol}>
          <div style={styles.colHeader}>
            <span>Ack</span>
            <span style={styles.small}>{board.ack.length}</span>
          </div>
          <div style={{ height: 10 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 288px)",
              gap: 10,
              alignItems: "start",
              justifyContent: "start",
            }}
          >
            {board.ack.length ? board.ack.map(renderCard) : <div style={styles.small}>None</div>}
          </div>
        </div>

        <div style={styles.boardCol}>
          <div style={styles.colHeader}>
            <span>Loading</span>
            <span style={styles.small}>{board.loaded.length}</span>
          </div>
          <div style={{ height: 10 }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 200,
              alignItems: "center",
            }}
          >
            {board.loaded.length ? board.loaded.map(renderCard) : <div style={styles.small}>None</div>}
          </div>
        </div>

        <div style={styles.boardCol}>
          <div style={styles.colHeader}>
            <span>Completed</span>
            <span style={styles.small}>{board.complete.length}</span>
          </div>
          <div style={{ height: 10 }} />
          {showCompleted ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 200,
                alignItems: "center",
              }}
            >
              {board.complete.length ? board.complete.map(renderCard) : <div style={styles.small}>None</div>}
            </div>
          ) : (
            <div style={styles.small}>Turn on “Show completed” to view.</div>
          )}
        </div>
      </div>

      {createOpen &&
        renderOrderModal(
          "Create New Order",
          createDraft,
          setCreateField,
          submitCreateOrder,
          closeCreateModal,
          savingCreate
        )}

      {editOpen &&
        renderOrderModal(
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
          cancelOrder={cancelOrder}
          copyOrder={copyOrder}
          loadOrders={loadOrders}
          styles={styles}
        />
      )}
    </div>
  );
}