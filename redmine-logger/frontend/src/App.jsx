import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
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
  Loader2,
  GripVertical
} from "lucide-react";

const API_BASE = "";

const emptyRow = (issueId) => ({
  date: new Date().toISOString().slice(0, 10),
  issue_id: issueId || 158484,
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
    issueId: "158484",
  });
  const [github, setGithub] = useState(() => {
    const saved = sessionStorage.getItem("github_config");
    return saved ? JSON.parse(saved) : { connected: false, username: "", token: "", user: null };
  });
  const [redmine, setRedmine] = useState(() => {
    const saved = sessionStorage.getItem("redmine_config");
    return saved ? JSON.parse(saved) : { connected: false, url: "", apiKey: "", user: null };
  });
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState({ text: "Ready.", error: false, loading: false });
  const [excelPreview, setExcelPreview] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const getUserId = () => {
    return github.user?.login || (redmine.user?.id ? `rm_${redmine.user.id}` : "anonymous");
  };

  useEffect(() => {
    if (github.connected) {
      sessionStorage.setItem("github_config", JSON.stringify(github));
    } else {
      sessionStorage.removeItem("github_config");
    }
  }, [github]);

  useEffect(() => {
    if (redmine.connected) {
      sessionStorage.setItem("redmine_config", JSON.stringify(redmine));
    } else {
      sessionStorage.removeItem("redmine_config");
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
    handleClearWorkspace(false); // Clear backend workspace on refresh
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
    setRows([]);
    setExcelPreview(null);
    setMessage("Disconnected from GitHub. Workspace cleared.");
  }

  function handleRedmineDisconnect() {
    setRedmine({ connected: false, url: "", apiKey: "", user: null });
    setRows([]);
    setExcelPreview(null);
    setMessage("Disconnected from Redmine. Workspace cleared.");
  }

  async function handleImport() {
    setMessage("Importing commits from GitHub...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/github/commits`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getUserId()
        },
        body: JSON.stringify({
          repository: form.repository.trim(),
          username: github.username,
          token: github.token,
          branch: form.branch.trim(),
          fromDate: form.fromDate,
          toDate: form.toDate,
          issueId: form.issueId.trim(),
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
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getUserId()
        },
        body: JSON.stringify({ entries: currentRows }),
      });
      if (!saveRes.ok) throw new Error("Auto-save failed.");

      setMessage("Building timelog...", false, true);
      const buildRes = await fetch(`${API_BASE}/api/excel/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getUserId()
        },
        body: JSON.stringify({}),
      });
      if (!buildRes.ok) throw new Error("Auto-build failed.");

      setMessage("All tasks synced and timelog updated!");
      setTimeout(() => loadExcelPreview("commits"), 500);
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
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getUserId()
        },
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
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getUserId()
        },
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
    if (!excelPreview || !excelPreview.rows || excelPreview.rows.length === 0) {
      setMessage("No data in preview to log.", true);
      return;
    }

    setConfirmModal({
      title: "Confirm Redmine Upload",
      message: `You are about to push ${excelPreview.rows.length} task logs to Redmine. This will create live time entries on your account.`,
      confirmText: "Push to Redmine",
      confirmClass: "success",
      onConfirm: async () => {
        setConfirmModal(null);
        setMessage("Initializing Redmine Upload...", false, true);
        setStatus({ text: "Logging to Redmine...", error: false, loading: true });
        
        try {
          const res = await fetch(`${API_BASE}/api/redmine/upload`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": getUserId()
            },
            body: JSON.stringify({
              redmineUrl: redmine.url,
              redmineApiKey: redmine.apiKey
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            setMessage(data.error || "Could not upload logs.", true);
            setStatus({ text: "Upload Failed", error: true, loading: false });
            return;
          }

          setMessage(`Success! Logged ${data.success} entries. Workspace cleared.`);
          setStatus({ text: "Upload Complete", error: false, loading: false });
          await handleClearWorkspace(false); 
        } catch (error) {
          setMessage(error.message || "Redmine upload failed.", true);
          setStatus({ text: "Upload Error", error: true, loading: false });
        }
      }
    });
  }

  async function handleClearWorkspace(showConfirm = true) {
    if (showConfirm) {
      setConfirmModal({
        title: "Clear Workspace",
        message: "Are you sure you want to clear your current workspace? This will delete the temporary Excel files and reset your preview.",
        confirmText: "Clear All",
        confirmClass: "delete-btn",
        onConfirm: async () => {
          setConfirmModal(null);
          try {
            const res = await fetch(`${API_BASE}/api/excel/clear`, {
              method: "POST",
              headers: { "x-user-id": getUserId() }
            });
            if (res.ok) {
              setRows([]);
              setExcelPreview(null);
              setMessage("Workspace cleared.");
            }
          } catch (err) {
            console.error("Clear failed", err);
          }
        }
      });
      return;
    }

    // Direct clear (no modal)
    try {
      await fetch(`${API_BASE}/api/excel/clear`, {
        method: "POST",
        headers: { "x-user-id": getUserId() }
      });
      setRows([]);
      setExcelPreview(null);
    } catch (err) {
      console.error("Clear failed", err);
    }
  }

  async function loadExcelPreview(which) {
    setMessage(which === "timelog" ? "Loading timelog preview..." : "Loading input sheet preview...", false, true);
    try {
      const res = await fetch(`${API_BASE}/api/excel/preview?which=${encodeURIComponent(which)}`, {
        headers: { "x-user-id": getUserId() }
      });
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
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getUserId()
        },
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
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getUserId()
        },
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
    window.location.href = `${API_BASE}/api/excel/download?which=${which}&userId=${encodeURIComponent(getUserId())}`;
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
              <label>
                Target Issue ID <input value={form.issueId} onChange={(e) => setField("issueId", e.target.value)} placeholder="158484" />
              </label>
            </div>

            <div className="actions">
              <button className="primary" onClick={handleImport}>
                <RefreshCw size={18} className={status.loading ? "animate-spin" : ""} /> Import & Sync
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
            <button onClick={() => loadExcelPreview("commits")}>
              <Eye size={18} /> Preview Git Commits
            </button>
            <button className="primary" onClick={() => handleDownload("commits")}>
              <Github size={18} /> Git Commits Excel
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
                    <>
                      <div className="preview-actions" style={{ padding: "12px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                         <button className="text-btn" onClick={() => handleClearWorkspace(true)} style={{ marginRight: "auto", textDecoration: "none", color: "var(--error)" }}>
                            <Trash2 size={16} /> Clear Workspace
                         </button>
                         <button onClick={() => {
                            const newRow = { "issue_id": form.issueId };
                            excelPreview.columns.forEach(col => {
                               if (col === "Date") newRow[col] = new Date().toISOString().split('T')[0];
                               else if (col !== "issue_id") newRow[col] = "";
                            });
                            setExcelPreview({ ...excelPreview, rows: [newRow, ...excelPreview.rows] });
                         }}>
                            <Plus size={16} /> Add Row
                         </button>
                         <button className="success" onClick={handleUpdateExcel}>
                            <Save size={16} /> Save Changes to Excel
                         </button>
                      </div>
                       <Reorder.Group 
                         axis="y" 
                         values={excelPreview.rows} 
                         onReorder={(next) => setExcelPreview({ ...excelPreview, rows: next })}
                         className="task-list"
                       >
                         {excelPreview.rows.map((row, idx) => (
                           <Reorder.Item 
                             key={row.source_id || `row-${idx}`} 
                             value={row}
                             className="task-card"
                             whileDrag={{ 
                               scale: 1.05,
                               boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                               zIndex: 100,
                               backgroundColor: "rgba(30, 41, 59, 0.9)"
                             }}
                           >
                             <div className="drag-handle">
                               <GripVertical size={20} />
                             </div>

                             <div className="field-group">
                               <span className="label">Date, Type & Issue</span>
                               <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                 <input
                                   value={row["Date"] || ""}
                                   onChange={(e) => {
                                     const nextRows = [...excelPreview.rows];
                                     nextRows[idx] = { ...nextRows[idx], "Date": e.target.value };
                                     setExcelPreview({ ...excelPreview, rows: nextRows });
                                   }}
                                   className="inline-input"
                                   style={{ width: "90px", fontSize: "12px" }}
                                 />
                                 <input
                                   value={row["issue_id"] || row["Issue ID"] || ""}
                                   onChange={(e) => {
                                     const nextRows = [...excelPreview.rows];
                                     nextRows[idx] = { ...nextRows[idx], "issue_id": e.target.value };
                                     setExcelPreview({ ...excelPreview, rows: nextRows });
                                   }}
                                   className="inline-input"
                                   style={{ width: "70px", fontSize: "11px", fontWeight: "bold", color: "var(--primary)" }}
                                 />
                                 <input
                                   value={row["Type"] || ""}
                                   onChange={(e) => {
                                     const nextRows = [...excelPreview.rows];
                                     nextRows[idx] = { ...nextRows[idx], "Type": e.target.value };
                                     setExcelPreview({ ...excelPreview, rows: nextRows });
                                   }}
                                   className="inline-input"
                                   style={{ width: "80px", fontSize: "11px", color: "var(--text-muted)" }}
                                 />
                               </div>
                             </div>

                             <div className="field-group">
                               <span className="label">Commit & Description</span>
                               <input
                                 value={row["Commit"] || ""}
                                 onChange={(e) => {
                                   const nextRows = [...excelPreview.rows];
                                   nextRows[idx] = { ...nextRows[idx], "Commit": e.target.value };
                                   setExcelPreview({ ...excelPreview, rows: nextRows });
                                 }}
                                 className="inline-input"
                                 style={{ fontWeight: "700", color: "#60a5fa" }}
                               />
                               <input
                                 value={row["Activity Description"] || ""}
                                 onChange={(e) => {
                                   const nextRows = [...excelPreview.rows];
                                   nextRows[idx] = { ...nextRows[idx], "Activity Description": e.target.value };
                                   setExcelPreview({ ...excelPreview, rows: nextRows });
                                 }}
                                 className="inline-input"
                                 style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-main)" }}
                               />
                             </div>

                             <div className="field-group" style={{ alignItems: "center" }}>
                               <span className="label">Effort</span>
                               <input
                                 value={row["Effort"] || ""}
                                 onChange={(e) => {
                                   const nextRows = [...excelPreview.rows];
                                   nextRows[idx] = { ...nextRows[idx], "Effort": e.target.value };
                                   setExcelPreview({ ...excelPreview, rows: nextRows });
                                 }}
                                 className="inline-input effort-badge"
                                 style={{ width: "50px" }}
                               />
                             </div>

                             <div className="actions-cell">
                               <button 
                                 className="delete-btn" 
                                 onClick={() => {
                                   const nextRows = excelPreview.rows.filter((_, i) => i !== idx);
                                   setExcelPreview({ ...excelPreview, rows: nextRows });
                                 }}
                                 title="Delete Row"
                               >
                                 <Trash2 size={18} />
                               </button>
                             </div>
                           </Reorder.Item>
                         ))}
                       </Reorder.Group>
                    </>
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

       <footer className="footer-credits">
         Built  by <span className="author">Shubham Kumar</span>
       </footer>

       <AnimatePresence>
         {status.loading && status.text.includes("Redmine") && (
           <motion.div 
             className="logging-overlay"
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
           >
             <motion.div 
               className="logging-card"
               initial={{ scale: 0.8, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               exit={{ scale: 0.8, y: 20 }}
             >
               <Loader2 className="animate-spin" size={48} color="#10b981" />
               <h3>Syncing with Redmine</h3>
               <p>Your tasks are being logged as time entries.</p>
               <div className="logging-progress-bar">
                 <div className="logging-progress-fill"></div>
               </div>
               <p style={{ fontSize: "12px", marginTop: "10px" }}>This may take a moment...</p>
             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>

       <AnimatePresence>
         {confirmModal && (
           <motion.div 
             className="logging-overlay"
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             onClick={() => setConfirmModal(null)}
             style={{ zIndex: 1100 }}
           >
             <motion.div 
               className="logging-card confirm-modal"
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               onClick={(e) => e.stopPropagation()}
               style={{ maxWidth: "450px" }}
             >
               <AlertCircle size={48} color={confirmModal.confirmClass === 'delete-btn' ? '#f43f5e' : '#10b981'} />
               <h3>{confirmModal.title}</h3>
               <p style={{ marginTop: "10px" }}>{confirmModal.message}</p>
               <div className="actions" style={{ marginTop: "24px", width: "100%", justifyContent: "center", gap: "12px" }}>
                 <button 
                   onClick={() => setConfirmModal(null)}
                   style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
                 >
                   Cancel
                 </button>
                 <button className={confirmModal.confirmClass} onClick={confirmModal.onConfirm}>
                   {confirmModal.confirmText}
                 </button>
               </div>
             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>

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

        .badge-security {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          padding: 4px 8px;
          border-radius: 12px;
          border: 1px solid rgba(16, 185, 129, 0.2);
          margin-left: 15px;
          vertical-align: middle;
        }

        .footer-credits {
          text-align: center;
          margin-top: 40px;
          padding-bottom: 20px;
          color: #94a3b8;
          font-size: 14px;
          font-weight: 300;
        }
        .footer-credits .author {
          font-weight: 600;
          color: #10b981;
          letter-spacing: 0.5px;
          text-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
        }
      `}</style>
    </motion.main>
  );
}
