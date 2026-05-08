"use client";

import { useState } from "react";

type Props = {
  onClose: () => void;
  linkedAccounts: any[];
  onSuccess: () => void;
};

export default function AddItemModal({ onClose, linkedAccounts, onSuccess }: Props) {
  const [tab, setTab] = useState<"event" | "task" | "note">("event");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>("");

  // Event form state
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");

  // Task form state
  const [taskTitle, setTaskTitle] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskDue, setTaskDue] = useState("");

  // Note form state
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      let url = "";
      let body: any = {};

      if (tab === "event") {
        if (!eventTitle || !eventStart) { setError("Title and start time are required."); setLoading(false); return; }
        url = "/api/events";
        body = { title: eventTitle, description: eventDesc, startDateTime: eventStart, endDateTime: eventEnd || undefined, accountId: selectedAccount || undefined };
      } else if (tab === "task") {
        if (!taskTitle) { setError("Title is required."); setLoading(false); return; }
        url = "/api/tasks";
        body = { title: taskTitle, notes: taskNotes, dueDate: taskDue || undefined, accountId: selectedAccount || undefined };
      } else {
        if (!noteTitle || !noteContent) { setError("Title and content are required."); setLoading(false); return; }
        url = "/api/notes";
        body = { title: noteTitle, content: noteContent, accountId: selectedAccount || undefined };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create item");

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "var(--surface-hover)", border: "1px solid var(--border)",
    borderRadius: "8px", padding: "0.65rem 0.85rem", color: "var(--foreground)",
    fontSize: "0.9rem", outline: "none", boxSizing: "border-box"
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem", fontWeight: 500
  };

  const tabs: { key: "event" | "task" | "note"; label: string; icon: string }[] = [
    { key: "event", label: "Event", icon: "📅" },
    { key: "task", label: "Task", icon: "✅" },
    { key: "note", label: "Note", icon: "📝" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, backdropFilter: "blur(4px)"
    }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "16px", padding: "2rem", width: "min(520px, 95vw)",
        maxHeight: "90vh", overflowY: "auto"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Add New Item</h2>
          <button onClick={onClose} style={{ color: "var(--text-muted)", fontSize: "1.5rem", lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", background: "var(--surface-hover)", borderRadius: "10px", padding: "0.3rem" }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              flex: 1, padding: "0.6rem", borderRadius: "8px", fontWeight: 600, fontSize: "0.9rem",
              background: tab === t.key ? "var(--surface)" : "transparent",
              color: tab === t.key ? "var(--foreground)" : "var(--text-muted)",
              boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
              transition: "all 0.2s"
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid var(--danger)", borderRadius: "8px", padding: "0.65rem 1rem", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Event Form */}
          {tab === "event" && (
            <>
              <div><label style={labelStyle}>Title *</label><input style={inputStyle} value={eventTitle} onChange={e => setEventTitle(e.target.value)} placeholder="Meeting with team..." /></div>
              <div><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }} value={eventDesc} onChange={e => setEventDesc(e.target.value)} placeholder="Optional details..." /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div><label style={labelStyle}>Start *</label><input type="datetime-local" style={inputStyle} value={eventStart} onChange={e => setEventStart(e.target.value)} /></div>
                <div><label style={labelStyle}>End</label><input type="datetime-local" style={inputStyle} value={eventEnd} onChange={e => setEventEnd(e.target.value)} /></div>
              </div>
            </>
          )}

          {/* Task Form */}
          {tab === "task" && (
            <>
              <div><label style={labelStyle}>Title *</label><input style={inputStyle} value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Prepare project report..." /></div>
              <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }} value={taskNotes} onChange={e => setTaskNotes(e.target.value)} placeholder="Additional details..." /></div>
              <div><label style={labelStyle}>Due Date</label><input type="date" style={inputStyle} value={taskDue} onChange={e => setTaskDue(e.target.value)} /></div>
            </>
          )}

          {/* Note Form */}
          {tab === "note" && (
            <>
              <div><label style={labelStyle}>Title *</label><input style={inputStyle} value={noteTitle} onChange={e => setNoteTitle(e.target.value)} placeholder="Meeting recap..." /></div>
              <div><label style={labelStyle}>Content *</label><textarea style={{ ...inputStyle, minHeight: "150px", resize: "vertical" }} value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="Write your note here..." /></div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>📄 This note will also be saved as a Google Doc</p>
            </>
          )}

          {/* Account Selector */}
          {linkedAccounts.length > 1 && (
            <div>
              <label style={labelStyle}>Save to account</label>
              <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} style={inputStyle}>
                <option value="">Primary account</option>
                {linkedAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.email}</option>
                ))}
              </select>
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={loading} style={{
            background: "linear-gradient(135deg, var(--accent), var(--primary))",
            color: "#fff", padding: "0.85rem", borderRadius: "10px", fontWeight: 600,
            fontSize: "0.95rem", opacity: loading ? 0.7 : 1, marginTop: "0.5rem",
            cursor: loading ? "not-allowed" : "pointer"
          }}>
            {loading ? "Saving..." : `Add ${tab.charAt(0).toUpperCase() + tab.slice(1)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
