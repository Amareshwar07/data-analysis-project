/**
 * SuggestedCharts.jsx - Phase 2 Smart Visualization
 *
 * Accepts a CSV File object, calls POST /suggest-visualizations,
 * and renders suggestion cards with one-click inline chart rendering.
 */

import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    BarChart, Bar,
    LineChart, Line,
    ScatterChart, Scatter,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const CHART_META = {
    bar: { icon: '📊', label: 'Bar Chart', color: '#6c63ff' },
    line: { icon: '📈', label: 'Line Chart', color: '#00d4ff' },
    scatter: { icon: '⚬', label: 'Scatter Plot', color: '#ff6bcb' },
};

// ── Tooltip ─────────────────────────────────────────────────
const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
        <div style={{
            background: '#1a1e30', border: '1px solid rgba(108,99,255,0.4)',
            borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem',
        }}>
            <p style={{ color: d.color ?? '#6c63ff', fontWeight: 600 }}>
                {d.name}: {typeof d.value === 'number' ? d.value.toLocaleString() : d.value}
            </p>
        </div>
    );
};

// ── Inline Chart Renderer ────────────────────────────────────
function SuggestionChart({ suggestion }) {
    const { chart_type, data, x, y } = suggestion;
    const tick = { fill: '#8892b0', fontSize: 11 };
    const grid = <CartesianGrid strokeDasharray="3 3" stroke="rgba(108,99,255,0.1)" />;

    if (chart_type === 'bar') {
        return (
            <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 36 }}>
                    {grid}
                    <XAxis dataKey="x" tick={tick} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                    <YAxis tick={tick} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="y" name={y} fill="#6c63ff" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        );
    }

    if (chart_type === 'line') {
        return (
            <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 36 }}>
                    {grid}
                    <XAxis dataKey="x" tick={tick} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                    <YAxis tick={tick} />
                    <Tooltip content={<Tip />} />
                    <Line type="monotone" dataKey="y" name={y} stroke="#00d4ff" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
            </ResponsiveContainer>
        );
    }

    if (chart_type === 'scatter') {
        const scatterData = data.map((r, i) => ({
            x: typeof r.x === 'number' ? r.x : i,
            y: typeof r.y === 'number' ? r.y : i,
        }));
        return (
            <ResponsiveContainer width="100%" height={240}>
                <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    {grid}
                    <XAxis dataKey="x" name={x} tick={tick} type="number" />
                    <YAxis dataKey="y" name={y} tick={tick} type="number" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<Tip />} />
                    <Scatter data={scatterData} fill="#ff6bcb" />
                </ScatterChart>
            </ResponsiveContainer>
        );
    }

    return null;
}

// ── Suggestion Card ──────────────────────────────────────────
function SuggestionCard({ suggestion, index }) {
    const [expanded, setExpanded] = useState(false);
    const meta = CHART_META[suggestion.chart_type] ?? CHART_META.bar;

    return (
        <div className={`suggestion-card ${expanded ? 'expanded' : ''}`}>
            <div className="suggestion-card-header">
                <span
                    className="suggestion-badge"
                    style={{ background: meta.color + '22', color: meta.color, borderColor: meta.color + '55' }}
                >
                    {meta.icon} {meta.label}
                </span>
                <div className="suggestion-axes">
                    <span className="suggestion-axis-label">X</span>
                    <span className="suggestion-axis-value">{suggestion.x}</span>
                    <span className="suggestion-axis-label">Y</span>
                    <span className="suggestion-axis-value">{suggestion.y}</span>
                </div>
            </div>

            <p className="suggestion-reason">{suggestion.reason}</p>

            <button
                className={`btn suggestion-render-btn ${expanded ? 'active' : ''}`}
                onClick={() => setExpanded((v) => !v)}
                id={`render-suggestion-${index}`}
            >
                {expanded ? '▲ Hide Chart' : '▶ Render Chart'}
            </button>

            {expanded && (
                <div className="suggestion-chart-expand">
                    <SuggestionChart suggestion={suggestion} />
                </div>
            )}
        </div>
    );
}

// ── Main Export ──────────────────────────────────────────────
export default function SuggestedCharts({ file, onColTypes }) {
    const [suggestions, setSuggestions] = useState([]);
    const [colTypes, setColTypes] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!file) return;

        const fetchSuggestions = async () => {
            setLoading(true);
            setError('');
            setSuggestions([]);
            setColTypes({});

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await axios.post(`${API_BASE}/suggest-visualizations`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                const fetchedColTypes = res.data.columns ?? {};
                setSuggestions(res.data.suggestions ?? []);
                setColTypes(fetchedColTypes);
                onColTypes?.(fetchedColTypes);  // lift to App
            } catch (err) {
                setError(err.response?.data?.detail ?? 'Failed to fetch suggestions.');
            } finally {
                setLoading(false);
            }
        };

        fetchSuggestions();
    }, [file]);

    if (!file) return null;

    return (
        <section className="saas-card" id="smart-suggestions">
            <p className="saas-card-title">✨ Smart Suggestions</p>

            {/* Column type chips */}
            {Object.keys(colTypes).length > 0 && (
                <div className="col-types-row">
                    {Object.entries(colTypes).map(([col, type]) => (
                        <span key={col} className={`col-type-chip col-type-${type}`}>
                            {col} <em>({type})</em>
                        </span>
                    ))}
                </div>
            )}

            {loading && (
                <div className="suggestion-loading">
                    <span className="spinner" /> Analysing column types…
                </div>
            )}

            {error && (
                <div className="banner banner-error">
                    <span className="banner-icon">⚠️</span>
                    <span>{error}</span>
                </div>
            )}

            {!loading && !error && suggestions.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    No chart suggestions could be generated for this dataset.
                </p>
            )}

            {suggestions.length > 0 && (
                <div className="suggestions-grid">
                    {suggestions.map((s, i) => (
                        <SuggestionCard key={i} suggestion={s} index={i} />
                    ))}
                </div>
            )}
        </section>
    );
}
