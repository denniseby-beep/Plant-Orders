import { supabase } from "./supabaseClient";

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

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function buildAccess(role) {
  const r = normalizeRole(role);

  switch (r) {
    case "admin":
      return {
        allowed: {
          plantDashboard: true,
          customerPortal: true,
          managerDashboard: true,
          jobTickets: true,
          admin: true,
        },
        isAdmin: true,
        isManager: false,
        isOperator: false,
        isCustomer: false,
        isInternalReadOnly: false,
      };

    case "manager":
      return {
        allowed: {
          plantDashboard: true,
          customerPortal: false,
          managerDashboard: true,
          jobTickets: true,
          admin: false,
        },
        isAdmin: false,
        isManager: true,
        isOperator: false,
        isCustomer: false,
        isInternalReadOnly: true,
      };

    case "operator":
      return {
        allowed: {
          plantDashboard: true,
          customerPortal: false,
          managerDashboard: false,
          jobTickets: true,
          admin: false,
        },
        isAdmin: false,
        isManager: false,
        isOperator: true,
        isCustomer: false,
        isInternalReadOnly: false,
      };

    case "customer":
      return {
        allowed: {
          plantDashboard: false,
          customerPortal: true,
          managerDashboard: false,
          jobTickets: true,
          admin: false,
        },
        isAdmin: false,
        isManager: false,
        isOperator: false,
        isCustomer: true,
        isInternalReadOnly: false,
      };

    // backward compatibility
    case "internal":
      return {
        allowed: {
          plantDashboard: true,
          customerPortal: false,
          managerDashboard: false,
          jobTickets: true,
          admin: false,
        },
        isAdmin: false,
        isManager: false,
        isOperator: false,
        isCustomer: false,
        isInternalReadOnly: false,
      };

    case "internal_readonly":
      return {
        allowed: {
          plantDashboard: true,
          customerPortal: false,
          managerDashboard: false,
          jobTickets: true,
          admin: false,
        },
        isAdmin: false,
        isManager: false,
        isOperator: false,
        isCustomer: false,
        isInternalReadOnly: true,
      };

    default:
      return {
        allowed: { ...EMPTY_ALLOWED },
        isAdmin: false,
        isManager: false,
        isOperator: false,
        isCustomer: false,
        isInternalReadOnly: false,
      };
  }
}

export function canAccess(role, target) {
  const r = normalizeRole(role);
  const t = String(target || "").trim();

  if (!r || !t) return false;

  const access = buildAccess(r);
  return !!access.allowed[t];
}

async function safeMaybeSingle(queryPromise, label) {
  try {
    const res = await queryPromise;
    console.log(label, res?.data || null, res?.error || null);
    return res?.data || null;
  } catch (error) {
    console.error(`${label} failed`, error);
    return null;
  }
}

export async function getAccessContext() {
  console.log("getAccessContext started");

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    console.log("session fetched", {
      hasSession: !!session,
      hasUser: !!session?.user,
      sessionError,
    });

    if (sessionError || !session?.user) {
      console.log("getAccessContext returning empty - no valid session");
      return { ...EMPTY_ACCESS };
    }

    const user = session.user;

    const profile = await safeMaybeSingle(
      supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      "profileRes"
    );

    const internalUser = await safeMaybeSingle(
      supabase
        .from("internal_users")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      "internalRes"
    );

    const customerUser = await safeMaybeSingle(
      supabase
        .from("customer_users")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      "customerUserRes"
    );

    const userRoleRow = await safeMaybeSingle(
      supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
      "userRolesRes"
    );

    let role = null;
    let customerAccount = null;

    // Priority:
    // 1) user_roles
    // 2) internal_users
    // 3) customer_users
    // 4) profile fallback
    if (userRoleRow?.role) {
      role = normalizeRole(userRoleRow.role);
    } else if (internalUser?.is_active !== false && internalUser?.role) {
      role = normalizeRole(internalUser.role);
    } else if (customerUser) {
      role = "customer";
    } else if (profile?.role) {
      role = normalizeRole(profile.role);
    }

    if (customerUser) {
      const customerId =
        customerUser.customer_account_id ??
        customerUser.customer_id ??
        null;

      // 1) direct ID lookup
      if (customerId) {
        customerAccount = await safeMaybeSingle(
          supabase
            .from("customer_accounts")
            .select("*")
            .eq("id", customerId)
            .maybeSingle(),
          "customerAccountRes by ID"
        );
      }

      // 2) fallback by company_name on customer_users
      if (!customerAccount && customerUser.company_name) {
        customerAccount = await safeMaybeSingle(
          supabase
            .from("customer_accounts")
            .select("*")
            .eq("company_name", customerUser.company_name)
            .maybeSingle(),
          "customerAccountRes by customerUser.company_name"
        );
      }

      // 3) fallback by email on customer_accounts if that exists in your table
      if (!customerAccount && user.email) {
        customerAccount = await safeMaybeSingle(
          supabase
            .from("customer_accounts")
            .select("*")
            .eq("email", user.email)
            .maybeSingle(),
          "customerAccountRes by email"
        );
      }
    }

    // 4) fallback by company_name from profile
    if (!customerAccount && role === "customer" && profile?.company_name) {
      customerAccount = await safeMaybeSingle(
        supabase
          .from("customer_accounts")
          .select("*")
          .eq("company_name", profile.company_name)
          .maybeSingle(),
        "customerAccountRes by profile company"
      );
    }

    // 5) final fallback: use customerAccount-linked company name from profile/customerUser
    const resolvedCompanyName =
      normalizeText(customerAccount?.company_name) ||
      normalizeText(profile?.company_name) ||
      normalizeText(customerUser?.company_name) ||
      "";

    const access = buildAccess(role);

    const result = {
      session,
      user,
      profile,
      internalUser,
      customerUser,
      customerAccount: customerAccount
        ? {
            ...customerAccount,
            company_name:
              normalizeText(customerAccount.company_name) || resolvedCompanyName,
          }
        : resolvedCompanyName
        ? { company_name: resolvedCompanyName }
        : null,
      userRoleRow,
      role,
      allowed: access.allowed,
      isAdmin: access.isAdmin,
      isManager: access.isManager,
      isOperator: access.isOperator,
      isCustomer: access.isCustomer,
      isInternalReadOnly: access.isInternalReadOnly,
    };

    console.log("getAccessContext result", result);
    return result;
  } catch (error) {
    console.error("getAccessContext fatal error", error);
    return { ...EMPTY_ACCESS };
  }
}