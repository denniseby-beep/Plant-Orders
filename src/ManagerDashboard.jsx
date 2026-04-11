import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function buildDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  return new Date(`${dateStr}T${normalizeTime(timeStr)}:00`);
}

function formatLastLoad(dateValue, timeValue) {
  const cleanTime = normalizeTime(timeValue);
  if (!dateValue && !cleanTime) return "-";
  if (dateValue && cleanTime) return `${dateValue} ${cleanTime}`;
  return dateValue || cleanTime || "-";
}

function compareDateTimes(aDate, aTime, bDate, bTime) {
  const a = buildDateTime(aDate, aTime);
  const b = buildDateTime(bDate, bTime);

  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  return a.getTime() - b.getTime();
}

async function fetchAllManagerJobs() {
  const pageSize = 1000;
  let from = 0;
  let finished = false;
  let allRows = [];

  while (!finished) {
    const { data, error } = await supabase
      .from("manager_live_jobs")
      .select("*")
      .order("load_date", { ascending: false })
      .order("load_time", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const rows = data || [];
    allRows = allRows.concat(rows);

    if (rows.length < pageSize) {
      finished = true;
    } else {
      from += pageSize;
    }
  }

  return allRows;
}

export default function ManagerDashboard() {
  const today = useMemo(() => formatDateInput(new Date()), []);

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedDate, setSelectedDate] = useState(today);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");
  const [sortBy, setSortBy] = useState("tonnes_desc");

  async function fetchJobs(showSpinner = false) {
    try {
      setErrorMsg("");
      if (showSpinner) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const rows = await fetchAllManagerJobs();
      setJobs(rows);
      console.log("ManagerDashboard raw rows:", rows.length);
    } catch (error) {
      console.error("Error loading manager jobs:", error);
      setErrorMsg(error?.message || "Could not load manager data.");
      setJobs([]);
    } finally {
      if (showSpinner) setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchJobs(true);

    const interval = setInterval(() => {
      fetchJobs(false);
    }, 15000);

    const channel = supabase
      .channel("manager-live-jobs-refresh")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alkon_tickets" },
        () => {
          fetchJobs(false);
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredJobs = useMemo(() => {
    if (!selectedDate || !startTime || !endTime) {
      return jobs;
    }

    const startDateTime = buildDateTime(selectedDate, startTime);
    let endDateTime = buildDateTime(selectedDate, endTime);

    if (!startDateTime || !endDateTime) {
      return jobs;
    }

    const crossesMidnight = normalizeTime(endTime) < normalizeTime(startTime);

    if (crossesMidnight) {
      endDateTime = new Date(endDateTime);
      endDateTime.setDate(endDateTime.getDate() + 1);
    }

    return jobs.filter((job) => {
      if (!job.load_date || !job.load_time) return false;

      const jobDateTime = buildDateTime(job.load_date, job.load_time);
      if (!jobDateTime) return false;

      return jobDateTime >= startDateTime && jobDateTime <= endDateTime;
    });
  }, [jobs, selectedDate, startTime, endTime]);

  const groupedRows = useMemo(() => {
    const grouped = {};

    for (const job of filteredJobs) {
      const customerName = job.customer_name || job.customer_id || "UNKNOWN";
      const orderId = job.order_id || "-";
      const mix = job.mix || job.mix_type || "-";
      const key = `${customerName}__${orderId}__${mix}`;

      if (!grouped[key]) {
        grouped[key] = {
          key,
          customer_name: customerName,
          order_id: orderId,
          mix,
          total_tonnes: 0,
          total_tickets: 0,
          last_load_date: null,
          last_load_time: null,
        };
      }

      grouped[key].total_tonnes += Number(job.tonnes || 0);
      grouped[key].total_tickets += Number(job.tickets || 0);

      const existingCompare = compareDateTimes(
        grouped[key].last_load_date,
        grouped[key].last_load_time,
        job.load_date,
        job.load_time
      );

      if (
        !grouped[key].last_load_date ||
        !grouped[key].last_load_time ||
        existingCompare < 0
      ) {
        grouped[key].last_load_date = job.load_date || null;
        grouped[key].last_load_time = normalizeTime(job.load_time) || null;
      }
    }

    const rows = Object.values(grouped);

    rows.sort((a, b) => {
      if (sortBy === "customer_asc") {
        return a.customer_name.localeCompare(b.customer_name);
      }

      if (sortBy === "customer_desc") {
        return b.customer_name.localeCompare(a.customer_name);
      }

      if (sortBy === "tonnes_asc") {
        return a.total_tonnes - b.total_tonnes;
      }

      if (sortBy === "tickets_desc") {
        return b.total_tickets - a.total_tickets;
      }

      if (sortBy === "tickets_asc") {
        return a.total_tickets - b.total_tickets;
      }

      if (sortBy === "last_load_desc") {
        return compareDateTimes(
          b.last_load_date,
          b.last_load_time,
          a.last_load_date,
          a.last_load_time
        );
      }

      return b.total_tonnes - a.total_tonnes;
    });

    return rows;
  }, [filteredJobs, sortBy]);

  const summary = useMemo(() => {
    let totalTonnes = 0;
    let totalTickets = 0;

    for (const row of groupedRows) {
      totalTonnes += Number(row.total_tonnes || 0);
      totalTickets += Number(row.total_tickets || 0);
    }

    return {
      rawRows: jobs.length,
      filteredRows: filteredJobs.length,
      groupedRows: groupedRows.length,
      totalTonnes,
      totalTickets,
    };
  }, [jobs, filteredJobs, groupedRows]);

  function setPresetToday() {
  const now = new Date();
  setSelectedDate(formatDateInput(now));
  setStartTime("06:00");
  setEndTime("18:00");
}

function setPresetDayShift() {
  setStartTime("06:00");
  setEndTime("18:00");
}

function setPresetNightShift() {
  setStartTime("18:00");
  setEndTime("06:00");
}

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#041224",
      color: "#f8fafc",
      fontFamily: "Arial, sans-serif",
      padding: 20,
    },
    title: {
      margin: "0 0 16px 0",
      fontSize: 30,
      fontWeight: 900,
    },
    panel: {
      background: "#08182e",
      border: "1px solid #173052",
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    },
    filterGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      gap: 12,
      alignItems: "end",
    },
    label: {
      display: "block",
      marginBottom: 6,
      fontWeight: 800,
      color: "#dbeafe",
      fontSize: 13,
    },
    input: {
      width: "100%",
      boxSizing: "border-box",
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #314866",
      background: "#fff",
      color: "#111827",
      fontSize: 14,
    },
    buttonRow: {
      display: "flex",
      alignItems: "end",
      gap: 8,
      flexWrap: "wrap",
    },
    button: {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid #314866",
      background: "#0b1f3b",
      color: "#fff",
      fontWeight: 800,
      cursor: "pointer",
    },
    summaryGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 12,
      marginBottom: 16,
    },
    summaryCard: {
      background: "#08182e",
      border: "1px solid #173052",
      borderRadius: 16,
      padding: 16,
    },
    summaryLabel: {
      fontSize: 12,
      color: "#cbd5e1",
      marginBottom: 6,
    },
    summaryValue: {
      fontSize: 28,
      fontWeight: 900,
      color: "#fff",
    },
    tableWrap: {
      background: "#08182e",
      border: "1px solid #173052",
      borderRadius: 16,
      padding: 12,
      overflowX: "auto",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      minWidth: 760,
    },
    th: {
      textAlign: "left",
      padding: 10,
      borderBottom: "1px solid #173052",
      color: "#dbeafe",
      fontSize: 13,
    },
    td: {
      padding: 10,
      borderBottom: "1px solid #102747",
      color: "#fff",
      fontSize: 14,
      verticalAlign: "top",
    },
    empty: {
      textAlign: "center",
      padding: 20,
      color: "#cbd5e1",
    },
    subText: {
      color: "#93c5fd",
      fontSize: 12,
      marginTop: 6,
    },
    error: {
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      background: "#7f1d1d",
      border: "1px solid #ef4444",
      color: "#fff",
      fontWeight: 700,
    },
  };

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Manager Live Mix Activity</h2>

      <div style={styles.panel}>
        <div style={styles.filterGrid}>
          <div>
            <label style={styles.label}>Production Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>Sort</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={styles.input}
            >
              <option value="tonnes_desc">Tonnes Descending</option>
              <option value="tonnes_asc">Tonnes Ascending</option>
              <option value="customer_asc">Customer A-Z</option>
              <option value="customer_desc">Customer Z-A</option>
              <option value="tickets_desc">Tickets Descending</option>
              <option value="tickets_asc">Tickets Ascending</option>
              <option value="last_load_desc">Latest Load First</option>
            </select>
          </div>

          <div style={styles.buttonRow}>
            <button style={styles.button} onClick={setPresetToday}>
              Today
            </button>
            <button style={styles.button} onClick={setPresetDayShift}>
              Day Shift
            </button>
            <button style={styles.button} onClick={setPresetNightShift}>
              Night Shift
            </button>
            <button style={styles.button} onClick={() => fetchJobs(false)}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div style={styles.subText}>
          Source: manager_live_jobs view • Auto refresh every 15 seconds • Raw rows: {summary.rawRows} • Filtered rows: {summary.filteredRows}
        </div>

        {errorMsg ? <div style={styles.error}>{errorMsg}</div> : null}
      </div>

      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Grouped Rows</div>
          <div style={styles.summaryValue}>{summary.groupedRows}</div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Total Tonnes</div>
          <div style={styles.summaryValue}>{summary.totalTonnes.toFixed(2)}</div>
        </div>

        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Total Tickets</div>
          <div style={styles.summaryValue}>{summary.totalTickets}</div>
        </div>
      </div>

      {loading ? (
        <div style={styles.panel}>Loading...</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Customer</th>
                <th style={styles.th}>Order</th>
                <th style={styles.th}>Mix</th>
                <th style={styles.th}>Total Tonnes</th>
                <th style={styles.th}>Total Tickets</th>
                <th style={styles.th}>Last Load</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.length === 0 ? (
                <tr>
                  <td colSpan="6" style={styles.empty}>
                    No records found for selected filters.
                  </td>
                </tr>
              ) : (
                groupedRows.map((row) => (
                  <tr key={row.key}>
                    <td style={styles.td}>{row.customer_name}</td>
                    <td style={styles.td}>{row.order_id}</td>
                    <td style={styles.td}>{row.mix}</td>
                    <td style={styles.td}>
                      {Number(row.total_tonnes || 0).toFixed(2)}
                    </td>
                    <td style={styles.td}>{row.total_tickets || 0}</td>
                    <td style={styles.td}>
                      {formatLastLoad(row.last_load_date, row.last_load_time)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}