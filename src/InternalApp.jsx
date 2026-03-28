import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const STATUS = {
  UNACK: "Unacknowledged",
  ACK: "Acknowledged",
  LOADED: "Loaded",
  COMPLETE: "Completed",
  CANCELLED: "Cancelled",
};

function normalizeStatus(value) {
  const v = String(value || "").trim().toLowerCase();

  if (v === "unack" || v === "unacknowledged") return STATUS.UNACK;
  if (v === "ack" || v === "acknowledged") return STATUS.ACK;
  if (v === "loaded") return STATUS.LOADED;
  if (v === "complete" || v === "completed") return STATUS.COMPLETE;
  if (v === "cancelled" || v === "canceled" || v === "cancel") {
    return STATUS.CANCELLED;
  }

  return STATUS.UNACK;
}

function formatPrettyTime(hhmm) {
  if (!hhmm || !String(hhmm).includes(":")) return "-";

  const [hhStr, mmStr] = String(hhmm).split(":");
  const hh = parseInt(hhStr, 10);
  const mm = String(parseInt(mmStr, 10)).padStart(2, "0");

  if (Number.isNaN(hh)) return hhmm;

  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = ((hh + 11) % 12) + 1;

  return `${hour12}:${mm} ${ampm}`;
}

function formatDatePretty(dateStr) {
  if (!dateStr) return "-";

  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString();
}

function toLocalISODate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function InternalApp({ access, role, readOnly }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(toLocalISODate());
  const [error, setError] = useState("");

  useEffect(() => {
    loadOrders();
  }, [selectedDate]);

  useEffect(() => {
    const channel = supabase
      .channel("internal-orders-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

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

    const cleaned = (data || []).map((row) => ({
      ...row,
      status: normalizeStatus(row.status),
    }));

    setOrders(cleaned);
    setLoading(false);
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

  function handleNewOrder() {
    alert("Create Order modal coming next.");
  }

  function handleEditOrder(order) {
    alert(`Edit order coming next.\n\nCustomer: ${order.customer || "-"}`);
  }

  function handlePrint(order) {
    window.print();
  }

  const board = useMemo(() => {
    return {
      unack: orders.filter((o) => o.status === STATUS.UNACK),
      ack: orders.filter((o) => o.status === STATUS.ACK),
      loaded: orders.filter((o) => o.status === STATUS.LOADED),
      complete: orders.filter((o) => o.status === STATUS.COMPLETE),
    };
  }, [orders]);

  const totals = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== STATUS.CANCELLED);
    const totalTonnes = activeOrders.reduce((sum, order) => {
      return sum + Number(order.quantity_tonne || 0);
    }, 0);

    return {
      orderCount: activeOrders.length,
      totalTonnes,
    };
  }, [orders]);

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f4f6f8",
      padding: 16,
      fontFamily: "Arial, sans-serif",
      color: "#111827",
    },
    header: {
      background: "#ffffff",
      border: "1px solid #d1d5db",
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      boxShadow: "0 3px 10px rgba(0,0,0,0.05)",
    },
    titleRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    },
    title: {
      margin: 0,
      fontSize: 42,
      fontWeight: 900,
      letterSpacing: 0.5,
    },
    sub: {
      color: "#6b7280",
      fontSize: 15,
      marginTop: 6,
    },
    topButtonRow: {
      display: "flex",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
    },
    newOrderBtn: {
      padding: "12px 18px",
      borderRadius: 12,
      border: "none",
      background: "#dc2626",
      color: "#fff",
      fontWeight: 900,
      fontSize: 16,
      cursor: "pointer",
    },
    refreshBtn: {
      padding: "12px 18px",
      borderRadius: 12,
      border: "1px solid #d1d5db",
      background: "#fff",
      color: "#111827",
      fontWeight: 800,
      fontSize: 15,
      cursor: "pointer",
    },
    readOnly: {
      marginTop: 12,
      padding: 12,
      borderRadius: 10,
      background: "#fff7ed",
      border: "1px solid #fdba74",
      color: "#9a3412",
      fontWeight: 700,
    },
    statsRow: {
      display: "flex",
      gap: 12,
      flexWrap: "wrap",
      marginTop: 14,
    },
    statCard: {
      minWidth: 180,
      background: "#f9fafb",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 12,
    },
    statLabel: {
      fontSize: 13,
      color: "#6b7280",
      marginBottom: 4,
    },
    statValue: {
      fontSize: 24,
      fontWeight: 900,
    },
    board: {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
      gap: 14,
      alignItems: "start",
    },
    column: {
      background: "#ffffff",
      border: "1px solid #d1d5db",
      borderRadius: 16,
      padding: 12,
      minHeight: 500,
      boxShadow: "0 3px 10px rgba(0,0,0,0.05)",
    },
    columnHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
      paddingBottom: 8,
      borderBottom: "2px solid #e5e7eb",
    },
    columnTitle: {
      fontSize: 22,
      fontWeight: 900,
      margin: 0,
    },
    badge: {
      minWidth: 34,
      height: 34,
      borderRadius: 999,
      background: "#111827",
      color: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 900,
      fontSize: 14,
    },
    card: {
      background: "#f9fafb",
      border: "2px solid #d1d5db",
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
      boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
      cursor: "pointer",
    },
    weatherCard: {
      border: "3px solid #facc15",
      background: "#fffbeb",
    },
    customer: {
      fontSize: 20,
      fontWeight: 900,
      marginBottom: 6,
    },
    mix: {
      fontSize: 17,
      fontWeight: 700,
      marginBottom: 6,
    },
    line: {
      fontSize: 14,
      color: "#374151",
      marginBottom: 4,
    },
    btnRow: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginTop: 10,
    },
    btn: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #d1d5db",
      background: "#ffffff",
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 14,
    },
    btnPrimary: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #2563eb",
      background: "#2563eb",
      color: "#ffffff",
      cursor: "pointer",
      fontWeight: 800,
      fontSize: 14,
    },
  };

  function renderCard(order) {
    return (
      <div
        key={order.id}
        onClick={() => handleEditOrder(order)}
        style={{
          ...styles.card,
          ...(order.weather_call ? styles.weatherCard : {}),
        }}
      >
        <div style={styles.customer}>{order.customer || "-"}</div>
        <div style={styles.mix}>{order.mix_type || "-"}</div>

        <div style={styles.line}>
          <b>Tonnes:</b> {order.quantity_tonne ?? "-"}
        </div>
        <div style={styles.line}>
          <b>Load:</b> {formatPrettyTime(order.load_time)}
        </div>
        <div style={styles.line}>
          <b>Date:</b> {formatDatePretty(order.order_date)}
        </div>

        {order.job_number ? (
          <div style={styles.line}>
            <b>Job:</b> {order.job_number}
          </div>
        ) : null}

        {order.po_number ? (
          <div style={styles.line}>
            <b>PO:</b> {order.po_number}
          </div>
        ) : null}

        {order.foreman ? (
          <div style={styles.line}>
            <b>Foreman:</b> {order.foreman}
          </div>
        ) : null}

        {order.address ? (
          <div style={styles.line}>
            <b>Address:</b> {order.address}
          </div>
        ) : null}

        {order.weather_call ? (
          <div style={{ ...styles.line, fontWeight: 800, color: "#92400e" }}>
            Weather Call{" "}
            {order.weather_call_time
              ? `• ${formatPrettyTime(order.weather_call_time)}`
              : ""}
          </div>
        ) : null}

        <div
          style={styles.btnRow}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <button style={styles.btn} onClick={() => handlePrint(order)}>
            Print
          </button>

          {!readOnly && order.status === STATUS.UNACK && (
            <button
              style={styles.btnPrimary}
              onClick={() => moveStatus(order, STATUS.ACK)}
            >
              Acknowledge
            </button>
          )}

          {!readOnly && order.status === STATUS.ACK && (
            <button
              style={styles.btnPrimary}
              onClick={() => moveStatus(order, STATUS.LOADED)}
            >
              Loaded
            </button>
          )}

          {!readOnly && order.status === STATUS.LOADED && (
            <button
              style={styles.btnPrimary}
              onClick={() => moveStatus(order, STATUS.COMPLETE)}
            >
              Complete
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <div>
            <h1 style={styles.title}>COQUITLAM PLANT ORDERS</h1>
            <div style={styles.sub}>
              Logged in as: {access?.user?.email || "Unknown user"}
            </div>
          </div>

          <div style={styles.topButtonRow}>
            {!readOnly && (
              <button style={styles.newOrderBtn} onClick={handleNewOrder}>
                + New Order
              </button>
            )}

            <button style={styles.refreshBtn} onClick={loadOrders}>
              Refresh
            </button>

            <div>
              <label style={{ fontWeight: 700, marginRight: 8 }}>Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {readOnly && (
          <div style={styles.readOnly}>Manager Mode: Read Only</div>
        )}

        {error && <div style={{ color: "crimson", marginTop: 10 }}>{error}</div>}

        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Orders</div>
            <div style={styles.statValue}>{totals.orderCount}</div>
          </div>

          <div style={styles.statCard}>
            <div style={styles.statLabel}>Total Tonnes</div>
            <div style={styles.statValue}>{totals.totalTonnes}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div>Loading orders...</div>
      ) : (
        <div style={styles.board}>
          <div style={styles.column}>
            <div style={styles.columnHeader}>
              <h2 style={styles.columnTitle}>Unacknowledged</h2>
              <div style={styles.badge}>{board.unack.length}</div>
            </div>
            {board.unack.map(renderCard)}
          </div>

          <div style={styles.column}>
            <div style={styles.columnHeader}>
              <h2 style={styles.columnTitle}>Acknowledged</h2>
              <div style={styles.badge}>{board.ack.length}</div>
            </div>
            {board.ack.map(renderCard)}
          </div>

          <div style={styles.column}>
            <div style={styles.columnHeader}>
              <h2 style={styles.columnTitle}>Loaded</h2>
              <div style={styles.badge}>{board.loaded.length}</div>
            </div>
            {board.loaded.map(renderCard)}
          </div>

          <div style={styles.column}>
            <div style={styles.columnHeader}>
              <h2 style={styles.columnTitle}>Complete</h2>
              <div style={styles.badge}>{board.complete.length}</div>
            </div>
            {board.complete.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  );
}