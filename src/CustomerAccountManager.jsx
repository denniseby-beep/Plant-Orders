import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function groupByCompany(rows) {
  const grouped = {};

  for (const row of rows) {
    const key = row.company_name || "Unassigned";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  return grouped;
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString();
}

export default function CustomerAccountManager() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingInviteId, setSendingInviteId] = useState(null);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("customer");
  const [canEditUnacknowledged, setCanEditUnacknowledged] = useState(true);

  const [companySuggestions, setCompanySuggestions] = useState([]);

  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadAccounts();
    loadCustomerSuggestions();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    setError("");

    const { data, error } = await supabase
      .from("customer_accounts")
      .select("*")
      .order("company_name", { ascending: true })
      .order("contact_name", { ascending: true });

    if (error) {
      setError(error.message || "Failed to load accounts");
      setAccounts([]);
    } else {
      setAccounts(data || []);
    }

    setLoading(false);
  }

  async function loadCustomerSuggestions() {
    const { data, error } = await supabase
      .from("customers")
      .select("name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Failed to load customer suggestions:", error.message);
      setCompanySuggestions([]);
      return;
    }

    const uniqueNames = [
      ...new Set((data || []).map((row) => row.name).filter(Boolean)),
    ];

    setCompanySuggestions(uniqueNames);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const cleanCompanyName = companyName.trim();
      const cleanContactName = contactName.trim();
      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = phone.trim();

      if (!cleanCompanyName) {
        throw new Error("Company name is required.");
      }

      if (!cleanContactName) {
        throw new Error("Contact name is required.");
      }

      if (!cleanEmail) {
        throw new Error("Email is required.");
      }

      if (!password.trim()) {
        throw new Error("Password is required for direct customer portal login.");
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      try {
        const cleanCompanyName = companyName.trim();
        const cleanContactName = contactName.trim();
        const cleanEmail = email.trim().toLowerCase();
        const cleanPhone = phone.trim();

        if (!cleanCompanyName) {
          throw new Error("Company name is required.");
        }
        if (!cleanContactName) {
          throw new Error("Contact name is required.");
        }
        if (!cleanEmail) {
          throw new Error("Email is required.");
        }
        if (!password) {
          throw new Error("Password is required for direct customer portal login.");
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          throw new Error(sessionError.message);
        }

        if (!session?.access_token) {
          throw new Error("You must be logged in to create accounts.");
        }

        let functionName = "create-customer-account";
        let body = {
          company_name: cleanCompanyName,
          contact_name: cleanContactName,
          email: cleanEmail,
          password: password,
          phone: cleanPhone,
          role,
          can_edit_unacknowledged: canEditUnacknowledged,
        };

        // Use create-internal-user for admin/operator/manager
        if (["admin", "operator", "manager"].includes(role)) {
          functionName = "create-internal-user";
          // You may want to adjust the body for internal users if needed
        }

        const { data: functionData, error: functionError } =
          await supabase.functions.invoke(functionName, {
            body,
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

        if (functionError) {
          console.error(`${functionName} function error:`, functionError);
          throw new Error(
            functionError.context?.error ||
              functionError.message ||
              `Failed to create account (${functionName})`
          );
        }

        console.log(`${functionName} response:`, functionData);

        setMessage(
          role === "customer"
            ? "Customer account created successfully. Next step: click Create Login / Resend Invite."
            : "Internal user account created successfully."
        );

        setCompanyName("");
        setContactName("");
        setEmail("");
        setPassword("");
        setPhone("");
        setRole("customer");
        setCanEditUnacknowledged(true);

        await loadAccounts();
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setSaving(false);
      }

      await loadAccounts();
      return data;
    } catch (err) {
      setError(err.message || "Failed to send invite");
    } finally {
      setSendingInviteId(null);
    }
  }

  async function toggleActive(account) {
    setError("");
    setMessage("");

    const { error } = await supabase
      .from("customer_accounts")
      .update({ active: !account.active })
      .eq("id", account.id);

    if (error) {
      setError(error.message || "Failed to update account");
      return;
    }

    setMessage(
      `${account.contact_name || "Account"} has been ${
        account.active ? "deactivated" : "activated"
      }.`
    );

    await loadAccounts();
  }

  async function toggleEditPermission(account) {
    setError("");
    setMessage("");

    const { error } = await supabase
      .from("customer_accounts")
      .update({
        can_edit_unacknowledged: !account.can_edit_unacknowledged,
      })
      .eq("id", account.id);

    if (error) {
      setError(error.message || "Failed to update permission");
      return;
    }

    setMessage(
      `${account.contact_name || "Account"}'s edit permission has been updated.`
    );

    await loadAccounts();
  }

  const filteredAccounts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return accounts;

    return accounts.filter((acct) => {
      return (
        (acct.company_name || "").toLowerCase().includes(term) ||
        (acct.contact_name || "").toLowerCase().includes(term) ||
        (acct.email || "").toLowerCase().includes(term) ||
        (acct.phone || "").toLowerCase().includes(term)
      );
    });
  }, [accounts, search]);

  const grouped = useMemo(
    () => groupByCompany(filteredAccounts),
    [filteredAccounts]
  );

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Customer Account Manager</h1>
          <p style={{ margin: "6px 0 0", color: "#666" }}>
            Create and manage customer login access for the ordering portal.
          </p>
        </div>

        <button onClick={loadAccounts} style={secondaryButtonStyle}>
          Refresh
        </button>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Create Customer Account</h2>

        <form
          onSubmit={handleCreate}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <label>Company Name</label>
            <input
              list="company-name-suggestions"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="Save On Blacktop"
              style={inputStyle}
              autoComplete="off"
            />
            <datalist id="company-name-suggestions">
              {companySuggestions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Contact Name</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
              placeholder="Gary Smith"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="gary@saveonblacktop.com"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Set an initial password"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="604-555-1234"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
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

          <div
            style={{
              display: "flex",
              alignItems: "end",
              paddingBottom: 10,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={canEditUnacknowledged}
                onChange={(e) => setCanEditUnacknowledged(e.target.checked)}
              />
              Can edit unacknowledged orders
            </label>
          </div>

          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 4,
            }}
          >
            <button
              type="submit"
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? "Creating..." : "Create Account"}
            </button>

            {message && <span style={{ color: "green" }}>{message}</span>}
            {error && <span style={{ color: "crimson" }}>{error}</span>}
          </div>
        </form>
      </div>

      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <h2 style={{ margin: 0 }}>Existing Accounts</h2>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, name, email, phone..."
            style={{ ...inputStyle, width: 320, maxWidth: "100%" }}
          />
        </div>

        {loading ? (
          <div style={{ color: "#666" }}>Loading accounts...</div>
        ) : filteredAccounts.length === 0 ? (
          <div style={{ color: "#666" }}>No customer accounts found.</div>
        ) : (
          Object.entries(grouped).map(([company, rows]) => (
            <div key={company} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  margin: "10px 0",
                  paddingBottom: 6,
                  borderBottom: "2px solid #eee",
                }}
              >
                {company}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid #ddd",
                        textAlign: "left",
                      }}
                    >
                      <th style={thStyle}>Contact</th>
                      <th style={thStyle}>Email</th>
                      <th style={thStyle}>Phone</th>
                      <th style={thStyle}>Role</th>
                      <th style={thStyle}>Active</th>
                      <th style={thStyle}>Can Edit</th>
                      <th style={thStyle}>Login Linked</th>
                      <th style={thStyle}>Invite Sent</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((acct) => (
                      <tr
                        key={acct.id}
                        style={{ borderBottom: "1px solid #eee" }}
                      >
                        <td style={tdStyle}>{acct.contact_name || "-"}</td>
                        <td style={tdStyle}>{acct.email || "-"}</td>
                        <td style={tdStyle}>{acct.phone || "-"}</td>
                        <td style={tdStyle}>{acct.role || "customer"}</td>
                        <td style={tdStyle}>{acct.active ? "Yes" : "No"}</td>
                        <td style={tdStyle}>
                          {acct.can_edit_unacknowledged ? "Yes" : "No"}
                        </td>
                        <td style={tdStyle}>
                          {acct.auth_user_id ? "Yes" : "No"}
                        </td>
                        <td style={tdStyle}>
                          {formatDateTime(acct.invite_sent_at)}
                        </td>
                        <td style={tdStyle}>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => toggleActive(acct)}
                              style={secondaryButtonStyle}
                            >
                              {acct.active ? "Deactivate" : "Activate"}
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleEditPermission(acct)}
                              style={secondaryButtonStyle}
                            >
                              {acct.can_edit_unacknowledged
                                ? "Remove Edit"
                                : "Allow Edit"}
                            </button>

                            <button
                              type="button"
                              onClick={() => sendInvite(acct)}
                              disabled={sendingInviteId === acct.id || !acct.email}
                              style={secondaryButtonStyle}
                            >
                              {sendingInviteId === acct.id
                                ? "Sending..."
                                : acct.auth_user_id
                                ? "Resend Invite"
                                : "Create Login"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 14,
  padding: 16,
  marginBottom: 20,
};

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #ccc",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const thStyle = {
  padding: "10px 8px",
  fontSize: 13,
  color: "#555",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "12px 8px",
  verticalAlign: "top",
};

const primaryButtonStyle = {
  padding: "12px 18px",
  borderRadius: 10,
  border: "none",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryButtonStyle = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};