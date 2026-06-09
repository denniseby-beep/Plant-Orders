import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const TEXT = "#000";
const SHIFT_OPTIONS = ["", "Day", "Nightshift"];

const TRUCK_TYPE_OPTIONS = [
  { code: "1x", label: "1x - Single Axle" },
  { code: "2x", label: "2x - Tandem" },
  { code: "3x", label: "3x - Tridem" },
  { code: "T2", label: "T2 - Truck & Pup" },
  { code: "T3", label: "T3 - Tri & Pup" },
  { code: "T4", label: "T4 - Truck & Transfer" },
];

const MATERIAL_TYPE_OPTIONS = ["", "Asphalt", "Milling", "Gravel", "Empty"];
const START_LOCATION_OPTIONS = ["", "Plant", "Job"];
const HOUR_OPTIONS = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const MINUTE_OPTIONS = ["", "00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const AMPM_OPTIONS = ["", "AM", "PM"];

const todayString = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM = {
  service_date: todayString(),
  requested_time: "",
  time_label: "",
  shift_label: "",

  job_number: "",
  customer_name: "",
  address: "",

  weather_call_time: "",
  crew_start_time: "",

  paving_foreman: "",
  milling_foreman: "",
  crew_notes: "",

  materials: "",

  supplier_vendor: "",
  traffic_vendor: "",
  equipment_move_vendor: "",

  trucking_number_of_trucks: "",
  trucking_assignments: [],
  haul_destination: "",
  trucking_notes: "",

  traffic_control: "",

  equipment_required: "",
  equipment_moves: "",

  notes: "",

  emailed_trucking: false,
  emailed_traffic_control: false,
  emailed_equipment_movers: false,
  plant_notified: false,

  emailed_trucking_at: null,
  emailed_traffic_control_at: null,
  emailed_equipment_movers_at: null,
  plant_notified_at: null,
};

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDateLabel(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "";
  const parts = String(value).split(":");
  if (parts.length < 2) return value;

  let hours = Number(parts[0]);
  const minutes = parts[1];
  if (Number.isNaN(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${suffix}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function compactText(value, fallback = "—") {
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function getRequestedWindow(row) {
  const parts = [];
  if (row.requested_time) parts.push(formatTime(row.requested_time));
  if (row.shift_label) parts.push(row.shift_label);
  if (row.time_label) parts.push(row.time_label);
  return parts.length ? parts.join(" · ") : "—";
}

function parseTimeToParts(time) {
  if (!time || typeof time !== "string") {
    return {
      start_hour: "",
      start_minute: "",
      start_ampm: "",
    };
  }

  const parts = time.split(":");
  if (parts.length < 2) {
    return {
      start_hour: "",
      start_minute: "",
      start_ampm: "",
    };
  }

  let hour = Number(parts[0]);
  const minute = parts[1];

  if (Number.isNaN(hour)) {
    return {
      start_hour: "",
      start_minute: "",
      start_ampm: "",
    };
  }

  const start_ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;

  return {
    start_hour: String(hour),
    start_minute: minute,
    start_ampm,
  };
}

function buildTimeFromParts(start_hour, start_minute, start_ampm) {
  if (!start_hour || !start_minute || !start_ampm) return "";

  let hour = Number(start_hour);
  if (Number.isNaN(hour)) return "";

  if (start_ampm === "PM" && hour !== 12) hour += 12;
  if (start_ampm === "AM" && hour === 12) hour = 0;

  const hh = String(hour).padStart(2, "0");
  return `${hh}:${start_minute}`;
}

function prettyTruckTypes(assignments) {
  const counts = {};

  (assignments || []).forEach((row) => {
    if (!row?.truck_type) return;
    counts[row.truck_type] = (counts[row.truck_type] || 0) + 1;
  });

  return Object.entries(counts)
    .map(([type, qty]) => `${qty} x ${type}`)
    .join(", ");
}

function prettyTruckingAssignments(assignments) {
  return (assignments || [])
    .map((row) => {
      const timeValue =
        row?.start_time ||
        buildTimeFromParts(row?.start_hour, row?.start_minute, row?.start_ampm);

      const parts = [
        `Truck ${row?.truck_number || "?"}`,
        row?.vendor || "",
        row?.truck_type || "",
        timeValue ? formatTime(timeValue) : "",
        row?.material_type || "",
        row?.start_location || "",
      ].filter(Boolean);

      return parts.join(" - ");
    })
    .filter(Boolean)
    .join("\n");
}

function groupTrucksByVendor(assignments = []) {
  const groups = {};

  for (const row of assignments) {
    const vendor = String(row?.vendor || "").trim();
    if (!vendor) continue;

    if (!groups[vendor]) groups[vendor] = [];
    groups[vendor].push(row);
  }

  return groups;
}

function buildVendorEmail({ dispatch, vendor, trucks }) {
  const lines = [];

  lines.push("Dispatch Request");
  lines.push("-----------------------------");

  if (dispatch.service_date) lines.push(`Date: ${formatDateLabel(dispatch.service_date)}`);
  if (dispatch.job_number) lines.push(`Job #: ${dispatch.job_number}`);
  if (dispatch.customer_name) lines.push(`Customer / Crew: ${dispatch.customer_name}`);
  if (dispatch.address) lines.push(`Address: ${dispatch.address}`);

  const requestedWindow = getRequestedWindow(dispatch);
  if (requestedWindow !== "—") lines.push(`Requested: ${requestedWindow}`);

  if (dispatch.weather_call_time) {
    lines.push(`Weather Call: ${formatTime(dispatch.weather_call_time)}`);
  }

  if (dispatch.crew_start_time) {
    lines.push(`Crew Start: ${formatTime(dispatch.crew_start_time)}`);
  }

  if (dispatch.haul_destination) {
    lines.push(`Haul Destination: ${dispatch.haul_destination}`);
  }

  lines.push("");
  lines.push(`Vendor: ${vendor}`);
  lines.push("Assigned Trucks");
  lines.push("-----------------------------");

  trucks.forEach((truck) => {
    lines.push(
      `Truck ${truck.truck_number} | ${truck.truck_type || "-"} | ${
        truck.start_time ? formatTime(truck.start_time) : "-"
      } | ${truck.material_type || "-"} | ${truck.start_location || "-"}`
    );
  });

  if (dispatch.trucking_notes) {
    lines.push("");
    lines.push("Trucking Notes:");
    lines.push(dispatch.trucking_notes);
  }

  if (dispatch.notes) {
    lines.push("");
    lines.push("General Notes:");
    lines.push(dispatch.notes);
  }

  lines.push("");
  lines.push("Thank you,");

  return lines.join("\n");
}

function Field({ label, children, fullWidth = false }) {
  return (
    <div style={fullWidth ? styles.fullWidth : undefined}>
      <label style={styles.fieldWrap}>
        <div style={styles.fieldLabel}>{label}</div>
        {children}
      </label>
    </div>
  );
}

function SectionTitle({ children }) {
  return <div style={styles.sectionTitle}>{children}</div>;
}

export default function DispatchApp({ role }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [startDate, setStartDate] = useState(todayString());
  const [endDate, setEndDate] = useState(todayString());

  const [truckingVendorOptions, setTruckingVendorOptions] = useState([]);
  const [trafficVendorOptions, setTrafficVendorOptions] = useState([]);
  const [equipmentMoveVendorOptions, setEquipmentMoveVendorOptions] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [activeSection, setActiveSection] = useState("full");
  const [form, setForm] = useState(EMPTY_FORM);

  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailGroups, setEmailGroups] = useState([]);
  const [emailSending, setEmailSending] = useState(false);
  const [emailDispatchId, setEmailDispatchId] = useState(null);

  const [dispatchEquipmentOptions, setDispatchEquipmentOptions] = useState([]);

  const readOnly = role === "manager";

  useEffect(() => {
    fetchRows();
    loadVendors();
    loadDispatchEquipment();

    const dispatchChannel = supabase
      .channel("dispatch_requests_live_grid")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatch_requests" },
        () => fetchRows(false)
      )
      .subscribe();

    const vendorChannel = supabase
      .channel("dispatch_vendor_lists_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendors" },
        () => loadVendors()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendor_services" },
        () => loadVendors()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dispatchChannel);
      supabase.removeChannel(vendorChannel);
    };
  }, []);

  async function loadDispatchEquipment() {
  try {
    const { data, error } = await supabase
      .from("dispatch_equipment")
      .select("id, name, division, is_active, sort_order")
      .eq("is_active", true)
      .order("division", { ascending: true })
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (error) throw error;

    setDispatchEquipmentOptions(data || []);
  } catch (err) {
    console.error("loadDispatchEquipment", err);
    setDispatchEquipmentOptions([]);
  }
}

  async function fetchRows(withSpinner = true) {
    try {
      if (withSpinner) setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("dispatch_requests")
        .select("*")
        .order("service_date", { ascending: true })
        .order("requested_time", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load dispatch requests.");
    } finally {
      if (withSpinner) setLoading(false);
    }
  }

  async function loadVendors() {
    try {
      const { data: vendorsData, error: vendorsError } = await supabase
        .from("vendors")
        .select("id, name, email, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (vendorsError) throw vendorsError;

      const vendorIds = (vendorsData || []).map((v) => v.id);

      if (!vendorIds.length) {
        setTruckingVendorOptions([]);
        setTrafficVendorOptions([]);
        setEquipmentMoveVendorOptions([]);
        return;
      }

      const { data: servicesData, error: servicesError } = await supabase
        .from("vendor_services")
        .select("vendor_id, service_type, is_active, sort_order")
        .in("vendor_id", vendorIds)
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("service_type", { ascending: true });

      if (servicesError) throw servicesError;

      const vendorsById = {};
      for (const vendor of vendorsData || []) {
        vendorsById[vendor.id] = vendor;
      }

      const trucking = [];
      const traffic = [];
      const equipment = [];

      for (const row of servicesData || []) {
        const vendor = vendorsById[row.vendor_id];
        if (!vendor?.name) continue;

        if (row.service_type === "trucking") trucking.push(vendor);
        if (row.service_type === "traffic_control") traffic.push(vendor);
        if (row.service_type === "equipment_moves") equipment.push(vendor);
      }

      const dedupeByName = (items) => {
        const map = new Map();
        for (const item of items) {
          if (!map.has(item.name)) {
            map.set(item.name, item);
          }
        }
        return Array.from(map.values());
      };

      setTruckingVendorOptions(dedupeByName(trucking));
      setTrafficVendorOptions(dedupeByName(traffic));
      setEquipmentMoveVendorOptions(dedupeByName(equipment));
    } catch (err) {
      console.error("loadVendors", err);
      setTruckingVendorOptions([]);
      setTrafficVendorOptions([]);
      setEquipmentMoveVendorOptions([]);
    }
  }

  const filteredRows = useMemo(() => {
    const q = normalizeText(search);

    return rows.filter((row) => {
      if (startDate && row.service_date && row.service_date < startDate) return false;
      if (endDate && row.service_date && row.service_date > endDate) return false;
      if (!q) return true;

      const haystack = [
        row.job_number,
        row.customer_name,
        row.address,
        row.paving_foreman,
        row.milling_foreman,
        row.materials,
        row.supplier_vendor,
        row.traffic_vendor,
        row.equipment_move_vendor,
        row.traffic_control,
        row.equipment_required,
        row.equipment_moves,
        row.notes,
        row.haul_destination,
        row.trucking_notes,
        row.crew_notes,
        row.time_label,
        row.shift_label,
        row.truck_types,
        Array.isArray(row.designated_load_times)
          ? row.designated_load_times.join(" ")
          : row.designated_load_times,
        prettyTruckingAssignments(row.trucking_assignments),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [rows, startDate, endDate, search]);

  const totals = useMemo(() => {
    return {
      totalJobs: filteredRows.length,
      truckingSent: filteredRows.filter((r) => r.emailed_trucking).length,
      trafficSent: filteredRows.filter((r) => r.emailed_traffic_control).length,
      equipmentSent: filteredRows.filter((r) => r.emailed_equipment_movers).length,
      plantSent: filteredRows.filter((r) => r.plant_notified).length,
    };
  }, [filteredRows]);

  function resetToToday() {
    const today = todayString();
    setStartDate(today);
    setEndDate(today);
  }

  function openCreate() {
    setEditingId(null);
    setActiveSection("full");
    setForm({
      ...EMPTY_FORM,
      service_date: startDate || todayString(),
    });
    setShowModal(true);
  }

  function openSection(row, section) {
    setEditingId(row.id);
    setActiveSection(section);
    setForm({
      ...EMPTY_FORM,
      ...row,
      
  trucking_number_of_trucks:
    row.trucking_number_of_trucks === null ||
    row.trucking_number_of_trucks === undefined
      ? ""
      : String(row.trucking_number_of_trucks),

  trucking_assignments: Array.isArray(row.trucking_assignments)
    ? row.trucking_assignments.map((assignment, index) => {
        const timeParts = parseTimeToParts(assignment?.start_time);

        return {
          truck_number: assignment?.truck_number || index + 1,
          vendor: assignment?.vendor || row?.supplier_vendor || "",
          truck_type: assignment?.truck_type || "",
          start_hour: timeParts.start_hour,
          start_minute: timeParts.start_minute,
          start_ampm: timeParts.start_ampm,
          material_type: assignment?.material_type || "",
          start_location: assignment?.start_location || "",
        };
      })
    : [],

  // 👇 ADD THIS
  traffic_assignments: Array.isArray(row.traffic_assignments)
    ? row.traffic_assignments
    : [],
});
    setShowModal(true);
  }

  function openFullEdit(row) {
    openSection(row, "full");
  }

  function closeModal() {
    if (saving) return;
    setShowModal(false);
    setEditingId(null);
    setActiveSection("full");
    setForm(EMPTY_FORM);
  }

  function closeEmailPreview() {
    if (emailSending) return;
    setEmailPreviewOpen(false);
    setEmailGroups([]);
    setEmailDispatchId(null);
  }

  function buildTimestampPatch(field, checked) {
    const map = {
      emailed_trucking: "emailed_trucking_at",
      emailed_traffic_control: "emailed_traffic_control_at",
      emailed_equipment_movers: "emailed_equipment_movers_at",
      plant_notified: "plant_notified_at",
    };

    const tsField = map[field];
    if (!tsField) return {};
    return { [tsField]: checked ? new Date().toISOString() : null };
  }

  function updateTruckCount(value) {
    const count = Math.max(0, Number(value) || 0);

    setForm((prev) => {
      const nextAssignments = Array.from({ length: count }, (_, index) => {
        const existing = prev.trucking_assignments?.[index] || {};
        return {
          truck_number: index + 1,
          vendor: existing.vendor || prev.supplier_vendor || "",
          truck_type: existing.truck_type || "",
          start_hour: existing.start_hour || "",
          start_minute: existing.start_minute || "",
          start_ampm: existing.start_ampm || "",
          material_type: existing.material_type || "",
          start_location: existing.start_location || "",
        };
      });

      return {
        ...prev,
        trucking_number_of_trucks: value,
        trucking_assignments: nextAssignments,
      };
    });
  }

  async function addDispatchEquipment(division = "Traffic") {
  if (readOnly) return;

  const name = window.prompt(`Enter new ${division} equipment name:`);
  if (!name || !name.trim()) return;

  try {
    const { error } = await supabase.from("dispatch_equipment").insert({
      name: name.trim(),
      division,
      is_active: true,
      sort_order: 999,
    });

    if (error) throw error;

    await loadDispatchEquipment();
  } catch (err) {
    console.error(err);
    window.alert(err.message || "Failed to add equipment.");
  }
}

  function prettyTrafficAssignments(assignments) {
  return (assignments || [])
    .map((row, index) => {
      const personOrVendor =
        row?.source === "Vendor"
          ? row?.vendor || "Vendor"
          : row?.crew_name || "Internal";

      const equipmentText = Array.isArray(row?.equipment) && row.equipment.length
        ? `Equipment: ${row.equipment.join(", ")}`
        : "";

      return [
        `#${index + 1}`,
        row?.source || "Internal",
        personOrVendor,
        row?.role || "",
        row?.start_time ? `Start: ${formatTime(row.start_time)}` : "",
        equipmentText,
      ]
        .filter(Boolean)
        .join(" - ");
    })
    .filter(Boolean)
    .join("\n");
}

  function updateTruckingAssignment(index, key, value) {
    setForm((prev) => {
      const next = [...(prev.trucking_assignments || [])];
      next[index] = {
        truck_number: index + 1,
        vendor: prev.supplier_vendor || "",
        truck_type: "",
        start_hour: "",
        start_minute: "",
        start_ampm: "",
        material_type: "",
        start_location: "",
        ...next[index],
        [key]: value,
      };
      return { ...prev, trucking_assignments: next };
    });
  }

  function addTrafficAssignment(source = "Internal") {
  setForm((prev) => ({
    ...prev,
    traffic_assignments: [
      ...(prev.traffic_assignments || []),
      {
        source,
        vendor: "",
        crew_name: "",
        role: "",
        start_time: "",
        end_time: "",
        equipment: [],
        notes: "",
      },
    ],
  }));
}

function updateTrafficAssignment(index, key, value) {
  setForm((prev) => {
    const next = [...(prev.traffic_assignments || [])];

    next[index] = {
      source: "Internal",
      vendor: "",
      crew_name: "",
      role: "",
      start_time: "",
      end_time: "",
      equipment: [],
      notes: "",
      ...next[index],
      [key]: value,
    };

    return {
      ...prev,
      traffic_assignments: next,
    };
  });
}

function toggleTrafficEquipment(index, equipmentName) {
  setForm((prev) => {
    const next = [...(prev.traffic_assignments || [])];
    const current = next[index]?.equipment || [];

    const exists = current.includes(equipmentName);

    next[index] = {
      ...next[index],
      equipment: exists
        ? current.filter((item) => item !== equipmentName)
        : [...current, equipmentName],
    };

    return {
      ...prev,
      traffic_assignments: next,
    };
  });
}

function removeTrafficAssignment(index) {
  setForm((prev) => ({
    ...prev,
    traffic_assignments: (prev.traffic_assignments || []).filter(
      (_, i) => i !== index
    ),
  }));
}

  function updatePrimaryVendor(value) {
    setForm((prev) => ({
      ...prev,
      supplier_vendor: value,
      trucking_assignments: (prev.trucking_assignments || []).map((row) => ({
        ...row,
        vendor: row.vendor || value,
      })),
    }));
  }

  function openEmailPreview(dispatch) {
    if (
      !Array.isArray(dispatch?.trucking_assignments) ||
      !dispatch.trucking_assignments.length
    ) {
      window.alert("No trucking assignments to email.");
      return;
    }

    const grouped = groupTrucksByVendor(dispatch.trucking_assignments);

    const groups = Object.entries(grouped).map(([vendor, trucks]) => {
      const vendorRecord = truckingVendorOptions.find((v) => v.name === vendor);

      return {
        vendor,
        to: vendorRecord?.email || "",
        trucks,
        subject: `Dispatch Request - ${dispatch.job_number || "No Job #"} - ${
          dispatch.service_date || ""
        }`,
        body: buildVendorEmail({ dispatch, vendor, trucks }),
      };
    });

    if (!groups.length) {
      window.alert("No vendors assigned to trucks.");
      return;
    }

    setEmailGroups(groups);
    setEmailPreviewOpen(true);
    setEmailDispatchId(dispatch.id);
  }

  async function handleSendEmails() {
    try {
      setEmailSending(true);

      const missing = emailGroups.filter((g) => !g.to);
      if (missing.length) {
        alert(`Missing email for: ${missing.map((m) => m.vendor).join(", ")}`);
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-trucking-dispatch", {
        body: {
          groups: emailGroups.map((g) => ({
            vendor: g.vendor,
            to: g.to,
            subject: g.subject,
            body: g.body,
          })),
        },
      });

      if (error) throw error;

      const failed = (data?.results || []).filter((r) => !r.success);

      if (failed.length) {
        alert(
          `Some emails failed:\n${failed
            .map((f) => `${f.vendor} (${f.error})`)
            .join("\n")}`
        );
        return;
      }

      if (emailDispatchId) {
        await quickUpdate(emailDispatchId, {
          emailed_trucking: true,
          emailed_trucking_at: new Date().toISOString(),
        });
      }

      alert("Emails sent successfully!");

      setEmailPreviewOpen(false);
      setEmailGroups([]);
      setEmailDispatchId(null);

      await fetchRows(false);
    } catch (err) {
      console.error(err);
      alert("Error sending emails");
    } finally {
      setEmailSending(false);
    }
  }

  async function saveForm(e) {
    e.preventDefault();
    if (readOnly) return;

    try {
      setSaving(true);
      setError("");

      const cleanedAssignments = Array.isArray(form.trucking_assignments)
        ? form.trucking_assignments.map((row, index) => {
            const start_time = buildTimeFromParts(
              row?.start_hour,
              row?.start_minute,
              row?.start_ampm
            );

            return {
              truck_number: index + 1,
              vendor: row?.vendor || "",
              truck_type: row?.truck_type || "",
              start_time,
              material_type: row?.material_type || "",
              start_location: row?.start_location || "",
            };
          })
        : [];

      const fallbackPrimaryVendor =
        form.supplier_vendor?.trim() ||
        cleanedAssignments.find((row) => row.vendor)?.vendor ||
        null;

      const payload = {
        service_date: form.service_date || null,
        requested_time: form.requested_time || null,
        time_label: form.time_label?.trim() || null,
        shift_label: form.shift_label?.trim() || null,

        job_number: form.job_number?.trim() || null,
        customer_name: form.customer_name?.trim() || null,
        address: form.address?.trim() || null,

        weather_call_time: form.weather_call_time || null,
        crew_start_time: form.crew_start_time || null,

        paving_foreman: form.paving_foreman?.trim() || null,
        milling_foreman: form.milling_foreman?.trim() || null,
        crew_notes: form.crew_notes?.trim() || null,

        materials: form.materials?.trim() || null,

        supplier_vendor: fallbackPrimaryVendor,
        traffic_vendor: form.traffic_vendor?.trim() || null,
        equipment_move_vendor: form.equipment_move_vendor?.trim() || null,

        trucking_number_of_trucks:
          form.trucking_number_of_trucks === ""
            ? null
            : Number(form.trucking_number_of_trucks),

        trucking_assignments: cleanedAssignments,
        truck_types: prettyTruckTypes(cleanedAssignments) || null,
        designated_load_times: cleanedAssignments
          .map((row) => row.start_time)
          .filter(Boolean),

        haul_destination: form.haul_destination?.trim() || null,
        trucking_notes: form.trucking_notes?.trim() || null,

        traffic_control: form.traffic_control?.trim() || null,

        traffic_assignments: Array.isArray(form.traffic_assignments)
  ? form.traffic_assignments
  : [],

        equipment_required: form.equipment_required?.trim() || null,
        equipment_moves: form.equipment_moves?.trim() || null,

        notes: form.notes?.trim() || null,

        emailed_trucking: !!form.emailed_trucking,
        emailed_traffic_control: !!form.emailed_traffic_control,
        emailed_equipment_movers: !!form.emailed_equipment_movers,
        plant_notified: !!form.plant_notified,

        ...buildTimestampPatch("emailed_trucking", !!form.emailed_trucking),
        ...buildTimestampPatch("emailed_traffic_control", !!form.emailed_traffic_control),
        ...buildTimestampPatch(
          "emailed_equipment_movers",
          !!form.emailed_equipment_movers
        ),
        ...buildTimestampPatch("plant_notified", !!form.plant_notified),
      };

      if (editingId) {
        const { error } = await supabase
          .from("dispatch_requests")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("dispatch_requests").insert(payload);
        if (error) throw error;
      }

      closeModal();
      await fetchRows(false);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save dispatch request.");
    } finally {
      setSaving(false);
    }
  }

  async function quickUpdate(id, patch) {
    if (readOnly) return;

    try {
      const { error } = await supabase
        .from("dispatch_requests")
        .update(patch)
        .eq("id", id);

      if (error) throw error;

      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
      );
    } catch (err) {
      console.error(err);
      setError(err.message || "Update failed.");
    }
  }

  async function toggleComm(row, field) {
    const current = !!row[field];
    const next = !current;

    await quickUpdate(row.id, {
      [field]: next,
      ...buildTimestampPatch(field, next),
    });
  }

  async function deleteRow(id) {
    if (readOnly) return;
    const ok = window.confirm("Delete this dispatch request?");
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("dispatch_requests")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setRows((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      console.error(err);
      setError(err.message || "Delete failed.");
    }
  }

  const rangeLabel =
    startDate && endDate
      ? startDate === endDate
        ? formatDateLabel(startDate)
        : `${formatDateLabel(startDate)} → ${formatDateLabel(endDate)}`
      : "Custom Range";

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Dispatch Sheet</h1>
          <div style={styles.subtitle}>
            One row per job. Left to right by dispatch category.
          </div>
        </div>

        <div style={styles.headerActions}>
          <div style={styles.dateRangeWrap}>
            <div style={styles.dateRangeLabel}>From</div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.dateRangeWrap}>
            <div style={styles.dateRangeLabel}>To</div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <button type="button" style={styles.secondaryButton} onClick={resetToToday}>
            Today
          </button>

          <input
            type="text"
            placeholder="Search jobs, address, foreman, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...styles.input, minWidth: 280 }}
          />

          {!readOnly && (
            <button type="button" style={styles.primaryButton} onClick={openCreate}>
              + New Dispatch
            </button>
          )}
        </div>
      </div>

      <div style={styles.kpiRow}>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Date Range</div>
          <div style={{ ...styles.kpiValue, fontSize: 18 }}>{rangeLabel}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Total Jobs</div>
          <div style={styles.kpiValue}>{totals.totalJobs}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Trucking Sent</div>
          <div style={styles.kpiValue}>{totals.truckingSent}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Traffic Sent</div>
          <div style={styles.kpiValue}>{totals.trafficSent}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Equipment Sent</div>
          <div style={styles.kpiValue}>{totals.equipmentSent}</div>
        </div>
        <div style={styles.kpiCard}>
          <div style={styles.kpiLabel}>Plant Notified</div>
          <div style={styles.kpiValue}>{totals.plantSent}</div>
        </div>
      </div>

      {readOnly && <div style={styles.readOnlyBanner}>Manager mode: read only</div>}

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>Loading dispatch sheet...</div>
      ) : (
        <div style={styles.gridWrap}>
          <div style={styles.gridHeader}>
            <div style={{ ...styles.cell, ...styles.headerCell }}>Core Info</div>
            <div style={{ ...styles.cell, ...styles.headerCell }}>Materials</div>
            <div style={{ ...styles.cell, ...styles.headerCell }}>Trucking</div>
            <div style={{ ...styles.cell, ...styles.headerCell }}>Traffic Control</div>
            <div style={{ ...styles.cell, ...styles.headerCell }}>Required Equipment</div>
            <div style={{ ...styles.cell, ...styles.headerCell }}>Equipment Moves</div>
            <div style={{ ...styles.cell, ...styles.headerCell }}>Crew / Foremen</div>
            <div style={{ ...styles.cell, ...styles.headerCell }}>Communication</div>
          </div>

          {filteredRows.length === 0 ? (
            <div style={styles.emptyState}>No dispatch rows found for this date range.</div>
          ) : (
            filteredRows.map((row) => (
              <div key={row.id} style={styles.gridRow}>
                <div
                  style={{ ...styles.cell, ...styles.clickableCell }}
                  onClick={() => openSection(row, "core")}
                >
                  <div style={styles.jobNumber}>{compactText(row.job_number)}</div>
                  <div style={styles.smallMuted}>{compactText(row.customer_name)}</div>
                                    <div style={styles.addressBlock}>{compactText(row.address)}</div>
                  <div style={styles.lineItem}>
                    <strong>Requested:</strong> {getRequestedWindow(row)}
                  </div>
                  <div style={styles.lineItem}>
                    <strong>Weather:</strong>{" "}
                    {row.weather_call_time ? formatTime(row.weather_call_time) : "—"}
                  </div>
                  <div style={styles.lineItem}>
                    <strong>Crew Start:</strong>{" "}
                    {row.crew_start_time ? formatTime(row.crew_start_time) : "—"}
                  </div>
                  <div style={styles.lineItem}>
                    <strong>Date:</strong> {formatDateLabel(row.service_date)}
                  </div>
                </div>

                <div
                  style={{ ...styles.cell, ...styles.clickableCell }}
                  onClick={() => openSection(row, "materials")}
                >
                  <div style={styles.preWrap}>{compactText(row.materials)}</div>
                </div>

                <div
                  style={{ ...styles.cell, ...styles.clickableCell }}
                  onClick={() => openSection(row, "trucking")}
                >
                  <div style={styles.lineItem}>
                    <strong>Primary Vendor:</strong> {compactText(row.supplier_vendor)}
                  </div>

                  <div style={styles.lineItem}>
                    <strong># Trucks:</strong>{" "}
                    {row.trucking_number_of_trucks ?? "—"}
                  </div>

                  <div style={styles.lineItem}>
                    <strong>Types:</strong>{" "}
                    {compactText(
                      row.truck_types || prettyTruckTypes(row.trucking_assignments),
                      "—"
                    )}
                  </div>

                  <div style={styles.lineItem}>
                    <strong>Assignments:</strong>
                  </div>

                  <div style={styles.preWrapSmall}>
                    {compactText(
                      prettyTruckingAssignments(row.trucking_assignments),
                      "—"
                    )}
                  </div>

                  <div style={styles.lineItem}>
                    <strong>Haul:</strong> {compactText(row.haul_destination)}
                  </div>

                  {!!row.trucking_notes && (
                    <div style={styles.preWrapSmall}>{row.trucking_notes}</div>
                  )}
                </div>

                <div
                  style={{ ...styles.cell, ...styles.clickableCell }}
                  onClick={() => openSection(row, "traffic")}
                >
                  <div style={styles.lineItem}>
                    <strong>Assignments:</strong>
                  </div>

                  <div style={styles.preWrapSmall}>
                  {compactText(prettyTrafficAssignments(row.traffic_assignments), "—")}
                  </div>

                  {!!row.traffic_control && (
                <>
                  <div style={{ ...styles.lineItem, marginTop: 8 }}>
                  <strong>Notes:</strong>
                </div>
                <div style={styles.preWrapSmall}>{row.traffic_control}</div>
              </>
                )}
                </div>

                <div
                  style={{ ...styles.cell, ...styles.clickableCell }}
                  onClick={() => openSection(row, "equipment_required")}
                >
                  <div style={styles.preWrap}>
                    {compactText(row.equipment_required)}
                  </div>
                </div>

                <div
                  style={{ ...styles.cell, ...styles.clickableCell }}
                  onClick={() => openSection(row, "equipment_moves")}
                >
                  <div style={styles.lineItem}>
                    <strong>Vendor:</strong>{" "}
                    {compactText(row.equipment_move_vendor)}
                  </div>
                  <div style={styles.preWrap}>{compactText(row.equipment_moves)}</div>
                </div>

                <div
                  style={{ ...styles.cell, ...styles.clickableCell }}
                  onClick={() => openSection(row, "crew")}
                >
                  <div style={styles.lineItem}>
                    <strong>Paving:</strong> {compactText(row.paving_foreman)}
                  </div>
                  <div style={styles.lineItem}>
                    <strong>Milling:</strong> {compactText(row.milling_foreman)}
                  </div>
                  <div style={styles.preWrapSmall}>
                    {compactText(row.crew_notes)}
                  </div>
                  {row.notes && (
                    <>
                      <div style={{ ...styles.lineItem, marginTop: 8 }}>
                        <strong>Notes:</strong>
                      </div>
                      <div style={styles.preWrapSmall}>{row.notes}</div>
                    </>
                  )}
                </div>

                <div style={styles.cell} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    style={styles.sectionButton}
                    onClick={() => openFullEdit(row)}
                  >
                    Full Edit
                  </button>

                  <button
                    type="button"
                    style={{ ...styles.sectionButton, marginBottom: 12 }}
                    onClick={() => openEmailPreview(row)}
                  >
                    Prepare Trucking Emails
                  </button>

                  <label style={styles.commRow}>
                    <input
                      type="checkbox"
                      checked={!!row.emailed_trucking}
                      onChange={() => toggleComm(row, "emailed_trucking")}
                    />
                    <span>Trucking</span>
                  </label>
                  <div style={styles.timeStampLine}>
                    {row.emailed_trucking_at
                      ? formatDateTime(row.emailed_trucking_at)
                      : "—"}
                  </div>

                  <label style={styles.commRow}>
                    <input
                      type="checkbox"
                      checked={!!row.emailed_traffic_control}
                      onChange={() => toggleComm(row, "emailed_traffic_control")}
                    />
                    <span>Traffic</span>
                  </label>
                  <div style={styles.timeStampLine}>
                    {row.emailed_traffic_control_at
                      ? formatDateTime(row.emailed_traffic_control_at)
                      : "—"}
                  </div>

                  <label style={styles.commRow}>
                    <input
                      type="checkbox"
                      checked={!!row.emailed_equipment_movers}
                      onChange={() => toggleComm(row, "emailed_equipment_movers")}
                    />
                    <span>Equipment</span>
                  </label>
                  <div style={styles.timeStampLine}>
                    {row.emailed_equipment_movers_at
                      ? formatDateTime(row.emailed_equipment_movers_at)
                      : "—"}
                  </div>

                  <label style={styles.commRow}>
                    <input
                      type="checkbox"
                      checked={!!row.plant_notified}
                      onChange={() => toggleComm(row, "plant_notified")}
                    />
                    <span>Plant</span>
                  </label>
                  <div style={styles.timeStampLine}>
                    {row.plant_notified_at
                      ? formatDateTime(row.plant_notified_at)
                      : "—"}
                  </div>

                  {!readOnly && (
                    <button
                      type="button"
                      style={styles.deleteLink}
                      onClick={() => deleteRow(row.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showModal && (
        <div style={styles.modalOverlay} onClick={closeModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>
                  {editingId ? "Edit Dispatch" : "New Dispatch"}
                </h2>
                <div style={styles.modalSubtitle}>
                  {activeSection === "full"
                    ? "Full dispatch edit."
                    : `Editing ${activeSection} section.`}
                </div>
              </div>
              <button type="button" style={styles.closeButton} onClick={closeModal}>
                ×
              </button>
            </div>

            <form onSubmit={saveForm} style={styles.formGrid}>
              {(activeSection === "core" || activeSection === "full") && (
                <>
                  <SectionTitle>Job Details</SectionTitle>

                  <Field label="Service Date">
                    <input
                      type="date"
                      value={form.service_date}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          service_date: e.target.value,
                        }))
                      }
                      style={styles.input}
                      required
                    />
                  </Field>

                  <Field label="Requested Time">
                    <input
                      type="time"
                      value={form.requested_time || ""}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          requested_time: e.target.value,
                        }))
                      }
                      style={styles.input}
                    />
                  </Field>

                  <Field label="Shift">
                    <select
                      value={form.shift_label}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          shift_label: e.target.value,
                        }))
                      }
                      style={styles.input}
                    >
                      {SHIFT_OPTIONS.map((option) => (
                        <option key={option || "blank"} value={option}>
                          {option || "Select shift"}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Time Label">
                    <input
                      type="text"
                      value={form.time_label}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          time_label: e.target.value,
                        }))
                      }
                      style={styles.input}
                      placeholder="ASAP / after paving / staggered"
                    />
                  </Field>

                  <Field label="Job #">
                    <input
                      type="text"
                      value={form.job_number}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          job_number: e.target.value,
                        }))
                      }
                      style={styles.input}
                    />
                  </Field>

                  <Field label="Customer / Crew">
                    <input
                      type="text"
                      value={form.customer_name}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          customer_name: e.target.value,
                        }))
                      }
                      style={styles.input}
                    />
                  </Field>

                  <Field label="Weather Call Time">
                    <input
                      type="time"
                      value={form.weather_call_time || ""}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          weather_call_time: e.target.value,
                        }))
                      }
                      style={styles.input}
                    />
                  </Field>

                  <Field label="Crew Start Time">
                    <input
                      type="time"
                      value={form.crew_start_time || ""}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          crew_start_time: e.target.value,
                        }))
                      }
                      style={styles.input}
                    />
                  </Field>

                  <Field label="Address" fullWidth>
                    <textarea
                      value={form.address}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                      rows={3}
                      style={styles.textarea}
                    />
                  </Field>
                </>
              )}

              {(activeSection === "materials" || activeSection === "full") && (
                <>
                  <SectionTitle>Materials</SectionTitle>
                  <Field label="Materials" fullWidth>
                    <textarea
                      value={form.materials}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          materials: e.target.value,
                        }))
                      }
                      rows={5}
                      style={styles.textarea}
                    />
                  </Field>
                </>
              )}

              {(activeSection === "trucking" || activeSection === "full") && (
                <>
                  <SectionTitle>Trucking</SectionTitle>

                  <Field label="Primary Trucking Vendor">
                    <select
                      value={form.supplier_vendor}
                      onChange={(e) => updatePrimaryVendor(e.target.value)}
                      style={styles.input}
                    >
                      <option value="">Select default vendor</option>
                      {truckingVendorOptions.map((vendor) => (
                        <option key={vendor.id} value={vendor.name}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Number of Trucks">
                    <input
                      type="number"
                      min="0"
                      value={form.trucking_number_of_trucks}
                      onChange={(e) => updateTruckCount(e.target.value)}
                      style={styles.input}
                    />
                  </Field>

                  <Field label="Truck Assignments" fullWidth>
                    <div style={styles.assignmentTableWrap}>
                      {Number(form.trucking_number_of_trucks || 0) <= 0 ? (
                        <div style={styles.smallMuted}>
                          Enter the number of trucks first.
                        </div>
                      ) : (
                        <div style={styles.assignmentTable}>
                          <div style={styles.assignmentHeader}>Truck #</div>
                          <div style={styles.assignmentHeader}>Vendor</div>
                          <div style={styles.assignmentHeader}>Truck Type</div>
                          <div style={styles.assignmentHeader}>Hour</div>
                          <div style={styles.assignmentHeader}>Minute</div>
                          <div style={styles.assignmentHeader}>AM/PM</div>
                          <div style={styles.assignmentHeader}>Material</div>
                          <div style={styles.assignmentHeader}>Start Location</div>

                          {(form.trucking_assignments || []).map((row, index) => (
                            <React.Fragment key={index}>
                              <div style={styles.assignmentCellLabel}>
                                Truck {index + 1}
                              </div>

                              <select
                                value={row.vendor || ""}
                                onChange={(e) =>
                                  updateTruckingAssignment(index, "vendor", e.target.value)
                                }
                                style={styles.input}
                              >
                                <option value="">Select vendor</option>
                                {truckingVendorOptions.map((vendor) => (
                                  <option key={vendor.id} value={vendor.name}>
                                    {vendor.name}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={row.truck_type || ""}
                                onChange={(e) =>
                                  updateTruckingAssignment(index, "truck_type", e.target.value)
                                }
                                style={styles.input}
                              >
                                <option value="">Select type</option>
                                {TRUCK_TYPE_OPTIONS.map((option) => (
                                  <option key={option.code} value={option.code}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={row.start_hour || ""}
                                onChange={(e) =>
                                  updateTruckingAssignment(index, "start_hour", e.target.value)
                                }
                                style={styles.input}
                              >
                                {HOUR_OPTIONS.map((hour) => (
                                  <option key={hour || "blank"} value={hour}>
                                    {hour || "Hr"}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={row.start_minute || ""}
                                onChange={(e) =>
                                  updateTruckingAssignment(index, "start_minute", e.target.value)
                                }
                                style={styles.input}
                              >
                                {MINUTE_OPTIONS.map((minute) => (
                                  <option key={minute || "blank"} value={minute}>
                                    {minute || "Min"}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={row.start_ampm || ""}
                                onChange={(e) =>
                                  updateTruckingAssignment(index, "start_ampm", e.target.value)
                                }
                                style={styles.input}
                              >
                                {AMPM_OPTIONS.map((option) => (
                                  <option key={option || "blank"} value={option}>
                                    {option || "AM/PM"}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={row.material_type || ""}
                                onChange={(e) =>
                                  updateTruckingAssignment(index, "material_type", e.target.value)
                                }
                                style={styles.input}
                              >
                                {MATERIAL_TYPE_OPTIONS.map((option) => (
                                  <option key={option || "blank"} value={option}>
                                    {option || "Select material"}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={row.start_location || ""}
                                onChange={(e) =>
                                  updateTruckingAssignment(index, "start_location", e.target.value)
                                }
                                style={styles.input}
                              >
                                {START_LOCATION_OPTIONS.map((option) => (
                                  <option key={option || "blank"} value={option}>
                                    {option || "Select location"}
                                  </option>
                                ))}
                              </select>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  </Field>

                  <Field label="Haul Destination">
                    <textarea
                      value={form.haul_destination}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          haul_destination: e.target.value,
                        }))
                      }
                      rows={3}
                      style={styles.textarea}
                    />
                  </Field>

                  <Field label="Trucking Notes" fullWidth>
                    <textarea
                      value={form.trucking_notes}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          trucking_notes: e.target.value,
                        }))
                      }
                      rows={4}
                      style={styles.textarea}
                    />
                  </Field>
                </>
              )}

              {(activeSection === "traffic" || activeSection === "full") && (
                <>
                  <SectionTitle>Traffic Control</SectionTitle>

                  <Field label="Traffic Vendor">
                    <select
                      value={form.traffic_vendor}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          traffic_vendor: e.target.value,
                        }))
                      }
                      style={styles.input}
                    >
                      <option value="">Select traffic vendor</option>
                      {trafficVendorOptions.map((vendor) => (
                        <option key={vendor.id} value={vendor.name}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Traffic Assignments" fullWidth>
  <div style={styles.trafficToolbar}>
    <button
      type="button"
      style={styles.secondaryButton}
      onClick={() => addTrafficAssignment("Internal")}
    >
      + Add Internal
    </button>

    <button
      type="button"
      style={styles.secondaryButton}
      onClick={() => addTrafficAssignment("Vendor")}
    >
      + Add Vendor
    </button>
  </div>

  {(form.traffic_assignments || []).length === 0 ? (
    <div style={styles.smallMuted}>
      No traffic assignments added yet.
    </div>
  ) : (
    <div style={styles.trafficAssignmentList}>
      {(form.traffic_assignments || []).map((assignment, index) => {
        const trafficEquipment = dispatchEquipmentOptions.filter(
          (item) => item.division === "Traffic"
        );

        return (
          <div key={index} style={styles.trafficAssignmentCard}>
            <div style={styles.trafficAssignmentHeader}>
              <strong>Traffic Assignment #{index + 1}</strong>

              <button
                type="button"
                style={styles.deleteLink}
                onClick={() => removeTrafficAssignment(index)}
              >
                Remove
              </button>
            </div>

            <div style={styles.trafficGrid}>
              <Field label="Source">
                <select
                  value={assignment.source || "Internal"}
                  onChange={(e) =>
                    updateTrafficAssignment(index, "source", e.target.value)
                  }
                  style={styles.input}
                >
                  <option value="Internal">Internal</option>
                  <option value="Vendor">Vendor</option>
                </select>
              </Field>

              {assignment.source === "Vendor" ? (
                <Field label="Vendor">
                  <select
                    value={assignment.vendor || ""}
                    onChange={(e) =>
                      updateTrafficAssignment(index, "vendor", e.target.value)
                    }
                    style={styles.input}
                  >
                    <option value="">Select traffic vendor</option>
                    {trafficVendorOptions.map((vendor) => (
                      <option key={vendor.id} value={vendor.name}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Internal Crew / Person">
                  <input
                    type="text"
                    value={assignment.crew_name || ""}
                    onChange={(e) =>
                      updateTrafficAssignment(index, "crew_name", e.target.value)
                    }
                    style={styles.input}
                    placeholder="ARC Traffic / Jason / Crew name"
                  />
                </Field>
              )}

              <Field label="Role / Requirement">
                <input
                  type="text"
                  value={assignment.role || ""}
                  onChange={(e) =>
                    updateTrafficAssignment(index, "role", e.target.value)
                  }
                  style={styles.input}
                  placeholder="LCT / TCP / 2 TCPs / Lane closure"
                />
              </Field>

              <Field label="Start Time">
                <input
                  type="time"
                  value={assignment.start_time || ""}
                  onChange={(e) =>
                    updateTrafficAssignment(index, "start_time", e.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="End Time">
                <input
                  type="time"
                  value={assignment.end_time || ""}
                  onChange={(e) =>
                    updateTrafficAssignment(index, "end_time", e.target.value)
                  }
                  style={styles.input}
                />
              </Field>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={styles.equipmentHeaderRow}>
  <div style={styles.fieldLabel}>Equipment</div>

  {!readOnly && (
    <button
      type="button"
      style={styles.smallAddButton}
      onClick={() => addDispatchEquipment("Traffic")}
    >
      + Add Equipment
    </button>
  )}
</div>

              {trafficEquipment.length === 0 ? (
                <div style={styles.smallMuted}>
                  No active Traffic equipment found.
                </div>
              ) : (
                <div style={styles.equipmentChipWrap}>
                  {trafficEquipment.map((item) => {
                    const checked = (assignment.equipment || []).includes(
                      item.name
                    );

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          toggleTrafficEquipment(index, item.name)
                        }
                        style={{
                          ...styles.equipmentChip,
                          ...(checked ? styles.equipmentChipActive : {}),
                        }}
                      >
                        {checked ? "✓ " : ""}
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ marginTop: 10 }}>
              <Field label="Notes" fullWidth>
                <textarea
                  value={assignment.notes || ""}
                  onChange={(e) =>
                    updateTrafficAssignment(index, "notes", e.target.value)
                  }
                  rows={3}
                  style={styles.textarea}
                  placeholder="Setup notes, lane closure notes, contact notes..."
                />
              </Field>
            </div>
          </div>
        );
      })}
    </div>
  )}
</Field>

<Field label="Traffic Notes / Summary" fullWidth>
  <textarea
    value={form.traffic_control}
    onChange={(e) =>
      setForm((prev) => ({
        ...prev,
        traffic_control: e.target.value,
      }))
    }
    rows={4}
    style={styles.textarea}
    placeholder="Optional summary notes"
  />
</Field>
                </>
              )}

              {(activeSection === "equipment_required" ||
                activeSection === "full") && (
                <>
                  <SectionTitle>Required Equipment</SectionTitle>
                  <Field label="Required Equipment" fullWidth>
                    <textarea
                      value={form.equipment_required}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          equipment_required: e.target.value,
                        }))
                      }
                      rows={5}
                      style={styles.textarea}
                      placeholder={"Tack pot\nSmall combi\nJack hammer and compressor"}
                    />
                  </Field>
                </>
              )}

              {(activeSection === "equipment_moves" ||
                activeSection === "full") && (
                <>
                  <SectionTitle>Equipment Moves</SectionTitle>

                  <Field label="Equipment Move Vendor">
                    <select
                      value={form.equipment_move_vendor}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          equipment_move_vendor: e.target.value,
                        }))
                      }
                      style={styles.input}
                    >
                      <option value="">Select equipment mover</option>
                      {equipmentMoveVendorOptions.map((vendor) => (
                        <option key={vendor.id} value={vendor.name}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Equipment Moves" fullWidth>
                    <textarea
                      value={form.equipment_moves}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          equipment_moves: e.target.value,
                        }))
                      }
                      rows={5}
                      style={styles.textarea}
                      placeholder={"Need sprayer\nBring mini paver\nMove skid steer"}
                    />
                  </Field>
                </>
              )}

              {(activeSection === "crew" || activeSection === "full") && (
                <>
                  <SectionTitle>Crew / Foremen</SectionTitle>

                  <Field label="Paving Foreman">
                    <input
                      type="text"
                      value={form.paving_foreman}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          paving_foreman: e.target.value,
                        }))
                      }
                      style={styles.input}
                    />
                  </Field>

                  <Field label="Milling Foreman">
                    <input
                      type="text"
                      value={form.milling_foreman}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          milling_foreman: e.target.value,
                        }))
                      }
                      style={styles.input}
                    />
                  </Field>

                  <Field label="Crew Notes" fullWidth>
                    <textarea
                      value={form.crew_notes}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          crew_notes: e.target.value,
                        }))
                      }
                      rows={5}
                      style={styles.textarea}
                    />
                  </Field>

                  <Field label="General Notes" fullWidth>
                    <textarea
                      value={form.notes}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          notes: e.target.value,
                        }))
                      }
                      rows={5}
                      style={styles.textarea}
                    />
                  </Field>
                </>
              )}

              {activeSection === "full" && (
                <>
                  <SectionTitle>Communication</SectionTitle>

                  <label style={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={!!form.emailed_trucking}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          emailed_trucking: e.target.checked,
                        }))
                      }
                    />
                    Trucking Sent
                  </label>

                  <label style={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={!!form.emailed_traffic_control}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          emailed_traffic_control: e.target.checked,
                        }))
                      }
                    />
                    Traffic Control Sent
                  </label>

                  <label style={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={!!form.emailed_equipment_movers}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          emailed_equipment_movers: e.target.checked,
                        }))
                      }
                    />
                    Equipment Sent
                  </label>

                  <label style={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={!!form.plant_notified}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          plant_notified: e.target.checked,
                        }))
                      }
                    />
                    Plant Notified
                  </label>
                </>
              )}

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={closeModal}
                >
                  Cancel
                </button>

                {!readOnly && (
                  <button
                    type="submit"
                    style={styles.primaryButton}
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : editingId
                      ? "Save Changes"
                      : "Create Dispatch"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {emailPreviewOpen && (
        <div style={styles.modalOverlay} onClick={closeEmailPreview}>
          <div style={styles.emailModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>Trucking Email Preview</h2>
                <div style={styles.modalSubtitle}>
                  One email preview per vendor.
                </div>
              </div>
              <button
                type="button"
                style={styles.closeButton}
                onClick={closeEmailPreview}
              >
                ×
              </button>
            </div>

            {emailGroups.length === 0 ? (
              <div style={styles.emptyState}>No trucking emails to preview.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {emailGroups.map((group) => (
                  <div key={group.vendor} style={styles.emailCard}>
                    <div style={styles.emailCardHeader}>
                      <div>
                        <div style={styles.emailVendorTitle}>{group.vendor}</div>
                        <div style={styles.emailTruckCount}>
                          Email: {group.to || "Missing email"}
                        </div>
                      </div>

                      <div style={styles.emailTruckCount}>
                        Trucks: {group.trucks.length}
                      </div>
                    </div>

                    <textarea
                      readOnly
                      value={group.body}
                      style={styles.emailTextarea}
                    />
                  </div>
                ))}
              </div>
            )}

            <div style={styles.modalFooter}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={closeEmailPreview}
                disabled={emailSending}
              >
                Cancel
              </button>

              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleSendEmails}
                disabled={emailSending || emailGroups.length === 0}
              >
                {emailSending ? "Sending..." : "Send All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f4f6f8",
    padding: 16,
    boxSizing: "border-box",
  },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 16,
  },

  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
    color: TEXT,
  },

  subtitle: {
    marginTop: 6,
    color: TEXT,
    fontSize: 14,
  },

  headerActions: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
    flexWrap: "wrap",
  },

  dateRangeWrap: {
    minWidth: 150,
  },

  dateRangeLabel: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: TEXT,
    marginBottom: 6,
  },

  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
    marginBottom: 14,
  },

  kpiCard: {
    background: "#ffffff",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },

  kpiLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: TEXT,
    marginBottom: 6,
  },

  kpiValue: {
    fontSize: 24,
    fontWeight: 800,
    color: TEXT,
  },

  gridWrap: {
    overflowX: "auto",
    paddingBottom: 8,
  },

  gridHeader: {
    display: "grid",
    gridTemplateColumns:
      "320px 220px 320px 220px 220px 220px 260px 220px",
    gap: 8,
    marginBottom: 8,
    minWidth: 2050,
  },

  gridRow: {
    display: "grid",
    gridTemplateColumns:
      "320px 220px 320px 220px 220px 220px 260px 220px",
    gap: 8,
    marginBottom: 8,
    minWidth: 2050,
  },

  cell: {
    background: "#ffffff",
    borderRadius: 14,
    padding: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    minHeight: 120,
    color: TEXT,
  },

  headerCell: {
    background: "#dbe7f3",
    fontWeight: 800,
    color: TEXT,
    minHeight: "auto",
  },

  clickableCell: {
    cursor: "pointer",
  },

  sectionButton: {
    width: "100%",
    marginBottom: 10,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: TEXT,
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },

  jobNumber: {
    fontSize: 18,
    fontWeight: 800,
    color: TEXT,
    marginBottom: 4,
  },

  smallMuted: {
    fontSize: 12,
    color: TEXT,
    marginBottom: 6,
  },

  addressBlock: {
    fontSize: 13,
    fontWeight: 700,
    color: TEXT,
    whiteSpace: "pre-wrap",
    marginBottom: 8,
  },

  lineItem: {
    fontSize: 13,
    color: TEXT,
    marginBottom: 6,
    whiteSpace: "pre-wrap",
  },

  preWrap: {
    fontSize: 13,
    color: TEXT,
    whiteSpace: "pre-wrap",
    lineHeight: 1.45,
  },

  preWrapSmall: {
    fontSize: 12,
    color: TEXT,
    whiteSpace: "pre-wrap",
    lineHeight: 1.45,
  },

  commRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
    color: TEXT,
    marginBottom: 4,
  },

  timeStampLine: {
    fontSize: 11,
    color: TEXT,
    marginBottom: 8,
    paddingLeft: 22,
  },

  deleteLink: {
    marginTop: 8,
    border: "none",
    background: "transparent",
    color: "#b91c1c",
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
  },

  input: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    boxSizing: "border-box",
    background: "#ffffff",
    color: TEXT,
  },

  textarea: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "inherit",
    background: "#ffffff",
    color: TEXT,
  },

  primaryButton: {
    border: "none",
    background: "#b91c1c",
    color: "#ffffff",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },

  secondaryButton: {
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: TEXT,
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },

  error: {
    background: "#fee2e2",
    color: "#991b1b",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontWeight: 600,
  },

  readOnlyBanner: {
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontWeight: 700,
  },

  loading: {
    background: "#ffffff",
    borderRadius: 14,
    padding: 20,
    fontWeight: 700,
    color: TEXT,
  },

  emptyState: {
    background: "#ffffff",
    borderRadius: 14,
    padding: 24,
    fontWeight: 700,
    color: TEXT,
    textAlign: "center",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    zIndex: 3000,
  },

  modal: {
    width: "min(1440px, 100%)",
    maxHeight: "92vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  },

  emailModal: {
    width: "min(980px, 100%)",
    maxHeight: "92vh",
    overflowY: "auto",
    background: "#ffffff",
    borderRadius: 18,
    padding: 18,
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },

  modalTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800,
    color: TEXT,
  },

  modalSubtitle: {
    fontSize: 13,
    color: TEXT,
    marginTop: 4,
  },

  closeButton: {
    border: "none",
    background: "transparent",
    fontSize: 28,
    lineHeight: 1,
    cursor: "pointer",
    color: TEXT,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
  },

  fullWidth: {
    gridColumn: "1 / -1",
  },

  fieldWrap: {
    display: "block",
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: TEXT,
    marginBottom: 6,
  },

  sectionTitle: {
    gridColumn: "1 / -1",
    fontSize: 15,
    fontWeight: 800,
    color: TEXT,
    paddingTop: 6,
    marginTop: 6,
    borderTop: "1px solid #e2e8f0",
  },

  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 700,
    color: TEXT,
    minHeight: 42,
  },

  modalFooter: {
    gridColumn: "1 / -1",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },

  assignmentTableWrap: {
    overflowX: "auto",
  },

  assignmentTable: {
    display: "grid",
    gridTemplateColumns: "110px 1.4fr 1.25fr 90px 90px 100px 1.15fr 1.15fr",
    gap: 8,
    alignItems: "center",
    minWidth: 1180,
  },

  assignmentHeader: {
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: TEXT,
    padding: "4px 0",
  },

  assignmentCellLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: TEXT,
  },

  emailCard: {
    border: "1px solid #d1d5db",
    borderRadius: 12,
    padding: 12,
    background: "#ffffff",
  },

  emailCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    flexWrap: "wrap",
  },

  emailVendorTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: TEXT,
  },

  emailTruckCount: {
    fontSize: 12,
    fontWeight: 700,
    color: "#475569",
  },

  emailTextarea: {
    width: "100%",
    minHeight: 220,
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "inherit",
    background: "#f8fafc",
    color: TEXT,
  },
  trafficToolbar: {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
},

trafficAssignmentList: {
  display: "grid",
  gap: 12,
},

trafficAssignmentCard: {
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  padding: 12,
  background: "#f8fafc",
},

trafficAssignmentHeader: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
  color: TEXT,
},

trafficGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
},

equipmentChipWrap: {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
},

equipmentChip: {
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: TEXT,
  borderRadius: 999,
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
},

equipmentChipActive: {
  background: "#dcfce7",
  borderColor: "#16a34a",
},

equipmentHeaderRow: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 6,
},

smallAddButton: {
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: TEXT,
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
},
};