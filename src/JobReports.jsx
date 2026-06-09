import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";


const HOURS = ["12", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"];
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const PERIODS = ["AM", "PM"];

function getTodayLocal() {
  return new Date().toISOString().slice(0, 10);
}

function to24Hour(hour, minute, period) {
  let h = Number(hour);

  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;

  return `${String(h).padStart(2, "0")}:${minute}`;
}

function getTimeRangeLabel(filters) {
  return `${filters.time_from_hour}:${filters.time_from_minute} ${filters.time_from_period} to ${filters.time_to_hour}:${filters.time_to_minute} ${filters.time_to_period}`;
}

function getMixName(ticket) {
  return ticket.mix || ticket.description || ticket.product || "Unknown Mix";
}

function getTonnes(ticket) {
  return Number(ticket.tonnes ?? ticket.qty ?? ticket.quantity ?? 0) || 0;
}

function getTicketNo(ticket) {
  return ticket.ticket_no || ticket.TicketNo || ticket.ticket_number || "-";
}

function getAddress(ticket) {
  return (
    ticket.delivery_address ||
    ticket.DeliveryAddress1 ||
    ticket.address ||
    ticket.job_address ||
    ticket.ship_to ||
    "-"
  );
}

function csvSafe(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function moneySafeFilename(text) {
  return String(text || "job-report")
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export default function JobReports({ access, role }) {
  const today = getTodayLocal();

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [excludedMixes, setExcludedMixes] = useState([]);
  const [hasRunReport, setHasRunReport] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  const [filters, setFilters] = useState({
    customer_id: "",
    order_id: "",
    date_from: today,
    date_to: today,
    time_from_hour: "12",
    time_from_minute: "00",
    time_from_period: "AM",
    time_to_hour: "11",
    time_to_minute: "55",
    time_to_period: "PM",
  });

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, customer_code")
    .not("customer_code", "is", null)
    .order("name", { ascending: true });

  console.log("customers:", data);

  if (error) {
    console.error("loadCustomers error:", error);
    return;
  }

  setCustomers(data || []);
}


  function updateFilter(name, value) {
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function runReport() {
  if (!filters.date_from || !filters.date_to) {
    alert("Please select both Date From and Date To.");
    return;
  }

  if (filters.date_from > filters.date_to) {
    alert("Date From cannot be after Date To.");
    return;
  }

  setLoading(true);
  setHasRunReport(true);
  setExcludedMixes([]);

  try {
    const pageSize = 1000;
    let from = 0;
    let allRows = [];
    let keepGoing = true;

    while (keepGoing) {
      let query = supabase
        .from("alkon_tickets")
        .select("*")
        .gte("load_date", filters.date_from)
        .lte("load_date", filters.date_to)
        .order("load_date", { ascending: true })
        .order("load_time", { ascending: true })
        .range(from, from + pageSize - 1);

      if (filters.customer_id) {
        query = query.eq("customer_id", filters.customer_id);
      }

      if (filters.order_id.trim()) {
        query = query.ilike("order_id", `%${filters.order_id.trim()}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const rows = data || [];
      allRows = [...allRows, ...rows];

      if (rows.length < pageSize) {
        keepGoing = false;
      } else {
        from += pageSize;
      }
    }

    setTickets(allRows);
  } catch (error) {
    console.error("runReport error:", error);
    alert(error.message);
    setTickets([]);
  }

  setLoading(false);
}

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.customer_code === filters.customer_id);
  }, [customers, filters.customer_id]);

  const filteredCustomers = useMemo(() => {
  const q = customerSearch.trim().toLowerCase();

  if (!q) return customers;

  return customers.filter((c) =>
    `${c.name || ""} ${c.customer_code || ""}`
      .toLowerCase()
      .includes(q)
  );
}, [customers, customerSearch]);

const customerNameByCode = useMemo(() => {
  const map = {};
  customers.forEach((c) => {
    map[c.customer_code] = c.name;
  });
  return map;
}, [customers]);

function getCustomerName(ticket) {
  return customerNameByCode[ticket.customer_id] || ticket.customer || ticket.customer_id || "-";
}

  const reportCustomerName = selectedCustomer
    ? selectedCustomer.name
    : "All Customers";

  const reportCustomerId = selectedCustomer ? selectedCustomer.customer_code : "";

  const timeFrom24 = useMemo(() => {
    return to24Hour(
      filters.time_from_hour,
      filters.time_from_minute,
      filters.time_from_period
    );
  }, [filters.time_from_hour, filters.time_from_minute, filters.time_from_period]);

  const timeTo24 = useMemo(() => {
    return to24Hour(
      filters.time_to_hour,
      filters.time_to_minute,
      filters.time_to_period
    );
  }, [filters.time_to_hour, filters.time_to_minute, filters.time_to_period]);

  const timeRangeLabel = getTimeRangeLabel(filters);

  const timeFilteredTickets = useMemo(() => {
  return tickets.filter((t) => {
    const date = String(t.load_date || "").slice(0, 10);
    const time = String(t.load_time || "").slice(0, 5);

    if (!date || !time) return false;

    // Normal same-day time range
    if (timeFrom24 <= timeTo24) {
      return time >= timeFrom24 && time <= timeTo24;
    }

    // Overnight range: example 6:00 PM to 5:30 AM
    if (date === filters.date_from) {
      return time >= timeFrom24;
    }

    if (date === filters.date_to) {
      return time <= timeTo24;
    }

    // Middle dates, if date range is more than 2 days
    return time >= timeFrom24 || time <= timeTo24;
  });
}, [
  tickets,
  timeFrom24,
  timeTo24,
  filters.date_from,
  filters.date_to,
]);

  const allMixBreakdown = useMemo(() => {
    const map = {};

    timeFilteredTickets.forEach((t) => {
      const mix = getMixName(t);
      const tonnes = getTonnes(t);

      if (!map[mix]) {
        map[mix] = {
          mix,
          tonnes: 0,
          tickets: 0,
        };
      }

      map[mix].tonnes += tonnes;
      map[mix].tickets += 1;
    });

    return Object.values(map).sort((a, b) => a.mix.localeCompare(b.mix));
  }, [timeFilteredTickets]);

  const visibleTickets = useMemo(() => {
    return timeFilteredTickets.filter((t) => {
      const mix = getMixName(t);
      return !excludedMixes.includes(mix);
    });
  }, [timeFilteredTickets, excludedMixes]);

  const summary = useMemo(() => {
    const totalTonnes = visibleTickets.reduce(
      (sum, t) => sum + getTonnes(t),
      0
    );

    const times = visibleTickets
      .map((t) => t.load_time)
      .filter(Boolean)
      .sort();

    return {
      totalTonnes,
      ticketCount: visibleTickets.length,
      firstLoad: times[0] || "-",
      lastLoad: times[times.length - 1] || "-",
    };
  }, [visibleTickets]);

  const visibleMixBreakdown = useMemo(() => {
    return allMixBreakdown.filter((m) => !excludedMixes.includes(m.mix));
  }, [allMixBreakdown, excludedMixes]);

  const dailyBreakdown = useMemo(() => {
    const map = {};

    visibleTickets.forEach((t) => {
      const date = t.load_date || "Unknown Date";
      const tonnes = getTonnes(t);

      if (!map[date]) {
        map[date] = {
          date,
          tonnes: 0,
          tickets: 0,
          firstLoad: t.load_time || "-",
          lastLoad: t.load_time || "-",
        };
      }

      map[date].tonnes += tonnes;
      map[date].tickets += 1;

      if (t.load_time) {
        if (map[date].firstLoad === "-" || t.load_time < map[date].firstLoad) {
          map[date].firstLoad = t.load_time;
        }

        if (map[date].lastLoad === "-" || t.load_time > map[date].lastLoad) {
          map[date].lastLoad = t.load_time;
        }
      }
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [visibleTickets]);

  function toggleMix(mix) {
    setExcludedMixes((prev) =>
      prev.includes(mix) ? prev.filter((x) => x !== mix) : [...prev, mix]
    );
  }

  function selectAllMixes() {
    setExcludedMixes([]);
  }

  function deselectAllMixes() {
    setExcludedMixes(allMixBreakdown.map((m) => m.mix));
  }

  function buildReportHtml() {
    const mixRows = visibleMixBreakdown
      .map(
        (m) => `
          <tr>
            <td>${m.mix}</td>
            <td>${m.tonnes.toFixed(2)}</td>
            <td>${m.tickets}</td>
          </tr>
        `
      )
      .join("");

    const dailyRows = dailyBreakdown
      .map(
        (d) => `
          <tr>
            <td>${d.date}</td>
            <td>${d.tonnes.toFixed(2)}</td>
            <td>${d.tickets}</td>
            <td>${d.firstLoad}</td>
            <td>${d.lastLoad}</td>
          </tr>
        `
      )
      .join("");

    const ticketRows = visibleTickets
      .map(
        (t) => `
          <tr>
            <td>${getTicketNo(t)}</td>
            <td>${t.load_date || "-"}</td>
            <td>${t.load_time || "-"}</td>
            <td>${getCustomerName(t)}</td>
            <td>${t.order_id || "-"}</td>
            <td>${getAddress(t)}</td>
            <td>${getMixName(t)}</td>
            <td>${getTonnes(t).toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

    return `
      <!doctype html>
      <html>
        <head>
          <title>Superintendent Job Report</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 28px;
              color: #111827;
            }

            .top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 3px solid #b91c1c;
              padding-bottom: 14px;
              margin-bottom: 18px;
            }

            .brand {
              font-size: 24px;
              font-weight: 800;
            }

            .subbrand {
              font-size: 13px;
              color: #555;
              margin-top: 4px;
            }

            .report-title {
              text-align: right;
              font-size: 22px;
              font-weight: 800;
            }

            .meta {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 8px 18px;
              margin-bottom: 18px;
              font-size: 14px;
            }

            .cards {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              margin-bottom: 18px;
            }

            .card {
              border: 1px solid #ddd;
              border-radius: 8px;
              padding: 10px;
            }

            .card-label {
              font-size: 12px;
              color: #555;
            }

            .card-value {
              font-size: 22px;
              font-weight: 800;
              margin-top: 4px;
            }

            h2 {
              font-size: 18px;
              margin-top: 22px;
              border-bottom: 1px solid #ddd;
              padding-bottom: 6px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
              font-size: 12px;
            }

            th {
              background: #f3f4f6;
              text-align: left;
              border: 1px solid #ddd;
              padding: 6px;
            }

            td {
              border: 1px solid #ddd;
              padding: 6px;
            }

            .footer {
              margin-top: 28px;
              font-size: 11px;
              color: #555;
            }

            @media print {
              button {
                display: none;
              }

              body {
                margin: 18px;
              }

              .page-break {
                page-break-before: always;
              }
            }
          </style>
        </head>

        <body>
          <div class="top">
            <div>
              <div class="brand">ALL ROADS CONSTRUCTION</div>
              <div class="subbrand">Plant Orders — Superintendent Job Report</div>
            </div>
            <div class="report-title">
              Job Production Report
              <div class="subbrand">Printed ${new Date().toLocaleString()}</div>
            </div>
          </div>

          <div class="meta">
            <div><strong>Customer:</strong> ${reportCustomerName}</div>
            <div><strong>Customer ID:</strong> ${reportCustomerId || "All"}</div>
            <div><strong>Order / Job ID:</strong> ${filters.order_id || "All"}</div>
            <div><strong>Date Range:</strong> ${filters.date_from} to ${filters.date_to}</div>
            <div><strong>Time Range:</strong> ${timeRangeLabel}</div>
            <div><strong>Selected Mixes:</strong> ${visibleMixBreakdown.length}</div>
          </div>

          <div class="cards">
            <div class="card">
              <div class="card-label">Total Ticketed Tonnes</div>
              <div class="card-value">${summary.totalTonnes.toFixed(2)}</div>
            </div>
            <div class="card">
              <div class="card-label">Number of Tickets</div>
              <div class="card-value">${summary.ticketCount}</div>
            </div>
            <div class="card">
              <div class="card-label">First Load</div>
              <div class="card-value">${summary.firstLoad}</div>
            </div>
            <div class="card">
              <div class="card-label">Last Load</div>
              <div class="card-value">${summary.lastLoad}</div>
            </div>
          </div>

          <h2>Mix Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Mix</th>
                <th>Tonnes</th>
                <th>Tickets</th>
              </tr>
            </thead>
            <tbody>
              ${mixRows || `<tr><td colspan="3">No data found.</td></tr>`}
            </tbody>
          </table>

          <h2>Daily Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tonnes</th>
                <th>Tickets</th>
                <th>First Load</th>
                <th>Last Load</th>
              </tr>
            </thead>
            <tbody>
              ${dailyRows || `<tr><td colspan="5">No data found.</td></tr>`}
            </tbody>
          </table>

          <h2 class="page-break">Ticket List</h2>
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Date</th>
                <th>Time</th>
                <th>Customer</th>
                <th>Order ID</th>
                <th>Location</th>
                <th>Mix</th>
                <th>Tonnes</th>
              </tr>
            </thead>
            <tbody>
              ${ticketRows || `<tr><td colspan="8">No data found.</td></tr>`}
            </tbody>
          </table>

          <div class="footer">
            Generated from Plant Orders using selected mixes and selected time range only.
          </div>

          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `;
  }

  function printReport() {
    if (!hasRunReport || visibleTickets.length === 0) {
      alert("Run a report first before printing.");
      return;
    }

    const win = window.open("", "_blank", "width=1200,height=800");

    if (!win) {
      alert("Popup blocked. Please allow popups for this site.");
      return;
    }

    win.document.open();
    win.document.write(buildReportHtml());
    win.document.close();
  }

  function exportExcel() {
    if (!hasRunReport || visibleTickets.length === 0) {
      alert("Run a report first before exporting.");
      return;
    }

    const lines = [];

    lines.push(["ALL ROADS CONSTRUCTION - SUPERINTENDENT JOB REPORT"]);
    lines.push([]);
    lines.push(["Customer", reportCustomerName]);
    lines.push(["Customer ID", reportCustomerId || "All"]);
    lines.push(["Order / Job ID", filters.order_id || "All"]);
    lines.push(["Date From", filters.date_from]);
    lines.push(["Date To", filters.date_to]);
    lines.push(["Time Range", timeRangeLabel]);
    lines.push([]);
    lines.push(["SUMMARY"]);
    lines.push(["Total Ticketed Tonnes", summary.totalTonnes.toFixed(2)]);
    lines.push(["Number of Tickets", summary.ticketCount]);
    lines.push(["First Load", summary.firstLoad]);
    lines.push(["Last Load", summary.lastLoad]);
    lines.push([]);
    lines.push(["MIX BREAKDOWN"]);
    lines.push(["Mix", "Tonnes", "Tickets"]);

    visibleMixBreakdown.forEach((m) => {
      lines.push([m.mix, m.tonnes.toFixed(2), m.tickets]);
    });

    lines.push([]);
    lines.push(["DAILY BREAKDOWN"]);
    lines.push(["Date", "Tonnes", "Tickets", "First Load", "Last Load"]);

    dailyBreakdown.forEach((d) => {
      lines.push([
        d.date,
        d.tonnes.toFixed(2),
        d.tickets,
        d.firstLoad,
        d.lastLoad,
      ]);
    });

    lines.push([]);
    lines.push(["TICKET LIST"]);
    lines.push([
      "Ticket",
      "Date",
      "Time",
      "Customer",
      "Order ID",
      "Location",
      "Mix",
      "Tonnes",
    ]);

    visibleTickets.forEach((t) => {
      lines.push([
        getTicketNo(t),
        t.load_date || "-",
        t.load_time || "-",
        getCustomerName(t),
        t.order_id || "-",
        getAddress(t),
        getMixName(t),
        getTonnes(t).toFixed(2),
      ]);
    });

    const csv = lines.map((row) => row.map(csvSafe).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const filename = `${moneySafeFilename(
      reportCustomerName
    )}_${filters.order_id || "all-orders"}_${filters.date_from}_to_${
      filters.date_to
    }.csv`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function TimeDropdownGroup({ label, prefix }) {
    return (
      <div style={styles.timeGroup}>
        <div style={styles.timeLabel}>{label}</div>

        <div style={styles.timeSelectRow}>
          <select
            style={styles.timeSelect}
            value={filters[`${prefix}_hour`]}
            onChange={(e) => updateFilter(`${prefix}_hour`, e.target.value)}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>

          <select
            style={styles.timeSelect}
            value={filters[`${prefix}_minute`]}
            onChange={(e) => updateFilter(`${prefix}_minute`, e.target.value)}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            style={styles.timeSelect}
            value={filters[`${prefix}_period`]}
            onChange={(e) => updateFilter(`${prefix}_period`, e.target.value)}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Job Reports</h1>
          <p style={styles.subtitle}>
            Superintendent production report by customer, job/order, and date range.
          </p>
        </div>

        <button
          style={styles.backButton}
          onClick={() => (window.location.href = "/manager")}
        >
          Back to Manager
        </button>
      </div>

      <div style={styles.filters}>
        <label style={styles.label}>
          Customer
          <select
            style={styles.input}
            value={filters.customer_id}
            onChange={(e) => updateFilter("customer_id", e.target.value)}
          >
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.customer_code}>
          {c.name || "Unnamed Customer"} — {c.customer_code}
</option>
            ))}
          </select>
        </label>

        <label style={styles.label}>
          Job / Order ID
          <input
            style={styles.input}
            value={filters.order_id}
            onChange={(e) => updateFilter("order_id", e.target.value)}
            placeholder="Example: 12345"
          />
        </label>

        <label style={styles.label}>
          Date From
          <input
            type="date"
            style={styles.input}
            value={filters.date_from}
            onChange={(e) => updateFilter("date_from", e.target.value)}
          />
        </label>

        <label style={styles.label}>
          Date To
          <input
            type="date"
            style={styles.input}
            value={filters.date_to}
            onChange={(e) => updateFilter("date_to", e.target.value)}
          />
        </label>

        <TimeDropdownGroup label="Time From" prefix="time_from" />
        <TimeDropdownGroup label="Time To" prefix="time_to" />

        <button style={styles.button} onClick={runReport} disabled={loading}>
          {loading ? "Loading..." : "Run Report"}
        </button>
      </div>

      <div style={styles.actionRow}>
        <button style={styles.printButton} onClick={printReport}>
          Print Report / Save PDF
        </button>

        <button style={styles.excelButton} onClick={exportExcel}>
          Export Excel
        </button>
      </div>

      <div style={styles.reportInfo}>
        <strong>Report:</strong>{" "}
        {selectedCustomer
          ? `${selectedCustomer.name} — ${selectedCustomer.customer_code}`
          : "All Customers"}{" "}
        | <strong>Order:</strong> {filters.order_id || "All"} |{" "}
        <strong>Date:</strong> {filters.date_from} to {filters.date_to} |{" "}
        <strong>Time:</strong> {timeRangeLabel}
      </div>

      <div style={styles.cards}>
        <SummaryCard
          label="Total Ticketed Tonnes"
          value={summary.totalTonnes.toFixed(2)}
        />
        <SummaryCard label="Number of Tickets" value={summary.ticketCount} />
        <SummaryCard label="First Load" value={summary.firstLoad} />
        <SummaryCard label="Last Load" value={summary.lastLoad} />
      </div>

      <Section title="Mix Breakdown">
        {allMixBreakdown.length > 0 && (
          <>
            <div style={styles.mixHeader}>
              <div style={styles.mixHelp}>
                Select or deselect products to update this report.
              </div>

              <div style={styles.mixActions}>
                <button style={styles.smallButton} onClick={selectAllMixes}>
                  Select All
                </button>
                <button style={styles.smallButtonGray} onClick={deselectAllMixes}>
                  Deselect All
                </button>
              </div>
            </div>

            <div style={styles.mixFilterRow}>
              {allMixBreakdown.map((m) => {
                const checked = !excludedMixes.includes(m.mix);

                return (
                  <label
                    key={m.mix}
                    style={{
                      ...styles.mixToggle,
                      ...(checked ? styles.mixToggleOn : styles.mixToggleOff),
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMix(m.mix)}
                    />
                    <span>{m.mix}</span>
                    <span style={styles.mixMini}>
                      {m.tonnes.toFixed(2)}t / {m.tickets}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <Table
          headers={["Mix", "Tonnes", "Tickets"]}
          rows={visibleMixBreakdown.map((m) => [
            m.mix,
            m.tonnes.toFixed(2),
            m.tickets,
          ])}
        />
      </Section>

      <Section title="Daily Breakdown">
        <Table
          headers={["Date", "Tonnes", "Tickets", "First Load", "Last Load"]}
          rows={dailyBreakdown.map((d) => [
            d.date,
            d.tonnes.toFixed(2),
            d.tickets,
            d.firstLoad,
            d.lastLoad,
          ])}
        />
      </Section>

      <Section title="Ticket List">
        <Table
          headers={[
            "Ticket",
            "Date",
            "Time",
            "Customer",
            "Order ID",
            "Location",
            "Mix",
            "Tonnes",
          ]}
          rows={visibleTickets.map((t) => [
            getTicketNo(t),
            t.load_date || "-",
            t.load_time || "-",
            getCustomerName(t),
            t.order_id || "-",
            getAddress(t),
            getMixName(t),
            getTonnes(t).toFixed(2),
          ])}
        />
      </Section>

      {hasRunReport && tickets.length === 0 && !loading && (
        <div style={styles.noResults}>
          No tickets found for this report. Try widening the date range or removing
          the customer/order filter.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={styles.cardValue}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {children}
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={styles.th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={styles.td} colSpan={headers.length}>
                No data found.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={styles.td}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  page: {
    padding: 24,
    fontFamily: "Arial, sans-serif",
    background: "#f4f4f5",
    minHeight: "100vh",
    color: "#111827",
  },

  header: {
    marginBottom: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },

  title: {
    margin: 0,
    fontSize: 32,
    color: "#111827",
  },

  subtitle: {
    marginTop: 6,
    color: "#4b5563",
  },

  backButton: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#ffffff",
    color: "#111827",
    fontWeight: "bold",
    cursor: "pointer",
  },

  filters: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    background: "#ffffff",
    color: "#111827",
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },

  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontWeight: "bold",
    color: "#111827",
  },

  input: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 16,
    background: "#ffffff",
    color: "#111827",
  },

  timeGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontWeight: "bold",
    color: "#111827",
  },

  timeLabel: {
    fontWeight: "bold",
    color: "#111827",
  },

  timeSelectRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 6,
  },

  timeSelect: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 16,
    background: "#ffffff",
    color: "#111827",
  },

  button: {
    alignSelf: "end",
    padding: "12px 16px",
    borderRadius: 8,
    border: "none",
    background: "#b91c1c",
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    cursor: "pointer",
  },

  actionRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 14,
  },

  printButton: {
    padding: "11px 16px",
    borderRadius: 8,
    border: "none",
    background: "#111827",
    color: "#ffffff",
    fontWeight: "bold",
    cursor: "pointer",
  },

  excelButton: {
    padding: "11px 16px",
    borderRadius: 8,
    border: "none",
    background: "#047857",
    color: "#ffffff",
    fontWeight: "bold",
    cursor: "pointer",
  },

  reportInfo: {
    background: "#ffffff",
    color: "#111827",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },

  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 20,
  },

  card: {
    background: "#ffffff",
    color: "#111827",
    padding: 16,
    borderRadius: 12,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },

  cardLabel: {
    color: "#6b7280",
    fontSize: 14,
  },

  cardValue: {
    fontSize: 28,
    fontWeight: "bold",
    marginTop: 6,
    color: "#111827",
  },

  section: {
    background: "#ffffff",
    color: "#111827",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
  },

  sectionTitle: {
    marginTop: 0,
    marginBottom: 14,
    color: "#111827",
  },

  mixHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    marginBottom: 12,
    flexWrap: "wrap",
  },

  mixHelp: {
    color: "#4b5563",
    fontSize: 14,
  },

  mixActions: {
    display: "flex",
    gap: 8,
  },

  smallButton: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "#111827",
    color: "#ffffff",
    fontWeight: "bold",
    cursor: "pointer",
  },

  smallButtonGray: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    color: "#111827",
    fontWeight: "bold",
    cursor: "pointer",
  },

  mixFilterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },

  mixToggle: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 12px",
    borderRadius: 999,
    fontWeight: "bold",
    cursor: "pointer",
    border: "1px solid #d1d5db",
  },

  mixToggleOn: {
    background: "#fef2f2",
    borderColor: "#b91c1c",
    color: "#7f1d1d",
  },

  mixToggleOff: {
    background: "#f3f4f6",
    color: "#6b7280",
    textDecoration: "line-through",
  },

  mixMini: {
    fontSize: 12,
    fontWeight: "normal",
    opacity: 0.85,
  },

  tableWrap: {
    overflowX: "auto",
    borderRadius: 10,
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#ffffff",
    color: "#111827",
  },

  th: {
    textAlign: "left",
    borderBottom: "2px solid #d1d5db",
    padding: 10,
    background: "#f3f4f6",
    color: "#111827",
    whiteSpace: "nowrap",
    fontWeight: "bold",
  },

  td: {
    borderBottom: "1px solid #e5e7eb",
    padding: 10,
    color: "#111827",
    background: "#ffffff",
    whiteSpace: "nowrap",
  },

  noResults: {
    background: "#fff7ed",
    color: "#9a3412",
    padding: 14,
    borderRadius: 10,
    fontWeight: "bold",
  },
};