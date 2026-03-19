import React from "react";
import InternalApp from "./InternalApp";
import AdminPage from "./AdminPage";
import CustomerPortal from "./CustomerPortal";
import ResetPassword from "./ResetPassword";

export default function App() {
  const path = window.location.pathname.toLowerCase();

  if (path === "/customer" || path === "/customer/") {
    return <CustomerPortal />;
  }

  if (path === "/customer/reset-password" || path === "/customer/reset-password/") {
    return <ResetPassword />;
  }

  if (path === "/admin" || path === "/admin/") {
    return <AdminPage />;
  }

  if (path === "/internal" || path === "/internal/") {
    return <InternalApp />;
  }

  if (path === "/" || path === "") {
    return <CustomerPortal />;
  }

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h2>Route not found</h2>
      <p>Try one of these pages:</p>
      <ul>
        <li>/customer</li>
        <li>/customer/reset-password</li>
        <li>/admin</li>
        <li>/internal</li>
      </ul>
    </div>
  );
}