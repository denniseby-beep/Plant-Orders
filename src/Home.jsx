import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Home({ access }) {
  const [plantImg, setPlantImg] = useState(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [checkingSession, setCheckingSession] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [popupTitle, setPopupTitle] = useState("");
  const [popupMessage, setPopupMessage] = useState("");

  const fileInputRef = useRef(null);

  useEffect(() => {
    loadPlantPhoto();
    loadSessionState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadSessionState();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadSessionState() {
    try {
      setCheckingSession(true);
      await supabase.auth.getSession();
    } catch (err) {
      console.error("Error checking session:", err);
    } finally {
      setCheckingSession(false);
    }
  }

  async function loadPlantPhoto() {
    try {
      setLoadingPhoto(true);

      const { data, error } = await supabase
        .from("app_settings")
        .select("plant_photo_path")
        .eq("id", "main")
        .single();

      if (error) {
        console.error("Error loading plant photo setting:", error);
        setPlantImg(null);
        return;
      }

      if (!data?.plant_photo_path) {
        setPlantImg(null);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("plant-images")
        .getPublicUrl(data.plant_photo_path);

      setPlantImg(publicUrlData?.publicUrl || null);
    } catch (err) {
      console.error("Unexpected error loading plant photo:", err);
      setPlantImg(null);
    } finally {
      setLoadingPhoto(false);
    }
  }

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);

      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
      const filePath = `main/plant-photo.${safeExtension}`;

      const { error: uploadError } = await supabase.storage
        .from("plant-images")
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type || "image/jpeg",
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        alert("Could not upload plant photo.");
        return;
      }

      const { error: updateError } = await supabase
        .from("app_settings")
        .update({
          plant_photo_path: filePath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "main");

      if (updateError) {
        console.error("Database update error:", updateError);
        alert("Photo uploaded, but app settings did not update.");
        return;
      }

      const { data } = supabase.storage
        .from("plant-images")
        .getPublicUrl(filePath);

      const publicUrl = data?.publicUrl
        ? `${data.publicUrl}?t=${Date.now()}`
        : "";

      setPlantImg(publicUrl);
    } catch (err) {
      console.error("Unexpected upload error:", err);
      alert("Something went wrong while uploading the photo.");
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleLogin(e) {
  e.preventDefault();
  setLoggingIn(true);
  setLoginError("");

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    setLoginError(error.message || "Could not sign in.");
  } else {
    setEmail("");
    setPassword("");
  }

  setLoggingIn(false);
}

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
      closePopup();
      window.history.replaceState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (err) {
      console.error("Logout error:", err);
    }
  }

  function openPopup(title, message) {
    setPopupTitle(title);
    setPopupMessage(message);
  }

  function closePopup() {
    setPopupTitle("");
    setPopupMessage("");
  }

  function navigateTo(path, hasAccess) {
    if (!access?.session) {
      openPopup("Sign In Required", "Please sign in first.");
      return;
    }

    if (!hasAccess) {
      openPopup("Access Restricted", "Sorry, you do not have access to this area.");
      return;
    }

    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function roleLabel() {
    if (access?.isAdmin) return "Administrator";
    if (access?.isManager) return "Manager";
    if (access?.isOperator) return "Operator";
    if (access?.isCustomer) return "Customer / Superintendent";
    return "Signed In";
  }

  const signedIn = !!access?.session;

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <h1 style={titleStyle}>
          Welcome to
          <br />
          All Roads Construction Plant Orders
        </h1>

        <div style={photoSectionStyle}>
          <div
            style={{
              ...photoCardStyle,
              cursor: uploading ? "wait" : "pointer",
              opacity: uploading ? 0.75 : 1,
            }}
            onClick={() => {
              if (!uploading) fileInputRef.current?.click();
            }}
            title="Tap to change plant photo"
          >
            {loadingPhoto ? (
              <div style={placeholderStyle}>Loading photo...</div>
            ) : plantImg ? (
              <img src={plantImg} alt="Plant" style={imageStyle} />
            ) : (
              <div style={placeholderStyle}>
                {uploading ? "Uploading..." : "Tap to Add Plant Photo"}
              </div>
            )}
          </div>

          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handlePhotoChange}
          />
        </div>

        {checkingSession ? (
          <div style={statusCardStyle}>Checking login...</div>
        ) : signedIn ? (
          <div style={loggedInCardStyle}>
            <h2 style={loginTitleStyle}>{roleLabel()}</h2>

            <div style={signedInTextStyle}>
              {access?.user?.email || "User logged in"}
            </div>

            <div style={signedInButtonGroupStyle}>
              {access?.allowed?.customerPortal && (
                <button
                  style={primaryActionButtonStyle}
                  onClick={() =>
                    navigateTo("/customer", access?.allowed?.customerPortal)
                  }
                >
                  Open Customer Portal
                </button>
              )}

              {access?.allowed?.plantDashboard && (
                <button
                  style={primaryActionButtonStyle}
                  onClick={() =>
                    navigateTo("/internal", access?.allowed?.plantDashboard)
                  }
                >
                  Open Plant Dashboard
                </button>
              )}

              {access?.allowed?.managerDashboard && (
                <button
                  style={primaryActionButtonStyle}
                  onClick={() =>
                    navigateTo("/manager", access?.allowed?.managerDashboard)
                  }
                >
                  Open Manager Dashboard
                </button>
              )}

              {access?.allowed?.jobTickets && (
                <button
                  style={primaryActionButtonStyle}
                  onClick={() =>
                    navigateTo("/job-tickets", access?.allowed?.jobTickets)
                  }
                >
                  Open Job-Tickets
                </button>
              )}

              {access?.allowed?.admin && (
                <button
                  style={primaryActionButtonStyle}
                  onClick={() => navigateTo("/admin", access?.allowed?.admin)}
                >
                  Open Admin
                </button>
              )}
            </div>

            <button style={logoutButtonStyle} onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} style={loginCardStyle}>
            <h2 style={loginTitleStyle}>Sign In</h2>

            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />

            <button
              type="submit"
              disabled={loggingIn}
              style={loginButtonStyle}
            >
              {loggingIn ? "Signing In..." : "Sign In"}
            </button>

            {loginError ? <div style={errorStyle}>{loginError}</div> : null}
          </form>
        )}
      </div>

      {!!popupMessage && (
        <div style={overlayStyle}>
          <div style={popupStyle}>
            <h3 style={popupTitleStyle}>{popupTitle}</h3>
            <p style={popupTextStyle}>{popupMessage}</p>
            <button style={popupButtonStyle} onClick={closePopup}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f5f7fb",
  padding: "24px 16px",
  fontFamily: "Arial, sans-serif",
};

const containerStyle = {
  maxWidth: 1100,
  margin: "0 auto",
};

const titleStyle = {
  textAlign: "center",
  fontSize: "clamp(28px, 5vw, 48px)",
  lineHeight: 1.15,
  marginBottom: 24,
  color: "#1f2937",
};

const photoSectionStyle = {
  display: "flex",
  justifyContent: "center",
  marginBottom: 24,
};

const photoCardStyle = {
  width: "100%",
  maxWidth: 780,
  minHeight: 240,
  borderRadius: 18,
  overflow: "hidden",
  background: "#dfe6ee",
  boxShadow: "0 10px 30px rgba(0,0,0,0.10)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const imageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const placeholderStyle = {
  padding: 30,
  color: "#475569",
  fontSize: 18,
  textAlign: "center",
};

const statusCardStyle = {
  maxWidth: 420,
  margin: "0 auto 24px",
  background: "#ffffff",
  borderRadius: 14,
  padding: 20,
  textAlign: "center",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
};

const loginCardStyle = {
  maxWidth: 420,
  margin: "0 auto 24px",
  background: "#ffffff",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const loggedInCardStyle = {
  maxWidth: 520,
  margin: "0 auto 24px",
  background: "#ffffff",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  textAlign: "center",
};

const loginTitleStyle = {
  margin: "0 0 8px 0",
  color: "#111827",
};

const signedInTextStyle = {
  color: "#475569",
  marginBottom: 16,
  wordBreak: "break-word",
};

const signedInButtonGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginBottom: 16,
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  fontSize: 16,
  boxSizing: "border-box",
};

const loginButtonStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  background: "#1d4ed8",
  color: "#ffffff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryActionButtonStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  background: "#0f766e",
  color: "#ffffff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

const logoutButtonStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "none",
  background: "#b91c1c",
  color: "#ffffff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

const errorStyle = {
  marginTop: 8,
  color: "#b91c1c",
  fontSize: 14,
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 16,
};

const popupStyle = {
  width: "100%",
  maxWidth: 380,
  background: "#ffffff",
  borderRadius: 14,
  padding: 24,
  boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
  textAlign: "center",
};

const popupTitleStyle = {
  margin: "0 0 10px 0",
  color: "#111827",
};

const popupTextStyle = {
  margin: 0,
  color: "#475569",
  fontSize: 16,
  lineHeight: 1.45,
};

const popupButtonStyle = {
  marginTop: 18,
  padding: "10px 18px",
  borderRadius: 10,
  border: "none",
  background: "#1f2937",
  color: "#ffffff",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
};