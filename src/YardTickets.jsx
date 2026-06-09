import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import LogoutButton from "./LogoutButton";

export default function YardTickets({ access }) {
  const today = new Date().toISOString().slice(0, 10);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [recentTickets, setRecentTickets] = useState([]);
  const [lastCreatedTicket, setLastCreatedTicket] = useState(null);

  const [editingTicketId, setEditingTicketId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const [customerSearch, setCustomerSearch] = useState("");

  const [form, setForm] = useState({
    ticket_date: today,
    customer_name: "",
    product_name: "",
    job_number: "",
    license_plate: "",
    quantity: "",
    unit: "tonnes",
    address: "",
    notes: "",
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);

    try {
      const [customersRes, productsRes, jobsRes, vehiclesRes, recentRes] =
  await Promise.all([
    supabase
  .from("customers")
  .select("id, name, customer_code")
  .not("customer_code", "is", null)
  .order("name", { ascending: true }),
    supabase.from("products").select("id, name").order("name", { ascending: true }),
    supabase.from("customer_jobs").select("*").eq("active", true).order("job_number", { ascending: true }),
    supabase.from("customer_vehicles").select("*").eq("active", true).order("license_plate", { ascending: true }),
    supabase.from("yard_tickets").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

      if (customersRes.error) throw customersRes.error;
      if (productsRes.error) throw productsRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;
      if (recentRes.error) throw recentRes.error;

      setCustomers(customersRes.data || []);
      setProducts(productsRes.data || []);
      setJobs(jobsRes.data || []);
      setVehicles(vehiclesRes.data || []);
      setRecentTickets(recentRes.data || []);
    } catch (err) {
      console.error("Error loading yard ticket data:", err);
      alert(err.message || "Failed to load yard ticket data.");
    } finally {
      setLoading(false);
    }
  }

  const filteredJobs = useMemo(() => {
    if (!form.customer_name) return [];
    return jobs.filter(
      (item) =>
        String(item.customer_name || "").trim().toLowerCase() ===
        String(form.customer_name || "").trim().toLowerCase()
    );
  }, [jobs, form.customer_name]);

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateEditForm(field, value) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  function onCustomerChange(value) {
    setForm((prev) => ({
      ...prev,
      customer_name: value,
      job_number: "",
    }));
  }

  function resetForm() {
    setForm({
      ticket_date: today,
      customer_name: "",
      product_name: "",
      job_number: "",
      license_plate: "",
      quantity: "",
      unit: "tonnes",
      address: "",
      notes: "",
    });
  }

  async function autoFillFromLicensePlate(plateValue) {
    const cleanPlate = String(plateValue || "").trim().toUpperCase();

    setForm((prev) => ({
      ...prev,
      license_plate: cleanPlate,
    }));

    if (!cleanPlate) return;

    try {
      const { data, error } = await supabase
        .from("yard_tickets")
        .select("*")
        .ilike("license_plate", cleanPlate)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setForm((prev) => ({
          ...prev,
          license_plate: cleanPlate,
          customer_name: data.customer_name || prev.customer_name,
          product_name: data.product_name || prev.product_name,
          job_number: data.job_number || prev.job_number,
          unit: data.unit || prev.unit,
          address: data.address || prev.address,
          notes: data.notes || prev.notes,
        }));
      }
    } catch (err) {
      console.error("License plate auto-fill failed:", err);
    }
  }

  function formatPrettyDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString();
  }

  function formatQuantity(ticket) {
    if (
      ticket?.quantity === null ||
      ticket?.quantity === undefined ||
      ticket?.quantity === ""
    ) {
      return "-";
    }

    const num = Number(ticket.quantity);

    if (Number.isNaN(num)) {
      return `${ticket.quantity} ${ticket.unit || ""}`.trim();
    }

    return `${num.toFixed(2)} ${ticket.unit || ""}`.trim();
  }

  function safeText(value) {
    return String(value ?? "-")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function buildPassPrntHtml(ticket) {
  const qty = formatQuantity(ticket);
  const isCancelled = ticket?.status === "cancelled";

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      font-family: monospace;
      font-size: 28px;
      width: 576px;
      margin: 0;
      padding: 0;
      color: #000;
      background: #fff;
    }

    .ticket {
      padding: 10px;
    }

    .logo {
      display: block;
      width: 220px;
      max-height: 90px;
      object-fit: contain;
      margin: 0 auto 6px auto;
    }

    .center {
      text-align: center;
    }

    .big {
      font-size: 34px;
      font-weight: bold;
    }

    .bold {
      font-weight: bold;
    }

    .cancelled {
      font-size: 34px;
      font-weight: bold;
      text-align: center;
      margin: 12px 0;
    }

    .label {
      font-size: 24px;
    }

    .value {
      font-size: 30px;
      font-weight: bold;
      margin-bottom: 10px;
    }
  </style>
</head>

<body>
  <div class="ticket">
    <img class="logo" src="https://plant-orders.vercel.app/allroads-logo.png" />

    <div class="center bold">YARD TICKET</div>

    ${isCancelled ? `<div class="cancelled">*** CANCELLED ***</div>` : ""}

    <div class="line"></div>

    <div>Ticket: ${safeText(ticket.ticket_no)}</div>
    <div>Date: ${safeText(formatPrettyDate(ticket.ticket_date))}</div>

    <br />

    <div class="label">Customer:</div>
    <div class="value">${safeText(ticket.customer_name)}</div>

    <div class="label">Product:</div>
    <div class="value">${safeText(ticket.product_name)}</div>

    <div>Job #: ${safeText(ticket.job_number)}</div>
    <div>Plate: ${safeText(ticket.license_plate)}</div>
    <div>Address: ${safeText(ticket.address)}</div>

    <br />

    <div class="bold">Quantity: ${safeText(qty)}</div>

    <br />

    <div>Notes:</div>
    <div>${safeText(ticket.notes)}</div>

    <div class="line"></div>
  </div>
</body>
</html>
`;
}

  function printYardTicket(ticket) {
    if (!ticket) {
      alert("No ticket selected to print.");
      return;
    }

    const html = buildPassPrntHtml(ticket);
    const encodedHtml = encodeURIComponent(html);
    const backUrl = encodeURIComponent(window.location.href);

    const passPrntUrl = `starpassprnt://v1/print/nopreview?back=${backUrl}&html=${encodedHtml}`;

    window.location.href = passPrntUrl;
  }

  async function handleSave(e) {
  e.preventDefault();

  if (!form.customer_name || !form.product_name) {
    alert("Please enter a customer and product.");
    return;
  }

  setSaving(true);

  try {
    const selectedCustomer = customers.find(
      (item) =>
        String(item.name || "").trim().toLowerCase() ===
        String(form.customer_name || "").trim().toLowerCase()
    );

    console.log("SELECTED CUSTOMER", selectedCustomer);

    const selectedProduct = products.find(
      (item) =>
        String(item.name || "").trim().toLowerCase() ===
        String(form.product_name || "").trim().toLowerCase()
    );

    const selectedJob = jobs.find(
      (item) =>
        String(item.job_number || "").trim().toLowerCase() ===
          String(form.job_number || "").trim().toLowerCase() &&
        String(item.customer_name || "").trim().toLowerCase() ===
          String(form.customer_name || "").trim().toLowerCase()
    );

    const selectedVehicle = vehicles.find(
      (item) =>
        String(item.license_plate || "").trim().toLowerCase() ===
        String(form.license_plate || "").trim().toLowerCase()
    );

    const payload = {
      ticket_date: form.ticket_date,

      customer_id: selectedCustomer?.id || null,
      customer_code: selectedCustomer?.customer_code || null,
      customer_name: selectedCustomer?.name || form.customer_name || null,

      product_id: selectedProduct?.id || null,
      product_name: form.product_name || null,

      job_id: selectedJob?.id || null,
      job_number: selectedJob?.job_number || form.job_number || null,
      job_description: selectedJob?.job_description || null,

      vehicle_id: selectedVehicle?.id || null,
      license_plate: form.license_plate || null,

      quantity: form.quantity ? Number(form.quantity) : null,
      unit: form.unit || "tonnes",

      address: form.address || null,
      notes: form.notes || null,

      status: "active",
      created_by: access?.user?.id || null,
      source_app: "plant_orders",
    };

    const { data, error } = await supabase
      .from("yard_tickets")
      .insert([payload])
      .select()
      .single();

    if (error) throw error;

    setLastCreatedTicket(data);
    await loadInitialData();
    printYardTicket(data);
    resetForm();
  } catch (err) {
    console.error("Error saving yard ticket:", err);
    alert(err.message || "Failed to save yard ticket.");
  } finally {
    setSaving(false);
  }
}

  function startEditTicket(ticket) {
    setEditingTicketId(ticket.id);
    setEditForm({
      ticket_date: ticket.ticket_date || today,
      customer_name: ticket.customer_name || "",
      product_name: ticket.product_name || "",
      job_number: ticket.job_number || "",
      license_plate: ticket.license_plate || "",
      quantity: ticket.quantity ?? "",
      unit: ticket.unit || "tonnes",
      address: ticket.address || "",
      notes: ticket.notes || "",
    });
  }

  function closeEditTicket() {
    setEditingTicketId(null);
    setEditForm({});
  }

  async function saveEditedTicket(ticket) {
    if (!editForm.customer_name || !editForm.product_name) {
      alert("Please enter a customer and product.");
      return;
    }

    setSaving(true);

    try {
      const selectedCustomer = customers.find(
  (item) =>
    String(item.customer_name || "").trim().toLowerCase() ===
    String(editForm.customer_name || "").trim().toLowerCase()
);

      const selectedProduct = products.find(
        (item) =>
          String(item.name || "").trim().toLowerCase() ===
          String(editForm.product_name || "").trim().toLowerCase()
      );

      const selectedJob = jobs.find(
        (item) =>
          String(item.job_number || "").trim().toLowerCase() ===
            String(editForm.job_number || "").trim().toLowerCase() &&
          String(item.customer_name || "").trim().toLowerCase() ===
            String(editForm.customer_name || "").trim().toLowerCase()
      );

      const selectedVehicle = vehicles.find(
        (item) =>
          String(item.license_plate || "").trim().toLowerCase() ===
          String(editForm.license_plate || "").trim().toLowerCase()
      );

      const payload = {
  ticket_date: editForm.ticket_date,

  customer_id: ticket.customer_id || null,
  customer_code: selectedCustomer?.customer_code || ticket.customer_code || null,
  customer_name: selectedCustomer?.name || editForm.customer_name || null,

  product_id: selectedProduct?.id || ticket.product_id || null,
  product_name: editForm.product_name || null,

  job_id: selectedJob?.id || ticket.job_id || null,
  job_number: selectedJob?.job_number || editForm.job_number || null,
  job_description: selectedJob?.job_description || ticket.job_description || null,

  vehicle_id: selectedVehicle?.id || ticket.vehicle_id || null,
  license_plate: editForm.license_plate || null,

  quantity: editForm.quantity ? Number(editForm.quantity) : null,
  unit: editForm.unit || "tonnes",

  address: editForm.address || null,
  notes: editForm.notes || null,

  updated_at: new Date().toISOString(),
};

      const { data, error } = await supabase
        .from("yard_tickets")
        .update(payload)
        .eq("id", ticket.id)
        .select()
        .single();

      if (error) throw error;

      setLastCreatedTicket(data);
      setEditingTicketId(null);
      setEditForm({});
      await loadInitialData();

      const shouldPrint = window.confirm("Ticket saved. Reprint updated ticket?");
      if (shouldPrint) printYardTicket(data);
    } catch (err) {
      console.error("Error updating yard ticket:", err);
      alert(err.message || "Failed to update yard ticket.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelYardTicket(ticket) {
    const ok = window.confirm(
      `Cancel yard ticket ${ticket.ticket_no || ""}? This keeps the ticket for accounting but marks it as cancelled.`
    );

    if (!ok) return;

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from("yard_tickets")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: access?.user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticket.id)
        .select()
        .single();

      if (error) throw error;

      setLastCreatedTicket(data);
      await loadInitialData();

      const shouldPrint = window.confirm("Ticket cancelled. Print cancelled copy?");
      if (shouldPrint) printYardTicket(data);
    } catch (err) {
      console.error("Error cancelling yard ticket:", err);
      alert(err.message || "Failed to cancel yard ticket.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={styles.loading}>Loading Yard Tickets...</div>;
  }

  return (
    <div style={styles.page}>
      <div style={topBarStyle}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Yard Tickets</div>
        <LogoutButton />
      </div>

      <div style={styles.header}>
        <h1 style={styles.title}>Yard Tickets</h1>
        <p style={styles.subtitle}>Simple iPhone / iPad yard ticket entry</p>
        <div style={styles.headerAccent} />
      </div>

      <form onSubmit={handleSave} style={styles.card}>
        <div style={styles.grid}>
          <Field label="Ticket Date">
            <input
              type="date"
              value={form.ticket_date}
              onChange={(e) => updateForm("ticket_date", e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="License Plate">
            <input
              list="yard-plates"
              value={form.license_plate}
              onChange={(e) => updateForm("license_plate", e.target.value.toUpperCase())}
              onBlur={(e) => autoFillFromLicensePlate(e.target.value)}
              style={styles.input}
              placeholder="Enter plate first..."
            />
            <datalist id="yard-plates">
              {vehicles.map((item) => (
                <option key={item.id || item.license_plate} value={item.license_plate} />
              ))}
            </datalist>
          </Field>

          <Field label="Customer">
            <input
  style={styles.input}
  value={customerSearch}
  onChange={(e) => setCustomerSearch(e.target.value)}
  placeholder="Search customer..."
/>
  <select
    value={form.customer_name}
    onChange={(e) => onCustomerChange(e.target.value)}
    style={{
      ...styles.input,
      color: "#111827",
      backgroundColor: "#ffffff",
    }}
    required
  >
    <option value="">Select customer...</option>

    {customers.map((customer) => (
      <option key={customer.id} value={customer.name}>
        {customer.name}
      </option>
    ))}
  </select>
</Field>

          <Field label="Product">
            <input
              list="yard-products"
              value={form.product_name}
              onChange={(e) => updateForm("product_name", e.target.value)}
              style={styles.input}
              placeholder="Start typing product..."
            />
            <datalist id="yard-products">
              {products.map((item) => (
                <option key={item.id || item.name} value={item.name} />
              ))}
            </datalist>
          </Field>

          <Field label="Job Number">
            <input
              list="yard-jobs"
              value={form.job_number}
              onChange={(e) => updateForm("job_number", e.target.value)}
              style={styles.input}
              placeholder="Start typing job..."
            />
            <datalist id="yard-jobs">
              {filteredJobs.map((item) => (
                <option key={item.id} value={item.job_number} />
              ))}
            </datalist>
          </Field>

          <Field label="Quantity">
            <input
              type="number"
              step="0.01"
              value={form.quantity}
              onChange={(e) => updateForm("quantity", e.target.value)}
              style={styles.input}
              placeholder="Enter quantity"
            />
          </Field>

          <Field label="Unit">
            <select
              value={form.unit}
              onChange={(e) => updateForm("unit", e.target.value)}
              style={styles.input}
            >
              <option value="tonnes">Tonnes</option>
              <option value="yards">Yards</option>
              <option value="loads">Loads</option>
              <option value="each">Each</option>
            </select>
          </Field>

          <Field label="Address">
            <input
              type="text"
              value={form.address}
              onChange={(e) => updateForm("address", e.target.value)}
              style={styles.input}
              placeholder="Address"
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => updateForm("notes", e.target.value)}
            style={styles.textarea}
            rows={4}
            placeholder="Optional notes"
          />
        </Field>

        <div style={styles.actions}>
          <button type="submit" style={styles.primaryButton} disabled={saving}>
            {saving ? "Saving..." : "Create & Print Yard Ticket"}
          </button>

          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => printYardTicket(lastCreatedTicket)}
            disabled={!lastCreatedTicket}
          >
            Print Last Ticket
          </button>
        </div>
      </form>

      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>Recent Yard Tickets</h2>

        <div style={styles.ticketList}>
          {recentTickets.length === 0 ? (
            <div style={styles.empty}>No yard tickets yet.</div>
          ) : (
            recentTickets.map((ticket) => {
              const isEditing = editingTicketId === ticket.id;
              const isCancelled = ticket.status === "cancelled";

              return (
                <div
                  key={ticket.id}
                  style={{
                    ...styles.ticketRow,
                    ...(isCancelled ? styles.cancelledTicketRow : {}),
                  }}
                >
                  <div style={styles.ticketTop}>
                    <strong>
                      {ticket.ticket_no || "Pending #"}
                      {isCancelled ? " - CANCELLED" : ""}
                    </strong>
                    <span>{ticket.ticket_date}</span>
                  </div>

                  {isEditing ? (
                    <>
                      <div style={styles.grid}>
                        <Field label="Ticket Date">
                          <input
                            type="date"
                            value={editForm.ticket_date}
                            onChange={(e) => updateEditForm("ticket_date", e.target.value)}
                            style={styles.input}
                          />
                        </Field>

                        <Field label="License Plate">
                          <input
                            value={editForm.license_plate}
                            onChange={(e) => updateEditForm("license_plate", e.target.value.toUpperCase())}
                            style={styles.input}
                          />
                        </Field>

                        <Field label="Customer">
                          <input
                            value={editForm.customer_name}
                            onChange={(e) => updateEditForm("customer_name", e.target.value)}
                            style={styles.input}
                          />
                        </Field>

                        <Field label="Product">
                          <input
                            value={editForm.product_name}
                            onChange={(e) => updateEditForm("product_name", e.target.value)}
                            style={styles.input}
                          />
                        </Field>

                        <Field label="Job Number">
                          <input
                            value={editForm.job_number}
                            onChange={(e) => updateEditForm("job_number", e.target.value)}
                            style={styles.input}
                          />
                        </Field>

                        <Field label="Quantity">
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.quantity}
                            onChange={(e) => updateEditForm("quantity", e.target.value)}
                            style={styles.input}
                          />
                        </Field>

                        <Field label="Unit">
                          <select
                            value={editForm.unit}
                            onChange={(e) => updateEditForm("unit", e.target.value)}
                            style={styles.input}
                          >
                            <option value="tonnes">Tonnes</option>
                            <option value="yards">Yards</option>
                            <option value="loads">Loads</option>
                            <option value="each">Each</option>
                          </select>
                        </Field>

                        <Field label="Address">
                          <input
                            value={editForm.address}
                            onChange={(e) => updateEditForm("address", e.target.value)}
                            style={styles.input}
                          />
                        </Field>
                      </div>

                      <Field label="Notes">
                        <textarea
                          value={editForm.notes}
                          onChange={(e) => updateEditForm("notes", e.target.value)}
                          style={styles.textarea}
                          rows={3}
                        />
                      </Field>

                      <div style={styles.ticketButtons}>
                        <button
                          type="button"
                          style={styles.smallButton}
                          onClick={() => saveEditedTicket(ticket)}
                          disabled={saving}
                        >
                          Save Changes
                        </button>

                        <button
                          type="button"
                          style={styles.smallDangerOutlineButton}
                          onClick={closeEditTicket}
                        >
                          Close
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={styles.ticketText}>{ticket.customer_name}</div>
                      <div style={styles.ticketText}>{ticket.product_name}</div>

                      <div style={styles.ticketMeta}>
                        {ticket.job_number || "No job"} • {ticket.license_plate || "No plate"} • {formatQuantity(ticket)}
                      </div>

                      {ticket.address ? (
                        <div style={styles.ticketMeta}>{ticket.address}</div>
                      ) : null}

                      <div style={styles.ticketButtons}>
                        <button type="button" style={styles.smallButton} onClick={() => printYardTicket(ticket)}>
                          Reprint
                        </button>

                        <button
                          type="button"
                          style={styles.smallButton}
                          onClick={() => startEditTicket(ticket)}
                          disabled={isCancelled}
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          style={styles.smallDangerButton}
                          onClick={() => cancelYardTicket(ticket)}
                          disabled={isCancelled}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

const topBarStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 18px",
  borderBottom: "1px solid #ddd",
  background: "#fff",
  position: "sticky",
  top: 0,
  zIndex: 100,
  borderRadius: 16,
};

const styles = {
  page: {
    minHeight: "100vh",
    padding: 16,
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    background: "linear-gradient(180deg, #eef6f5 0%, #f7fafc 35%, #eef4f8 100%)",
  },

  loading: {
    padding: 24,
    fontSize: 18,
    color: "#0f172a",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingTop: 4,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: "#0f172a",
  },
  subtitle: {
    margin: 0,
    color: "#64748b",
    fontSize: 15,
    fontWeight: 500,
  },
  headerAccent: {
    width: 72,
    height: 5,
    borderRadius: 999,
    background: "linear-gradient(90deg, #0f766e 0%, #38bdf8 100%)",
    marginTop: 2,
  },
  card: {
    background: "rgba(255,255,255,0.88)",
    borderRadius: 22,
    padding: 18,
    border: "1px solid rgba(15, 118, 110, 0.10)",
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: "#0f172a",
  },
  input: {
    height: 50,
    borderRadius: 16,
    border: "1.5px solid #cbd5e1",
    padding: "0 14px",
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#0f172a",
  },
  textarea: {
    borderRadius: 16,
    border: "1.5px solid #cbd5e1",
    padding: 14,
    fontSize: 16,
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
    background: "#ffffff",
    color: "#0f172a",
    minHeight: 110,
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 4,
  },
  primaryButton: {
    height: 50,
    borderRadius: 16,
    border: "none",
    padding: "0 20px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    background: "linear-gradient(135deg, #0f766e 0%, #0ea5a4 100%)",
    color: "#ffffff",
  },
  secondaryButton: {
    height: 50,
    borderRadius: 16,
    border: "1.5px solid #0f766e",
    padding: "0 20px",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
    background: "#ffffff",
    color: "#0f766e",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: "#0f172a",
  },
  ticketList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  ticketRow: {
    border: "1px solid rgba(14, 165, 164, 0.18)",
    borderRadius: 18,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 5,
    background: "#fff",
  },
  cancelledTicketRow: {
    opacity: 0.7,
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
  },
  ticketTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 14,
    color: "#334155",
  },
  ticketText: {
    fontSize: 15,
    fontWeight: 700,
    color: "#0f172a",
  },
  ticketMeta: {
    fontSize: 13,
    color: "#64748b",
  },
  ticketButtons: {
    marginTop: 8,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  smallButton: {
    height: 38,
    borderRadius: 12,
    border: "1px solid #0f766e",
    padding: "0 14px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    background: "#ffffff",
    color: "#0f766e",
    alignSelf: "flex-start",
  },
  smallDangerButton: {
    height: 38,
    borderRadius: 12,
    border: "1px solid #b91c1c",
    padding: "0 14px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    background: "#b91c1c",
    color: "#ffffff",
    alignSelf: "flex-start",
  },
  smallDangerOutlineButton: {
    height: 38,
    borderRadius: 12,
    border: "1px solid #b91c1c",
    padding: "0 14px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    background: "#ffffff",
    color: "#b91c1c",
    alignSelf: "flex-start",
  },
  empty: {
    color: "#64748b",
    fontSize: 14,
  },
};