import React from "react";
import { supabase } from "./supabaseClient";
import AdminDashboard from "./AdminDashboard";
import CustomerAccountManager from "./CustomerAccountManager";
import LogoutButton from "./LogoutButton";

export default function AdminPage({ access, role }) {
  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (role !== "admin") {
    return <div style={{ padding: 20 }}>Access denied.</div>;
  }

  return (
    <div>
      <div
        style={{
          padding: 16,
          borderBottom: "1px solid #ddd",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#fff",
        }}
      >
        <div>
          Logged in as <strong>{access?.user?.email || "Admin"}</strong>
        </div>

        <LogoutButton />
      </div>

      <AdminDashboard />
      <CustomerAccountManager />
    </div>
  );
}

const buttonStyle = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};