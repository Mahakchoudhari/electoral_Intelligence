import { useCallback, useEffect, useState } from "react";
import "./App.css";
import "./Auth.css";
import "./Admin.css";

const API = import.meta.env.VITE_CALLER_API_URL || "http://127.0.0.1:8001";
const localDate = (offset = 0) => {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

async function request(path, token, options = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    if (API.includes("127.0.0.1") || API.includes("localhost")) {
      throw new Error(
        `Unable to connect to backend server. The app is attempting to reach ${API} (localhost). Please set VITE_CALLER_API_URL in your frontend deployment settings to your Render backend URL.`
      );
    }
    throw new Error(
      `Unable to connect to backend at ${API}. The service might be starting up or sleeping (free tier). Please check status and try again.`
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(payload.detail)
      ? payload.detail.map((item) => item.msg).join(" ")
      : payload.detail;
    throw new Error(detail || "Request failed. Please try again.");
  }
  return payload;
}

function downloadCallsCSV(calls, filename) {
  const headers = [
    "Call ID",
    "Work Date",
    "Call Time (IST)",
    "Created At",
    "Caller Username",
    "District",
    "Assembly Constituency",
    "AC No",
    "Village",
    "Sampark Sutra Name",
    "Contact Phone",
    "Call Outcome",
    "Category",
    "Call Summary",
    "Feedback / Notes",
  ];
  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };
  const rows = calls.map((c) =>
    [
      c.report_id,
      c.work_date || "",
      c.call_time || "",
      c.created_at_formatted || c.created_at || "",
      c.caller_username || "",
      c.district_name || "",
      c.assembly_name || "",
      c.ac_no || "",
      c.village_name || "",
      c.sampark_sutra_name || "",
      c.sampark_sutra_phone || "",
      c.has_problem ? "Issue Reported" : "No Issue / Clear",
      c.category || "",
      c.summary || "",
      c.feedback || "",
    ]
      .map(escapeCSV)
      .join(",")
  );
  const csvContent = "\uFEFF" + [headers.map(escapeCSV).join(","), ...rows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const blankCall = { has_problem: false, summary: "", category: "", feedback: "" };
const blankSutraForm = {
  name: "",
  phone: "",
  fathers_name: "",
  age: "",
  epic_id: "",
  social_media: "",
  flag: "",
};
const blankNewContact = {
  name: "",
  phone: "",
  ac_no: "",
  village_id: "",
  fathers_name: "",
  age: "",
  epic_id: "",
  social_media: "",
  flag: "Reliable",
};

export default function CallerDashboard() {
  const [token, setToken] = useState(() => sessionStorage.getItem("caller-token") || "");
  const [role, setRole] = useState(() => sessionStorage.getItem("caller-role") || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [districts, setDistricts] = useState([]);
  const [assemblies, setAssemblies] = useState([]);
  const [villages, setVillages] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [districtCode, setDistrictCode] = useState("");
  const [acNo, setAcNo] = useState("");
  const [villageId, setVillageId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [neverCalledOnly, setNeverCalledOnly] = useState(false);
  const [activeContact, setActiveContact] = useState(null);
  const [activeContactCalls, setActiveContactCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [showCallsHistory, setShowCallsHistory] = useState(true);
  const [call, setCall] = useState(blankCall);
  const [sutraForm, setSutraForm] = useState(blankSutraForm);
  const [updateSutra, setUpdateSutra] = useState(true);
  const [showPrimaryDetails, setShowPrimaryDetails] = useState(false);
  const [showCustomFlag, setShowCustomFlag] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContact, setNewContact] = useState(blankNewContact);
  const [addModalVillages, setAddModalVillages] = useState([]);
  const [contactToDelete, setContactToDelete] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [loginError, setLoginError] = useState("");
  const [pageError, setPageError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [adminActivity, setAdminActivity] = useState({ callers: [], summary: {}, daily_activity: [], all_calls: [], caller_stats: [] });
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [dateFrom, setDateFrom] = useState(() => localDate(-13));
  const [dateTo, setDateTo] = useState(() => localDate());
  const [callerFilter, setCallerFilter] = useState("");
  const [adminDistrictFilter, setAdminDistrictFilter] = useState("");
  const [adminAcFilter, setAdminAcFilter] = useState("");
  const [adminProblemFilter, setAdminProblemFilter] = useState("all");
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [debouncedAdminSearch, setDebouncedAdminSearch] = useState("");
  const [adminActiveTab, setAdminActiveTab] = useState("feed");
  const [adminSelectedCall, setAdminSelectedCall] = useState(null);
  const [adminAssemblies, setAdminAssemblies] = useState([]);
  const [adminExporting, setAdminExporting] = useState(false);
  const [adminNotice, setAdminNotice] = useState("");

  const signOut = useCallback(() => {
    sessionStorage.removeItem("caller-token");
    sessionStorage.removeItem("caller-role");
    setToken(""); setDistricts([]); setAssemblies([]); setVillages([]); setContacts([]);
    setRole("");
    setDistrictCode(""); setAcNo(""); setVillageId(""); setActiveContact(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    request("/api/caller/districts", token).then(setDistricts).catch((error) => {
      if (error.message.includes("session") || error.message.includes("Sign in")) signOut();
      else setPageError(error.message);
    });
  }, [token, signOut]);

  useEffect(() => {
    if (!token || !districtCode) { setAssemblies([]); setAcNo(""); return; }
    request(`/api/caller/assemblies?district_code=${encodeURIComponent(districtCode)}`, token)
      .then(setAssemblies).catch((error) => setPageError(error.message));
  }, [token, districtCode]);

  useEffect(() => {
    if (!token || !acNo) { setVillages([]); setVillageId(""); return; }
    request(`/api/caller/villages?ac_no=${encodeURIComponent(acNo)}&has_contacts=true`, token)
      .then(setVillages).catch((error) => setPageError(error.message));
  }, [token, acNo]);

  // Load contacts across levels (District, AC, or Village)
  useEffect(() => {
    if (!token) return;
    if (!districtCode && !acNo && !villageId) {
      setContacts([]);
      return;
    }
    let cancelled = false;
    let url = "/api/caller/sampark-sutras?";
    if (villageId) {
      url += `village_id=${encodeURIComponent(villageId)}`;
    } else if (acNo) {
      url += `ac_no=${encodeURIComponent(acNo)}`;
    } else if (districtCode) {
      url += `district_code=${encodeURIComponent(districtCode)}`;
    }
    if (neverCalledOnly) {
      url += "&never_called=true";
    }
    request(url, token)
      .then((data) => {
        if (!cancelled) setContacts(data);
      })
      .catch((error) => {
        if (!cancelled) setPageError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, districtCode, acNo, villageId, neverCalledOnly]);

  // Load villages for Add Modal when an AC is selected
  useEffect(() => {
    if (!token || !newContact.ac_no) {
      setAddModalVillages([]);
      return;
    }
    request(`/api/caller/villages?ac_no=${encodeURIComponent(newContact.ac_no)}&has_contacts=false`, token)
      .then(setAddModalVillages)
      .catch(() => setAddModalVillages([]));
  }, [token, newContact.ac_no]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAdminSearch(adminSearchQuery), 350);
    return () => clearTimeout(timer);
  }, [adminSearchQuery]);

  useEffect(() => {
    if (!token || role !== "admin") return;
    const url = adminDistrictFilter
      ? `/api/caller/assemblies?district_code=${encodeURIComponent(adminDistrictFilter)}`
      : `/api/caller/assemblies`;
    request(url, token)
      .then(setAdminAssemblies)
      .catch(() => setAdminAssemblies([]));
  }, [token, role, adminDistrictFilter]);

  const loadAdminActivity = useCallback((showLoading = false) => {
    if (!token || role !== "admin") return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (callerFilter) params.set("caller_pid", callerFilter);
    if (adminDistrictFilter) params.set("district_code", adminDistrictFilter);
    if (adminAcFilter) params.set("ac_no", adminAcFilter);
    if (adminProblemFilter === "issues") params.set("has_problem", "true");
    else if (adminProblemFilter === "clear") params.set("has_problem", "false");
    if (debouncedAdminSearch.trim()) params.set("search", debouncedAdminSearch.trim());

    if (showLoading) setAdminLoading(true);
    setAdminError("");
    request(`/api/caller/admin/activity?${params}`, token)
      .then((data) => { if (!cancelled) setAdminActivity(data); })
      .catch((error) => {
        if (cancelled) return;
        if (error.message.includes("session") || error.message.includes("Sign in")) signOut();
        else setAdminError(error.message);
      })
      .finally(() => { if (!cancelled && showLoading) setAdminLoading(false); });
    return () => { cancelled = true; };
  }, [token, role, dateFrom, dateTo, callerFilter, adminDistrictFilter, adminAcFilter, adminProblemFilter, debouncedAdminSearch, signOut]);

  useEffect(() => {
    if (!token || role !== "admin") return;
    loadAdminActivity(true);
    const refreshTimer = window.setInterval(() => loadAdminActivity(false), 30000);
    return () => window.clearInterval(refreshTimer);
  }, [loadAdminActivity, token, role]);

  async function handleAuth(event) {
    event.preventDefault(); setBusy(true); setLoginError("");
    try {
      const result = await request("/api/caller/login", "", {
        method: "POST", body: JSON.stringify({ username, password }),
      });
      if (isAdminLogin && result.role !== "admin") {
        throw new Error("This account does not have administrator access.");
      }
      sessionStorage.setItem("caller-token", result.access_token);
      sessionStorage.setItem("caller-role", result.role);
      setToken(result.access_token); setRole(result.role); setPassword("");
    } catch (error) { setLoginError(error.message); }
    finally { setBusy(false); }
  }

  function countMissingFields(contact) {
    if (!contact) return 0;
    let count = 0;
    if (!contact.flag) count++;
    if (!contact.fathers_name) count++;
    if (contact.age == null) count++;
    if (!contact.epic_id) count++;
    if (!contact.social_media) count++;
    return count;
  }

  function getFlagClass(flag) {
    if (!flag) return "flag-default";
    const lower = flag.toLowerCase();
    if (lower.includes("unreliable")) return "flag-unreliable";
    if (lower.includes("doubt")) return "flag-doubtful";
    if (lower.includes("reliable")) return "flag-reliable";
    return "flag-default";
  }

  function openCall(contact) {
    setActiveContact(contact);
    setCall({ has_problem: false, summary: "", category: "", feedback: "" });
    setSutraForm({
      name: contact.name || "",
      phone: contact.phone || "",
      fathers_name: contact.fathers_name || "",
      age: contact.age != null ? String(contact.age) : "",
      epic_id: contact.epic_id || "",
      social_media: contact.social_media || "",
      flag: contact.flag || "",
    });
    setUpdateSutra(true);
    setShowPrimaryDetails(false);
    setShowCustomFlag(!["Reliable", "Doubtful", "Unreliable", ""].includes(contact.flag || ""));
    setNotice("");
    setPageError("");
    setLoadingCalls(true);
    setShowCallsHistory(true);
    request(`/api/caller/sampark-sutras/${contact.sid}/calls`, token)
      .then(setActiveContactCalls)
      .catch(() => setActiveContactCalls([]))
      .finally(() => setLoadingCalls(false));
  }

  async function directUpdateSutra() {
    if (!activeContact) return;
    setBusy(true); setPageError("");
    try {
      const sutraData = {
        name: sutraForm.name.trim() || undefined,
        phone: sutraForm.phone.trim() || undefined,
        fathers_name: sutraForm.fathers_name.trim() || null,
        age: sutraForm.age ? parseInt(sutraForm.age, 10) : null,
        epic_id: sutraForm.epic_id.trim() || null,
        social_media: sutraForm.social_media.trim() || null,
        flag: sutraForm.flag.trim() || null,
      };
      const updated = await request(`/api/caller/sampark-sutras/${activeContact.sid}`, token, {
        method: "PATCH",
        body: JSON.stringify(sutraData),
      });
      setContacts((prev) => prev.map((c) => (c.sid === updated.sid ? { ...c, ...updated } : c)));
      setActiveContact((prev) => ({ ...prev, ...updated }));
      setNotice(`Updated ${updated.name}'s details successfully.`);
    } catch (error) { setPageError(error.message); }
    finally { setBusy(false); }
  }

  async function submitCall(event) {
    event.preventDefault();
    if (!activeContact) return;
    setBusy(true); setPageError("");
    try {
      const sutraData = {
        name: sutraForm.name.trim() || undefined,
        phone: sutraForm.phone.trim() || undefined,
        fathers_name: sutraForm.fathers_name.trim() || null,
        age: sutraForm.age ? parseInt(sutraForm.age, 10) : null,
        epic_id: sutraForm.epic_id.trim() || null,
        social_media: sutraForm.social_media.trim() || null,
        flag: sutraForm.flag.trim() || null,
      };
      const targetAcNo = activeContact.ac_no || (acNo ? Number(acNo) : 0);
      const targetVillageId = activeContact.village_id || (villageId ? Number(villageId) : 0);
      const result = await request("/api/caller/calls", token, {
        method: "POST",
        body: JSON.stringify({
          ...call,
          sid: activeContact.sid,
          ac_no: targetAcNo,
          village_id: targetVillageId,
          update_sutra: updateSutra,
          sutra_data: sutraData,
        }),
      });
      setContacts((prev) =>
        prev.map((c) => {
          if (c.sid === activeContact.sid) {
            return {
              ...(result.updated_sutra || c),
              call_count: (c.call_count || 0) + 1,
              village_name: c.village_name,
              ac_name: c.ac_name,
              district_name: c.district_name,
            };
          }
          return c;
        })
      );
      setActiveContact(null); setCall(blankCall);
      setNotice(`Call saved successfully #${result.report_id}`);
    } catch (error) { setPageError(error.message); }
    finally { setBusy(false); }
  }

  function openAddModal() {
    const defaultAc = acNo || (assemblies[0]?.ac_no ? String(assemblies[0].ac_no) : "");
    const defaultVillage = villageId || "";
    setNewContact({
      ...blankNewContact,
      ac_no: defaultAc,
      village_id: defaultVillage,
    });
    setShowAddModal(true);
    setPageError("");
  }

  async function handleCreateContact(event) {
    event.preventDefault();
    setBusy(true); setPageError("");
    try {
      const payload = {
        name: newContact.name.trim(),
        phone: newContact.phone.trim(),
        ac_no: Number(newContact.ac_no),
        village_id: Number(newContact.village_id),
        fathers_name: newContact.fathers_name.trim() || null,
        age: newContact.age ? parseInt(newContact.age, 10) : null,
        epic_id: newContact.epic_id.trim() || null,
        social_media: newContact.social_media.trim() || null,
        flag: newContact.flag.trim() || null,
      };
      const created = await request("/api/caller/sampark-sutras", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setContacts((prev) => [created, ...prev]);
      setShowAddModal(false);
      setNotice(`Added new contact '${created.name}' (${created.phone})`);
      setNewContact(blankNewContact);
    } catch (error) { setPageError(error.message); }
    finally { setBusy(false); }
  }

  function openDeleteModal(contact, event) {
    if (event) event.stopPropagation();
    setContactToDelete(contact);
    setDeleteReason("");
    setPageError("");
  }

  async function handleDeleteContact() {
    if (!contactToDelete) return;
    setBusy(true); setPageError("");
    try {
      const q = deleteReason.trim() ? `?reason=${encodeURIComponent(deleteReason.trim())}` : "";
      await request(`/api/caller/sampark-sutras/${contactToDelete.sid}${q}`, token, {
        method: "DELETE",
      });
      setContacts((prev) => prev.filter((c) => c.sid !== contactToDelete.sid));
      setNotice(`Sampark Sutra '${contactToDelete.name}' removed from roster · Recorded in audit log.`);
      setContactToDelete(null);
      setDeleteReason("");
    } catch (error) { setPageError(error.message); }
    finally { setBusy(false); }
  }

  async function openAuditTrail(action = "") {
    setAuditLoading(true);
    setAuditActionFilter(action);
    setShowAuditModal(true);
    try {
      const q = action ? `?action=${encodeURIComponent(action)}` : "";
      const logs = await request(`/api/caller/sampark-sutras/audit-logs${q}`, token);
      setAuditLogs(logs);
    } catch (error) { setPageError(error.message); }
    finally { setAuditLoading(false); }
  }

  // Filtered contacts based on search input and never called filter
  const filteredContacts = contacts.filter((c) => {
    if (neverCalledOnly && (c.call_count || 0) > 0) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (c.name && c.name.toLowerCase().includes(term)) ||
      (c.phone && c.phone.includes(term)) ||
      (c.fathers_name && c.fathers_name.toLowerCase().includes(term)) ||
      (c.village_name && c.village_name.toLowerCase().includes(term)) ||
      (c.ac_name && c.ac_name.toLowerCase().includes(term)) ||
      (c.epic_id && c.epic_id.toLowerCase().includes(term))
    );
  });

  // Calculate active level title
  const activeLevelInfo = villageId
    ? { level: "VILLAGE ROSTER", name: villages.find((v) => String(v.village_id) === String(villageId))?.name || "Village" }
    : acNo
    ? { level: "ASSEMBLY ROSTER", name: assemblies.find((a) => String(a.ac_no) === String(acNo))?.name || `AC #${acNo}` }
    : districtCode
    ? { level: "DISTRICT ROSTER", name: districts.find((d) => String(d.district_code) === String(districtCode))?.name || "District" }
    : null;

  if (!token) return (
    <main className="caller-login-page">
      <section className="caller-login-card">
        <div className="caller-brand-mark">EI</div>
        <div className="caller-kicker">ELECTORAL INTELLIGENCE</div>
        <h1>{isAdminLogin ? "Admin sign in" : "Caller workspace"}</h1>
        <p className="caller-login-copy">{isAdminLogin ? "Sign in to review caller activity and daily work." : "Sign in to record Sampark Sutra conversations."}</p>
        <form onSubmit={handleAuth} className="caller-login-form">
          <label>Username<input autoComplete="username" minLength={3} maxLength={100} pattern="[A-Za-z0-9_.-]+" value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" minLength={1} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          {loginError && <div className="caller-error" role="alert">{loginError}</div>}
          <button className="caller-primary" disabled={busy}>{busy ? "Signing in…" : (isAdminLogin ? "Admin sign in" : "Sign in")}<span>→</span></button>
        </form>
        <div className="caller-auth-switch">
          {isAdminLogin ? "Looking for caller sign in?" : "Administrator?"}{" "}
          <button type="button" onClick={() => { setIsAdminLogin((prev) => !prev); setLoginError(""); }}>
            {isAdminLogin ? "Caller sign in" : "Admin sign in"}
          </button>
        </div>
        <a className="caller-back-link" href="/">← Back to election dashboard</a>
      </section>
      <aside className="caller-login-aside"><span>FIELD INTELLIGENCE</span><h2>Every conversation<br />moves us closer.</h2><p>Capture local feedback as it happens and keep your team informed.</p><div className="aside-orbit orbit-one"/><div className="aside-orbit orbit-two"/></aside>
    </main>
  );

  if (role === "admin") {
    const callsList = adminActivity.all_calls && adminActivity.all_calls.length
      ? adminActivity.all_calls
      : (adminActivity.daily_activity || []).flatMap((d) => d.calls || []);

    const selectedCallerObj = callerFilter
      ? adminActivity.callers?.find((c) => String(c.pid) === String(callerFilter))
      : null;
    const selectedDistrictObj = adminDistrictFilter
      ? districts.find((d) => String(d.district_code) === String(adminDistrictFilter))
      : null;
    const selectedAcObj = adminAcFilter
      ? adminAssemblies.find((a) => String(a.ac_no) === String(adminAcFilter))
      : null;

    const hasActiveFilters = Boolean(
      callerFilter ||
      adminDistrictFilter ||
      adminAcFilter ||
      adminProblemFilter !== "all" ||
      adminSearchQuery.trim() ||
      dateFrom !== localDate(-13) ||
      dateTo !== localDate(0)
    );

    const handleDownloadReport = (specificCaller = null) => {
      const callsToExport = specificCaller
        ? callsList.filter((c) => String(c.caller_pid) === String(specificCaller.caller_pid))
        : callsList;

      if (!callsToExport.length) {
        setAdminNotice("No calls found to export with the current filters.");
        setTimeout(() => setAdminNotice(""), 4000);
        return;
      }

      const filenameParts = ["call_report"];
      if (specificCaller) {
        filenameParts.push(specificCaller.username.replace(/[^a-zA-Z0-9]/g, "_"));
      } else if (selectedCallerObj) {
        filenameParts.push(selectedCallerObj.username.replace(/[^a-zA-Z0-9]/g, "_"));
      }
      if (selectedDistrictObj) {
        filenameParts.push(selectedDistrictObj.name.replace(/[^a-zA-Z0-9]/g, "_"));
      }
      if (selectedAcObj) {
        filenameParts.push(`AC${selectedAcObj.ac_no}_${selectedAcObj.name.replace(/[^a-zA-Z0-9]/g, "_")}`);
      }
      if (dateFrom && dateTo) {
        filenameParts.push(`${dateFrom}_to_${dateTo}`);
      } else if (dateFrom) {
        filenameParts.push(`from_${dateFrom}`);
      } else if (dateTo) {
        filenameParts.push(`to_${dateTo}`);
      } else {
        filenameParts.push("all_time");
      }
      const filename = `${filenameParts.join("_")}.csv`;

      downloadCallsCSV(callsToExport, filename);
      setAdminNotice(`Downloaded report: ${callsToExport.length} calls saved as "${filename}".`);
      setTimeout(() => setAdminNotice(""), 5000);
    };

    const resetAdminFilters = () => {
      setDateFrom(localDate(-13));
      setDateTo(localDate(0));
      setCallerFilter("");
      setAdminDistrictFilter("");
      setAdminAcFilter("");
      setAdminProblemFilter("all");
      setAdminSearchQuery("");
    };

    const isToday = dateFrom === localDate(0) && dateTo === localDate(0);
    const isYesterday = dateFrom === localDate(-1) && dateTo === localDate(-1);
    const isLast7 = dateFrom === localDate(-6) && dateTo === localDate(0);
    const isLast30 = dateFrom === localDate(-29) && dateTo === localDate(0);
    const isAllTime = dateFrom === "" && dateTo === "";

    return (
      <main className="caller-app admin-app">
        <header className="caller-header">
          <a href="/" className="caller-logo">
            <span className="caller-logo-mark">EI</span>
            <span>Electoral Intelligence<small>ADMIN CONSOLE</small></span>
          </a>
          <div className="caller-header-right">
            <button
              onClick={() => handleDownloadReport()}
              className="admin-action-btn-primary"
              title="Download filtered calls report as CSV"
              disabled={adminLoading || callsList.length === 0}
            >
              <span>📥</span> Download Report ({callsList.length})
            </button>
            <button
              onClick={() => loadAdminActivity(true)}
              className="admin-action-btn-secondary"
              title="Refresh database records"
            >
              <span>↻</span> Refresh
            </button>
            <button onClick={() => openAuditTrail()} className="caller-action-btn">
              Audit Trail 📜
            </button>
            <span className="admin-role-pill">ADMIN</span>
            <button onClick={signOut}>Sign out ↗</button>
          </div>
        </header>

        <section className="caller-main admin-main">
          <div className="caller-page-title">
            <div>
              <div className="caller-kicker">CALL MANAGEMENT <span>•</span> FIELD INTELLIGENCE <span>•</span> ADMINISTRATION</div>
              <h1>Caller Activity & Reports</h1>
              <p>Monitor live calls made by callers, inspect field issues, and export custom reports filtered by geography and dates.</p>
            </div>
            <div className="caller-time">
              <span className="caller-live-dot" /> LIVE DATABASE <span>•</span> 30s Auto-refresh
            </div>
          </div>

          {adminNotice && (
            <div className="admin-toast-banner" role="status">
              <span>✓ {adminNotice}</span>
              <button className="admin-toast-close" onClick={() => setAdminNotice("")}>×</button>
            </div>
          )}

          {adminError && <div className="caller-error" role="alert">{adminError}</div>}

          {/* Dynamic Filter Card */}
          <section className="admin-filter-container">
            <div className="admin-presets-row">
              <span className="admin-presets-label">Date Presets:</span>
              <button
                type="button"
                className={`admin-preset-btn ${isToday ? "active" : ""}`}
                onClick={() => { setDateFrom(localDate(0)); setDateTo(localDate(0)); }}
              >
                Today
              </button>
              <button
                type="button"
                className={`admin-preset-btn ${isYesterday ? "active" : ""}`}
                onClick={() => { setDateFrom(localDate(-1)); setDateTo(localDate(-1)); }}
              >
                Yesterday
              </button>
              <button
                type="button"
                className={`admin-preset-btn ${isLast7 ? "active" : ""}`}
                onClick={() => { setDateFrom(localDate(-6)); setDateTo(localDate(0)); }}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                className={`admin-preset-btn ${isLast30 ? "active" : ""}`}
                onClick={() => { setDateFrom(localDate(-29)); setDateTo(localDate(0)); }}
              >
                Last 30 Days
              </button>
              <button
                type="button"
                className={`admin-preset-btn ${isAllTime ? "active" : ""}`}
                onClick={() => { setDateFrom(""); setDateTo(""); }}
              >
                All Time
              </button>
            </div>

            <div className="admin-filter-grid">
              <label>
                From date
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>

              <label>
                To date
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>

              <label>
                Caller
                <select
                  value={callerFilter}
                  onChange={(event) => setCallerFilter(event.target.value)}
                >
                  <option value="">All callers ({adminActivity.callers?.length || 0})</option>
                  {(adminActivity.callers || []).map((caller) => {
                    const stat = (adminActivity.caller_stats || []).find((s) => s.caller_pid === caller.pid);
                    const countTxt = stat ? ` (${stat.total_calls} calls)` : "";
                    return (
                      <option key={caller.pid} value={caller.pid}>
                        {caller.username}{countTxt}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label>
                District
                <select
                  value={adminDistrictFilter}
                  onChange={(event) => {
                    setAdminDistrictFilter(event.target.value);
                    setAdminAcFilter("");
                  }}
                >
                  <option value="">All districts ({districts.length})</option>
                  {districts.map((d) => (
                    <option key={d.district_code} value={d.district_code}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Assembly (AC)
                <select
                  value={adminAcFilter}
                  onChange={(event) => setAdminAcFilter(event.target.value)}
                >
                  <option value="">
                    {adminDistrictFilter ? "All ACs in District" : "All Assemblies"} ({adminAssemblies.length})
                  </option>
                  {adminAssemblies.map((a) => (
                    <option key={a.ac_no} value={a.ac_no}>
                      {a.name} (AC {a.ac_no})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Call outcome
                <select
                  value={adminProblemFilter}
                  onChange={(event) => setAdminProblemFilter(event.target.value)}
                >
                  <option value="all">All outcomes</option>
                  <option value="issues">⚠️ Issues reported only</option>
                  <option value="clear">✓ No issue / clear only</option>
                </select>
              </label>
            </div>

            <div className="admin-search-row">
              <div className="admin-search-box">
                <span className="admin-search-icon">🔍</span>
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Search caller, contact name, phone number, village, issue keyword, or feedback notes…"
                  value={adminSearchQuery}
                  onChange={(e) => setAdminSearchQuery(e.target.value)}
                />
                {adminSearchQuery && (
                  <button
                    type="button"
                    className="admin-search-clear"
                    onClick={() => setAdminSearchQuery("")}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {hasActiveFilters && (
              <div className="admin-filter-chips">
                <span className="admin-presets-label">Active filters:</span>
                {selectedCallerObj && (
                  <span className="admin-chip">
                    Caller: <b>{selectedCallerObj.username}</b>
                    <button type="button" className="admin-chip-remove" onClick={() => setCallerFilter("")}>×</button>
                  </span>
                )}
                {selectedDistrictObj && (
                  <span className="admin-chip">
                    District: <b>{selectedDistrictObj.name}</b>
                    <button type="button" className="admin-chip-remove" onClick={() => { setAdminDistrictFilter(""); setAdminAcFilter(""); }}>×</button>
                  </span>
                )}
                {selectedAcObj && (
                  <span className="admin-chip">
                    AC: <b>{selectedAcObj.name}</b>
                    <button type="button" className="admin-chip-remove" onClick={() => setAdminAcFilter("")}>×</button>
                  </span>
                )}
                {adminProblemFilter !== "all" && (
                  <span className="admin-chip">
                    Status: <b>{adminProblemFilter === "issues" ? "Issues Only" : "Clear Only"}</b>
                    <button type="button" className="admin-chip-remove" onClick={() => setAdminProblemFilter("all")}>×</button>
                  </span>
                )}
                {adminSearchQuery.trim() && (
                  <span className="admin-chip">
                    Search: <b>"{adminSearchQuery.trim()}"</b>
                    <button type="button" className="admin-chip-remove" onClick={() => setAdminSearchQuery("")}>×</button>
                  </span>
                )}
                {(dateFrom || dateTo) && (
                  <span className="admin-chip">
                    Date: <b>{[dateFrom, dateTo].filter(Boolean).join(" to ")}</b>
                  </span>
                )}
                <button
                  type="button"
                  className="admin-reset-all-btn"
                  onClick={resetAdminFilters}
                >
                  Reset all filters ✕
                </button>
              </div>
            )}
          </section>

          {/* Dynamic KPI Metrics */}
          <section className="admin-metrics">
            <article className="metric-calls">
              <span>CALLS LOGGED</span>
              <strong>{adminActivity.summary?.calls_logged || 0}</strong>
              <div className="admin-metric-sub">Across filtered range</div>
            </article>

            <article className="metric-issues">
              <span>ISSUES IDENTIFIED</span>
              <strong>{adminActivity.summary?.issues_reported || 0}</strong>
              <div className="admin-metric-sub">
                <span className="admin-rate-badge issue-rate">
                  {adminActivity.summary?.issue_rate_pct || 0}% rate
                </span>
              </div>
            </article>

            <article className="metric-clear">
              <span>NO ISSUE / CLEAR</span>
              <strong>
                {adminActivity.summary?.clear_calls ??
                  Math.max(0, (adminActivity.summary?.calls_logged || 0) - (adminActivity.summary?.issues_reported || 0))}
              </strong>
              <div className="admin-metric-sub">
                <span className="admin-rate-badge clear-rate">
                  {adminActivity.summary?.calls_logged
                    ? Math.round(
                        ((adminActivity.summary?.calls_logged - (adminActivity.summary?.issues_reported || 0)) /
                          adminActivity.summary?.calls_logged) *
                          100
                      )
                    : 0}% clean
                </span>
              </div>
            </article>

            <article className="metric-callers">
              <span>ACTIVE CALLERS</span>
              <strong>{adminActivity.summary?.active_callers || 0}</strong>
              <div className="admin-metric-sub">
                of {adminActivity.summary?.total_callers || adminActivity.callers?.length || 0} registered
              </div>
            </article>

            <article className="metric-geography">
              <span>DISTRICTS COVERED</span>
              <strong>{adminActivity.summary?.districts_covered || 0}</strong>
              <div className="admin-metric-sub">Unique districts</div>
            </article>

            <article className="metric-geography">
              <span>CONSTITUENCIES (ACS)</span>
              <strong>{adminActivity.summary?.assemblies_covered || 0}</strong>
              <div className="admin-metric-sub">Unique ACs reached</div>
            </article>

            <article className="metric-geography">
              <span>VILLAGES REACHED</span>
              <strong>{adminActivity.summary?.villages_covered || 0}</strong>
              <div className="admin-metric-sub">Local village areas</div>
            </article>
          </section>

          {/* Banner when viewing calls by a single caller */}
          {selectedCallerObj && (
            <div className="admin-filtered-caller-banner">
              <div>
                Currently showing all calls made by caller <strong>{selectedCallerObj.username}</strong> ({callsList.length} calls found).
              </div>
              <button
                type="button"
                className="admin-clear-filter-btn"
                onClick={() => setCallerFilter("")}
              >
                Show all callers ✕
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <nav className="admin-tabs-nav" aria-label="Admin views">
            <button
              type="button"
              className={`admin-tab-btn ${adminActiveTab === "feed" ? "active" : ""}`}
              onClick={() => setAdminActiveTab("feed")}
            >
              <span>📞</span> All Calls Log
              <span className="admin-tab-count">{callsList.length}</span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${adminActiveTab === "callers" ? "active" : ""}`}
              onClick={() => setAdminActiveTab("callers")}
            >
              <span>👥</span> Caller Directory & Performance
              <span className="admin-tab-count">
                {(adminActivity.caller_stats || []).length || adminActivity.callers?.length || 0}
              </span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${adminActiveTab === "daily" ? "active" : ""}`}
              onClick={() => setAdminActiveTab("daily")}
            >
              <span>📅</span> Daily Work Log
              <span className="admin-tab-count">{(adminActivity.daily_activity || []).length}</span>
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${adminActiveTab === "analytics" ? "active" : ""}`}
              onClick={() => setAdminActiveTab("analytics")}
            >
              <span>📊</span> Analytics & Insights
            </button>
          </nav>

          {/* Tab 1: All Calls Log Feed */}
          {adminActiveTab === "feed" && (
            <div className="admin-calls-view">
              <div className="admin-list-heading">
                <div>
                  <div className="caller-kicker">INDIVIDUAL CALL LEDGER</div>
                  <h2>Filtered Call Records</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>{adminLoading ? "Refreshing…" : `${callsList.length} calls logged`}</span>
                  <button
                    type="button"
                    className="admin-action-btn-secondary"
                    onClick={() => handleDownloadReport()}
                    disabled={callsList.length === 0}
                  >
                    📥 Export CSV
                  </button>
                </div>
              </div>

              {callsList.length ? (
                <section className="admin-calls-feed">
                  {callsList.map((item) => (
                    <article
                      className="admin-feed-card"
                      key={item.report_id}
                      onClick={() => setAdminSelectedCall(item)}
                    >
                      <div className="admin-feed-card-header">
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            className="admin-feed-caller-badge"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCallerFilter(String(item.caller_pid));
                            }}
                            title={`Filter strictly to ${item.caller_username}`}
                          >
                            👤 {item.caller_username}
                          </span>
                          <span className="admin-feed-time">
                            🕒 {item.work_date} <b>·</b> {item.call_time}
                          </span>
                        </div>
                        <span
                          className={`admin-outcome ${item.has_problem ? "outcome-issue" : "outcome-clear"}`}
                        >
                          {item.has_problem ? "⚠️ Issue Reported" : "✓ No Issue / Clear"}
                        </span>
                      </div>

                      <div className="admin-feed-meta-row">
                        <div className="admin-feed-contact-info">
                          <span className="admin-feed-contact-name">
                            {item.sampark_sutra_name || "Unknown Sampark Sutra"}
                          </span>
                          {item.sampark_sutra_phone && (
                            <a
                              href={`tel:${item.sampark_sutra_phone}`}
                              className="admin-feed-phone-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              📞 {item.sampark_sutra_phone}
                            </a>
                          )}
                        </div>
                        <div className="admin-feed-location">
                          📍 {[item.district_name, item.assembly_name, item.village_name].filter(Boolean).join(" › ")}
                        </div>
                      </div>

                      <div className={`admin-feed-body ${item.has_problem ? "has-issue" : ""}`}>
                        <p>{item.summary || "No specific problem reported (contact profile review)"}</p>
                        {item.feedback && (
                          <div className="admin-feed-feedback-note">
                            Follow-up / Feedback: {item.feedback}
                          </div>
                        )}
                      </div>

                      <div className="admin-feed-footer">
                        <span className="admin-feed-category-pill">
                          {item.category || "General"}
                        </span>
                        <button
                          type="button"
                          className="admin-inspect-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAdminSelectedCall(item);
                          }}
                        >
                          Inspect Details ➔
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ) : (
                <div className="admin-empty">
                  <span>⌕</span>
                  <strong>{adminLoading ? "Loading call records…" : "No calls match your active filter"}</strong>
                  <p>Try clearing filters or selecting a wider date range.</p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      className="admin-action-btn-secondary"
                      onClick={resetAdminFilters}
                      style={{ marginTop: "12px" }}
                    >
                      Reset All Filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Caller Directory & Performance */}
          {adminActiveTab === "callers" && (
            <div className="admin-callers-view">
              <div className="admin-list-heading">
                <div>
                  <div className="caller-kicker">CALLER DIRECTORY & LEADERBOARD</div>
                  <h2>Caller Performance & Activity</h2>
                </div>
                <span>{(adminActivity.caller_stats || []).length} callers active in this period</span>
              </div>

              {(adminActivity.caller_stats || []).length ? (
                <section className="admin-caller-grid">
                  {(adminActivity.caller_stats || []).map((stat) => (
                    <article className="admin-caller-card" key={stat.caller_pid}>
                      <div className="admin-caller-card-top">
                        <span className="admin-caller-avatar-lg">
                          {stat.username.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="admin-caller-title">
                          <div className="admin-caller-name">
                            {stat.username}
                            <span className="admin-caller-id-pill">PID #{stat.caller_pid}</span>
                          </div>
                          <div className="admin-caller-last-active">
                            {stat.last_call_time
                              ? `Last call: ${stat.last_call_time}`
                              : "No calls in selected range"}
                          </div>
                        </div>
                      </div>

                      <div className="admin-caller-stats-row">
                        <div className="admin-caller-stat-col">
                          <span>TOTAL CALLS</span>
                          <strong>{stat.total_calls}</strong>
                        </div>
                        <div className="admin-caller-stat-col issue-stat">
                          <span>ISSUES</span>
                          <strong>{stat.issues_reported}</strong>
                        </div>
                        <div className="admin-caller-stat-col">
                          <span>CLEAR</span>
                          <strong>{stat.clear_calls}</strong>
                        </div>
                      </div>

                      <div className="admin-caller-coverage">
                        <span className="admin-caller-coverage-title">
                          Geographic Footprint:
                        </span>
                        <div>
                          <b>{stat.villages_count}</b> villages across{" "}
                          <b>{stat.assemblies.length}</b> constituencies
                        </div>
                        {stat.assemblies.length > 0 && (
                          <div className="admin-caller-chips">
                            {stat.assemblies.slice(0, 4).map((ac) => (
                              <span key={ac} className="admin-geo-tag">{ac}</span>
                            ))}
                            {stat.assemblies.length > 4 && (
                              <span className="admin-geo-tag">+{stat.assemblies.length - 4} more</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="admin-caller-actions">
                        <button
                          type="button"
                          className="admin-view-calls-btn"
                          onClick={() => {
                            setCallerFilter(String(stat.caller_pid));
                            setAdminActiveTab("feed");
                          }}
                        >
                          See Calls ({stat.total_calls}) ➔
                        </button>
                        <button
                          type="button"
                          className="admin-export-caller-btn"
                          onClick={() => handleDownloadReport(stat)}
                          title="Export CSV report for this caller only"
                          disabled={stat.total_calls === 0}
                        >
                          📥 Export
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ) : (
                <div className="admin-empty">
                  <span>👥</span>
                  <strong>No caller activity found for this period</strong>
                  <p>Choose a different date range or clear the filters.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Daily Work Log */}
          {adminActiveTab === "daily" && (
            <div className="admin-daily-view">
              <div className="admin-list-heading">
                <div>
                  <div className="caller-kicker">DAILY WORK LOG</div>
                  <h2>Caller Activity by Day</h2>
                </div>
                <span>
                  {adminLoading ? "Refreshing…" : `${(adminActivity.daily_activity || []).length} caller-days`}
                </span>
              </div>

              <section className="admin-activity-list">
                {(adminActivity.daily_activity || []).length ? (
                  adminActivity.daily_activity.map((day) => (
                    <details
                      className="admin-day-card"
                      key={`${day.caller_pid}-${day.work_date}`}
                    >
                      <summary>
                        <span className="admin-avatar">
                          {day.username.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="admin-day-title">
                          <strong>{day.username}</strong>
                          <small>
                            {new Date(`${day.work_date}T12:00:00`).toLocaleDateString("en-IN", {
                              weekday: "long",
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </small>
                        </span>
                        <span className="admin-day-stat">
                          <b>{day.calls_logged}</b> calls
                        </span>
                        <span className="admin-day-stat issue-stat">
                          <b>{day.issues_reported}</b> issues
                        </span>
                        <span className="admin-expand">⌄</span>
                      </summary>
                      <div className="admin-call-list">
                        {day.calls.map((item) => (
                          <article
                            className="admin-call-row"
                            key={item.report_id}
                            onClick={() => setAdminSelectedCall(item)}
                            style={{ cursor: "pointer" }}
                          >
                            <time>{item.call_time}</time>
                            <div className="admin-call-main">
                              <div className="admin-call-contact">
                                <strong>{item.sampark_sutra_name || "Unknown Sampark Sutra"}</strong>
                                {item.sampark_sutra_phone && (
                                  <a
                                    href={`tel:${item.sampark_sutra_phone}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {item.sampark_sutra_phone}
                                  </a>
                                )}
                              </div>
                              <div className="admin-call-location">
                                {[item.village_name, item.assembly_name, item.district_name].filter(Boolean).join(" · ")}
                              </div>
                              <p>{item.summary || "No issue reported"}</p>
                              {item.category && <span className="admin-category">{item.category}</span>}
                              {item.feedback && <div className="admin-feedback">Follow-up: {item.feedback}</div>}
                            </div>
                            <span
                              className={`admin-outcome ${item.has_problem ? "outcome-issue" : "outcome-clear"}`}
                            >
                              {item.has_problem ? "Issue" : "No issue"}
                            </span>
                          </article>
                        ))}
                      </div>
                    </details>
                  ))
                ) : (
                  <div className="caller-empty admin-empty">
                    <span>⌕</span>
                    <strong>{adminLoading ? "Loading caller activity…" : "No calls found for this period"}</strong>
                    <p>Choose a different date range or caller.</p>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Tab 4: Analytics & Insights */}
          {adminActiveTab === "analytics" && (
            <div className="admin-analytics-view">
              <div className="admin-list-heading">
                <div>
                  <div className="caller-kicker">AGGREGATED FIELD INTELLIGENCE</div>
                  <h2>Top Categories & Geographic Insights</h2>
                </div>
                <span>Calculated over {callsList.length} filtered calls</span>
              </div>

              <section className="admin-analytics-grid">
                {/* Categories Card */}
                <article className="admin-analytics-card">
                  <div className="admin-analytics-card-header">
                    <h3>Top Issue Categories</h3>
                    <span>{adminActivity.summary?.top_categories?.length || 0} categories</span>
                  </div>
                  <div className="admin-bar-list">
                    {(adminActivity.summary?.top_categories || []).map((cat) => {
                      const maxCount = adminActivity.summary.top_categories[0]?.count || 1;
                      const pct = Math.round((cat.count / maxCount) * 100);
                      return (
                        <div className="admin-bar-row" key={cat.category}>
                          <div className="admin-bar-label-row">
                            <span className="admin-bar-name">{cat.category}</span>
                            <span className="admin-bar-count">
                              {cat.count} calls {cat.issues > 0 ? `(${cat.issues} issues)` : ""}
                            </span>
                          </div>
                          <div className="admin-bar-track">
                            <div
                              className="admin-bar-fill category-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {!adminActivity.summary?.top_categories?.length && (
                      <p style={{ fontSize: "12px", color: "#829ab1" }}>No categorized calls in current view.</p>
                    )}
                  </div>
                </article>

                {/* Assemblies Card */}
                <article className="admin-analytics-card">
                  <div className="admin-analytics-card-header">
                    <h3>Top Assembly Constituencies</h3>
                    <span>{adminActivity.summary?.top_assemblies?.length || 0} ACs</span>
                  </div>
                  <div className="admin-bar-list">
                    {(adminActivity.summary?.top_assemblies || []).map((ac) => {
                      const maxCount = adminActivity.summary.top_assemblies[0]?.count || 1;
                      const pct = Math.round((ac.count / maxCount) * 100);
                      return (
                        <div className="admin-bar-row" key={ac.name}>
                          <div className="admin-bar-label-row">
                            <span className="admin-bar-name">{ac.name}</span>
                            <span className="admin-bar-count">{ac.count} calls</span>
                          </div>
                          <div className="admin-bar-track">
                            <div
                              className="admin-bar-fill ac-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {!adminActivity.summary?.top_assemblies?.length && (
                      <p style={{ fontSize: "12px", color: "#829ab1" }}>No assembly data in current view.</p>
                    )}
                  </div>
                </article>

                {/* Districts Card */}
                <article className="admin-analytics-card">
                  <div className="admin-analytics-card-header">
                    <h3>Top Districts</h3>
                    <span>{adminActivity.summary?.top_districts?.length || 0} districts</span>
                  </div>
                  <div className="admin-bar-list">
                    {(adminActivity.summary?.top_districts || []).map((dist) => {
                      const maxCount = adminActivity.summary.top_districts[0]?.count || 1;
                      const pct = Math.round((dist.count / maxCount) * 100);
                      return (
                        <div className="admin-bar-row" key={dist.name}>
                          <div className="admin-bar-label-row">
                            <span className="admin-bar-name">{dist.name}</span>
                            <span className="admin-bar-count">{dist.count} calls</span>
                          </div>
                          <div className="admin-bar-track">
                            <div
                              className="admin-bar-fill district-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {!adminActivity.summary?.top_districts?.length && (
                      <p style={{ fontSize: "12px", color: "#829ab1" }}>No district data in current view.</p>
                    )}
                  </div>
                </article>

                {/* Resolution Summary */}
                <article className="admin-analytics-card">
                  <div className="admin-analytics-card-header">
                    <h3>Call Evaluation Ratios</h3>
                    <span>Total {callsList.length} records</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Issue Discovery Rate:</span>
                      <strong style={{ color: "#c53030", fontSize: "15px" }}>
                        {adminActivity.summary?.issue_rate_pct || 0}%
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Clean / Informative Rate:</span>
                      <strong style={{ color: "#276749", fontSize: "15px" }}>
                        {adminActivity.summary?.calls_logged
                          ? Math.round(
                              ((adminActivity.summary?.calls_logged - (adminActivity.summary?.issues_reported || 0)) /
                                adminActivity.summary?.calls_logged) *
                                100
                            )
                          : 0}%
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Average Calls per Active Caller:</span>
                      <strong style={{ color: "#102a43", fontSize: "15px" }}>
                        {adminActivity.summary?.active_callers
                          ? Math.round((callsList.length / adminActivity.summary.active_callers) * 10) / 10
                          : 0}
                      </strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Total Registered Callers:</span>
                      <strong style={{ color: "#486581" }}>
                        {adminActivity.summary?.total_callers || adminActivity.callers?.length || 0}
                      </strong>
                    </div>
                  </div>
                </article>
              </section>
            </div>
          )}

          <footer className="caller-footer">
            <span>Electoral Intelligence <b>·</b> Admin Console & Reporting</span>
            <span>Daily totals calculated in Asia/Kolkata (IST).</span>
          </footer>
        </section>

        {/* Detailed Call Inspection Modal */}
        {adminSelectedCall && (
          <div
            className="caller-modal-scrim"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAdminSelectedCall(null);
            }}
          >
            <section className="caller-modal" role="dialog" aria-modal="true" style={{ width: "min(100%, 640px)" }}>
              <header className="caller-modal-header">
                <div>
                  <div className="caller-kicker">CALL INSPECTION <span>•</span> RECORD #{adminSelectedCall.report_id}</div>
                  <h2>Call Discussion Details</h2>
                </div>
                <button className="modal-close" onClick={() => setAdminSelectedCall(null)}>×</button>
              </header>

              <div className="admin-call-modal-body">
                <div className="admin-detail-section">
                  <span className="admin-detail-title">Caller & Timing</span>
                  <div className="admin-detail-row">
                    <div className="admin-detail-field">
                      <span className="admin-detail-label">Caller</span>
                      <span className="admin-detail-value">👤 {adminSelectedCall.caller_username}</span>
                    </div>
                    <div className="admin-detail-field">
                      <span className="admin-detail-label">Date & Time (IST)</span>
                      <span className="admin-detail-value">
                        {adminSelectedCall.work_date} at {adminSelectedCall.call_time}
                      </span>
                    </div>
                    <div className="admin-detail-field">
                      <span className="admin-detail-label">Call Outcome</span>
                      <span className={`admin-outcome ${adminSelectedCall.has_problem ? "outcome-issue" : "outcome-clear"}`}>
                        {adminSelectedCall.has_problem ? "⚠️ Issue Reported" : "✓ No Issue / Clear"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="admin-detail-section">
                  <span className="admin-detail-title">Sampark Sutra Contact</span>
                  <div className="admin-detail-row">
                    <div className="admin-detail-field">
                      <span className="admin-detail-label">Contact Name</span>
                      <span className="admin-detail-value">{adminSelectedCall.sampark_sutra_name || "Unknown"}</span>
                    </div>
                    <div className="admin-detail-field">
                      <span className="admin-detail-label">Phone</span>
                      <span className="admin-detail-value">
                        {adminSelectedCall.sampark_sutra_phone ? (
                          <a href={`tel:${adminSelectedCall.sampark_sutra_phone}`} className="admin-feed-phone-link">
                            📞 {adminSelectedCall.sampark_sutra_phone}
                          </a>
                        ) : "N/A"}
                      </span>
                    </div>
                    <div className="admin-detail-field">
                      <span className="admin-detail-label">Category</span>
                      <span className="admin-detail-value">{adminSelectedCall.category || "General"}</span>
                    </div>
                  </div>
                </div>

                <div className="admin-detail-section">
                  <span className="admin-detail-title">Location Hierarchy</span>
                  <div className="admin-detail-row">
                    <div className="admin-detail-field">
                      <span className="admin-detail-label">District</span>
                      <span className="admin-detail-value">{adminSelectedCall.district_name || "N/A"}</span>
                    </div>
                    <div className="admin-detail-field">
                      <span className="admin-detail-label">Assembly Constituency</span>
                      <span className="admin-detail-value">
                        {adminSelectedCall.assembly_name || "N/A"} {adminSelectedCall.ac_no ? `(AC ${adminSelectedCall.ac_no})` : ""}
                      </span>
                    </div>
                    <div className="admin-detail-field">
                      <span className="admin-detail-label">Village</span>
                      <span className="admin-detail-value">{adminSelectedCall.village_name || "N/A"}</span>
                    </div>
                  </div>
                </div>

                <div className="admin-detail-section">
                  <span className="admin-detail-title">Discussion Summary</span>
                  <div className="admin-detail-text-box">
                    {adminSelectedCall.summary || "No discussion summary was recorded for this call."}
                  </div>
                </div>

                {adminSelectedCall.feedback && (
                  <div className="admin-detail-section">
                    <span className="admin-detail-title">Follow-up & Notes</span>
                    <div className="admin-detail-text-box">
                      {adminSelectedCall.feedback}
                    </div>
                  </div>
                )}
              </div>

              <div className="caller-form-actions" style={{ marginTop: "16px", justifyContent: "space-between" }}>
                <button
                  type="button"
                  className="admin-action-btn-secondary"
                  onClick={() => {
                    const text = `Caller: ${adminSelectedCall.caller_username}\nDate: ${adminSelectedCall.work_date} ${adminSelectedCall.call_time}\nContact: ${adminSelectedCall.sampark_sutra_name} (${adminSelectedCall.sampark_sutra_phone})\nLocation: ${[adminSelectedCall.district_name, adminSelectedCall.assembly_name, adminSelectedCall.village_name].filter(Boolean).join(" - ")}\nSummary: ${adminSelectedCall.summary}\nNotes: ${adminSelectedCall.feedback || "None"}`;
                    navigator.clipboard.writeText(text);
                    setAdminNotice("Call summary copied to clipboard.");
                    setTimeout(() => setAdminNotice(""), 3000);
                  }}
                >
                  📋 Copy Summary
                </button>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    className="admin-action-btn-primary"
                    onClick={() => {
                      setCallerFilter(String(adminSelectedCall.caller_pid));
                      setAdminActiveTab("feed");
                      setAdminSelectedCall(null);
                    }}
                  >
                    Filter to this Caller ➔
                  </button>
                  <button
                    type="button"
                    className="caller-cancel"
                    onClick={() => setAdminSelectedCall(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

      {/* Audit Log Modal for Admin */}
      {showAuditModal && (
        <div className="caller-modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAuditModal(false); }}>
          <section className="caller-modal" role="dialog" aria-modal="true" style={{ width: "min(100%, 720px)" }}>
            <header className="caller-modal-header">
              <div><div className="caller-kicker">CHANGE LOG & AUDIT TRAIL</div><h2>Sampark Sutra Activity History</h2></div>
              <button className="modal-close" onClick={() => setShowAuditModal(false)}>×</button>
            </header>
            <div className="audit-filter-pills">
              {["", "CREATED", "UPDATED", "DELETED"].map((action) => (
                <button key={action} className={`audit-filter-pill ${auditActionFilter === action ? "active" : ""}`} onClick={() => openAuditTrail(action)}>
                  {action === "" ? "All actions" : action === "CREATED" ? "+ Added" : action === "UPDATED" ? "✎ Updated" : "✕ Removed"}
                </button>
              ))}
            </div>
            {auditLoading ? <div className="past-calls-loading">Loading audit records…</div> : (
              <div className="audit-list">
                {auditLogs.length ? auditLogs.map((log) => (
                  <article className="audit-item" key={log.log_id}>
                    <div className="audit-item-top">
                      <span className={`audit-item-badge ${log.action.toLowerCase()}`}>{log.action === "CREATED" ? "+ ADDED" : log.action === "UPDATED" ? "✎ UPDATED" : "✕ REMOVED"}</span>
                      <span className="audit-user-time">By <b>{log.username}</b> · <time>{log.time_formatted}</time></span>
                    </div>
                    <div className="audit-item-title">{log.contact_name} {log.contact_phone && `(${log.contact_phone})`}</div>
                    {log.details && (
                      <div className="audit-item-detail">
                        {log.action === "UPDATED" && log.details.changes ? (
                          <div>{Object.entries(log.details.changes).map(([k, v]) => <span key={k} style={{ display: "inline-block", marginRight: "8px" }}><b>{k}</b>: {String(v.before || "none")} → <b>{String(v.after)}</b></span>)}</div>
                        ) : log.action === "DELETED" ? (
                          <div>{log.details.reason ? `Reason: ${log.details.reason}` : "Contact removed from database"}</div>
                        ) : (
                          <div>New contact profile created in database</div>
                        )}
                      </div>
                    )}
                  </article>
                )) : <div className="past-calls-empty"><span>ℹ</span><span>No audit log records found for this filter.</span></div>}
              </div>
            )}
            <div className="caller-form-actions" style={{ marginTop: "14px" }}>
              <button type="button" className="caller-cancel" onClick={() => setShowAuditModal(false)}>Close</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
  }

  return (
    <main className="caller-app">
      <header className="caller-header">
        <a href="/" className="caller-logo"><span className="caller-logo-mark">EI</span><span>Electoral Intelligence<small>FIELD CALLING</small></span></a>
        <div className="caller-header-right">
          <button onClick={() => openAuditTrail()} className="caller-action-btn">Audit Trail 📜</button>
          <span className="caller-live-dot"/> Secure workspace
          <button onClick={signOut}>Sign out ↗</button>
        </div>
      </header>

      <section className="caller-main">
        <div className="caller-page-title">
          <div>
            <div className="caller-kicker">CALL CENTER <span>•</span> CALL CALLER PANEL</div>
            <h1>Call Center Dashboard</h1>
            <p>Choose District, Assembly or Village to find and call contacts.</p>
          </div>
          <div className="caller-time"><span className="caller-live-dot"/> READY TO CALL</div>
        </div>

        <section className="caller-area-card">
          <div className="caller-card-heading">
            <div>
              <span className="caller-icon">⌖</span>
              <div>
                <h2>Select Location (स्थान चुनें)</h2>
                <p>Select District, Assembly or Village to see contact numbers.</p>
              </div>
            </div>
            <span className="required-label">EASY FILTER</span>
          </div>

          <div className="caller-select-grid">
            <label>
              District (ज़िला)
              <select value={districtCode} onChange={(e) => { setDistrictCode(e.target.value); setAcNo(""); setVillageId(""); setPageError(""); }}>
                <option value="">-- Select District (ज़िला चुनें) --</option>
                {districts.map((item) => <option key={item.district_code} value={item.district_code}>{item.name}</option>)}
              </select>
            </label>

            <label>
              Assembly (विधानसभा)
              <select value={acNo} disabled={!districtCode} onChange={(e) => { setAcNo(e.target.value); setVillageId(""); setPageError(""); }}>
                <option value="">{districtCode ? "All Assemblies in District (सभी विधानसभा)" : "Choose District first"}</option>
                {assemblies.map((item) => <option key={item.ac_no} value={item.ac_no}>{item.name}</option>)}
              </select>
            </label>

            <label>
              Village / Town (गाँव / कस्बा)
              <select value={villageId} disabled={!acNo} onChange={(e) => { setVillageId(e.target.value); setPageError(""); setNotice(""); }}>
                <option value="">{acNo ? (villages.length ? "All Villages in Assembly (सभी गाँव)" : "No contacts in villages") : "Choose Assembly first"}</option>
                {villages.map((item) => <option key={item.village_id} value={item.village_id}>{item.name}{item.contact_count != null ? ` (${item.contact_count})` : ""}</option>)}
              </select>
            </label>
          </div>

          {pageError && !activeContact && !showAddModal && !contactToDelete && (
            <div className="caller-error caller-page-error" role="alert">{pageError}</div>
          )}
        </section>

        {/* Contacts section rendered whenever District, AC or Village is selected */}
        {activeLevelInfo ? (
          <section className="caller-contacts-section">
            <div className="caller-list-heading">
              <div>
                <div className="caller-kicker">{activeLevelInfo.level}</div>
                <h2>{activeLevelInfo.name} <span>{filteredContacts.length} contacts</span></h2>
              </div>
              <div className="caller-list-controls">
                <button
                  type="button"
                  className={`caller-action-btn ${neverCalledOnly ? "filter-active" : ""}`}
                  onClick={() => setNeverCalledOnly((prev) => !prev)}
                  title="Show only contacts who have never been called before"
                >
                  {neverCalledOnly ? "✓ Never Called Only (सिर्फ नए संपर्क)" : "📞 Show Never Called Only"}
                </button>
                <div className="caller-search-box">
                  <span className="caller-search-icon">🔍</span>
                  <input
                    type="search"
                    className="caller-search-input"
                    placeholder="Search by name, phone number, or village…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button className="caller-action-btn primary" onClick={openAddModal}>
                  + Add New Contact
                </button>
              </div>
            </div>

            {notice && <div className="caller-success" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}

            <div className="caller-contact-list">
              {filteredContacts.length ? filteredContacts.map((contact) => {
                const missingCount = countMissingFields(contact);
                return (
                  <article className="caller-contact-row" key={contact.sid}>
                    <div className="contact-avatar">
                      {contact.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                    </div>

                    <div className="contact-details">
                      <div>
                        <strong>{contact.name}</strong>
                        {contact.call_count > 0 ? (
                          <span className="contact-call-count-pill" style={{ marginLeft: "8px" }}>
                            {contact.call_count} call{contact.call_count === 1 ? "" : "s"} done
                          </span>
                        ) : null}
                      </div>

                      <span>
                        {[
                          contact.phone,
                          contact.fathers_name && `Father: ${contact.fathers_name}`,
                          contact.age && `Age: ${contact.age} yrs`,
                          contact.epic_id && `Voter ID: ${contact.epic_id}`,
                        ].filter(Boolean).join(" · ") || "No phone / details added"}
                      </span>

                      {/* Display Location tag when viewing across AC or District */}
                      {(contact.village_name || contact.ac_name) && (
                        <div style={{ marginTop: "2px" }}>
                          <span className="contact-location-pill">
                            {[contact.ac_name && `Assembly: ${contact.ac_name}`, contact.village_name && `Village: ${contact.village_name}`].filter(Boolean).join(" • ")}
                          </span>
                        </div>
                      )}
                    </div>

                    {contact.flag ? (
                      <span className={`contact-status ${getFlagClass(contact.flag)}`}>
                        {getFlagClass(contact.flag) === "flag-reliable" ? "✓ " : getFlagClass(contact.flag) === "flag-unreliable" ? "✕ " : getFlagClass(contact.flag) === "flag-doubtful" ? "? " : ""}
                        {contact.flag}
                      </span>
                    ) : (
                      <span className="contact-missing-tag">Not Checked</span>
                    )}

                    {missingCount > 0 && (
                      <span className="sutra-missing-pill" title="Details need to be collected">
                        {missingCount} details needed
                      </span>
                    )}

                    <div className="contact-actions-row">
                      <button className="caller-record-button" onClick={() => openCall(contact)}>
                        Call & Save Info <span>→</span>
                      </button>
                      <button className="contact-delete-btn" title="Delete contact" onClick={(e) => openDeleteModal(contact, e)}>
                        🗑
                      </button>
                    </div>
                  </article>
                );
              }) : (
                <div className="caller-empty">
                  <span>⌕</span>
                  <strong>{searchTerm ? `No contacts matching "${searchTerm}"` : "No contacts found here"}</strong>
                  <p>{searchTerm ? "Check the spelling or try searching another name." : "Click '+ Add New Contact' to add a person to this list."}</p>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="caller-empty-area">
            <div className="empty-map-icon">⌖</div>
            <strong>Please select a District above to view contacts</strong>
            <p>Select your District and Assembly to see the list of people to call.</p>
          </section>
        )}

        <footer className="caller-footer">
          <span>Electoral Intelligence <b>·</b> Call Center Panel</span>
          <span>All call updates and notes are saved automatically.</span>
        </footer>
      </section>

      {/* Record Call / Update Contact Modal */}
      {activeContact && (
        <div className="caller-modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveContact(null); }}>
          <section className="caller-modal" role="dialog" aria-modal="true" aria-labelledby="call-form-title">
            <header className="caller-modal-header">
              <div>
                <div className="caller-kicker">CALL ENTRY FORM</div>
                <h2 id="call-form-title">Record Call (कॉल की जानकारी भरें)</h2>
              </div>
              <button className="modal-close" onClick={() => setActiveContact(null)} aria-label="Close">×</button>
            </header>

            <div className="caller-modal-person">
              <span className="contact-avatar">{activeContact.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
              <div>
                <strong>{activeContact.name}</strong>
                <span>{activeContact.phone || "No phone number"} · {[activeContact.ac_name, activeContact.village_name].filter(Boolean).join(" • ")}</span>
              </div>
            </div>

            {/* Past Discussions & Call History section */}
            <section className="contact-past-calls-card">
              <div className="past-calls-header" onClick={() => setShowCallsHistory(!showCallsHistory)}>
                <div>
                  <span className="past-calls-icon">💬</span>
                  <div>
                    <h4>Previous Calls & Notes (पिछली बात)</h4>
                    <p>{loadingCalls ? "Loading..." : `${activeContactCalls.length} previous call${activeContactCalls.length === 1 ? "" : "s"} on record`}</p>
                  </div>
                </div>
                <span className="past-calls-toggle">{showCallsHistory ? "▴ Hide" : "▾ Show"}</span>
              </div>

              {showCallsHistory && (
                <div className="past-calls-timeline">
                  {loadingCalls ? (
                    <div className="past-calls-loading">Loading call history…</div>
                  ) : activeContactCalls.length ? (
                    activeContactCalls.map((c) => {
                      const isCsvImport = c.provider === "roster-import" || (!c.provider && c.summary === "Roster remarks / past conversation");
                      if (isCsvImport) {
                        return (
                          <article className="past-call-entry" key={c.cid} style={{ padding: "8px 11px", background: "#f8fafc" }}>
                            <div style={{ fontSize: "11px", color: "#1e3c54", lineHeight: "1.45" }}>
                              <b>Previous Remark:</b> {c.feedback || c.summary || "No remark"}
                            </div>
                          </article>
                        );
                      }
                      return (
                        <article className="past-call-entry" key={c.cid}>
                          <div className="past-call-meta">
                            <time>{c.call_time}</time>
                            <span className="past-caller-name">Caller: <b>{c.caller_username}</b></span>
                            <span className={`admin-outcome ${c.has_problem ? "outcome-issue" : "outcome-clear"}`}>
                              {c.has_problem ? "Problem Reported" : "All Good / No Problem"}
                            </span>
                            {c.category && <span className="admin-category">{c.category}</span>}
                          </div>
                          {c.summary && <p className="past-call-summary">{c.summary}</p>}
                          {c.feedback && <div className="past-call-feedback"><b>Notes:</b> {c.feedback}</div>}
                        </article>
                      );
                    })
                  ) : (
                    <div className="past-calls-empty">
                      <span>ℹ</span>
                      <span>No previous calls yet. This is your first call to this person.</span>
                    </div>
                  )}
                </div>
              )}
            </section>

            <form onSubmit={submitCall} className="caller-call-form">
              <fieldset className="call-outcome">
                <legend>Did the person report any problem or complaint? (कोई समस्या है?)</legend>
                <label className={!call.has_problem ? "outcome-active" : ""}>
                  <input type="radio" name="outcome" checked={!call.has_problem} onChange={() => setCall({ ...call, has_problem: false })}/>
                  <span className="outcome-dot"/>No Problem / All Good (सब ठीक है)
                </label>
                <label className={call.has_problem ? "outcome-active" : ""}>
                  <input type="radio" name="outcome" checked={call.has_problem} onChange={() => setCall({ ...call, has_problem: true })}/>
                  <span className="outcome-dot"/>Problem Reported (समस्या बताई)
                </label>
              </fieldset>

              {call.has_problem ? (
                <>
                  <label>Problem details (समस्या का विवरण) <em>Required *</em><textarea autoFocus rows="3" placeholder="What problem did the person mention? (जैसे सड़क, बिजली, पानी की समस्या...)" value={call.summary} onChange={(e) => setCall({ ...call, summary: e.target.value })} required /></label>
                  <label>Problem Type (प्रकार) <em>Optional</em><select value={call.category} onChange={(e) => setCall({ ...call, category: e.target.value })}><option value="">-- Select Type (प्रकार चुनें) --</option><option>Roads & transport (सड़क एवं यातायात)</option><option>Water supply (पानी की समस्या)</option><option>Electricity (बिजली)</option><option>Sanitation & Cleanliness (सफाई व्यवस्था)</option><option>Public services (सरकारी काम / सेवाएं)</option><option>Employment / Jobs (रोज़गार)</option><option>Other (अन्य)</option></select></label>
                  <label>Extra Notes (अतिरिक्त टिप्पणी) <em>Optional</em><textarea rows="2" placeholder="Any extra remarks or notes..." value={call.feedback} onChange={(e) => setCall({ ...call, feedback: e.target.value })}/></label>

                  <button type="button" className="sutra-existing-toggle" onClick={() => setShowPrimaryDetails(!showPrimaryDetails)}>
                    <span>✎ Update person's details or reliability flag (व्यक्ति की जानकारी बदलें)</span>
                    <span>{showPrimaryDetails ? "▴ Hide" : "▾ Show"}</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="sutra-profile-banner">
                    <div className="sutra-profile-banner-left">
                      <div className="sutra-profile-banner-icon">📋</div>
                      <div>
                        <h3>Complete Contact Information (जानकारी पूरी करें)</h3>
                        <p>No problem reported. Please fill in any missing details below.</p>
                      </div>
                    </div>
                    <span className={`sutra-missing-pill ${countMissingFields(activeContact) === 0 ? "complete" : ""}`}>
                      {countMissingFields(activeContact) === 0 ? "All Details Complete ✓" : `${countMissingFields(activeContact)} details needed`}
                    </span>
                  </div>
                </>
              )}

              {(!call.has_problem || showPrimaryDetails) && (
                <>
                  <div className="sutra-flag-section">
                    <div className="sutra-flag-header">
                      <span>How reliable is this contact? (व्यक्ति कैसा है?)</span>
                      {!activeContact.flag ? <span className="badge-missing">NOT CHECKED</span> : <span className="badge-present">SAVED: {activeContact.flag}</span>}
                    </div>
                    <div className="sutra-flag-pills">
                      <button type="button" className={`flag-btn ${sutraForm.flag === "Reliable" ? "active reliable" : ""}`} onClick={() => setSutraForm({ ...sutraForm, flag: sutraForm.flag === "Reliable" ? "" : "Reliable" })}>
                        ✓ Reliable (भरोसेमंद)
                      </button>
                      <button type="button" className={`flag-btn ${sutraForm.flag === "Doubtful" ? "active doubtful" : ""}`} onClick={() => setSutraForm({ ...sutraForm, flag: sutraForm.flag === "Doubtful" ? "" : "Doubtful" })}>
                        ? Doubtful (संदेहास्पद)
                      </button>
                      <button type="button" className={`flag-btn ${sutraForm.flag === "Unreliable" ? "active unreliable" : ""}`} onClick={() => setSutraForm({ ...sutraForm, flag: sutraForm.flag === "Unreliable" ? "" : "Unreliable" })}>
                        ✕ Unreliable (अविश्वसनीय)
                      </button>
                      <button type="button" className={`flag-btn ${showCustomFlag || (!["Reliable", "Doubtful", "Unreliable", ""].includes(sutraForm.flag)) ? "active neutral" : ""}`} onClick={() => setShowCustomFlag(!showCustomFlag)}>
                        ✎ Custom (अन्य)
                      </button>
                    </div>
                    {(showCustomFlag || (!["Reliable", "Doubtful", "Unreliable", ""].includes(sutraForm.flag))) && (
                      <input type="text" className="sutra-field-input" placeholder="Type custom status..." value={sutraForm.flag} onChange={(e) => setSutraForm({ ...sutraForm, flag: e.target.value })} />
                    )}
                  </div>

                  <div className="sutra-section-title">
                    <span>Contact Details (व्यक्ति की जानकारी)</span>
                    <small>Fill empty fields to save to records</small>
                  </div>

                  <div className="sutra-fields-grid">
                    <div className="sutra-field-box">
                      <div className="sutra-field-label-row"><span>Father's Name (पिता का नाम)</span>{!activeContact.fathers_name ? <span className="badge-missing">NOT FILLED</span> : <span className="badge-present">SAVED</span>}</div>
                      <input type="text" className={`sutra-field-input ${!activeContact.fathers_name ? "input-missing" : ""}`} placeholder="e.g. Ramesh Singh" value={sutraForm.fathers_name} onChange={(e) => setSutraForm({ ...sutraForm, fathers_name: e.target.value })} />
                    </div>
                    <div className="sutra-field-box">
                      <div className="sutra-field-label-row"><span>Age in Years (उम्र)</span>{activeContact.age == null ? <span className="badge-missing">NOT FILLED</span> : <span className="badge-present">SAVED</span>}</div>
                      <input type="number" min="18" max="120" className={`sutra-field-input ${activeContact.age == null ? "input-missing" : ""}`} placeholder="e.g. 38" value={sutraForm.age} onChange={(e) => setSutraForm({ ...sutraForm, age: e.target.value })} />
                    </div>
                    <div className="sutra-field-box">
                      <div className="sutra-field-label-row"><span>Voter ID Card No (वोटर कार्ड नंबर)</span>{!activeContact.epic_id ? <span className="badge-missing">NOT FILLED</span> : <span className="badge-present">SAVED</span>}</div>
                      <input type="text" className={`sutra-field-input ${!activeContact.epic_id ? "input-missing" : ""}`} placeholder="e.g. WDF1234567" value={sutraForm.epic_id} onChange={(e) => setSutraForm({ ...sutraForm, epic_id: e.target.value })} />
                    </div>
                    <div className="sutra-field-box">
                      <div className="sutra-field-label-row"><span>WhatsApp / Mobile (व्हाट्सएप नंबर)</span>{!activeContact.social_media ? <span className="badge-missing">NOT FILLED</span> : <span className="badge-present">SAVED</span>}</div>
                      <input type="text" className={`sutra-field-input ${!activeContact.social_media ? "input-missing" : ""}`} placeholder="WhatsApp number or Facebook" value={sutraForm.social_media} onChange={(e) => setSutraForm({ ...sutraForm, social_media: e.target.value })} />
                    </div>
                  </div>

                  {!call.has_problem && (
                    <>
                      <button type="button" className="sutra-existing-toggle" onClick={() => setShowPrimaryDetails(!showPrimaryDetails)}>
                        <span>✎ Edit Name or Phone (नाम या फ़ोन बदलें)</span>
                        <span>{showPrimaryDetails ? "▴ Hide" : "▾ Show"}</span>
                      </button>

                      {showPrimaryDetails && (
                        <div className="sutra-fields-grid">
                          <div className="sutra-field-box">
                            <div className="sutra-field-label-row"><span>Full Name (पूरा नाम)</span><span className="badge-present">SAVED</span></div>
                            <input type="text" className="sutra-field-input" value={sutraForm.name} onChange={(e) => setSutraForm({ ...sutraForm, name: e.target.value })} required />
                          </div>
                          <div className="sutra-field-box">
                            <div className="sutra-field-label-row"><span>Phone Number (फ़ोन नंबर)</span><span className="badge-present">SAVED</span></div>
                            <input type="text" className="sutra-field-input" value={sutraForm.phone} onChange={(e) => setSutraForm({ ...sutraForm, phone: e.target.value })} required />
                          </div>
                        </div>
                      )}

                      <div className="sutra-db-sync-row">
                        <label className="sutra-sync-label">
                          <input type="checkbox" checked={updateSutra} onChange={(e) => setUpdateSutra(e.target.checked)} />
                          <span>Save newly filled details to profile</span>
                        </label>
                        <button type="button" className="sutra-quick-update-btn" disabled={busy} onClick={directUpdateSutra}>
                          Save Profile Now ↗
                        </button>
                      </div>

                      <label>Call Remarks / Notes (बातचीत की मुख्य बातें) <em>Optional</em><textarea rows="2" placeholder="Any points from your conversation..." value={call.feedback} onChange={(e) => setCall({ ...call, feedback: e.target.value })} /></label>
                    </>
                  )}
                </>
              )}

              {pageError && <div className="caller-error" role="alert">{pageError}</div>}
              <div className="caller-form-actions">
                <button type="button" className="caller-cancel" onClick={() => setActiveContact(null)}>Cancel</button>
                <button className="caller-primary" disabled={busy}>
                  {busy ? "Saving…" : (!call.has_problem ? "Save Call & Info" : "Save Call Details")}
                  <span>→</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Add New Sampark Sutra Modal */}
      {showAddModal && (
        <div className="caller-modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <section className="caller-modal" role="dialog" aria-modal="true" style={{ width: "min(100%, 640px)" }}>
            <header className="caller-modal-header">
              <div>
                <div className="caller-kicker">NEW CONTACT</div>
                <h2>Add New Contact (नया संपर्क जोड़ें)</h2>
              </div>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </header>

            <form onSubmit={handleCreateContact} className="caller-call-form" style={{ marginTop: "12px" }}>
              <div className="sutra-fields-grid">
                <div className="sutra-field-box">
                  <div className="sutra-field-label-row"><span>Full Name (पूरा नाम) <em>Required *</em></span></div>
                  <input
                    type="text"
                    className="sutra-field-input"
                    placeholder="e.g. Ramesh Singh"
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                    required
                  />
                </div>

                <div className="sutra-field-box">
                  <div className="sutra-field-label-row"><span>Mobile Number (मोबाइल नंबर) <em>Required *</em></span></div>
                  <input
                    type="tel"
                    className="sutra-field-input"
                    placeholder="10-digit mobile number"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    pattern="[0-9]{10}"
                    title="Please enter a valid 10-digit mobile number"
                    required
                  />
                </div>

                <div className="sutra-field-box">
                  <div className="sutra-field-label-row"><span>Assembly (विधानसभा) <em>Required *</em></span></div>
                  <select
                    className="sutra-field-input"
                    value={newContact.ac_no}
                    onChange={(e) => setNewContact({ ...newContact, ac_no: e.target.value, village_id: "" })}
                    required
                  >
                    <option value="">-- Select Assembly --</option>
                    {assemblies.map((a) => (
                      <option key={a.ac_no} value={a.ac_no}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div className="sutra-field-box">
                  <div className="sutra-field-label-row"><span>Village / Town (गाँव / कस्बा) <em>Required *</em></span></div>
                  <select
                    className="sutra-field-input"
                    value={newContact.village_id}
                    disabled={!newContact.ac_no}
                    onChange={(e) => setNewContact({ ...newContact, village_id: e.target.value })}
                    required
                  >
                    <option value="">{newContact.ac_no ? "-- Select Village --" : "Select Assembly first"}</option>
                    {(addModalVillages.length ? addModalVillages : villages).map((v) => (
                      <option key={v.village_id} value={v.village_id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                <div className="sutra-field-box">
                  <div className="sutra-field-label-row"><span>Father's Name (पिता का नाम)</span></div>
                  <input
                    type="text"
                    className="sutra-field-input"
                    placeholder="e.g. Sohan Lal"
                    value={newContact.fathers_name}
                    onChange={(e) => setNewContact({ ...newContact, fathers_name: e.target.value })}
                  />
                </div>

                <div className="sutra-field-box">
                  <div className="sutra-field-label-row"><span>Age in Years (उम्र)</span></div>
                  <input
                    type="number"
                    min="18"
                    max="120"
                    className="sutra-field-input"
                    placeholder="e.g. 42"
                    value={newContact.age}
                    onChange={(e) => setNewContact({ ...newContact, age: e.target.value })}
                  />
                </div>

                <div className="sutra-field-box">
                  <div className="sutra-field-label-row"><span>Voter ID Card No (वोटर कार्ड नंबर)</span></div>
                  <input
                    type="text"
                    className="sutra-field-input"
                    placeholder="e.g. WDF1234567"
                    value={newContact.epic_id}
                    onChange={(e) => setNewContact({ ...newContact, epic_id: e.target.value })}
                  />
                </div>

                <div className="sutra-field-box">
                  <div className="sutra-field-label-row"><span>WhatsApp / Social Media (व्हाट्सएप)</span></div>
                  <input
                    type="text"
                    className="sutra-field-input"
                    placeholder="WhatsApp number or handle"
                    value={newContact.social_media}
                    onChange={(e) => setNewContact({ ...newContact, social_media: e.target.value })}
                  />
                </div>
              </div>

              <div className="sutra-flag-section">
                <div className="sutra-flag-header">
                  <span>How reliable is this contact? (व्यक्ति कैसा है?)</span>
                </div>
                <div className="sutra-flag-pills">
                  {["Reliable", "Doubtful", "Unreliable"].map((fl) => (
                    <button
                      type="button"
                      key={fl}
                      className={`flag-btn ${newContact.flag === fl ? `active ${fl.toLowerCase()}` : ""}`}
                      onClick={() => setNewContact({ ...newContact, flag: newContact.flag === fl ? "" : fl })}
                    >
                      {fl === "Reliable" ? "✓ Reliable (भरोसेमंद)" : fl === "Doubtful" ? "? Doubtful (संदेहास्पद)" : "✕ Unreliable (अविश्वसनीय)"}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`flag-btn ${!["Reliable", "Doubtful", "Unreliable", ""].includes(newContact.flag) ? "active neutral" : ""}`}
                    onClick={() => { if (["Reliable", "Doubtful", "Unreliable"].includes(newContact.flag)) setNewContact({ ...newContact, flag: "Neutral" }); }}
                  >
                    ✎ Custom (अन्य)
                  </button>
                </div>
              </div>

              {pageError && <div className="caller-error" role="alert">{pageError}</div>}

              <div className="caller-form-actions">
                <button type="button" className="caller-cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button className="caller-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save Contact"}
                  <span>→</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Delete Contact Confirmation Modal */}
      {contactToDelete && (
        <div className="caller-modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setContactToDelete(null); }}>
          <section className="caller-modal" role="dialog" aria-modal="true" style={{ width: "min(100%, 480px)" }}>
            <header className="caller-modal-header">
              <div>
                <div className="caller-kicker" style={{ color: "#c53434" }}>DELETE CONTACT</div>
                <h2>Remove Contact (संपर्क हटाएं)</h2>
              </div>
              <button className="modal-close" onClick={() => setContactToDelete(null)}>×</button>
            </header>

            <div className="delete-confirm-box">
              <strong>Are you sure you want to remove this contact?</strong>
              <p style={{ margin: "4px 0 0" }}>
                <b>{contactToDelete.name}</b> ({contactToDelete.phone}) from {contactToDelete.village_name || "Village"} ({contactToDelete.ac_name || "Assembly"}).
              </p>
            </div>

            <label style={{ fontSize: "10.5px", fontWeight: "650", color: "#3e5264", display: "flex", flexDirection: "column", gap: "6px" }}>
              Reason for removing (हटाने का कारण) <em>Optional</em>
              <input
                type="text"
                className="sutra-field-input"
                placeholder="e.g. Wrong number / Number not working / Shifted"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
              />
            </label>

            {pageError && <div className="caller-error" role="alert" style={{ marginTop: "10px" }}>{pageError}</div>}

            <div className="caller-form-actions" style={{ marginTop: "16px" }}>
              <button type="button" className="caller-cancel" onClick={() => setContactToDelete(null)}>Cancel</button>
              <button className="caller-danger-btn" disabled={busy} onClick={handleDeleteContact}>
                {busy ? "Removing…" : "Yes, Remove Contact"}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Audit Trail Modal */}
      {showAuditModal && (
        <div className="caller-modal-scrim" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAuditModal(false); }}>
          <section className="caller-modal" role="dialog" aria-modal="true" style={{ width: "min(100%, 720px)" }}>
            <header className="caller-modal-header">
              <div>
                <div className="caller-kicker">CHANGE LOG & AUDIT TRAIL</div>
                <h2>Sampark Sutra Activity History</h2>
              </div>
              <button className="modal-close" onClick={() => setShowAuditModal(false)}>×</button>
            </header>

            <div className="audit-filter-pills" style={{ marginTop: "10px" }}>
              {["", "CREATED", "UPDATED", "DELETED"].map((action) => (
                <button
                  key={action}
                  className={`audit-filter-pill ${auditActionFilter === action ? "active" : ""}`}
                  onClick={() => openAuditTrail(action)}
                >
                  {action === "" ? "All actions" : action === "CREATED" ? "+ Added" : action === "UPDATED" ? "✎ Updated" : "✕ Removed"}
                </button>
              ))}
            </div>

            {auditLoading ? (
              <div className="past-calls-loading">Loading audit records…</div>
            ) : (
              <div className="audit-list">
                {auditLogs.length ? auditLogs.map((log) => (
                  <article className="audit-item" key={log.log_id}>
                    <div className="audit-item-top">
                      <span className={`audit-item-badge ${log.action.toLowerCase()}`}>
                        {log.action === "CREATED" ? "+ ADDED" : log.action === "UPDATED" ? "✎ UPDATED" : "✕ REMOVED"}
                      </span>
                      <span className="audit-user-time">By <b>{log.username}</b> · <time>{log.time_formatted}</time></span>
                    </div>

                    <div className="audit-item-title">{log.contact_name} {log.contact_phone && `(${log.contact_phone})`}</div>

                    {log.details && (
                      <div className="audit-item-detail">
                        {log.action === "UPDATED" && log.details.changes ? (
                          <div>
                            {Object.entries(log.details.changes).map(([k, v]) => (
                              <span key={k} style={{ display: "inline-block", marginRight: "10px" }}>
                                <b>{k}</b>: {String(v.before || "none")} → <b>{String(v.after)}</b>
                              </span>
                            ))}
                          </div>
                        ) : log.action === "DELETED" ? (
                          <div>{log.details.reason ? `Reason: ${log.details.reason}` : "Contact removed from roster"}</div>
                        ) : (
                          <div>New contact added to roster (AC #{log.ac_no})</div>
                        )}
                      </div>
                    )}
                  </article>
                )) : (
                  <div className="past-calls-empty">
                    <span>ℹ</span>
                    <span>No audit log records found for this filter.</span>
                  </div>
                )}
              </div>
            )}

            <div className="caller-form-actions" style={{ marginTop: "14px" }}>
              <button type="button" className="caller-cancel" onClick={() => setShowAuditModal(false)}>Close</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
