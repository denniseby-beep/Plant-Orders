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
import DispatchApp from "./DispatchApp";
import YardTickets from "./YardTickets";
import JobReports from "./JobReports";
import ScaleDashboard from "./ScaleDashboard";
import AccountingExports from "./AccountingExports";

const EMPTY_ALLOWED = {
  plantDashboard: false,
  customerPortal: false,
  managerDashboard: false,
  jobTickets: false,
  yardTickets: false,
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
  isYard: false,
};

function normalizePath(pathname) {
  const raw = String(pathname || "/").trim().toLowerCase();
  if (!raw) return "/";
  return raw.endsWith("/") && raw !== "/" ? raw.slice(0, -1) : raw;
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

function isYardOnlyUser(access) {
  if (!access?.session) return false;

  return (
    !!access?.allowed?.yardTickets &&
    !access?.allowed?.admin &&
    !access?.allowed?.managerDashboard &&
    !access?.allowed?.plantDashboard &&
    !access?.allowed?.customerPortal &&
    !access?.allowed?.jobTickets
  );
}

function getDefaultRoute(access) {
  if (!access?.session) return "/";

  if (access?.allowed?.admin) return "/admin";
  if (access?.allowed?.managerDashboard) return "/manager";
  if (access?.allowed?.plantDashboard) return "/internal";
  if (access?.allowed?.yardTickets) return "/yard-tickets";
  if (access?.allowed?.jobTickets) return "/job-tickets";
  if (access?.allowed?.customerPortal) return "/customer";
  if (access.role === "project_manager") {
  return "/job-reports";
}

  return "/";
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
        const result = await withTimeout(getAccessContext(), 4000);

        if (cancelled) return;

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

    function handlePopState() {
      setCurrentPath(normalizePath(window.location.pathname));
    }

    loadAccess();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
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

  if (path === "/admin/accounting") {
  if (!isSignedIn || !access.allowed.admin) {
    return redirectToPath(getDefaultRoute(access));
  }

  return <AccountingExports access={access} role={access.role} />;
}

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
    if (isYardOnlyUser(access)) {
      return redirectToPath("/yard-tickets");
    }

    return <Home access={access} />;
  }

  if (path === "/job-reports") {
  if (
  !isSignedIn ||
  (!access.allowed.managerDashboard &&
    !access.allowed.jobReports)
) {
    return redirectToPath(getDefaultRoute(access));
  }

  return <JobReports access={access} role={access.role} />;
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

  if (path === "/admin/accounting") {
  if (!isSignedIn || !access.allowed.admin) {
    return redirectToPath(getDefaultRoute(access));
  }

  return <AccountingExports access={access} role={access.role} />;
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

  if (path === "/dispatch") {
    if (!isSignedIn || !access.allowed.plantDashboard) {
      return redirectToPath(getDefaultRoute(access));
    }

    return <DispatchApp access={access} role={access.role} />;
  }

  if (path === "/jobupdates") {
    if (!isSignedIn || !access.allowed.customerPortal) {
      return redirectToPath(getDefaultRoute(access));
    }

    return <JobUpdates access={access} role={access.role} />;
  }

  if (path === "/yard-tickets") {
    if (!isSignedIn || !access.allowed.yardTickets) {
      return redirectToPath(getDefaultRoute(access));
    }

    return <YardTickets access={access} role={access.role} />;
  }

  if (path === "/job-tickets") {
    if (!isSignedIn || !access.allowed.jobTickets) {
      return redirectToPath(getDefaultRoute(access));
    }

    return <JobTickets access={access} role={access.role} />;
  }

  if (path === "/scale-dashboard") {
  return <ScaleDashboard access={access} />;
}

  return redirectToPath(getDefaultRoute(access));
}