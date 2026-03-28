import { supabase } from "./supabaseClient";

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

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function buildAccess(role) {
  const r = normalizeRole(role);

  switch (r) {
    case "admin":
      return {
        allowed: ["admin", "internal", "manager", "customer"],
        isAdmin: true,
        isManager: false,
        isOperator: false,
        isCustomer: false,
        isInternalReadOnly: false,
      };

    case "manager":
      return {
        allowed: ["internal", "manager"],
        isAdmin: false,
        isManager: true,
        isOperator: false,
        isCustomer: false,
        isInternalReadOnly: true,
      };

    case "operator":
      return {
        allowed: ["internal"],
        isAdmin: false,
        isManager: false,
        isOperator: true,
        isCustomer: false,
        isInternalReadOnly: false,
      };

    case "internal":
      return {
        allowed: ["internal"],
        isAdmin: false,
        isManager: false,
        isOperator: false,
        isCustomer: false,
        isInternalReadOnly: false,
      };

    case "internal_readonly":
      return {
        allowed: ["internal"],
        isAdmin: false,
        isManager: false,
        isOperator: false,
        isCustomer: false,
        isInternalReadOnly: true,
      };

    case "customer":
      return {
        allowed: ["customer"],
        isAdmin: false,
        isManager: false,
        isOperator: false,
        isCustomer: true,
        isInternalReadOnly: false,
      };

    default:
      return {
        allowed: [],
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
  const t = normalizeRole(target);

  if (!r || !t) return false;

  const access = buildAccess(r);
  return access.allowed.includes(t);
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

    const [
      profileRes,
      internalRes,
      customerUserRes,
      userRolesRes,
    ] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),

      supabase
        .from("internal_users")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),

      supabase
        .from("customer_users")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),

      supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);

    console.log("profileRes", profileRes?.data || null, profileRes?.error || null);
    console.log("internalRes", internalRes?.data || null, internalRes?.error || null);
    console.log(
      "customerUserRes",
      customerUserRes?.data || null,
      customerUserRes?.error || null
    );
    console.log(
      "userRolesRes",
      userRolesRes?.data || null,
      userRolesRes?.error || null
    );

    const profile = profileRes?.data || null;
    const internalUser = internalRes?.data || null;
    const customerUser = customerUserRes?.data || null;
    const userRoleRow = userRolesRes?.data || null;

    let role = null;
    let customerAccount = null;

    // 1) Old internal_users table still works first
    if (internalUser?.is_active === false) {
      console.log("internal user exists but is inactive");
    } else if (internalUser?.role) {
      role = normalizeRole(internalUser.role);
    }

    // 2) New user_roles table fallback
    if (!role && userRoleRow?.role) {
      role = normalizeRole(userRoleRow.role);
    }

    // 3) Old customer_users fallback
    if (!role && customerUser) {
      role = "customer";
    }

    // customer account lookup
    if (customerUser) {
      const customerId =
        customerUser.customer_account_id ??
        customerUser.customer_id ??
        null;

      if (customerId) {
        const customerAccountRes = await supabase
          .from("customer_accounts")
          .select("*")
          .eq("id", customerId)
          .maybeSingle();

        console.log(
          "customerAccountRes",
          customerAccountRes?.data || null,
          customerAccountRes?.error || null
        );

        customerAccount = customerAccountRes?.data || null;
      }
    }

    // if role says customer but old customer_users row does not exist yet,
    // try to match customer account by company name from profile
    if (!customerAccount && role === "customer" && profile?.company_name) {
      const customerAccountRes = await supabase
        .from("customer_accounts")
        .select("*")
        .eq("company_name", profile.company_name)
        .maybeSingle();

      console.log(
        "customerAccountRes by profile company",
        customerAccountRes?.data || null,
        customerAccountRes?.error || null
      );

      customerAccount = customerAccountRes?.data || null;
    }

    const access = buildAccess(role);

    const result = {
      session,
      user,
      profile,
      internalUser,
      customerUser,
      customerAccount,
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