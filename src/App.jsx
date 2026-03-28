import React, { useEffect, useState } from "react";
import { getAccessContext, canAccess } from "./authGuard";

import Home from "./Home";
import InternalApp from "./InternalApp";
import AdminPage from "./AdminPage";
import CustomerPortal from "./CustomerPortal";
import ResetPassword from "./ResetPassword";
import ManagerDashboard from "./ManagerDashboard";
import JobUpdates from "./JobUpdates";

const EMPTY_ACCESS = {
  session: null,
  user: null,
  profile: null,
  internalUser: null,
  customerUser: null,
  customerAccount: null,
  userRoleRow: null,
  role: null,
  allowed: [],
  isAdmin: false,
  isManager: false,
  isOperator: false,
  isCustomer: false,
  isInternalReadOnly: false,
};

function normalizePath(pathname) {
  const raw = String(pathname || "/").trim().toLowerCase();
  if (!raw) return "/";
  return raw.endsWith("/") && raw !== "/" ? raw.slice(0, -1) : raw;
}

function redirectToHome(access) {
  window.history.replaceState({}, "", "/");
  return <Home access={access} />;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(EMPTY_ACCESS);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const result = await getAccessContext();
        if (cancelled) return;
        setAccess(result || EMPTY_ACCESS);
      } catch (error) {
        console.error("App init failed", error);
        if (cancelled) return;
        setAccess(EMPTY_ACCESS);
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const path = normalizePath(window.location.pathname);
  const isSignedIn = !!access.session;

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
        Loading...
      </div>
    );
  }

  if (path === "/") {
    return <Home access={access} />;
  }

  if (path === "/customer/reset-password") {
    return <ResetPassword />;
  }

  if (path === "/customer") {
    if (!isSignedIn || !canAccess(access.role, "customer")) {
      return redirectToHome(access);
    }

    return (
      <CustomerPortal
        access={access}
        role={access.role}
        customerAccount={access.customerAccount}
        isAdminView={access.isAdmin}
      />
    );
  }

  if (path === "/admin") {
    if (!isSignedIn || !canAccess(access.role, "admin")) {
      return redirectToHome(access);
    }

    return <AdminPage access={access} role={access.role} />;
  }

  if (path === "/internal") {
    if (!isSignedIn || !canAccess(access.role, "internal")) {
      return redirectToHome(access);
    }

    return (
      <InternalApp
        access={access}
        role={access.role}
        readOnly={!!access.isInternalReadOnly}
      />
    );
  }

  if (path === "/manager") {
    if (!isSignedIn || !canAccess(access.role, "manager")) {
      return redirectToHome(access);
    }

    return <ManagerDashboard access={access} role={access.role} />;
  }

  if (path === "/jobupdates") {
    if (
      !isSignedIn ||
      !(canAccess(access.role, "customer") || canAccess(access.role, "manager"))
    ) {
      return redirectToHome(access);
    }

    return <JobUpdates access={access} role={access.role} />;
  }

  return redirectToHome(access);
}