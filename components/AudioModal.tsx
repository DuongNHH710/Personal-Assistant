"use client";

import { useState, useRef } from "react";

type ExtractedData = {
  transcription: string;
  summary: string;
  events: any[];
  tasks: any[];
  notes: any[];
  syncErrors: string[];
};

type Props = {
  onClose: () => void;
  linkedAccounts: any[];
  onSuccess: () => void;
};

export default function AudioModal({ onClose, linkedAccounts, onSuccess }: Props) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [stage, setStage] = useState<"upload" | "processing" | "review" | "done">("upload");
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [manualJson, setManualJson] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [result, setResult] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncToGoogle, setSyncToGoogle] = useState(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setError("Microphone access denied. Please allow microphone access and try again.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioBlob(file);
      setAudioUrl(URL.createObjectURL(file));
    }
  };

  const handleProcess = async () => {
    if (mode === "auto" && !audioBlob) return;
    if (mode === "manual" && !manualJson.trim()) return;

    if (mode === "auto" && audioBlob) {
      // Warn about large files
      const sizeMB = audioBlob.size / (1024 * 1024);
      if (sizeMB > 20) {
        setError(`File is ${sizeMB.toFixed(1)}MB. Gemini supports up to ~20MB inline. Please use a shorter recording or compressed audio.`);
        return;
      }
    }


    setStage("processing");
    setError(null);

    try {
      const formData = new FormData();
      if (mode === "auto" && audioBlob) {
        formData.append("audio", audioBlob, "recording.webm");
      } else if (mode === "manual") {
        formData.append("rawJson", manualJson);
      }
      
      if (selectedAccount) formData.append("accountId", selectedAccount);
      formData.append("syncToGoogle", String(syncToGoogle));
      formData.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

      const res = await fetch("/api/transcribe", { method: "POST", body: formData });

      // Try to parse JSON even on error for better error messages
      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server error (${res.status}): ${res.statusText || "No response received"}`);
      }

      if (!res.ok) throw new Error(data.error || `Server error: ${res.status}`);

      setResult(data);
      setStage("review");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setStage("upload");
    }
  };

  const handleDone = () => {
    onSuccess();
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, backdropFilter: "blur(4px)"
    }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "16px", padding: "2rem", width: "min(640px, 95vw)",
        maxHeight: "90vh", overflowY: "auto", position: "relative"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>
            {stage === "upload" && "🎙️ Upload or Record Audio"}
            {stage === "processing" && "⚡ Processing Audio..."}
            {stage === "review" && "✅ Review Extracted Data"}
            {stage === "done" && "🎉 Synced to Google!"}
          </h2>
          <button onClick={onClose} style={{ color: "var(--text-muted)", fontSize: "1.5rem", lineHeight: 1 }}>×</button>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid var(--danger)", borderRadius: "8px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem", color: "var(--danger)" }}>
            {error}
          </div>
        )}

        {/* Upload Stage */}
        {stage === "upload" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            {/* Mode Toggle */}
            <div style={{ display: "flex", background: "var(--surface-hover)", borderRadius: "8px", padding: "0.25rem", gap: "0.25rem" }}>
              <button onClick={() => setMode("auto")} style={{ flex: 1, padding: "0.5rem", borderRadius: "6px", background: mode === "auto" ? "var(--surface)" : "transparent", color: mode === "auto" ? "var(--foreground)" : "var(--text-muted)", fontWeight: mode === "auto" ? 600 : 400, boxShadow: mode === "auto" ? "0 1px 3px rgba(0,0,0,0.2)" : "none", transition: "all 0.2s" }}>
                🎙️ Auto (API)
              </button>
              <button onClick={() => setMode("manual")} style={{ flex: 1, padding: "0.5rem", borderRadius: "6px", background: mode === "manual" ? "var(--surface)" : "transparent", color: mode === "manual" ? "var(--foreground)" : "var(--text-muted)", fontWeight: mode === "manual" ? 600 : 400, boxShadow: mode === "manual" ? "0 1px 3px rgba(0,0,0,0.2)" : "none", transition: "all 0.2s" }}>
                📋 Manual JSON
              </button>
            </div>

            {mode === "auto" ? (
              <>
                {/* Recording */}
                <div style={{ background: "var(--surface-hover)", borderRadius: "12px", padding: "1.5rem", textAlign: "center" }}>
                  <p style={{ color: "var(--text-muted)", marginBottom: "1rem", fontSize: "0.9rem" }}>Record directly from your microphone</p>
              {!isRecording ? (
                <button onClick={startRecording} style={{
                  background: "linear-gradient(135deg, var(--danger), #dc2626)",
                  color: "#fff", padding: "0.75rem 2rem", borderRadius: "50px",
                  fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.5rem"
                }}>
                  <span style={{ width: 10, height: 10, background: "#fff", borderRadius: "50%", display: "inline-block" }} />
                  Start Recording
                </button>
              ) : (
                <button onClick={stopRecording} style={{
                  background: "var(--surface)", border: "2px solid var(--danger)",
                  color: "var(--danger)", padding: "0.75rem 2rem", borderRadius: "50px",
                  fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  animation: "pulse 1.5s infinite"
                }}>
                  <span style={{ width: 10, height: 10, background: "var(--danger)", borderRadius: "2px", display: "inline-block" }} />
                  Stop Recording
                </button>
              )}
            </div>

            {/* File Upload */}
            <div style={{ textAlign: "center" }}>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>— or upload a file —</p>
              <input ref={fileInputRef} type="file" accept="audio/*,video/*" onChange={handleFileSelect} style={{ display: "none" }} />
              <button onClick={() => fileInputRef.current?.click()} style={{
                background: "transparent", border: "1px dashed var(--border)",
                color: "var(--text-muted)", padding: "0.6rem 1.5rem", borderRadius: "8px",
                fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s"
              }}>
                📁 Choose Audio / Video File
              </button>
            </div>

            {/* Audio Preview */}
            {audioUrl && audioBlob && (
              <div>
                <p style={{ fontSize: "0.85rem", color: "var(--success)", marginBottom: "0.5rem" }}>
                  ✓ Audio ready &nbsp;
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                    ({(audioBlob.size / (1024 * 1024)).toFixed(2)} MB)
                  </span>
                  {audioBlob.size > 15 * 1024 * 1024 && (
                    <span style={{ color: "var(--danger)", marginLeft: "0.4rem", fontSize: "0.8rem" }}>⚠ Large file — may take longer</span>
                  )}
                </p>
                <audio controls src={audioUrl} style={{ width: "100%", borderRadius: "8px" }} />
              </div>
            )}
            </>
            ) : (
              <div style={{ background: "var(--surface-hover)", borderRadius: "12px", padding: "1.5rem" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                  Use your Gemini Advanced or NotebookLM to bypass API limits. Copy this prompt, attach your audio, and paste the JSON result below.
                </p>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.75rem", fontSize: "0.8rem", color: "var(--foreground)", marginBottom: "1rem", userSelect: "all", fontFamily: "monospace", overflowX: "auto" }}>
                  Extract the following from the attached audio transcription and return as valid JSON: 1. "summary", 2. "events" (title, description, dateTime, endDateTime), 3. "tasks" (title, notes, dueDate), 4. "notes" (title, content). Return ONLY a valid JSON object.
                </div>
                <textarea 
                  value={manualJson}
                  onChange={(e) => setManualJson(e.target.value)}
                  placeholder='{ "summary": "...", "events": [], ... }'
                  style={{ width: "100%", height: "150px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem", color: "var(--foreground)", fontFamily: "monospace", fontSize: "0.85rem", resize: "vertical", outline: "none" }}
                />
              </div>
            )}

            {/* Options */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {linkedAccounts.length > 1 && (
                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>Sync to account</label>
                  <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
                    style={{ width: "100%", background: "var(--surface-hover)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.6rem 0.75rem", color: "var(--foreground)", fontSize: "0.9rem" }}>
                    <option value="">Primary account</option>
                    {linkedAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>{acc.email}</option>
                    ))}
                  </select>
                </div>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.9rem" }}>
                <input type="checkbox" checked={syncToGoogle} onChange={(e) => setSyncToGoogle(e.target.checked)} />
                Auto-sync extracted items to Google Calendar, Tasks & Docs
              </label>
            </div>

            <button onClick={handleProcess} disabled={(mode === "auto" && !audioBlob) || (mode === "manual" && !manualJson.trim())} style={{
              background: ((mode === "auto" && audioBlob) || (mode === "manual" && manualJson.trim())) ? "linear-gradient(135deg, var(--accent), var(--primary))" : "var(--surface-hover)",
              color: ((mode === "auto" && audioBlob) || (mode === "manual" && manualJson.trim())) ? "#fff" : "var(--text-muted)",
              padding: "0.85rem", borderRadius: "10px", fontWeight: 600,
              fontSize: "1rem", cursor: ((mode === "auto" && audioBlob) || (mode === "manual" && manualJson.trim())) ? "pointer" : "not-allowed", transition: "all 0.2s"
            }}>
              ⚡ Process & Sync
            </button>
          </div>
        )}

        {/* Processing Stage */}
        {stage === "processing" && (
          <div style={{ textAlign: "center", padding: "3rem 1rem" }}>
            <div style={{
              width: 64, height: 64, borderRadius: "50%",
              border: "4px solid var(--border)", borderTopColor: "var(--primary)",
              margin: "0 auto 1.5rem", animation: "spin 1s linear infinite"
            }} />
            <h3 style={{ marginBottom: "0.5rem" }}>Transcribing & Analyzing...</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Gemini AI is extracting events, tasks, and notes from your recording.
            </p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Review Stage */}
        {stage === "review" && result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Summary */}
            <div style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "10px", padding: "1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "0.5rem" }}>Summary</div>
              <p style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>{result.summary}</p>
            </div>

            {/* Transcription */}
            <details style={{ background: "var(--surface-hover)", borderRadius: "10px", padding: "1rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}>View Full Transcription</summary>
              <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{result.transcription}</p>
            </details>

            {/* Events */}
            {result.events.length > 0 && (
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)", marginBottom: "0.5rem" }}>
                  📅 {result.events.length} Event{result.events.length !== 1 ? "s" : ""} Created
                </div>
                {result.events.map((ev, i) => (
                  <div key={i} style={{ background: "var(--surface-hover)", borderRadius: "8px", padding: "0.75rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                    <strong>{ev.summary || ev.title}</strong>
                    {ev.start && <span style={{ color: "var(--text-muted)", marginLeft: "0.5rem" }}>{new Date(ev.start.dateTime || ev.start.date).toLocaleString()}</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Tasks */}
            {result.tasks.length > 0 && (
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--success)", marginBottom: "0.5rem" }}>
                  ✅ {result.tasks.length} Task{result.tasks.length !== 1 ? "s" : ""} Created
                </div>
                {result.tasks.map((t, i) => (
                  <div key={i} style={{ background: "var(--surface-hover)", borderRadius: "8px", padding: "0.75rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                    <strong>{t.title}</strong>
                    {t.notes && <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>{t.notes}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            {result.notes.length > 0 && (
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent)", marginBottom: "0.5rem" }}>
                  📝 {result.notes.length} Note{result.notes.length !== 1 ? "s" : ""} Saved
                </div>
                {result.notes.map((n: any, i: number) => (
                  <div key={i} style={{ background: "var(--surface-hover)", borderRadius: "8px", padding: "0.75rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                    <strong>{n.title}</strong>
                    <p style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>{n.content?.slice(0, 100)}...</p>
                  </div>
                ))}
              </div>
            )}

            {/* Sync Errors */}
            {result.syncErrors.length > 0 && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", padding: "0.75rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--danger)", fontWeight: 600, marginBottom: "0.4rem" }}>Sync warnings:</div>
                {result.syncErrors.map((e, i) => <p key={i} style={{ fontSize: "0.8rem", color: "var(--danger)" }}>• {e}</p>)}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => { setStage("upload"); setAudioBlob(null); setAudioUrl(null); }} style={{
                flex: 1, background: "var(--surface-hover)", padding: "0.75rem", borderRadius: "8px", fontWeight: 500
              }}>
                Process Another
              </button>
              <button onClick={handleDone} style={{
                flex: 1, background: "linear-gradient(135deg, var(--success), #059669)",
                color: "#fff", padding: "0.75rem", borderRadius: "8px", fontWeight: 600
              }}>
                Done & Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
