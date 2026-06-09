import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const theme = {
  pageBg: "#111827",
  panelBg: "#1f2937",
  panelBorder: "#374151",
  panelShadow: "0 10px 30px rgba(0,0,0,0.28)",

  text: "#f9fafb",
  textSoft: "#cbd5e1",
  textMuted: "#94a3b8",

  inputBg: "#0f172a",
  inputBorder: "#475569",
  inputText: "#f8fafc",
  inputPlaceholder: "#94a3b8",

  buttonBg: "#0f766e",
  buttonBorder: "#0f766e",
  buttonText: "#ffffff",

  secondaryBg: "#111827",
  secondaryBorder: "#475569",
  secondaryText: "#e5e7eb",

  tableBg: "#111827",
  tableHeaderBg: "#0f172a",
  tableBorder: "#334155",
  rowAlt: "#172131",

  successText: "#86efac",
  errorText: "#fca5a5",
};

const cardStyle = {
  background: theme.panelBg,
  border: `1px solid ${theme.panelBorder}`,
  borderRadius: 14,
  padding: 18,
  marginBottom: 18,
  boxShadow: theme.panelShadow,
};

const inputStyle = {
  padding: "11px 12px",
  border: `1px solid ${theme.inputBorder}`,
  borderRadius: 10,
  width: "100%",
  boxSizing: "border-box",
  background: theme.inputBg,
  color: theme.inputText,
  fontSize: 15,
  outline: "none",
};

const buttonStyle = {
  padding: "10px 16px",
  borderRadius: 10,
  border: `1px solid ${theme.buttonBorder}`,
  background: theme.buttonBg,
  color: theme.buttonText,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
};

const secondaryButtonStyle = {
  padding: "10px 16px",
  borderRadius: 10,
  border: `1px solid ${theme.secondaryBorder}`,
  background: theme.secondaryBg,
  color: theme.secondaryText,
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 14,
};

const tableOuter = {
  overflowX: "auto",
  borderRadius: 12,
  border: `1px solid ${theme.tableBorder}`,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1050,
  background: theme.tableBg,
};

const thStyle = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: `1px solid ${theme.tableBorder}`,
  verticalAlign: "top",
  background: theme.tableHeaderBg,
  color: theme.text,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.2,
  whiteSpace: "nowrap",
};

const tdStyle = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: `1px solid ${theme.tableBorder}`,
  verticalAlign: "top",
  color: theme.textSoft,
  fontSize: 14,
};

const SERVICE_OPTIONS = [
  { value: "trucking", label: "Trucking" },
  { value: "traffic_control", label: "Traffic Control" },
  { value: "equipment_moves", label: "Equipment Moves" },
  { value: "sweeping", label: "Sweeping" },
  { value: "saw_cutting", label: "Saw Cutting" },
  { value: "gravel", label: "Gravel" },
  { value: "aggregates", label: "Aggregates" },
  { value: "milling", label: "Milling" },
  { value: "line_painting", label: "Line Painting" },
];

function statusBadge(active) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        color: active ? "#052e16" : "#7f1d1d",
        background: active ? "#86efac" : "#fecaca",
      }}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function formatDt(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function SectionTitle({ title, subtitle, right }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 10,
      }}
    >
      <div>
        <h2 style={{ margin: 0, color: theme.text, fontSize: 24 }}>{title}</h2>
        {subtitle ? (
          <p style={{ color: theme.textMuted, marginTop: 6, marginBottom: 0 }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

function MessageBlock({ message, error }) {
  return (
    <>
      {message ? (
        <p
          style={{
            color: theme.successText,
            marginTop: 10,
            marginBottom: 0,
            fontWeight: 700,
          }}
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          style={{
            color: theme.errorText,
            marginTop: 10,
            marginBottom: 0,
            fontWeight: 700,
          }}
        >
          {error}
        </p>
      ) : null}
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label
        style={{
          color: theme.textSoft,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function serviceLabel(value) {
  const match = SERVICE_OPTIONS.find((s) => s.value === value);
  return match ? match.label : value;
}

function ServicePills({ services }) {
  if (!services?.length) {
    return <span style={{ color: theme.textMuted }}>No services</span>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {services.map((service) => (
        <span
          key={service}
          style={{
            display: "inline-block",
            padding: "4px 8px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 800,
            color: "#d1fae5",
            background: "#134e4a",
            border: "1px solid #0f766e",
          }}
        >
          {serviceLabel(service)}
        </span>
      ))}
    </div>
  );
}

export default function VendorManager() {
  const emptyForm = {
    id: null,
    name: "",
    contact_name: "",
    email: "",
    phone: "",
    notes: "",
    is_active: true,
    services: [],
  };

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadVendors();
  }, []);

  async function loadVendors() {
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const { data: vendorRows, error: vendorError } = await supabase
        .from("vendors")
        .select("*")
        .order("name", { ascending: true });

      if (vendorError) throw vendorError;

      const vendorIds = (vendorRows || []).map((v) => v.id);

      let serviceRows = [];
      if (vendorIds.length) {
        const { data, error } = await supabase
          .from("vendor_services")
          .select("*")
          .in("vendor_id", vendorIds)
          .order("sort_order", { ascending: true, nullsFirst: false })
          .order("service_type", { ascending: true });

        if (error) throw error;
        serviceRows = data || [];
      }

      const servicesByVendor = {};
      for (const row of serviceRows) {
        if (!row.is_active) continue;
        if (!servicesByVendor[row.vendor_id]) servicesByVendor[row.vendor_id] = [];
        servicesByVendor[row.vendor_id].push(row.service_type);
      }

      const merged = (vendorRows || []).map((vendor) => ({
        ...vendor,
        services: servicesByVendor[vendor.id] || [],
      }));

      setVendors(merged);
    } catch (e) {
      console.error("loadVendors", e);
      setError(e.message || "Failed to load vendors");
      setVendors([]);
    } finally {
      setLoading(false);
    }
  }

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function toggleService(serviceType) {
    setForm((prev) => {
      const exists = prev.services.includes(serviceType);
      return {
        ...prev,
        services: exists
          ? prev.services.filter((s) => s !== serviceType)
          : [...prev.services, serviceType],
      };
    });
  }

  function resetForm() {
    setForm(emptyForm);
    setEditing(false);
  }

  function startEdit(vendor) {
    setForm({
      id: vendor.id,
      name: vendor.name || "",
      contact_name: vendor.contact_name || "",
      email: vendor.email || "",
      phone: vendor.phone || "",
      notes: vendor.notes || "",
      is_active: !!vendor.is_active,
      services: vendor.services || [],
    });
    setEditing(true);
    setMessage("");
    setError("");
  }

  const filteredVendors = useMemo(() => {
    const term = search.trim().toLowerCase();

    return vendors.filter((vendor) => {
      const matchesSearch =
        !term ||
        String(vendor.name || "").toLowerCase().includes(term) ||
        String(vendor.contact_name || "").toLowerCase().includes(term) ||
        String(vendor.email || "").toLowerCase().includes(term) ||
        String(vendor.phone || "").toLowerCase().includes(term) ||
        String(vendor.notes || "").toLowerCase().includes(term);

      const matchesService =
        !serviceFilter || (vendor.services || []).includes(serviceFilter);

      return matchesSearch && matchesService;
    });
  }, [vendors, search, serviceFilter]);

  async function saveVendor(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const name = form.name.trim();
      if (!name) {
        throw new Error("Vendor name is required.");
      }

      const vendorPayload = {
        name,
        contact_name: form.contact_name.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        is_active: !!form.is_active,
      };

      let vendorId = form.id;

      if (editing && vendorId) {
        const { error } = await supabase
          .from("vendors")
          .update(vendorPayload)
          .eq("id", vendorId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("vendors")
          .insert([vendorPayload])
          .select("id")
          .single();

        if (error) throw error;
        vendorId = data.id;
      }

      const { error: deleteError } = await supabase
        .from("vendor_services")
        .delete()
        .eq("vendor_id", vendorId);

      if (deleteError) throw deleteError;

      const selectedServices = [...new Set(form.services)];
      if (selectedServices.length) {
        const rows = selectedServices.map((serviceType, index) => ({
          vendor_id: vendorId,
          service_type: serviceType,
          is_active: true,
          sort_order: index + 1,
        }));

        const { error: insertServicesError } = await supabase
          .from("vendor_services")
          .insert(rows);

        if (insertServicesError) throw insertServicesError;
      }

      setMessage(editing ? "Vendor updated successfully." : "Vendor created successfully.");
      resetForm();
      await loadVendors();
    } catch (e) {
      console.error("saveVendor", e);
      setError(e.message || "Failed to save vendor");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(vendor) {
    setMessage("");
    setError("");

    try {
      const { error } = await supabase
        .from("vendors")
        .update({ is_active: !vendor.is_active })
        .eq("id", vendor.id);

      if (error) throw error;

      setMessage(`Vendor ${vendor.is_active ? "deactivated" : "activated"}.`);
      await loadVendors();
    } catch (e) {
      console.error("toggleVendorActive", e);
      setError(e.message || "Failed to toggle vendor status");
    }
  }

  return (
    <div>
      <div style={cardStyle}>
        <SectionTitle
          title="Vendors"
          subtitle="Manage vendors and assign the services they provide."
          right={
            <button type="button" onClick={loadVendors} style={secondaryButtonStyle}>
              Refresh
            </button>
          }
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            marginTop: 8,
            marginBottom: 14,
          }}
        >
          <input
            placeholder="Search vendor, contact, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputStyle}
          />

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="">All service types</option>
            {SERVICE_OPTIONS.map((service) => (
              <option key={service.value} value={service.value}>
                {service.label}
              </option>
            ))}
          </select>
        </div>

        <form
          onSubmit={saveVendor}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          <Field label="Vendor Name *">
            <input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              style={inputStyle}
              required
            />
          </Field>

          <Field label="Contact Name">
            <input
              value={form.contact_name}
              onChange={(e) => setField("contact_name", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Status">
            <select
              value={form.is_active ? "active" : "inactive"}
              onChange={(e) => setField("is_active", e.target.value === "active")}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>

          <Field label="Notes">
            <input
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <div style={{ gridColumn: "1 / -1" }}>
            <div
              style={{
                color: theme.textSoft,
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Service Types
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 8,
                background: theme.inputBg,
                border: `1px solid ${theme.inputBorder}`,
                borderRadius: 12,
                padding: 12,
              }}
            >
              {SERVICE_OPTIONS.map((service) => {
                const checked = form.services.includes(service.value);

                return (
                  <label
                    key={service.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: theme.textSoft,
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(service.value)}
                    />
                    {service.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            <button type="submit" style={buttonStyle} disabled={saving}>
              {saving ? "Saving..." : editing ? "Update Vendor" : "Add Vendor"}
            </button>

            {editing && (
              <button
                type="button"
                onClick={resetForm}
                style={secondaryButtonStyle}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <MessageBlock message={message} error={error} />
      </div>

      <div style={cardStyle}>
        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Vendor</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Services</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} style={tdStyle}>
                    Loading vendors...
                  </td>
                </tr>
              )}

              {!loading && filteredVendors.length === 0 && (
                <tr>
                  <td colSpan={8} style={tdStyle}>
                    No vendors found.
                  </td>
                </tr>
              )}

              {!loading &&
                filteredVendors.map((vendor, index) => (
                  <tr
                    key={vendor.id}
                    style={{
                      background: index % 2 === 0 ? theme.tableBg : theme.rowAlt,
                    }}
                  >
                    <td style={{ ...tdStyle, color: theme.text, fontWeight: 700 }}>
                      <div>{vendor.name}</div>
                      {vendor.notes ? (
                        <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
                          {vendor.notes}
                        </div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>{vendor.contact_name || "-"}</td>
                    <td style={tdStyle}>{vendor.email || "-"}</td>
                    <td style={tdStyle}>{vendor.phone || "-"}</td>
                    <td style={tdStyle}>
                      <ServicePills services={vendor.services} />
                    </td>
                    <td style={tdStyle}>{statusBadge(vendor.is_active)}</td>
                    <td style={tdStyle}>{formatDt(vendor.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => startEdit(vendor)}
                          style={secondaryButtonStyle}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(vendor)}
                          style={secondaryButtonStyle}
                        >
                          {vendor.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}