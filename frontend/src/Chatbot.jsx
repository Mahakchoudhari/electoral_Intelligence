import React, { useState, useEffect, useRef, useMemo } from "react";
import "./Chatbot.css";
import {
  IconBot,
  IconSparkles,
  IconSend,
  IconX,
  IconTrash,
  IconMaximize,
  IconMinimize,
  IconChevronDown,
  IconCheck,
  IconZap,
  IconLock,
} from "./Icons.jsx";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const AGENT_CHAT_URL = API_BASE ? `${API_BASE}/api/agent/chat` : "/api/agent/chat";
const AGENT_SUGGESTIONS_URL = API_BASE ? `${API_BASE}/api/agent/suggestions` : "/api/agent/suggestions";
const AGENT_STATUS_URL = API_BASE ? `${API_BASE}/api/agent/status` : "/api/agent/status";

// ============================================================================
// Lightweight Safe Markdown Renderer
// ============================================================================
function MarkdownText({ content, onNavigateAC, onNavigateDistrict }) {
  const renderedElements = useMemo(() => {
    if (!content) return null;

    const lines = content.split("\n");
    const elements = [];
    let inList = false;
    let listItems = [];
    let inTable = false;
    let tableRows = [];

    const flushList = () => {
      if (inList && listItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="chatbot-md-list">
            {listItems.map((item, idx) => (
              <li key={idx}>{renderInline(item)}</li>
            ))}
          </ul>
        );
        listItems = [];
        inList = false;
      }
    };

    const flushTable = () => {
      if (inTable && tableRows.length > 0) {
        const headerRow = tableRows[0];
        const bodyRows = tableRows.slice(2); // Skip header separator
        elements.push(
          <div key={`table-wrapper-${elements.length}`} className="chatbot-table-wrapper">
            <table className="chatbot-md-table">
              <thead>
                <tr>
                  {headerRow.map((cell, idx) => (
                    <th key={idx}>{renderInline(cell.trim())}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx}>{renderInline(cell.trim())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
        inTable = false;
      }
    };

    const renderInline = (text) => {
      if (!text) return "";
      const parts = [];
      let remaining = text;
      let key = 0;

      while (remaining.length > 0) {
        const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)$/s);
        const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)$/s);

        if (boldMatch && (!codeMatch || boldMatch[1].length < codeMatch[1].length)) {
          if (boldMatch[1]) parts.push(<span key={key++}>{boldMatch[1]}</span>);
          parts.push(<strong key={key++} className="chatbot-highlight">{boldMatch[2]}</strong>);
          remaining = boldMatch[3];
        } else if (codeMatch) {
          if (codeMatch[1]) parts.push(<span key={key++}>{codeMatch[1]}</span>);
          parts.push(<code key={key++} className="chatbot-code">{codeMatch[2]}</code>);
          remaining = codeMatch[3];
        } else {
          parts.push(<span key={key++}>{remaining}</span>);
          break;
        }
      }
      return parts;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        flushList();
        inTable = true;
        const cols = trimmed.slice(1, -1).split("|");
        tableRows.push(cols);
        continue;
      } else {
        flushTable();
      }

      if (trimmed.startsWith("### ")) {
        flushList();
        elements.push(
          <h4 key={`h4-${i}`} className="chatbot-md-h4">
            {renderInline(trimmed.substring(4))}
          </h4>
        );
        continue;
      }
      if (trimmed.startsWith("## ")) {
        flushList();
        elements.push(
          <h3 key={`h3-${i}`} className="chatbot-md-h3">
            {renderInline(trimmed.substring(3))}
          </h3>
        );
        continue;
      }

      if (trimmed.startsWith("> ")) {
        flushList();
        elements.push(
          <blockquote key={`quote-${i}`} className="chatbot-md-quote">
            {renderInline(trimmed.substring(2))}
          </blockquote>
        );
        continue;
      }

      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        inList = true;
        listItems.push(trimmed.substring(2));
        continue;
      }

      if (/^\d+\.\s/.test(trimmed)) {
        inList = true;
        listItems.push(trimmed.replace(/^\d+\.\s/, ""));
        continue;
      }

      flushList();

      if (trimmed === "") {
        elements.push(<div key={`space-${i}`} className="chatbot-md-spacer" />);
      } else {
        elements.push(
          <p key={`p-${i}`} className="chatbot-md-p">
            {renderInline(line)}
          </p>
        );
      }
    }

    flushList();
    flushTable();

    return elements;
  }, [content]);

  return <div className="chatbot-markdown-content">{renderedElements}</div>;
}

// ============================================================================
// MAIN CHATBOT COMPONENT
// ============================================================================
export default function Chatbot({
  selectedAC,
  selectedDistrictCode,
  selectedElectionYear,
  onSelectAC,
  onSelectDistrict,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I am your **Electoral Intelligence AI Analyst**.\n\n" +
        "I have direct access to our live database covering **403 Assembly Constituencies**, **68,000+ Polling Booths**, and **12,700+ Citizen Telephony Reports**.\n\n" +
        "Ask me anything about election winners, vote shares, historical comparisons (2017 vs 2022), or ground voter grievances!",
      tools: [],
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [expandedTools, setExpandedTools] = useState({});

  // AI Brain Key Settings State
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("ei_ai_api_key") || "");
  const [provider, setProvider] = useState(() => localStorage.getItem("ei_ai_provider") || "gemini");
  const [showSettings, setShowSettings] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [backendStatus, setBackendStatus] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Check Backend Status (which provider is configured in backend)
  useEffect(() => {
    fetch(AGENT_STATUS_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setBackendStatus(data);
      })
      .catch(() => {});
  }, []);

  // Fetch initial suggestions based on active context
  useEffect(() => {
    let active = true;
    const fetchSuggestions = async () => {
      try {
        const params = new URLSearchParams();
        if (selectedAC) params.set("ac_no", String(selectedAC));
        if (selectedDistrictCode) params.set("district_code", String(selectedDistrictCode));

        const res = await fetch(`${AGENT_SUGGESTIONS_URL}?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (active && data.suggestions) {
            setSuggestions(data.suggestions);
          }
        }
      } catch (e) {
        if (active) {
          setSuggestions([
            "🏆 Who won in Baghpat (AC 52) in 2022?",
            "📞 What are the top voter grievances reported?",
            "📊 Show top 5 constituencies by voter turnout",
            "📈 Compare 2017 vs 2022 results for Deoband",
          ]);
        }
      }
    };
    fetchSuggestions();
    return () => {
      active = false;
    };
  }, [selectedAC, selectedDistrictCode]);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && !showSettings) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, showSettings]);

  // Global toggle shortcut (Alt+A or Ctrl+J) and custom event
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.altKey && e.key.toLowerCase() === "a") || (e.ctrlKey && e.key.toLowerCase() === "j")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen && !isMaximized) {
        setIsOpen(false);
      }
    };
    const handleCustomToggle = () => setIsOpen((prev) => !prev);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("toggle-electoral-chatbot", handleCustomToggle);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("toggle-electoral-chatbot", handleCustomToggle);
    };
  }, [isOpen, isMaximized]);

  const handleSaveApiKey = () => {
    const trimmed = inputKey.trim();
    if (trimmed) {
      localStorage.setItem("ei_ai_api_key", trimmed);
      localStorage.setItem("ei_ai_provider", provider);
      setApiKey(trimmed);
      setShowSettings(false);
      setInputKey("");
    }
  };

  const handleClearApiKey = () => {
    localStorage.removeItem("ei_ai_api_key");
    setApiKey("");
    setInputKey("");
    setShowSettings(false);
  };

  const handleSendMessage = async (userPrompt) => {
    const text = (userPrompt || inputValue).trim();
    if (!text || isLoading) return;

    setInputValue("");
    const userMsgId = `user-${Date.now()}`;
    const userMsg = { id: userMsgId, role: "user", content: text };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setLoadingStep("AI thinking & selecting relevant database tools...");

    const stepTimer = setTimeout(() => {
      setLoadingStep("Calling database tools & analyzing outcomes...");
    }, 600);

    try {
      const historyPayload = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      const contextPayload = {
        current_ac: selectedAC ? String(selectedAC) : undefined,
        current_district: selectedDistrictCode ? String(selectedDistrictCode) : undefined,
        election_year: selectedElectionYear ? Number(selectedElectionYear) : 2022,
      };

      const res = await fetch(AGENT_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          context: contextPayload,
          api_key: apiKey || undefined,
          provider: apiKey ? provider : undefined,
        }),
      });

      clearTimeout(stepTimer);

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.reply,
        tools: data.tools_called || [],
        mode: data.mode,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (data.suggested_questions && data.suggested_questions.length > 0) {
        setSuggestions(data.suggested_questions);
      }
    } catch (err) {
      clearTimeout(stepTimer);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `⚠️ **Error connecting to AI Agent**: ${err.message || "Failed to reach backend"}. Please ensure the backend is running.`,
          tools: [],
        },
      ]);
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: "welcome-reset",
        role: "assistant",
        content: "Chat cleared. What would you like to explore about our electoral or call intelligence?",
        tools: [],
      },
    ]);
  };

  const handleCopyMessage = (msgId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleToolAccordion = (msgId) => {
    setExpandedTools((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  // Determine active brain mode
  const activeBrainLabel = useMemo(() => {
    if (apiKey) {
      return provider === "gemini" ? "Gemini 2.0" : provider === "groq" ? "Groq (Llama 3.3)" : "GPT-4o";
    }
    if (backendStatus?.gemini_configured) return "Backend: Gemini";
    if (backendStatus?.groq_configured) return "Backend: Groq";
    if (backendStatus?.openai_configured) return "Backend: OpenAI";
    return null;
  }, [apiKey, provider, backendStatus]);

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          type="button"
          className="chatbot-launcher-btn"
          onClick={() => setIsOpen(true)}
          title="Ask AI Agent about Database (Alt+A)"
        >
          <div className="chatbot-launcher-icon-wrap">
            <IconSparkles size={20} className="chatbot-sparkle-anim" />
            <span className="chatbot-online-pulse" />
          </div>
          <span className="chatbot-launcher-label">Ask AI Agent</span>
          <span className="chatbot-key-pill">Alt+A</span>
        </button>
      )}

      {/* Floating Chat Modal / Drawer */}
      {isOpen && (
        <div className={`chatbot-window ${isMaximized ? "maximized" : ""}`}>
          {/* Header */}
          <div className="chatbot-header">
            <div className="chatbot-header-left">
              <div className="chatbot-avatar-badge">
                <IconBot size={18} />
              </div>
              <div className="chatbot-header-titles">
                <div className="chatbot-title-row">
                  <h3>Electoral Intelligence AI</h3>
                  {activeBrainLabel ? (
                    <button
                      type="button"
                      className="chatbot-brain-pill active"
                      onClick={() => setShowSettings((prev) => !prev)}
                      title="Click to manage AI Model Key"
                    >
                      <span className="chatbot-status-dot brain" /> 🧠 {activeBrainLabel}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chatbot-brain-pill fallback"
                      onClick={() => setShowSettings((prev) => !prev)}
                      title="Click to connect a free Gemini / Groq API Key"
                    >
                      <span className="chatbot-status-dot fallback" /> ⚡ Connect AI Key
                    </button>
                  )}
                </div>
                <div className="chatbot-context-tag">
                  {selectedAC ? (
                    <span>
                      Focus: <strong onClick={() => onSelectAC && onSelectAC(selectedAC)}>AC #{selectedAC}</strong>
                    </span>
                  ) : (
                    <span>16 Focus Districts · 403 ACs</span>
                  )}
                </div>
              </div>
            </div>

            <div className="chatbot-header-controls">
              <button
                type="button"
                className={`chatbot-ctrl-btn ${showSettings ? "active" : ""}`}
                onClick={() => setShowSettings((prev) => !prev)}
                title="AI Brain Settings (API Key)"
              >
                <IconZap size={15} />
              </button>
              <button
                type="button"
                className="chatbot-ctrl-btn"
                onClick={handleClearChat}
                title="Clear conversation"
              >
                <IconTrash size={15} />
              </button>
              <button
                type="button"
                className="chatbot-ctrl-btn"
                onClick={() => setIsMaximized((prev) => !prev)}
                title={isMaximized ? "Restore size" : "Maximize view"}
              >
                {isMaximized ? <IconMinimize size={15} /> : <IconMaximize size={15} />}
              </button>
              <button
                type="button"
                className="chatbot-ctrl-btn close-btn"
                onClick={() => setIsOpen(false)}
                title="Close (Esc)"
              >
                <IconX size={16} />
              </button>
            </div>
          </div>

          {/* AI Brain Settings Panel (Collapsible) */}
          {showSettings && (
            <div className="chatbot-settings-panel">
              <div className="chatbot-settings-header">
                <h4>🧠 Connect AI Brain (Unlock True LLM Reasoning)</h4>
                <button
                  type="button"
                  className="chatbot-settings-close"
                  onClick={() => setShowSettings(false)}
                >
                  <IconX size={13} />
                </button>
              </div>
              <p className="chatbot-settings-desc">
                Without an API key, the chatbot uses pattern matching. Connect a <strong>free Google Gemini or Groq key</strong> to enable open-ended reasoning, deep synthesis, and conversational analysis!
              </p>

              <div className="chatbot-settings-form">
                <div className="chatbot-settings-row">
                  <label>Provider:</label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="chatbot-settings-select"
                  >
                    <option value="gemini">Google Gemini 2.0 (Free)</option>
                    <option value="groq">Groq Llama 3.3 (Free & Ultra Fast)</option>
                    <option value="openai">OpenAI (GPT-4o-mini)</option>
                  </select>
                </div>

                <div className="chatbot-settings-row">
                  <label>API Key:</label>
                  <input
                    type="password"
                    className="chatbot-settings-input"
                    placeholder={
                      provider === "gemini"
                        ? "AIzaSy..."
                        : provider === "groq"
                        ? "gsk_..."
                        : "sk-..."
                    }
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                  />
                </div>

                <div className="chatbot-settings-actions">
                  <button
                    type="button"
                    className="chatbot-settings-save-btn"
                    onClick={handleSaveApiKey}
                    disabled={!inputKey.trim()}
                  >
                    Save & Activate Brain
                  </button>
                  {apiKey && (
                    <button
                      type="button"
                      className="chatbot-settings-clear-btn"
                      onClick={handleClearApiKey}
                    >
                      Disconnect Key
                    </button>
                  )}
                </div>

                <div className="chatbot-settings-links">
                  {provider === "gemini" && (
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🔗 Get a free Google Gemini key from Google AI Studio →
                    </a>
                  )}
                  {provider === "groq" && (
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🔗 Get a free Groq key from Groq Console →
                    </a>
                  )}
                  {provider === "openai" && (
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🔗 Get an OpenAI key from OpenAI Platform →
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Quick Suggestions Bar */}
          {suggestions.length > 0 && !showSettings && (
            <div className="chatbot-suggestions-bar">
              <div className="chatbot-suggestions-scroll">
                {suggestions.slice(0, 4).map((sugg, i) => (
                  <button
                    key={i}
                    type="button"
                    className="chatbot-suggestion-pill"
                    onClick={() => handleSendMessage(sugg)}
                    disabled={isLoading}
                  >
                    <span>{sugg}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages Stream */}
          <div className="chatbot-messages-container">
            {messages.map((msg) => (
              <div key={msg.id} className={`chatbot-msg-row ${msg.role}`}>
                <div className="chatbot-msg-avatar">
                  {msg.role === "user" ? "👤" : <IconBot size={16} />}
                </div>

                <div className="chatbot-msg-bubble">
                  {/* Mode and Tools Badge */}
                  <div className="chatbot-msg-meta-row">
                    {msg.mode && (
                      <span className={`chatbot-mode-tag ${msg.mode}`}>
                        {msg.mode === "gemini_llm"
                          ? "🧠 Gemini 2.0"
                          : msg.mode === "groq_llm"
                          ? "⚡ Groq Llama-3.3"
                          : msg.mode === "openai_llm"
                          ? "🤖 GPT-4o"
                          : "⚡ Direct DB Engine"}
                      </span>
                    )}

                    {msg.tools && msg.tools.length > 0 && (
                      <button
                        type="button"
                        className="chatbot-tools-toggle"
                        onClick={() => toggleToolAccordion(msg.id)}
                      >
                        <span>
                          {msg.tools.length} DB {msg.tools.length === 1 ? "Tool" : "Tools"} Executed
                        </span>
                        <IconChevronDown
                          size={12}
                          className={`chatbot-accordion-arrow ${expandedTools[msg.id] ? "open" : ""}`}
                        />
                      </button>
                    )}
                  </div>

                  {/* Expanded Tools View */}
                  {msg.tools && msg.tools.length > 0 && expandedTools[msg.id] && (
                    <div className="chatbot-tools-list">
                      {msg.tools.map((t, tIdx) => (
                        <div key={tIdx} className="chatbot-tool-item">
                          <code>{t.tool}</code>
                          {t.args && Object.keys(t.args).length > 0 && (
                            <pre>{JSON.stringify(t.args, null, 2)}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Body */}
                  <MarkdownText
                    content={msg.content}
                    onNavigateAC={onSelectAC}
                    onNavigateDistrict={onSelectDistrict}
                  />

                  {/* Message Action Footer */}
                  {msg.role === "assistant" && (
                    <div className="chatbot-msg-footer">
                      <button
                        type="button"
                        className="chatbot-copy-btn"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        title="Copy answer"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <IconCheck size={12} /> <span>Copied</span>
                          </>
                        ) : (
                          <span>Copy</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="chatbot-msg-row assistant loading-row">
                <div className="chatbot-msg-avatar">
                  <IconBot size={16} />
                </div>
                <div className="chatbot-msg-bubble chatbot-loading-bubble">
                  <div className="chatbot-typing-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="chatbot-loading-label">{loadingStep}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form
            className="chatbot-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <div className="chatbot-input-container">
              <input
                ref={inputRef}
                type="text"
                className="chatbot-input"
                placeholder="Ask any electoral, candidate, margin, or call question in English or Hindi..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isLoading}
              />
              <button
                type="submit"
                className="chatbot-send-btn"
                disabled={!inputValue.trim() || isLoading}
                title="Send question (Enter)"
              >
                <IconSend size={15} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
