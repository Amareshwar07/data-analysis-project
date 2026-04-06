/**
 * AiChat.jsx - Phase 3: AI-Powered Insights Chat
 *
 * Props:
 *   dataset   - Phase 1 upload response { columns, dtypes, preview, ... }
 *   colTypes  - Phase 2 column type map { colName: "numerical|categorical|datetime" }
 */

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import {
    BarChart, Bar,
    LineChart, Line,
    ScatterChart, Scatter,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ── Compute basic numeric stats from preview rows ────────────
function computeStats(preview, colTypes) {
    const stats = {};
    const numCols = Object.entries(colTypes)
        .filter(([, t]) => t === 'numerical')
        .map(([c]) => c);

    for (const col of numCols) {
        const vals = preview
            .map((r) => Number(r[col]))
            .filter((v) => !isNaN(v));
        if (!vals.length) continue;
        const sum = vals.reduce((a, b) => a + b, 0);
        stats[col] = {
            min: Math.min(...vals),
            max: Math.max(...vals),
            mean: parseFloat((sum / vals.length).toFixed(2)),
        };
    }
    return stats;
}

// ── Tooltip ──────────────────────────────────────────────────
const Tip = ({ active, payload, theme }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const isDark = theme === 'dark';
    return (
        <div style={{
            background: isDark ? '#1f2937' : '#ffffff',
            border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
            borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
        }}>
            <p style={{ color: d.color ?? '#4f46e5', fontWeight: 600 }}>
                {d.name}: {typeof d.value === 'number' ? d.value.toLocaleString() : d.value}
            </p>
        </div>
    );
};

// ── Mini Chart rendered inside a chat bubble ─────────────────
function AiChart({ chart, preview, theme }) {
    if (!chart || !chart.x || !chart.y || !preview?.length) return null;

    const isDark = theme === 'dark';
    const tick = { fill: isDark ? '#9ca3af' : '#6b7280', fontSize: 11 };
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    const grid = <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />;

    const data = preview.map((row, i) => ({
        x: row[chart.x] ?? i,
        y: isNaN(Number(row[chart.y])) ? 0 : Number(row[chart.y]),
        label: String(row[chart.x] ?? i),
    }));

    if (chart.type === 'bar') {
        return (
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 36 }}>
                    {grid}
                    <XAxis dataKey="label" tick={tick} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={tick} />
                    <Tooltip content={<Tip theme={theme} />} />
                    <Bar dataKey="y" name={chart.y} fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        );
    }

    if (chart.type === 'line') {
        return (
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 36 }}>
                    {grid}
                    <XAxis dataKey="label" tick={tick} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={tick} />
                    <Tooltip content={<Tip theme={theme} />} />
                    <Line type="monotone" dataKey="y" name={chart.y} stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
            </ResponsiveContainer>
        );
    }

    if (chart.type === 'scatter') {
        const sData = data.map((d, i) => ({
            x: isNaN(Number(d.x)) ? i : Number(d.x),
            y: d.y,
        }));
        return (
            <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    {grid}
                    <XAxis dataKey="x" name={chart.x} tick={tick} type="number" />
                    <YAxis dataKey="y" name={chart.y} tick={tick} type="number" />
                    <Tooltip content={<Tip theme={theme} />} />
                    <Scatter data={sData} fill="#ec4899" />
                </ScatterChart>
            </ResponsiveContainer>
        );
    }

    return null;
}

// ── Main AiChat Component ────────────────────────────────────
export default function AiChat({ dataset, colTypes, datasetFilename, theme }) {
    const [messages, setMessages] = useState([]);
    const [question, setQuestion] = useState('');
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const bottomRef = useRef(null);

    // Auto-scroll to latest message
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    if (!dataset) return null;

    const handleDownloadReport = async (msg) => {
        try {
            const res = await axios.post(`${API_BASE}/export-report`, {
                insight_text: msg.text,
                chart_info: msg.chart,
                dataset_filename: datasetFilename || 'Dataset'
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'AI_Insight_Report.pdf');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            alert('Failed to generate PDF report from server.');
        }
    };

    const handleAsk = async () => {
        const q = question.trim();
        if (!q) return;

        setMessages((prev) => [...prev, { role: 'user', text: q }]);
        setQuestion('');
        setLoading(true);

        const safeColTypes = colTypes && Object.keys(colTypes).length > 0
            ? colTypes
            : Object.fromEntries(
                dataset.columns.map((c) => [
                    c,
                    dataset.dtypes[c]?.includes('int') || dataset.dtypes[c]?.includes('float')
                        ? 'numerical'
                        : 'categorical',
                ])
            );

        const stats = computeStats(dataset.preview, safeColTypes);

        // Prevent asking for charts if absolutely no numeric data is available,
        // although we can still let AI respond textually if they just ask a question.
        // We ensure AI knows there are 0 stats to build from.

        const payload = {
            question: q,
            columns: safeColTypes,
            sample_rows: dataset.preview.slice(0, 10),
            stats,
        };

        try {
            const res = await axios.post(`${API_BASE}/ask-ai`, payload);
            const { answer, chart } = res.data;
            setMessages((prev) => [...prev, { role: 'ai', text: answer, chart }]);
        } catch (err) {
            const msg =
                err.response?.data?.detail ||
                err.message ||
                'AI request failed. Is Ollama running?';
            setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ ${msg}`, chart: null, isError: true }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!loading) handleAsk();
        }
    };

    const CHART_LABELS = { bar: '📊 Bar Chart', line: '📈 Line Chart', scatter: '⚬ Scatter Plot' };

    return (
        <div className="chat-fab-wrapper">
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        className="chat-fab"
                        onClick={() => setIsOpen(true)}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    >
                        <MessageCircle size={28} />
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="chat-container"
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 50, scale: 0.9 }}
                        transition={{ type: "spring", bounce: 0.4, duration: 0.5 }}
                    >
                        <div className="chat-header">
                            <h3>
                                <MessageCircle size={18} />
                                AI Data Assistant
                            </h3>
                            <button className="btn-close" onClick={() => setIsOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* ── Thread ─────────────────────────────────────── */}
                        <div className="chat-thread-wrapper">
                            {messages.length === 0 && (
                                <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--text-muted)' }}>
                                    <p style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 8 }}>Ask AI About Your Data</p>
                                    <p style={{ fontSize: '0.9rem' }}>e.g. <em>"Which names have the highest salaries?"</em></p>
                                    {Object.keys(computeStats(dataset.preview, colTypes || {})).length === 0 && (
                                        <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-input)', borderRadius: '8px', fontSize: '0.85rem' }}>
                                            <em>Note: No numeric columns detected. Charts cannot be generated.</em>
                                        </div>
                                    )}
                                </div>
                            )}

                            {messages.length > 0 && (
                                <div className="chat-thread">
                                    {messages.map((msg, i) => (
                                        <div key={i} className={`chat-bubble chat-bubble-${msg.role} ${msg.isError ? 'chat-bubble-error' : ''}`}>
                                            <div className="chat-bubble-text">{msg.text}</div>
                                            {msg.role === 'ai' && msg.chart && !msg.isError && (
                                                <>
                                                    <div className="chat-chart-label">
                                                        {CHART_LABELS[msg.chart.type] ?? '📊 Chart'} &nbsp;·&nbsp;
                                                        <span className="chat-axis-pill">X: {msg.chart.x}</span>
                                                        <span className="chat-axis-pill">Y: {msg.chart.y}</span>
                                                    </div>
                                                    <div className="chat-chart-area">
                                                        <AiChart chart={msg.chart} preview={dataset.preview} theme={theme} />
                                                    </div>
                                                    <button className="export-btn" style={{ marginTop: '12px' }} onClick={() => handleDownloadReport(msg)}>
                                                        📄 Download Report
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    {loading && (
                                        <div className="chat-bubble chat-bubble-ai">
                                            <div className="chat-typing"><span /><span /><span /></div>
                                        </div>
                                    )}
                                    <div ref={bottomRef} />
                                </div>
                            )}
                        </div>

                        {/* ── Input Row ──────────────────────────────────── */}
                        <div className="chat-input-wrapper">
                            <div className="chat-input-box">
                                <textarea
                                    className="chat-textarea"
                                    rows={1}
                                    placeholder="Ask about this dataset…"
                                    value={question}
                                    onChange={(e) => setQuestion(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    disabled={loading}
                                />
                                <button className="chat-send-btn" onClick={handleAsk} disabled={loading || !question.trim()}>
                                    {loading ? <span className="spinner" /> : '✦'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
