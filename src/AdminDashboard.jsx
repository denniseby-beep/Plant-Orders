import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import VendorManager from "./VendorManager";
import AccountingExports from "./AccountingExports";

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

  activeTabBg: "#0b3b36",
  activeTabBorder: "#14b8a6",
  activeTabText: "#f0fdfa",

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
  minWidth: 850,
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
        <p style={{ color: theme.successText, marginTop: 10, marginBottom: 0, fontWeight: 700 }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p style={{ color: theme.errorText, marginTop: 10, marginBottom: 0, fontWeight: 700 }}>
          {error}
        </p>
      ) : null}
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ color: theme.textSoft, fontSize: 13, fontWeight: 700 }}>{label}</label>
      {children}
    </div>
  );
}

function CustomersTab() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setCustomers(data || []);
    } catch (e) {
      console.error("loadCustomers", e);
      setErr(e.message || "Failed to load customers");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((c) =>
      String(c.name || "").toLowerCase().includes(term)
    );
  }, [customers, search]);

  async function addCustomer(event) {
    event.preventDefault();
    setErr("");
    setMsg("");

    const name = newName.trim();
    if (!name) {
      setErr("Customer name is required.");
      return;
    }

    try {
      const { error } = await supabase
        .from("customers")
        .insert([{ name, is_active: true }]);

      if (error) throw error;

      setMsg("Customer added successfully.");
      setNewName("");
      await loadCustomers();
    } catch (e) {
      console.error("addCustomer", e);
      setErr(e.message || "Failed to add customer");
    }
  }

  async function saveCustomer(id) {
    setErr("");
    setMsg("");

    const name = editName.trim();
    if (!name) {
      setErr("Customer name is required.");
      return;
    }

    try {
      const { error } = await supabase
        .from("customers")
        .update({ name })
        .eq("id", id);

      if (error) throw error;

      setMsg("Customer updated successfully.");
      setEditId(null);
      setEditName("");
      await loadCustomers();
    } catch (e) {
      console.error("saveCustomer", e);
      setErr(e.message || "Failed to update customer");
    }
  }

  async function toggleActive(c) {
    setErr("");
    setMsg("");

    try {
      const { error } = await supabase
        .from("customers")
        .update({ is_active: !c.is_active })
        .eq("id", c.id);

      if (error) throw error;

      setMsg(`Customer ${c.is_active ? "deactivated" : "activated"}.`);
      await loadCustomers();
    } catch (e) {
      console.error("toggleActiveCustomer", e);
      setErr(e.message || "Failed to toggle status");
    }
  }

  return (
    <div>
      <div style={cardStyle}>
        <SectionTitle
          title="Customers"
          subtitle="Manage customer records."
          right={
            <button type="button" onClick={loadCustomers} style={secondaryButtonStyle}>
              Refresh
            </button>
          }
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, maxWidth: 320 }}
          />
        </div>

        <form
          onSubmit={addCustomer}
          style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New customer name"
            style={{ ...inputStyle, flex: "1 1 220px" }}
          />
          <button type="submit" style={buttonStyle}>
            Add Customer
          </button>
        </form>

        <MessageBlock message={msg} error={err} />
      </div>

      <div style={cardStyle}>
        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={tdStyle}>
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={tdStyle}>
                    No customers found.
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((c, index) => (
                  <tr
                    key={c.id}
                    style={{ background: index % 2 === 0 ? theme.tableBg : theme.rowAlt }}
                  >
                    <td style={{ ...tdStyle, color: theme.text, fontWeight: 700 }}>
                      {editId === c.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={inputStyle}
                        />
                      ) : (
                        c.name || "(empty)"
                      )}
                    </td>
                    <td style={tdStyle}>{statusBadge(c.is_active)}</td>
                    <td style={tdStyle}>{formatDt(c.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {editId === c.id ? (
                          <>
                            <button type="button" onClick={() => saveCustomer(c.id)} style={buttonStyle}>
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(null);
                                setEditName("");
                              }}
                              style={secondaryButtonStyle}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(c.id);
                                setEditName(c.name || "");
                              }}
                              style={secondaryButtonStyle}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActive(c)}
                              style={secondaryButtonStyle}
                            >
                              {c.is_active ? "Deactivate" : "Activate"}
                            </button>
                          </>
                        )}
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

function JobsTab() {
  const emptyForm = {
    id: null,
    customer_name: "",
    job_number: "",
    job_name: "",
    address: "",
    site_contact_name: "",
    site_contact_phone: "",
    is_active: true,
  };

  const [jobs, setJobs] = useState([]);
  const [activeCustomers, setActiveCustomers] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    loadJobs();
    loadActiveCustomers();
  }, []);

  async function loadJobs() {
    setLoadingJobs(true);
    setError("");
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .order("customer_name", { ascending: true })
        .order("job_number", { ascending: true });

      if (error) throw error;
      setJobs(data || []);
    } catch (e) {
      console.error("loadJobs", e);
      setError(e.message || "Failed to load jobs");
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }

  async function loadActiveCustomers() {
    setLoadingCustomers(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;

      setActiveCustomers((data || []).map((row) => row.name).filter(Boolean));
    } catch (e) {
      console.error("loadActiveCustomers", e);
      setActiveCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }

  const filteredJobs = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return jobs;

    return jobs.filter((job) => {
      return (
        String(job.customer_name || "").toLowerCase().includes(term) ||
        String(job.job_number || "").toLowerCase().includes(term) ||
        String(job.job_name || "").toLowerCase().includes(term) ||
        String(job.address || "").toLowerCase().includes(term)
      );
    });
  }, [jobs, filter]);

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function startEdit(job) {
    setForm({
      id: job.id,
      customer_name: job.customer_name || "",
      job_number: job.job_number || "",
      job_name: job.job_name || "",
      address: job.address || "",
      site_contact_name: job.site_contact_name || "",
      site_contact_phone: job.site_contact_phone || "",
      is_active: !!job.is_active,
    });
    setEditing(true);
    setMessage("");
    setError("");
  }

  async function saveJob(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!form.customer_name.trim()) {
      setError("Customer is required.");
      return;
    }

    if (!form.job_number.trim()) {
      setError("Job number is required.");
      return;
    }

    const payload = {
      customer_name: form.customer_name.trim(),
      job_number: form.job_number.trim(),
      job_name: form.job_name.trim(),
      address: form.address.trim(),
      site_contact_name: form.site_contact_name.trim(),
      site_contact_phone: form.site_contact_phone.trim(),
      is_active: !!form.is_active,
    };

    try {
      if (editing && form.id) {
        const { error } = await supabase.from("jobs").update(payload).eq("id", form.id);
        if (error) throw error;
        setMessage("Job updated successfully.");
      } else {
        const { error } = await supabase.from("jobs").insert([payload]);
        if (error) throw error;
        setMessage("Job created successfully.");
      }

      setForm(emptyForm);
      setEditing(false);
      await loadJobs();
    } catch (e) {
      console.error("saveJob", e);
      setError(e.message || "Failed to save job");
    }
  }

  async function toggleActive(job) {
    setError("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("jobs")
        .update({ is_active: !job.is_active })
        .eq("id", job.id);

      if (error) throw error;

      setMessage(`Job ${job.is_active ? "deactivated" : "activated"}.`);
      await loadJobs();
    } catch (e) {
      console.error("toggleJobActive", e);
      setError(e.message || "Failed to toggle job status");
    }
  }

  return (
    <div>
      <div style={cardStyle}>
        <SectionTitle
          title="Jobs"
          subtitle="Manage jobs for active customers."
          right={
            <button
              type="button"
              onClick={() => {
                loadJobs();
                loadActiveCustomers();
              }}
              style={secondaryButtonStyle}
            >
              Refresh
            </button>
          }
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input
            placeholder="Search by customer, job number, job name, address"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inputStyle, maxWidth: 420 }}
          />
        </div>

        <form
          onSubmit={saveJob}
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          <Field label="Customer *">
            <select
              value={form.customer_name}
              onChange={(e) => setField("customer_name", e.target.value)}
              style={inputStyle}
              required
            >
              <option value="">Select a customer</option>
              {loadingCustomers && <option>Loading customers...</option>}
              {!loadingCustomers &&
                activeCustomers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Job Number *">
            <input
              value={form.job_number}
              onChange={(e) => setField("job_number", e.target.value)}
              style={inputStyle}
              required
            />
          </Field>

          <Field label="Job Name">
            <input
              value={form.job_name}
              onChange={(e) => setField("job_name", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Address">
            <input
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Site Contact Name">
            <input
              value={form.site_contact_name}
              onChange={(e) => setField("site_contact_name", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Site Contact Phone">
            <input
              value={form.site_contact_phone}
              onChange={(e) => setField("site_contact_phone", e.target.value)}
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

          <div style={{ display: "grid", gap: 6, alignSelf: "end" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" style={buttonStyle}>
                {editing ? "Update Job" : "Add Job"}
              </button>

              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setForm(emptyForm);
                    setEditing(false);
                    setMessage("");
                    setError("");
                  }}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </form>

        <MessageBlock message={message} error={error} />
      </div>

      <div style={cardStyle}>
        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Job #</th>
                <th style={thStyle}>Job Name</th>
                <th style={thStyle}>Address</th>
                <th style={thStyle}>Site Contact</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingJobs && (
                <tr>
                  <td colSpan={8} style={tdStyle}>
                    Loading jobs...
                  </td>
                </tr>
              )}

              {!loadingJobs && filteredJobs.length === 0 && (
                <tr>
                  <td colSpan={8} style={tdStyle}>
                    No jobs found.
                  </td>
                </tr>
              )}

              {!loadingJobs &&
                filteredJobs.map((job, index) => (
                  <tr
                    key={job.id}
                    style={{ background: index % 2 === 0 ? theme.tableBg : theme.rowAlt }}
                  >
                    <td style={tdStyle}>{job.customer_name}</td>
                    <td style={tdStyle}>{job.job_number}</td>
                    <td style={tdStyle}>{job.job_name}</td>
                    <td style={tdStyle}>{job.address}</td>
                    <td style={tdStyle}>
                      {job.site_contact_name}
                      {job.site_contact_phone ? ` (${job.site_contact_phone})` : ""}
                    </td>
                    <td style={tdStyle}>{statusBadge(job.is_active)}</td>
                    <td style={tdStyle}>{formatDt(job.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" onClick={() => startEdit(job)} style={secondaryButtonStyle}>
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(job)}
                          style={secondaryButtonStyle}
                        >
                          {job.is_active ? "Deactivate" : "Activate"}
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

function MixesTab() {
  const [mixes, setMixes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadMixes();
  }, []);

  async function loadMixes() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setMixes(data || []);
    } catch (e) {
      console.error("loadMixes", e);
      setError(e.message || "Failed to load mixes");
      setMixes([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mixes;
    return mixes.filter((mix) =>
      String(mix.name || "").toLowerCase().includes(term)
    );
  }, [mixes, search]);

  async function addMix(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    const name = newName.trim();
    if (!name) {
      setError("Mix name is required.");
      return;
    }

    try {
      const { error } = await supabase
        .from("products")
        .insert([{ name, is_active: true }]);

      if (error) throw error;

      setMessage("Mix created successfully.");
      setNewName("");
      await loadMixes();
    } catch (e) {
      console.error("addMix", e);
      setError(e.message || "Failed to add mix");
    }
  }

  async function saveMix(id) {
    setError("");
    setMessage("");

    const name = editName.trim();
    if (!name) {
      setError("Mix name is required.");
      return;
    }

    try {
      const { error } = await supabase
        .from("products")
        .update({ name })
        .eq("id", id);

      if (error) throw error;

      setMessage("Mix updated successfully.");
      setEditId(null);
      setEditName("");
      await loadMixes();
    } catch (e) {
      console.error("saveMix", e);
      setError(e.message || "Failed to update mix");
    }
  }

  async function toggleActive(mix) {
    setError("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("products")
        .update({ is_active: !mix.is_active })
        .eq("id", mix.id);

      if (error) throw error;

      setMessage(`Mix ${mix.is_active ? "deactivated" : "activated"}.`);
      await loadMixes();
    } catch (e) {
      console.error("toggleMixActive", e);
      setError(e.message || "Failed to toggle mix status");
    }
  }

  return (
    <div>
      <div style={cardStyle}>
        <SectionTitle
          title="Mixes / Products"
          subtitle="Manage product mixes used for jobs."
          right={
            <button type="button" onClick={loadMixes} style={secondaryButtonStyle}>
              Refresh
            </button>
          }
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input
            placeholder="Search mixes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, maxWidth: 320 }}
          />
        </div>

        <form
          onSubmit={addMix}
          style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New mix name"
            style={{ ...inputStyle, flex: "1 1 220px" }}
          />
          <button type="submit" style={buttonStyle}>
            Add Mix
          </button>
        </form>

        <MessageBlock message={message} error={error} />
      </div>

      <div style={cardStyle}>
        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={tdStyle}>
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={tdStyle}>
                    No mixes found.
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((mix, index) => (
                  <tr
                    key={mix.id}
                    style={{ background: index % 2 === 0 ? theme.tableBg : theme.rowAlt }}
                  >
                    <td style={tdStyle}>
                      {editId === mix.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={inputStyle}
                        />
                      ) : (
                        <span style={{ color: theme.text }}>{mix.name}</span>
                      )}
                    </td>
                    <td style={tdStyle}>{statusBadge(mix.is_active)}</td>
                    <td style={tdStyle}>{formatDt(mix.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {editId === mix.id ? (
                          <>
                            <button type="button" onClick={() => saveMix(mix.id)} style={buttonStyle}>
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(null);
                                setEditName("");
                              }}
                              style={secondaryButtonStyle}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(mix.id);
                                setEditName(mix.name || "");
                              }}
                              style={secondaryButtonStyle}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActive(mix)}
                              style={secondaryButtonStyle}
                            >
                              {mix.is_active ? "Deactivate" : "Activate"}
                            </button>
                          </>
                        )}
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

function AccountsTab() {
  const [accounts, setAccounts] = useState([]);
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("customer");
  const [canEditUnacknowledged, setCanEditUnacknowledged] = useState(true);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadAccounts();
    loadCompanySuggestions();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("customer_accounts")
        .select("*")
        .order("company_name", { ascending: true })
        .order("contact_name", { ascending: true });

      if (error) throw error;
      setAccounts(data || []);
    } catch (e) {
      console.error("loadAccounts", e);
      setError(e.message || "Failed to load accounts");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadCompanySuggestions() {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("name")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;

      setCompanySuggestions([
        ...new Set((data || []).map((row) => row.name).filter(Boolean)),
      ]);
    } catch (e) {
      console.error("loadCompanySuggestions", e);
      setCompanySuggestions([]);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return accounts;

    return accounts.filter(
      (a) =>
        String(a.company_name || "").toLowerCase().includes(term) ||
        String(a.contact_name || "").toLowerCase().includes(term) ||
        String(a.email || "").toLowerCase().includes(term) ||
        String(a.phone || "").toLowerCase().includes(term)
    );
  }, [accounts, search]);

  async function createAccount(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    const cName = companyName.trim();
    const cContact = contactName.trim();
    const cEmail = email.trim().toLowerCase();
    const cPassword = password;
    const cPhone = phone.trim();

    if (!cName || !cContact || !cEmail || !cPassword.trim()) {
      setError("Company name, contact, email, and password are required.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error("Login required");

      const cleanRole = String(role || "")
  .trim()
  .toLowerCase();

const internalRoles = [
  "admin",
  "manager",
  "project_manager",
  "operator",
  "yard",
];

const functionName = internalRoles.includes(cleanRole)
  ? "create-internal-user"
  : "create-customer-account";

  console.log("Creating account with role:", cleanRole);
console.log("Calling function:", functionName);

      const { data, error: fnErr } = await supabase.functions.invoke(functionName, {
        body: {
          company_name: cName,
          full_name: cContact,
          email: cEmail,
          password: cPassword,
          phone: cPhone,
          role: cleanRole,
          can_edit_unacknowledged: canEditUnacknowledged,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnErr) {
        throw fnErr;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setMessage(
  internalRoles.includes(cleanRole)
    ? "Internal account created. User can log in immediately."
    : "Customer account created. Customer can log in immediately."
);
      setCompanyName("");
      setContactName("");
      setEmail("");
      setPassword("");
      setPhone("");
      setRole("customer");
      setCanEditUnacknowledged(true);

      await loadAccounts();
      await loadCompanySuggestions();
    } catch (e) {
      console.error("createAccount", e);
      setError(e.message || "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(account) {
    setError("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("customer_accounts")
        .update({ active: !account.active })
        .eq("id", account.id);

      if (error) throw error;

      setMessage(`Account ${account.active ? "deactivated" : "activated"}.`);
      await loadAccounts();
    } catch (e) {
      console.error("toggleAccountActive", e);
      setError(e.message || "Failed to toggle active");
    }
  }

  async function toggleEditUnack(account) {
    setError("");
    setMessage("");

    try {
      const { error } = await supabase
        .from("customer_accounts")
        .update({
          can_edit_unacknowledged: !account.can_edit_unacknowledged,
        })
        .eq("id", account.id);

      if (error) throw error;

      setMessage("Permission updated.");
      await loadAccounts();
    } catch (e) {
      console.error("toggleEditUnack", e);
      setError(e.message || "Failed to update permission");
    }
  }

  return (
    <div>
      <div style={cardStyle}>
        <SectionTitle
          title="Customer Accounts"
          subtitle="Create and manage customer account logins."
          right={
            <button type="button" onClick={loadAccounts} style={secondaryButtonStyle}>
              Refresh
            </button>
          }
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, maxWidth: 360 }}
          />
        </div>

        <form
          onSubmit={createAccount}
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          <Field label="Company Name">
            <input
              list="company-options"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              style={inputStyle}
              required
            />
            <datalist id="company-options">
              {companySuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>

          <Field label="Contact Name">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              style={inputStyle}
              required
            />
          </Field>

          <Field label="Email">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              type="email"
              required
            />
          </Field>

          <Field label="Password">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              type="password"
              required
            />
          </Field>

          <Field label="Phone">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Role">
            <select
  value={role}
  onChange={(e) => setRole(e.target.value)}
  style={inputStyle}
>
  <option value="customer">Customer</option>
  <option value="dispatcher">Dispatcher</option>
  <option value="yard">Yard</option>
  <option value="operator">Operator</option>
  <option value="manager">Manager</option>
  <option value="project_manager">Project Manager</option>
  <option value="admin">Administrator</option>
</select>
          </Field>

          <Field label="Can Edit Unacknowledged">
            <select
              value={canEditUnacknowledged ? "true" : "false"}
              onChange={(e) => setCanEditUnacknowledged(e.target.value === "true")}
              style={inputStyle}
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </Field>

          <div style={{ display: "grid", gap: 6, alignSelf: "end" }}>
            <button type="submit" disabled={saving} style={buttonStyle}>
              {saving ? "Saving..." : "Create Account"}
            </button>
          </div>
        </form>

        <MessageBlock message={message} error={error} />
      </div>

      <div style={cardStyle}>
        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Active</th>
                <th style={thStyle}>Can Edit Unack</th>
                <th style={thStyle}>Login Linked</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} style={tdStyle}>
                    Loading accounts...
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={tdStyle}>
                    No customer accounts found.
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((acct, index) => (
                  <tr
                    key={acct.id}
                    style={{ background: index % 2 === 0 ? theme.tableBg : theme.rowAlt }}
                  >
                    <td style={tdStyle}>{acct.company_name}</td>
                    <td style={tdStyle}>{acct.contact_name}</td>
                    <td style={tdStyle}>{acct.email}</td>
                    <td style={tdStyle}>{acct.phone}</td>
                    <td style={tdStyle}>{acct.role}</td>
                    <td style={tdStyle}>{statusBadge(acct.active)}</td>
                    <td style={tdStyle}>
                      {acct.can_edit_unacknowledged ? "Yes" : "No"}
                    </td>
                    <td style={tdStyle}>{acct.auth_user_id ? "Yes" : "No"}</td>
                    <td style={tdStyle}>{formatDt(acct.created_at)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => toggleActive(acct)}
                          style={secondaryButtonStyle}
                        >
                          {acct.active ? "Deactivate" : "Activate"}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleEditUnack(acct)}
                          style={secondaryButtonStyle}
                        >
                          Toggle Edit
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

function CustomerMasterTab() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    loadCustomerMaster();
  }, []);

  function normalizeCustomerName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/\b(ltd|limited|inc|corp|corporation|co|company)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  async function loadCustomerMaster() {
    setLoading(true);
    setErr("");
    setMsg("");

    try {
      const { data, error } = await supabase
        .from("customers_master")
        .select("*")
        .order("customer_name", { ascending: true });

      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load customer master.");
    } finally {
      setLoading(false);
    }
  }

  async function saveCustomerMaster(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!customerId.trim() || !customerName.trim()) {
      setErr("Customer ID and Customer Name are required.");
      return;
    }

    try {
      const payload = {
        customer_id: customerId.trim().toUpperCase(),
        customer_name: customerName.trim().toUpperCase(),
        normalized_name: normalizeCustomerName(customerName),
      };

      const { error } = await supabase
        .from("customers_master")
        .upsert([payload], { onConflict: "customer_id" });

      if (error) throw error;

      setMsg("Customer master saved.");
      setCustomerId("");
      setCustomerName("");
      await loadCustomerMaster();
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to save customer master.");
    }
  }

  function editRow(row) {
    setCustomerId(row.customer_id || "");
    setCustomerName(row.customer_name || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter(
      (row) =>
        String(row.customer_id || "").toLowerCase().includes(q) ||
        String(row.customer_name || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div>
      <div style={cardStyle}>
        <SectionTitle
          title="Customer Master"
          subtitle="Add customer IDs and names for yard ticket accounting exports."
          right={
            <button type="button" onClick={loadCustomerMaster} style={secondaryButtonStyle}>
              Refresh
            </button>
          }
        />

        <form
          onSubmit={saveCustomerMaster}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            marginTop: 12,
          }}
        >
          <Field label="Customer ID">
            <input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value.toUpperCase())}
              placeholder="C000464"
              style={inputStyle}
            />
          </Field>

          <Field label="Customer Name">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="ALL ROADS CONSTRUCTION"
              style={inputStyle}
            />
          </Field>

          <div style={{ alignSelf: "end" }}>
            <button type="submit" style={buttonStyle}>
              Save Customer ID
            </button>
          </div>
        </form>

        <MessageBlock message={msg} error={err} />
      </div>

      <div style={cardStyle}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer ID or name..."
          style={{ ...inputStyle, maxWidth: 420, marginBottom: 14 }}
        />

        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Customer ID</th>
                <th style={thStyle}>Customer Name</th>
                <th style={thStyle}>Normalized Name</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={tdStyle}>Loading...</td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={tdStyle}>No customers found.</td>
                </tr>
              )}

              {!loading &&
                filtered.map((row, index) => (
                  <tr key={row.customer_id} style={{ background: index % 2 === 0 ? theme.tableBg : theme.rowAlt }}>
                    <td style={{ ...tdStyle, color: theme.text, fontWeight: 800 }}>
                      {row.customer_id}
                    </td>
                    <td style={tdStyle}>{row.customer_name}</td>
                    <td style={tdStyle}>{row.normalized_name}</td>
                    <td style={tdStyle}>
                      <button type="button" onClick={() => editRow(row)} style={secondaryButtonStyle}>
                        Edit
                      </button>
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

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("customers");

  const tabs = [
  { id: "customers", label: "Customers" },
  { id: "customerMaster", label: "Customer Master" },
  { id: "jobs", label: "Jobs" },
  { id: "mixes", label: "Mixes" },
  { id: "accounts", label: "Customer Accounts" },
  { id: "vendors", label: "Vendors" },
  { id: "accounting", label: "Accounting Exports" },
];

  return (
    <div
      style={{
        padding: 20,
        maxWidth: 1400,
        margin: "0 auto",
        background: theme.pageBg,
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          marginBottom: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, color: theme.text, fontSize: 32 }}>Administrator Panel</h1>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                ...secondaryButtonStyle,
                border: active
                  ? `1px solid ${theme.activeTabBorder}`
                  : secondaryButtonStyle.border,
                background: active ? theme.activeTabBg : secondaryButtonStyle.background,
                color: active ? theme.activeTabText : secondaryButtonStyle.color,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "customers" && <CustomersTab />}
{activeTab === "jobs" && <JobsTab />}
{activeTab === "mixes" && <MixesTab />}
{activeTab === "accounts" && <AccountsTab />}
{activeTab === "vendors" && <VendorManager />}
{activeTab === "customerMaster" && <CustomerMasterTab />}
{activeTab === "accounting" && <AccountingExports />}

      <div style={{ marginTop: 20, color: theme.textMuted, fontSize: 12 }}>
        <p>Tip: refresh sections after external updates to keep data in sync.</p>
      </div>
    </div>
  );
}