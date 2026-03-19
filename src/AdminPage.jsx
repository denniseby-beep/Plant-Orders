import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import AdminLogin from "./AdminLogin";
import CustomerAccountManager from "./CustomerAccountManager";

export default function AdminPage() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  if (session === undefined) {
    return <div style={{ padding: 20 }}>Loading...</div>;
  }

  if (!session) {
    return <AdminLogin />;
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
          Logged in as <strong>{session.user.email}</strong>
        </div>

        <button onClick={handleSignOut} style={buttonStyle}>
          Sign Out
        </button>
      </div>

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