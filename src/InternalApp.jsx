// KEEP YOUR FILE CLEAN — START FRESH

import React from "react";

export default function InternalApp({ access, role, readOnly }) {
  return (
    <div style={{ padding: 40 }}>
      <h1>COQUITLAM PLANT ORDERS</h1>

      <div style={{ marginTop: 20 }}>
        <strong>Logged in as:</strong> {access?.user?.email}
      </div>

      {readOnly && (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            borderRadius: 10,
            background: "#fff7ed",
            border: "1px solid #fdba74",
            color: "#9a3412",
            fontWeight: 700,
          }}
        >
          Manager Mode: Read Only
        </div>
      )}

      <div style={{ marginTop: 40 }}>
        🚧 Dashboard will load here (we will restore next step)
      </div>
    </div>
  );
}