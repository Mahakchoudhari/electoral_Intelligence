import React, { useState, useEffect, useMemo } from "react";
import "./LandingDashboard.css";
import {
  IconAssembly,
  IconMap,
  IconBooths,
  IconPin,
  IconPhone,
  IconShieldCheck,
  IconAlertTriangle,
  IconVillage,
  IconHouse,
  IconTarget,
  IconCalendar,
  IconChartBar,
  IconBuilding,
  IconZap,
  IconUser,
  IconUsers,
  IconCheck,
  IconX,
  IconCircleDot,
  IconSearch,
  IconLogOut,
} from "./Icons.jsx";


const GRAPHQL_API = import.meta.env.VITE_GRAPHQL_API || "http://127.0.0.1:8000/graphql";

async function queryGraphQL(query, variables = {}) {
  const response = await fetch(GRAPHQL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join(", "));
  }
  return payload.data;
}

function formatNumber(num) {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return "0";
  return Number(num).toLocaleString("en-IN");
}

function formatPercent(num) {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return "0.0%";
  return `${Number(num).toFixed(1)}%`;
}

// ============================================================================
// Clean SVG Donut Chart
// ============================================================================
function SvgDonut({ data, size = 130, strokeWidth = 18, centerLabel = "Total", centerValue }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((acc, item) => acc + (item.value || 0), 0);

  let accumulated = 0;
  const slices = data.map((item) => {
    const val = item.value || 0;
    const ratio = total > 0 ? val / total : 0;
    const strokeDasharray = `${ratio * circumference} ${circumference}`;
    const strokeDashoffset = -accumulated * circumference;
    accumulated += ratio;
    return {
      ...item,
      strokeDasharray,
      strokeDashoffset,
      percent: ratio * 100,
    };
  });

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth={strokeWidth}
        />
        {total > 0 &&
          slices.map((slice, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={slice.strokeDasharray}
              strokeDashoffset={slice.strokeDashoffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${slice.name}: ${formatNumber(slice.value)} (${slice.percent.toFixed(1)}%)`}</title>
            </circle>
          ))}
      </svg>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: size,
          height: size,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: "9.5px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
          {centerLabel}
        </span>
        <strong style={{ fontSize: "15px", color: "#fff", fontWeight: 800 }}>
          {centerValue !== undefined ? centerValue : formatNumber(total)}
        </strong>
      </div>
    </div>
  );
}

// ============================================================================
// Horizontal Stacked Ratio Bar
// ============================================================================
function StackedRatioBar({ segments }) {
  const total = segments.reduce((sum, s) => sum + (s.value || 0), 0);
  return (
    <div className="ratio-bar-wrap">
      <div className="stacked-ratio-bar">
        {segments.map((seg, i) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={i}
              className="ratio-bar-segment"
              style={{ width: `${pct}%`, backgroundColor: seg.color }}
              title={`${seg.name}: ${formatNumber(seg.value)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="ratio-bar-legend">
        {segments.map((seg, i) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0;
          return (
            <div className="ratio-legend-item" key={i}>
              <span className="tier-dot" style={{ backgroundColor: seg.color }} />
              <span>{seg.name}:</span>
              <strong>{formatNumber(seg.value)}</strong>
              <span style={{ color: "#64748b" }}>({pct.toFixed(1)}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Main Landing Dashboard Component
// ============================================================================
export default function LandingDashboard({
  onOpenGIS,
  initialAC = "49",
  initialVillage = "",
  initialElectionYear = "2022",
  authAdmin = null,
  onLogout = null,
}) {
  const [constituencies, setConstituencies] = useState([]);
  const [callingData, setCallingData] = useState(null);

  // Hierarchical selections
  const [selectedDistrictCode, setSelectedDistrictCode] = useState("");
  const [selectedAC, setSelectedAC] = useState(initialAC);
  const [selectedVillageId, setSelectedVillageId] = useState(initialVillage);
  const [selectedVillage2Id, setSelectedVillage2Id] = useState("");
  const [boothScopeTab, setBoothScopeTab] = useState("auto"); // "auto" | "all" | "village1" | "village2"

  // Matchup comparison: target is fixed to RLD, vsParty is selected ("BJP", "SP", "BSP", etc. or "all")
  const [vsParty, setVsParty] = useState("BJP");
  const [electionYear, setElectionYear] = useState(initialElectionYear || "2022");
  const [availableElectionYears, setAvailableElectionYears] = useState([2022, 2017]);

  // Search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [thresholds] = useState(() => {
    try {
      const saved = localStorage.getItem("ei_thresholds");
      return saved
        ? JSON.parse(saved)
        : {
            tier1Max: 10,
            tier1Color: "#ef4444",
            tier2Max: 25,
            tier2Color: "#f97316",
            tier3Max: 50,
            tier3Color: "#eab308",
            tier4Color: "#22c55e",
          };
    } catch {
      return {
        tier1Max: 10,
        tier1Color: "#ef4444",
        tier2Max: 25,
        tier2Color: "#f97316",
        tier3Max: 50,
        tier3Color: "#eab308",
        tier4Color: "#22c55e",
      };
    }
  });

  const [acPollData, setAcPollData] = useState(null);
  const [acVillages, setAcVillages] = useState([]);
  const [loadingPoll, setLoadingPoll] = useState(false);

  const [boothSearch, setBoothSearch] = useState("");
  const [boothTierFilter, setBoothTierFilter] = useState("all");
  const [callFilterProblem, setCallFilterProblem] = useState("all");

  // 1. Load constituencies (strictly filtered to 16 districts) and calling stats
  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const data = await queryGraphQL(`
          query InitialData {
            constituencies
            callingStats
          }
        `);
        if (!cancelled) {
          const constList = data.constituencies || [];
          setConstituencies(constList);
          setCallingData(data.callingStats || null);

          if (constList.length) {
            const matchedInit = constList.find((c) => c.ac_no === initialAC);
            if (matchedInit) {
              setSelectedDistrictCode(matchedInit.district_code || "");
              setSelectedAC(matchedInit.ac_no);
            } else {
              const best = constList.find((c) => c.booth_count > 0) || constList[0];
              setSelectedDistrictCode(best.district_code || "");
              setSelectedAC(best.ac_no);
            }
          }
        }
      } catch (err) {
        console.error("Initial data load failed:", err);
      }
    }
    loadInitial();
    return () => {
      cancelled = true;
    };
  }, [initialAC]);

  // Load available election years for current selected AC
  useEffect(() => {
    if (!selectedAC) return;
    let cancelled = false;
    async function loadYears() {
      try {
        const data = await queryGraphQL(
          `
          query ACYears($acNo: String!) {
            electionYears(acNo: $acNo, level: "ac")
          }
        `,
          { acNo: String(selectedAC) }
        );
        if (!cancelled && data.electionYears?.length) {
          setAvailableElectionYears(data.electionYears);
          // If current electionYear is not available in list, fallback to first available
          if (!data.electionYears.map(String).includes(String(electionYear))) {
            setElectionYear(String(data.electionYears[0]));
          }
        }
      } catch (err) {
        console.warn("Could not load election years for AC:", err);
      }
    }
    loadYears();
    return () => {
      cancelled = true;
    };
  }, [selectedAC]);

  // Keyboard shortcut (Cmd/Ctrl + K) to toggle Search Modal
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsSearchOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Compute unique 16 districts from constituencies
  const availableDistricts = useMemo(() => {
    const map = new Map();
    constituencies.forEach((c) => {
      if (c.district_code && !map.has(c.district_code)) {
        map.set(c.district_code, {
          district_code: c.district_code,
          name: c.district_name || `District ${c.district_code}`,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [constituencies]);

  // Filter ACs belonging to the selected district
  const filteredACs = useMemo(() => {
    if (!selectedDistrictCode) return constituencies;
    return constituencies.filter((c) => c.district_code === selectedDistrictCode);
  }, [constituencies, selectedDistrictCode]);

  // Handle district selection change: sync AC & Village
  const handleDistrictChange = (dCode) => {
    setSelectedDistrictCode(dCode);
    const acsInDist = constituencies.filter((c) => c.district_code === dCode);
    if (acsInDist.length > 0) {
      const best = acsInDist.find((c) => c.booth_count > 0) || acsInDist[0];
      setSelectedAC(best.ac_no);
    }
    setSelectedVillageId("");
    setSelectedVillage2Id("");
  };

  // 2. Load AC poll results & villages when selectedAC or electionYear changes
  useEffect(() => {
    if (!selectedAC) return;
    let cancelled = false;
    async function loadAC() {
      try {
        setLoadingPoll(true);
        const data = await queryGraphQL(
          `
          query ACData($acNo: String!, $electionYear: Int) {
            pollResults(acNo: $acNo, level: "ac", electionYear: $electionYear)
            villages(acNo: $acNo, electionYear: $electionYear)
          }
        `,
          {
            acNo: String(selectedAC),
            electionYear: electionYear ? Number(electionYear) : null,
          }
        );
        if (!cancelled) {
          setAcPollData(data.pollResults || null);
          const vFeatures = data.villages?.features || [];
          const vMap = new Map();
          vFeatures.forEach((f) => {
            const p = f.properties || {};
            const name = p.name || p.VILL_NAME || "Village";
            const vid = p.village_id || p.objectid;
            if (!vMap.has(name)) {
              vMap.set(name, {
                village_id: vid,
                name: name,
                electors: p.electors || 0,
                votes_polled: p.votes_polled || 0,
              });
            }
          });
          setAcVillages(
            Array.from(vMap.values()).sort((a, b) => a.name.localeCompare(b.name))
          );
        }
      } catch (err) {
        console.error("Poll data load failed:", err);
      } finally {
        if (!cancelled) setLoadingPoll(false);
      }
    }
    loadAC();
    return () => {
      cancelled = true;
    };
  }, [selectedAC, electionYear]);

  const activeACInfo = useMemo(() => {
    return (
      constituencies.find((c) => c.ac_no === String(selectedAC)) || {
        ac_no: selectedAC,
        name: `AC ${selectedAC}`,
        district_name: "Uttar Pradesh",
        booth_count: acPollData?.booth_records || 0,
      }
    );
  }, [constituencies, selectedAC, acPollData]);

  const getTier = (sharePct) => {
    if (sharePct === null || sharePct === undefined || Number.isNaN(Number(sharePct))) {
      return { tier: "none", name: "No Data", color: "#64748b" };
    }
    const val = Number(sharePct);
    if (val < thresholds.tier1Max) {
      return { tier: "red", name: "Red", range: `< ${thresholds.tier1Max}%`, color: thresholds.tier1Color };
    }
    if (val < thresholds.tier2Max) {
      return {
        tier: "amber",
        name: "Amber",
        range: `${thresholds.tier1Max}-${thresholds.tier2Max}%`,
        color: thresholds.tier2Color,
      };
    }
    if (val < thresholds.tier3Max) {
      return {
        tier: "yellow",
        name: "Yellow",
        range: `${thresholds.tier2Max}-${thresholds.tier3Max}%`,
        color: thresholds.tier3Color,
      };
    }
    return { tier: "green", name: "Green", range: `> ${thresholds.tier3Max}%`, color: thresholds.tier4Color };
  };

  // Compute booth tiers based on Matchup:
  // If vsParty is selected (e.g. BJP, SP, BSP), RLD share is RLD / (RLD + vsParty)
  // If vsParty === "all", RLD share is RLD / Total Polled Votes
  const allBoothsWithTier = useMemo(() => {
    const rawBooths = acPollData?.booths || [];
    return rawBooths.map((b) => {
      const pVotes = b.party_votes || [];
      const rldObj = pVotes.find((p) => p.party === "RLD");
      const vsObj = vsParty !== "all" ? pVotes.find((p) => p.party === vsParty) : null;
      const rldVotes = rldObj?.votes || 0;
      const vsVotes = vsObj?.votes || 0;

      let targetShare = 0;
      if (vsParty && vsParty !== "all") {
        const pool2 = rldVotes + vsVotes;
        targetShare = pool2 > 0 ? (rldVotes / pool2) * 100 : (rldObj?.share_percent ?? 0);
      } else {
        // RLD vs All (against total polled/valid votes)
        targetShare = rldObj?.share_percent ?? 0;
      }

      const tierObj = getTier(targetShare);
      return {
        ...b,
        rldVotes,
        vsVotes,
        vsPartyName: vsParty,
        targetPartyShare: targetShare,
        tier: tierObj.tier,
        tierName: tierObj.name,
        tierColor: tierObj.color,
      };
    });
  }, [acPollData, vsParty, thresholds]);

  const constituencyTierCounts = useMemo(() => {
    const counts = { red: 0, amber: 0, yellow: 0, green: 0, total: 0 };
    allBoothsWithTier.forEach((b) => {
      if (counts[b.tier] !== undefined) counts[b.tier]++;
      counts.total++;
    });
    return counts;
  }, [allBoothsWithTier]);

  const computeVillageData = (vId) => {
    if (!vId) return null;
    const vMatch = acVillages.find((v) => String(v.village_id) === String(vId));
    const vName = vMatch?.name || "";

    const vBooths = allBoothsWithTier.filter(
      (b) =>
        (b.village_id && String(b.village_id) === String(vId)) ||
        (vName && b.village_name && b.village_name.toLowerCase().trim() === vName.toLowerCase().trim())
    );

    const counts = { red: 0, amber: 0, yellow: 0, green: 0, total: 0 };
    let electors = 0;
    let polled = 0;
    let valid = 0;

    vBooths.forEach((b) => {
      if (counts[b.tier] !== undefined) counts[b.tier]++;
      counts.total++;
      electors += b.electors || 0;
      polled += b.votes_polled || 0;
      valid += b.valid_votes || 0;
    });

    const turnout = electors > 0 ? (polled / electors) * 100 : 0;

    return {
      village_id: vId,
      name: vName || `Village ${vId}`,
      booths: vBooths,
      counts,
      electors,
      polled,
      valid,
      turnout,
    };
  };

  const selectedVillage1Data = useMemo(
    () => computeVillageData(selectedVillageId),
    [selectedVillageId, acVillages, allBoothsWithTier]
  );

  const selectedVillage2Data = useMemo(
    () => computeVillageData(selectedVillage2Id),
    [selectedVillage2Id, acVillages, allBoothsWithTier]
  );

  // Backwards compatibility alias for single-village lookups
  const selectedVillageData = selectedVillage1Data;

  const activeBoothsForTable = useMemo(() => {
    if (boothScopeTab === "village1" && selectedVillage1Data) {
      return selectedVillage1Data.booths;
    }
    if (boothScopeTab === "village2" && selectedVillage2Data) {
      return selectedVillage2Data.booths;
    }
    if (boothScopeTab === "all") {
      return allBoothsWithTier;
    }
    // "auto": if village 1 is selected, default to village 1 booths, else all
    if (selectedVillage1Data) {
      return selectedVillage1Data.booths;
    }
    return allBoothsWithTier;
  }, [boothScopeTab, selectedVillage1Data, selectedVillage2Data, allBoothsWithTier]);

  const filteredBoothsList = useMemo(() => {
    return activeBoothsForTable.filter((b) => {
      if (boothTierFilter !== "all" && b.tier !== boothTierFilter) return false;
      if (boothSearch.trim()) {
        const query = boothSearch.toLowerCase();
        const noMatch = String(b.booth_no || "").toLowerCase().includes(query);
        const nameMatch = String(b.booth_name || "").toLowerCase().includes(query);
        const villMatch = String(b.village_name || "").toLowerCase().includes(query);
        if (!noMatch && !nameMatch && !villMatch) return false;
      }
      return true;
    });
  }, [activeBoothsForTable, boothTierFilter, boothSearch]);

  const filteredRecentCalls = useMemo(() => {
    const list = callingData?.recent_calls || [];
    if (callFilterProblem === "problem") return list.filter((c) => c.has_problem);
    if (callFilterProblem === "clear") return list.filter((c) => !c.has_problem);
    return list;
  }, [callingData, callFilterProblem]);

  // Global search matching (Districts, ACs, and current villages)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const results = [];

    // Search in Districts
    availableDistricts.forEach((d) => {
      if (d.name.toLowerCase().includes(q)) {
        results.push({
          type: "district",
          title: d.name,
          subtitle: `District • 16 Target Districts`,
          data: d,
        });
      }
    });

    // Search in Constituencies
    constituencies.forEach((c) => {
      if (c.name.toLowerCase().includes(q) || String(c.ac_no).includes(q)) {
        results.push({
          type: "ac",
          title: `${c.ac_no} - ${c.name}`,
          subtitle: `${c.district_name || "District"} • ${formatNumber(c.booth_count)} Booths`,
          data: c,
        });
      }
    });

    // Search in Villages of current AC
    acVillages.forEach((v) => {
      if (v.name.toLowerCase().includes(q)) {
        results.push({
          type: "village",
          title: v.name,
          subtitle: `Village in ${activeACInfo.name}`,
          data: v,
        });
      }
    });

    return results.slice(0, 15);
  }, [searchQuery, availableDistricts, constituencies, acVillages, activeACInfo]);

  const handleSelectSearchResult = (res) => {
    if (res.type === "district") {
      handleDistrictChange(res.data.district_code);
    } else if (res.type === "ac") {
      setSelectedDistrictCode(res.data.district_code || "");
      setSelectedAC(res.data.ac_no);
      setSelectedVillageId("");
    } else if (res.type === "village") {
      setSelectedVillageId(res.data.village_id);
    }
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="landing-container">
      {/* Top Header */}
      <header className="landing-navbar">
        <div className="landing-nav-brand">
          <div className="landing-brand-icon">
            <IconAssembly size={18} />
          </div>
          <div className="landing-brand-text">
            <h1>
              Electoral Intelligence <span className="landing-badge">Analytics</span>
            </h1>
            <p>16 Key Districts · Demarcation & Call Analytics</p>
          </div>
        </div>

        <div className="landing-nav-actions">
          {/* Quick Search Button */}
          <button
            type="button"
            className="search-trigger-btn"
            onClick={() => setIsSearchOpen(true)}
            title="Search district, AC, or village (Ctrl+K)"
          >
            <IconSearch size={14} />
            <span>Search...</span>
            <span className="search-shortcut-pill">⌘K</span>
          </button>

          <button
            type="button"
            className="gis-link-button"
            onClick={() => onOpenGIS(selectedAC, selectedVillageId, electionYear)}
            title="Open Interactive GIS Map"
          >
            <IconMap size={15} />
            <span>GIS Map Dashboard</span>
            <span className="gis-button-arrow">→</span>
          </button>

          {authAdmin && (
            <div className="admin-status-cluster" style={{ marginLeft: "4px" }}>
              <span className="admin-badge-pill" title={`Signed in as Administrator: ${authAdmin.username}`}>
                <IconShieldCheck size={12} />
                <span>Admin: {authAdmin.username}</span>
              </span>
              {onLogout && (
                <button
                  type="button"
                  className="admin-signout-btn"
                  onClick={onLogout}
                  title="Sign out of Admin session"
                >
                  <IconLogOut size={12} />
                  <span>Sign out</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="landing-content">
        {/* Global KPIs */}
        <section className="global-kpi-ribbon">
          <div className="kpi-mini-card">
            <div className="kpi-icon-wrap" style={{ color: "#38bdf8" }}>
              <IconBooths size={18} />
            </div>
            <div className="kpi-text-wrap">
              <span className="kpi-label">Total Booths</span>
              <span className="kpi-value">{formatNumber(68522)}</span>
            </div>
          </div>

          <div className="kpi-mini-card">
            <div className="kpi-icon-wrap" style={{ color: "#a855f7" }}>
              <IconPin size={18} />
            </div>
            <div className="kpi-text-wrap">
              <span className="kpi-label">Constituencies</span>
              <span className="kpi-value">{constituencies.length} in 16 Districts</span>
            </div>
          </div>

          <div className="kpi-mini-card">
            <div className="kpi-icon-wrap" style={{ color: "#10b981" }}>
              <IconPhone size={18} />
            </div>
            <div className="kpi-text-wrap">
              <span className="kpi-label">Calls Logged</span>
              <span className="kpi-value">{callingData?.overall?.total_calls ?? 54}</span>
            </div>
          </div>

          <div className="kpi-mini-card">
            <div className="kpi-icon-wrap" style={{ color: "#f59e0b" }}>
              <IconShieldCheck size={18} />
            </div>
            <div className="kpi-text-wrap">
              <span className="kpi-label">Clear Calls</span>
              <span className="kpi-value">
                {callingData?.overall
                  ? formatPercent(100 - (callingData.overall.issue_rate_percent || 0))
                  : "96.3%"}
              </span>
            </div>
          </div>

          <div className="kpi-mini-card">
            <div className="kpi-icon-wrap" style={{ color: "#ef4444" }}>
              <IconAlertTriangle size={18} />
            </div>
            <div className="kpi-text-wrap">
              <span className="kpi-label">Issues Reported</span>
              <span className="kpi-value">{callingData?.overall?.issues_reported ?? 2}</span>
            </div>
          </div>
        </section>

        {/* Hierarchical Filter Controls Bar: District -> AC -> Village -> Matchup */}
        <section className="controls-card">
          <div className="filter-group">
            {/* 1. District Dropdown (16 Selected Districts) */}
            <div className="filter-item">
              <label className="filter-label">
                <IconPin size={13} /> District
              </label>
              <select
                className="custom-select"
                value={selectedDistrictCode}
                onChange={(e) => handleDistrictChange(e.target.value)}
              >
                {availableDistricts.map((d) => (
                  <option key={d.district_code} value={d.district_code}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. AC Dropdown (Filtered to Selected District) */}
            <div className="filter-item">
              <label className="filter-label">
                <IconAssembly size={13} /> AC
              </label>
              <select
                className="custom-select"
                value={selectedAC}
                onChange={(e) => {
                  setSelectedAC(e.target.value);
                  setSelectedVillageId("");
                }}
              >
                {filteredACs.map((c) => (
                  <option key={c.ac_no} value={c.ac_no}>
                    {c.ac_no} - {c.name} {c.booth_count > 0 ? `(${formatNumber(c.booth_count)})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Village 1 Dropdown */}
            <div className="filter-item">
              <label className="filter-label">
                <IconVillage size={13} /> Village 1
              </label>
              <select
                className="custom-select"
                value={selectedVillageId}
                onChange={(e) => setSelectedVillageId(e.target.value)}
                disabled={loadingPoll}
              >
                <option value="">All Villages ({acVillages.length})</option>
                {acVillages.map((v) => (
                  <option key={v.village_id} value={v.village_id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 3b. Village 2 Dropdown (Compare) */}
            <div className="filter-item">
              <label className="filter-label">
                <IconVillage size={13} /> Village 2 (Compare)
              </label>
              <select
                className="custom-select"
                value={selectedVillage2Id}
                onChange={(e) => setSelectedVillage2Id(e.target.value)}
                disabled={loadingPoll}
              >
                <option value="">— Compare Village 2 —</option>
                {acVillages.map((v) => (
                  <option key={v.village_id} value={v.village_id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Matchup Mode: RLD vs choice dropdown */}
            <div className="filter-item">
              <label className="filter-label">
                <IconTarget size={13} /> Comparison
              </label>
              <div className="landing-matchup-select-wrap">
                <span className="landing-target-fixed">RLD</span>
                <span className="landing-vs-text">vs</span>
                <select
                  className="custom-select landing-vs-select"
                  value={vsParty}
                  onChange={(e) => setVsParty(e.target.value)}
                  title="Select Comparison Party for Demarcation"
                >
                  <option value="BJP">BJP</option>
                  <option value="SP">SP</option>
                  <option value="BSP">BSP</option>
                  <option value="INC">INC</option>
                  <option value="AAP">AAP</option>
                  <option value="AIMIM">AIMIM</option>
                  <option value="ASP">ASP</option>
                  <option value="all">All Parties</option>
                </select>
              </div>
            </div>

            {/* 5. Year Selector */}
            <div className="filter-item">
              <label className="filter-label">
                <IconCalendar size={13} /> Year
              </label>
              <select
                className="custom-select"
                style={{ minWidth: "85px" }}
                value={electionYear}
                onChange={(e) => setElectionYear(e.target.value)}
              >
                {(availableElectionYears || [2022, 2017]).map((yr) => (
                  <option key={yr} value={String(yr)}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Tiers Summary Badges */}
          <div className="threshold-indicator-bar">
            <span className="tier-pill red">
              <span className="tier-dot" style={{ backgroundColor: thresholds.tier1Color }} />
              Red &lt;{thresholds.tier1Max}%
            </span>
            <span className="tier-pill amber">
              <span className="tier-dot" style={{ backgroundColor: thresholds.tier2Color }} />
              Amber {thresholds.tier1Max}-{thresholds.tier2Max}%
            </span>
            <span className="tier-pill yellow">
              <span className="tier-dot" style={{ backgroundColor: thresholds.tier3Color }} />
              Yellow {thresholds.tier2Max}-{thresholds.tier3Max}%
            </span>
            <span className="tier-pill green">
              <span className="tier-dot" style={{ backgroundColor: thresholds.tier4Color }} />
              Green &gt;{thresholds.tier3Max}%
            </span>
          </div>
        </section>

        {/* Search Modal Overlay */}
        {isSearchOpen && (
          <div
            className="search-modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsSearchOpen(false);
            }}
          >
            <div className="search-modal-box">
              <div className="search-modal-input-wrap">
                <IconSearch size={18} />
                <input
                  type="text"
                  autoFocus
                  className="search-modal-input"
                  placeholder="Type a district, AC number, AC name, or village..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button
                  type="button"
                  className="search-modal-close-btn"
                  onClick={() => setIsSearchOpen(false)}
                >
                  <IconX size={18} />
                </button>
              </div>

              <div className="search-modal-results">
                {searchResults.length === 0 ? (
                  <div style={{ padding: "24px 16px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                    {searchQuery.trim() ? "No matching locations found in the 16 target districts." : "Search across all 16 districts, constituencies, and villages."}
                  </div>
                ) : (
                  searchResults.map((res, i) => (
                    <button
                      key={i}
                      type="button"
                      className="search-result-item"
                      onClick={() => handleSelectSearchResult(res)}
                    >
                      <div className="search-result-main">
                        {res.type === "district" && <IconPin size={16} />}
                        {res.type === "ac" && <IconAssembly size={16} />}
                        {res.type === "village" && <IconVillage size={16} />}
                        <div>
                          <div className="search-result-title">{res.title}</div>
                          <div className="search-result-sub">{res.subtitle}</div>
                        </div>
                      </div>
                      <span className="search-result-badge">{res.type.toUpperCase()}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Section 1: Booth Demarcation Breakdown */}
        <section>
          <div className="section-head">
            <div className="section-title-wrap">
              <h2>
                <IconChartBar size={16} /> Booth Demarcation · {activeACInfo.name} ({vsParty === "all" ? "RLD vs All" : `RLD vs ${vsParty}`})
              </h2>
            </div>
          </div>


          <div className="demarcation-grid">
            {/* Whole Constituency Card */}
            <div className="demarcation-card">
              <div className="demarcation-card-header">
                <div>
                  <span className="demarcation-scope-tag">CONSTITUENCY</span>
                  <h3>{activeACInfo.name} (#{activeACInfo.ac_no})</h3>
                  <div className="demarcation-card-sub">
                    {activeACInfo.district_name} • {formatNumber(constituencyTierCounts.total)} Booths
                  </div>
                </div>
              </div>

              <div className="tier-boxes-grid">
                <div className="tier-stat-box red">
                  <span className="tier-box-label">Red</span>
                  <span className="tier-box-count">{formatNumber(constituencyTierCounts.red)}</span>
                  <span className="tier-box-percent">
                    {constituencyTierCounts.total > 0
                      ? formatPercent((constituencyTierCounts.red / constituencyTierCounts.total) * 100)
                      : "0.0%"}
                  </span>
                </div>

                <div className="tier-stat-box amber">
                  <span className="tier-box-label">Amber</span>
                  <span className="tier-box-count">{formatNumber(constituencyTierCounts.amber)}</span>
                  <span className="tier-box-percent">
                    {constituencyTierCounts.total > 0
                      ? formatPercent((constituencyTierCounts.amber / constituencyTierCounts.total) * 100)
                      : "0.0%"}
                  </span>
                </div>

                <div className="tier-stat-box yellow">
                  <span className="tier-box-label">Yellow</span>
                  <span className="tier-box-count">{formatNumber(constituencyTierCounts.yellow)}</span>
                  <span className="tier-box-percent">
                    {constituencyTierCounts.total > 0
                      ? formatPercent((constituencyTierCounts.yellow / constituencyTierCounts.total) * 100)
                      : "0.0%"}
                  </span>
                </div>

                <div className="tier-stat-box green">
                  <span className="tier-box-label">Green</span>
                  <span className="tier-box-count">{formatNumber(constituencyTierCounts.green)}</span>
                  <span className="tier-box-percent">
                    {constituencyTierCounts.total > 0
                      ? formatPercent((constituencyTierCounts.green / constituencyTierCounts.total) * 100)
                      : "0.0%"}
                  </span>
                </div>
              </div>

              <div className="chart-and-ratio-wrap">
                <SvgDonut
                  data={[
                    { name: "Red", value: constituencyTierCounts.red, color: thresholds.tier1Color },
                    { name: "Amber", value: constituencyTierCounts.amber, color: thresholds.tier2Color },
                    { name: "Yellow", value: constituencyTierCounts.yellow, color: thresholds.tier3Color },
                    { name: "Green", value: constituencyTierCounts.green, color: thresholds.tier4Color },
                  ]}
                  size={130}
                  centerLabel="Booths"
                  centerValue={constituencyTierCounts.total}
                />
                <StackedRatioBar
                  segments={[
                    { name: "Red", value: constituencyTierCounts.red, color: thresholds.tier1Color },
                    { name: "Amber", value: constituencyTierCounts.amber, color: thresholds.tier2Color },
                    { name: "Yellow", value: constituencyTierCounts.yellow, color: thresholds.tier3Color },
                    { name: "Green", value: constituencyTierCounts.green, color: thresholds.tier4Color },
                  ]}
                />
              </div>
            </div>

            {/* Village 1 Demarcation Card */}
            <div className="demarcation-card">
              <div className="demarcation-card-header">
                <div>
                  <span className="demarcation-scope-tag" style={{ color: "#38bdf8", borderColor: "rgba(56, 189, 248, 0.3)" }}>
                    VILLAGE 1
                  </span>
                  <h3 style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {selectedVillage1Data ? selectedVillage1Data.name : "Village 1"}
                  </h3>
                  <div className="demarcation-card-sub">
                    {selectedVillage1Data
                      ? `${formatNumber(selectedVillage1Data.counts.total)} Booths • ${formatPercent(selectedVillage1Data.turnout)} Turnout`
                      : "Select Village 1 to inspect booths & open in GIS"}
                  </div>
                </div>

                <div className="demarcation-header-actions">
                  {selectedVillage1Data && (
                    <>
                      <button
                        type="button"
                        className="village-gis-btn"
                        onClick={() => onOpenGIS(selectedAC, selectedVillage1Data.village_id || selectedVillage1Data.name, electionYear)}
                        title="Open Village 1 in GIS Dashboard"
                      >
                        <IconMap size={11} />
                        <span>Open in GIS</span>
                        <span>↗</span>
                      </button>
                      <button
                        type="button"
                        className="village-clear-btn"
                        onClick={() => setSelectedVillageId("")}
                        title="Clear Village 1"
                      >
                        <span>Clear</span>
                        <IconX size={10} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {selectedVillage1Data ? (
                <>
                  <div className="tier-boxes-grid">
                    <div className="tier-stat-box red">
                      <span className="tier-box-label">Red</span>
                      <span className="tier-box-count">{formatNumber(selectedVillage1Data.counts.red)}</span>
                      <span className="tier-box-percent">
                        {selectedVillage1Data.counts.total > 0
                          ? formatPercent((selectedVillage1Data.counts.red / selectedVillage1Data.counts.total) * 100)
                          : "0.0%"}
                      </span>
                    </div>

                    <div className="tier-stat-box amber">
                      <span className="tier-box-label">Amber</span>
                      <span className="tier-box-count">{formatNumber(selectedVillage1Data.counts.amber)}</span>
                      <span className="tier-box-percent">
                        {selectedVillage1Data.counts.total > 0
                          ? formatPercent((selectedVillage1Data.counts.amber / selectedVillage1Data.counts.total) * 100)
                          : "0.0%"}
                      </span>
                    </div>

                    <div className="tier-stat-box yellow">
                      <span className="tier-box-label">Yellow</span>
                      <span className="tier-box-count">{formatNumber(selectedVillage1Data.counts.yellow)}</span>
                      <span className="tier-box-percent">
                        {selectedVillage1Data.counts.total > 0
                          ? formatPercent((selectedVillage1Data.counts.yellow / selectedVillage1Data.counts.total) * 100)
                          : "0.0%"}
                      </span>
                    </div>

                    <div className="tier-stat-box green">
                      <span className="tier-box-label">Green</span>
                      <span className="tier-box-count">{formatNumber(selectedVillage1Data.counts.green)}</span>
                      <span className="tier-box-percent">
                        {selectedVillage1Data.counts.total > 0
                          ? formatPercent((selectedVillage1Data.counts.green / selectedVillage1Data.counts.total) * 100)
                          : "0.0%"}
                      </span>
                    </div>
                  </div>

                  <div className="chart-and-ratio-wrap">
                    <SvgDonut
                      data={[
                        { name: "Red", value: selectedVillage1Data.counts.red, color: thresholds.tier1Color },
                        { name: "Amber", value: selectedVillage1Data.counts.amber, color: thresholds.tier2Color },
                        { name: "Yellow", value: selectedVillage1Data.counts.yellow, color: thresholds.tier3Color },
                        { name: "Green", value: selectedVillage1Data.counts.green, color: thresholds.tier4Color },
                      ]}
                      size={130}
                      centerLabel="Booths"
                      centerValue={selectedVillage1Data.counts.total}
                    />
                    <StackedRatioBar
                      segments={[
                        { name: "Red", value: selectedVillage1Data.counts.red, color: thresholds.tier1Color },
                        { name: "Amber", value: selectedVillage1Data.counts.amber, color: thresholds.tier2Color },
                        { name: "Yellow", value: selectedVillage1Data.counts.yellow, color: thresholds.tier3Color },
                        { name: "Green", value: selectedVillage1Data.counts.green, color: thresholds.tier4Color },
                      ]}
                    />
                  </div>
                </>
              ) : (
                <div className="no-village-placeholder">
                  <div className="no-village-icon">
                    <IconHouse size={28} />
                  </div>
                  <h4>No Village 1 Selected</h4>
                  <p>Pick a village to inspect or launch in GIS map:</p>
                  <div className="village-chips-cloud">
                    {acVillages.slice(0, 8).map((v) => (
                      <button
                        key={v.village_id}
                        type="button"
                        className="village-chip"
                        onClick={() => setSelectedVillageId(v.village_id)}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Village 2 Demarcation Card (Comparison) */}
            <div className="demarcation-card">
              <div className="demarcation-card-header">
                <div>
                  <span className="demarcation-scope-tag" style={{ color: "#a855f7", borderColor: "rgba(168, 85, 247, 0.3)" }}>
                    VILLAGE 2 (COMPARE)
                  </span>
                  <h3>{selectedVillage2Data ? selectedVillage2Data.name : "Village 2"}</h3>
                  <div className="demarcation-card-sub">
                    {selectedVillage2Data
                      ? `${formatNumber(selectedVillage2Data.counts.total)} Booths • ${formatPercent(selectedVillage2Data.turnout)} Turnout`
                      : "Select a 2nd village to compare side-by-side"}
                  </div>
                </div>

                <div className="demarcation-header-actions">
                  {selectedVillage2Data && (
                    <>
                      <button
                        type="button"
                        className="village-gis-btn"
                        onClick={() => onOpenGIS(selectedAC, selectedVillage2Data.village_id || selectedVillage2Data.name, electionYear)}
                        title="Open Village 2 in GIS Dashboard"
                      >
                        <IconMap size={11} />
                        <span>Open in GIS</span>
                        <span>↗</span>
                      </button>
                      <button
                        type="button"
                        className="village-clear-btn"
                        onClick={() => setSelectedVillage2Id("")}
                        title="Clear Village 2"
                      >
                        <span>Clear</span>
                        <IconX size={10} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {selectedVillage2Data ? (
                <>
                  <div className="tier-boxes-grid">
                    <div className="tier-stat-box red">
                      <span className="tier-box-label">Red</span>
                      <span className="tier-box-count">{formatNumber(selectedVillage2Data.counts.red)}</span>
                      <span className="tier-box-percent">
                        {selectedVillage2Data.counts.total > 0
                          ? formatPercent((selectedVillage2Data.counts.red / selectedVillage2Data.counts.total) * 100)
                          : "0.0%"}
                      </span>
                    </div>

                    <div className="tier-stat-box amber">
                      <span className="tier-box-label">Amber</span>
                      <span className="tier-box-count">{formatNumber(selectedVillage2Data.counts.amber)}</span>
                      <span className="tier-box-percent">
                        {selectedVillage2Data.counts.total > 0
                          ? formatPercent((selectedVillage2Data.counts.amber / selectedVillage2Data.counts.total) * 100)
                          : "0.0%"}
                      </span>
                    </div>

                    <div className="tier-stat-box yellow">
                      <span className="tier-box-label">Yellow</span>
                      <span className="tier-box-count">{formatNumber(selectedVillage2Data.counts.yellow)}</span>
                      <span className="tier-box-percent">
                        {selectedVillage2Data.counts.total > 0
                          ? formatPercent((selectedVillage2Data.counts.yellow / selectedVillage2Data.counts.total) * 100)
                          : "0.0%"}
                      </span>
                    </div>

                    <div className="tier-stat-box green">
                      <span className="tier-box-label">Green</span>
                      <span className="tier-box-count">{formatNumber(selectedVillage2Data.counts.green)}</span>
                      <span className="tier-box-percent">
                        {selectedVillage2Data.counts.total > 0
                          ? formatPercent((selectedVillage2Data.counts.green / selectedVillage2Data.counts.total) * 100)
                          : "0.0%"}
                      </span>
                    </div>
                  </div>

                  <div className="chart-and-ratio-wrap">
                    <SvgDonut
                      data={[
                        { name: "Red", value: selectedVillage2Data.counts.red, color: thresholds.tier1Color },
                        { name: "Amber", value: selectedVillage2Data.counts.amber, color: thresholds.tier2Color },
                        { name: "Yellow", value: selectedVillage2Data.counts.yellow, color: thresholds.tier3Color },
                        { name: "Green", value: selectedVillage2Data.counts.green, color: thresholds.tier4Color },
                      ]}
                      size={130}
                      centerLabel="Booths"
                      centerValue={selectedVillage2Data.counts.total}
                    />
                    <StackedRatioBar
                      segments={[
                        { name: "Red", value: selectedVillage2Data.counts.red, color: thresholds.tier1Color },
                        { name: "Amber", value: selectedVillage2Data.counts.amber, color: thresholds.tier2Color },
                        { name: "Yellow", value: selectedVillage2Data.counts.yellow, color: thresholds.tier3Color },
                        { name: "Green", value: selectedVillage2Data.counts.green, color: thresholds.tier4Color },
                      ]}
                    />
                  </div>
                </>
              ) : (
                <div className="no-village-placeholder">
                  <div className="no-village-icon">
                    <IconHouse size={28} />
                  </div>
                  <h4>No Village 2 Selected</h4>
                  <p>Pick a second village to compare side-by-side:</p>
                  <div className="village-chips-cloud">
                    {acVillages
                      .filter((v) => String(v.village_id) !== String(selectedVillageId))
                      .slice(0, 8)
                      .map((v) => (
                        <button
                          key={v.village_id}
                          type="button"
                          className="village-chip"
                          onClick={() => setSelectedVillage2Id(v.village_id)}
                        >
                          {v.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Voting Patterns & Turnout */}
        <section className="electoral-stats-grid">
          <div className="electoral-chart-card">
            <div className="demarcation-card-header">
              <div>
                <h3>Party Votes ({electionYear})</h3>
              </div>
            </div>

            <div className="party-bars-list">
              {(acPollData?.party_votes || []).slice(0, 6).map((party) => {
                const colors = {
                  BJP: "#f97316",
                  SP: "#ef4444",
                  RLD: "#16a34a",
                  BSP: "#2563eb",
                  INC: "#0284c7",
                  AAP: "#0891b2",
                  AIMIM: "#0d9488",
                  ASP: "#9333ea",
                };
                const color = colors[party.party] || "#64748b";
                const share = party.share_percent || 0;
                return (
                  <div key={party.party} className="party-bar-item">
                    <div className="party-bar-meta">
                      <span className="party-bar-name">
                        <span className="party-badge-sq" style={{ backgroundColor: color }} />
                        {party.party}
                      </span>
                      <span className="party-bar-stats">
                        {formatNumber(party.votes)} votes • <strong>{formatPercent(share)}</strong>
                      </span>
                    </div>
                    <div className="party-bar-track">
                      <div
                        className="party-bar-fill"
                        style={{
                          width: `${Math.min(100, Math.max(2, share))}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="turnout-summary-card">
            <div className="demarcation-card-header">
              <div>
                <h3>Poll Totals</h3>
              </div>
            </div>

            <div className="turnout-metrics-list">
              <div className="turnout-metric-row">
                <span>Electors</span>
                <strong>{formatNumber(acPollData?.electors)}</strong>
              </div>
              <div className="turnout-metric-row">
                <span>Votes Polled</span>
                <strong>{formatNumber(acPollData?.votes_polled)}</strong>
              </div>
              <div className="turnout-metric-row">
                <span>Valid Votes</span>
                <strong>{formatNumber(acPollData?.valid_votes)}</strong>
              </div>
              <div className="turnout-metric-row">
                <span>Turnout</span>
                <strong style={{ color: "#38bdf8" }}>
                  {acPollData?.electors && acPollData?.votes_polled
                    ? formatPercent((acPollData.votes_polled / acPollData.electors) * 100)
                    : "—"}
                </strong>
              </div>
              <div className="turnout-metric-row">
                <span>Results Tracked</span>
                <strong>
                  {formatNumber(acPollData?.booths_with_results)} / {formatNumber(acPollData?.booth_records)}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Polling Booths Directory (Moved above Telephony & Outreach) */}
        <section className="booth-directory-card">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <div className="section-title-wrap">
              <h2>
                <IconBuilding size={16} /> Booth Directory
                {selectedVillage1Data ? (
                  <span className="booth-title-sub">
                    {" · "}
                    <button
                      type="button"
                      className="booth-header-village-link"
                      onClick={() => onOpenGIS(selectedAC, selectedVillage1Data.village_id || selectedVillage1Data.name, electionYear)}
                      title="Open Village 1 in GIS Dashboard"
                    >
                      <IconPin size={12} /> {selectedVillage1Data.name} <span className="gis-nav-arrow">↗</span>
                    </button>
                  </span>
                ) : (
                  <span className="booth-title-sub"> · {activeACInfo.name}</span>
                )}
              </h2>
            </div>

            {(selectedVillage1Data || selectedVillage2Data) && (
              <div className="booth-scope-tabs">
                <button
                  type="button"
                  className={`booth-scope-tab ${boothScopeTab === "all" ? "active" : ""}`}
                  onClick={() => setBoothScopeTab("all")}
                >
                  All AC Booths ({allBoothsWithTier.length})
                </button>
                {selectedVillage1Data && (
                  <button
                    type="button"
                    className={`booth-scope-tab ${boothScopeTab === "village1" || (boothScopeTab === "auto" && selectedVillage1Data) ? "active" : ""}`}
                    onClick={() => setBoothScopeTab("village1")}
                  >
                    V1: {selectedVillage1Data.name} ({selectedVillage1Data.booths.length})
                  </button>
                )}
                {selectedVillage2Data && (
                  <button
                    type="button"
                    className={`booth-scope-tab ${boothScopeTab === "village2" ? "active" : ""}`}
                    onClick={() => setBoothScopeTab("village2")}
                  >
                    V2: {selectedVillage2Data.name} ({selectedVillage2Data.booths.length})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="booth-filter-bar">
            <input
              type="text"
              className="booth-search-field"
              placeholder="Search booth #, name, or village..."
              value={boothSearch}
              onChange={(e) => setBoothSearch(e.target.value)}
            />

            <div className="tier-tab-group">
              <button
                type="button"
                className={`tier-tab-btn ${boothTierFilter === "all" ? "active" : ""}`}
                onClick={() => setBoothTierFilter("all")}
              >
                All ({activeBoothsForTable.length})
              </button>
              <button
                type="button"
                className={`tier-tab-btn ${boothTierFilter === "red" ? "active" : ""}`}
                onClick={() => setBoothTierFilter("red")}
                style={{ color: boothTierFilter === "red" ? "#fff" : thresholds.tier1Color }}
              >
                <IconCircleDot size={7} color={thresholds.tier1Color} /> Red ({constituencyTierCounts.red})
              </button>
              <button
                type="button"
                className={`tier-tab-btn ${boothTierFilter === "amber" ? "active" : ""}`}
                onClick={() => setBoothTierFilter("amber")}
                style={{ color: boothTierFilter === "amber" ? "#fff" : thresholds.tier2Color }}
              >
                <IconCircleDot size={7} color={thresholds.tier2Color} /> Amber ({constituencyTierCounts.amber})
              </button>
              <button
                type="button"
                className={`tier-tab-btn ${boothTierFilter === "yellow" ? "active" : ""}`}
                onClick={() => setBoothTierFilter("yellow")}
                style={{ color: boothTierFilter === "yellow" ? "#fff" : thresholds.tier3Color }}
              >
                <IconCircleDot size={7} color={thresholds.tier3Color} /> Yellow ({constituencyTierCounts.yellow})
              </button>
              <button
                type="button"
                className={`tier-tab-btn ${boothTierFilter === "green" ? "active" : ""}`}
                onClick={() => setBoothTierFilter("green")}
                style={{ color: boothTierFilter === "green" ? "#fff" : thresholds.tier4Color }}
              >
                <IconCircleDot size={7} color={thresholds.tier4Color} /> Green ({constituencyTierCounts.green})
              </button>
            </div>
          </div>

          <div className="booth-table-container">
            <table className="booth-table">
              <thead>
                <tr>
                  <th>Booth #</th>
                  <th>Station Name</th>
                  <th>Village</th>
                  <th>Electors</th>
                  <th>Polled</th>
                  <th>Turnout</th>
                  <th>{vsParty === "all" ? "RLD Overall Share" : `RLD vs ${vsParty} Share`}</th>
                  <th>Demarcation</th>
                  <th>Leader</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoothsList.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: "center", padding: "20px", color: "#64748b" }}>
                      No booths match filters.
                    </td>
                  </tr>
                ) : (
                  filteredBoothsList.slice(0, 150).map((booth) => {
                    const lead = booth.leading_party;
                    return (
                      <tr key={booth.booth_id}>
                        <td>
                          <span className="booth-number-pill">#{booth.booth_no}</span>
                        </td>
                        <td style={{ fontWeight: 600, color: "#fff" }}>{booth.booth_name}</td>
                        <td>
                          {booth.village_name ? (
                            <button
                              type="button"
                              className="table-village-link"
                              title={`Open ${booth.village_name} in GIS Dashboard`}
                              onClick={() => onOpenGIS(selectedAC, booth.village_id || booth.village_name, electionYear)}
                            >
                              <IconPin size={11} />
                              <span>{booth.village_name}</span>
                              <span className="table-gis-arrow">↗</span>
                            </button>
                          ) : (
                            <span style={{ color: "#64748b" }}>—</span>
                          )}
                        </td>
                        <td>{formatNumber(booth.electors)}</td>
                        <td>{formatNumber(booth.votes_polled)}</td>
                        <td>{formatPercent(booth.turnout_percent)}</td>
                        <td>
                          <strong style={{ color: booth.tierColor }}>{formatPercent(booth.targetPartyShare)}</strong>
                        </td>
                        <td>
                          <span
                            className="tier-pill"
                            style={{
                              backgroundColor: `${booth.tierColor}18`,
                              color: booth.tierColor,
                              border: `1px solid ${booth.tierColor}40`,
                            }}
                          >
                            <span className="tier-dot" style={{ backgroundColor: booth.tierColor }} />
                            {booth.tierName}
                          </span>
                        </td>
                        <td>
                          {lead ? (
                            <span style={{ fontSize: "11px" }}>
                              {lead.party} ({formatPercent(lead.share_percent)})
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4: Telephony & Outreach */}
        <section className="calling-section-card">
          <div className="section-head">
            <div className="section-title-wrap">
              <h2>
                <IconPhone size={16} /> Telephony & Outreach
              </h2>
            </div>
          </div>

          <div className="calling-kpi-grid">
            <div className="calling-kpi-box">
              <span className="calling-kpi-label">
                <IconPhone size={12} /> Total Calls
              </span>
              <span className="calling-kpi-num">{callingData?.overall?.total_calls ?? 0}</span>
            </div>

            <div className="calling-kpi-box">
              <span className="calling-kpi-label">
                <IconShieldCheck size={12} /> Verified
              </span>
              <span className="calling-kpi-num" style={{ color: "#4ade80" }}>
                {callingData?.overall?.clear_calls ?? 0}
              </span>
            </div>

            <div className="calling-kpi-box">
              <span className="calling-kpi-label">
                <IconAlertTriangle size={12} /> Issues
              </span>
              <span className="calling-kpi-num" style={{ color: "#f87171" }}>
                {callingData?.overall?.issues_reported ?? 0}
              </span>
            </div>

            <div className="calling-kpi-box">
              <span className="calling-kpi-label">
                <IconVillage size={12} /> Villages
              </span>
              <span className="calling-kpi-num">{callingData?.overall?.villages_covered ?? 0}</span>
            </div>

            <div className="calling-kpi-box">
              <span className="calling-kpi-label">
                <IconUsers size={12} /> Contacts
              </span>
              <span className="calling-kpi-num">{callingData?.overall?.unique_contacts_called ?? 0}</span>
            </div>
          </div>

          <div className="calling-charts-grid">
            <div className="calling-subcard">
              <h4>
                <IconChartBar size={14} /> Categories
              </h4>
              <div className="party-bars-list" style={{ marginTop: 0 }}>
                {(callingData?.categories || []).map((cat) => (
                  <div key={cat.category} className="party-bar-item">
                    <div className="party-bar-meta">
                      <span style={{ color: "#cbd5e1" }}>{cat.category}</span>
                      <span style={{ color: "#94a3b8" }}>
                        {cat.count} • <strong>{cat.percentage}%</strong>
                      </span>
                    </div>
                    <div className="party-bar-track">
                      <div
                        className="party-bar-fill"
                        style={{
                          width: `${cat.percentage}%`,
                          backgroundColor:
                            cat.category.toLowerCase().includes("problem") ||
                            cat.category.toLowerCase().includes("other")
                              ? "#f97316"
                              : "#3b82f6",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="calling-subcard">
              <h4>
                <IconAssembly size={14} /> Constituency Breakdown
              </h4>
              <div className="party-bars-list" style={{ marginTop: 0 }}>
                {(callingData?.ac_breakdown || []).slice(0, 5).map((item) => (
                  <div key={item.ac_no} className="party-bar-item">
                    <div className="party-bar-meta">
                      <span style={{ color: "#cbd5e1" }}>{item.ac_name}</span>
                      <span style={{ color: "#94a3b8" }}>{item.total} calls</span>
                    </div>
                    <div className="party-bar-track">
                      <div
                        className="party-bar-fill"
                        style={{
                          width: `${Math.min(100, (item.total / (callingData?.overall?.total_calls || 1)) * 100)}%`,
                          backgroundColor: "#10b981",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Live Call Feed */}
          <div className="calling-subcard">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
              <h4>
                <IconZap size={14} /> Live Activity
              </h4>
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  type="button"
                  className={`tier-tab-btn ${callFilterProblem === "all" ? "active" : ""}`}
                  onClick={() => setCallFilterProblem("all")}
                >
                  All ({callingData?.recent_calls?.length || 0})
                </button>
                <button
                  type="button"
                  className={`tier-tab-btn ${callFilterProblem === "problem" ? "active" : ""}`}
                  onClick={() => setCallFilterProblem("problem")}
                >
                  Issues
                </button>
                <button
                  type="button"
                  className={`tier-tab-btn ${callFilterProblem === "clear" ? "active" : ""}`}
                  onClick={() => setCallFilterProblem("clear")}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="recent-calls-feed">
              {filteredRecentCalls.length === 0 ? (
                <div style={{ padding: "16px", textAlign: "center", color: "#64748b" }}>
                  No call records found.
                </div>
              ) : (
                filteredRecentCalls.map((c) => (
                  <div key={c.report_id} className="call-item-card">
                    <div className="call-item-header">
                      <div className="call-contact-info">
                        <IconUser size={12} />
                        <span>{c.contact_name || "Contact"}</span>
                        {c.contact_phone && <span className="call-phone-pill">{c.contact_phone}</span>}
                      </div>
                      <span className={`call-status-pill ${c.has_problem ? "issue" : "clear"}`}>
                        {c.has_problem ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <IconAlertTriangle size={11} /> Issue
                          </span>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <IconCheck size={11} /> Verified
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="call-item-body">
                      {c.summary || "Profile verified"}
                      {c.feedback && (
                        <div style={{ marginTop: "2px", fontSize: "11px", color: "#94a3b8" }}>
                          <em>{c.feedback}</em>
                        </div>
                      )}
                    </div>

                    <div className="call-item-meta">
                      <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <IconPin size={10} />
                        {[c.village_name, c.ac_name].filter(Boolean).join(" • ")}
                      </span>
                      <span>{c.category || "Profile & Info"}</span>
                      <span>
                        {c.occurred_at ? new Date(c.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>


        {/* Footer GIS CTA Banner */}
        <section className="gis-cta-banner">
          <div className="gis-cta-text">
            <h3>Geospatial Heatmaps & Boundaries</h3>
            <p>Switch to the interactive GIS map to inspect spatial layers and boundaries.</p>
          </div>
          <button
            type="button"
            className="gis-cta-button"
            onClick={() => onOpenGIS(selectedAC, selectedVillageId, electionYear)}
          >
            <IconMap size={16} />
            <span>Open GIS Map</span>
            <span>→</span>
          </button>
        </section>
      </main>
    </div>
  );
}
