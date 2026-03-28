import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDateTime(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`);
}

function formatLastLoad(dateValue, timeValue) {
  if (!dateValue && !timeValue) return "-";
  if (dateValue && timeValue) return `${dateValue} ${String(timeValue).slice(0, 5)}`;
  return dateValue || timeValue || "-";
}

export default function ManagerDashboard() {
  const today = useMemo(() => formatDateInput(new Date()), []);

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState(today);
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("18:00");
  const [sortBy, setSortBy] = useState("tonnes_desc");

  async function fetchJobs(showSpinner = false) {
    if (showSpinner) setLoading(true);

    const { data, error } = await supabase
      .from("manager_live_jobs")
      .select("*")
      .order("load_date", { ascending: false })
      .order("load_time", { ascending: false });

    if (error) {
      console.error("Error loading manager jobs:", error);
    } else {
      setJobs(data || []);
    }

    if (showSpinner) setLoading(false);
  }

  useEffect(() => {
    fetchJobs(true);

    const interval = setInterval(() => {
      fetchJobs(false);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const filteredJobs = useMemo(() => {
    if (!selectedDate || !startTime || !endTime) return jobs;

    const startDateTime = buildDateTime(selectedDate, startTime);

    let endDateTime = buildDateTime(selectedDate, endTime);
    const crossesMidnight = endTime <= startTime;

    if (crossesMidnight) {
      endDateTime.setDate(endDateTime.getDate() + 1);
    }

    return jobs.filter((job) => {
      if (!job.load_date || !job.load_time) return false;

      const cleanTime = String(job.load_time).slice(0, 5);
      const jobDateTime = buildDateTime(job.load_date, cleanTime);

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
          last_load_date: job.load_date || null,
          last_load_time: job.load_time || null,
        };
      }
      grouped[key].total_tonnes += Number(job.tonnes || 0);
      grouped[key].total_tickets += Number(job.tickets || 0);
      const existingDateTime = grouped[key].last_load_date && grouped[key].last_load_time
        ? buildDateTime(
            grouped[key].last_load_date,
            String(grouped[key].last_load_time).slice(0, 5)
          )
        : null;
      const currentDateTime = job.load_date && job.load_time
        ? buildDateTime(job.load_date, String(job.load_time).slice(0, 5))
        : null;
      if (!existingDateTime || (currentDateTime && currentDateTime > existingDateTime)) {
        grouped[key].last_load_date = job.load_date || null;
        grouped[key].last_load_time = job.load_time || null;
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
        const aDate = a.last_load_date && a.last_load_time
          ? buildDateTime(a.last_load_date, String(a.last_load_time).slice(0, 5))
          : new Date(0);

        const bDate = b.last_load_date && b.last_load_time
          ? buildDateTime(b.last_load_date, String(b.last_load_time).slice(0, 5))
          : new Date(0);

        return bDate - aDate;
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
      rowCount: groupedRows.length,
      totalTonnes,
      totalTickets,
    };
  }, [groupedRows]);

  function setPresetToday() {
    const now = new Date();
    setSelectedDate(formatDateInput(now));
    setStartTime("00:00");
    setEndTime("23:59");
  }

  function setPresetDayShift() {
    const now = new Date();
    setSelectedDate(formatDateInput(now));
    setStartTime("06:00");
    setEndTime("18:00");
  }

  function setPresetNightShift() {
    const now = new Date();
    setSelectedDate(formatDateInput(now));
    setStartTime("18:00");
    setEndTime("06:00");
  }

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: "0 0 16px 0" }}>Manager Live Mix Activity</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 16,
          padding: 16,
          border: "1px solid #444",
          borderRadius: 10,
        }}
      >
        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>
            Production Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>
            Start Time
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>
            End Time
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>
            Sort
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ width: "100%" }}
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

        <div style={{ display: "flex", alignItems: "end", gap: 8, flexWrap: "wrap" }}>
          <button onClick={setPresetToday}>Today</button>
          <button onClick={setPresetDayShift}>Day Shift</button>
          <button onClick={setPresetNightShift}>Night Shift</button>
          <button onClick={() => fetchJobs(false)}>Refresh</button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            padding: 14,
            border: "1px solid #444",
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>Rows</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.rowCount}</div>
        </div>

        <div
          style={{
            padding: 14,
            border: "1px solid #444",
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>Total Tonnes</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {summary.totalTonnes.toFixed(2)}
          </div>
        </div>

        <div
          style={{
            padding: 14,
            border: "1px solid #444",
            borderRadius: 10,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7 }}>Total Tickets</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.totalTickets}</div>
        </div>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            width="100%"
            border="1"
            cellPadding="8"
            style={{ borderCollapse: "collapse" }}
          >
            <thead>
              <tr>
                <th>Customer</th>
                <th>Order</th>
                <th>Mix</th>
                <th>Total Tonnes</th>
                <th>Total Tickets</th>
                <th>Last Load</th>
              </tr>
            </thead>

            <tbody>
              {groupedRows.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", padding: 20 }}>
                    No records found for selected filters.
                  </td>
                </tr>
              ) : (
                groupedRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.customer_name}</td>
                    <td>{row.order_id}</td>
                    <td>{row.mix}</td>
                    <td>{Number(row.total_tonnes || 0).toFixed(2)}</td>
                    <td>{row.total_tickets || 0}</td>
                    <td>{formatLastLoad(row.last_load_date, row.last_load_time)}</td>
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