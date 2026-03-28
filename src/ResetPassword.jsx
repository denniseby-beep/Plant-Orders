import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSavePassword(e) {
    e.preventDefault();

    if (!password || !confirmPassword) {
      alert("Enter and confirm your new password.");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    setDone(true);
  }

  const styles = {
    wrap: {
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f6f7fb",
      padding: 16,
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    },
    card: {
      width: "100%",
      maxWidth: 420,
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 18,
      padding: 18,
      boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
    },
    input: {
      width: "100%",
      boxSizing: "border-box",
      padding: "14px 12px",
      borderRadius: 14,
      border: "1px solid #d1d5db",
      fontSize: 16,
      marginBottom: 12,
    },
    button: {
      width: "100%",
      padding: "14px 12px",
      borderRadius: 14,
      border: "1px solid #2563eb",
      background: "#2563eb",
      color: "#fff",
      fontWeight: 800,
      fontSize: 16,
      cursor: "pointer",
    },
    text: {
      color: "#64748b",
      fontSize: 14,
      marginBottom: 14,
    },
  };

  if (!ready && !done) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h2>Reset Password</h2>
          <div style={styles.text}>Loading recovery session...</div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h2>Password Updated</h2>
          <div style={styles.text}>
            Your password has been changed successfully.
          </div>
          <button
            style={styles.button}
            onClick={() => {
              window.location.href = "/customer";
            }}
          >
            Go to Customer Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h2>Reset Password</h2>
        <div style={styles.text}>Enter your new password below.</div>

        <form onSubmit={handleSavePassword}>
          <input
            style={styles.input}
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            style={styles.input}
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <button type="submit" style={styles.button} disabled={saving}>
            {saving ? "Saving..." : "Save New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}