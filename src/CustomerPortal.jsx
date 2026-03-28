import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);
const AM_PM = ["AM", "PM"];

function convertTo24Hour(hour, minute, ampm) {
  let h = parseInt(hour, 10);
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function convert24ToParts(hhmm) {
  if (!hhmm || !String(hhmm).includes(":")) {
    return { hour: "7", min: "00", ampm: "AM" };
  }

  const [hhStr, mmStr] = String(hhmm).split(":");
  let hh = parseInt(hhStr, 10);
  const mm = String(parseInt(mmStr, 10)).padStart(2, "0");

  if (Number.isNaN(hh)) {
    return { hour: "7", min: "00", ampm: "AM" };
  }

  const ampm = hh >= 12 ? "PM" : "AM";
  let hour12 = hh % 12;
  if (hour12 === 0) hour12 = 12;

  return {
    hour: String(hour12),
    min: mm,
    ampm,
  };
}

function formatPrettyTime(hhmm) {
  if (!hhmm || !String(hhmm).includes(":")) return "";
  const [hhStr, mmStr] = String(hhmm).split(":");
  const hh = parseInt(hhStr, 10);
  const mm = String(parseInt(mmStr, 10)).padStart(2, "0");

  if (Number.isNaN(hh)) return String(hhmm);

  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = ((hh + 11) % 12) + 1;

  return `${hour12}:${mm} ${ampm}`;
}

function formatDatePretty(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString();
}

function toLocalISODate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateStr, delta) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toLocalISODate(dt);
}

function getTruckCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(20, Math.floor(n));
}

function normalizeDesignatedTimes(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, idx) => {
      if (typeof item === "string") {
        const parts = convert24ToParts(item);
        return {
          truck_number: idx + 1,
          start_time: item,
          hour: parts.hour,
          min: parts.min,
          ampm: parts.ampm,
        };
      }

      const start = item?.start_time || item?.time || "";
      const parts = convert24ToParts(start);

      return {
        truck_number: Number(item?.truck_number || idx + 1),
        start_time: start,
        hour: String(item?.hour || parts.hour),
        min: String(item?.min || parts.min),
        ampm: String(item?.ampm || parts.ampm),
      };
    })
    .filter(Boolean);
}

function resizeDesignatedTimes(existing, count, defaultTime24 = "07:00") {
  const normalized = normalizeDesignatedTimes(existing);
  const safeCount = Math.max(0, Number(count) || 0);
  const next = [];

  for (let i = 0; i < safeCount; i += 1) {
    const existingItem = normalized[i];

    if (existingItem) {
      next.push({
        ...existingItem,
        truck_number: i + 1,
      });
    } else {
      const parts = convert24ToParts(defaultTime24);
      next.push({
        truck_number: i + 1,
        start_time: defaultTime24,
        hour: parts.hour,
        min: parts.min,
        ampm: parts.ampm,
      });
    }
  }

  return next;
}

function buildEmptyForm(customerName = "") {
  return {
    customer: customerName,
    mix_type: "",
    quantity_tonne: "",
    order_date: toLocalISODate(),
    address: "",
    site_contact_name: "",
    site_contact_phone: "",
    job_number: "",
    po_number: "",
    foreman: "",
    notes: "",
    trucks_working: "",
    truck_schedule_mode: "stagger",
    stagger_minutes: "",
    designated_times: [],
    weather_call: false,
    load_hour: "7",
    load_min: "00",
    load_ampm: "AM",
    weather_hour: "7",
    weather_min: "00",
    weather_ampm: "AM",
  };
}

export default function CustomerPortal() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [lockedCustomer, setLockedCustomer] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [mixOptions, setMixOptions] = useState([]);
  const [loadingMixes, setLoadingMixes] = useState(true);

  const [customerOrders, setCustomerOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersViewDate, setOrdersViewDate] = useState(toLocalISODate());

  const [form, setForm] = useState(buildEmptyForm());
  const [editForm, setEditForm] = useState(buildEmptyForm());

  const [designatedTimesOpen, setDesignatedTimesOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editDesignatedTimesOpen, setEditDesignatedTimesOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        window.location.pathname = "/";
        return;
      }

      setSession(session);
      setAuthChecked(true);
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      if (!nextSession) {
        window.location.pathname = "/";
        return;
      }

      setSession(nextSession);
      setAuthChecked(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    loadMixes();
    loadLockedCustomer();
  }, [session]);

  async function handleForgotPassword() {
    const cleanEmail = String(session?.user?.email || "").trim().toLowerCase();

    if (!cleanEmail) {
      alert("No email found for this account.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: "https://plant-orders.vercel.app/customer/reset-password",
    });

    if (error) {
      console.error("Password reset error:", error);
      alert(error.message);
      return;
    }

    alert("Password reset email sent.");
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout error:", error);
      alert(error.message);
      return;
    }

    setLockedCustomer("");
    setCustomerOrders([]);
    setLoadingOrders(true);
    setForm(buildEmptyForm());
    setEditForm(buildEmptyForm());
    setEditingOrderId(null);
    setEditOpen(false);
    setDesignatedTimesOpen(false);
    setEditDesignatedTimesOpen(false);

    window.location.pathname = "/";
  }

  async function loadMixes() {
    setLoadingMixes(true);

    const { data, error } = await supabase
      .from("products")
      .select("name, is_active")
      .order("name", { ascending: true });

    if (error) {
      console.error("Mix load error:", error);
      setMixOptions([]);
      setLoadingMixes(false);
      return;
    }

    const names = (data || [])
      .filter((row) => row.is_active === true || row.is_active == null)
      .map((row) => String(row.name || "").trim())
      .filter(Boolean);

    setMixOptions(names);
    setLoadingMixes(false);
  }

  async function loadLockedCustomer() {
    setLoadingProfile(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("User not found");
      }

      const { data, error } = await supabase
        .from("customer_accounts")
        .select(
          "id, company_name, active, auth_user_id, can_edit_unacknowledged"
        )
        .eq("auth_user_id", user.id)
        .single();

      if (error || !data) {
        throw new Error("Account not linked");
      }

      if (!data.active) {
        alert("This customer account is inactive. Please contact the plant.");
        await supabase.auth.signOut();
        window.location.pathname = "/";
        return;
      }

      const customerName = String(data.company_name || "").trim();
      setLockedCustomer(customerName);
      setForm(buildEmptyForm(customerName));
      setEditForm(buildEmptyForm(customerName));
      await loadCustomerOrders(customerName);
    } catch (err) {
      console.error("Profile load error:", err);
      alert(
        "This login is not linked to a customer account yet. Please contact the plant."
      );
      await supabase.auth.signOut();
      window.location.pathname = "/";
    } finally {
      setLoadingProfile(false);
    }
  }

  async function loadCustomerOrders(customerName) {
    const cleanCustomer = String(customerName || "").trim();

    if (!cleanCustomer) {
      setCustomerOrders([]);
      setLoadingOrders(false);
      return;
    }

    setLoadingOrders(true);

    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        customer,
        customer_owner,
        mix_type,
        quantity_tonne,
        order_date,
        load_time,
        address,
        site_contact_name,
        site_contact_phone,
        job_number,
        po_number,
        foreman,
        notes,
        weather_call,
        weather_call_time,
        trucks_working,
        truck_schedule_mode,
        stagger_minutes,
        designated_start_times,
        status,
        created_at
      `)
      .or(`customer_owner.eq.${cleanCustomer},customer.eq.${cleanCustomer}`)
      .order("order_date", { ascending: false })
      .order("load_time", { ascending: true });

    if (error) {
      console.error("Customer orders load error:", error);
      setCustomerOrders([]);
      setLoadingOrders(false);
      return;
    }

    setCustomerOrders(data || []);
    setLoadingOrders(false);
  }

  function setField(name, value) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function setEditField(name, value) {
    setEditForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function setTruckScheduleMode(mode) {
    setForm((prev) => {
      const count = getTruckCount(prev.trucks_working);
      const defaultTime = convertTo24Hour(
        prev.load_hour,
        prev.load_min,
        prev.load_ampm
      );

      return {
        ...prev,
        truck_schedule_mode: mode,
        stagger_minutes: mode === "stagger" ? prev.stagger_minutes : "",
        designated_times:
          mode === "designated"
            ? resizeDesignatedTimes(prev.designated_times, count, defaultTime)
            : [],
      };
    });
  }

  function setEditTruckScheduleMode(mode) {
    setEditForm((prev) => {
      const count = getTruckCount(prev.trucks_working);
      const defaultTime = convertTo24Hour(
        prev.load_hour,
        prev.load_min,
        prev.load_ampm
      );

      return {
        ...prev,
        truck_schedule_mode: mode,
        stagger_minutes: mode === "stagger" ? prev.stagger_minutes : "",
        designated_times:
          mode === "designated"
            ? resizeDesignatedTimes(prev.designated_times, count, defaultTime)
            : [],
      };
    });
  }

  function setTrucksWorking(value) {
    setForm((prev) => {
      const defaultTime = convertTo24Hour(
        prev.load_hour,
        prev.load_min,
        prev.load_ampm
      );
      const count = getTruckCount(value);

      return {
        ...prev,
        trucks_working: value,
        designated_times:
          prev.truck_schedule_mode === "designated"
            ? resizeDesignatedTimes(prev.designated_times, count, defaultTime)
            : prev.designated_times,
      };
    });
  }

  function setEditTrucksWorking(value) {
    setEditForm((prev) => {
      const defaultTime = convertTo24Hour(
        prev.load_hour,
        prev.load_min,
        prev.load_ampm
      );
      const count = getTruckCount(value);

      return {
        ...prev,
        trucks_working: value,
        designated_times:
          prev.truck_schedule_mode === "designated"
            ? resizeDesignatedTimes(prev.designated_times, count, defaultTime)
            : prev.designated_times,
      };
    });
  }

  function updateDesignatedTime(index, field, value) {
    setForm((prev) => {
      const next = [...prev.designated_times];
      const existing = next[index] || {
        truck_number: index + 1,
        start_time: "07:00",
        hour: "7",
        min: "00",
        ampm: "AM",
      };

      const updated = {
        ...existing,
        [field]: value,
      };

      updated.start_time = convertTo24Hour(
        updated.hour,
        updated.min,
        updated.ampm
      );

      next[index] = updated;

      return {
        ...prev,
        designated_times: next,
      };
    });
  }

  function updateEditDesignatedTime(index, field, value) {
    setEditForm((prev) => {
      const next = [...prev.designated_times];
      const existing = next[index] || {
        truck_number: index + 1,
        start_time: "07:00",
        hour: "7",
        min: "00",
        ampm: "AM",
      };

      const updated = {
        ...existing,
        [field]: value,
      };

      updated.start_time = convertTo24Hour(
        updated.hour,
        updated.min,
        updated.ampm
      );

      next[index] = updated;

      return {
        ...prev,
        designated_times: next,
      };
    });
  }

  function openDesignatedTimes() {
    const count = getTruckCount(form.trucks_working);

    if (count <= 0) {
      alert("Enter the number of trucks working first.");
      return;
    }

    setForm((prev) => {
      const defaultTime = convertTo24Hour(
        prev.load_hour,
        prev.load_min,
        prev.load_ampm
      );

      return {
        ...prev,
        designated_times: resizeDesignatedTimes(
          prev.designated_times,
          count,
          defaultTime
        ),
      };
    });

    setDesignatedTimesOpen(true);
  }

  function openEditDesignatedTimes() {
    const count = getTruckCount(editForm.trucks_working);

    if (count <= 0) {
      alert("Enter the number of trucks working first.");
      return;
    }

    setEditForm((prev) => {
      const defaultTime = convertTo24Hour(
        prev.load_hour,
        prev.load_min,
        prev.load_ampm
      );

      return {
        ...prev,
        designated_times: resizeDesignatedTimes(
          prev.designated_times,
          count,
          defaultTime
        ),
      };
    });

    setEditDesignatedTimesOpen(true);
  }

  function closeDesignatedTimes() {
    setDesignatedTimesOpen(false);
  }

  function closeEditDesignatedTimes() {
    setEditDesignatedTimesOpen(false);
  }

  function resetForm() {
    setForm(buildEmptyForm(lockedCustomer));
    setDesignatedTimesOpen(false);
  }

  function closeEditModal() {
    setEditOpen(false);
    setEditDesignatedTimesOpen(false);
    setEditingOrderId(null);
    setEditForm(buildEmptyForm(lockedCustomer));
  }

  function startEditOrder(order) {
    if (order.status !== "Unacknowledged") {
      alert("This order can no longer be edited. Please call the plant directly.");
      return;
    }

    const loadParts = convert24ToParts(order.load_time || "07:00");
    const weatherParts = convert24ToParts(order.weather_call_time || "07:00");
    const designated = normalizeDesignatedTimes(order.designated_start_times || []);

    setEditingOrderId(order.id);
    setEditForm({
      customer: lockedCustomer,
      mix_type: String(order.mix_type || ""),
      quantity_tonne: String(order.quantity_tonne ?? ""),
      order_date: String(order.order_date || toLocalISODate()).slice(0, 10),
      address: String(order.address || ""),
      site_contact_name: String(order.site_contact_name || ""),
      site_contact_phone: String(order.site_contact_phone || ""),
      job_number: String(order.job_number || ""),
      po_number: String(order.po_number || ""),
      foreman: String(order.foreman || ""),
      notes: String(order.notes || ""),
      trucks_working:
        order.trucks_working == null ? "" : String(order.trucks_working),
      truck_schedule_mode: String(order.truck_schedule_mode || "stagger"),
      stagger_minutes:
        order.stagger_minutes == null ? "" : String(order.stagger_minutes),
      designated_times: designated,
      weather_call: Boolean(order.weather_call),
      load_hour: loadParts.hour,
      load_min: loadParts.min,
      load_ampm: loadParts.ampm,
      weather_hour: weatherParts.hour,
      weather_min: weatherParts.min,
      weather_ampm: weatherParts.ampm,
    });

    setEditOpen(true);
  }

  function copyOrderToForm(order) {
    const loadParts = convert24ToParts(order.load_time || "07:00");
    const weatherParts = convert24ToParts(order.weather_call_time || "07:00");
    const designated = normalizeDesignatedTimes(order.designated_start_times || []);

    setForm({
      customer: lockedCustomer,
      mix_type: String(order.mix_type || ""),
      quantity_tonne: String(order.quantity_tonne ?? ""),
      order_date: toLocalISODate(),
      address: String(order.address || ""),
      site_contact_name: String(order.site_contact_name || ""),
      site_contact_phone: String(order.site_contact_phone || ""),
      job_number: String(order.job_number || ""),
      po_number: String(order.po_number || ""),
      foreman: String(order.foreman || ""),
      notes: String(order.notes || ""),
      trucks_working:
        order.trucks_working == null ? "" : String(order.trucks_working),
      truck_schedule_mode: String(order.truck_schedule_mode || "stagger"),
      stagger_minutes:
        order.stagger_minutes == null ? "" : String(order.stagger_minutes),
      designated_times: designated,
      weather_call: Boolean(order.weather_call),
      load_hour: loadParts.hour,
      load_min: loadParts.min,
      load_ampm: loadParts.ampm,
      weather_hour: weatherParts.hour,
      weather_min: weatherParts.min,
      weather_ampm: weatherParts.ampm,
    });

    setDesignatedTimesOpen(false);
    closeEditModal();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const truckCount = useMemo(
    () => getTruckCount(form.trucks_working),
    [form.trucks_working]
  );

  const editTruckCount = useMemo(
    () => getTruckCount(editForm.trucks_working),
    [editForm.trucks_working]
  );

  const designatedTimesReady = useMemo(() => {
    if (form.truck_schedule_mode !== "designated") return true;
    if (truckCount <= 0) return false;
    if (!Array.isArray(form.designated_times)) return false;
    if (form.designated_times.length !== truckCount) return false;

    return form.designated_times.every(
      (item) =>
        item &&
        item.hour &&
        item.min &&
        item.ampm &&
        item.start_time &&
        String(item.start_time).includes(":")
    );
  }, [form.truck_schedule_mode, form.designated_times, truckCount]);

  const editDesignatedTimesReady = useMemo(() => {
    if (editForm.truck_schedule_mode !== "designated") return true;
    if (editTruckCount <= 0) return false;
    if (!Array.isArray(editForm.designated_times)) return false;
    if (editForm.designated_times.length !== editTruckCount) return false;

    return editForm.designated_times.every(
      (item) =>
        item &&
        item.hour &&
        item.min &&
        item.ampm &&
        item.start_time &&
        String(item.start_time).includes(":")
    );
  }, [editForm.truck_schedule_mode, editForm.designated_times, editTruckCount]);

  const canSubmit = useMemo(() => {
    return (
      Boolean(lockedCustomer) &&
      Boolean(form.mix_type) &&
      Boolean(form.quantity_tonne) &&
      !loadingProfile &&
      !loadingMixes
    );
  }, [
    lockedCustomer,
    form.mix_type,
    form.quantity_tonne,
    loadingProfile,
    loadingMixes,
  ]);

  const canSaveEdit = useMemo(() => {
    return (
      Boolean(editingOrderId) &&
      Boolean(editForm.mix_type) &&
      Boolean(editForm.quantity_tonne)
    );
  }, [editingOrderId, editForm.mix_type, editForm.quantity_tonne]);

  const visibleCustomerOrders = useMemo(() => {
    return customerOrders.filter(
      (order) => String(order.order_date || "").slice(0, 10) === ordersViewDate
    );
  }, [customerOrders, ordersViewDate]);

  async function onSubmit(e) {
    e.preventDefault();

    try {
      if (!lockedCustomer) {
        alert("No customer is assigned to this login.");
        return;
      }

      const qty = Number(form.quantity_tonne);
      if (!Number.isFinite(qty) || qty <= 0) {
        alert("Quantity must be greater than 0.");
        return;
      }

      const loadTime = convertTo24Hour(
        form.load_hour,
        form.load_min,
        form.load_ampm
      );

      let weatherCallTime = null;
      if (form.weather_call) {
        weatherCallTime = convertTo24Hour(
          form.weather_hour,
          form.weather_min,
          form.weather_ampm
        );
      }

      const trucksWorkingValue =
        form.trucks_working === "" ? null : Number(form.trucks_working);

      if (
        trucksWorkingValue !== null &&
        (!Number.isFinite(trucksWorkingValue) || trucksWorkingValue <= 0)
      ) {
        alert("Trucks Working must be greater than 0.");
        return;
      }

      let staggerMinutesValue = null;
      let designatedStartTimesValue = null;

      if (form.truck_schedule_mode === "stagger") {
        staggerMinutesValue =
          form.stagger_minutes === "" ? null : Number(form.stagger_minutes);

        if (
          trucksWorkingValue &&
          trucksWorkingValue > 1 &&
          (!Number.isFinite(staggerMinutesValue) || staggerMinutesValue <= 0)
        ) {
          alert("Enter Stagger Minutes for staggered truck timing.");
          return;
        }
      }

      if (form.truck_schedule_mode === "designated") {
        if (!trucksWorkingValue || trucksWorkingValue <= 0) {
          alert("Enter the number of trucks working for designated times.");
          return;
        }

        if (!designatedTimesReady) {
          alert("Please set all designated truck start times.");
          return;
        }

        designatedStartTimesValue = form.designated_times.map((item, idx) => ({
          truck_number: idx + 1,
          start_time: convertTo24Hour(item.hour, item.min, item.ampm),
        }));
      }

  const orderData = {
  customer_owner: lockedCustomer,
  customer: lockedCustomer,
  mix_type: String(form.mix_type || "").trim(),
  quantity_tonne: qty,
  order_date: form.order_date,
  load_time: loadTime,
  address: String(form.address || "").trim(),
  site_contact_name: String(form.site_contact_name || "").trim(),
  site_contact_phone: String(form.site_contact_phone || "").trim(),
  job_number: String(form.job_number || "").trim(),
  po_number: String(form.po_number || "").trim(),
  foreman: String(form.foreman || "").trim(),
  notes: String(form.notes || "").trim(),
  trucks_working: trucksWorkingValue,
  truck_schedule_mode: form.truck_schedule_mode,
  stagger_minutes:
    form.truck_schedule_mode === "stagger" ? staggerMinutesValue : null,
  designated_start_times:
    form.truck_schedule_mode === "designated"
      ? designatedStartTimesValue
      : null,
  weather_call: Boolean(form.weather_call),
  weather_call_time: weatherCallTime,
  source_app: "customer_portal",
  status: "Unacknowledged",
};

const { data, error } = await supabase.functions.invoke(
  "create-order-and-send-line",
  {
    body: orderData,
  }
);

if (error) {
  console.error("Create order function error:", error);
  alert(`Error creating order: ${error.message}`);
  return;
}

console.log("Order + LINE result:", data);
alert("Order sent to plant.");
resetForm();
await loadCustomerOrders(lockedCustomer);

} catch (err) {
  console.error(err);
  alert("Error creating order.");
}
}

  async function saveEditOrder(e) {
    e.preventDefault();

    try {
      if (!editingOrderId) return;

      const currentOrder = customerOrders.find((o) => o.id === editingOrderId);

      if (!currentOrder) {
        alert("Order could not be found.");
        return;
      }

      if (currentOrder.status !== "Unacknowledged") {
        alert("This order can no longer be edited. Please call the plant directly.");
        closeEditModal();
        await loadCustomerOrders(lockedCustomer);
        return;
      }

      const qty = Number(editForm.quantity_tonne);
      if (!Number.isFinite(qty) || qty <= 0) {
        alert("Quantity must be greater than 0.");
        return;
      }

      const loadTime = convertTo24Hour(
        editForm.load_hour,
        editForm.load_min,
        editForm.load_ampm
      );

      let weatherCallTime = null;
      if (editForm.weather_call) {
        weatherCallTime = convertTo24Hour(
          editForm.weather_hour,
          editForm.weather_min,
          editForm.weather_ampm
        );
      }

      const trucksWorkingValue =
        editForm.trucks_working === "" ? null : Number(editForm.trucks_working);

      if (
        trucksWorkingValue !== null &&
        (!Number.isFinite(trucksWorkingValue) || trucksWorkingValue <= 0)
      ) {
        alert("Trucks Working must be greater than 0.");
        return;
      }

      let staggerMinutesValue = null;
      let designatedStartTimesValue = null;

      if (editForm.truck_schedule_mode === "stagger") {
        staggerMinutesValue =
          editForm.stagger_minutes === "" ? null : Number(editForm.stagger_minutes);

        if (
          trucksWorkingValue &&
          trucksWorkingValue > 1 &&
          (!Number.isFinite(staggerMinutesValue) || staggerMinutesValue <= 0)
        ) {
          alert("Enter Stagger Minutes for staggered truck timing.");
          return;
        }
      }

      if (editForm.truck_schedule_mode === "designated") {
        if (!trucksWorkingValue || trucksWorkingValue <= 0) {
          alert("Enter the number of trucks working for designated times.");
          return;
        }

        if (!editDesignatedTimesReady) {
          alert("Please set all designated truck start times.");
          return;
        }

        designatedStartTimesValue = editForm.designated_times.map((item, idx) => ({
          truck_number: idx + 1,
          start_time: convertTo24Hour(item.hour, item.min, item.ampm),
        }));
      }

      const updatePayload = {
        mix_type: String(editForm.mix_type || "").trim(),
        quantity_tonne: qty,
        order_date: editForm.order_date,
        load_time: loadTime,
        address: String(editForm.address || "").trim(),
        site_contact_name: String(editForm.site_contact_name || "").trim(),
        site_contact_phone: String(editForm.site_contact_phone || "").trim(),
        job_number: String(editForm.job_number || "").trim(),
        po_number: String(editForm.po_number || "").trim(),
        foreman: String(editForm.foreman || "").trim(),
        notes: String(editForm.notes || "").trim(),
        trucks_working: trucksWorkingValue,
        truck_schedule_mode: editForm.truck_schedule_mode,
        stagger_minutes:
          editForm.truck_schedule_mode === "stagger" ? staggerMinutesValue : null,
        designated_start_times:
          editForm.truck_schedule_mode === "designated"
            ? designatedStartTimesValue
            : null,
        weather_call: Boolean(editForm.weather_call),
        weather_call_time: weatherCallTime,
      };

      const { error } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", editingOrderId)
        .or(`customer_owner.eq.${lockedCustomer},customer.eq.${lockedCustomer}`)
        .eq("status", "Unacknowledged");

      if (error) {
        console.error("Order update error:", error);
        alert(`Error updating order: ${error.message}`);
        return;
      }

      alert("Order updated.");
      closeEditModal();
      await loadCustomerOrders(lockedCustomer);
    } catch (err) {
      console.error(err);
      alert("Error updating order.");
    }
  }

  function renderSavedDesignatedTimes(value) {
    const normalized = normalizeDesignatedTimes(value);
    if (!normalized.length) return null;

    return (
      <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
        {normalized.map((item, idx) => (
          <div key={idx} style={styles.smallText}>
            Truck {item.truck_number || idx + 1}:{" "}
            <b>{formatPrettyTime(item.start_time) || "-"}</b>
          </div>
        ))}
      </div>
    );
  }

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f6f7fb",
      padding: 16,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      color: "#0f172a",
    },
    shell: {
      maxWidth: 780,
      margin: "0 auto",
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: 18,
      padding: 16,
      boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    },
    titleRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      marginBottom: 12,
    },
    h1: {
      margin: 0,
      fontSize: 28,
      fontWeight: 950,
    },
    sub: {
      fontSize: 13,
      color: "#64748b",
    },
    form: {
      display: "grid",
      gap: 12,
    },
    label: {
      fontSize: 13,
      fontWeight: 800,
      color: "#475569",
      marginBottom: 6,
      display: "block",
    },
    input: {
      width: "100%",
      boxSizing: "border-box",
      padding: "14px 12px",
      borderRadius: 14,
      border: "1px solid #d1d5db",
      fontSize: 16,
      background: "#ffffff",
      color: "#0f172a",
      outline: "none",
    },
    readonly: {
      background: "#f3f4f6",
    },
    select: {
      width: "100%",
      boxSizing: "border-box",
      padding: "14px 12px",
      borderRadius: 14,
      border: "1px solid #d1d5db",
      fontSize: 16,
      background: "#ffffff",
      color: "#0f172a",
      outline: "none",
    },
    textarea: {
      width: "100%",
      boxSizing: "border-box",
      padding: "14px 12px",
      borderRadius: 14,
      border: "1px solid #d1d5db",
      fontSize: 16,
      background: "#ffffff",
      color: "#0f172a",
      outline: "none",
      minHeight: 90,
      resize: "vertical",
    },
    timeRow: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 10,
    },
    checkRow: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      fontWeight: 800,
      fontSize: 16,
      paddingTop: 4,
    },
    btnPrimary: {
      width: "100%",
      padding: "16px 14px",
      borderRadius: 16,
      border: "1px solid #2563eb",
      background: "#2563eb",
      color: "#ffffff",
      fontWeight: 950,
      fontSize: 17,
      cursor: "pointer",
    },
    btnSecondary: {
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid #d1d5db",
      background: "#ffffff",
      color: "#0f172a",
      fontWeight: 900,
      fontSize: 15,
      cursor: "pointer",
    },
    btnSmall: {
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #d1d5db",
      background: "#ffffff",
      color: "#0f172a",
      fontWeight: 900,
      fontSize: 15,
      cursor: "pointer",
    },
    btnSelected: {
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid #2563eb",
      background: "#2563eb",
      color: "#ffffff",
      fontWeight: 900,
      fontSize: 15,
      cursor: "pointer",
    },
    btnRow: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      marginTop: 12,
    },
    ordersWrap: {
      marginTop: 24,
      display: "grid",
      gap: 12,
      padding: 14,
      borderRadius: 16,
      background: "linear-gradient(180deg, #ecfdf5 0%, #bbf7d0 100%)",
      border: "1px solid #34d399",
    },
    sectionTitle: {
      margin: "0 0 4px 0",
      fontSize: 22,
      fontWeight: 950,
      color: "#1e40af",
    },
    orderCard: {
      border: "1px solid #93c5fd",
      borderRadius: 16,
      padding: 14,
      background: "#ffffff",
      boxShadow: "0 3px 10px rgba(15, 23, 42, 0.08)",
    },
    orderTop: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
    },
    statusPill: {
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid #cbd5e1",
      background: "#ffffff",
      fontSize: 12,
      fontWeight: 900,
    },
    smallText: {
      fontSize: 13,
      color: "#475569",
      marginTop: 4,
    },
    weatherPill: {
      display: "inline-block",
      marginTop: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid #facc15",
      background: "#fde68a",
      color: "#111827",
      fontSize: 12,
      fontWeight: 900,
    },
    dateNavRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
    },
    dateNavButtons: {
      display: "flex",
      gap: 8,
      alignItems: "center",
    },
    modeWrap: {
      display: "grid",
      gap: 10,
      padding: 12,
      border: "1px solid #e5e7eb",
      borderRadius: 16,
      background: "#f8fafc",
    },
    modeRow: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
    },
    infoBox: {
      padding: 12,
      border: "1px solid #e5e7eb",
      borderRadius: 14,
      background: "#f8fafc",
    },
    topSection: {
      padding: 16,
      borderRadius: 16,
      marginBottom: 16,
      background: "linear-gradient(180deg, #ede9fe 0%, #ddd6fe 100%)",
      border: "1px solid #a78bfa",
    },
    modalOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: 16,
      zIndex: 1000,
      overflowY: "auto",
    },
    modalCard: {
      width: "min(720px, 100%)",
      marginTop: 20,
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: 18,
      padding: 16,
      boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
    },
    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      marginBottom: 12,
      flexWrap: "wrap",
    },
    truckCard: {
      border: "1px solid #e5e7eb",
      borderRadius: 14,
      padding: 12,
      background: "#f8fafc",
    },
  };

  if (!authChecked || loadingProfile) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.sub}>Checking customer access...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topSection}>
          <div style={styles.titleRow}>
            <div>
              <h1 style={styles.h1}>Customer Orders</h1>
              <div style={styles.sub}>
                Logged in as <b>{lockedCustomer || "Unknown Customer"}</b>
              </div>
              <div style={styles.sub}>
                Account email: <b>{session?.user?.email || "-"}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={styles.btnSecondary}
                onClick={handleForgotPassword}
                type="button"
              >
                Reset Password
              </button>

              <button style={styles.btnSecondary} onClick={signOut} type="button">
                Logout
              </button>
            </div>
          </div>

          <form onSubmit={onSubmit} style={styles.form}>
            <div>
              <label style={styles.label}>Customer</label>
              <input
                style={{ ...styles.input, ...styles.readonly }}
                value={lockedCustomer || ""}
                readOnly
              />
            </div>

            <div>
              <label style={styles.label}>Mix</label>
              <select
                style={styles.select}
                value={form.mix_type}
                onChange={(e) => setField("mix_type", e.target.value)}
              >
                <option value="">Select Mix</option>
                {mixOptions.map((mix) => (
                  <option key={mix} value={mix}>
                    {mix}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={styles.label}>Quantity (tonnes)</label>
              <input
                style={styles.input}
                value={form.quantity_tonne}
                onChange={(e) => setField("quantity_tonne", e.target.value)}
                inputMode="decimal"
                placeholder="ex: 200"
              />
            </div>

            <div>
              <label style={styles.label}>Order Date</label>
              <input
                style={styles.input}
                type="date"
                value={form.order_date}
                onChange={(e) => setField("order_date", e.target.value)}
              />
            </div>

            <div>
              <label style={styles.label}>Load Time</label>
              <div style={styles.timeRow}>
                <select
                  style={styles.select}
                  value={form.load_hour}
                  onChange={(e) => setField("load_hour", e.target.value)}
                >
                  {HOURS.map((h) => (
                    <option key={h} value={String(h)}>
                      {h}
                    </option>
                  ))}
                </select>

                <select
                  style={styles.select}
                  value={form.load_min}
                  onChange={(e) => setField("load_min", e.target.value)}
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  style={styles.select}
                  value={form.load_ampm}
                  onChange={(e) => setField("load_ampm", e.target.value)}
                >
                  {AM_PM.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={styles.label}>Address</label>
              <input
                style={styles.input}
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                placeholder="Job site address"
              />
            </div>

            <div>
              <label style={styles.label}>Site Contact</label>
              <input
                style={styles.input}
                value={form.site_contact_name}
                onChange={(e) => setField("site_contact_name", e.target.value)}
                placeholder="Site contact name"
              />
            </div>

            <div>
              <label style={styles.label}>Phone</label>
              <input
                style={styles.input}
                value={form.site_contact_phone}
                onChange={(e) => setField("site_contact_phone", e.target.value)}
                inputMode="tel"
                placeholder="Site contact phone"
              />
            </div>

            <div>
              <label style={styles.label}>Job #</label>
              <input
                style={styles.input}
                value={form.job_number}
                onChange={(e) => setField("job_number", e.target.value)}
              />
            </div>

            <div>
              <label style={styles.label}>PO #</label>
              <input
                style={styles.input}
                value={form.po_number}
                onChange={(e) => setField("po_number", e.target.value)}
              />
            </div>

            <div>
              <label style={styles.label}>Foreman</label>
              <input
                style={styles.input}
                value={form.foreman}
                onChange={(e) => setField("foreman", e.target.value)}
              />
            </div>

            <div style={styles.checkRow}>
              <input
                type="checkbox"
                checked={form.weather_call}
                onChange={(e) => setField("weather_call", e.target.checked)}
              />
              Weather Call
            </div>

            {form.weather_call && (
              <div>
                <label style={styles.label}>Weather Call Time</label>
                <div style={styles.timeRow}>
                  <select
                    style={styles.select}
                    value={form.weather_hour}
                    onChange={(e) => setField("weather_hour", e.target.value)}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={String(h)}>
                        {h}
                      </option>
                    ))}
                  </select>

                  <select
                    style={styles.select}
                    value={form.weather_min}
                    onChange={(e) => setField("weather_min", e.target.value)}
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    style={styles.select}
                    value={form.weather_ampm}
                    onChange={(e) => setField("weather_ampm", e.target.value)}
                  >
                    {AM_PM.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label style={styles.label}>Notes</label>
              <textarea
                style={styles.textarea}
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Special instructions"
              />
            </div>

            <div>
              <label style={styles.label}>Trucks Working</label>
              <input
                style={styles.input}
                value={form.trucks_working}
                onChange={(e) => setTrucksWorking(e.target.value)}
                inputMode="numeric"
                placeholder="ex: 4"
              />
            </div>

            <div style={styles.modeWrap}>
              <div>
                <label style={styles.label}>Truck Timing Method</label>
                <div style={styles.modeRow}>
                  <button
                    type="button"
                    style={
                      form.truck_schedule_mode === "stagger"
                        ? styles.btnSelected
                        : styles.btnSecondary
                    }
                    onClick={() => setTruckScheduleMode("stagger")}
                  >
                    1) Staggered
                  </button>

                  <button
                    type="button"
                    style={
                      form.truck_schedule_mode === "designated"
                        ? styles.btnSelected
                        : styles.btnSecondary
                    }
                    onClick={() => setTruckScheduleMode("designated")}
                  >
                    2) Designated Times
                  </button>
                </div>
              </div>

              {form.truck_schedule_mode === "stagger" ? (
                <div>
                  <label style={styles.label}>Stagger Minutes</label>
                  <input
                    style={styles.input}
                    value={form.stagger_minutes}
                    onChange={(e) => setField("stagger_minutes", e.target.value)}
                    inputMode="numeric"
                    placeholder="ex: 15"
                  />
                </div>
              ) : (
                <div style={styles.infoBox}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>
                    Designated Truck Times
                  </div>

                  <div style={styles.smallText}>
                    Enter trucks working, then set each truck&apos;s exact start
                    time.
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      style={styles.btnSecondary}
                      onClick={openDesignatedTimes}
                    >
                      Set Designated Times
                    </button>

                    <div style={styles.smallText}>
                      {truckCount > 0
                        ? `${truckCount} truck${truckCount === 1 ? "" : "s"} selected`
                        : "No trucks entered yet"}
                    </div>
                  </div>

                  {truckCount > 0 && form.designated_times.length > 0 ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
                      {form.designated_times.map((item, idx) => (
                        <div key={idx} style={styles.smallText}>
                          Truck {idx + 1}:{" "}
                          <b>{formatPrettyTime(item.start_time) || "-"}</b>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <button
              type="submit"
              style={{
                ...styles.btnPrimary,
                opacity: canSubmit ? 1 : 0.5,
              }}
              disabled={!canSubmit}
            >
              Submit Order
            </button>
          </form>
        </div>

        <div style={styles.ordersWrap}>
          <div style={styles.dateNavRow}>
            <h2 style={styles.sectionTitle}>Your Orders</h2>

            <div style={styles.dateNavButtons}>
              <button
                type="button"
                style={styles.btnSmall}
                onClick={() => setOrdersViewDate((d) => addDays(d, -1))}
              >
                ◀
              </button>

              <button
                type="button"
                style={styles.btnSmall}
                onClick={() => setOrdersViewDate(toLocalISODate())}
              >
                Today
              </button>

              <button
                type="button"
                style={styles.btnSmall}
                onClick={() => setOrdersViewDate((d) => addDays(d, 1))}
              >
                ▶
              </button>
            </div>
          </div>

          <div>
            <label style={styles.label}>Viewing Date</label>
            <input
              style={styles.input}
              type="date"
              value={ordersViewDate}
              onChange={(e) => setOrdersViewDate(e.target.value)}
            />
          </div>

          {loadingOrders ? (
            <div style={styles.sub}>Loading orders…</div>
          ) : visibleCustomerOrders.length === 0 ? (
            <div style={styles.sub}>No orders found for this date.</div>
          ) : (
            visibleCustomerOrders.map((order) => (
              <div key={order.id} style={styles.orderCard}>
                <div style={styles.orderTop}>
                  <div>
                    <div style={{ fontWeight: 950, fontSize: 17 }}>
                      {order.mix_type || "No mix selected"}
                    </div>
                    <div style={styles.smallText}>
                      {Number(order.quantity_tonne || 0).toFixed(2)} T
                    </div>
                  </div>

                  <div style={styles.statusPill}>
                    {order.status || "Unacknowledged"}
                  </div>
                </div>

                <div style={styles.smallText}>
                  Date: <b>{formatDatePretty(order.order_date) || "-"}</b>
                </div>

                <div style={styles.smallText}>
                  Load Time: <b>{formatPrettyTime(order.load_time) || "-"}</b>
                </div>

                {order.address ? (
                  <div style={styles.smallText}>
                    Address: <b>{order.address}</b>
                  </div>
                ) : null}

                {order.site_contact_name ? (
                  <div style={styles.smallText}>
                    Site Contact: <b>{order.site_contact_name}</b>
                    {order.site_contact_phone ? (
                      <>
                        {" "}
                        • Phone: <b>{order.site_contact_phone}</b>
                      </>
                    ) : null}
                  </div>
                ) : order.site_contact_phone ? (
                  <div style={styles.smallText}>
                    Phone: <b>{order.site_contact_phone}</b>
                  </div>
                ) : null}

                {order.job_number || order.po_number || order.foreman ? (
                  <div style={styles.smallText}>
                    {order.job_number ? (
                      <>
                        Job: <b>{order.job_number}</b>
                      </>
                    ) : null}
                    {order.po_number ? (
                      <>
                        {" "}
                        • PO: <b>{order.po_number}</b>
                      </>
                    ) : null}
                    {order.foreman ? (
                      <>
                        {" "}
                        • Foreman: <b>{order.foreman}</b>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {order.trucks_working ? (
                  <div style={styles.smallText}>
                    Trucks Working: <b>{order.trucks_working}</b>
                  </div>
                ) : null}

                {order.truck_schedule_mode === "designated" ? (
                  <div style={styles.smallText}>
                    Truck Timing: <b>Designated Times</b>
                    {renderSavedDesignatedTimes(order.designated_start_times)}
                  </div>
                ) : order.stagger_minutes ? (
                  <div style={styles.smallText}>
                    Truck Timing: <b>Staggered</b> • Stagger Minutes:{" "}
                    <b>{order.stagger_minutes}</b>
                  </div>
                ) : null}

                {order.weather_call ? (
                  <div style={styles.weatherPill}>
                    Weather Call
                    {order.weather_call_time
                      ? ` • ${formatPrettyTime(order.weather_call_time)}`
                      : ""}
                  </div>
                ) : null}

                {order.notes ? (
                  <div style={styles.smallText}>
                    Notes: <b>{order.notes}</b>
                  </div>
                ) : null}

                <div style={styles.btnRow}>
                  <button
                    type="button"
                    style={styles.btnSecondary}
                    onClick={() => startEditOrder(order)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    style={styles.btnSecondary}
                    onClick={() => copyOrderToForm(order)}
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {designatedTimesOpen && (
        <div style={styles.modalOverlay} onClick={closeDesignatedTimes}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 950 }}>
                  Designated Truck Times
                </div>
                <div style={styles.sub}>
                  Set an exact start time for each truck.
                </div>
              </div>

              <button
                type="button"
                style={styles.btnSecondary}
                onClick={closeDesignatedTimes}
              >
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {form.designated_times.map((item, idx) => (
                <div key={idx} style={styles.truckCard}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>
                    Truck {idx + 1}
                  </div>

                  <div style={styles.timeRow}>
                    <select
                      style={styles.select}
                      value={item.hour}
                      onChange={(e) =>
                        updateDesignatedTime(idx, "hour", e.target.value)
                      }
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={String(h)}>
                          {h}
                        </option>
                      ))}
                    </select>

                    <select
                      style={styles.select}
                      value={item.min}
                      onChange={(e) =>
                        updateDesignatedTime(idx, "min", e.target.value)
                      }
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <select
                      style={styles.select}
                      value={item.ampm}
                      onChange={(e) =>
                        updateDesignatedTime(idx, "ampm", e.target.value)
                      }
                    >
                      {AM_PM.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={styles.smallText}>
                    Saved as: <b>{formatPrettyTime(item.start_time)}</b>
                  </div>
                </div>
              ))}

              <button
                type="button"
                style={styles.btnPrimary}
                onClick={closeDesignatedTimes}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div style={styles.modalOverlay} onClick={closeEditModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 950 }}>Edit Order</div>
                <div style={styles.sub}>
                  Only unacknowledged orders can be edited.
                </div>
              </div>

              <button
                type="button"
                style={styles.btnSecondary}
                onClick={closeEditModal}
              >
                Close
              </button>
            </div>

            <form onSubmit={saveEditOrder} style={styles.form}>
              <div>
                <label style={styles.label}>Customer</label>
                <input
                  style={{ ...styles.input, ...styles.readonly }}
                  value={lockedCustomer || ""}
                  readOnly
                />
              </div>

              <div>
                <label style={styles.label}>Mix</label>
                <select
                  style={styles.select}
                  value={editForm.mix_type}
                  onChange={(e) => setEditField("mix_type", e.target.value)}
                >
                  <option value="">Select Mix</option>
                  {mixOptions.map((mix) => (
                    <option key={mix} value={mix}>
                      {mix}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={styles.label}>Quantity (tonnes)</label>
                <input
                  style={styles.input}
                  value={editForm.quantity_tonne}
                  onChange={(e) => setEditField("quantity_tonne", e.target.value)}
                  inputMode="decimal"
                />
              </div>

              <div>
                <label style={styles.label}>Order Date</label>
                <input
                  style={styles.input}
                  type="date"
                  value={editForm.order_date}
                  onChange={(e) => setEditField("order_date", e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Load Time</label>
                <div style={styles.timeRow}>
                  <select
                    style={styles.select}
                    value={editForm.load_hour}
                    onChange={(e) => setEditField("load_hour", e.target.value)}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={String(h)}>
                        {h}
                      </option>
                    ))}
                  </select>

                  <select
                    style={styles.select}
                    value={editForm.load_min}
                    onChange={(e) => setEditField("load_min", e.target.value)}
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    style={styles.select}
                    value={editForm.load_ampm}
                    onChange={(e) => setEditField("load_ampm", e.target.value)}
                  >
                    {AM_PM.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={styles.label}>Address</label>
                <input
                  style={styles.input}
                  value={editForm.address}
                  onChange={(e) => setEditField("address", e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Site Contact</label>
                <input
                  style={styles.input}
                  value={editForm.site_contact_name}
                  onChange={(e) => setEditField("site_contact_name", e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Phone</label>
                <input
                  style={styles.input}
                  value={editForm.site_contact_phone}
                  onChange={(e) => setEditField("site_contact_phone", e.target.value)}
                  inputMode="tel"
                />
              </div>

              <div>
                <label style={styles.label}>Job #</label>
                <input
                  style={styles.input}
                  value={editForm.job_number}
                  onChange={(e) => setEditField("job_number", e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>PO #</label>
                <input
                  style={styles.input}
                  value={editForm.po_number}
                  onChange={(e) => setEditField("po_number", e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Foreman</label>
                <input
                  style={styles.input}
                  value={editForm.foreman}
                  onChange={(e) => setEditField("foreman", e.target.value)}
                />
              </div>

              <div style={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={editForm.weather_call}
                  onChange={(e) => setEditField("weather_call", e.target.checked)}
                />
                Weather Call
              </div>

              {editForm.weather_call && (
                <div>
                  <label style={styles.label}>Weather Call Time</label>
                  <div style={styles.timeRow}>
                    <select
                      style={styles.select}
                      value={editForm.weather_hour}
                      onChange={(e) => setEditField("weather_hour", e.target.value)}
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={String(h)}>
                          {h}
                        </option>
                      ))}
                    </select>

                    <select
                      style={styles.select}
                      value={editForm.weather_min}
                      onChange={(e) => setEditField("weather_min", e.target.value)}
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <select
                      style={styles.select}
                      value={editForm.weather_ampm}
                      onChange={(e) => setEditField("weather_ampm", e.target.value)}
                    >
                      {AM_PM.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label style={styles.label}>Notes</label>
                <textarea
                  style={styles.textarea}
                  value={editForm.notes}
                  onChange={(e) => setEditField("notes", e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Trucks Working</label>
                <input
                  style={styles.input}
                  value={editForm.trucks_working}
                  onChange={(e) => setEditTrucksWorking(e.target.value)}
                  inputMode="numeric"
                />
              </div>

              <div style={styles.modeWrap}>
                <div>
                  <label style={styles.label}>Truck Timing Method</label>
                  <div style={styles.modeRow}>
                    <button
                      type="button"
                      style={
                        editForm.truck_schedule_mode === "stagger"
                          ? styles.btnSelected
                          : styles.btnSecondary
                      }
                      onClick={() => setEditTruckScheduleMode("stagger")}
                    >
                      1) Staggered
                    </button>

                    <button
                      type="button"
                      style={
                        editForm.truck_schedule_mode === "designated"
                          ? styles.btnSelected
                          : styles.btnSecondary
                      }
                      onClick={() => setEditTruckScheduleMode("designated")}
                    >
                      2) Designated Times
                    </button>
                  </div>
                </div>

                {editForm.truck_schedule_mode === "stagger" ? (
                  <div>
                    <label style={styles.label}>Stagger Minutes</label>
                    <input
                      style={styles.input}
                      value={editForm.stagger_minutes}
                      onChange={(e) => setEditField("stagger_minutes", e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                ) : (
                  <div style={styles.infoBox}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>
                      Designated Truck Times
                    </div>

                    <div style={styles.smallText}>
                      Enter trucks working, then set each truck&apos;s exact start
                      time.
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <button
                        type="button"
                        style={styles.btnSecondary}
                        onClick={openEditDesignatedTimes}
                      >
                        Set Designated Times
                      </button>

                      <div style={styles.smallText}>
                        {editTruckCount > 0
                          ? `${editTruckCount} truck${editTruckCount === 1 ? "" : "s"} selected`
                          : "No trucks entered yet"}
                      </div>
                    </div>

                    {editTruckCount > 0 && editForm.designated_times.length > 0 ? (
                      <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
                        {editForm.designated_times.map((item, idx) => (
                          <div key={idx} style={styles.smallText}>
                            Truck {idx + 1}:{" "}
                            <b>{formatPrettyTime(item.start_time) || "-"}</b>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={styles.btnSecondary}
                  onClick={closeEditModal}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  style={{
                    ...styles.btnPrimary,
                    opacity: canSaveEdit ? 1 : 0.5,
                  }}
                  disabled={!canSaveEdit}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editDesignatedTimesOpen && (
        <div style={styles.modalOverlay} onClick={closeEditDesignatedTimes}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 950 }}>
                  Edit Designated Truck Times
                </div>
                <div style={styles.sub}>
                  Set an exact start time for each truck.
                </div>
              </div>

              <button
                type="button"
                style={styles.btnSecondary}
                onClick={closeEditDesignatedTimes}
              >
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {editForm.designated_times.map((item, idx) => (
                <div key={idx} style={styles.truckCard}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>
                    Truck {idx + 1}
                  </div>

                  <div style={styles.timeRow}>
                    <select
                      style={styles.select}
                      value={item.hour}
                      onChange={(e) =>
                        updateEditDesignatedTime(idx, "hour", e.target.value)
                      }
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={String(h)}>
                          {h}
                        </option>
                      ))}
                    </select>

                    <select
                      style={styles.select}
                      value={item.min}
                      onChange={(e) =>
                        updateEditDesignatedTime(idx, "min", e.target.value)
                      }
                    >
                      {MINUTES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>

                    <select
                      style={styles.select}
                      value={item.ampm}
                      onChange={(e) =>
                        updateEditDesignatedTime(idx, "ampm", e.target.value)
                      }
                    >
                      {AM_PM.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={styles.smallText}>
                    Saved as: <b>{formatPrettyTime(item.start_time)}</b>
                  </div>
                </div>
              ))}

              <button
                type="button"
                style={styles.btnPrimary}
                onClick={closeEditDesignatedTimes}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}