import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const COPY_LABELS = ["COPY 1 CARRIER", "COPY 2 CUSTOMER", "COPY 3 FILE"];

export default function JobTickets({ access }) {
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState([]);
  const [customerNameMap, setCustomerNameMap] = useState({});

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [customer, setCustomer] = useState("");
  const [order, setOrder] = useState("");

  const [loading, setLoading] = useState(true);

  const isCustomerUser = !!access?.isCustomer;
  const lockedCompanyName = String(
    access?.customerAccount?.company_name ||
      access?.profile?.company_name ||
      access?.customerUser?.company_name ||
      ""
  ).trim();

  useEffect(() => {
    if (isCustomerUser && lockedCompanyName) {
      setCustomer(lockedCompanyName);
    }
  }, [isCustomerUser, lockedCompanyName]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([
        fetchTickets(dateFrom, dateTo, order),
        fetchCustomerNames(),
      ]);
      setLoading(false);
    }

    init();
  }, []);

  useEffect(() => {
    async function reloadTickets() {
      setLoading(true);
      await fetchTickets(dateFrom, dateTo, order);
      setLoading(false);
    }

    reloadTickets();
  }, [dateFrom, dateTo, order]);

  async function fetchTickets(fromDate = "", toDate = "", orderSearch = "") {
    let query = supabase
      .from("alkon_tickets")
      .select(`
        ticket_no,
        load_date,
        load_time,
        customer_id,
        order_id,
        mix,
        tonnes,
        truck,
        address,
        gross_kg,
        tare_kg,
        net_kg
      `)
      .order("load_date", { ascending: false })
      .order("load_time", { ascending: false });

    const trimmedOrder = String(orderSearch || "").trim();

    if (trimmedOrder) {
      query = query.ilike("order_id", `%${trimmedOrder}%`);
    } else {
      if (fromDate) {
        query = query.gte("load_date", fromDate);
      }

      if (toDate) {
        query = query.lte("load_date", toDate);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching tickets:", error);
      setTickets([]);
      return;
    }

    setTickets(data || []);
  }

  async function fetchCustomerNames() {
    const { data, error } = await supabase
      .from("customers_master")
      .select("customer_id, customer_name");

    if (error) {
      console.error("Error fetching customer names:", error);
      setCustomerNameMap({});
      return;
    }

    const map = {};

    for (const row of data || []) {
      const id = String(row.customer_id || "").trim();
      const name = String(row.customer_name || "").trim();

      if (id) {
        map[id] = name || id;
      }
    }

    setCustomerNameMap(map);
  }

  function getCustomerDisplay(ticket) {
    const id = String(ticket.customer_id || "").trim();
    return customerNameMap[id] || id || "-";
  }

  function formatKg(value) {
    if (value === null || value === undefined || value === "") return "-";
    const num = Number(value);
    if (Number.isNaN(num)) return String(value);
    return num.toLocaleString();
  }

  function normalizeTime(value) {
    return String(value || "").trim().slice(0, 5);
  }

  function passesTimeFilter(ticket) {
    const ticketTime = normalizeTime(ticket.load_time);

    if (!ticketTime) return false;

    if (!timeFrom && !timeTo) return true;

    if (timeFrom && !timeTo) {
      return ticketTime >= timeFrom;
    }

    if (!timeFrom && timeTo) {
      return ticketTime <= timeTo;
    }

    if (timeFrom <= timeTo) {
      return ticketTime >= timeFrom && ticketTime <= timeTo;
    }

    return ticketTime >= timeFrom || ticketTime <= timeTo;
  }

  function customerMatchesLockedCompany(ticket) {
    if (!lockedCompanyName) return false;

    const ticketCustomerId = String(ticket.customer_id || "").trim().toLowerCase();
    const ticketCustomerName = String(getCustomerDisplay(ticket) || "")
      .trim()
      .toLowerCase();
    const locked = lockedCompanyName.toLowerCase();

    return ticketCustomerId === locked || ticketCustomerName === locked;
  }

  const accessScopedTickets = useMemo(() => {
    if (!isCustomerUser) return tickets;

    if (!lockedCompanyName) return [];

    return tickets.filter((ticket) => customerMatchesLockedCompany(ticket));
  }, [tickets, isCustomerUser, lockedCompanyName, customerNameMap]);

  const customerOptions = useMemo(() => {
    let result = [...accessScopedTickets];

    if (dateFrom) {
      result = result.filter((t) => (t.load_date || "") >= dateFrom);
    }

    if (dateTo) {
      result = result.filter((t) => (t.load_date || "") <= dateTo);
    }

    if (timeFrom || timeTo) {
      result = result.filter((t) => passesTimeFilter(t));
    }

    const map = new Map();

    for (const ticket of result) {
      const id = String(ticket.customer_id || "").trim();
      const name = getCustomerDisplay(ticket);

      if (id && !map.has(id)) {
        map.set(id, name);
      }
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accessScopedTickets, dateFrom, dateTo, timeFrom, timeTo, customerNameMap]);

  const filtered = useMemo(() => {
    let result = [...accessScopedTickets];

    if (dateFrom) {
      result = result.filter((t) => (t.load_date || "") >= dateFrom);
    }

    if (dateTo) {
      result = result.filter((t) => (t.load_date || "") <= dateTo);
    }

    if (timeFrom || timeTo) {
      result = result.filter((t) => passesTimeFilter(t));
    }

    if (isCustomerUser) {
      if (!lockedCompanyName) {
        result = [];
      } else {
        result = result.filter((t) => customerMatchesLockedCompany(t));
      }
    } else if (customer) {
      result = result.filter(
        (t) => String(t.customer_id || "").trim() === customer
      );
    }

    return result;
  }, [
    accessScopedTickets,
    dateFrom,
    dateTo,
    timeFrom,
    timeTo,
    customer,
    isCustomerUser,
    lockedCompanyName,
    customerNameMap,
  ]);

  const runningOrderSummaryMap = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const aKey = `${a.load_date || ""} ${normalizeTime(a.load_time)} ${a.ticket_no || ""}`;
      const bKey = `${b.load_date || ""} ${normalizeTime(b.load_time)} ${b.ticket_no || ""}`;
      return aKey.localeCompare(bKey);
    });

    const running = {};
    const totalsByOrder = {};

    for (const ticket of sorted) {
      const orderId = String(ticket.order_id || "").trim() || "No Order";
      const ticketNo = String(ticket.ticket_no || "").trim();
      const tonnes = Number(ticket.tonnes || 0);

      if (!totalsByOrder[orderId]) {
        totalsByOrder[orderId] = {
          loads: 0,
          tonnes: 0,
        };
      }

      totalsByOrder[orderId].loads += 1;
      totalsByOrder[orderId].tonnes += tonnes;

      if (ticketNo) {
        running[ticketNo] = {
          loads: totalsByOrder[orderId].loads,
          tonnes: totalsByOrder[orderId].tonnes,
        };
      }
    }

    return running;
  }, [filtered]);

  function toggleSelect(ticketNo) {
    setSelected((prev) =>
      prev.includes(ticketNo)
        ? prev.filter((t) => t !== ticketNo)
        : [...prev, ticketNo]
    );
  }

  function toggleSelectAll() {
    const filteredTicketNos = filtered
      .map((t) => t.ticket_no)
      .filter(Boolean);

    const allFilteredSelected =
      filteredTicketNos.length > 0 &&
      filteredTicketNos.every((ticketNo) => selected.includes(ticketNo));

    if (allFilteredSelected) {
      setSelected((prev) =>
        prev.filter((ticketNo) => !filteredTicketNos.includes(ticketNo))
      );
    } else {
      setSelected((prev) => [...new Set([...prev, ...filteredTicketNos])]);
    }
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setTimeFrom("");
    setTimeTo("");
    setOrder("");

    if (!isCustomerUser) {
      setCustomer("");
    }
  }

  function printTickets() {
    const selectedTickets = filtered.filter((t) =>
      selected.includes(t.ticket_no)
    );

    if (selectedTickets.length === 0) {
      alert("No tickets selected");
      return;
    }

    const html = `
      <html>
        <head>
          <title>Job Tickets</title>
          <style>
            * { box-sizing: border-box; }

            html, body {
              margin: 0;
              padding: 0;
              font-family: Arial, Helvetica, sans-serif;
            }

            @page {
              size: letter portrait;
              margin: 0.35in;
            }

            .ticket-page {
              height: 10.15in;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              page-break-after: always;
            }

            .ticket-page:last-child {
              page-break-after: auto;
            }

            .ticket-copy {
              flex: 1;
              border-bottom: 2px dashed #000;
              padding: 6px 0 6px 0;
              display: flex;
              flex-direction: column;
            }

            .ticket-copy:last-child {
              border-bottom: none;
            }

            .copy-top {
              display: flex;
              justify-content: space-between;
              margin-bottom: 6px;
            }

            .logo {
              width: 0.9in;
              height: 0.9in;
              object-fit: contain;
            }

            .ticket-number-top {
              font-size: 18px;
              font-weight: bold;
            }

            .copy-main {
              display: grid;
              grid-template-columns: 1fr 2in;
              column-gap: 12px;
            }

            .field {
              font-size: 13px;
              margin-bottom: 2px;
            }

            .field strong {
              display: inline-block;
              min-width: 70px;
            }

            .right {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }

            .net-box {
              border: 1px solid #000;
              padding: 6px;
              font-size: 13px;
            }

            .weight-line {
              display: flex;
              justify-content: space-between;
              font-variant-numeric: tabular-nums;
            }

            .summary-box {
              border: 1px solid #000;
              padding: 6px;
              font-size: 12px;
            }

            .summary-title {
              font-weight: bold;
              text-align: center;
              margin-bottom: 4px;
            }

            .summary-line {
              display: flex;
              justify-content: space-between;
              font-variant-numeric: tabular-nums;
            }

            .copy-label {
              margin-top: 6px;
              font-size: 11px;
              font-weight: bold;
            }

            .filter-note {
              margin-top: 4px;
              font-size: 10px;
              color: #333;
            }
          </style>
        </head>
        <body>
          ${selectedTickets
            .map((ticket) => {
              const ticketNo = String(ticket.ticket_no || "").trim();
              const summary = runningOrderSummaryMap[ticketNo] || {
                loads: 0,
                tonnes: 0,
              };

              return `
              <div class="ticket-page">
                ${COPY_LABELS.map(
                  (copy) => `
                  <div class="ticket-copy">
                    <div class="copy-top">
                      <img src="/allroads-logo.png" class="logo" />
                      <div class="ticket-number-top">${ticket.ticket_no || "-"}</div>
                    </div>

                    <div class="copy-main">
                      <div>
                        <div class="field"><strong>Date:</strong> ${ticket.load_date || "-"}</div>
                        <div class="field"><strong>Time:</strong> ${ticket.load_time || "-"}</div>
                        <div class="field"><strong>Customer:</strong> ${getCustomerDisplay(ticket)}</div>
                        <div class="field"><strong>Address:</strong> ${ticket.address || "-"}</div>
                        <div class="field"><strong>Order:</strong> ${ticket.order_id || "-"}</div>
                        <div class="field"><strong>Product:</strong> ${ticket.mix || "-"}</div>
                        <div class="field"><strong>Vehicle:</strong> ${ticket.truck || "-"}</div>
                        <div class="copy-label">${copy}</div>
                        ${
                          timeFrom || timeTo
                            ? `<div class="filter-note">Run Filter: ${timeFrom || "--:--"} to ${timeTo || "--:--"}</div>`
                            : ""
                        }
                      </div>

                      <div class="right">
                        <div class="net-box">
                          <div class="weight-line"><strong>Gross:</strong><span>${formatKg(ticket.gross_kg)} kg</span></div>
                          <div class="weight-line"><strong>Tare:</strong><span>${formatKg(ticket.tare_kg)} kg</span></div>
                          <div class="weight-line"><strong>Net:</strong><span>${formatKg(ticket.net_kg)} kg</span></div>
                        </div>

                        <div class="summary-box">
                          <div class="summary-title">JOB SUMMARY</div>
                          <div class="summary-line"><span>Ticket Qty:</span><span>${Number(ticket.tonnes || 0).toFixed(2)} t</span></div>
                          <div class="summary-line"><span>Loads:</span><span>${summary.loads}</span></div>
                          <div class="summary-line"><span>Total Tonnes:</span><span>${summary.tonnes.toFixed(2)} t</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                `
                ).join("")}
              </div>
            `;
            })
            .join("")}
        </body>
      </html>
    `;

    const win = window.open("", "_blank");

    if (!win) {
      alert("Popup blocked");
      return;
    }

    win.document.write(html);
    win.document.close();
    win.print();
  }

  const filteredTicketNos = filtered.map((t) => t.ticket_no).filter(Boolean);
  const allFilteredSelected =
    filteredTicketNos.length > 0 &&
    filteredTicketNos.every((ticketNo) => selected.includes(ticketNo));

  return (
    <div style={styles.page}>
      <h2 style={styles.heading}>Job Tickets</h2>

      {isCustomerUser && (
        <div style={styles.lockNotice}>
          Viewing tickets for: <strong>{lockedCompanyName || "Your Company"}</strong>
        </div>
      )}

      <div style={styles.filters}>
        <div style={styles.filterGroup}>
          <div style={styles.label}>Date From</div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.label}>Date To</div>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.label}>Time From</div>
          <input
            type="time"
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
            style={styles.input}
          />
          <div style={styles.quickButtonRow}>
            <button
              type="button"
              onClick={() => setTimeFrom("07:00")}
              style={styles.quickButton}
            >
              07:00
            </button>
            <button
              type="button"
              onClick={() => setTimeFrom("19:00")}
              style={styles.quickButton}
            >
              19:00
            </button>
          </div>
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.label}>Time To</div>
          <input
            type="time"
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
            style={styles.input}
          />
          <div style={styles.quickButtonRow}>
            <button
              type="button"
              onClick={() => setTimeTo("17:00")}
              style={styles.quickButton}
            >
              17:00
            </button>
            <button
              type="button"
              onClick={() => setTimeTo("03:00")}
              style={styles.quickButton}
            >
              03:00
            </button>
          </div>
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.label}>Customer</div>
          <select
            value={isCustomerUser ? lockedCompanyName : customer}
            onChange={(e) => setCustomer(e.target.value)}
            style={{
              ...styles.input,
              ...(isCustomerUser ? styles.disabledInput : {}),
            }}
            disabled={isCustomerUser}
          >
            {isCustomerUser ? (
              <option value={lockedCompanyName}>
                {lockedCompanyName || "Your Company"}
              </option>
            ) : (
              <>
                <option value="">All Customers</option>
                {customerOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.label}>Order ID</div>
          <input
            placeholder="Search all history..."
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            style={styles.input}
          />
        </div>

        <div style={styles.filterGroup}>
          <div style={styles.label}>Quick Shift</div>
          <div style={styles.shiftButtonGrid}>
            <button
              type="button"
              onClick={() => {
                setTimeFrom("07:00");
                setTimeTo("17:00");
              }}
              style={styles.quickButton}
            >
              Day Shift
            </button>

            <button
              type="button"
              onClick={() => {
                setTimeFrom("19:00");
                setTimeTo("03:00");
              }}
              style={styles.quickButton}
            >
              Night Shift
            </button>

            <button
              type="button"
              onClick={() => {
                setTimeFrom("");
                setTimeTo("");
              }}
              style={styles.quickButton}
            >
              Clear Times
            </button>
          </div>
        </div>

        <button onClick={clearFilters} style={styles.secondaryButton}>
          Clear Filters
        </button>
      </div>

      <div style={styles.actions}>
        <button onClick={toggleSelectAll} style={styles.primaryButton}>
          {allFilteredSelected ? "Unselect All" : "Select All"}
        </button>

        <button onClick={printTickets} style={styles.primaryButton}>
          Print Selected
        </button>

        <div style={styles.summary}>
          Showing {filtered.length} ticket{filtered.length === 1 ? "" : "s"} | Selected {selected.length}
        </div>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}></th>
                <th style={styles.th}>Ticket #</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Customer</th>
                <th style={styles.th}>Address</th>
                <th style={styles.th}>Order</th>
                <th style={styles.th}>Mix</th>
                <th style={styles.th}>Tonnes</th>
                <th style={styles.th}>Truck</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.ticket_no} style={styles.tr}>
                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={selected.includes(ticket.ticket_no)}
                      onChange={() => toggleSelect(ticket.ticket_no)}
                    />
                  </td>
                  <td style={styles.td}>{ticket.ticket_no}</td>
                  <td style={styles.td}>{ticket.load_date}</td>
                  <td style={styles.td}>{ticket.load_time}</td>
                  <td style={styles.td}>{getCustomerDisplay(ticket)}</td>
                  <td style={styles.td}>{ticket.address}</td>
                  <td style={styles.td}>{ticket.order_id}</td>
                  <td style={styles.td}>{ticket.mix}</td>
                  <td style={styles.td}>{ticket.tonnes}</td>
                  <td style={styles.td}>{ticket.truck}</td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan="10" style={styles.emptyCell}>
                    No tickets found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    padding: 20,
    fontFamily: "Arial, sans-serif",
    color: "#f5f5f5",
  },
  heading: {
    marginTop: 0,
    marginBottom: 16,
    color: "#f5f5f5",
  },
  lockNotice: {
    marginBottom: 14,
    padding: "10px 12px",
    borderRadius: 8,
    background: "#1f2937",
    color: "#ffffff",
    fontSize: 14,
  },
  filters: {
    display: "flex",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: "#f5f5f5",
    padding: "6px 8px",
    borderRadius: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#111",
    letterSpacing: 0.3,
  },
  input: {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #ccc",
    minWidth: 150,
    background: "#fff",
    color: "#111",
  },
  disabledInput: {
    background: "#e5e7eb",
    color: "#374151",
    cursor: "not-allowed",
  },
  quickButtonRow: {
    display: "flex",
    gap: 6,
    marginTop: 4,
    flexWrap: "wrap",
  },
  shiftButtonGrid: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    maxWidth: 260,
  },
  quickButton: {
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #999",
    background: "#ffffff",
    color: "#111",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  actions: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 14,
  },
  primaryButton: {
    padding: "8px 14px",
    borderRadius: 6,
    border: "1px solid #333",
    background: "#111",
    color: "#fff",
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "8px 14px",
    borderRadius: 6,
    border: "1px solid #999",
    background: "#f3f3f3",
    color: "#111",
    cursor: "pointer",
    height: 38,
  },
  summary: {
    marginLeft: 6,
    fontSize: 14,
    color: "#bbb",
  },
  loading: {
    padding: 20,
    color: "#f5f5f5",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#fff",
    color: "#111",
  },
  th: {
    border: "1px solid #ccc",
    padding: 8,
    textAlign: "left",
    background: "#f5f5f5",
    color: "#111",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  td: {
    border: "1px solid #ddd",
    padding: 8,
    whiteSpace: "nowrap",
    color: "#111",
    background: "#fff",
  },
  tr: {
    background: "#fff",
  },
  emptyCell: {
    border: "1px solid #ddd",
    padding: 16,
    textAlign: "center",
    color: "#666",
    background: "#fff",
  },
};