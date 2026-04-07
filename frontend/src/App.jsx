/**
 * App.jsx - Main React Component
 * Data Visualization App - Phase 1
 *
 * Features:
 *  - CSV file upload (drag & drop or click)
 *  - Dataset preview table
 *  - Column selector + chart type picker
 *  - Bar, Line, Scatter chart rendering (Recharts)
 *  - Full error handling with user-friendly messages
 */

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Sun, Moon } from 'lucide-react';
import {
  BarChart, Bar,
  LineChart, Line,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import './App.css';
import SuggestedCharts from './SuggestedCharts';
import AiChat from './AiChat';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ── Custom Tooltip for Recharts ─────────────────────────────
const CustomTooltip = ({ active, payload, label, theme }) => {
  if (!active || !payload?.length) return null;
  const isDark = theme === 'dark';
  return (
    <div style={{
      background: isDark ? '#1f2937' : '#ffffff',
      border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: '0.84rem',
    }}>
      <p style={{ color: isDark ? '#9ca3af' : '#6b7280', marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? '#6c63ff', fontWeight: 600 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
};

// ── Main App Component ──────────────────────────────────────
export default function App() {
  // Upload state
  const [file, setFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Dataset state
  const [dataset, setDataset] = useState(null); // { columns, dtypes, preview, row_count, filename }

  // Phase 2: column types lifted here so AiChat can consume them
  const [colTypes, setColTypes] = useState({});

  // Phase 4: Session State
  const [sessionId, setSessionId] = useState(null);

  // Chart config state
  const [xAxis, setXAxis] = useState('');
  const [yAxis, setYAxis] = useState('');
  const [chartType, setChartType] = useState('bar');

  // Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");

  useEffect(() => {
    localStorage.setItem("theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark-theme");
    } else {
      document.documentElement.classList.remove("dark-theme");
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "light" ? "dark" : "light"));

  // ── File Validation ───────────────────────────────────────
  const validateFile = (f) => {
    if (!f) return 'No file selected.';
    if (!f.name.endsWith('.csv')) return 'Invalid file type. Please upload a CSV (.csv) file.';
    if (f.size === 0) return 'The file is empty. Please upload a CSV file with data.';
    if (f.size > 500 * 1024 * 1024) return 'File is too large (max 500MB).';
    return null;
  };

  // ── Handle File Selection ─────────────────────────────────
  const handleFileSelect = useCallback((selectedFile) => {
    setError('');
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(selectedFile);
    setDataset(null);
    setXAxis('');
    setYAxis('');
  }, []);

  // ── Drag & Drop Handlers ──────────────────────────────────
  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = e.dataTransfer.files[0];
    handleFileSelect(dropped);
  };

  // ── Upload + Analyse CSV ──────────────────────────────────
  const handleUpload = async () => {
    if (!file) { setError('Please select a CSV file first.'); return; }
    setLoading(true);
    setError('');
    setDataset(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDataset(response.data);
      // Auto-select first column for both axes
      if (response.data.columns.length > 0) {
        setXAxis(response.data.columns[0]);
        setYAxis(response.data.columns.length > 1 ? response.data.columns[1] : response.data.columns[0]);
      }
    } catch (err) {
      // Extract server-side error message if available
      const msg =
        err.response?.data?.detail ||
        err.message ||
        'Upload failed. Please check the file and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Reset ─────────────────────────────────────────────────
  const handleReset = () => {
    setFile(null);
    setDataset(null);
    setColTypes({});
    setSessionId(null);
    setError('');
    setXAxis('');
    setYAxis('');
  };

  // ── Phase 4: Session Persistence ──────────────────────────
  const handleSaveSession = async () => {
    if (!dataset) return;
    try {
      // Get chat history from AiChat via local storage (simplest for now) or just save dataset
      // Oh wait, AiChat manages its own messages state. To save them, we can just save the dataset metadata. 
      // For full persistence, the user can just re-ask. We'll store what we have:
      const payload = { dataset, chat_history: [] };
      const res = await axios.post(`${API_BASE}/save-session`, payload);
      setSessionId(res.data.session_id);
      alert(`Session saved! ID: ${res.data.session_id}`);
    } catch (err) {
      alert('Failed to save session');
    }
  };

  const handleLoadSession = async () => {
    const id = prompt("Enter Session ID:");
    if (!id) return;
    try {
      const res = await axios.get(`${API_BASE}/load-session/${id}`);
      setDataset(res.data.dataset);
      setSessionId(id);
      setError('');
    } catch (err) {
      alert('Session not found or failed to load');
    }
  };

  // ── Prepare Chart Data ────────────────────────────────────
  const chartData = dataset
    ? dataset.preview.map((row) => ({
      [xAxis]: row[xAxis] ?? '',
      [yAxis]: isNaN(Number(row[yAxis])) ? row[yAxis] : Number(row[yAxis]),
    }))
    : [];

  const isChartReady = dataset && xAxis && yAxis && chartData.length > 0;

  // ── Render Chart ──────────────────────────────────────────
  const renderChart = () => {
    if (!isChartReady) {
      return (
        <div className="chart-placeholder">
          <span className="ph-icon">📊</span>
          <p>Select X axis, Y axis, and chart type above to render a chart</p>
        </div>
      );
    }

    const commonProps = {
      data: chartData,
      margin: { top: 10, right: 30, left: 0, bottom: 60 }, // extra bottom margin for labels
    };

    const isDark = theme === 'dark';
    const tickStyle = { fill: isDark ? '#9ca3af' : '#6b7280', fontSize: 12 };
    const gridStroke = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    // Wrappers for charts to allow horizontal scroll on large sets
    const dynamicMinWidth = chartData.length > 15 ? `${chartData.length * 40}px` : '100%';

    if (chartType === 'bar') {
      return (
        <div className="chart-area-wrapper">
          <div style={{ minWidth: dynamicMinWidth, height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart {...commonProps}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey={xAxis} tick={tickStyle} angle={-40} textAnchor="end" interval={0} />
                <YAxis tick={tickStyle} />
                <Tooltip content={<CustomTooltip theme={theme} />} />
                <Legend wrapperStyle={{ color: tickStyle.fill, paddingTop: 16 }} />
                <Bar dataKey={yAxis} fill="#4f46e5" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    if (chartType === 'line') {
      return (
        <div className="chart-area-wrapper">
          <div style={{ minWidth: dynamicMinWidth, height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart {...commonProps}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey={xAxis} tick={tickStyle} angle={-40} textAnchor="end" interval={0} />
                <YAxis tick={tickStyle} />
                <Tooltip content={<CustomTooltip theme={theme} />} />
                <Legend wrapperStyle={{ color: tickStyle.fill, paddingTop: 16 }} />
                <Line type="monotone" dataKey={yAxis} stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 4, fill: '#0ea5e9' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    if (chartType === 'scatter') {
      const scatterData = dataset.preview.map((row, idx) => ({
        x: isNaN(Number(row[xAxis])) ? idx : Number(row[xAxis]),
        y: isNaN(Number(row[yAxis])) ? idx : Number(row[yAxis]),
        label: row[xAxis],
      }));
      return (
        <div className="chart-area-wrapper">
          <div style={{ minWidth: '100%', height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="x" name={xAxis} tick={tickStyle} type="number" />
                <YAxis dataKey="y" name={yAxis} tick={tickStyle} type="number" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div style={{ background: isDark ? '#1f2937' : '#ffffff', border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`, borderRadius: 8, padding: '10px 14px', fontSize: '0.84rem' }}>
                        <p style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>{xAxis}: <span style={{ color: '#4f46e5', fontWeight: 600 }}>{d?.label ?? d?.x}</span></p>
                        <p style={{ color: isDark ? '#9ca3af' : '#6b7280' }}>{yAxis}: <span style={{ color: '#0ea5e9', fontWeight: 600 }}>{d?.y}</span></p>
                      </div>
                    );
                  }}
                />
                <Scatter name={`${xAxis} vs ${yAxis}`} data={scatterData} fill="#ec4899" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
  };

  // ── Numeric columns only for Y axis ──────────────────────
  const numericCols = dataset
    ? dataset.columns.filter(
      (col) => dataset.dtypes[col]?.includes('int') || dataset.dtypes[col]?.includes('float')
    )
    : [];
  const yAxisCols = numericCols.length > 0 ? numericCols : (dataset?.columns ?? []);

  // ── JSX ───────────────────────────────────────────────────
  return (
    <div className="saas-layout">

      {/* ── Navbar ─────────────────────────────────────── */}
      <nav className="saas-navbar">
        <div className="saas-brand">
          <h1>📊 Data Visualizer</h1>
          <p>SaaS Data Analysis Platform</p>
        </div>
        <div className="saas-nav-actions">
          <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          {dataset && (
            <button className="btn-outline" onClick={handleReset} id="reset-btn">
              ↩ Reset Data
            </button>
          )}
          <button className="btn-outline" onClick={handleSaveSession} disabled={!dataset}>
            💾 Save
          </button>
          <button className="btn-outline" onClick={handleLoadSession}>
            📂 Load
          </button>
        </div>
      </nav>

      {/* ── Main Content ─────────────────────────── */}
      <main className="saas-main">
        <div className="saas-container">

          {error && (
            <div className="banner-error" role="alert">
              <span className="banner-icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── Upload Section ────────── */}
          {!dataset && (
            <section className="saas-card">
              <p className="saas-card-title">Upload Dataset</p>
              <div
                className={`upload-zone ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".csv"
                  id="csv-input"
                  onChange={(e) => handleFileSelect(e.target.files[0])}
                />
                <span className="upload-icon">☁️</span>
                <h3>Drag & drop your CSV file here</h3>
                <p>or click to browse files (max 500 MB)</p>
              </div>
              {file && (
                <div className="file-info">
                  <span>📄 {file.name}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              )}
              <div className="upload-actions">
                <button
                  className="btn-primary"
                  onClick={handleUpload}
                  disabled={!file || loading}
                  id="analyse-btn"
                >
                  {loading ? <span className="spinner" /> : '🔍 Analyse CSV'}
                </button>
              </div>
            </section>
          )}

          {/* ── Grid For Data & Charts ────────── */}
          {dataset && (
            <div className="saas-dashboard-grid">
              <div className="saas-left-panel">

                <section className="saas-card">
                  <p className="saas-card-title">Dataset Overview</p>
                  <div className="stats-row">
                    <div className="stat-chip">📁 {dataset.filename}</div>
                    <div className="stat-chip">Rows: {dataset.row_count.toLocaleString()}</div>
                    <div className="stat-chip">Columns: {dataset.column_count}</div>
                  </div>
                  <div className="table-wrapper">
                    <table className="preview-table">
                      <thead>
                        <tr>
                          {dataset.columns.map((col) => (
                            <th key={col}>{col} <small style={{ display: 'block', fontWeight: 400 }}>{dataset.dtypes[col]}</small></th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataset.preview.map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {dataset.columns.map((col) => (
                              <td key={col}>{row[col] ?? <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>null</span>}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {dataset.row_count > 10 && (
                    <p style={{ marginTop: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Showing first 10 of {dataset.row_count.toLocaleString()} rows
                    </p>
                  )}
                </section>

                <section className="saas-card">
                  <p className="saas-card-title">Manual Custom Charts</p>
                  <div className="controls-grid">
                    <div className="form-group">
                      <label className="form-label">X Axis</label>
                      <select className="form-select" value={xAxis} onChange={(e) => setXAxis(e.target.value)}>
                        <option value="">— Select —</option>
                        {dataset.columns.map((col) => <option key={col} value={col}>{col}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Y Axis</label>
                      <select className="form-select" value={yAxis} onChange={(e) => setYAxis(e.target.value)}>
                        <option value="">— Select —</option>
                        {yAxisCols.map((col) => <option key={col} value={col}>{col}</option>)}
                      </select>
                      {numericCols.length === 0 && (
                        <p style={{ fontSize: '0.78rem', color: '#ff9800', marginTop: 4 }}>⚠ No numeric cols</p>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Chart Type</label>
                      <div className="chart-type-btns">
                        {['bar', 'line', 'scatter'].map((type) => (
                          <button
                            key={type}
                            className={`chart-type-btn ${chartType === type ? 'active' : ''}`}
                            onClick={() => setChartType(type)}
                          >
                            {type === 'bar' ? '📊' : type === 'line' ? '📈' : '⚬'} {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="chart-area">{renderChart()}</div>
                </section>

              </div>

              <div className="saas-right-panel">
                <SuggestedCharts file={file} onColTypes={setColTypes} />
              </div>
            </div>
          )}

          {/* ── Chat Flow Section ────────── */}
          {dataset && (
            <AiChat dataset={dataset} colTypes={colTypes} datasetFilename={dataset?.filename} theme={theme} />
          )}

        </div>
      </main>
    </div>
  );
}
