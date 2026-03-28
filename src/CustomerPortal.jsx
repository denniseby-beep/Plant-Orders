import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function CustomerPortal({ access, role, customerAccount }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);

    try {
      let query = supabase.from("orders").select("*");

      // 🔒 Lock to customer
      if (customerAccount?.company_name) {
        query = query.eq("customer", customerAccount.company_name);
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) throw error;

      setOrders(data || []);
    } catch (err) {
      console.error("Error loading orders:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(order) {
    if (!window.confirm("Delete this order?")) return;

    try {
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", order.id);

      if (error) throw error;

      await loadOrders();
    } catch (err) {
      alert(err.message || "Failed to delete order");
    }
  }

  function canEdit(order) {
    return (
      role === "admin" ||
      (role === "customer" &&
        order.status === "Unacknowledged" &&
        access?.customerAccount?.can_edit_unacknowledged)
    );
  }

  if (loading) {
    return <div style={{ padding: 20 }}>Loading orders...</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Customer Orders</h1>

      {orders.length === 0 ? (
        <div>No orders found.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ddd" }}>
              <th>Customer</th>
              <th>Mix</th>
              <th>Tonnes</th>
              <th>Load Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              <tr key={order.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{order.customer}</td>
                <td>{order.mix_type}</td>
                <td>{order.quantity_tonne}</td>
                <td>{order.load_time}</td>
                <td>{order.status}</td>

                <td>
                  {canEdit(order) ? (
                    <>
                      <button
                        onClick={() => handleDelete(order)}
                        style={{ marginRight: 8 }}
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <span style={{ color: "#999" }}>
                      Call plant to edit
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}