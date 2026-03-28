import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const cardStyle = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 10,
  padding: 16,
  marginBottom: 18,
  boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
};

const inputStyle = {
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: 8,
  width: "100%",
  boxSizing: "border-box",
};

const buttonStyle = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #0099ff",
  background: "#0099ff",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #666",
  background: "#fff",
  color: "#444",
  fontWeight: 600,
  cursor: "pointer",
};

const tableOuter = { overflowX: "auto" };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 850 };
const thTd = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #eee",
  verticalAlign: "top",
};

function statusBadge(active) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 9px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        color: active ? "#065f46" : "#831843",
        background: active ? "#d1fae5" : "#fee2e2",
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
        <h2>Customers</h2>
        <p style={{ color: "#475569", marginTop: 0 }}>Manage customer records.</p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, maxWidth: 320 }}
          />
          <button type="button" onClick={loadCustomers} style={secondaryButtonStyle}>
            Refresh
          </button>
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

        {msg && <p style={{ color: "#065f46", marginTop: 10 }}>{msg}</p>}
        {err && <p style={{ color: "#b91c1c", marginTop: 10 }}>{err}</p>}
      </div>

      <div style={cardStyle}>
        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thTd}>Name</th>
                <th style={thTd}>Status</th>
                <th style={thTd}>Created</th>
                <th style={thTd}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={thTd}>
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={thTd}>
                    No customers found.
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...thTd, color: "#000", fontWeight: 700 }}>
                      {editId === c.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{ ...inputStyle, color: "#000", backgroundColor: "#fff" }}
                        />
                      ) : (
                        <span style={{ color: "#000", fontWeight: 700 }}>
                          {c.name || "(empty)"}
                        </span>
                      )}
                    </td>
                    <td style={{ ...thTd, color: "#000" }}>{statusBadge(c.is_active)}</td>
                    <td style={{ ...thTd, color: "#000" }}>{formatDt(c.created_at)}</td>
                    <td style={thTd}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {editId === c.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveCustomer(c.id)}
                              style={secondaryButtonStyle}
                            >
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>Jobs</h2>
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
        </div>

        <p style={{ color: "#475569", marginTop: 4 }}>
          Manage jobs for active customers.
        </p>

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
          <div style={{ display: "grid", gap: 5 }}>
            <label>Customer *</label>
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
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Job Number *</label>
            <input
              value={form.job_number}
              onChange={(e) => setField("job_number", e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Job Name</label>
            <input
              value={form.job_name}
              onChange={(e) => setField("job_name", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Address</label>
            <input
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Site Contact Name</label>
            <input
              value={form.site_contact_name}
              onChange={(e) => setField("site_contact_name", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Site Contact Phone</label>
            <input
              value={form.site_contact_phone}
              onChange={(e) => setField("site_contact_phone", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Status</label>
            <select
              value={form.is_active ? "active" : "inactive"}
              onChange={(e) => setField("is_active", e.target.value === "active")}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 5, alignSelf: "end" }}>
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

        {message && <p style={{ color: "#065f46", marginTop: 10 }}>{message}</p>}
        {error && <p style={{ color: "#b91c1c", marginTop: 10 }}>{error}</p>}
      </div>

      <div style={cardStyle}>
        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thTd}>Customer</th>
                <th style={thTd}>Job #</th>
                <th style={thTd}>Job Name</th>
                <th style={thTd}>Address</th>
                <th style={thTd}>Site Contact</th>
                <th style={thTd}>Status</th>
                <th style={thTd}>Created</th>
                <th style={thTd}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingJobs && (
                <tr>
                  <td colSpan={8} style={thTd}>
                    Loading jobs...
                  </td>
                </tr>
              )}

              {!loadingJobs && filteredJobs.length === 0 && (
                <tr>
                  <td colSpan={8} style={thTd}>
                    No jobs found.
                  </td>
                </tr>
              )}

              {!loadingJobs &&
                filteredJobs.map((job) => (
                  <tr key={job.id}>
                    <td style={thTd}>{job.customer_name}</td>
                    <td style={thTd}>{job.job_number}</td>
                    <td style={thTd}>{job.job_name}</td>
                    <td style={thTd}>{job.address}</td>
                    <td style={thTd}>
                      {job.site_contact_name}
                      {job.site_contact_phone ? ` (${job.site_contact_phone})` : ""}
                    </td>
                    <td style={thTd}>{statusBadge(job.is_active)}</td>
                    <td style={thTd}>{formatDt(job.created_at)}</td>
                    <td style={thTd}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => startEdit(job)}
                          style={secondaryButtonStyle}
                        >
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>Mixes / Products</h2>
          <button type="button" onClick={loadMixes} style={secondaryButtonStyle}>
            Refresh
          </button>
        </div>

        <p style={{ color: "#475569", marginTop: 4 }}>
          Manage product mixes used for jobs.
        </p>

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

        {message && <p style={{ color: "#065f46", marginTop: 10 }}>{message}</p>}
        {error && <p style={{ color: "#b91c1c", marginTop: 10 }}>{error}</p>}
      </div>

      <div style={cardStyle}>
        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thTd}>Name</th>
                <th style={thTd}>Status</th>
                <th style={thTd}>Created</th>
                <th style={thTd}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={thTd}>
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} style={thTd}>
                    No mixes found.
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((mix) => (
                  <tr key={mix.id}>
                    <td style={thTd}>
                      {editId === mix.id ? (
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={inputStyle}
                        />
                      ) : (
                        mix.name
                      )}
                    </td>
                    <td style={thTd}>{statusBadge(mix.is_active)}</td>
                    <td style={thTd}>{formatDt(mix.created_at)}</td>
                    <td style={thTd}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {editId === mix.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => saveMix(mix.id)}
                              style={secondaryButtonStyle}
                            >
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

      const functionName =
  role === "customer" ? "create-customer-account" : "create-internal-user";

const { data, error: fnErr } = await supabase.functions.invoke(
  functionName,
        {
          body: {
            company_name: cName,
            full_name: cContact,
            email: cEmail,
            password: cPassword,
            phone: cPhone,
            role,
            can_edit_unacknowledged: canEditUnacknowledged,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (fnErr) {
        throw fnErr;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setMessage("Customer account created. Customer can log in immediately.");
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
      setError(e.message || "Failed to create customer account");
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>Customer Accounts</h2>
          <button type="button" onClick={loadAccounts} style={secondaryButtonStyle}>
            Refresh
          </button>
        </div>

        <p style={{ color: "#475569", marginTop: 4 }}>
          Create and manage customer account logins.
        </p>

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
          <div style={{ display: "grid", gap: 5 }}>
            <label>Company Name</label>
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
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Contact Name</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              type="email"
              required
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              type="password"
              required
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={inputStyle}
            >
              <option value="customer">customer</option>
              <option value="dispatcher">dispatcher</option>
              <option value="admin">admin</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            <label>Can Edit Unacknowledged</label>
            <select
              value={canEditUnacknowledged ? "true" : "false"}
              onChange={(e) => setCanEditUnacknowledged(e.target.value === "true")}
              style={inputStyle}
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 5, alignSelf: "end" }}>
            <button type="submit" disabled={saving} style={buttonStyle}>
              {saving ? "Saving..." : "Create Account"}
            </button>
          </div>
        </form>

        {message && <p style={{ color: "#065f46", marginTop: 10 }}>{message}</p>}
        {error && <p style={{ color: "#b91c1c", marginTop: 10 }}>{error}</p>}
      </div>

      <div style={cardStyle}>
        <div style={tableOuter}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thTd}>Company</th>
                <th style={thTd}>Contact</th>
                <th style={thTd}>Email</th>
                <th style={thTd}>Phone</th>
                <th style={thTd}>Role</th>
                <th style={thTd}>Active</th>
                <th style={thTd}>Can Edit Unack</th>
                <th style={thTd}>Login Linked</th>
                <th style={thTd}>Created</th>
                <th style={thTd}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} style={thTd}>
                    Loading accounts...
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={thTd}>
                    No customer accounts found.
                  </td>
                </tr>
              )}

              {!loading &&
                filtered.map((acct) => (
                  <tr key={acct.id}>
                    <td style={thTd}>{acct.company_name}</td>
                    <td style={thTd}>{acct.contact_name}</td>
                    <td style={thTd}>{acct.email}</td>
                    <td style={thTd}>{acct.phone}</td>
                    <td style={thTd}>{acct.role}</td>
                    <td style={thTd}>{statusBadge(acct.active)}</td>
                    <td style={thTd}>
                      {acct.can_edit_unacknowledged ? "Yes" : "No"}
                    </td>
                    <td style={thTd}>{acct.auth_user_id ? "Yes" : "No"}</td>
                    <td style={thTd}>{formatDt(acct.created_at)}</td>
                    <td style={thTd}>
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

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("customers");

  const tabs = [
    { id: "customers", label: "Customers" },
    { id: "jobs", label: "Jobs" },
    { id: "mixes", label: "Mixes" },
    { id: "accounts", label: "Customer Accounts" },
  ];

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div
        style={{
          marginBottom: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...secondaryButtonStyle,
              border:
                activeTab === tab.id
                  ? "1px solid #0099ff"
                  : secondaryButtonStyle.border,
              background:
                activeTab === tab.id
                  ? "#e8f4ff"
                  : secondaryButtonStyle.background,
              color:
                activeTab === tab.id
                  ? "#0b4e8a"
                  : secondaryButtonStyle.color,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "customers" && <CustomersTab />}
      {activeTab === "jobs" && <JobsTab />}
      {activeTab === "mixes" && <MixesTab />}
      {activeTab === "accounts" && <AccountsTab />}

      <div style={{ marginTop: 20, color: "#777", fontSize: 12 }}>
        <p>Tip: refresh sections after external updates to keep data in sync.</p>
      </div>
    </div>
  );
}