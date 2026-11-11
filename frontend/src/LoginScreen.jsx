import React, { useState } from "react";
import "./Login.css";
import { IconShieldCheck, IconAlertTriangle, IconLock } from "./Icons";

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const customApi = (import.meta.env.VITE_API_URL || import.meta.env.VITE_CALLER_API_URL || "").replace(/\/+$/, "");
      const customGql = (import.meta.env.VITE_GRAPHQL_API || "").replace(/\/graphql\/?$/, "").replace(/\/+$/, "");
      const base = customApi || customGql;

      const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

      const endpoints = [];
      if (base) {
        endpoints.push(`${base}/api/auth/login`);
        endpoints.push(`${base}/api/caller/login`);
      } else if (isLocal) {
        endpoints.push("http://127.0.0.1:8000/api/auth/login");
        endpoints.push("http://127.0.0.1:8001/api/caller/login");
      }
      endpoints.push("/api/auth/login");
      endpoints.push("/api/caller/login");

      let result = null;
      let lastErr = null;

      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username.trim(), password }),
          });
          if (res.ok) {
            result = await res.json();
            break;
          } else {
            const data = await res.json().catch(() => ({}));
            lastErr = data.detail || `Sign in failed (${res.status})`;
            if (res.status === 401 || res.status === 403) break;
          }
        } catch (fetchErr) {
          lastErr = fetchErr.message;
        }
      }

      if (!result) {
        if (lastErr && lastErr.toLowerCase().includes("failed to fetch")) {
          throw new Error(
            "Failed to fetch backend API. In production, configure VITE_API_URL in your deployment settings to point to your backend API URL, and verify backend CORS allows this domain."
          );
        }
        throw new Error(lastErr || "Incorrect username or password");
      }

      // Enforce: only let the admins view it!
      if (result.role !== "admin") {
        throw new Error("Access denied. Only administrators are authorized to access this dashboard.");
      }

      sessionStorage.setItem("gis-admin-token", result.access_token || "admin-session");
      sessionStorage.setItem("gis-admin-user", result.username || username);
      sessionStorage.setItem("gis-admin-role", result.role);

      onLoginSuccess({
        token: result.access_token,
        username: result.username || username,
        role: result.role,
      });
    } catch (err) {
      setError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="caller-login-page">
      <section className="caller-login-card">
        <div className="caller-brand-mark">EI</div>
        <div className="caller-kicker">
          <span className="admin-badge-dot" />
          <span>ELECTORAL INTELLIGENCE</span>
        </div>
        <h1>Admin sign in</h1>
        <p className="caller-login-copy">
          Sign in with administrator credentials to access the GIS & Electoral Intelligence Dashboard.
        </p>

        <form onSubmit={handleLogin} className="caller-login-form">
          <label>
            Username
            <input
              type="text"
              autoComplete="username"
              minLength={2}
              maxLength={100}
              placeholder="Admin username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              minLength={1}
              placeholder="Admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && (
            <div className="caller-error" role="alert">
              <IconAlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="caller-primary" disabled={busy}>
            <span>{busy ? "Signing in…" : "Admin sign in"}</span>
            <span>→</span>
          </button>
        </form>

        <div className="caller-admin-restricted-note">
          <IconShieldCheck size={16} />
          <span>Restricted Portal: Access is granted exclusively to authorized system administrators.</span>
        </div>
      </section>

      <aside className="caller-login-aside">
        <span>GEOSPATIAL & FIELD INTELLIGENCE</span>
        <h2>
          Every conversation
          <br />
          moves us closer.
        </h2>
        <p>
          High-resolution assembly demarcations, booth turnouts, and real-time ground telemetry across Uttar Pradesh target districts.
        </p>
        <div className="aside-orbit orbit-one" />
        <div className="aside-orbit orbit-two" />
      </aside>
    </main>
  );
}
