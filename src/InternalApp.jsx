// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import CustomerAccountManager from "./CustomerAccountManager";

/* ===========================================================
  SUPABASE TABLES / COLUMNS (minimum)
===========================================================
orders:
- id uuid/text PK
- created_at timestamptz
- updated_at timestamptz
- completed_at timestamptz
- cancelled_at timestamptz
- customer text
- mix_type text
- quantity_tonne numeric
- load_time text (HH:MM)  <-- stored as 24-hour string
- order_date date
- job_number text
- po_number text
- foreman text
- status text
- pail_of_colas boolean default false
- address text
- planned_13 int default 0
- planned_38 int default 0
- loaded_13 int default 0
- loaded_38 int default 0
- loaded_remainder_tonne numeric default 0

✅ NEW (Weather Call):
- weather_call boolean default false
- weather_call_time text (HH:MM) default ''

customers:
- name text UNIQUE
- is_active boolean default true

products:
- name text UNIQUE
- is_active boolean default true
*/

/* ==================== Storage keys ==================== */
const STORAGE_KEYS = {
  contractors: "plant_orders_contractors_v1",
  mixes: "plant_orders_mixes_v1",
  orders: "plant_orders_orders_v1",
  ui: "plant_orders_ui_v1",
  mixColors: "plant_orders_mix_colors_v1",
};

/* ==================== Defaults (local fallback only) ==================== */
const DEFAULTS = {
  quantityPresets: [1, 3, 5, 10, 13, 38],
  contractors: ["City Works", "Ridgeview Homes", "Highway Paving", "Westside Developments"],
  mixes: ["Mix 12.5", "Mix 19.0", "Mix 25.0"],
};

/* ==================== Truck sizes ==================== */
<<<<<<< HEAD
const LOAD_13 = 13.5; // tandem truck equivalent (updated)
const LOAD_38 = 38.5; // transfer truck equivalent (updated)
=======
const LOAD_13 = 13.8; // tandem truck equivalent
const LOAD_38 = 39; // T4 truck equivalent
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78

/* ==================== Status model ==================== */
const STATUS = {
  UNACK: "Unacknowledged",
  ACK: "Acknowledged",
  LOADED: "Loaded",
  COMPLETE: "Completed",
  CANCELLED: "Cancelled",
};
const STATUS_CYCLE = [STATUS.ACK, STATUS.LOADED, STATUS.COMPLETE];

/* ==================== Helpers ==================== */
function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_MIX_COLOR_PALETTE = [
  "#f87171", // red
  "#fb923c", // orange
  "#fbbf24", // yellow
  "#34d399", // green
  "#60a5fa", // blue
  "#a78bfa", // purple
  "#f472b6", // pink
  "#22d3ee", // teal
  "#a3e635", // lime
  "#f43f5e", // rose
];

function hashStringToNumber(s) {
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getDefaultColorForMix(mix) {
  const key = String(mix || "").trim() || "(No Mix)";
  const idx = hashStringToNumber(key) % DEFAULT_MIX_COLOR_PALETTE.length;
  return DEFAULT_MIX_COLOR_PALETTE[idx];
}

function addMinutesToHHMM(hhmm, minutesToAdd) {
  if (!hhmm || !hhmm.includes(":")) return "";
  const [hhStr, mmStr] = hhmm.split(":");
  let hh = parseInt(hhStr, 10);
  let mm = parseInt(mmStr, 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return "";

  let total = hh * 60 + mm + (minutesToAdd || 0);

  // keep within 0..1439 (wrap around)
  total = ((total % 1440) + 1440) % 1440;

  const outH = String(Math.floor(total / 60)).padStart(2, "0");
  const outM = String(total % 60).padStart(2, "0");
  return `${outH}:${outM}`;
}

function formatPrettyTime(hhmm) {
  if (!hhmm || !hhmm.includes(":")) return "";
  const [hhStr, mmStr] = hhmm.split(":");
  let hh = parseInt(hhStr, 10);
  const mm = String(parseInt(mmStr, 10)).padStart(2, "0");
  if (Number.isNaN(hh)) return "";

  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = ((hh + 11) % 12) + 1;
  return `${hour12}:${mm} ${ampm}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ==================== Print Job Ticket ====================
// Supports BOTH normalized app fields and raw DB fields.
function printOrderTicket(order) {
  // ---------- small helpers ----------
  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pick(o, keys, fallback = "") {
    for (const k of keys) {
      const v = o?.[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return fallback;
  }

  // "HH:MM" -> "h:MM AM/PM"
  function fmtTime12From24(hhmm) {
    if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return "";
    const [hhStr, mmStr] = hhmm.split(":");
    const hh = parseInt(hhStr, 10);
    const mm = parseInt(mmStr, 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
    const ampm = hh >= 12 ? "PM" : "AM";
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
  }

  // "HH:MM" + minutes -> "HH:MM"
  function addMinutesTo24(hhmm, addMin) {
    if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) return "";
    const [hhStr, mmStr] = hhmm.split(":");
    const hh = parseInt(hhStr, 10);
    const mm = parseInt(mmStr, 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return "";
    let total = hh * 60 + mm + (addMin || 0);
    total = ((total % 1440) + 1440) % 1440; // wrap
    const nh = Math.floor(total / 60);
    const nm = total % 60;
    return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
  }

  function prettyTimeWith24(hhmm) {
    if (!hhmm) return "";
    const t12 = fmtTime12From24(hhmm);
    return t12 ? `${t12} (${hhmm})` : hhmm;
  }

  // ---------- normalize fields ----------
  const customer = pick(order, ["customer"], "");
  const mix = pick(order, ["mixType", "mix_type", "mix"], "");
  const qtyRaw = pick(order, ["quantityTonne", "quantity_tonne", "quantity"], "");
  const qty = qtyRaw === "" ? "" : String(qtyRaw);

  const loadTime24 = pick(order, ["loadTime", "load_time"], "");
  const loadTimePrint = loadTime24 ? prettyTimeWith24(loadTime24) : "";

  const address = pick(order, ["address"], "");

  const designatedTimesRaw = pick(order, ["designatedStartTimes", "designated_start_times", "designated_times"], []);
  const designatedTimes = (Array.isArray(designatedTimesRaw) ? designatedTimesRaw : [])
    .map((item) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item === "object") return item.start_time || item.time || item.startTime || "";
      return "";
    })
    .filter((time) => time && String(time).includes(":"));

  const siteContact = pick(order, ["siteContactName", "site_contact_name"], "");
  const phone = pick(order, ["siteContactPhone", "site_contact_phone"], "");

  const jobNum = pick(order, ["jobNumber", "job_number"], "");
  const poNum = pick(order, ["poNumber", "po_number"], "");
  const foreman = pick(order, ["foreman"], "");

  const weatherCall = Boolean(pick(order, ["weatherCall", "weather_call"], false));
  const weatherCallTime24 = pick(order, ["weatherCallTime", "weather_call_time"], "");
  const weatherCallTimePrint = weatherCallTime24 ? prettyTimeWith24(weatherCallTime24) : "";

  const notes = pick(order, ["notes"], "");

  const trucksWorkingRaw = pick(order, ["trucksWorking", "trucks_working"], "");
  const staggerMinutesRaw = pick(order, ["staggerMinutes", "stagger_minutes"], "");

  const trucksWorking =
    trucksWorkingRaw === "" || trucksWorkingRaw == null ? 0 : Math.max(0, parseInt(trucksWorkingRaw, 10) || 0);
  const staggerMinutes =
    staggerMinutesRaw === "" || staggerMinutesRaw == null ? 0 : Math.max(0, parseInt(staggerMinutesRaw, 10) || 0);

  let startTimes = [];
  if (designatedTimes.length > 0) {
    startTimes = designatedTimes.slice(0, trucksWorking || designatedTimes.length);
  } else if (loadTime24 && trucksWorking > 0) {
    for (let i = 0; i < trucksWorking; i++) {
      startTimes.push(addMinutesTo24(loadTime24, i * staggerMinutes));
    }
  }

  const title = `Job Ticket - ${customer || "Order"}`;
  const nowStamp = new Date().toLocaleString();

  // ---------- HTML (IMPORTANT: everything is inside ONE backtick string) ----------
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      margin: 18px;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
    h1 { margin: 0 0 10px 0; font-size: 24px; letter-spacing: 0.2px; }
    .topbar { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px; }
    .smallTop { font-size: 12px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; margin-bottom: 12px; }
<<<<<<< HEAD
    .meta > *:first-child {
      max-width: 95%;
      word-break: break-word;
      overflow-wrap: break-word;
      overflow: auto;
    }
=======
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
    .box { border: 1px solid #111; padding: 10px; border-radius: 8px; }
    .label { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
    .value { font-size: 16px; font-weight: 700; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
    .full { grid-column: 1 / -1; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #111; padding: 8px; text-align: left; }
    th { background: #f2f2f2; }
    .small { font-size: 12px; font-weight: 500; }
    .notes { white-space: pre-wrap; font-weight: 500; }
    .footer { display:flex; justify-content:space-between; margin-top: 14px; font-size: 12px; }
    @media print {
      body { margin: 0.4in; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="smallTop">${escapeHtml(title)}</div>
    <div class="smallTop">${escapeHtml(window.location.origin)}</div>
  </div>

  <h1>Job Ticket</h1>

  <div class="meta">
    <div class="box">
      <div class="label">Customer</div>
      <div class="value">${escapeHtml(customer)}</div>
    </div>
    <div class="box">
      <div class="label">Mix</div>
      <div class="value">${escapeHtml(mix)}</div>
    </div>

    <div class="box">
      <div class="label">Quantity (tonnes)</div>
      <div class="value">${escapeHtml(qty)}</div>
    </div>
    <div class="box">
      <div class="label">Load Time</div>
      <div class="value">${escapeHtml(loadTimePrint)}</div>
    </div>

    <div class="box full">
      <div class="label">Address</div>
      <div class="value">${escapeHtml(address)}</div>
    </div>

    <div class="row full">
      <div class="box">
        <div class="label">Site Contact</div>
        <div class="value">${escapeHtml(siteContact)}</div>
      </div>
      <div class="box">
        <div class="label">Phone</div>
        <div class="value">${escapeHtml(phone)}</div>
      </div>
    </div>

    <div class="row full">
      <div class="box">
        <div class="label">Job #</div>
        <div class="value">${escapeHtml(jobNum)}</div>
      </div>
      <div class="box">
        <div class="label">PO #</div>
        <div class="value">${escapeHtml(poNum)}</div>
      </div>
    </div>

    <div class="box full">
      <div class="label">Foreman</div>
      <div class="value">${escapeHtml(foreman)}</div>
    </div>

    <div class="row full">
      <div class="box">
        <div class="label">Weather Call</div>
        <div class="value">${weatherCall ? "YES" : "NO"}</div>
      </div>
      <div class="box">
        <div class="label">Weather Call Time</div>
        <div class="value">${weatherCall ? escapeHtml(weatherCallTimePrint || "-") : "-"}</div>
      </div>
    </div>

    <div class="box full">
      <div class="label">Notes</div>
      <div class="value notes">${escapeHtml(notes)}</div>
    </div>

    <div class="box full">
      <div class="label">Truck Start Times</div>
      ${
        startTimes.length > 0
          ? `<table>
              <thead><tr><th>Truck #</th><th>Start Time</th></tr></thead>
              <tbody>
                ${startTimes
                  .map((t, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(prettyTimeWith24(t))}</td></tr>`)
                  .join("")}
              </tbody>
            </table>
            <div class="small" style="margin-top:6px;">
              Trucks working: ${trucksWorking}
              ${designatedTimes.length > 0 ? `• Designated times: ${designatedTimes.join(", ")}` : `• Stagger: ${staggerMinutes} minutes`}
            </div>`
          : `<div class="small">Enter “Trucks Working” and “Stagger Minutes” (or set designated times) on the order to print a truck time list.</div>`
      }
    </div>
  </div>

  <div class="footer">
    <div>1 of 1</div>
    <div>${escapeHtml(nowStamp)}</div>
  </div>

  <script>
    window.focus();
    window.print();
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=650");
  if (!w) {
    alert("Popup blocked. Allow popups for this site to print.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function normalizeStatus(s) {
  const v = String(s || "").trim().toLowerCase();
  if (v === "unacknowledged" || v === "unack") return STATUS.UNACK;
  if (v === "acknowledged" || v === "ack") return STATUS.ACK;
  if (v === "loaded") return STATUS.LOADED;
  if (v === "completed" || v === "complete") return STATUS.COMPLETE;
  if (v === "canceled" || v === "cancelled" || v === "cancel") return STATUS.CANCELLED;
  return STATUS.UNACK;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalISODate(d = new Date()) {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

function addDays(yyyyMmDd, delta) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toLocalISODate(dt);
}

function nowISO() {
  return new Date().toISOString();
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function minutesUntil(loadTimeHHmm, orderDateYYYYMMDD) {
  if (!loadTimeHHmm || !orderDateYYYYMMDD) return null;
  const [y, m, d] = orderDateYYYYMMDD.split("-").map((x) => Number(x));
  const [hh, mm] = loadTimeHHmm.split(":").map((x) => Number(x));
  if ([y, m, d, hh, mm].some((x) => Number.isNaN(x))) return null;
  const target = new Date(y, m - 1, d, hh, mm, 0, 0);
  const diffMs = target.getTime() - Date.now();
  return Math.round(diffMs / 60000);
}

function clampNumber(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.min(max, Math.max(min, x));
}

function clampInt(n, min, max) {
  const x = Number.parseInt(String(n), 10);
  if (!Number.isFinite(x)) return null;
  return Math.min(max, Math.max(min, x));
}

function cleanPatch(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/* ==================== Depletion math ==================== */
function loadedTonnes(o) {
  const l13 = Number(o.loaded13 || 0);
  const l38 = Number(o.loaded38 || 0);
  const remainder = Number(o.loadedRemainderTonne || 0);
  return l13 * LOAD_13 + l38 * LOAD_38 + remainder;
}

function remainingTonnes(o) {
  const qty = Number(o.quantityTonne || 0);
  return Math.max(0, qty - loadedTonnes(o));
}

function isNightLoad(loadTimeHHmm) {
  if (!loadTimeHHmm || typeof loadTimeHHmm !== "string" || !loadTimeHHmm.includes(":")) return false;
  const [hhRaw, mmRaw] = loadTimeHHmm.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;

  // Night window is 18:00 - 04:59 (inclusive)
  return hh >= 18 || hh < 5;
}

/* ==================== Supabase mapping ==================== */
function toDbOrder(o) {
  return {
    id: o.id,
    created_at: o.createdAt ?? null,
    updated_at: o.updatedAt ?? null,
    completed_at: o.completedAt ?? null,
    cancelled_at: o.cancelledAt ?? null,
    customer: o.customer ?? "",
    mix_type: o.mixType ?? "",
    quantity_tonne: o.quantityTonne ?? null,
    load_time: o.loadTime ?? "",
    order_date: o.orderDate ?? null,
    job_number: o.jobNumber ?? "",
    po_number: o.poNumber ?? "",
    foreman: o.foreman ?? "",
    status: o.status ?? STATUS.UNACK,
    pail_of_colas: Boolean(o.pailOfColas),
    address: o.address ?? "",
    planned_13: Number(o.planned13 ?? 0),
    planned_38: Number(o.planned38 ?? 0),
    loaded_13: Number(o.loaded13 ?? 0),
    loaded_38: Number(o.loaded38 ?? 0),
    loaded_remainder_tonne: Number(o.loadedRemainderTonne ?? 0),
    site_contact_name: o.siteContactName ?? "",
    site_contact_phone: o.siteContactPhone ?? "",
    notes: o.notes ?? "",
    trucks_working: o.trucksWorking ?? null,
    stagger_minutes: o.staggerMinutes ?? null,
    designated_start_times: o.designatedStartTimes ?? null,

    // Weather Call
    weather_call: Boolean(o.weatherCall),
    weather_call_time: o.weatherCallTime ?? "",
  };
}

function fromDbOrder(r) {
  const normalizedOrderDate = r.order_date
    ? String(r.order_date).slice(0, 10)
    : r.orderDate
      ? String(r.orderDate).slice(0, 10)
      : toLocalISODate();

  const qRaw = r.quantity_tonne ?? r.quantityTonne ?? r.quantity ?? r.Quantity ?? null;
  const qNum = qRaw === "" || qRaw == null ? null : Number(qRaw);

  return {
    id: r.id,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    completedAt: r.completed_at ?? null,
    cancelledAt: r.cancelled_at ?? null,

    customer: r.customer ?? "",
    mixType: r.mix_type ?? r.mixType ?? r["Mix Type"] ?? "",
    quantityTonne: Number.isFinite(qNum) ? qNum : null,

    loadTime: r.load_time ?? r.loadTime ?? "",
    orderDate: normalizedOrderDate,

    jobNumber: r.job_number ?? r.jobNumber ?? "",
    poNumber: r.po_number ?? r.poNumber ?? "",
    foreman: r.foreman ?? "",

    status: normalizeStatus(r.status),

    pailOfColas: Boolean(r.pail_of_colas ?? r.pailOfColas ?? false),
    address: r.address ?? "",

    planned13: Number(r.planned_13 ?? r.planned13 ?? 0),
    planned38: Number(r.planned_38 ?? r.planned38 ?? 0),
    loaded13: Number(r.loaded_13 ?? r.loaded13 ?? 0),
    loaded38: Number(r.loaded_38 ?? r.loaded38 ?? 0),
    loadedRemainderTonne: Number(r.loaded_remainder_tonne ?? r.loadedRemainderTonne ?? 0),

    // Weather Call
    weatherCall: Boolean(r.weather_call ?? r.weatherCall ?? false),
    weatherCallTime: String(r.weather_call_time ?? r.weatherCallTime ?? ""),

    // Ticket fields (make sure these DB columns exist)
    siteContactName: r.site_contact_name ?? r.siteContactName ?? "",
    siteContactPhone: r.site_contact_phone ?? r.siteContactPhone ?? "",
    notes: r.notes ?? "",
    trucksWorking: r.trucks_working ?? r.trucksWorking ?? "",
    staggerMinutes: r.stagger_minutes ?? r.staggerMinutes ?? "",
    designatedStartTimes:
      r.designated_start_times ??
      r.designatedStartTimes ??
      r.designated_times ??
      [],
  };
}

/* ==================== Time dropdown helpers ==================== */
function parseTimeParts(hhmm) {
  if (!hhmm || typeof hhmm !== "string" || !hhmm.includes(":")) {
    return { hour12: 7, minute: 0, ampm: "AM" };
  }
  const [hhRaw, mmRaw] = hhmm.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
    return { hour12: 7, minute: 0, ampm: "AM" };
  }
  const ampm = hh >= 12 ? "PM" : "AM";
  let hour12 = hh % 12;
  if (hour12 === 0) hour12 = 12;

  const snapped = Math.round(mm / 5) * 5;
  const minute = Math.max(0, Math.min(55, snapped === 60 ? 55 : snapped));

  return { hour12, minute, ampm };
}

function to24hHHMM(hour12, minute, ampm) {
  const h12 = Number(hour12);
  const m = Number(minute);
  if (!Number.isFinite(h12) || !Number.isFinite(m)) return "";
  const isPM = String(ampm).toUpperCase() === "PM";
  let h = h12 % 12;
  if (isPM) h += 12;
  return `${pad2(h)}:${pad2(m)}`;
}

/* ==================== On-screen Keyboard + NumPad ==================== */
function SmallKeyboard({ ui, darkMode, onKey }) {
  const keyStyle = {
    padding: "10px 0",
    borderRadius: 12,
    border: `1px solid ${ui.border}`,
    background: darkMode ? "#0f172a" : "#ffffff",
    color: ui.text,
    fontWeight: 900,
    cursor: "pointer",
    userSelect: "none",
    touchAction: "manipulation",
    fontSize: 13,
  };
  const keyWide = { ...keyStyle, padding: "10px 10px" };

  const row = (keys) => (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${keys.length}, 1fr)`, gap: 8 }}>
      {keys.map((k) => (
        <button key={k} style={keyStyle} type="button" onClick={() => onKey(k)}>
          {k}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ fontWeight: 950, marginBottom: 8 }}>Keyboard</div>
      {row(["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"])}
      <div style={{ height: 8 }} />
      {row(["A", "S", "D", "F", "G", "H", "J", "K", "L"])}
      <div style={{ height: 8 }} />
      {row(["Z", "X", "C", "V", "B", "N", "M"])}
      <div style={{ height: 10 }} />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr", gap: 8 }}>
        <button style={keyWide} type="button" onClick={() => onKey("SPACE")}>
          Space
        </button>
        <button style={keyWide} type="button" onClick={() => onKey("-")}>
          -
        </button>
        <button style={keyWide} type="button" onClick={() => onKey(".")}>
          .
        </button>
        <button style={keyWide} type="button" onClick={() => onKey("BACKSPACE")}>
          ⌫
        </button>
      </div>
      <div style={{ height: 8 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button style={keyWide} type="button" onClick={() => onKey("CLEAR")}>
          Clear Field
        </button>
        <button
          style={{ ...keyWide, background: ui.accent, borderColor: ui.accent, color: "#fff" }}
          type="button"
          onClick={() => onKey("ENTER")}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function NumberPad({ ui, darkMode, onKey }) {
  const keyStyle = {
    padding: "12px 0",
    borderRadius: 12,
    border: `1px solid ${ui.border}`,
    background: darkMode ? "#0f172a" : "#ffffff",
    color: ui.text,
    fontWeight: 950,
    fontSize: 16,
    cursor: "pointer",
    userSelect: "none",
    touchAction: "manipulation",
  };
  return (
    <div>
      <div style={{ fontWeight: 950, marginBottom: 8 }}>Number Pad</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} style={keyStyle} type="button" onClick={() => onKey(String(n))}>
            {n}
          </button>
        ))}
        <button style={keyStyle} type="button" onClick={() => onKey(".")}>
          .
        </button>
        <button style={keyStyle} type="button" onClick={() => onKey("0")}>
          0
        </button>
        <button style={keyStyle} type="button" onClick={() => onKey("BACKSPACE")}>
          ⌫
        </button>
      </div>
      <div style={{ height: 10 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button style={keyStyle} type="button" onClick={() => onKey("CLRNUM")}>
          Clear #
        </button>
        <button style={keyStyle} type="button" onClick={() => onKey("ENTER")}>
          Done
        </button>
      </div>
    </div>
  );
}

/* ==================== App ==================== */
<<<<<<< HEAD
export default function InternalApp({ access, role }) {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  const supabaseEnabled = Boolean(envUrl && envKey);
  const readOnly = role === "manager";
=======
export default function InternalApp() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  const supabaseEnabled = Boolean(envUrl && envKey);
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78

  const supabase = useMemo(() => {
    if (!supabaseEnabled) return null;
    return createClient(envUrl, envKey);
  }, [envUrl, envKey, supabaseEnabled]);

  // UI prefs
  const [darkMode, setDarkMode] = useState(false);
  const [bigMode, setBigMode] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  // Touch mode: enables the in-popup keyboard/numpad
  const [touchMode, setTouchMode] = useState(false);

  // Date selection
  const [selectedDate, setSelectedDate] = useState(toLocalISODate());
  const [showCompleted, setShowCompleted] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");

  // Local fallback pick lists (still saved locally)
  const [contractors, setContractors] = useState(DEFAULTS.contractors);
  const [mixes, setMixes] = useState(DEFAULTS.mixes);
  const [mixColors, setMixColors] = useState({});

  // Orders
  const [orders, setOrders] = useState([]);

  // Cloud lists (dropdown/datalist)
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    customer: "",
    mixType: "",
    quantityTonne: "",
    jobNumber: "",
    poNumber: "",
    foreman: "",
<<<<<<< HEAD
    loadTimes: [""], // Array of load times (truck staggers)
=======
    loadTime: "",
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
    orderDate: toLocalISODate(),
    pailOfColas: false,
    address: "",
    planned13: "",
    planned38: "",

    // Weather Call
    weatherCall: false,
    weatherCallTime: "",
  });

  // Edit modal
  const [editingId, setEditingId] = useState(null);
  const editingOrder = useMemo(
    () => orders.find((o) => o.id === editingId) || null,
    [orders, editingId]
  );
  const [editDraft, setEditDraft] = useState(null);

  // On-screen keyboard targeting (only used when touchMode ON)
  // { mode: "create"|"edit", field, type: "text"|"number"|"decimal" }
  const [kbTarget, setKbTarget] = useState(null);

  // Setup panel
  const [configOpen, setConfigOpen] = useState(false);
  const [newContractorName, setNewContractorName] = useState("");
  const [newMixName, setNewMixName] = useState("");

  // Cloud status
  const [cloudStatus, setCloudStatus] = useState(supabaseEnabled ? "Cloud: Ready" : "Cloud: OFF (missing env)");
  const [cloudError, setCloudError] = useState("");
  const syncingRef = useRef(false);

  /* -------------------- Theme + sizing -------------------- */
  const ui = useMemo(() => {
    const scale = bigMode ? 1.14 : compactMode ? 0.88 : 1.0;
    const card = darkMode ? "#111827" : "#ffffff";
    const bg = darkMode ? "#0b0f17" : "#f6f7fb";
    const text = darkMode ? "#e5e7eb" : "#0f172a";
    const muted = darkMode ? "#9ca3af" : "#64748b";
    const border = darkMode ? "#223047" : "#e5e7eb";
    const accent = "#2563eb";
    const ok = "#16a34a";
    const warn = "#f59e0b";
    const danger = "#dc2626";

    // Bright yellow highlight for weather call
    const weather = "#facc15";
    return { scale, card, bg, text, muted, border, accent, ok, warn, danger, weather };
  }, [darkMode, bigMode]);

  useEffect(() => {
    document.documentElement.style.background = ui.bg;
    document.body.style.background = ui.bg;
    document.body.style.margin = "0";
    document.body.style.color = ui.text;
    document.body.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
  }, [ui.bg, ui.text]);

  /* -------------------- Styles (6 columns; board spans col 2-6) -------------------- */
  const styles = useMemo(() => {
    return {
      page: {
        transform: `scale(${ui.scale})`,
        transformOrigin: "top left",
        padding: 12,
        display: "grid",
        gridTemplateColumns: "340px 1fr 1fr 1fr 1fr 1fr",
        gap: 12,
        alignItems: "start",
<<<<<<< HEAD
        minWidth: 0,
        boxSizing: "border-box",
      },
      sidebar: {
        gridColumn: "1",
        minWidth: "340px",
        maxWidth: "340px",
        width: "340px",
        overflow: "hidden",
        boxSizing: "border-box",
        background: ui.card,
      },
      
      ordersGrid: {
        gridColumn: "2 / span 5",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "auto",
      },
      searchInput: {
        width: "100%",
        minWidth: 0,
        maxWidth: "calc(100% - 16px)",
        boxSizing: "border-box",
        overflow: "hidden",
      },
      // ...existing code...
      card: {
        background: ui.card,
        // ...existing code...
        btnBigCreate: {
          width: "100%",
          padding: "14px 14px",
          borderRadius: 14,
          border: `1px solid ${ui.accent}`,
          background: ui.accent,
          color: "#fff",
          cursor: "pointer",
          fontWeight: 950,
          fontSize: 16,
          touchAction: "manipulation",
        },
        fontWeight: 700,
        touchAction: "manipulation",
      },
      // ...existing code...
=======
      },
      card: {
        background: ui.card,
        border: `1px solid ${ui.border}`,
        borderRadius: 14,
        padding: 12,
      },
      h1: { margin: "0 0 8px 0", fontSize: 20 },
      row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
      label: { fontSize: 12, color: ui.muted, marginBottom: 6 },
      input: {
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${ui.border}`,
        background: darkMode ? "#0f172a" : "#ffffff",
        color: ui.text,
        outline: "none",
        fontSize: 14,
      },
      btn: {
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${ui.border}`,
        background: darkMode ? "#0f172a" : "#ffffff",
        color: ui.text,
        cursor: "pointer",
        fontWeight: 700,
        touchAction: "manipulation",
      },
      btnPrimary: {
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${ui.accent}`,
        background: ui.accent,
        color: "#fff",
        cursor: "pointer",
        fontWeight: 900,
        touchAction: "manipulation",
      },
      btnDanger: {
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${ui.danger}`,
        background: ui.danger,
        color: "#fff",
        cursor: "pointer",
        fontWeight: 900,
        touchAction: "manipulation",
      },
      btnOk: {
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${ui.ok}`,
        background: ui.ok,
        color: "#fff",
        cursor: "pointer",
        fontWeight: 900,
        touchAction: "manipulation",
      },
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
      btnBigCreate: {
        width: "100%",
        padding: "14px 14px",
        borderRadius: 14,
        border: `1px solid ${ui.accent}`,
        background: ui.accent,
        color: "#fff",
        cursor: "pointer",
        fontWeight: 950,
        fontSize: 16,
        touchAction: "manipulation",
      },
<<<<<<< HEAD
=======
      orderCard: {
        background: ui.card,
        border: `2px solid ${ui.border}`,
        borderRadius: 14,
        padding: 8,
        width: "3in",
        height: "2in",
        boxSizing: "border-box",
        overflow: "auto",
        fontSize: 11,
      },
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
      divider: { height: 1, background: ui.border, margin: "10px 0" },
      pill: {
        padding: "4px 8px",
        borderRadius: 999,
        border: `1px solid ${ui.border}`,
        fontSize: 11,
        color: ui.muted,
        background: darkMode ? "#0f172a" : "#f8fafc",
      },
      pillWeather: {
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${ui.weather}`,
        fontSize: 12,
        color: "#111827",
        background: ui.weather,
        fontWeight: 950,
      },
      small: { fontSize: 10, color: ui.muted },
      btn: {
        padding: "8px 10px",
        borderRadius: 10,
        border: `1px solid ${ui.border}`,
        background: darkMode ? "#0f172a" : "#ffffff",
        color: ui.text,
        cursor: "pointer",
        fontWeight: 700,
        fontSize: 11,
        touchAction: "manipulation",
      },
      btnPrimary: {
        padding: "8px 10px",
        borderRadius: 10,
        border: `1px solid ${ui.accent}`,
        background: ui.accent,
        color: "#fff",
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 11,
        touchAction: "manipulation",
      },
      btnDanger: {
        padding: "8px 10px",
        borderRadius: 10,
        border: `1px solid ${ui.danger}`,
        background: ui.danger,
        color: "#fff",
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 11,
        touchAction: "manipulation",
      },
      btnOk: {
        padding: "8px 10px",
        borderRadius: 10,
        border: `1px solid ${ui.ok}`,
        background: ui.ok,
        color: "#fff",
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 11,
        touchAction: "manipulation",
      },
<<<<<<< HEAD
=======
      cloudBar: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${ui.border}`,
        background: darkMode ? "#0f172a" : "#f8fafc",
      },
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
      colHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "8px 10px",
        borderRadius: 12,
        border: `1px solid ${ui.border}`,
        background: darkMode ? "#0f172a" : "#f8fafc",
        fontWeight: 950,
      },
      listCol: { display: "flex", flexDirection: "column", gap: 10, minHeight: 200 },

      // Modals (always top)
      modalOverlay: {
        position: "fixed",
        inset: 0,
        background: "#00000088",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 16,
        paddingTop: 18,
<<<<<<< HEAD
        zIndex: 9999,
=======
        zIndex: 60,
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
        overflow: "auto",
      },
      modalCard: {
        width: "min(1100px, 100%)",
        background: ui.card,
<<<<<<< HEAD
        boxShadow: "0 8px 32px 0 rgba(0,0,0,0.35)",
        border: `2px solid #fff`,
        borderRadius: 16,
        padding: 16,
        position: "relative",
        outline: "4px solid #fff",
=======
        border: `1px solid ${ui.border}`,
        borderRadius: 16,
        padding: 16,
        position: "relative",
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
        marginTop: 6,
      },
      modalGrid: {
        display: "grid",
        gridTemplateColumns: touchMode ? "1.2fr 0.8fr" : "1fr",
        gap: 14,
        alignItems: "start",
      },
      modalKbPanel: {
        border: `1px solid ${ui.border}`,
        borderRadius: 14,
        padding: 12,
        background: darkMode ? "#0f172a" : "#f8fafc",
<<<<<<< HEAD
      }
=======
      },
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
    };
  }, [ui, darkMode, touchMode]);

  /* -------------------- TimePicker -------------------- */
  function TimePicker({ value, onChange }) {
    const parts = useMemo(() => parseTimeParts(value), [value]);
    const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
    const minutes = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);

    const selectStyle = {
      ...styles.input,
      appearance: "none",
      WebkitAppearance: "none",
      MozAppearance: "none",
      paddingRight: 28,
    };

    function setPart(next) {
      const hhmm = to24hHHMM(next.hour12, next.minute, next.ampm);
      onChange?.(hhmm);
    }

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <select
          style={selectStyle}
          value={parts.hour12}
          onChange={(e) => setPart({ ...parts, hour12: Number(e.target.value) })}
        >
          {hours.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <select
          style={selectStyle}
          value={parts.minute}
          onChange={(e) => setPart({ ...parts, minute: Number(e.target.value) })}
        >
          {minutes.map((m) => (
            <option key={m} value={m}>
              {pad2(m)}
            </option>
          ))}
        </select>

        <select
          style={selectStyle}
          value={parts.ampm}
          onChange={(e) => setPart({ ...parts, ampm: e.target.value })}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    );
  }

  /* -------------------- Persist local -------------------- */
  useEffect(() => {
    const savedContractors = safeJsonParse(localStorage.getItem(STORAGE_KEYS.contractors), null);
    const savedMixes = safeJsonParse(localStorage.getItem(STORAGE_KEYS.mixes), null);
    const savedOrders = safeJsonParse(localStorage.getItem(STORAGE_KEYS.orders), null);
    const savedUi = safeJsonParse(localStorage.getItem(STORAGE_KEYS.ui), null);

    if (Array.isArray(savedContractors) && savedContractors.length) setContractors(savedContractors);
    if (Array.isArray(savedMixes) && savedMixes.length) setMixes(savedMixes);
    if (Array.isArray(savedOrders)) setOrders(savedOrders);

    if (savedUi && typeof savedUi === "object") {
      if (typeof savedUi.darkMode === "boolean") setDarkMode(savedUi.darkMode);
      if (typeof savedUi.bigMode === "boolean") setBigMode(savedUi.bigMode);
      if (typeof savedUi.compactMode === "boolean") setCompactMode(savedUi.compactMode);
      if (typeof savedUi.selectedDate === "string") setSelectedDate(savedUi.selectedDate);
      if (typeof savedUi.showCompleted === "boolean") setShowCompleted(savedUi.showCompleted);
      if (typeof savedUi.showCancelled === "boolean") setShowCancelled(savedUi.showCancelled);
      if (typeof savedUi.orderSearch === "string") setOrderSearch(savedUi.orderSearch);
      if (typeof savedUi.touchMode === "boolean") setTouchMode(savedUi.touchMode);
    }

    const savedMixColors = safeJsonParse(localStorage.getItem(STORAGE_KEYS.mixColors), null);
    if (savedMixColors && typeof savedMixColors === "object") setMixColors(savedMixColors);
  }, []);

  useEffect(() => localStorage.setItem(STORAGE_KEYS.contractors, JSON.stringify(contractors)), [contractors]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.mixes, JSON.stringify(mixes)), [mixes]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.mixColors, JSON.stringify(mixColors)), [mixColors]);
  useEffect(() => localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders)), [orders]);
  useEffect(
    () =>
      localStorage.setItem(
        STORAGE_KEYS.ui,
        JSON.stringify({
          darkMode,
          bigMode,
          compactMode,
          selectedDate,
          showCompleted,
          showCancelled,
          orderSearch,
          touchMode,
        })
      ),
    [darkMode, bigMode, compactMode, selectedDate, showCompleted, showCancelled, orderSearch, touchMode]
  );

  /* -------------------- Cloud lists (Customers + Products) -------------------- */
  async function loadLists() {
    if (!supabase) return;

    const custRes = await supabase.from("customers").select("name, is_active").order("name");
    const prodRes = await supabase.from("products").select("name, is_active").order("name");

    if (!custRes.error) {
      const names = (custRes.data || [])
        .filter((r) => r.is_active === true || r.is_active == null)
        .map((r) => String(r.name || "").trim())
        .filter(Boolean);
      setCustomers(names);
    }

    if (!prodRes.error) {
      const names = (prodRes.data || [])
        .filter((r) => r.is_active === true || r.is_active == null)
        .map((r) => String(r.name || "").trim())
        .filter(Boolean);
      setProducts(names);
    }
  }

  async function ensureCustomerInDb(name) {
    if (!supabase) return;
    const n = String(name || "").trim();
    if (!n) return;
    const { error } = await supabase
      .from("customers")
      .upsert([{ name: n, is_active: true }], { onConflict: "name" });
    if (error) alert("Customer DB save failed: " + error.message);
  }

  async function ensureProductInDb(name) {
    if (!supabase) return;
    const n = String(name || "").trim();
    if (!n) return;
    const { error } = await supabase
      .from("products")
      .upsert([{ name: n, is_active: true }], { onConflict: "name" });
    if (error) alert("Product DB save failed: " + error.message);
  }

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* -------------------- Cloud pull + realtime -------------------- */
  async function cloudPull() {
    if (!supabase) {
      setCloudStatus("Cloud: OFF");
      return;
    }
    try {
      setCloudError("");
      setCloudStatus("Cloud: Pulling…");
      syncingRef.current = true;

      const { data, error } = await supabase.from("orders").select("*").order("created_at", {
        ascending: false,
      });
      if (error) throw error;

      const mapped = Array.isArray(data) ? data.map(fromDbOrder) : [];
      setOrders(mapped);
      setCloudStatus(`Cloud: Pulled ${mapped.length} rows`);
    } catch (e) {
      setCloudStatus("Cloud: Error");
      setCloudError(String(e?.message || e));
    } finally {
      syncingRef.current = false;
    }
  }

  async function cloudUpsert(orderObj) {
    if (!supabase) return false;
    try {
      setCloudError("");
      setCloudStatus("Cloud: Saving…");
      const payload = toDbOrder(orderObj);
      const { error } = await supabase.from("orders").upsert(payload, { onConflict: "id" });
      if (error) throw error;
      setCloudStatus("Cloud: Saved");
      return true;
    } catch (e) {
      setCloudStatus("Cloud: Error");
      setCloudError(String(e?.message || e));
      alert(
        "Cloud save failed. Most common cause is Supabase RLS blocking INSERT/UPDATE.\n\n" +
          (e?.message || "Unknown error")
      );
      return false;
    }
  }

  async function cloudUpdate(orderId, patchDbCols, patchLocalCamel) {
    const patchDb = cleanPatch(patchDbCols);
    const patchLocal = cleanPatch(patchLocalCamel);

    const before = orders;
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patchLocal } : o)));

    if (!supabase) return;

    try {
      setCloudError("");
      setCloudStatus("Cloud: Saving…");
      const { error } = await supabase.from("orders").update(patchDb).eq("id", orderId);
      if (error) throw error;
      setCloudStatus("Cloud: Saved");
    } catch (e) {
      setOrders(before);
      setCloudStatus("Cloud: Error");
      setCloudError(String(e?.message || e));
      alert(
        "Cloud update failed. Most common cause is Supabase RLS blocking UPDATE.\n\n" +
          (e?.message || "Unknown error")
      );
    }
  }

  useEffect(() => {
    if (supabase) cloudPull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("orders-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        if (!syncingRef.current) cloudPull();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseEnabled]);

  /* -------------------- Board filters -------------------- */
  const ordersForSelectedDate = useMemo(() => {
    const query = String(orderSearch || "").trim().toLowerCase();

    return orders
      .filter((o) => o.orderDate === selectedDate)
      .filter((o) => (showCompleted ? true : o.status !== STATUS.COMPLETE))
      .filter((o) => (showCancelled ? true : o.status !== STATUS.CANCELLED))
      .filter((o) => {
        if (!query) return true;
        const customer = String(o.customer || "").toLowerCase();
        const mix = String(o.mixType || "").toLowerCase();
        const job = String(o.jobNumber || "").toLowerCase();
        const po = String(o.poNumber || "").toLowerCase();
        const foreman = String(o.foreman || "").toLowerCase();
        return (
          customer.includes(query) ||
          mix.includes(query) ||
          job.includes(query) ||
          po.includes(query) ||
          foreman.includes(query)
        );
      })
      .sort((a, b) => {
        const tA = a.loadTime || "99:99";
        const tB = b.loadTime || "99:99";
        if (tA < tB) return -1;
        if (tA > tB) return 1;
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      });
  }, [orders, selectedDate, showCompleted, showCancelled, orderSearch]);

  const boardCols = useMemo(() => {
    const list = ordersForSelectedDate;
    return {
      unack: list.filter(
        (o) =>
          o.status === STATUS.UNACK ||
          (o.status === STATUS.CANCELLED && showCancelled)
      ),
      ack: list.filter((o) => o.status === STATUS.ACK),
      loaded: list.filter((o) => o.status === STATUS.LOADED),
      complete: list.filter((o) => o.status === STATUS.COMPLETE),
    };
  }, [ordersForSelectedDate, showCancelled]);

  /* -------------------- Dashboard math -------------------- */
  const remainingByMix = useMemo(() => {
    const map = new Map();
    for (const o of orders.filter((x) => x.orderDate === selectedDate)) {
      if (o.status === STATUS.CANCELLED) continue;
      if (o.status === STATUS.COMPLETE) continue;
      const mix = o.mixType || "(No Mix)";
      const qty = remainingTonnes(o);
      map.set(mix, (map.get(mix) || 0) + (Number.isFinite(qty) ? qty : 0));
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders, selectedDate]);

  const totalsForDate = useMemo(() => {
    let completed = 0;
    let pending = 0;
    for (const o of orders.filter((x) => x.orderDate === selectedDate)) {
      if (o.status === STATUS.CANCELLED) continue;
      const qty = Number(o.quantityTonne || 0);
      if (!Number.isFinite(qty)) continue;
      if (o.status === STATUS.COMPLETE) completed += qty;
      else pending += remainingTonnes(o);
    }
    return { total: completed + pending, completed, pending };
  }, [orders, selectedDate]);

  const shippedSoFarForDate = useMemo(() => {
    let shipped = 0;
    for (const o of orders.filter((x) => x.orderDate === selectedDate)) {
      if (o.status === STATUS.CANCELLED) continue;
      shipped += loadedTonnes(o);
    }
    return shipped;
  }, [orders, selectedDate]);

  function getMixColor(mix) {
    const key = String(mix || "").trim() || "(No Mix)";
    return mixColors[key] || getDefaultColorForMix(key);
  }

  function setMixColorFor(mix, color) {
    const key = String(mix || "").trim() || "(No Mix)";
    setMixColors((prev) => ({ ...prev, [key]: color }));
  }

  /* -------------------- Touch keyboard helpers -------------------- */
  function focusCreate(field, type = "text") {
    if (!touchMode) return;
    setKbTarget({ mode: "create", field, type });
  }
  function focusEdit(field, type = "text") {
    if (!touchMode) return;
    setKbTarget({ mode: "edit", field, type });
  }
  function focusSearch() {
    setKbTarget({ mode: "search", field: "orderSearch", type: "text" });
  }
  function clearKbTarget() {
    setKbTarget(null);
  }

  function getFieldPair(target) {
    if (!target) return null;
    const { mode, field } = target;

    if (mode === "create") {
      const v = createDraft?.[field] ?? "";
      const setter = (next) => setCreateDraft((d) => ({ ...d, [field]: next }));
      return [v, setter];
    }

    if (mode === "edit") {
      if (!editDraft) return null;
      const v = editDraft[field] ?? "";
      const setter = (next) => setEditDraft((d) => ({ ...d, [field]: next }));
      return [v, setter];
    }

    if (mode === "search") {
      const v = orderSearch;
      const setter = (next) => setOrderSearch(next);
      return [v, setter];
    }

    return null;
  }

  function sanitizeNumericAppend(cur, add, allowDecimal) {
    let s = String(cur ?? "");
    const c = String(add ?? "");

    if (c === "CLRNUM") return "";
    if (c === "BACKSPACE") return s.slice(0, -1);

    if (c === "." && !allowDecimal) return s;
    if (!/^\d$/.test(c) && c !== ".") return s;

    if (c === ".") {
      if (s.includes(".")) return s;
      if (s === "") return "0.";
      return s + ".";
    }

    return s + c;
  }

  function applyKey(key) {
    if (!kbTarget) return;

    const pair = getFieldPair(kbTarget);
    if (!pair) return;

    const [val, setVal] = pair;
    const cur = String(val ?? "");

    if (key === "ENTER") return;
    if (key === "CLEAR") {
      setVal("");
      return;
    }

    if (kbTarget.type === "number" || kbTarget.type === "decimal") {
      const allowDecimal = kbTarget.type === "decimal";
      const next = sanitizeNumericAppend(cur, key, allowDecimal);
      setVal(next);
      return;
    }

    if (key === "BACKSPACE") {
      setVal(cur.slice(0, -1));
      return;
    }
    if (key === "SPACE") {
      setVal(cur + " ");
      return;
    }
    if (key === "CLRNUM") return;

    setVal(cur + key);
  }

  function isActiveField(mode, field) {
    return kbTarget?.mode === mode && kbTarget?.field === field;
  }

  /* -------------------- Actions -------------------- */
  function upsertUnique(list, value) {
<<<<<<< HEAD
  const v = value.trim();
  if (!v) return list;
  if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return list;
  return [...list, v].sort((a, b) => a.localeCompare(b));
}

// Reset helper for Create form
function resetCreateDraft(dateOverride) {
  setCreateDraft({
    customer: "",
    mixType: "",
    quantityTonne: "",
    jobNumber: "",
    poNumber: "",
    foreman: "",
    loadTimes: [""],
    orderDate: dateOverride || selectedDate || toLocalISODate(),
    pailOfColas: false,
    address: "",
    planned13: "",
    planned38: "",

    // Weather Call
    weatherCall: false,
    weatherCallTime: "",
  });
}

function copyOrder(orderId) {
  if (readOnly) return;

=======
    const v = value.trim();
    if (!v) return list;
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return list;
    return [...list, v].sort((a, b) => a.localeCompare(b));
  }

  // Reset helper for Create form
  function resetCreateDraft(dateOverride) {
    setCreateDraft({
      customer: "",
      mixType: "",
      quantityTonne: "",
      jobNumber: "",
      poNumber: "",
      foreman: "",
      loadTime: "",
      orderDate: dateOverride || selectedDate || toLocalISODate(),
      pailOfColas: false,
      address: "",
      planned13: "",
      planned38: "",

      // Weather Call
      weatherCall: false,
      weatherCallTime: "",
    });
  }

  function copyOrder(orderId) {
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
  const o = orders.find((x) => x.id === orderId);
  if (!o) return;

  setCreateDraft({
    customer: o.customer || "",
    mixType: o.mixType || "",
    quantityTonne: String(o.quantityTonne || ""),
    jobNumber: o.jobNumber || "",
    poNumber: o.poNumber || "",
    foreman: o.foreman || "",
<<<<<<< HEAD
    loadTimes: o.loadTimes || [o.loadTime || ""],
=======
    loadTime: o.loadTime || "",
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
    orderDate: selectedDate || toLocalISODate(),
    pailOfColas: Boolean(o.pailOfColas),
    address: o.address || "",
    planned13: String(o.planned13 || ""),
    planned38: String(o.planned38 || ""),

    // weather call
    weatherCall: Boolean(o.weatherCall),
    weatherCallTime: o.weatherCallTime || "",
  });

  setCreateOpen(true);
}

<<<<<<< HEAD
function openCreateModal() {
  if (readOnly) return;

  resetCreateDraft(selectedDate || toLocalISODate());
  setCreateOpen(true);
  if (touchMode) setKbTarget({ mode: "create", field: "customer", type: "text" });
}

function closeCreateModal() {
  setCreateOpen(false);
  resetCreateDraft(selectedDate || toLocalISODate());
  clearKbTarget();
}

async function postCreateOrder() {
  if (readOnly) return;

  const cust = String(createDraft.customer || "").trim();
  const mix = String(createDraft.mixType || "").trim();
  const qty = clampNumber(createDraft.quantityTonne, 0.01, 999999);
  const lts = (Array.isArray(createDraft.loadTimes) ? createDraft.loadTimes : []).map(String).filter(Boolean);

  if (!cust || !mix || !qty || lts.length === 0) {
    alert("Missing required fields: Customer, Mix Type, Quantity (Tonne), at least one Load Time");
    return;
  }

  await ensureCustomerInDb(cust);
  await ensureProductInDb(mix);

  setContractors((prev) => upsertUnique(prev, cust));
  setMixes((prev) => upsertUnique(prev, mix));

  const p13 = clampInt(createDraft.planned13 || 0, 0, 9999) ?? 0;
  const p38 = clampInt(createDraft.planned38 || 0, 0, 9999) ?? 0;

  const wc = Boolean(createDraft.weatherCall);
  const wcTime = wc ? String(createDraft.weatherCallTime || lts[0] || "07:00") : "";

  const newOrder = {
    id: uid(),
    customer: cust,
    mixType: mix,
    quantityTonne: qty,
    loadTimes: lts,
    loadTime: lts[0] || "",
    orderDate: createDraft.orderDate || selectedDate,
    jobNumber: String(createDraft.jobNumber || "").trim(),
    poNumber: String(createDraft.poNumber || "").trim(),
    foreman: String(createDraft.foreman || "").trim(),
    status: STATUS.UNACK,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    completedAt: null,
    cancelledAt: null,
    pailOfColas: Boolean(createDraft.pailOfColas),
    address: String(createDraft.address || "").trim(),
    planned13: p13,
    planned38: p38,
    loaded13: 0,
    loaded38: 0,
    loadedRemainderTonne: 0,
    weatherCall: wc,
    weatherCallTime: wcTime,
  };

  setOrders((prev) => [newOrder, ...prev]);

  const ok = await cloudUpsert(newOrder);
  if (!ok) return;

  loadLists();
  resetCreateDraft(createDraft.orderDate || selectedDate || toLocalISODate());
  setCreateOpen(false);
  clearKbTarget();
}

async function cycleStatus(orderId) {
  if (readOnly) return;

  const target = orders.find((o) => o.id === orderId);
  if (!target) return;
  if (target.status === STATUS.CANCELLED) return;

  let next;
  if (target.status === STATUS.UNACK) next = STATUS.ACK;
  else {
    const idx = STATUS_CYCLE.indexOf(target.status);
    next = STATUS_CYCLE[Math.min(idx + 1, STATUS_CYCLE.length - 1)] || STATUS.COMPLETE;
  }

  const now = nowISO();

  const patchDb = {
    status: next,
    updated_at: now,
    completed_at: next === STATUS.COMPLETE ? now : null,
  };

  const patchLocal = {
    status: next,
    updatedAt: now,
    completedAt: next === STATUS.COMPLETE ? now : null,
  };

  if (next === STATUS.COMPLETE) {
    const qty = Number(target.quantityTonne || 0);
    const alreadyLoaded = loadedTonnes(target);
    const remaining = Math.max(0, qty - alreadyLoaded);

    if (remaining > 0.0001) {
      const currentRem = Number(target.loadedRemainderTonne || 0);
      const nextRem = currentRem + remaining;

      patchDb.loaded_remainder_tonne = nextRem;
      patchLocal.loadedRemainderTonne = nextRem;
    }
  }

  await cloudUpdate(orderId, patchDb, patchLocal);
}

async function recallOrder(orderId) {
  if (readOnly) return;

  const target = orders.find((o) => o.id === orderId);
  if (!target) return;

  if (target.status === STATUS.COMPLETE) {
    const now = nowISO();
    await cloudUpdate(
      orderId,
      { status: STATUS.LOADED, updated_at: now, completed_at: null },
      { status: STATUS.LOADED, updatedAt: now, completedAt: null }
    );
    return;
  }

  if (target.status === STATUS.CANCELLED) {
    const now = nowISO();
    await cloudUpdate(
      orderId,
      { status: STATUS.UNACK, cancelled_at: null, updated_at: now },
      { status: STATUS.UNACK, cancelledAt: null, updatedAt: now }
    );

    if (typeof setMessage === "function") {
      setMessage(`Cancelled order ${target.customer || ""} has been returned to unack list.`);
    }
    return;
  }
}

async function cancelOrder(orderId) {
  if (readOnly) return;

  if (!confirm("Cancel this order?")) return;
  const now = nowISO();

  await cloudUpdate(
    orderId,
    { status: STATUS.CANCELLED, cancelled_at: now, updated_at: now },
    { status: STATUS.CANCELLED, cancelledAt: now, updatedAt: now }
  );
}

async function maybeAddMoreMix(order, neededTonnes) {
  if (readOnly) return { ok: false, added: 0 };

  const rem = remainingTonnes(order);
  if (rem >= neededTonnes) return { ok: true, added: 0 };

  const yes = confirm(
    `Remaining is ${rem.toFixed(2)} T.\nLoading ${neededTonnes} T will exceed remaining.\n\nDo you want to add more mix to this order?`
  );
  if (!yes) return { ok: false, added: 0 };

  const suggested = Math.max(neededTonnes - rem, 0);
  const input = prompt("How many tonnes do you want to add?", suggested ? String(suggested) : "");
  if (input == null) return { ok: false, added: 0 };

  const addT = clampNumber(input, 0.01, 999999);
  if (!addT) {
    alert("Invalid tonnes amount.");
    return { ok: false, added: 0 };
  }

  const now = nowISO();
  const newQty = Number(order.quantityTonne || 0) + addT;

  await cloudUpdate(
    order.id,
    {
      quantity_tonne: newQty,
      updated_at: now,
      status: order.status === STATUS.COMPLETE ? STATUS.LOADED : order.status,
      completed_at: null,
    },
    {
      quantityTonne: newQty,
      updatedAt: now,
      status: order.status === STATUS.COMPLETE ? STATUS.LOADED : order.status,
      completedAt: null,
    }
  );

  return { ok: true, added: addT };
}

async function applyLoad(orderId, tonnes) {
  if (readOnly) return;

  const order = orders.find((o) => o.id === orderId);
  if (!order) return;
  if (order.status === STATUS.CANCELLED) return;

  const gate = await maybeAddMoreMix(order, tonnes);
  if (!gate.ok) return;

  const fresh = orders.find((o) => o.id === orderId) || order;

  let nextLoaded13 = Number(fresh.loaded13 || 0);
  let nextLoaded38 = Number(fresh.loaded38 || 0);

  if (tonnes === LOAD_13) nextLoaded13 += 1;
  if (tonnes === LOAD_38) nextLoaded38 += 1;

  const now = nowISO();
  const temp = { ...fresh, loaded13: nextLoaded13, loaded38: nextLoaded38 };
  const rem = remainingTonnes(temp);

  let nextStatus = fresh.status;
  let nextCompletedAt = fresh.completedAt ?? null;

  if (nextStatus === STATUS.UNACK) nextStatus = STATUS.ACK;

  if (rem <= 0) {
    nextStatus = STATUS.COMPLETE;
    nextCompletedAt = now;
  } else {
    if (nextStatus === STATUS.COMPLETE) nextStatus = STATUS.LOADED;
    nextCompletedAt = null;
  }

  await cloudUpdate(
    orderId,
    {
      loaded_13: nextLoaded13,
      loaded_38: nextLoaded38,
      status: nextStatus,
      updated_at: now,
      completed_at: nextStatus === STATUS.COMPLETE ? nextCompletedAt : null,
    },
    {
      loaded13: nextLoaded13,
      loaded38: nextLoaded38,
      status: nextStatus,
      updatedAt: now,
      completedAt: nextStatus === STATUS.COMPLETE ? nextCompletedAt : null,
    }
  );
}

async function applyLoadCustom(orderId) {
  if (readOnly) return;

  const order = orders.find((o) => o.id === orderId);
  if (!order) return;
  if (order.status === STATUS.CANCELLED) return;

  const raw = prompt("Enter custom load weight in tonnes (e.g. 12.5):", "");
  if (raw == null) return;

  const tonnes = Number(raw);
  if (!Number.isFinite(tonnes) || tonnes <= 0) {
    alert("Invalid weight. Enter a number greater than 0.");
    return;
  }

  const gate = await maybeAddMoreMix(order, tonnes);
  if (!gate.ok) return;

  const fresh = orders.find((o) => o.id === orderId) || order;
  const nextLoaded13 = Number(fresh.loaded13 || 0);
  const nextLoaded38 = Number(fresh.loaded38 || 0);
  const nextLoadedRemainder = Number(fresh.loadedRemainderTonne || 0) + tonnes;

  const now = nowISO();
  const temp = {
    ...fresh,
    loaded13: nextLoaded13,
    loaded38: nextLoaded38,
    loadedRemainderTonne: nextLoadedRemainder,
  };
  const rem = remainingTonnes(temp);

  let nextStatus = fresh.status;
  let nextCompletedAt = fresh.completedAt ?? null;

  if (nextStatus === STATUS.UNACK) nextStatus = STATUS.ACK;

  if (rem <= 0) {
    nextStatus = STATUS.COMPLETE;
    nextCompletedAt = now;
  } else {
    if (nextStatus === STATUS.COMPLETE) nextStatus = STATUS.LOADED;
    nextCompletedAt = null;
  }

  await cloudUpdate(
    orderId,
    {
      loaded_13: nextLoaded13,
      loaded_38: nextLoaded38,
      loaded_remainder_tonne: nextLoadedRemainder,
      status: nextStatus,
      updated_at: now,
      completed_at: nextStatus === STATUS.COMPLETE ? nextCompletedAt : null,
    },
    {
      loaded13: nextLoaded13,
      loaded38: nextLoaded38,
      loadedRemainderTonne: nextLoadedRemainder,
      status: nextStatus,
      updatedAt: now,
      completedAt: nextStatus === STATUS.COMPLETE ? nextCompletedAt : null,
    }
  );
}

function startEdit(orderId) {
  if (readOnly) return;

  const o = orders.find((x) => x.id === orderId);
  if (!o) return;

  setEditingId(orderId);
  setEditDraft({
    customer: o.customer || "",
    mixType: o.mixType || "",
    quantityTonne: String(o.quantityTonne ?? ""),
    loadTime: o.loadTime || "",
    orderDate: o.orderDate || toLocalISODate(),
    jobNumber: o.jobNumber || "",
    poNumber: o.poNumber || "",
    foreman: o.foreman || "",
    pailOfColas: Boolean(o.pailOfColas),
    address: o.address || "",
    planned13: String(o.planned13 ?? 0),
    planned38: String(o.planned38 ?? 0),

    // Weather Call
    weatherCall: Boolean(o.weatherCall),
    weatherCallTime: String(o.weatherCallTime || ""),
  });

  if (touchMode) setKbTarget({ mode: "edit", field: "customer", type: "text" });
}

async function saveEdit() {
  if (readOnly) return;
  if (!editingId || !editDraft) return;

  const cust = String(editDraft.customer || "").trim();
  const mix = String(editDraft.mixType || "").trim();
  const qty = clampNumber(editDraft.quantityTonne, 0.01, 999999);
  const lt = String(editDraft.loadTime || "");

  if (!cust || !mix || !qty || !lt) {
    alert("Missing required fields: Customer, Mix Type, Quantity (Tonne), Load Time");
    return;
  }

  await ensureCustomerInDb(cust);
  await ensureProductInDb(mix);

  setContractors((prev) => upsertUnique(prev, cust));
  setMixes((prev) => upsertUnique(prev, mix));

  const p13 = clampInt(editDraft.planned13 || 0, 0, 9999) ?? 0;
  const p38 = clampInt(editDraft.planned38 || 0, 0, 9999) ?? 0;

  const wc = Boolean(editDraft.weatherCall);
  const wcTime = wc ? String(editDraft.weatherCallTime || editDraft.loadTime || "07:00") : "";

  const now = nowISO();
  const existing = orders.find((o) => o.id === editingId);
  const willReopen =
    existing && existing.status === STATUS.COMPLETE && qty > loadedTonnes(existing);

  await cloudUpdate(
    editingId,
    {
      customer: cust,
      mix_type: mix,
      quantity_tonne: qty,
      load_time: lt,
      order_date: editDraft.orderDate || toLocalISODate(),
      job_number: String(editDraft.jobNumber || "").trim(),
      po_number: String(editDraft.poNumber || "").trim(),
      foreman: String(editDraft.foreman || "").trim(),
      updated_at: now,
      pail_of_colas: Boolean(editDraft.pailOfColas),
      address: String(editDraft.address || "").trim(),
      planned_13: p13,
      planned_38: p38,
      weather_call: wc,
      weather_call_time: wcTime,
      status: willReopen ? STATUS.LOADED : undefined,
      completed_at: willReopen ? null : undefined,
    },
    {
=======
  function openCreateModal() {
    resetCreateDraft(selectedDate || toLocalISODate());
    setCreateOpen(true);
    if (touchMode) setKbTarget({ mode: "create", field: "customer", type: "text" });
  }

  function closeCreateModal() {
    setCreateOpen(false);
    resetCreateDraft(selectedDate || toLocalISODate());
    clearKbTarget();
  }

  async function postCreateOrder() {
    const cust = String(createDraft.customer || "").trim();
    const mix = String(createDraft.mixType || "").trim();
    const qty = clampNumber(createDraft.quantityTonne, 0.01, 999999);
    const lt = String(createDraft.loadTime || "");

    if (!cust || !mix || !qty || !lt) {
      alert("Missing required fields: Customer, Mix Type, Quantity (Tonne), Load Time");
      return;
    }

    await ensureCustomerInDb(cust);
    await ensureProductInDb(mix);

    setContractors((prev) => upsertUnique(prev, cust));
    setMixes((prev) => upsertUnique(prev, mix));

    const p13 = clampInt(createDraft.planned13 || 0, 0, 9999) ?? 0;
    const p38 = clampInt(createDraft.planned38 || 0, 0, 9999) ?? 0;

    // Weather Call: auto-heal time if checked
    const wc = Boolean(createDraft.weatherCall);
    const wcTime = wc ? String(createDraft.weatherCallTime || createDraft.loadTime || "07:00") : "";

    const newOrder = {
      id: uid(),
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
      customer: cust,
      mixType: mix,
      quantityTonne: qty,
      loadTime: lt,
<<<<<<< HEAD
      orderDate: editDraft.orderDate || toLocalISODate(),
      jobNumber: String(editDraft.jobNumber || "").trim(),
      poNumber: String(editDraft.poNumber || "").trim(),
      foreman: String(editDraft.foreman || "").trim(),
      updatedAt: now,
      pailOfColas: Boolean(editDraft.pailOfColas),
      address: String(editDraft.address || "").trim(),
      planned13: p13,
      planned38: p38,
      weatherCall: wc,
      weatherCallTime: wcTime,
      ...(willReopen ? { status: STATUS.LOADED, completedAt: null } : {}),
    }
  );

  setEditingId(null);
  setEditDraft(null);
  clearKbTarget();
  loadLists();
}

function closeEdit() {
  setEditingId(null);
  setEditDraft(null);
  clearKbTarget();
}

async function addContractor() {
  if (readOnly) return;

  const name = newContractorName.trim();
  if (!name) return;
  if (!supabase) return alert("Supabase OFF (missing env vars).");

  const { error } = await supabase
    .from("customers")
    .insert([{ name, is_active: true }])
    .select();

  if (error) return alert("Customer insert failed: " + error.message);

  setContractors((prev) => upsertUnique(prev, name));
  setNewContractorName("");
  loadLists();
}
=======
      orderDate: createDraft.orderDate || selectedDate,
      jobNumber: String(createDraft.jobNumber || "").trim(),
      poNumber: String(createDraft.poNumber || "").trim(),
      foreman: String(createDraft.foreman || "").trim(),
      status: STATUS.UNACK,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      completedAt: null,
      cancelledAt: null,
      pailOfColas: Boolean(createDraft.pailOfColas),
      address: String(createDraft.address || "").trim(),
      planned13: p13,
      planned38: p38,
      loaded13: 0,
      loaded38: 0,
      loadedRemainderTonne: 0,

      // Weather Call
      weatherCall: wc,
      weatherCallTime: wcTime,
    };

    setOrders((prev) => [newOrder, ...prev]);

    const ok = await cloudUpsert(newOrder);
    if (!ok) return;

    loadLists();

    // clear form after successful post
    resetCreateDraft(createDraft.orderDate || selectedDate || toLocalISODate());
    setCreateOpen(false);
    clearKbTarget();
  }

  async function cycleStatus(orderId) {
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;
    if (target.status === STATUS.CANCELLED) return;

    let next;
    if (target.status === STATUS.UNACK) next = STATUS.ACK;
    else {
      const idx = STATUS_CYCLE.indexOf(target.status);
      next = STATUS_CYCLE[Math.min(idx + 1, STATUS_CYCLE.length - 1)] || STATUS.COMPLETE;
    }

    const now = nowISO();

    const patchDb = {
      status: next,
      updated_at: now,
      completed_at: next === STATUS.COMPLETE ? now : null,
    };
    const patchLocal = {
      status: next,
      updatedAt: now,
      completedAt: next === STATUS.COMPLETE ? now : null,
    };

    if (next === STATUS.COMPLETE) {
      const qty = Number(target.quantityTonne || 0);
      const alreadyLoaded = loadedTonnes(target);
      const remaining = Math.max(0, qty - alreadyLoaded);

      if (remaining > 0.0001) {
        const currentRem = Number(target.loadedRemainderTonne || 0);
        const nextRem = currentRem + remaining;

        patchDb.loaded_remainder_tonne = nextRem;
        patchLocal.loadedRemainderTonne = nextRem;
      }
    }

    await cloudUpdate(orderId, patchDb, patchLocal);
  }

  async function recallOrder(orderId) {
    const target = orders.find((o) => o.id === orderId);
    if (!target) return;

    if (target.status === STATUS.COMPLETE) {
      const now = nowISO();
      await cloudUpdate(
        orderId,
        { status: STATUS.LOADED, updated_at: now, completed_at: null },
        { status: STATUS.LOADED, updatedAt: now, completedAt: null }
      );
      return;
    }

    if (target.status === STATUS.CANCELLED) {
      const now = nowISO();
      await cloudUpdate(
        orderId,
        { status: STATUS.UNACK, cancelled_at: null, updated_at: now },
        { status: STATUS.UNACK, cancelledAt: null, updatedAt: now }
      );

      setMessage(`Cancelled order ${target.customer || ""} has been returned to unack list.`);
      return;
    }

    return;
  }

  async function cancelOrder(orderId) {
    if (!confirm("Cancel this order?")) return;
    const now = nowISO();
    await cloudUpdate(
      orderId,
      { status: STATUS.CANCELLED, cancelled_at: now, updated_at: now },
      { status: STATUS.CANCELLED, cancelledAt: now, updatedAt: now }
    );
  }

  async function maybeAddMoreMix(order, neededTonnes) {
    const rem = remainingTonnes(order);
    if (rem >= neededTonnes) return { ok: true, added: 0 };

    const yes = confirm(
      `Remaining is ${rem.toFixed(2)} T.\nLoading ${neededTonnes} T will exceed remaining.\n\nDo you want to add more mix to this order?`
    );
    if (!yes) return { ok: false, added: 0 };

    const suggested = Math.max(neededTonnes - rem, 0);
    const input = prompt("How many tonnes do you want to add?", suggested ? String(suggested) : "");
    if (input == null) return { ok: false, added: 0 };

    const addT = clampNumber(input, 0.01, 999999);
    if (!addT) {
      alert("Invalid tonnes amount.");
      return { ok: false, added: 0 };
    }

    const now = nowISO();
    const newQty = Number(order.quantityTonne || 0) + addT;

    await cloudUpdate(
      order.id,
      {
        quantity_tonne: newQty,
        updated_at: now,
        status: order.status === STATUS.COMPLETE ? STATUS.LOADED : order.status,
        completed_at: null,
      },
      {
        quantityTonne: newQty,
        updatedAt: now,
        status: order.status === STATUS.COMPLETE ? STATUS.LOADED : order.status,
        completedAt: null,
      }
    );

    return { ok: true, added: addT };
  }

  async function applyLoad(orderId, tonnes) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.status === STATUS.CANCELLED) return;

    const gate = await maybeAddMoreMix(order, tonnes);
    if (!gate.ok) return;

    const fresh = orders.find((o) => o.id === orderId) || order;

    let nextLoaded13 = Number(fresh.loaded13 || 0);
    let nextLoaded38 = Number(fresh.loaded38 || 0);

    if (tonnes === LOAD_13) nextLoaded13 += 1;
    if (tonnes === LOAD_38) nextLoaded38 += 1;

    const now = nowISO();
    const temp = { ...fresh, loaded13: nextLoaded13, loaded38: nextLoaded38 };
    const rem = remainingTonnes(temp);

    let nextStatus = fresh.status;
    let nextCompletedAt = fresh.completedAt ?? null;

    if (nextStatus === STATUS.UNACK) nextStatus = STATUS.ACK;

    if (rem <= 0) {
      nextStatus = STATUS.COMPLETE;
      nextCompletedAt = now;
    } else {
      if (nextStatus === STATUS.COMPLETE) nextStatus = STATUS.LOADED;
      nextCompletedAt = null;
    }

    await cloudUpdate(
      orderId,
      {
        loaded_13: nextLoaded13,
        loaded_38: nextLoaded38,
        status: nextStatus,
        updated_at: now,
        completed_at: nextStatus === STATUS.COMPLETE ? nextCompletedAt : null,
      },
      {
        loaded13: nextLoaded13,
        loaded38: nextLoaded38,
        status: nextStatus,
        updatedAt: now,
        completedAt: nextStatus === STATUS.COMPLETE ? nextCompletedAt : null,
      }
    );
  }

  async function applyLoadCustom(orderId) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.status === STATUS.CANCELLED) return;

    const raw = prompt("Enter custom load weight in tonnes (e.g. 12.5):", "");
    if (raw == null) return;

    const tonnes = Number(raw);
    if (!Number.isFinite(tonnes) || tonnes <= 0) {
      alert("Invalid weight. Enter a number greater than 0.");
      return;
    }

    const gate = await maybeAddMoreMix(order, tonnes);
    if (!gate.ok) return;

    const fresh = orders.find((o) => o.id === orderId) || order;
    const nextLoaded13 = Number(fresh.loaded13 || 0);
    const nextLoaded38 = Number(fresh.loaded38 || 0);
    const nextLoadedRemainder = Number(fresh.loadedRemainderTonne || 0) + tonnes;

    const now = nowISO();
    const temp = {
      ...fresh,
      loaded13: nextLoaded13,
      loaded38: nextLoaded38,
      loadedRemainderTonne: nextLoadedRemainder,
    };
    const rem = remainingTonnes(temp);

    let nextStatus = fresh.status;
    let nextCompletedAt = fresh.completedAt ?? null;

    if (nextStatus === STATUS.UNACK) nextStatus = STATUS.ACK;

    if (rem <= 0) {
      nextStatus = STATUS.COMPLETE;
      nextCompletedAt = now;
    } else {
      if (nextStatus === STATUS.COMPLETE) nextStatus = STATUS.LOADED;
      nextCompletedAt = null;
    }

    await cloudUpdate(
      orderId,
      {
        loaded_13: nextLoaded13,
        loaded_38: nextLoaded38,
        loaded_remainder_tonne: nextLoadedRemainder,
        status: nextStatus,
        updated_at: now,
        completed_at: nextStatus === STATUS.COMPLETE ? nextCompletedAt : null,
      },
      {
        loaded13: nextLoaded13,
        loaded38: nextLoaded38,
        loadedRemainderTonne: nextLoadedRemainder,
        status: nextStatus,
        updatedAt: now,
        completedAt: nextStatus === STATUS.COMPLETE ? nextCompletedAt : null,
      }
    );
  }

  function startEdit(orderId) {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;

    setEditingId(orderId);
    setEditDraft({
      customer: o.customer || "",
      mixType: o.mixType || "",
      quantityTonne: String(o.quantityTonne ?? ""),
      loadTime: o.loadTime || "",
      orderDate: o.orderDate || toLocalISODate(),
      jobNumber: o.jobNumber || "",
      poNumber: o.poNumber || "",
      foreman: o.foreman || "",
      pailOfColas: Boolean(o.pailOfColas),
      address: o.address || "",
      planned13: String(o.planned13 ?? 0),
      planned38: String(o.planned38 ?? 0),

      // Weather Call
      weatherCall: Boolean(o.weatherCall),
      weatherCallTime: String(o.weatherCallTime || ""),
    });

    if (touchMode) setKbTarget({ mode: "edit", field: "customer", type: "text" });
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;

    const cust = String(editDraft.customer || "").trim();
    const mix = String(editDraft.mixType || "").trim();
    const qty = clampNumber(editDraft.quantityTonne, 0.01, 999999);
    const lt = String(editDraft.loadTime || "");

    if (!cust || !mix || !qty || !lt) {
      alert("Missing required fields: Customer, Mix Type, Quantity (Tonne), Load Time");
      return;
    }

    await ensureCustomerInDb(cust);
    await ensureProductInDb(mix);

    setContractors((prev) => upsertUnique(prev, cust));
    setMixes((prev) => upsertUnique(prev, mix));

    const p13 = clampInt(editDraft.planned13 || 0, 0, 9999) ?? 0;
    const p38 = clampInt(editDraft.planned38 || 0, 0, 9999) ?? 0;

    // Weather Call: auto-heal time if checked
    const wc = Boolean(editDraft.weatherCall);
    const wcTime = wc ? String(editDraft.weatherCallTime || editDraft.loadTime || "07:00") : "";

    const now = nowISO();
    const existing = orders.find((o) => o.id === editingId);
    const willReopen = existing && existing.status === STATUS.COMPLETE && qty > loadedTonnes(existing);

    await cloudUpdate(
      editingId,
      {
        customer: cust,
        mix_type: mix,
        quantity_tonne: qty,
        load_time: lt,
        order_date: editDraft.orderDate || toLocalISODate(),
        job_number: String(editDraft.jobNumber || "").trim(),
        po_number: String(editDraft.poNumber || "").trim(),
        foreman: String(editDraft.foreman || "").trim(),
        updated_at: now,
        pail_of_colas: Boolean(editDraft.pailOfColas),
        address: String(editDraft.address || "").trim(),
        planned_13: p13,
        planned_38: p38,

        // Weather Call
        weather_call: wc,
        weather_call_time: wcTime,

        status: willReopen ? STATUS.LOADED : undefined,
        completed_at: willReopen ? null : undefined,
      },
      {
        customer: cust,
        mixType: mix,
        quantityTonne: qty,
        loadTime: lt,
        orderDate: editDraft.orderDate || toLocalISODate(),
        jobNumber: String(editDraft.jobNumber || "").trim(),
        poNumber: String(editDraft.poNumber || "").trim(),
        foreman: String(editDraft.foreman || "").trim(),
        updatedAt: now,
        pailOfColas: Boolean(editDraft.pailOfColas),
        address: String(editDraft.address || "").trim(),
        planned13: p13,
        planned38: p38,

        // Weather Call
        weatherCall: wc,
        weatherCallTime: wcTime,

        ...(willReopen ? { status: STATUS.LOADED, completedAt: null } : {}),
      }
    );

    setEditingId(null);
    setEditDraft(null);
    clearKbTarget();
    loadLists();
  }

  function closeEdit() {
    setEditingId(null);
    setEditDraft(null);
    clearKbTarget();
  }

  async function addContractor() {
    const name = newContractorName.trim();
    if (!name) return;
    if (!supabase) return alert("Supabase OFF (missing env vars).");

    const { error } = await supabase.from("customers").insert([{ name, is_active: true }]).select();
    if (error) return alert("Customer insert failed: " + error.message);

    setContractors((prev) => upsertUnique(prev, name));
    setNewContractorName("");
    loadLists();
  }
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78

  function removeContractor(name) {
    if (!confirm(`Remove customer "${name}"?`)) return;
    setContractors((prev) => prev.filter((x) => x !== name));
  }

  async function addMix() {
    const name = newMixName.trim();
    if (!name) return;
    if (!supabase) return alert("Supabase OFF (missing env vars).");

    const { error } = await supabase.from("products").insert([{ name, is_active: true }]).select();
    if (error) return alert("Product insert failed: " + error.message);

    setMixes((prev) => upsertUnique(prev, name));
    setNewMixName("");
    loadLists();
  }

  function removeMix(name) {
    if (!confirm(`Remove mix "${name}"?`)) return;
    setMixes((prev) => prev.filter((x) => x !== name));
  }

  function urgencyStyle(o) {
    if (o.status === STATUS.COMPLETE || o.status === STATUS.CANCELLED) return {};
    const mins = minutesUntil(o.loadTime, o.orderDate);
    if (mins == null) return {};
    if (mins < 0) return { borderColor: ui.danger, boxShadow: `0 0 0 2px ${ui.danger}55` };
    if (mins <= 10) return { borderColor: ui.danger, boxShadow: `0 0 0 2px ${ui.danger}44` };
    if (mins <= 30) return { borderColor: ui.warn, boxShadow: `0 0 0 2px ${ui.warn}44` };
    return {};
  }

  function weatherCallStyle(o) {
    if (!o.weatherCall) return {};
    return {
      borderColor: ui.weather,
      boxShadow: `0 0 0 3px ${ui.weather}99`,
    };
  }

  /* -------------------- Input components -------------------- */
  function TextInput({ mode, field, value, onChange, placeholder, type = "text" }) {
<<<<<<< HEAD
    // Use searchInput style for search bar
    const inputStyle = {
      ...styles.input,
      border: isActiveField(mode, field) ? `2px solid ${ui.accent}` : `1px solid ${ui.border}`,
      ...(field === "orderSearch" ? styles.searchInput : {}),
    };
    return (
      <input
        style={inputStyle}
=======
    return (
      <input
        style={{
          ...styles.input,
          border: isActiveField(mode, field) ? `2px solid ${ui.accent}` : `1px solid ${ui.border}`,
        }}
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
        value={value}
        placeholder={placeholder}
        inputMode={type === "number" ? "numeric" : type === "decimal" ? "decimal" : "text"}
        onFocus={() => {
          if (!touchMode) return;
          const kbType = type === "number" ? "number" : type === "decimal" ? "decimal" : "text";
          mode === "create" ? focusCreate(field, kbType) : focusEdit(field, kbType);
        }}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  function AutoCompleteInput({ mode, field, value, onChange, placeholder, items, type = "text" }) {
    const showSuggestions = touchMode && isActiveField(mode, field);
    const v = String(value || "");

    const filtered = useMemo(() => {
      const q = v.trim().toLowerCase();
      if (!q) return items.slice(0, 10);
      const starts = [];
      const contains = [];
      for (const it of items) {
        const s = String(it || "");
        const l = s.toLowerCase();
        if (l.startsWith(q)) starts.push(s);
        else if (l.includes(q)) contains.push(s);
      }
      return [...starts, ...contains].slice(0, 10);
    }, [items, v]);

    return (
      <div style={{ position: "relative" }}>
        <input
          style={{
            ...styles.input,
            border: isActiveField(mode, field) ? `2px solid ${ui.accent}` : `1px solid ${ui.border}`,
          }}
          value={value}
          placeholder={placeholder}
          inputMode={type === "number" ? "numeric" : type === "decimal" ? "decimal" : "text"}
          onFocus={() => {
            if (!touchMode) return;
            const kbType = type === "number" ? "number" : type === "decimal" ? "decimal" : "text";
            mode === "create" ? focusCreate(field, kbType) : focusEdit(field, kbType);
          }}
          onChange={(e) => onChange(e.target.value)}
        />

        {showSuggestions && filtered.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "calc(100% + 6px)",
              background: ui.card,
              border: `1px solid ${ui.border}`,
              borderRadius: 12,
              overflow: "hidden",
              zIndex: 80,
              boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
            }}
          >
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "none",
                  background: "transparent",
                  color: ui.text,
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* -------------------- Board UI -------------------- */
  function renderOrderCard(o) {
    const mins = minutesUntil(o.loadTime, o.orderDate);
    const isOverdue =
      mins != null && mins < 0 && o.status !== STATUS.COMPLETE && o.status !== STATUS.CANCELLED;

    const statusColor =
      o.status === STATUS.COMPLETE
        ? ui.ok
        : o.status === STATUS.CANCELLED
          ? ui.danger
          : o.status === STATUS.LOADED
            ? ui.warn
            : ui.accent;

    const statusLabel =
      o.status === STATUS.UNACK
        ? "Acknowledge"
        : o.status === STATUS.ACK
          ? "Loaded"
          : o.status === STATUS.LOADED
            ? "Complete"
            : "Complete";

    const cardGap = compactMode ? 6 : 10;
    const infoGap = compactMode ? 4 : 6;
    const rightMinWidth = compactMode ? 140 : 180;

    const cardBtn = { ...styles.btn, padding: "6px 8px", fontSize: 10, minWidth: 0 };
    const cardBtnPrimary = { ...styles.btnPrimary, padding: "6px 8px", fontSize: 10, minWidth: 0 };
    const cardBtnStatus = { ...styles.btnPrimary, padding: "4px 6px", fontSize: 9, minWidth: 0 };
    const cardBtnPrint = { ...styles.btn, padding: "4px 6px", fontSize: 9, minWidth: 0 };
    const cardBtnOk = { ...styles.btnOk, padding: "6px 8px", fontSize: 10, minWidth: 0 };
    const cardBtnDanger = { ...styles.btnDanger, padding: "6px 8px", fontSize: 10, minWidth: 0 };

    const loadedT = loadedTonnes(o);
    const remainingT = remainingTonnes(o);
    const nightLoad = isNightLoad(o.loadTime);

    return (
      <div
        key={o.id}
        style={{
          ...styles.orderCard,
          ...urgencyStyle(o),
          ...weatherCallStyle(o),
          ...(nightLoad
            ? {
                borderColor: "#0ea5e9",
                boxShadow: "0 0 0 2px rgba(14, 165, 233, 0.45)",
                background: darkMode ? "rgba(14, 165, 233, 0.14)" : "#eff6ff",
              }
            : {}),
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: cardGap, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: infoGap }}>
            <div style={{ display: "flex", gap: compactMode ? 6 : 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>{o.customer}</div>

              {o.weatherCall ? (
                <div style={styles.pillWeather}>
                  WEATHER CALL{o.weatherCallTime ? ` • ${o.weatherCallTime}` : ""}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: getMixColor(o.mixType),
                  border: `1px solid ${ui.border}`,
                }}
              />
              <div style={{ fontWeight: 800 }}>{o.mixType || "(No Mix)"}</div>
            </div>

            {o.address ? <div style={styles.small}>📍 {o.address}</div> : null}

            <div style={styles.small}>
              Load: <b>{o.loadTime || "--:--"}</b>{" "}
              {mins != null && o.status !== STATUS.COMPLETE && o.status !== STATUS.CANCELLED && (
                <span style={{ marginLeft: 8, color: isOverdue ? ui.danger : ui.muted }}>
                  {isOverdue ? `Overdue (${Math.abs(mins)} min)` : `In ${mins} min`}
                </span>
              )}
            </div>


            {(o.jobNumber || o.poNumber || o.foreman) && (
              <div style={styles.small}>
                {o.jobNumber ? (
                  <>
                    Job: <b>{o.jobNumber}</b>{" "}
                  </>
                ) : null}
                {o.poNumber ? (
                  <>
                    • PO: <b>{o.poNumber}</b>{" "}
                  </>
                ) : null}
                {o.foreman ? (
                  <>
                    • Foreman: <b>{o.foreman}</b>
                  </>
                ) : null}
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: infoGap, minWidth: rightMinWidth }}>
            <div
              style={{
                ...styles.pill,
                borderColor: statusColor,
                color: statusColor,
                textAlign: "center",
                fontWeight: 950,
              }}
            >
              {o.status}
            </div>

            {(o.status === STATUS.COMPLETE || o.status === STATUS.CANCELLED) ? (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  style={{ ...cardBtnOk, padding: "4px 6px", fontSize: 9, minWidth: "auto" }}
                  onClick={() => recallOrder(o.id)}
                  type="button"
                >
                  Recall / Re-Open
                </button>
                <button
                  style={{ ...cardBtnPrint, marginLeft: 0 }}
                  onClick={() => printOrderTicket(o)}
                  type="button"
                >
                  Print
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  style={cardBtnStatus}
                  onClick={() => cycleStatus(o.id)}
                  disabled={o.status === STATUS.CANCELLED}
                  type="button"
                >
                  {statusLabel}
                </button>
                <button
                  style={cardBtnPrint}
                  onClick={() => printOrderTicket(o)}
                  type="button"
                >
                  Print
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                style={cardBtn}
                onClick={() => applyLoad(o.id, LOAD_13)}
                disabled={o.status === STATUS.CANCELLED}
                type="button"
              >
                Tandem
              </button>
              <button
                style={cardBtn}
                onClick={() => applyLoad(o.id, LOAD_38)}
                disabled={o.status === STATUS.CANCELLED}
                type="button"
              >
                T4
              </button>
              <button
                style={cardBtn}
                onClick={() => applyLoadCustom(o.id)}
                disabled={o.status === STATUS.CANCELLED}
                type="button"
              >
                Custom
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
  <button style={cardBtn} onClick={() => startEdit(o.id)} type="button">
    Edit
  </button>

  <button style={cardBtn} onClick={() => copyOrder(o.id)} type="button">
    Copy
  </button>

  <button style={cardBtnDanger} onClick={() => cancelOrder(o.id)} type="button">
    Cancel
  </button>
</div>

            <div style={{ marginTop: 6, ...styles.small }}>
              Order: <b>{Number(o.quantityTonne || 0).toFixed(2)}</b> T • Loaded: <b>{loadedT.toFixed(2)}</b> T • Remaining: <b>{remainingT.toFixed(2)}</b> T
            </div>
            <div style={{ marginTop: 2, ...styles.small }}>
              13T: <b>{Number(o.loaded13 || 0)}</b> • 38T: <b>{Number(o.loaded38 || 0)}</b>
              {Number(o.loadedRemainderTonne || 0) > 0 ? (
                <> • Balance: <b>{Number(o.loadedRemainderTonne || 0).toFixed(2)}</b>T</>
              ) : null}
              {(Number(o.planned13 || 0) || Number(o.planned38 || 0)) ? (
                <> • Planned 13T: <b>{Number(o.planned13 || 0)}</b> • Planned 38T: <b>{Number(o.planned38 || 0)}</b></>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderTwoColumnSnake(items) {
    if (!items || items.length === 0) {
      return <div style={styles.small}>None</div>;
    }
    const left = items.filter((_, idx) => idx % 2 === 0);
    const right = items.filter((_, idx) => idx % 2 === 1);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {left.map(renderOrderCard)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {right.map(renderOrderCard)}
        </div>
      </div>
    );
  }

  /* -------------------- Modal shared sections -------------------- */
  const customersForDropdown = customers.length ? customers : contractors;
  const productsForDropdown = products.length ? products : mixes;

  function ActiveFieldHint() {
    return (
      <div style={{ ...styles.small, marginBottom: 8 }}>
        Active field:{" "}
        <b>
          {kbTarget
            ? `${kbTarget.mode === "create" ? "Create" : "Edit"} • ${kbTarget.field} (${kbTarget.type})`
            : "None (tap a field)"}
        </b>
      </div>
    );
  }

  /* -------------------- Render -------------------- */
  return (
    <div style={styles.page}>
<<<<<<< HEAD
      {readOnly && (
  <div
    style={{
      marginBottom: 12,
      padding: 12,
      borderRadius: 10,
      background: "#fff7ed",
      border: "1px solid #fdba74",
      color: "#9a3412",
      fontWeight: 700,
    }}
  >
    Manager Mode: Read Only
  </div>
)}
=======
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
      {/* COL 1: Controls + Dashboard + Big Create Button */}
      <div
        style={{
          gridColumn: "1 / 2",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: "calc(100vh - 24px)",
        }}
      >
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <h1 style={styles.h1}>Plant Orders</h1>
            <div style={styles.row}>
              <button style={styles.btn} onClick={() => setDarkMode((v) => !v)} type="button">
                {darkMode ? "Light" : "Dark"}
              </button>
              <button style={styles.btn} onClick={() => setBigMode((v) => !v)} type="button">
                {bigMode ? "Normal" : "Big"}
              </button>
              <button style={styles.btn} onClick={() => setCompactMode((v) => !v)} type="button">
                {compactMode ? "Regular" : "Compact"}
              </button>
            </div>
          </div>
<<<<<<< HEAD

          {readOnly && (
            <div
              style={{
                marginTop: 10,
                marginBottom: 10,
                padding: 12,
                borderRadius: 10,
                background: "#fff7ed",
                border: "1px solid #fdba74",
                color: "#9a3412",
                fontWeight: 700,
              }}
            >
              Manager Mode: Read Only
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <button
              style={{
                ...styles.btnBigCreate,
                opacity: readOnly ? 0.5 : 1,
                cursor: readOnly ? "not-allowed" : "pointer",
              }}
              onClick={openCreateModal}
              disabled={readOnly}
              type="button"
            >
=======
          <div style={{ marginTop: 10 }}>
            <button style={styles.btnBigCreate} onClick={openCreateModal} type="button">
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
              ➕ Create New Order
            </button>
          </div>

          <div style={{ ...styles.cloudBar, marginTop: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ fontWeight: 950 }}>{cloudStatus}</div>
              {cloudError ? <div style={{ ...styles.small, color: ui.danger }}>{cloudError}</div> : null}
              <div style={styles.small}>
                ENV URL: {supabaseEnabled ? "OK" : "MISSING"} • ENV KEY: {supabaseEnabled ? "OK" : "MISSING"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btn} onClick={cloudPull} disabled={!supabaseEnabled} type="button">
                Pull
              </button>
              <button style={styles.btn} onClick={loadLists} disabled={!supabaseEnabled} type="button">
                Refresh Lists
              </button>
            </div>
          </div>

          <div style={{ ...styles.row, marginTop: 10 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={styles.label}>Board Date</div>
              <input
                style={styles.input}
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
              <button style={styles.btn} onClick={() => setSelectedDate((d) => addDays(d, -1))} type="button">
                ◀︎
              </button>
              <button
                style={styles.btn}
                onClick={() => {
                  const t = toLocalISODate();
                  setSelectedDate(t);
                }}
                type="button"
              >
                Today
              </button>
              <button style={styles.btn} onClick={() => setSelectedDate((d) => addDays(d, 1))} type="button">
                ▶︎
              </button>
            </div>
          </div>

          <div style={{ ...styles.row, marginTop: 10 }}>
            <label style={styles.row}>
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
              <span style={styles.small}>Show completed</span>
            </label>

            <label style={styles.row}>
              <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
              <span style={styles.small}>Show cancelled in unack</span>
            </label>

            <label style={{ ...styles.row, flex: 1, minWidth: 280 }}>
              <input
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: isActiveField("search", "orderSearch") ? `2px solid ${ui.accent}` : `1px solid ${ui.border}`,
                }}
                placeholder="Search customer, mix, job #, PO #, foreman..."
                value={orderSearch}
                onFocus={focusSearch}
                onBlur={() => {
                  if (touchMode) {
                    // keep keyboard open until explicit close or another field is selected
                    // if desired to auto-close, uncomment next line
                    // clearKbTarget();
                  }
                }}
                onChange={(e) => setOrderSearch(e.target.value)}
              />
            </label>

            <label style={styles.row}>
              <input
                type="checkbox"
                checked={touchMode}
                onChange={(e) => {
                  setTouchMode(e.target.checked);
                  clearKbTarget();
                }}
              />
              <span style={styles.small}>Touch mode (keyboard inside popups)</span>
            </label>

            <button style={styles.btn} onClick={() => setConfigOpen((v) => !v)} type="button">
              {configOpen ? "Close Setup" : "Setup"}
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Remaining by Mix</div>
            <div style={styles.pill}>{selectedDate}</div>
          </div>

          <div style={{ ...styles.small, marginTop: 6 }}>
            Shipped so far: <b>{shippedSoFarForDate.toFixed(2)}</b> T • Total ordered:{" "}
            <b>{totalsForDate.total.toFixed(2)}</b> T • Remaining: <b>{totalsForDate.pending.toFixed(2)}</b> T
          </div>

          <div style={styles.divider} />

          {remainingByMix.length === 0 ? (
            <div style={styles.small}>No remaining orders for this date.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {remainingByMix.map(([mix, qty]) => (
                <div
                  key={mix}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: getMixColor(mix),
                        border: `1px solid ${ui.border}`,
                      }}
                    />
                    <div style={{ fontWeight: 800 }}>{mix}</div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 950 }}>{qty.toFixed(2)} T</div>
                    <input
                      type="color"
                      value={getMixColor(mix)}
                      title="Set mix color"
                      onChange={(e) => setMixColorFor(mix, e.target.value)}
                      style={{ width: 34, height: 26, border: 0, padding: 0, background: "transparent", cursor: "pointer" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.colHeader}>
            <span>Unack</span>
            <span style={styles.small}>{boardCols.unack.length}</span>
          </div>
          <div style={{ height: 10 }} />
          <div style={styles.listCol}>
            {boardCols.unack.length ? boardCols.unack.map(renderOrderCard) : <div style={styles.small}>None</div>}
          </div>
        </div>

        {touchMode && kbTarget?.mode === "search" && (
          <div style={styles.card}>
            <div style={{ fontWeight: 950, marginBottom: 8 }}>Search Keyboard</div>
            <SmallKeyboard ui={ui} darkMode={darkMode} onKey={applyKey} />
            <div style={{ marginTop: 10, ...styles.small }}>
              Tip: tap the search input above, then use the on-screen keyboard to type.
            </div>
          </div>
        )}

        {configOpen && (
          <div style={styles.card}>
            <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 10 }}>Setup</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Customers</div>
                <div style={styles.row}>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    value={newContractorName}
                    onChange={(e) => setNewContractorName(e.target.value)}
                    placeholder="Type customer name…"
<<<<<<< HEAD
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <button style={styles.btnPrimary} onClick={addContractor} type="button">
                      Add
                    </button>
                  )}
=======
                  />
                  <button style={styles.btnPrimary} onClick={addContractor} type="button">
                    Add
                  </button>
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
                </div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {contractors.map((c) => (
                    <div key={c} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 800 }}>{c}</div>
<<<<<<< HEAD
                      {!readOnly && (
                        <button style={styles.btn} onClick={() => removeContractor(c)} type="button">
                          Remove
                        </button>
                      )}
=======
                      <button style={styles.btn} onClick={() => removeContractor(c)} type="button">
                        Remove
                      </button>
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
                    </div>
                  ))}
                </div>
              </div>

              <div style={styles.divider} />

              <div>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Mix Types</div>
                <div style={styles.row}>
                  <input
                    style={{ ...styles.input, flex: 1 }}
                    value={newMixName}
                    onChange={(e) => setNewMixName(e.target.value)}
                    placeholder="Type mix name…"
<<<<<<< HEAD
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <button style={styles.btnPrimary} onClick={addMix} type="button">
                      Add
                    </button>
                  )}
=======
                  />
                  <button style={styles.btnPrimary} onClick={addMix} type="button">
                    Add
                  </button>
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
                </div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {mixes.map((m) => (
                    <div key={m} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 800 }}>{m}</div>
<<<<<<< HEAD
                      {!readOnly && (
                        <button style={styles.btn} onClick={() => removeMix(m)} type="button">
                          Remove
                        </button>
                      )}
=======
                      <button style={styles.btn} onClick={() => removeMix(m)} type="button">
                        Remove
                      </button>
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
                    </div>
                  ))}
                </div>
              </div>

              <div style={styles.small}>Removing a customer/mix only affects local pick lists — old orders remain.</div>
            </div>
          </div>
        )}
<<<<<<< HEAD
      </div>

      {/* COL 2: ACKNOWLEDGED */}
      <div style={{ gridColumn: "2 / 3" }}>
=======

      </div>

      {/* COL 2-3: ACKNOWLEDGED */}
      <div style={{ gridColumn: "2 / 4" }}>
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
        <div style={styles.card}>
          <div style={styles.colHeader}>
            <span>Acknowledged</span>
            <span style={styles.small}>{boardCols.ack.length}</span>
          </div>
          <div style={{ height: 10 }} />
          <div style={styles.listCol}>
            {renderTwoColumnSnake(boardCols.ack)}
          </div>
        </div>
      </div>

<<<<<<< HEAD
      {/* COL 3: LOADING */}
      <div style={{ gridColumn: "3 / 4" }}>
=======
      {/* COL 4-5: LOADING */}
      <div style={{ gridColumn: "4 / 6" }}>
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
        <div style={styles.card}>
          <div style={styles.colHeader}>
            <span>Loading</span>
            <span style={styles.small}>{boardCols.loaded.length}</span>
          </div>
          <div style={{ height: 10 }} />
          <div style={styles.listCol}>
            {renderTwoColumnSnake(boardCols.loaded)}
          </div>
        </div>
      </div>

<<<<<<< HEAD
      {/* COL 4: COMPLETED */}
      <div style={{ gridColumn: "4 / 5" }}>
=======
      {/* COL 6: COMPLETED */}
      <div style={{ gridColumn: "6 / 7" }}>
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
        <div style={styles.card}>
          <div style={styles.colHeader}>
            <span>Completed</span>
            <span style={styles.small}>{boardCols.complete.length}</span>
          </div>
          <div style={{ height: 10 }} />
          {showCompleted ? (
            <div style={styles.listCol}>
              {boardCols.complete.length ? boardCols.complete.map(renderOrderCard) : <div style={styles.small}>None</div>}
            </div>
          ) : (
            <div style={styles.small}>Turn on “Show completed” to view.</div>
          )}
        </div>
      </div>

      {/* ==================== CREATE MODAL (with inlay keyboard/numpad) ==================== */}
<<<<<<< HEAD
      {createOpen && !readOnly && (
=======
      {createOpen && (
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
        <div style={styles.modalOverlay} onClick={closeCreateModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 950, fontSize: 18 }}>Create Order</div>
              <div style={styles.small}>{touchMode ? "Touch keyboard is enabled" : "Computer keyboard works normally"}</div>
            </div>

            <div style={styles.divider} />

            <div style={styles.modalGrid}>
              {/* LEFT: FORM */}
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                  <div>
                    <div style={styles.label}>Customer (required)</div>
                    <AutoCompleteInput
                      mode="create"
                      field="customer"
                      type="text"
                      value={createDraft.customer}
                      onChange={(v) => setCreateDraft((d) => ({ ...d, customer: v }))}
                      placeholder="Start typing or pick…"
                      items={customersForDropdown}
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Mix Type (required)</div>
                    <AutoCompleteInput
                      mode="create"
                      field="mixType"
                      type="text"
                      value={createDraft.mixType}
                      onChange={(v) => setCreateDraft((d) => ({ ...d, mixType: v }))}
                      placeholder="Start typing or pick…"
                      items={productsForDropdown}
                    />
                  </div>

                  <div>
<<<<<<< HEAD
                    <div style={styles.label}>Load Times (required)</div>
                    {createDraft.loadTimes && createDraft.loadTimes.length > 0 && createDraft.loadTimes.map((lt, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <TimePicker
                          value={lt}
                          onChange={(hhmm) =>
                            setCreateDraft((d) => {
                              const arr = [...d.loadTimes];
                              arr[idx] = hhmm;
                              return { ...d, loadTimes: arr };
                            })
                          }
                        />
                        <button
                          style={styles.btnDanger}
                          type="button"
                          onClick={() => setCreateDraft((d) => ({ ...d, loadTimes: d.loadTimes.filter((_, i) => i !== idx) }))}
                          disabled={createDraft.loadTimes.length === 1}
                          title={createDraft.loadTimes.length === 1 ? "At least one time required" : "Remove this time"}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      style={styles.btnOk}
                      type="button"
                      onClick={() => setCreateDraft((d) => ({ ...d, loadTimes: [...d.loadTimes, ""] }))}
                    >
                      Add Load Time
                    </button>
=======
                    <div style={styles.label}>Load Time (required)</div>
                    <TimePicker
                      value={createDraft.loadTime}
                      onChange={(hhmm) =>
                        setCreateDraft((d) => ({
                          ...d,
                          loadTime: hhmm,
                          // If weather call checked but time blank, keep it sensible
                          weatherCallTime: d.weatherCall ? (d.weatherCallTime || hhmm || "07:00") : d.weatherCallTime,
                        }))
                      }
                    />
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
                    <div style={styles.small}>Hour / Minute / AM-PM • Minutes in 5 min steps</div>
                  </div>

                  {/* WEATHER CALL */}
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 14,
                      border: `1px solid ${ui.border}`,
                      background: darkMode ? "#0f172a" : "#f8fafc",
                    }}
                  >
                    <label style={{ ...styles.row, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(createDraft.weatherCall)}
                        onChange={(e) =>
                          setCreateDraft((d) => {
                            const checked = e.target.checked;
                            const fallbackTime = d.loadTime || "07:00";
                            return {
                              ...d,
                              weatherCall: checked,
<<<<<<< HEAD
=======
                              // AUTO-FILL time on check, clear on uncheck
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
                              weatherCallTime: checked ? (d.weatherCallTime || fallbackTime) : "",
                            };
                          })
                        }
                      />
                      <span style={{ fontWeight: 950 }}>Weather Call</span>
                      <span style={styles.small}>(highlights order yellow)</span>
                    </label>

                    {createDraft.weatherCall ? (
                      <div style={{ marginTop: 8 }}>
                        <div style={styles.label}>Weather Call Time</div>
                        <TimePicker
                          value={createDraft.weatherCallTime}
                          onChange={(hhmm) => setCreateDraft((d) => ({ ...d, weatherCallTime: hhmm }))}
                        />
                        <div style={styles.small}>If you don’t touch this, it auto-uses Load Time (or 07:00).</div>
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div style={styles.label}>Production Date</div>
                    <input
                      style={styles.input}
                      type="date"
                      value={createDraft.orderDate}
                      onFocus={() => touchMode && focusCreate("orderDate", "text")}
                      onChange={(e) => setCreateDraft((d) => ({ ...d, orderDate: e.target.value }))}
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Quantity (Tonne) (required)</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {DEFAULTS.quantityPresets.map((q) => (
                        <button
                          key={q}
                          style={styles.btn}
                          onClick={() => setCreateDraft((d) => ({ ...d, quantityTonne: String(q) }))}
                          type="button"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                    <div style={{ height: 8 }} />
                    <TextInput
                      mode="create"
                      field="quantityTonne"
                      type="decimal"
                      value={createDraft.quantityTonne}
                      onChange={(v) => setCreateDraft((d) => ({ ...d, quantityTonne: v }))}
                      placeholder="Type quantity…"
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={styles.label}>Job Number</div>
                      <TextInput
                        mode="create"
                        field="jobNumber"
                        type="text"
                        value={createDraft.jobNumber}
                        onChange={(v) => setCreateDraft((d) => ({ ...d, jobNumber: v }))}
                        placeholder="Type job…"
                      />
                    </div>
                    <div>
                      <div style={styles.label}>PO#</div>
                      <TextInput
                        mode="create"
                        field="poNumber"
                        type="text"
                        value={createDraft.poNumber}
                        onChange={(v) => setCreateDraft((d) => ({ ...d, poNumber: v }))}
                        placeholder="Type PO…"
                      />
                    </div>
                  </div>

                  <div>
                    <div style={styles.label}>Foreman</div>
                    <TextInput
                      mode="create"
                      field="foreman"
                      type="text"
                      value={createDraft.foreman}
                      onChange={(v) => setCreateDraft((d) => ({ ...d, foreman: v }))}
                      placeholder="Type foreman…"
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Address</div>
                    <TextInput
                      mode="create"
                      field="address"
                      type="text"
                      value={createDraft.address}
                      onChange={(v) => setCreateDraft((d) => ({ ...d, address: v }))}
                      placeholder="Type address…"
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={styles.label}>Planned 13T loads</div>
                      <TextInput
                        mode="create"
                        field="planned13"
                        type="number"
                        value={createDraft.planned13}
                        onChange={(v) => setCreateDraft((d) => ({ ...d, planned13: v }))}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <div style={styles.label}>Planned 38T loads</div>
                      <TextInput
                        mode="create"
                        field="planned38"
                        type="number"
                        value={createDraft.planned38}
                        onChange={(v) => setCreateDraft((d) => ({ ...d, planned38: v }))}
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <label style={{ ...styles.row, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(createDraft.pailOfColas)}
                      onChange={(e) => setCreateDraft((d) => ({ ...d, pailOfColas: e.target.checked }))}
                    />
                    <span style={styles.small}>Pail of Colas</span>
                  </label>

<<<<<<< HEAD
=======
                  {/* Footer buttons */}
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
                  <div style={{ ...styles.row, justifyContent: "space-between", marginTop: 6 }}>
                    <button style={styles.btn} onClick={closeCreateModal} type="button">
                      Close
                    </button>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        style={styles.btn}
                        type="button"
                        onClick={() => {
                          resetCreateDraft(createDraft.orderDate || selectedDate || toLocalISODate());
                          if (touchMode) setKbTarget({ mode: "create", field: "customer", type: "text" });
                        }}
                      >
                        Clear Form
                      </button>

                      <button style={styles.btnPrimary} onClick={postCreateOrder} type="button">
                        Post Order
                      </button>
                    </div>
                  </div>
                </div>
              </div>

<<<<<<< HEAD
=======
              {/* RIGHT: INLAY KEYBOARD/NUMPAD (Touch mode only) */}
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
              {touchMode && (
                <div style={styles.modalKbPanel}>
                  <ActiveFieldHint />
                  <SmallKeyboard ui={ui} darkMode={darkMode} onKey={applyKey} />
                  <div style={{ height: 12 }} />
                  <NumberPad ui={ui} darkMode={darkMode} onKey={applyKey} />
                  <div style={{ marginTop: 10, ...styles.small }}>
                    Tip: tap a field on the left (blue border), then type using the keypad here.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT MODAL (with inlay keyboard/numpad) ==================== */}
<<<<<<< HEAD
      {editingId && editDraft && !readOnly && (
=======
      {editingId && editDraft && (
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
        <div style={styles.modalOverlay} onClick={closeEdit}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 950, fontSize: 18 }}>Edit Order</div>
              <div style={styles.small}>{editingOrder?.id}</div>
            </div>

            <div style={styles.divider} />

            <div style={styles.modalGrid}>
<<<<<<< HEAD
=======
              {/* LEFT: FORM */}
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={styles.label}>Customer</div>
                    <AutoCompleteInput
                      mode="edit"
                      field="customer"
                      type="text"
                      value={editDraft.customer}
                      onChange={(v) => setEditDraft((d) => ({ ...d, customer: v }))}
                      placeholder="Start typing or pick…"
                      items={customersForDropdown}
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Mix Type</div>
                    <AutoCompleteInput
                      mode="edit"
                      field="mixType"
                      type="text"
                      value={editDraft.mixType}
                      onChange={(v) => setEditDraft((d) => ({ ...d, mixType: v }))}
                      placeholder="Start typing or pick…"
                      items={productsForDropdown}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={styles.label}>Load Time</div>
                    <TimePicker
                      value={editDraft.loadTime}
                      onChange={(hhmm) =>
                        setEditDraft((d) => ({
                          ...d,
                          loadTime: hhmm,
                          weatherCallTime: d.weatherCall ? (d.weatherCallTime || hhmm || "07:00") : d.weatherCallTime,
                        }))
                      }
                    />
                  </div>

<<<<<<< HEAD
=======
                  {/* WEATHER CALL */}
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      padding: 10,
                      borderRadius: 14,
                      border: `1px solid ${ui.border}`,
                      background: darkMode ? "#0f172a" : "#f8fafc",
                    }}
                  >
                    <label style={{ ...styles.row, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editDraft.weatherCall)}
                        onChange={(e) =>
                          setEditDraft((d) => {
                            const checked = e.target.checked;
                            const fallbackTime = d.loadTime || "07:00";
                            return {
                              ...d,
                              weatherCall: checked,
<<<<<<< HEAD
=======
                              // AUTO-FILL time on check, clear on uncheck
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
                              weatherCallTime: checked ? (d.weatherCallTime || fallbackTime) : "",
                            };
                          })
                        }
                      />
                      <span style={{ fontWeight: 950 }}>Weather Call</span>
                      <span style={styles.small}>(uncheck to remove)</span>
                    </label>

                    {editDraft.weatherCall ? (
                      <div style={{ marginTop: 8 }}>
                        <div style={styles.label}>Weather Call Time</div>
                        <TimePicker
                          value={editDraft.weatherCallTime}
                          onChange={(hhmm) => setEditDraft((d) => ({ ...d, weatherCallTime: hhmm }))}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div style={styles.label}>Production Date</div>
                    <input
                      style={styles.input}
                      type="date"
                      value={editDraft.orderDate}
                      onFocus={() => touchMode && focusEdit("orderDate", "text")}
                      onChange={(e) => setEditDraft((d) => ({ ...d, orderDate: e.target.value }))}
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Quantity (Tonne)</div>
                    <TextInput
                      mode="edit"
                      field="quantityTonne"
                      type="decimal"
                      value={editDraft.quantityTonne}
                      onChange={(v) => setEditDraft((d) => ({ ...d, quantityTonne: v }))}
                      placeholder="Type quantity…"
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Foreman</div>
                    <TextInput
                      mode="edit"
                      field="foreman"
                      type="text"
                      value={editDraft.foreman}
                      onChange={(v) => setEditDraft((d) => ({ ...d, foreman: v }))}
                      placeholder="Type foreman…"
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Job Number</div>
                    <TextInput
                      mode="edit"
                      field="jobNumber"
                      type="text"
                      value={editDraft.jobNumber}
                      onChange={(v) => setEditDraft((d) => ({ ...d, jobNumber: v }))}
                      placeholder="Type job…"
                    />
                  </div>

                  <div>
                    <div style={styles.label}>PO#</div>
                    <TextInput
                      mode="edit"
                      field="poNumber"
                      type="text"
                      value={editDraft.poNumber}
                      onChange={(v) => setEditDraft((d) => ({ ...d, poNumber: v }))}
                      placeholder="Type PO…"
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={styles.label}>Address</div>
                    <TextInput
                      mode="edit"
                      field="address"
                      type="text"
                      value={editDraft.address}
                      onChange={(v) => setEditDraft((d) => ({ ...d, address: v }))}
                      placeholder="Type address…"
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Planned 13T</div>
                    <TextInput
                      mode="edit"
                      field="planned13"
                      type="number"
                      value={editDraft.planned13}
                      onChange={(v) => setEditDraft((d) => ({ ...d, planned13: v }))}
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <div style={styles.label}>Planned 38T</div>
                    <TextInput
                      mode="edit"
                      field="planned38"
                      type="number"
                      value={editDraft.planned38}
                      onChange={(v) => setEditDraft((d) => ({ ...d, planned38: v }))}
                      placeholder="0"
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={styles.row}>
                      <input
                        type="checkbox"
                        checked={Boolean(editDraft.pailOfColas)}
                        onChange={(e) => setEditDraft((d) => ({ ...d, pailOfColas: e.target.checked }))}
                      />
                      <span style={styles.small}>Pail of Colas</span>
                    </label>
                  </div>
                </div>

                <div style={{ ...styles.row, justifyContent: "space-between", marginTop: 14 }}>
                  <div style={styles.small}>
                    Loaded: <b>{loadedTonnes(editingOrder || {}).toFixed(2)}</b> T • Remaining:{" "}
                    <b>{editingOrder ? remainingTonnes(editingOrder).toFixed(2) : "0.00"}</b> T
                  </div>

                  <div style={styles.row}>
                    <button style={styles.btn} onClick={closeEdit} type="button">
                      Close
                    </button>
                    <button style={styles.btnPrimary} onClick={saveEdit} type="button">
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>

<<<<<<< HEAD
=======
              {/* RIGHT: INLAY KEYBOARD/NUMPAD (Touch mode only) */}
>>>>>>> 9615ae54642f6cb17002ccb7c827debc3efd8d78
              {touchMode && (
                <div style={styles.modalKbPanel}>
                  <ActiveFieldHint />
                  <SmallKeyboard ui={ui} darkMode={darkMode} onKey={applyKey} />
                  <div style={{ height: 12 }} />
                  <NumberPad ui={ui} darkMode={darkMode} onKey={applyKey} />
                  <div style={{ marginTop: 10, ...styles.small }}>
                    Tip: tap a field on the left (blue border), then type using the keypad here.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}