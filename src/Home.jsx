import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

export default function Home() {
  const [plantImg, setPlantImg] = useState(null);
  const [loadingPhoto, setLoadingPhoto] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    loadPlantPhoto();
    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setCheckingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadSession() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
    } catch (err) {
      console.error("Error loading session:", err);
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

      setPlantImg(publicUrlData.publicUrl);
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

  async function handleCustomerLogin(e) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoginError(error.message);
    } else {
      setEmail("");
      setPassword("");
    }

    setLoggingIn(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
  }

  function goTo(path) {
    window.location.pathname = path;
  }

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
        ) : session ? (
          <div style={loggedInCardStyle}>
            <h2 style={loginTitleStyle}>You are signed in</h2>
            <div style={signedInTextStyle}>
              {session.user?.email || "User logged in"}
            </div>

            <button
              style={customerPortalButtonStyle}
              onClick={() => goTo("/customer")}
            >
              Open Customer Portal
            </button>

            <button style={logoutButtonStyle} onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        ) : (
          <form onSubmit={handleCustomerLogin} style={loginCardStyle}>
            <h2 style={loginTitleStyle}>Customer Login</h2>

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

        <div style={gridStyle}>
          <button style={buttonStyle} onClick={() => goTo("/internal")}> 
            Plant Dashboard
          </button>

          <button style={buttonStyle} onClick={() => goTo("/admin")}> 
            Admin Login
          </button>

          <button style={buttonStyle} onClick={() => goTo("/manager")}> 
            Manager Dashboard
          </button>

          <button style={buttonStyle} onClick={() => goTo("/jobupdates")}> 
            Superintendent/Foreman Job Updates
          </button>
        </div>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f4f4f4",
  padding: "24px 16px 40px",
  boxSizing: "border-box",
};

const containerStyle = {
  width: "100%",
  maxWidth: "430px",
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const titleStyle = {
  margin: "0 0 24px",
  color: "#c00000",
  fontWeight: 900,
  fontSize: "clamp(1.9rem, 7vw, 3rem)",
  lineHeight: 1.1,
  letterSpacing: "0.4px",
  textAlign: "center",
};

const photoSectionStyle = {
  width: "100%",
  marginBottom: "22px",
  display: "flex",
  justifyContent: "center",
};

const photoCardStyle = {
  width: "100%",
  maxWidth: "300px",
  aspectRatio: "1 / 1",
  background: "#111",
  borderRadius: "22px",
  border: "3px solid #c00000",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 8px 22px rgba(0, 0, 0, 0.12)",
};

const imageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const placeholderStyle = {
  color: "#fff",
  fontSize: "1.1rem",
  fontWeight: 600,
  textAlign: "center",
  padding: "20px",
};

const statusCardStyle = {
  width: "100%",
  background: "#fff",
  borderRadius: "18px",
  padding: "18px",
  marginBottom: "22px",
  textAlign: "center",
  fontWeight: 700,
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.08)",
};

const loginCardStyle = {
  width: "100%",
  background: "#fff",
  borderRadius: "18px",
  padding: "18px",
  marginBottom: "22px",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.08)",
  display: "grid",
  gap: "12px",
};

const loggedInCardStyle = {
  width: "100%",
  background: "#fff",
  borderRadius: "18px",
  padding: "18px",
  marginBottom: "22px",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.08)",
  display: "grid",
  gap: "12px",
  textAlign: "center",
};

const loginTitleStyle = {
  margin: 0,
  color: "#111",
  textAlign: "center",
};

const signedInTextStyle = {
  color: "#333",
  fontWeight: 600,
  wordBreak: "break-word",
};

const inputStyle = {
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #ccc",
  fontSize: "16px",
  width: "100%",
  boxSizing: "border-box",
};

const loginButtonStyle = {
  minHeight: "50px",
  padding: "12px 14px",
  fontSize: "1rem",
  borderRadius: "12px",
  border: "none",
  background: "#c00000",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const customerPortalButtonStyle = {
  minHeight: "54px",
  padding: "12px 14px",
  fontSize: "1rem",
  borderRadius: "12px",
  border: "none",
  background: "#c00000",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const logoutButtonStyle = {
  minHeight: "50px",
  padding: "12px 14px",
  fontSize: "1rem",
  borderRadius: "12px",
  border: "2px solid #111",
  background: "#fff",
  color: "#111",
  fontWeight: 800,
  cursor: "pointer",
};

const errorStyle = {
  color: "#c00000",
  fontWeight: 700,
  textAlign: "center",
};

const gridStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "16px",
};

const buttonStyle = {
  minHeight: "80px",
  padding: "18px 14px",
  fontSize: "1rem",
  lineHeight: 1.2,
  borderRadius: "18px",
  border: "2px solid #c00000",
  background: "#111",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.10)",
};