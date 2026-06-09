import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const SCALE_LOCATION = "All Roads Scale";
const COPY_LABELS = ["COPY 1 CARRIER", "COPY 2 CUSTOMER", "COPY 3 FILE"];

const ALL_ROADS_LOGO = "/allroads-logo.png";

export default function ScaleDashboard({ access, role }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [licensePlate, setLicensePlate] = useState("");
  const [driver, setDriver] = useState("");

  const [tareKg, setTareKg] = useState("");
  const [grossKg, setGrossKg] = useState("");
  const [manualReason, setManualReason] = useState("");

  const [unitQuantity, setUnitQuantity] = useState("");

  const [message, setMessage] = useState("");
  const [orderSearch, setOrderSearch] = useState("");

  const [liveWeightKg, setLiveWeightKg] = useState(0);
  const [liveWeightUpdatedAt, setLiveWeightUpdatedAt] = useState(null);
  const [weightMode, setWeightMode] = useState("scale");

  const [activeTab, setActiveTab] = useState("main");
  const [recentTickets, setRecentTickets] = useState([]);
  const [recentSearch, setRecentSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);

  const [showOrderEdit, setShowOrderEdit] = useState(false);
  const [editOrderQty, setEditOrderQty] = useState("");

  const [completedOrders, setCompletedOrders] = useState([]);
  const [selectedCompletedOrder, setSelectedCompletedOrder] = useState(null);
  const [recallQty, setRecallQty] = useState("");
  const [showRecallModal, setShowRecallModal] = useState(false);

  const [recallTonnes, setRecallTonnes] = useState("");

  const [printAfterSave, setPrintAfterSave] = useState(true);

  const [lastKnownTare, setLastKnownTare] = useState(null);

  const [showModifyTicket, setShowModifyTicket] = useState(false);
  const [modifyDraft, setModifyDraft] = useState({
  license_plate: "",
  driver: "",
  gross_kg: "",
  tare_kg: "",
  job_number: "",
  po_number: "",
  foreman: "",
  modified_reason: "",
});

const [showCreateOrder, setShowCreateOrder] = useState(false);

const [editOrderDraft, setEditOrderDraft] = useState({
  customer: "",
  mix_type: "",
  quantity_tonne: "",
  load_time: "",
  job_number: "",
  po_number: "",
  foreman: "",
  address: "",
  notes: "",
});

const [newOrderDraft, setNewOrderDraft] = useState({
  customer: "",
  mix_type: "",
  quantity_tonne: "",
  load_time: new Date().toTimeString().slice(0, 5),
  job_number: "",
  po_number: "",
  foreman: "",
  address: "",
  notes: "",
});

const [customers, setCustomers] = useState([]);

  const [products, setProducts] = useState([]);

  useEffect(() => {
  loadOrders();
  loadCompletedOrders();
  loadRecentTickets();
  loadProducts();
  loadCustomers();
}, [selectedDate]);

  useEffect(() => {
    let cancelled = false;

    async function fetchLiveWeight() {
      const { data, error } = await supabase
        .from("live_scale_weights")
        .select("weight_kg, updated_at")
        .eq("id", "main_scale")
        .single();

      if (error) {
        console.error("Live scale error:", error.message);
        return;
      }

      if (!cancelled && data) {
        setLiveWeightKg(Number(data.weight_kg || 0));
        setLiveWeightUpdatedAt(data.updated_at);
      }
    }

    fetchLiveWeight();
    const timer = setInterval(fetchLiveWeight, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  async function loadOrders() {
  setLoading(true);
  setMessage("");

  const selected = new Date(`${selectedDate}T12:00:00`);
  const yesterday = new Date(selected);
  yesterday.setDate(selected.getDate() - 1);

  const yesterdayText = yesterday.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("scale_order_summary")
    .select("*")
    .or(
      `order_date.eq.${selectedDate},order_date.eq.${yesterdayText},overnight_order.eq.true`
    )
    .order("load_time", { ascending: true });

    console.log("selectedDate", selectedDate);
    console.log("rows returned", data?.length);
    console.log("data", data);

  if (error) {
    console.error(error);
    setMessage("Could not load scale orders.");
    setOrders([]);
  } else {
    setOrders(
      (data || []).filter((order) => {
        const status = String(order.status || "").trim().toLowerCase();

        if (status === "cancelled" || status === "completed") {
          return false;
        }

        const orderDate = dateOnly(order.order_date);

// Always show selected date orders.
if (orderDate === selectedDate) return true;

// Only carry overnight orders forward one day.
if (order.overnight_order === true && orderDate === yesterdayText) {
  return true;
}

return false;

        
      })
    );
  }

  setLoading(false);
}

async function loadCompletedOrders() {
  const { data, error } = await supabase
    .from("scale_order_summary")
    .select("*")
    .eq("order_date", selectedDate)
    .eq("status", "Completed")
    .order("load_time", { ascending: true });

  if (error) {
    console.error("Completed orders load failed:", error);
    setCompletedOrders([]);
    return;
  }

  setCompletedOrders(data || []);
}

async function createOrderFromScale() {
  if (!newOrderDraft.customer.trim()) return alert("Customer is required.");
  if (!newOrderDraft.mix_type.trim()) return alert("Mix type is required.");
  if (!newOrderDraft.quantity_tonne) return alert("Quantity is required.");
  if (!newOrderDraft.load_time) return alert("Load time is required.");

  const orderUnit = getProductUnit(newOrderDraft.mix_type);

  const { error } = await supabase.from("orders").insert([
    {
      customer: newOrderDraft.customer.trim(),
      mix_type: newOrderDraft.mix_type.trim(),
      quantity_tonne: Number(newOrderDraft.quantity_tonne),
      unit: orderUnit,
      load_time: newOrderDraft.load_time,
      order_date: selectedDate,
      job_number: newOrderDraft.job_number.trim(),
      po_number: newOrderDraft.po_number.trim(),
      foreman: newOrderDraft.foreman.trim(),
      address: newOrderDraft.address.trim(),
      notes: newOrderDraft.notes.trim(),
      status: "Unacknowledged",
      overnight_order: false,
    },
  ]);

  if (error) {
    console.error(error);
    alert(`Failed to create order: ${error.message}`);
    return;
  }

  setShowCreateOrder(false);
  setNewOrderDraft({
    customer: "",
    mix_type: "",
    quantity_tonne: "",
    load_time: "",
    job_number: "",
    po_number: "",
    foreman: "",
    address: "",
    notes: "",
  });

  await loadOrders();

  setMessage("Order created and sent to plant dashboard.");
}

async function loadCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, customer_code, is_active")
    .order("name", { ascending: true });

  if (error) {
    console.error("Customer load failed:", error);
    setCustomers([]);
    return;
  }

  setCustomers(
    (data || []).filter((customer) => customer.is_active === true || customer.is_active == null)
  );
}

  async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("name, is_active, color_hex")
    .order("name", { ascending: true });

  if (error) {
    console.error("Product color load failed:", error);
    setProducts([]);
    return;
  }

  setProducts(
    (data || []).filter((row) => row.is_active === true || row.is_active == null)
  );
}

  async function loadRecentTickets() {
  const { data, error } = await supabase
    .from("scale_tickets")
    .select("*, voided, voided_at, void_reason")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error(error);
    setRecentTickets([]);
    return;
  }

  setRecentTickets(data || []);
}

async function lookupPlateHistory(plate) {
  if (!plate || plate.trim().length < 2) return;

  const { data, error } = await supabase
    .from("scale_tickets")
    .select("*")
    .ilike("license_plate", plate.trim())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }

  if (!data) return;

  if (data.driver) {
    setDriver(data.driver);
  }

  if (data.order_id) {
  const matchingOrder = orders.find(
    (order) => String(order.order_id) === String(data.order_id)
  );

  if (matchingOrder) {
    setSelectedOrder(matchingOrder);
    setMessage(`Auto-selected last order for plate ${plate}.`);
  }
}

if (data.tare_kg) {
  const lastTare = Number(data.tare_kg).toFixed(2);

  setLastKnownTare(lastTare);

  if (weightMode === "scale") {
    setTareKg(lastTare);
  }
}

}

  const filteredOrders = useMemo(() => {
    const search = orderSearch.trim().toLowerCase();
    if (!search) return orders;

    return orders.filter((order) =>
      [
        order.customer,
        order.mix_type,
        order.job_number,
        order.po_number,
        order.foreman,
        order.address,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }, [orders, orderSearch]);

  const pendingOrders = useMemo(() => {
    return filteredOrders.filter((o) => Number(o.actual_loaded_tonnes || 0) <= 0);
  }, [filteredOrders]);

  const loadingOrders = useMemo(() => {
    return filteredOrders.filter(
      (o) =>
        Number(o.actual_loaded_tonnes || 0) > 0 &&
        Number(o.remaining_tonnes || 0) > 0
    );
  }, [filteredOrders]);

  const filteredRecentTickets = useMemo(() => {
  const search = recentSearch.trim().toLowerCase();

  if (!search) return recentTickets;

  return recentTickets.filter((ticket) => {
    const ticketNo = String(ticket.ticket_no || "");
    
    // Exact ticket number match
    if (ticketNo === search) {
      return true;
    }

    // Normal text search for everything else
    return [
      ticket.customer,
      ticket.job_number,
      ticket.mix_type,
      ticket.license_plate,
      ticket.driver,
      ticket.po_number,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}, [recentTickets, recentSearch]);

  const pendingLeft = useMemo(() => {
    return pendingOrders.filter((_, index) => index % 2 === 0);
  }, [pendingOrders]);

  const pendingRight = useMemo(() => {
    return pendingOrders.filter((_, index) => index % 2 !== 0);
  }, [pendingOrders]);

  const netKg = useMemo(() => {
    const tare = Number(tareKg || 0);
    const gross = Number(grossKg || 0);
    const net = gross - tare;
    return net > 0 ? net : 0;
  }, [tareKg, grossKg]);

  const netTonnes = useMemo(() => netKg / 1000, [netKg]);

  const selectedOrderUnit = selectedOrder?.unit || "tonne";
  const isScaleProduct = selectedOrderUnit === "tonne";

useEffect(() => {
  if (weightMode !== "scale") return;

  setGrossKg(Number(liveWeightKg || 0).toFixed(2));
}, [liveWeightKg, weightMode]);

  function selectOrder(order) {
  setSelectedOrder(order);

  // Do not clear vehicle info here.
  // This allows the operator to enter the plate first,
  // then select the job/order without losing the plate/tare.
  setManualReason("");
  setMessage("");
}

  function captureTare() {
    setTareKg(Number(liveWeightKg || 0).toFixed(2));
  }

  function captureGross() {
    setGrossKg(Number(liveWeightKg || 0).toFixed(2));
  }

  function newTicket() {
  setSelectedOrder(null);
  setLicensePlate("");
  setDriver("");
  setTareKg("");
  setGrossKg("");
  setUnitQuantity("");
  setManualReason("");
  setMessage("");
}

  async function saveTicket() {
    if (!selectedOrder) return alert("Select an order first.");
    if (!licensePlate.trim()) return alert("Enter a license plate.");
    if (!tareKg || !grossKg) return alert("Capture tare and gross.");
    if (Number(grossKg) <= Number(tareKg)) return alert("Gross must be greater than tare.");
    if (weightMode === "manual" && !manualReason.trim()) {
      return alert("Manual weight reason is required.");
    }

    setSaving(true);
    setMessage("");

    const payload = {
      order_id: selectedOrder.order_id,
      ticket_date: selectedDate,
      customer: selectedOrder.customer || "",
      mix_type: selectedOrder.mix_type || "",
      job_number: selectedOrder.job_number || "",
      po_number: selectedOrder.po_number || "",
      foreman: selectedOrder.foreman || "",
      address: selectedOrder.address || "",
      license_plate: licensePlate.trim().toUpperCase(),
      driver: driver.trim(),
      tare_kg: Number(tareKg),
      gross_kg: Number(grossKg),
      net_kg: Number(netKg.toFixed(2)),
      net_tonnes: Number(netTonnes.toFixed(3)),
      tare_captured_at: new Date().toISOString(),
      gross_captured_at: new Date().toISOString(),
      weight_entry_mode: weightMode,
      manual_weight_reason: weightMode === "manual" ? manualReason.trim() : null,
      printed: false,
    };

    const { data, error } = await supabase
  .from("scale_tickets")
  .insert([payload])
  .select("*")
  .single();

    if (error) {
      console.error(error);
      alert(`Ticket save failed: ${error.message}`);
      setMessage("Ticket save failed.");
      setSaving(false);
      return;
    }

    setMessage(printAfterSave ? "Ticket saved. Printing..." : "Ticket saved.");
setSaving(false);

if (printAfterSave) {
  printScaleTicket(data);
}

await loadOrders();
await loadRecentTickets();
newTicket();
  }

  async function saveOrderQuantity() {
  if (!selectedOrder) return;

  const newQty = Number(editOrderDraft.quantity_tonne || 0);
  const loaded = Number(selectedOrder.actual_loaded_tonnes || 0);

  if (!editOrderDraft.customer.trim()) {
    return alert("Customer is required.");
  }

  if (!editOrderDraft.mix_type.trim()) {
    return alert("Mix type is required.");
  }

  if (newQty <= 0) {
    return alert("Quantity must be greater than 0.");
  }

  if (newQty < loaded) {
    return alert(
      `Cannot reduce below already loaded amount (${loaded.toFixed(2)}).`
    );
  }

  const orderUnit = getProductUnit(editOrderDraft.mix_type);

  const { error } = await supabase
    .from("orders")
    .update({
      customer: editOrderDraft.customer.trim(),
      mix_type: editOrderDraft.mix_type.trim(),
      quantity_tonne: newQty,
      unit: orderUnit,
      load_time: editOrderDraft.load_time,
      job_number: editOrderDraft.job_number.trim(),
      po_number: editOrderDraft.po_number.trim(),
      foreman: editOrderDraft.foreman.trim(),
      address: editOrderDraft.address.trim(),
      notes: editOrderDraft.notes.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", selectedOrder.order_id);

  if (error) {
    console.error(error);
    alert("Failed to update order.");
    return;
  }

  setShowOrderEdit(false);
  await loadOrders();

  setMessage("Order updated.");
}

async function recallCompletedOrder() {
  if (!selectedCompletedOrder) return;

  const newQty = Number(recallQty || 0);
  const shipped = Number(selectedCompletedOrder.actual_loaded_tonnes || 0);

  if (newQty <= 0) {
    return alert("Quantity must be greater than 0.");
  }

  if (newQty < shipped) {
    return alert(
      `Cannot recall below already shipped amount (${shipped.toFixed(2)} t).`
    );
  }

  const { error } = await supabase
    .from("orders")
    .update({
      quantity_tonne: newQty,
      status: "Acknowledged",
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", selectedCompletedOrder.order_id);

  if (error) {
    console.error(error);
    alert("Failed to recall order.");
    return;
  }

  setShowRecallModal(false);
  setSelectedCompletedOrder(null);
  setRecallQty("");

  await loadOrders();
  await loadCompletedOrders();

  setActiveTab("main");
  setMessage("Order recalled and returned to active board.");
}

async function markOrderComplete() {
  if (!selectedOrder) return;

  const confirmed = window.confirm(
    "Mark this order as completed?"
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("orders")
    .update({
      status: "Completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", selectedOrder.order_id);

  if (error) {
    console.error(error);
    alert("Failed to complete order.");
    return;
  }

  setShowOrderEdit(false);

  await loadOrders();

  setSelectedOrder(null);

  setMessage("Order marked completed.");
}

async function cancelSelectedOrder() {
  if (!selectedOrder) return;

  const confirmed = window.confirm(
    "Cancel this order? Existing scale tickets will not be deleted."
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("orders")
    .update({
      status: "Cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", selectedOrder.order_id);

  if (error) {
    console.error(error);
    alert("Failed to cancel order.");
    return;
  }

  setShowOrderEdit(false);
  setSelectedOrder(null);

  await loadOrders();

  setMessage("Order cancelled.");
}

async function toggleOvernightOrder() {
  if (!selectedOrder) return;

  const nextValue = !selectedOrder.overnight_order;

  const { error } = await supabase
    .from("orders")
    .update({
      overnight_order: nextValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", selectedOrder.order_id);

  if (error) {
    console.error(error);
    alert("Failed to update overnight flag.");
    return;
  }

  setShowOrderEdit(false);
  setSelectedOrder(null);

  await loadOrders();

  setMessage(nextValue ? "Order flagged overnight." : "Overnight flag removed.");
}

async function voidSelectedTicket() {
  console.log("Void clicked", selectedTicket);

  if (!selectedTicket) return;

  const reason = "Operator void";

  const { data, error } = await supabase
    .from("scale_tickets")
    .update({
      voided: true,
      voided_at: new Date().toISOString(),
      void_reason: reason,
      modified_at: new Date().toISOString(),
    })
    .eq("ticket_no", selectedTicket.ticket_no)
    .select("*, voided, voided_at, void_reason");

  console.log("void update result", data, error);

  if (error) {
    console.error(error);
    alert(`Failed to void ticket: ${error.message}`);
    return;
  }

  setSelectedTicket(
    data?.[0] || {
      ...selectedTicket,
      voided: true,
      voided_at: new Date().toISOString(),
      void_reason: reason,
    }
  );

  await loadRecentTickets();
  await loadOrders();

  setMessage("Ticket voided and removed from shipped totals.");
}

async function unvoidSelectedTicket() {
  if (!selectedTicket) return;

  const reason = "Operator unvoid";

  const { data, error } = await supabase
    .from("scale_tickets")
    .update({
      voided: false,
      voided_at: null,
      void_reason: null,
      modified_at: new Date().toISOString(),
      modified_reason: reason,
    })
    .eq("ticket_no", selectedTicket.ticket_no)
    .select("*, voided, voided_at, void_reason")
    .single();

  if (error) {
    console.error(error);
    alert(`Failed to unvoid ticket: ${error.message}`);
    return;
  }

  setSelectedTicket(data);

  await loadRecentTickets();
  await loadOrders();

  setMessage("Ticket unvoided and added back to shipped totals.");
}

function openModifyTicket() {
  if (!selectedTicket) return;

  setModifyDraft({
    license_plate: selectedTicket.license_plate || "",
    driver: selectedTicket.driver || "",
    gross_kg: selectedTicket.gross_kg || "",
    tare_kg: selectedTicket.tare_kg || "",
    job_number: selectedTicket.job_number || "",
    po_number: selectedTicket.po_number || "",
    foreman: selectedTicket.foreman || "",
    modified_reason: "",
  });

  setShowModifyTicket(true);
}

async function saveModifiedTicket() {
  if (!selectedTicket) return;

  const gross = Number(modifyDraft.gross_kg || 0);
  const tare = Number(modifyDraft.tare_kg || 0);
  const net = gross - tare;

  if (gross <= tare) {
    alert("Gross must be greater than tare.");
    return;
  }

  if (!modifyDraft.modified_reason.trim()) {
    alert("Modification reason is required.");
    return;
  }

  const { data, error } = await supabase
    .from("scale_tickets")
    .update({
      license_plate: modifyDraft.license_plate.trim().toUpperCase(),
      driver: modifyDraft.driver.trim(),
      gross_kg: gross,
      tare_kg: tare,
      net_kg: net,
      net_tonnes: Number((net / 1000).toFixed(3)),
      job_number: modifyDraft.job_number.trim(),
      po_number: modifyDraft.po_number.trim(),
      foreman: modifyDraft.foreman.trim(),
      modified_at: new Date().toISOString(),
      modified_reason: modifyDraft.modified_reason.trim(),
    })
    .eq("ticket_no", selectedTicket.ticket_no)
    .select("*")
    .single();

  if (error) {
    console.error(error);
    alert(`Failed to modify ticket: ${error.message}`);
    return;
  }

  setSelectedTicket(data);
  setShowModifyTicket(false);

  await loadRecentTickets();
  await loadOrders();

  setMessage("Ticket modified and totals recalculated.");
}

  function printScaleTicket(ticket) {
  if (!ticket) return;

  const html = `
  <html>
    <head>
      <title>Scale Ticket</title>
      <style>
        html, body {
          margin: 0;
          padding: 0;
          font-family: Arial, Helvetica, sans-serif;
          color: #000;
        }

        @page {
          size: letter portrait;
          margin: 0.22in;
        }

        .ticket-page {
          height: 10.56in;
          display: grid;
          grid-template-rows: repeat(3, 1fr);
          gap: 0.04in;
          page-break-after: always;
        }

        .ticket-copy {
          border: 1px solid #000;
          padding: 5px 8px;
          display: grid;
          grid-template-rows: auto 1fr auto;
          overflow: hidden;
        }

        .copy-top {
          display: grid;
          grid-template-columns: 0.85in 1fr 0.85in;
          align-items: center;
          border-bottom: 1px solid #000;
          padding-bottom: 2px;
          margin-bottom: 3px;
        }

        .logo {
          width: 0.65in;
          height: 0.42in;
          object-fit: contain;
        }

        .copy-title {
          text-align: center;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.3px;
          line-height: 1.05;
        }

        .ticket-number-top {
          text-align: right;
          font-size: 15px;
          font-weight: 800;
        }

        .copy-main {
          display: grid;
          grid-template-columns: 1fr 1.7in;
          column-gap: 8px;
          align-items: start;
        }

        .field {
          font-size: 11px;
          line-height: 1.18;
          margin-bottom: 2px;
        }

        .field strong {
          display: inline-block;
          min-width: 64px;
        }

        .right {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .net-box,
        .summary-box {
          border: 1px solid #000;
          padding: 4px;
          font-size: 10px;
        }

        .weight-line,
        .summary-line {
          display: flex;
          justify-content: space-between;
          gap: 6px;
          font-variant-numeric: tabular-nums;
        }

        .summary-title {
          font-weight: 800;
          text-align: center;
          margin-bottom: 2px;
          font-size: 10px;
        }

        .copy-label {
          margin-top: auto;
          padding-top: 6px;
          text-align: center;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.3px;
        }
      </style>
    </head>

    <body>
      <div class="ticket-page">
        ${COPY_LABELS.map(
          (copy) => `
            <div class="ticket-copy">
              <div>
                <div class="copy-top">
                  <img src="${ALL_ROADS_LOGO}" class="logo" />
                  <div class="copy-title">ALL ROADS CONSTRUCTION<br />SCALE TICKET</div>
                  <div class="ticket-number-top">#${ticket.ticket_no || "-"}</div>
                </div>

                <div class="copy-main">
                  <div>
                    <div class="field"><strong>Date:</strong> ${ticket.ticket_date || "-"}</div>
                    <div class="field"><strong>Time:</strong> ${formatTicketTime(ticket.created_at)}</div>
                    <div class="field"><strong>Customer:</strong> ${ticket.customer || "-"}</div>
                    <div class="field"><strong>Address:</strong> ${ticket.address || "-"}</div>
                    <div class="field"><strong>Job:</strong> ${ticket.job_number || "-"}</div>
                    <div class="field"><strong>PO:</strong> ${ticket.po_number || "-"}</div>
                    <div class="field"><strong>Product:</strong> ${ticket.mix_type || "-"}</div>
                    <div class="field"><strong>Vehicle:</strong> ${ticket.license_plate || "-"}</div>
                    <div class="field"><strong>Driver:</strong> ${ticket.driver || "-"}</div>
                  </div>

                  <div class="right">
                    <div class="net-box">
                      <div class="weight-line"><strong>Gross:</strong><span>${formatPrintKg(ticket.gross_kg)} kg</span></div>
                      <div class="weight-line"><strong>Tare:</strong><span>${formatPrintKg(ticket.tare_kg)} kg</span></div>
                      <div class="weight-line"><strong>Net:</strong><span>${formatPrintKg(ticket.net_kg)} kg</span></div>
                    </div>

                    <div class="summary-box">
                      <div class="summary-line"><span>Ticket Qty:</span><span>${Number(ticket.net_tonnes || 0).toFixed(3)} t</span></div>
                      <div class="summary-line"><span>Load Count:</span><span>${Number(selectedOrder?.today_loads || 0) + 1}</span></div>
                      <div class="summary-line"><span>Shipped Total:</span><span>${(
                        Number(selectedOrder?.actual_loaded_tonnes || 0) + Number(ticket.net_tonnes || 0)
                      ).toFixed(3)} t</span></div>
                      <div class="summary-line"><span>Mode:</span><span>${ticket.weight_entry_mode || "scale"}</span></div>
                      <div class="summary-line"><span>Scale:</span><span>${SCALE_LOCATION}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="copy-label">${copy}</div>
            </div>
          `
        ).join("")}
      </div>
    </body>
  </html>
  `;

    const win = window.open("", "_blank", "width=900,height=700");

  if (!win) {
    alert("Popup blocked. Please allow popups for this page.");
    return;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();

  setTimeout(() => {
    win.focus();
    win.print();
  }, 500);
}

const mixColorMap = useMemo(() => {
  const map = new Map();

  for (const product of products || []) {
    if (product?.name) {
      map.set(product.name, product.color_hex || "#d1d5db");
    }
  }

  return map;
}, [products]);

  function renderOrderCard(order) {
    const active = selectedOrder?.order_id === order.order_id;

    const customer = order.customer || "-";
    const mix = order.mix_type || "-";
    const job = order.job_number || "-";
    const po = order.po_number || "-";
    const loadTime = order.load_time || "--:--";
    const address = order.address || "";

    const mixColor = mixColorMap.get(mix) || "#d1d5db";

    const ordered = order.ordered_tonnes ?? order.quantity_tonne ?? 0;
    const loaded = order.actual_loaded_tonnes ?? order.loaded_tonnes ?? 0;
    const remaining =
      order.remaining_tonnes ??
      Math.max(Number(ordered || 0) - Number(loaded || 0), 0);

    const status =
      order.scale_status ||
      (Number(loaded || 0) > 0 && Number(remaining || 0) > 0
        ? "In Progress"
        : Number(remaining || 0) <= 0 && Number(loaded || 0) > 0
        ? "Complete"
        : "Not Started");

    const overnight = order.overnight_order === true;


    return (
  <div
    key={order.order_id || order.id}
    style={{
      ...styles.orderCard,
      ...(active ? styles.orderCardActive : {}),
    }}
    onClick={() => selectOrder(order)}
  >
    <div style={styles.orderTop}>
      <strong style={styles.orderCustomer}>{customer}</strong>

      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {overnight && (
          <span
            style={{
              background: "#7c3aed",
              color: "#fff",
              padding: "4px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            OVERNIGHT
          </span>
        )}

        <span style={statusStyle(status)}>{status}</span>
      </div>
    </div>

    <div style={styles.orderMixRow}>
      <div
        style={{
          ...styles.mixColorDot,
          background: mixColor,
        }}
      />
      <div style={styles.orderMix}>{mix}</div>
    </div>

    <div style={styles.orderGrid}>
      <div style={styles.orderGridBox}>
        <span style={styles.orderGridLabel}>Ordered</span>
        <strong style={styles.orderGridValue}>{num(ordered)} t</strong>
      </div>

      <div style={styles.orderGridBox}>
        <span style={styles.orderGridLabel}>Loaded</span>
        <strong style={styles.orderGridValue}>{num(loaded)} t</strong>
      </div>

      <div style={styles.orderGridBox}>
        <span style={styles.orderGridLabel}>Remain</span>
        <strong style={styles.orderGridValue}>{num(remaining)} t</strong>
      </div>
    </div>

    <div style={styles.orderSmall}>
      {loadTime} · Job {job}
    </div>

    <div style={styles.orderSmall}>PO: {po}</div>
    <div style={styles.orderAddress}>{address}</div>

    <button
      type="button"
      style={{
        width: "100%",
        marginTop: 8,
        padding: "6px 8px",
        border: "1px solid #2563eb",
        background: "#dbeafe",
        color: "#111827",
        fontWeight: 900,
        cursor: "pointer",
      }}
      onClick={(e) => {
        e.stopPropagation();

        setSelectedOrder(order);

        setEditOrderQty(Number(order.ordered_tonnes || 0).toFixed(2));

        setEditOrderDraft({
          customer: order.customer || "",
          mix_type: order.mix_type || "",
          quantity_tonne: order.ordered_tonnes || "",
          load_time: order.load_time || "",
          job_number: order.job_number || "",
          po_number: order.po_number || "",
          foreman: order.foreman || "",
          address: order.address || "",
          notes: order.notes || "",
    });

  setShowOrderEdit(true);
}}
    >
      ✏ Edit Order
    </button>
  </div>
);

  }

  const modifyTicketModal =
  showModifyTicket && selectedTicket ? (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalTitle}>MODIFY TICKET</div>

        <div style={styles.modalCustomer}>
          Ticket #{selectedTicket.ticket_no || "-"}
        </div>

        <input
          style={styles.modalInput}
          placeholder="License Plate"
          value={modifyDraft.license_plate}
          onChange={(e) =>
            setModifyDraft({ ...modifyDraft, license_plate: e.target.value })
          }
        />

        <input
          style={styles.modalInput}
          placeholder="Driver"
          value={modifyDraft.driver}
          onChange={(e) =>
            setModifyDraft({ ...modifyDraft, driver: e.target.value })
          }
        />

        <input
          style={styles.modalInput}
          placeholder="Gross kg"
          value={modifyDraft.gross_kg}
          onChange={(e) =>
            setModifyDraft({ ...modifyDraft, gross_kg: e.target.value })
          }
        />

        <input
          style={styles.modalInput}
          placeholder="Tare kg"
          value={modifyDraft.tare_kg}
          onChange={(e) =>
            setModifyDraft({ ...modifyDraft, tare_kg: e.target.value })
          }
        />

        <input
  style={styles.modalInput}
  placeholder="Job Number"
  value={modifyDraft.job_number}
  onChange={(e) =>
    setModifyDraft({ ...modifyDraft, job_number: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="PO Number"
  value={modifyDraft.po_number}
  onChange={(e) =>
    setModifyDraft({ ...modifyDraft, po_number: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="Foreman"
  value={modifyDraft.foreman}
  onChange={(e) =>
    setModifyDraft({ ...modifyDraft, foreman: e.target.value })
  }
/>

        <select
  style={styles.modalInput}
  value={modifyDraft.reason}
  onChange={(e) =>
    setModifyDraft({
      ...modifyDraft,
      reason: e.target.value,
    })
  }
>
  <option value="">Select Modification Reason *</option>

  <option value="Incorrect vehicle plate">
    Incorrect vehicle plate
  </option>

  <option value="Incorrect gross weight">
    Incorrect gross weight
  </option>

  <option value="Incorrect tare weight">
    Incorrect tare weight
  </option>

  <option value="Driver information corrected">
    Driver information corrected
  </option>

  <option value="Job information corrected">
    Job information corrected
  </option>

  <option value="PO information corrected">
    PO information corrected
  </option>

  <option value="Foreman information corrected">
    Foreman information corrected
  </option>

  <option value="Operator entry error">
    Operator entry error
  </option>

  <option value="Other">
    Other
  </option>
</select>

        <button style={styles.modalButton} onClick={saveModifiedTicket}>
          Save Ticket Changes
        </button>

        <button
          style={styles.modalCancelButton}
          onClick={() => setShowModifyTicket(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  const recallOrderModal =
  showRecallModal && selectedCompletedOrder ? (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalTitle}>RECALL ORDER</div>

        <div style={styles.modalCustomer}>
          {selectedCompletedOrder.customer}
        </div>

        <div style={styles.modalInfo}>
          Product: {selectedCompletedOrder.mix_type}
        </div>

        <div style={styles.modalInfo}>
          Current Ordered: {num(selectedCompletedOrder.ordered_tonnes)} t
        </div>

        <div style={styles.modalInfo}>
          Already Shipped: {num(selectedCompletedOrder.actual_loaded_tonnes)} t
        </div>

        <input
          style={styles.modalInput}
          placeholder="New total order quantity"
          value={recallQty}
          onChange={(e) => setRecallQty(e.target.value)}
        />

        <button style={styles.modalButton} onClick={recallCompletedOrder}>
  Recall Order
</button>

        <button
          style={styles.modalCancelButton}
          onClick={() => setShowRecallModal(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  const orderEditModal =
  showOrderEdit && selectedOrder ? (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <div style={styles.modalTitle}>EDIT ORDER</div>

        <div style={styles.modalCustomer}>
          {selectedOrder.customer}
        </div>

        <div style={styles.modalInfo}>
          Loaded:
          {" "}
          {num(selectedOrder.actual_loaded_tonnes)} T
        </div>

        <input
  style={styles.modalInput}
  placeholder="Customer"
  value={editOrderDraft.customer}
  onChange={(e) =>
    setEditOrderDraft({ ...editOrderDraft, customer: e.target.value })
  }
/>

<select
  style={styles.modalInput}
  value={editOrderDraft.mix_type}
  onChange={(e) =>
    setEditOrderDraft({ ...editOrderDraft, mix_type: e.target.value })
  }
>
  <option value="">Select Mix Type *</option>

  {products.map((product) => (
    <option key={product.name} value={product.name}>
      {product.name}
    </option>
  ))}
</select>

<input
  style={styles.modalInput}
  placeholder="Quantity"
  value={editOrderDraft.quantity_tonne}
  onChange={(e) =>
    setEditOrderDraft({ ...editOrderDraft, quantity_tonne: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  type="time"
  value={editOrderDraft.load_time}
  onChange={(e) =>
    setEditOrderDraft({ ...editOrderDraft, load_time: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="Order / Job Number"
  value={editOrderDraft.job_number}
  onChange={(e) =>
    setEditOrderDraft({ ...editOrderDraft, job_number: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="PO Number"
  value={editOrderDraft.po_number}
  onChange={(e) =>
    setEditOrderDraft({ ...editOrderDraft, po_number: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="Foreman"
  value={editOrderDraft.foreman}
  onChange={(e) =>
    setEditOrderDraft({ ...editOrderDraft, foreman: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="Address"
  value={editOrderDraft.address}
  onChange={(e) =>
    setEditOrderDraft({ ...editOrderDraft, address: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="Notes"
  value={editOrderDraft.notes}
  onChange={(e) =>
    setEditOrderDraft({ ...editOrderDraft, notes: e.target.value })
  }
/>

        <button
          style={styles.modalButton}
          onClick={saveOrderQuantity}
        >
          Save Changes
        </button>

        <button
          style={styles.modalCompleteButton}
          onClick={markOrderComplete}
        >
          Mark Order Complete
        </button>

        <button
          style={styles.modalButton}
          onClick={toggleOvernightOrder}
        >
          {selectedOrder.overnight_order
          ? "Remove Overnight Flag"
          : "Flag Overnight"}
        </button>

        <button
          style={styles.modalDangerButton}
          onClick={cancelSelectedOrder}
>
          Cancel Order
        </button>

        <button
          style={styles.modalCancelButton}
          onClick={() => setShowOrderEdit(false)}
        >
          Close
        </button>
      </div>
    </div>
  ) : null;

  const filteredCreateCustomers = customers.filter((customer) =>
  customer.name
    .toLowerCase()
    .includes(newOrderDraft.customer.trim().toLowerCase())
);

  const createOrderModal = showCreateOrder ? (
  <div style={styles.modalOverlay}>
    <div style={styles.modal}>
      <div style={styles.modalTitle}>CREATE ORDER</div>

      <input
  style={styles.modalInput}
  placeholder="Start typing customer..."
  value={newOrderDraft.customer}
  onChange={(e) =>
    setNewOrderDraft({ ...newOrderDraft, customer: e.target.value })
  }
/>

{newOrderDraft.customer && filteredCreateCustomers.length > 0 && (
  <div
    style={{
      maxHeight: 160,
      overflowY: "auto",
      border: "1px solid #6b7280",
      marginTop: -10,
      marginBottom: 12,
      background: "#ffffff",
    }}
  >
    {filteredCreateCustomers.slice(0, 12).map((customer) => (
      <button
        key={customer.id}
        type="button"
        style={{
          width: "100%",
          textAlign: "left",
          padding: 8,
          border: "none",
          borderBottom: "1px solid #e5e7eb",
          background: "#ffffff",
          cursor: "pointer",
          fontWeight: 800,
        }}
        onClick={() =>
          setNewOrderDraft({
            ...newOrderDraft,
            customer: customer.name,
          })
        }
      >
        {customer.name}
        {customer.customer_code ? ` - ${customer.customer_code}` : ""}
      </button>
    ))}
  </div>
)}

      <select
  style={styles.modalInput}
  value={newOrderDraft.mix_type}
  onChange={(e) =>
    setNewOrderDraft({ ...newOrderDraft, mix_type: e.target.value })
  }
>
  <option value="">Select Mix Type *</option>

  {products.map((product) => (
    <option key={product.name} value={product.name}>
      {product.name}
    </option>
  ))}
</select>

      <input
        style={styles.modalInput}
        placeholder="Quantity Tonnes"
        value={newOrderDraft.quantity_tonne}
        onChange={(e) =>
          setNewOrderDraft({ ...newOrderDraft, quantity_tonne: e.target.value })
        }
      />

      <input
        style={styles.modalInput}
        type="time"
        value={newOrderDraft.load_time}
        onChange={(e) =>
          setNewOrderDraft({ ...newOrderDraft, load_time: e.target.value })
        }
      />

      <input
  style={styles.modalInput}
  placeholder="Order / Job Number"
  value={newOrderDraft.job_number}
  onChange={(e) =>
    setNewOrderDraft({ ...newOrderDraft, job_number: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="PO Number"
  value={newOrderDraft.po_number}
  onChange={(e) =>
    setNewOrderDraft({ ...newOrderDraft, po_number: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="Foreman"
  value={newOrderDraft.foreman}
  onChange={(e) =>
    setNewOrderDraft({ ...newOrderDraft, foreman: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="Address"
  value={newOrderDraft.address}
  onChange={(e) =>
    setNewOrderDraft({ ...newOrderDraft, address: e.target.value })
  }
/>

<input
  style={styles.modalInput}
  placeholder="Notes"
  value={newOrderDraft.notes}
  onChange={(e) =>
    setNewOrderDraft({ ...newOrderDraft, notes: e.target.value })
  }
/>

      <button style={styles.modalButton} onClick={createOrderFromScale}>
        Create Order
      </button>

      <button
        style={styles.modalCancelButton}
        onClick={() => setShowCreateOrder(false)}
      >
        Cancel
      </button>
    </div>
  </div>
) : null;

  return (
    <div style={styles.page}>
  {modifyTicketModal}
  {orderEditModal}
  {recallOrderModal}
  {createOrderModal}
      <div style={styles.topBar}>
  <div>
    <h1 style={styles.title}>Scale Tickets - Auto ID</h1>
    <div style={styles.subtitle}>Plant Orders Scale Dashboard</div>
  </div>

  <div style={{ display: "flex", gap: 8 }}>
    <button
      style={styles.refreshButton}
      onClick={() => {
        loadOrders();
        loadRecentTickets();
      }}
    >
      Refresh
    </button>

    <button
      style={styles.refreshButton}
      onClick={() => {
  setNewOrderDraft({
    customer: "",
    mix_type: "",
    quantity_tonne: "",
    load_time: new Date().toTimeString().slice(0, 5),
    job_number: "",
    po_number: "",
    foreman: "",
    address: "",
    notes: "",
  });

  setShowCreateOrder(true);
}}
    >
      + Create Order
    </button>
  </div>
</div>

      {message && <div style={styles.message}>{message}</div>}

      <div style={styles.shell}>
        <section style={styles.leftPanel}>
          <div style={styles.panelHeader}>ACTIVE ORDERS</div>

          <div style={styles.dateBar}>
            <div style={styles.dateLabel}>Production Date:</div>
            <input
              type="date"
              style={styles.dateInput}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <div style={styles.searchWrap}>
            <input
              style={styles.searchInput}
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder="Search customer, job, mix, PO, address..."
            />

            {orderSearch && (
              <button
                style={styles.clearSearchButton}
                onClick={() => setOrderSearch("")}
              >
                Clear
              </button>
            )}
          </div>

          {loading ? (
            <div style={styles.empty}>Loading orders...</div>
          ) : orders.length === 0 ? (
            <div style={styles.empty}>No active orders found for selected date.</div>
          ) : (
            <div style={styles.orderColumns}>
              <div style={styles.orderLane}>
                <div style={styles.laneTitle}>PENDING</div>
                {pendingLeft.length === 0 ? (
                  <div style={styles.laneEmpty}>No pending orders</div>
                ) : (
                  pendingLeft.map(renderOrderCard)
                )}
              </div>

              <div style={styles.orderLane}>
                <div style={styles.laneTitle}>PENDING</div>
                {pendingRight.length === 0 ? (
                  <div style={styles.laneEmpty}>No pending orders</div>
                ) : (
                  pendingRight.map(renderOrderCard)
                )}
              </div>

              <div style={styles.orderLaneLoading}>
                <div style={styles.laneTitleLoading}>LOADING</div>
                {loadingOrders.length === 0 ? (
                  <div style={styles.laneEmpty}>No orders loading</div>
                ) : (
                  loadingOrders.map(renderOrderCard)
                )}
              </div>
            </div>
          )}
        </section>

        <section style={styles.rightPanel}>
          <div style={styles.tabs}>
            <button
              style={activeTab === "main" ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab("main")}
            >
              1 Main
            </button>

            <button
              style={activeTab === "recent" ? styles.tabActive : styles.tab}
              onClick={() => {
                setActiveTab("recent");
                loadRecentTickets();
              }}
            >
              2 Recent Tickets
            </button>

            <button
              style={activeTab === "completed" ? styles.tabActive : styles.tab}
              onClick={() => {
                setActiveTab("completed");
                loadCompletedOrders();
          }}
>
              3 Completed Orders
            </button>

          </div>

          {activeTab === "recent" ? (
            <div style={styles.recentShell}>
              <div style={styles.recentLeft}>
                <input
                  style={styles.searchInput}
                  value={recentSearch}
                  onChange={(e) => setRecentSearch(e.target.value)}
                  placeholder="Search ticket #, customer, plate, job, mix..."
                />

                <div style={styles.ticketList}>
                  {filteredRecentTickets.length === 0 ? (
                    <div style={styles.empty}>No recent tickets found.</div>
                  ) : (
                    filteredRecentTickets.map((ticket) => (
                      <button
                        key={ticket.id || ticket.ticket_no || `${ticket.order_id}-${ticket.created_at}`}
                        style={{
                          ...styles.ticketCard,
                          ...(selectedTicket?.id === ticket.id
                            ? styles.ticketCardActive
                            : {}),
                        }}
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
  <strong>#{ticket.ticket_no || "-"}</strong>

  {ticket.voided && (
    <span
      style={{
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #dc2626",
        padding: "2px 6px",
        fontSize: 11,
        fontWeight: 900,
      }}
    >
      VOID
    </span>
  )}
</div>
                        <div>{ticket.customer || "-"}</div>
                        <div>{ticket.mix_type || "-"}</div>
                        <div>
                          {num(ticket.net_tonnes)} t ·{" "}
                          {ticket.license_plate || "-"}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div style={styles.recentRight}>
                {selectedTicket ? (
                  <>
                    <div style={styles.boxTitle}>SELECTED TICKET</div>

                    <div style={styles.ticketPreview}>
  {selectedTicket?.voided && (
    <div
      style={{
        background: "#fee2e2",
        color: "#991b1b",
        border: "1px solid #dc2626",
        padding: 10,
        fontWeight: 900,
        marginBottom: 10,
      }}
    >
      VOIDED TICKET
      <div style={{ fontSize: 12, marginTop: 4 }}>
        Reason: {selectedTicket.void_reason || "-"}
      </div>
    </div>
  )}

  <div><strong>Ticket:</strong> #{selectedTicket.ticket_no || "-"}</div>
                      <div><strong>Customer:</strong> {selectedTicket.customer || "-"}</div>
                      <div><strong>Mix:</strong> {selectedTicket.mix_type || "-"}</div>
                      <div><strong>Job:</strong> {selectedTicket.job_number || "-"}</div>
                      <div><strong>PO:</strong> {selectedTicket.po_number || "-"}</div>
                      <div><strong>Address:</strong> {selectedTicket.address || "-"}</div>
                      <div><strong>Plate:</strong> {selectedTicket.license_plate || "-"}</div>
                      <div><strong>Gross:</strong> {num(selectedTicket.gross_kg)} kg</div>
                      <div><strong>Tare:</strong> {num(selectedTicket.tare_kg)} kg</div>
                      <div><strong>Net:</strong> {num(selectedTicket.net_tonnes)} tonnes</div>
                    </div>

                    <button
  style={styles.actionButton}
  onClick={() => printScaleTicket(selectedTicket)}
>
  🖨 Reprint Ticket
</button>

<button
  style={styles.actionButton}
  onClick={openModifyTicket}
>
  ✏ Modify Ticket
</button>

{selectedTicket?.voided ? (
  <button
    style={styles.actionButton}
    onClick={unvoidSelectedTicket}
  >
    ↩ Unvoid Ticket
  </button>
) : (
  <button
    style={styles.cancelButton}
    onClick={voidSelectedTicket}
  >
    ⛔ Void Ticket
  </button>
)}
                  </>
                ) : (
                  <div style={styles.empty}>Select a ticket to preview or reprint.</div>
                )}
              </div>
            </div>
                    ) : activeTab === "completed" ? (
            <div style={styles.recentShell}>
              <div style={styles.recentLeft}>
                <div style={styles.boxTitle}>
                  COMPLETED ORDERS ({completedOrders.length})
                </div>

                <div style={styles.ticketList}>
                  {completedOrders.length === 0 ? (
                    <div style={styles.empty}>No completed orders found.</div>
                  ) : (
                    completedOrders.map((order) => (
                      <button
                        key={order.order_id}
                        style={styles.ticketCard}
                        onClick={() => setSelectedCompletedOrder(order)}
                      >
                        <strong>{order.customer}</strong>
                        <div>{order.mix_type}</div>
                        <div>Ordered: {num(order.ordered_tonnes)} t</div>
                        <div>Shipped: {num(order.actual_loaded_tonnes)} t</div>
                        <div>Job: {order.job_number || "-"}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div style={styles.recentRight}>
                {selectedCompletedOrder ? (
                  <>
                    <div style={styles.boxTitle}>COMPLETED ORDER</div>

                    <div style={styles.ticketPreview}>
                      <div><strong>Customer:</strong> {selectedCompletedOrder.customer}</div>
                      <div><strong>Mix:</strong> {selectedCompletedOrder.mix_type}</div>
                      <div><strong>Ordered:</strong> {num(selectedCompletedOrder.ordered_tonnes)} t</div>
                      <div><strong>Shipped:</strong> {num(selectedCompletedOrder.actual_loaded_tonnes)} t</div>
                      <div><strong>Job:</strong> {selectedCompletedOrder.job_number || "-"}</div>
                    </div>

                    <button
                      style={styles.actionButton}
                      onClick={() => {
                        const ordered = Number(selectedCompletedOrder.ordered_tonnes || 0);
                        const shipped = Number(selectedCompletedOrder.actual_loaded_tonnes || 0);

                      setRecallQty(Math.max(ordered, shipped).toFixed(2));
                      setShowRecallModal(true);
                      }}
                    >
                      ↩ Recall Order
                    </button>
                  </>
                ) : (
                  <div style={styles.empty}>Select a completed order.</div>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.formGrid}>
              <div style={styles.box}>
                <div style={styles.boxTitle}>VEHICLE INFORMATION</div>

                <Field label="Vehicle / Plate">
                  <input
  style={styles.input}
  value={licensePlate}
  onChange={(e) => {
    const value = e.target.value.toUpperCase();

    setLicensePlate(value);

    if (value.length >= 3) {
      lookupPlateHistory(value);
    }
  }}
/>
                </Field>

                <Field label="Driver">
                  <input
                    style={styles.input}
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                  />
                </Field>
              </div>

              <div style={styles.box}>
                <div style={styles.boxTitle}>JOB / ORDER INFORMATION</div>

                <Field label="Order / Job">
                  <input
                    style={styles.input}
                    value={
                      selectedOrder
                        ? `${selectedOrder.job_number || "-"} - ${
                            selectedOrder.customer || ""
                          }`
                        : ""
                    }
                    readOnly
                    placeholder="Select an order from the left"
                  />
                </Field>

                <Field label="Customer">
                  <input style={styles.input} value={selectedOrder?.customer || ""} readOnly />
                </Field>

                <Field label="Mix">
                  <input style={styles.input} value={selectedOrder?.mix_type || ""} readOnly />
                </Field>

                <Field label="P.O. Number">
                  <input style={styles.input} value={selectedOrder?.po_number || ""} readOnly />
                </Field>

                <Field label="Foreman">
                  <input style={styles.input} value={selectedOrder?.foreman || ""} readOnly />
                </Field>

                <Field label="Address">
                  <textarea style={styles.textarea} value={selectedOrder?.address || ""} readOnly />
                </Field>
              </div>

              <div style={styles.box}>
                <div style={styles.boxTitle}>TICKET INFORMATION</div>

                <Field label="Ticket Number">
                  <input style={styles.input} value="Auto Generated" readOnly />
                </Field>

                <Field label="Date">
                  <input style={styles.input} value={selectedDate} readOnly />
                </Field>

                <Field label="Location / Scale">
                  <input style={styles.input} value={SCALE_LOCATION} readOnly />
                </Field>

                <div style={styles.scaleBox}>
                  <div style={styles.liveLabel}>Live Weight:</div>
                  <div style={styles.digitalWeight}>
                    {Number(liveWeightKg || 0).toLocaleString()}
                  </div>
                  <div style={styles.kg}>kg</div>
                </div>

                <div style={styles.updatedText}>
                  Updated:{" "}
                  {liveWeightUpdatedAt
                    ? new Date(liveWeightUpdatedAt).toLocaleTimeString()
                    : "-"}
                </div>

                {isScaleProduct ? (
  <>
    <Field label="Gross">
      <input
        style={styles.input}
        value={grossKg}
        onChange={(e) => setGrossKg(e.target.value)}
        readOnly={weightMode === "scale"}
      />
    </Field>

    <Field label="Tare">
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            style={styles.input}
            value={tareKg}
            onChange={(e) => setTareKg(e.target.value)}
            readOnly={weightMode === "scale"}
          />

          <button
            style={styles.smallButton}
            onClick={captureTare}
            disabled={weightMode !== "scale"}
          >
            Capture Tare
          </button>
        </div>

        {lastKnownTare && (
          <div
            style={{
              fontSize: 11,
              color: "#374151",
              marginTop: 3,
              fontWeight: 700,
            }}
          >
            Last known tare: {num(lastKnownTare)} kg
          </div>
        )}
      </div>
    </Field>

    <Field label="Net">
      <input
        style={styles.input}
        value={netKg.toFixed(2)}
        readOnly
      />
      <strong style={styles.netTonnes}>
        {netTonnes.toFixed(3)} tonne
      </strong>
    </Field>
  </>
) : (
  <Field label={`Quantity (${selectedOrderUnit})`}>
    <input
      style={styles.input}
      value={unitQuantity}
      onChange={(e) => setUnitQuantity(e.target.value)}
      placeholder={`Enter ${selectedOrderUnit} quantity`}
    />
  </Field>
)}

                <Field label="Net">
                  <input style={styles.input} value={netKg.toFixed(2)} readOnly />
                  <strong style={styles.netTonnes}>{netTonnes.toFixed(3)} tonnne</strong>
                </Field>
              </div>

              <div style={styles.box}>
                <div style={styles.boxTitle}>WEIGHT ENTRY MODE</div>

                <div style={styles.modeRow}>
                  <button
                    style={{
                      ...styles.modeButton,
                      ...(weightMode === "scale" ? styles.modeButtonActive : {}),
                    }}
                    onClick={() => {
  setWeightMode("scale");
  setGrossKg(Number(liveWeightKg || 0).toFixed(2));

  if (lastKnownTare) {
    setTareKg(lastKnownTare);
  }
}}
                  >
                    ⚖ Scale Weight Auto
                  </button>

                  <button
                    style={{
                      ...styles.modeButton,
                      ...(weightMode === "manual" ? styles.modeButtonManual : {}),
                    }}
                    onClick={() => {
  setWeightMode("manual");

  // Keep last known tare
  if (lastKnownTare) {
    setTareKg(lastKnownTare);
  }

  // Force operator to enter gross manually
  setGrossKg("");
}}
                  >
                    ✎ Manual Weight Backup
                  </button>
                </div>

                {weightMode === "manual" && (
                  <Field label="Reason">
                    <input
                      style={styles.input}
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder="Required. Example: scale feed down"
                    />
                  </Field>
                )}

                <div style={styles.warning}>
                  Manual weight tickets will clearly print as MANUAL WEIGHT.
                </div>
              </div>

              <div style={styles.box}>
                <div style={styles.boxTitle}>TICKET TOTALS</div>

                <Field label="Today Loads">
  <input
    style={styles.input}
    value={
      selectedOrder
        ? Number(
            selectedOrder.today_loads ??
              selectedOrder.load_count ??
              selectedOrder.loads ??
              selectedOrder.ticket_count ??
              0
          )
        : 0
    }
    readOnly
  />
</Field>

                <Field label="Order Qty">
  <button
    style={styles.editQtyButton}
    onClick={() => {
      setEditOrderQty(
        Number(selectedOrder?.ordered_tonnes || 0).toFixed(2)
      );
      setShowOrderEdit(true);
    }}
    disabled={!selectedOrder}
  >
    {num(selectedOrder?.ordered_tonnes)} tonne
  </button>
</Field>

                <Field label="Shipped">
                  <input
                    style={styles.input}
                    value={`${num(selectedOrder?.actual_loaded_tonnes)} tonne`}
                    readOnly
                  />
                </Field>

                <Field label="Remaining">
  <input
    style={styles.input}
    value={`${num(selectedOrder?.remaining_tonnes)} tonne`}
    readOnly
  />
</Field>
</div>

<div style={styles.box}>
  <div style={styles.boxTitle}>ACTIONS</div>

  <label
    style={{
      display: "flex",
      gap: 8,
      fontWeight: 900,
      marginBottom: 8,
      alignItems: "center",
      color: "#111827",
    }}
  >
    <input
      type="checkbox"
      checked={printAfterSave}
      onChange={(e) => setPrintAfterSave(e.target.checked)}
    />
    Print after saving
  </label>

  <button
  style={styles.actionButton}
  onClick={saveTicket}
  disabled={saving}
>
  💾 {saving ? "Saving..." : "Save / Print"}
</button>

<button
  style={styles.actionButton}
  onClick={newTicket}
>
  🧹 Clear Ticket
</button>

  <button
    style={styles.cancelButton}
    onClick={newTicket}
  >
    ⛔ Cancel Ticket
  </button>
</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}


function Field({ label, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}:</label>
      <div style={styles.fieldControl}>{children}</div>
    </div>
  );
}

function dateOnly(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function num(value) {
  const n = Number(value || 0);
  return n.toFixed(2);
}

function formatPrintKg(value) {
  if (value === null || value === undefined || value === "") return "-";

  const n = Number(value);

  if (Number.isNaN(n)) {
    return String(value);
  }

  return n.toLocaleString();
}

function formatTicketTime(value) {
  if (!value) return "-";

  return new Date(value).toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getProductUnit(productName = "") {
  const name = String(productName).toLowerCase().trim();

  const productNumber = Number(String(productName).match(/\d+/)?.[0] || 0);

  if (name.includes("clean") && name.includes("dump")) return "box";
  if (name.includes("dirty") && name.includes("dump")) return "box";
  if (name.includes("pail") && name.includes("colas")) return "unit";
  if (name.includes("bulk") && name.includes("colas")) return "litre";
  if (name.includes("startup")) return "unit";

  if (productNumber > 0 && productNumber < 7000) return "tonne";

  return "unit";
}

function statusStyle(status) {
  const base = {
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid rgba(0,0,0,0.25)",
  };

  if (status === "Complete") {
    return { ...base, background: "#dcfce7", color: "#14532d" };
  }

  if (status === "In Progress") {
    return { ...base, background: "#fef3c7", color: "#78350f" };
  }

  return { ...base, background: "#e5e7eb", color: "#111827" };
}

const styles = {
  page: {
    height: "100vh",
    background: "#d7d7d7",
    padding: 8,
    fontFamily: "Arial, sans-serif",
    color: "#111827",
    boxSizing: "border-box",
    overflow: "hidden",
    colorScheme: "light",
  },

  topBar: {
    height: 46,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#f3f4f6",
    border: "1px solid #6b7280",
    padding: "6px 10px",
    marginBottom: 6,
    boxSizing: "border-box",
  },

  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
  },

  subtitle: {
    fontSize: 12,
    color: "#374151",
    fontWeight: 700,
  },

  refreshButton: {
    padding: "8px 12px",
    border: "1px solid #111827",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },

  message: {
    position: "fixed",
    top: 58,
    right: 12,
    zIndex: 10,
    background: "#ecfdf5",
    color: "#064e3b",
    border: "1px solid #22c55e",
    padding: 8,
    fontWeight: 900,
    fontSize: 12,
  },

  shell: {
    height: "calc(100vh - 60px)",
    display: "grid",
    gridTemplateColumns: "55% 45%",
    gap: 8,
    overflow: "hidden",
  },

  leftPanel: {
    background: "#f9fafb",
    border: "1px solid #6b7280",
    minHeight: 0,
    overflow: "hidden",
  },

  rightPanel: {
    background: "#f5f5f4",
    border: "1px solid #6b7280",
    minHeight: 0,
    overflow: "hidden",
    padding: 8,
    boxSizing: "border-box",
  },

  panelHeader: {
    height: 34,
    background: "#e5e7eb",
    color: "#0f2f75",
    borderBottom: "1px solid #6b7280",
    padding: "8px 10px",
    fontWeight: 900,
    boxSizing: "border-box",
  },

  dateBar: {
    height: 34,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "0 8px",
    borderBottom: "1px solid #6b7280",
    background: "#eef2f7",
    boxSizing: "border-box",
  },

  dateLabel: {
    fontWeight: 900,
    fontSize: 12,
  },

  dateInput: {
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    padding: "3px 8px",
    fontSize: 12,
  },

  orderMixRow: {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 6,
},

mixColorDot: {
  width: 16,
  height: 16,
  borderRadius: 4,
  border: "1px solid #111827",
  flexShrink: 0,
},

  searchWrap: {
    height: 38,
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 6,
    padding: 6,
    borderBottom: "1px solid #6b7280",
    background: "#f3f4f6",
    boxSizing: "border-box",
  },

  searchInput: {
    width: "100%",
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    padding: "5px 8px",
    fontSize: 13,
    boxSizing: "border-box",
  },

  clearSearchButton: {
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    padding: "5px 10px",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },

  orderColumns: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1.05fr",
    gap: 6,
    padding: 6,
    height: "calc(100% - 106px)",
    boxSizing: "border-box",
    overflow: "hidden",
  },

  orderLane: {
    background: "#f3f4f6",
    border: "1px solid #6b7280",
    overflowY: "auto",
    padding: 5,
    minHeight: 0,
  },

  orderLaneLoading: {
    background: "#fff7ed",
    border: "2px solid #f59e0b",
    overflowY: "auto",
    padding: 5,
    minHeight: 0,
  },

  laneTitle: {
    background: "#d1d5db",
    padding: 8,
    fontWeight: 900,
    textAlign: "center",
    marginBottom: 8,
  },

  laneTitleLoading: {
    background: "#f59e0b",
    color: "#ffffff",
    padding: 8,
    fontWeight: 900,
    textAlign: "center",
    marginBottom: 8,
  },

  laneEmpty: {
    color: "#374151",
    background: "#ffffff",
    fontSize: 13,
    padding: 8,
    textAlign: "center",
    fontWeight: 800,
  },

  empty: {
    padding: 16,
    background: "#ffffff",
    fontWeight: 800,
  },

  orderCard: {
    width: "100%",
    textAlign: "left",
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    padding: 7,
    cursor: "pointer",
    marginBottom: 6,
    boxSizing: "border-box",
  },

  orderCardActive: {
    outline: "3px solid #2563eb",
    background: "#eff6ff",
  },

  orderTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 4,
    fontSize: 12,
  },

  orderCustomer: {
  fontWeight: 900,
  fontSize: 16,
},

  orderMix: {
  fontWeight: 900,
  marginBottom: 6,
  fontSize: 15,
},

  orderGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 4,
    marginBottom: 5,
    fontSize: 11,
  },

  orderGridBox: {
    background: "#f9fafb",
    border: "1px solid #d1d5db",
    padding: 4,
  },

  orderGridLabel: {
    display: "block",
    color: "#374151",
    fontWeight: 800,
    marginBottom: 2,
  },

  orderGridValue: {
  display: "block",
  fontWeight: 900,
  fontSize: 15,
},

  orderSmall: {
  fontSize: 13,
    color: "#374151",
    marginBottom: 3,
    fontWeight: 700,
  },

  orderAddress: {
    fontSize: 13,
    lineHeight: 1.2,
    fontWeight: 700,
  },

  tabs: {
    display: "flex",
    gap: 4,
    height: 32,
    marginBottom: 6,
  },

  tabActive: {
    padding: "6px 12px",
    border: "1px solid #6b7280",
    borderBottom: "none",
    background: "#ffffff",
    fontWeight: 900,
    fontSize: 13,
  },

  tab: {
    padding: "6px 12px",
    border: "1px solid #6b7280",
    background: "#e5e7eb",
    fontWeight: 900,
    fontSize: 13,
  },

  recentShell: {
    height: "calc(100% - 38px)",
    display: "grid",
    gridTemplateColumns: "42% 58%",
    gap: 8,
    overflow: "hidden",
  },

  recentLeft: {
    border: "1px solid #6b7280",
    background: "#f8fafc",
    padding: 8,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },

  recentRight: {
    border: "1px solid #6b7280",
    background: "#ffffff",
    padding: 12,
    overflowY: "auto",
  },

  ticketList: {
    marginTop: 8,
    overflowY: "auto",
    flex: 1,
  },

  ticketCard: {
    width: "100%",
    textAlign: "left",
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    padding: 8,
    marginBottom: 6,
    cursor: "pointer",
    boxSizing: "border-box",
  },

  ticketCardActive: {
    outline: "3px solid #2563eb",
    background: "#dbeafe",
  },

  ticketPreview: {
    display: "grid",
    gap: 8,
    marginBottom: 16,
    fontSize: 14,
  },

  formGrid: {
    height: "calc(100% - 38px)",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gridAutoRows: "min-content",
    gap: 7,
    overflowY: "auto",
    paddingBottom: 12,
    boxSizing: "border-box",
  },

  box: {
    border: "1px solid #6b7280",
    background: "#f8f8f8",
    padding: 8,
    boxSizing: "border-box",
    minHeight: "fit-content",
  },

  boxTitle: {
    color: "#0f2f75",
    fontWeight: 900,
    marginBottom: 7,
    fontSize: 13,
  },

  field: {
    display: "grid",
    gridTemplateColumns: "92px 1fr",
    alignItems: "center",
    marginBottom: 5,
    gap: 6,
  },

  label: {
    fontWeight: 900,
    textDecoration: "underline",
    fontSize: 12,
  },

  fieldControl: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },

  input: {
    width: "100%",
    minHeight: 26,
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    padding: "3px 6px",
    fontSize: 13,
    boxSizing: "border-box",
  },

  textarea: {
    width: "100%",
    minHeight: 42,
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    padding: "3px 6px",
    fontSize: 13,
    boxSizing: "border-box",
    resize: "none",
  },

  scaleBox: {
    display: "grid",
    gridTemplateColumns: "90px 1fr 36px",
    alignItems: "center",
    gap: 7,
    margin: "8px 0 4px",
  },

  liveLabel: {
    fontWeight: 900,
    fontSize: 12,
  },

  digitalWeight: {
    background: "#000000",
    color: "#00ff33",
    fontFamily: "monospace",
    fontSize: 36,
    lineHeight: 1,
    textAlign: "right",
    padding: "6px 10px",
    border: "2px solid #111827",
  },

  kg: {
    fontSize: 18,
    fontWeight: 900,
  },

  updatedText: {
    fontSize: 11,
    color: "#374151",
    fontWeight: 800,
    marginBottom: 8,
    textAlign: "right",
  },

  smallButton: {
    minWidth: 108,
    minHeight: 26,
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },

  netTonnes: {
    minWidth: 88,
    fontSize: 17,
    textAlign: "right",
  },

  modeRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 7,
    marginBottom: 7,
  },

  modeButton: {
    padding: "8px 8px",
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  },

  modeButtonActive: {
    background: "#dcfce7",
    color: "#14532d",
    border: "2px solid #22c55e",
  },

  modeButtonManual: {
    background: "#fef3c7",
    color: "#78350f",
    border: "2px solid #f59e0b",
  },

  warning: {
    background: "#fff7ed",
    color: "#78350f",
    border: "1px solid #f59e0b",
    padding: 7,
    fontWeight: 900,
    textAlign: "center",
    fontSize: 12,
  },

  editQtyButton: {
    width: "100%",
    minHeight: 30,
    border: "1px solid #2563eb",
    background: "#dbeafe",
    color: "#111827",
    fontWeight: 900,
    cursor: "pointer",
  },

  actionButton: {
    width: "100%",
    padding: "9px 10px",
    marginBottom: 7,
    border: "1px solid #6b7280",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
  },

  cancelButton: {
    width: "100%",
    padding: "9px 10px",
    marginBottom: 7,
    border: "1px solid #b91c1c",
    background: "#fee2e2",
    color: "#991b1b",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 13,
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },

  modal: {
    width: 340,
    background: "#ffffff",
    padding: 20,
    border: "2px solid #111827",
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: 900,
    marginBottom: 12,
  },

  modalCustomer: {
    fontWeight: 900,
    marginBottom: 8,
  },

  modalInfo: {
    marginBottom: 12,
  },

  modalInput: {
    width: "100%",
    minHeight: 40,
    fontSize: 20,
    padding: 8,
    marginBottom: 12,
    boxSizing: "border-box",
  },

  modalButton: {
    width: "100%",
    padding: 10,
    marginBottom: 8,
    fontWeight: 900,
    cursor: "pointer",
  },

  modalCompleteButton: {
    width: "100%",
    padding: 10,
    marginBottom: 8,
    background: "#dcfce7",
    border: "1px solid #22c55e",
    fontWeight: 900,
    cursor: "pointer",
  },

  modalDangerButton: {
    width: "100%",
    padding: 10,
    marginBottom: 8,
    background: "#fee2e2",
    border: "1px solid #dc2626",
    color: "#991b1b",
    fontWeight: 900,
    cursor: "pointer",
  },

  modalCancelButton: {
    width: "100%",
    padding: 10,
    background: "#fee2e2",
    border: "1px solid #dc2626",
    fontWeight: 900,
    cursor: "pointer",
  },
};