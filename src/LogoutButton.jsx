import { supabase } from "./supabaseClient";

export default function LogoutButton() {
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();

      // Hard redirect clears state fully
      window.location.href = "/";
    } catch (err) {
      console.error("Logout failed:", err);
      alert("Logout failed. Try again.");
    }
  };

  return (
    <button onClick={handleLogout} style={buttonStyle}>
      Sign Out
    </button>
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