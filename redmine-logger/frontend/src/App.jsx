import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  Hash,
  Calendar,
  Clock,
  FileText,
  Save,
  FileOutput,
  Upload,
  Trash2,
  Plus,
  Layout,
  RefreshCw,
  LogOut,
  ChevronDown,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2
} from "lucide-react";

const API_BASE = "";

const emptyRow = () => ({
  date: new Date().toISOString().slice(0, 10),
  issue_id: 158484,
  hours: 1,
  comments: "Manual task",
  source_id: "",
});

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

export default function App() {
  const [form, setForm] = useState({
    repository: "",
    token: "",
    username: "",
    branch: "",
    fromDate: "",
    toDate: "",
    redmineUrl: "",
    redmineApiKey: "",
  });
  const [github, setGithub] = useState(() => {
    const saved = localStorage.getItem("github_config");
    return saved ? JSON.parse(saved) : { connected: false, username: "", token: "", user: null };
  });
  const [redmine, setRedmine] = useState(() => {
    const saved = localStorage.getItem("redmine_config");
    return saved ? JSON.parse(saved) : { connected: false, url: "", apiKey: "", user: null };
  });
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState({ text: "Ready.", error: false, loading: false });
  const [excelPreview, setExcelPreview] = useState(null);

  useEffect(() => {
    if (github.connected) {
      localStorage.setItem("github_config", JSON.stringify(github));
    } else {
      localStorage.removeItem("github_config");
    }
  }, [github]);

  useEffect(() => {
    if (redmine.connected) {
      localStorage.setItem("redmine_config", JSON.stringify(redmine));
    } else {
      localStorage.removeItem("redmine_config");
    }
  }, [redmine]);

  useEffect(() => {
    async function loadDefaults() {
      try {
        const res = await fetch(`${API_BASE}/api/default-dates`);
        const data = await res.json();
        setForm((prev) => ({ ...prev, fromDate: data.fromDate, toDate: data.toDate }));
      } catch (_error) {
        const now = new Date();
        setForm((prev) => ({
          ...prev,
          fromDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
          toDate: now.toISOString().slice(0, 10),
        }));
      }
    }
    loadDefaults();
  }, []);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setMessage(text, error = false, loading = false) {
    setStatus({ text, error, loading });
  }

  function mergeUniqueRows(existing, incoming) {
    const keys = new Set(
      existing.map((item) =>
        [item.date, item.issue_id, item.hours, item.comments, item.source_id || ""].join("|")
      )
    );
    const merged = [...existing];

    incoming.forEach((item) => {
      const key = [item.date, item.issue_id, item.hours, item.comments, item.source_id || ""].join("|");
      if (!keys.has(key)) {
        keys.add(key);
        merged.push(item);
      }
    });

    return merged;
  }

  async function handleConnect() {
    if (!form.username.trim() || !form.token.trim()) {
      setMessage("GitHub Username and Token are required to connect.", true);
      return;
    }

    setMessage("Connecting to GitHub...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/github/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username.trim(),
          token: form.token.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Connection failed.", true);
        return;
      }

      setGithub({
        connected: true,
        username: form.username.trim(),
        token: form.token.trim(),
        user: data.user,
      });
      setMessage(`Connected as ${data.user.login}.`);
    } catch (error) {
      setMessage(error.message || "Could not connect to GitHub.", true);
    }
  }

  async function handleRedmineConnect() {
    if (!form.redmineApiKey) {
      setMessage("Redmine API Key is required.", true);
      return;
    }

    setMessage("Connecting to Redmine...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/redmine/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: form.redmineApiKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Redmine connection failed.", true);
        return;
      }

      setRedmine({
        connected: true,
        url: form.redmineUrl.trim(),
        apiKey: form.redmineApiKey.trim(),
        user: data.user,
      });
      setMessage(`Connected to Redmine as ${data.user.firstname} ${data.user.lastname}.`);
    } catch (error) {
      setMessage(error.message || "Could not connect to Redmine.", true);
    }
  }

  function handleDisconnect() {
    setGithub({ connected: false, username: "", token: "", user: null });
    setMessage("Disconnected from GitHub.");
  }

  function handleRedmineDisconnect() {
    setRedmine({ connected: false, url: "", apiKey: "", user: null });
    setMessage("Disconnected from Redmine.");
  }

  async function handleImport() {
    setMessage("Importing commits from GitHub...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/github/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: form.repository.trim(),
          username: github.username,
          token: github.token,
          branch: form.branch.trim(),
          fromDate: form.fromDate,
          toDate: form.toDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not import commits.", true);
        return;
      }

      setRows((prev) => {
        const next = mergeUniqueRows(prev, data.entries || []);
        if (next.length > 0) {
          // Automation Sequence: Save -> Build
          setTimeout(() => handleSaveAndBuild(next), 500);
        }
        return next;
      });
      setMessage(`Imported ${data.total} commits.`);
    } catch (error) {
      setMessage(error.message || "GitHub import failed.", true);
    }
  }

  async function handleSaveAndBuild(currentRows) {
    setMessage("Saving imported data...", false, true);
    try {
      const saveRes = await fetch(`${API_BASE}/api/excel/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: currentRows }),
      });
      if (!saveRes.ok) throw new Error("Auto-save failed.");

      setMessage("Building timelog...", false, true);
      const buildRes = await fetch(`${API_BASE}/api/excel/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!buildRes.ok) throw new Error("Auto-build failed.");

      setMessage("All tasks synced and timelog updated!");
      setTimeout(() => loadExcelPreview("timelog"), 500);
    } catch (err) {
      setMessage(err.message, true);
    }
  }

  async function handleSave() {
    if (rows.length === 0) {
      setMessage("No tasks available to save.", true);
      return;
    }

    setMessage("Saving rows to Excel...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/excel/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not save to Excel.", true);
        return;
      }

      setMessage(`Saved successfully. ${data.added} new rows added.`);
    } catch (error) {
      setMessage(error.message || "Save failed.", true);
    }
  }

  async function handleGenerateExcel() {
    setMessage("Generating timelog...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/excel/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not generate Excel.", true);
        return;
      }
      setMessage(`Timelog generated (${data.rows} rows).`);
    } catch (error) {
      setMessage(error.message || "Generate excel failed.", true);
    }
  }

  async function handleUploadRedmine() {
    setMessage("Uploading logs to Redmine...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/redmine/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redmineUrl: redmine.url,
          redmineApiKey: redmine.apiKey
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not upload logs.", true);
        return;
      }
      setMessage(`Upload done. Success: ${data.success}, Failed: ${data.failed}.`);
    } catch (error) {
      setMessage(error.message || "Redmine upload failed.", true);
    }
  }

  async function loadExcelPreview(which) {
    setMessage(which === "timelog" ? "Loading timelog preview..." : "Loading input sheet preview...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/excel/preview?which=${encodeURIComponent(which)}`);
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Could not load Excel preview.", true);
        setExcelPreview(null);
        return;
      }
      setExcelPreview(data);
      setMessage(data.empty ? "Sheet is empty." : `Showing ${which} sheet.`);
    } catch (error) {
      setMessage(error.message || "Preview failed.", true);
      setExcelPreview(null);
    }
  }

  async function handleUpdateExcel() {
    if (!excelPreview || excelPreview.rows.length === 0) return;
    setMessage(`Updating ${excelPreview.which} sheet...`, false, true);
    try {
      const res = await fetch(`${API_BASE}/api/excel/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ which: excelPreview.which, rows: excelPreview.rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Update failed.", true);
        return;
      }
      setMessage(data.message || "Excel updated successfully.");
    } catch (error) {
      setMessage(error.message || "Update failed.", true);
    }
  }

  async function handleGenerateApu() {
    setMessage("Generating APU Tracking Sheet...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/excel/generate-apu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "APU generation failed.", true);
        return;
      }
      setMessage(`${data.message}. Downloading...`);
      handleDownload("apu");
    } catch (error) {
      setMessage(error.message || "APU generation failed.", true);
    }
  }

  function handleDownload(which) {
    window.location.href = `${API_BASE}/api/excel/download?which=${which}`;
  }

  function updateRow(index, key, value) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  return (
    <motion.main
      className="container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      <header className="hero">
        <motion.h1
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          APU Log Automator
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Effortlessly sync GitHub commits to your APU tracking sheets and Redmine logs.
        </motion.p>
      </header>

      <div className="layout-content">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "20px" }}>
          {!github.connected ? (
            <motion.section className="card highlight" variants={cardVariants} initial="hidden" animate="visible">
              <h2><Github size={24} color="#60a5fa" /> GitHub</h2>
              <p className="muted" style={{ fontSize: "14px", marginBottom: "15px" }}>Connect your account to sync development activity.</p>
              <div className="grid">
                <input value={form.username} onChange={(e) => setField("username", e.target.value)} placeholder="Username" />
                <input type="password" value={form.token} onChange={(e) => setField("token", e.target.value)} placeholder="Access Token" />
              </div>
              <div className="actions">
                <button className="primary" onClick={handleConnect}><CheckCircle2 size={18} /> Connect</button>
              </div>
            </motion.section>
          ) : (
            <motion.section className="card" variants={cardVariants} initial="hidden" animate="visible">
              <div className="card-header">
                <h2><Github size={24} color="#60a5fa" /> GitHub Active</h2>
                <div className="user-badge solo">
                  {github.user?.avatar_url && <img src={github.user.avatar_url} alt="avatar" />}
                  <span>{github.user?.name || github.username}</span>
                  <button className="text-btn" onClick={handleDisconnect}><LogOut size={14} /></button>
                </div>
              </div>
            </motion.section>
          )}

          {!redmine.connected ? (
            <motion.section
              className="card highlight"
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              style={{ borderLeft: "4px solid #10b981" }}
            >
              <h2><Upload size={24} color="#10b981" /> Redmine</h2>
              <p className="muted" style={{ fontSize: "14px", marginBottom: "15px" }}>Access your Redmine account with your API Key.</p>
              <div className="grid">
                <input
                  type="password"
                  value={form.redmineApiKey}
                  onChange={(e) => setField("redmineApiKey", e.target.value)}
                  placeholder="API Key"
                />
              </div>
              <div className="actions">
                <button className="primary" style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", boxShadow: "0 4px 15px rgba(16, 185, 129, 0.3)" }} onClick={handleRedmineConnect}>
                  <CheckCircle2 size={18} /> Connect
                </button>
              </div>
            </motion.section>
          ) : (
            <motion.section className="card" variants={cardVariants} initial="hidden" animate="visible" style={{ borderLeft: "4px solid #10b981" }}>
              <div className="card-header">
                <h2><Upload size={24} color="#10b981" /> Redmine Active</h2>
                <div className="user-badge solo">
                  <div className="avatar-placeholder" style={{ background: "#10b981" }}>{redmine.user?.firstname?.[0]}</div>
                  <span>{redmine.user?.firstname} {redmine.user?.lastname}</span>
                  <button className="text-btn" onClick={handleRedmineDisconnect}><LogOut size={14} /></button>
                </div>
              </div>
              <p className="success-text" style={{ color: "#10b981" }}><CheckCircle2 size={14} /> Account Connected.</p>
            </motion.section>
          )}
        </div>

        {github.connected && redmine.connected && (
          <motion.section className="card" variants={cardVariants} initial="hidden" animate="visible">
            <h2><Layout size={24} color="#60a5fa" /> Sync Workspace</h2>
            <div className="grid">
              <label className="span-2">
                Repository <input value={form.repository} onChange={(e) => setField("repository", e.target.value)} placeholder="owner/repo (optional)" />
              </label>
              <label>
                Branch <input value={form.branch} onChange={(e) => setField("branch", e.target.value)} placeholder="main" />
              </label>
              <label>
                From <input type="date" value={form.fromDate} onChange={(e) => setField("fromDate", e.target.value)} />
              </label>
              <label>
                Until <input type="date" value={form.toDate} onChange={(e) => setField("toDate", e.target.value)} />
              </label>
            </div>

            <div className="actions">
              <button className="primary" onClick={handleImport}>
                <RefreshCw size={18} className={status.loading ? "animate-spin" : ""} /> Import & Sync
              </button>
              <button onClick={() => setRows((prev) => [...prev, emptyRow()])}>
                <Plus size={18} /> Add Manual Row
              </button>
              {redmine.connected && (
                <button className="success" onClick={handleUploadRedmine}>
                  <Upload size={18} /> Push to Redmine
                </button>
              )}
            </div>
          </motion.section>
        )}

        <div className="status-bar">
          <AnimatePresence>
            {status.text && (
              <motion.div
                className={`status ${status.error ? "error" : ""}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {status.loading ? <Loader2 className="animate-spin" size={16} /> : status.error ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                {status.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.section
          className="card"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <h2><FileText size={24} color="#a78bfa" /> Document Center</h2>
          <div className="actions">
            <button onClick={() => loadExcelPreview("timelog")}>
              <Eye size={18} /> Preview Spent Time
            </button>
            <button className="primary" onClick={handleGenerateApu}>
              <Download size={18} /> Create & Download APU
            </button>
          </div>

          <AnimatePresence>
            {excelPreview && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="preview-container"
              >
                <div className="table-wrap">
                  {excelPreview.empty ? (
                    <p className="muted" style={{ padding: "20px" }}>This sheet is currently empty.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          {excelPreview.columns.map((col) => (
                            <th key={col}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {excelPreview.rows.map((row, idx) => (
                          <tr key={idx}>
                            {excelPreview.columns.map((col) => (
                              <td key={col}>
                                <input
                                  value={row[col] != null ? String(row[col]) : ""}
                                  onChange={(e) => {
                                    const nextRows = [...excelPreview.rows];
                                    nextRows[idx] = { ...nextRows[idx], [col]: e.target.value };
                                    setExcelPreview({ ...excelPreview, rows: nextRows });
                                  }}
                                  className="inline-input"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* 
        <motion.section
          className="card"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
          <h2><Clock size={24} color="#fcd34d" /> Pending Tasks</h2>
          <div className="table-wrap">
            ... (Table omitted for brevity in comment)
          </div>
        </motion.section> 
        */}
      </div>

      <style>{`
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        .avatar-placeholder {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 12px;
          color: white;
        }

        .success-text {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 500;
          margin-top: 12px;
        }

        /* Premium Glow Effects */
        .card.highlight {
          position: relative;
          overflow: hidden;
        }
        .card.highlight::after {
          content: '';
          position: absolute;
          top: -150%;
          left: -150%;
          width: 300%;
          height: 300%;
          background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%);
          pointer-events: none;
        }
      `}</style>
    </motion.main>
  );
}
