import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { getAccessContext } from "./authGuard";

import Home from "./Home";
import InternalApp from "./InternalApp";
import AdminPage from "./AdminPage";
import CustomerPortal from "./CustomerPortal";
import ResetPassword from "./ResetPassword";
import ManagerDashboard from "./ManagerDashboard";
import JobUpdates from "./JobUpdates";
import JobTickets from "./JobTickets";

const EMPTY_ALLOWED = {
  plantDashboard: false,
  customerPortal: false,
  managerDashboard: false,
  jobTickets: false,
  admin: false,
};

const EMPTY_ACCESS = {
  session: null,
  user: null,
  profile: null,
  internalUser: null,
  customerUser: null,
  customerAccount: null,
  userRoleRow: null,
  role: null,
  allowed: { ...EMPTY_ALLOWED },
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

function getDefaultRoute(access) {
  if (access?.allowed?.admin) return "/admin";
  if (access?.allowed?.managerDashboard) return "/manager";
  if (access?.allowed?.customerPortal) return "/customer";
  if (access?.allowed?.plantDashboard) return "/internal";
  return "/";
}

function redirectToPath(path) {
  const nextPath = path || "/";
  if (normalizePath(window.location.pathname) !== normalizePath(nextPath)) {
    window.history.replaceState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
  return null;
}

function withTimeout(promise, ms = 4000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(EMPTY_ACCESS);
  const [currentPath, setCurrentPath] = useState(
    normalizePath(window.location.pathname)
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAccess() {
      try {
        console.log("App loadAccess started");
        const result = await withTimeout(getAccessContext(), 4000);
        if (cancelled) return;
        console.log("App loadAccess success", result);
        setAccess(result || EMPTY_ACCESS);
      } catch (error) {
        console.error("App loadAccess failed", error);
        if (cancelled) return;
        setAccess(EMPTY_ACCESS);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAccess();

    const handlePopState = () => {
      setCurrentPath(normalizePath(window.location.pathname));
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event) => {
      console.log("Auth state changed:", _event);

      loadAccess();
      setCurrentPath(normalizePath(window.location.pathname));
    });

    window.addEventListener("popstate", handlePopState);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const path = currentPath;
  const isSignedIn = !!access.session;

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
        Loading...
      </div>
    );
  }

  if (path === "/customer/reset-password") {
    return <ResetPassword />;
  }

  if (path === "/") {
    return <Home access={access} />;
  }

  if (path === "/customer") {
    if (!isSignedIn || !access.allowed.customerPortal) {
      return redirectToPath(getDefaultRoute(access));
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
    if (!isSignedIn || !access.allowed.admin) {
      return redirectToPath(getDefaultRoute(access));
    }

    return <AdminPage access={access} role={access.role} />;
  }

  if (path === "/internal") {
    if (!isSignedIn || !access.allowed.plantDashboard) {
      return redirectToPath(getDefaultRoute(access));
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
    if (!isSignedIn || !access.allowed.managerDashboard) {
      return redirectToPath(getDefaultRoute(access));
    }

    return <ManagerDashboard access={access} role={access.role} />;
  }

  if (path === "/jobupdates") {
    if (!isSignedIn || !access.allowed.customerPortal) {
      return redirectToPath(getDefaultRoute(access));
    }

    return <JobUpdates access={access} role={access.role} />;
  }

  if (path === "/job-tickets") {
    if (!isSignedIn || !access.allowed.jobTickets) {
      return redirectToPath(getDefaultRoute(access));
    }

    return <JobTickets access={access} role={access.role} />;
  }

  return redirectToPath(getDefaultRoute(access));
}