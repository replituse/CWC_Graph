import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer
} from 'recharts';
import {
  Download, Upload, CheckCircle, AlertCircle, Activity,
  Filter, Sliders, FileText, Play, Pause, Square,
  SkipBack, Table2, ChevronDown, ChevronUp
} from 'lucide-react';

/* ────────────────────────── palette ──────────────────────────── */
const COLORS = [
  '#6366F1','#F43F5E','#10B981','#F59E0B','#3B82F6',
  '#EC4899','#14B8A6','#A855F7','#EF4444','#22C55E',
  '#0EA5E9','#FB923C','#8B5CF6','#06B6D4','#84CC16',
  '#D946EF','#F97316','#2DD4BF','#60A5FA','#FBBF24',
];

/* ────────────────────────── Card ──────────────────────────────── */
const Card = ({ children, style = {} }) => (
  <div style={{
    background: '#fff', borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)',
    border: '1px solid #E5E7EB', padding: '20px 24px', ...style
  }}>
    {children}
  </div>
);

/* ────────────────────────── SectionLabel ──────────────────────── */
const SectionLabel = ({ icon: Icon, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
    {Icon && <Icon size={15} color="#6366F1" strokeWidth={2.2} />}
    <span style={{
      fontWeight: 700, fontSize: '0.82rem', letterSpacing: '.04em',
      textTransform: 'uppercase', color: '#374151'
    }}>
      {children}
    </span>
  </div>
);

/* ────────────────────────── Custom Tooltip ────────────────────── */
const CustomTooltip = ({ active, payload, label, metric }) => {
  if (!active || !payload || !payload.length) return null;
  const unit = metric === 'DISCHARGE' ? 'CFS' : 'FEET';
  return (
    <div style={{
      background: '#1E293B', borderRadius: '10px',
      padding: '12px 16px', boxShadow: '0 8px 24px rgba(0,0,0,.3)',
      minWidth: '190px', pointerEvents: 'none'
    }}>
      <div style={{ color: '#94A3B8', fontSize: '0.75rem', marginBottom: '8px', fontWeight: 600 }}>
        Time: {Number(label).toFixed(2)} s
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{
          display: 'flex', justifyContent: 'space-between',
          gap: '14px', marginBottom: '3px', alignItems: 'center'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: entry.color, flexShrink: 0
            }} />
            <span style={{ color: '#CBD5E1', fontSize: '0.78rem', fontWeight: 500 }}>
              {entry.dataKey}
            </span>
          </span>
          <span style={{ color: '#F8FAFC', fontSize: '0.82rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {entry.value != null ? Number(entry.value).toFixed(2) : '—'} {unit}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ════════════════════════ MAIN COMPONENT ══════════════════════════ */
const WaterHammerDashboard = () => {

  /* ── state ── */
  const [rawData,        setRawData]        = useState([]);
  const [selectedNodes,  setSelectedNodes]  = useState([]);
  const [selectedMetric, setSelectedMetric] = useState('DISCHARGE');
  const [timeStep,       setTimeStep]       = useState(0.35);
  const [timeRange,      setTimeRange]      = useState([0, 100]);
  const [loading,        setLoading]        = useState(false);
  const [statusMessage,  setStatusMessage]  = useState('');

  /* export */
  const [exportMode,       setExportMode]       = useState('selected');
  const [singleExportNode, setSingleExportNode] = useState('');

  /* time-analysis panel */
  const [showAnalysis,  setShowAnalysis]  = useState(false);
  const [selectedTime,  setSelectedTime]  = useState(null);

  /* simulation */
  const [isSimulating,  setIsSimulating]  = useState(false);
  const [simIndex,      setSimIndex]      = useState(0);
  const [simSpeed,      setSimSpeed]      = useState(80);   /* ms per frame */
  const simRef = useRef(null);

  const fileInputRef       = useRef(null);
  const scrollContainerRef = useRef(null);
  const scrollLeftRef      = useRef(0);

  /* ════════════════ TAB PARSER (from provided script) ══════════ */
  const parseTabFile = (content) => {
    const lines = content.split(/\r?\n/);
    const timeMap = {};

    let startIndex = lines.findIndex(
      (line) => line.includes('(SEC.)') && line.includes('(CFS)')
    );
    if (startIndex === -1) return [];
    startIndex += 2;

    for (let i = startIndex; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length < 3) continue;

      const timeVal = parseFloat(parts[0]);
      if (isNaN(timeVal)) continue;

      if (!timeMap[timeVal]) timeMap[timeVal] = { time: timeVal };

      let nodeCounter = 1;
      for (let j = 1; j < parts.length - 1; j += 2) {
        const discharge  = parseFloat(parts[j]);
        const elevation  = parseFloat(parts[j + 1]);
        if (!isNaN(discharge) && !isNaN(elevation)) {
          timeMap[timeVal][`NODE_NO_${nodeCounter}_DISCHARGE`]   = discharge;
          timeMap[timeVal][`NODE_NO_${nodeCounter}_ENERGY_ELEV`] = elevation;
          nodeCounter++;
        }
      }
    }

    return Object.values(timeMap).sort((a, b) => a.time - b.time);
  };

  /* ════════════════ FILE UPLOAD ════════════════════════════════ */
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setStatusMessage('Parsing TAB file…');
    stopSimulation();

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parseTabFile(event.target.result);
        if (!parsed.length) {
          setStatusMessage('error:No data found in file');
          setLoading(false);
          return;
        }
        const nodes = Object.keys(parsed[0])
          .filter((k) => k.includes('_DISCHARGE'))
          .map((k) => k.replace('_DISCHARGE', ''));

        setRawData(parsed);
        setSelectedNodes(nodes);
        const maxT = Math.max(...parsed.map(d => d.time));
        setTimeRange([0, maxT]);
        setSimIndex(0);
        setStatusMessage(`success:Loaded ${parsed.length} time steps · ${nodes.length} nodes`);
        setLoading(false);
      } catch (err) {
        setStatusMessage('error:' + err.message);
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  /* ════════════════ DERIVED DATA ══════════════════════════════ */
  const availableNodes = useMemo(() => {
    if (!rawData.length) return [];
    return Object.keys(rawData[0])
      .filter((k) => k.includes('_DISCHARGE'))
      .map((k) => k.replace('_DISCHARGE', ''));
  }, [rawData]);

  const filteredData = useMemo(() => {
    if (!rawData.length) return [];
    return rawData.filter(d => {
      const inRange = d.time >= timeRange[0] && d.time <= timeRange[1];
      const fromStart = d.time - timeRange[0];
      const matchesStep = Math.abs(fromStart % timeStep) < 0.001 || fromStart < 0.001;
      return inRange && matchesStep;
    });
  }, [rawData, timeRange, timeStep]);

  const chartData = useMemo(() => {
    return filteredData.map(item => {
      const obj = { time: item.time };
      selectedNodes.forEach(node => {
        const key = `${node}_${selectedMetric}`;
        if (item[key] !== undefined) obj[node] = parseFloat(item[key].toFixed(2));
      });
      return obj;
    });
  }, [filteredData, selectedNodes, selectedMetric]);

  /* values at a specific time (for analysis panel) */
  const currentTimeValues = useMemo(() => {
    if (selectedTime == null) return null;
    const entry = rawData.find(d => Math.abs(d.time - selectedTime) < 0.0001);
    if (!entry) return null;
    const result = {};
    selectedNodes.forEach(node => {
      result[node] = entry[`${node}_${selectedMetric}`];
    });
    return result;
  }, [selectedTime, rawData, selectedNodes, selectedMetric]);

  /* values at simulation cursor */
  const simValues = useMemo(() => {
    if (!isSimulating && simIndex === 0) return null;
    const row = chartData[simIndex];
    if (!row) return null;
    return row;
  }, [simIndex, chartData, isSimulating]);

  /* ════════════════ SIMULATION ════════════════════════════════ */
  const stopSimulation = useCallback(() => {
    if (simRef.current) clearInterval(simRef.current);
    simRef.current = null;
    setIsSimulating(false);
  }, []);

  const startSimulation = useCallback(() => {
    if (!chartData.length) return;
    setIsSimulating(true);
    simRef.current = setInterval(() => {
      setSimIndex(prev => {
        if (prev >= chartData.length - 1) {
          clearInterval(simRef.current);
          simRef.current = null;
          setIsSimulating(false);
          return prev;
        }
        return prev + 1;
      });
    }, simSpeed);
  }, [chartData.length, simSpeed]);

  const pauseSimulation = useCallback(() => {
    if (simRef.current) clearInterval(simRef.current);
    simRef.current = null;
    setIsSimulating(false);
  }, []);

  const resetSimulation = useCallback(() => {
    stopSimulation();
    setSimIndex(0);
  }, [stopSimulation]);

  /* restart when speed changes while playing */
  useEffect(() => {
    if (isSimulating) {
      pauseSimulation();
      startSimulation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simSpeed]);

  /* cleanup on unmount */
  useEffect(() => () => { if (simRef.current) clearInterval(simRef.current); }, []);

  /* auto-scroll chart to keep reference line in view during simulation */
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || simTime == null || !chartData.length) return;
    const MARGIN_LEFT = 10 + 72;
    const MARGIN_RIGHT = 24;
    const plotW = chartPxWidth - MARGIN_LEFT - MARGIN_RIGHT;
    const minT  = chartData[0]?.time ?? 0;
    const maxT  = chartData[chartData.length - 1]?.time ?? 1;
    const xAbs  = MARGIN_LEFT + ((simTime - minT) / (maxT - minT)) * plotW;
    const containerW = container.clientWidth;
    const margin = 120;
    if (xAbs < container.scrollLeft + margin || xAbs > container.scrollLeft + containerW - margin) {
      container.scrollLeft = xAbs - containerW / 2;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simIndex]);

  /* ════════════════ CSV EXPORT ════════════════════════════════ */
  const exportToCSV = () => {
    if (!rawData.length) return;
    const nodesToExport =
      exportMode === 'all'    ? availableNodes :
      exportMode === 'single' ? (singleExportNode ? [singleExportNode] : []) :
      selectedNodes;

    const headers = ['Time_SEC', ...nodesToExport];
    const rows    = [headers.join(',')];
    chartData.forEach(row => {
      rows.push([row.time, ...nodesToExport.map(n => row[n] ?? '')].join(','));
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `water_hammer_${selectedMetric}_${Date.now()}.csv`;
    link.click();
    setStatusMessage(`success:Exported ${chartData.length} rows · ${nodesToExport.length} nodes`);
  };

  /* ════════════════ HELPERS ════════════════════════════════════ */
  const isError   = statusMessage.startsWith('error:');
  const displayMsg = statusMessage.replace(/^(error:|success:)/, '');
  const maxTime    = rawData.length ? Math.max(...rawData.map(d => d.time)) : 100;
  const metricLabel = selectedMetric === 'DISCHARGE' ? 'Discharge (CFS)' : 'Energy Elevation (FEET)';
  const metricUnit  = selectedMetric === 'DISCHARGE' ? 'CFS' : 'FEET';
  const nodeColor   = (node) => COLORS[availableNodes.indexOf(node) % COLORS.length];

  /* chart scrollable width: ~22 px per data point, min 700 */
  const chartPxWidth = Math.max(700, chartData.length * 22);

  /* simulation time label */
  const simTime = chartData[simIndex]?.time ?? null;
  const simPct  = chartData.length > 1
    ? Math.round((simIndex / (chartData.length - 1)) * 100)
    : 0;

  /* ════════════════════════════ RENDER ══════════════════════════ */
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #6D28D9 100%)',
      padding: '28px 20px 40px',
      fontFamily: "'Inter','Segoe UI',system-ui,sans-serif",
      boxSizing: 'border-box'
    }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: 'rgba(255,255,255,.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Activity size={22} color="#fff" strokeWidth={2.5} />
            </div>
            <h1 style={{
              margin: 0, color: '#fff', fontSize: '1.65rem', fontWeight: 800,
              letterSpacing: '-0.02em', textShadow: '0 1px 3px rgba(0,0,0,.2)'
            }}>
              Water Hammer Analysis Dashboard
            </h1>
          </div>
          <p style={{ margin: '0 0 0 52px', color: 'rgba(255,255,255,.7)', fontSize: '0.88rem' }}>
            Real-time Visualization &amp; Analysis of WHAMO Simulation Data
          </p>
        </div>

        {/* ── Status badge ────────────────────────────────────── */}
        {displayMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '11px 16px', borderRadius: '10px', marginBottom: '16px',
            background: isError ? '#FEF2F2' : '#F0FDF4',
            border: `1.5px solid ${isError ? '#FECACA' : '#BBF7D0'}`,
            color: isError ? '#B91C1C' : '#15803D',
            fontSize: '0.875rem', fontWeight: 500
          }}>
            {isError ? <AlertCircle size={16} color="#B91C1C" /> : <CheckCircle size={16} color="#15803D" />}
            {displayMsg}
          </div>
        )}

        {/* ── Upload screen ───────────────────────────────────── */}
        {rawData.length === 0 ? (
          <Card style={{ padding: 0 }}>
            <div
              onClick={() => !loading && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = '#EEF2FF'; }}
              onDragLeave={(e)  => { e.currentTarget.style.background = ''; }}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0])
                  handleFileUpload({ target: { files: e.dataTransfer.files } });
              }}
              style={{
                padding: '80px 40px', textAlign: 'center', cursor: 'pointer',
                borderRadius: '12px', border: '2.5px dashed #C7D2FE',
                background: '#F5F3FF', transition: 'background .2s'
              }}
            >
              <div style={{
                width: '72px', height: '72px', borderRadius: '16px', background: '#EEF2FF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px'
              }}>
                <FileText size={34} color="#6366F1" strokeWidth={1.5} />
              </div>
              <h2 style={{ margin: '0 0 8px', color: '#111827', fontSize: '1.25rem', fontWeight: 700 }}>
                {loading ? 'Processing TAB File…' : 'Upload TAB File'}
              </h2>
              <p style={{ margin: 0, color: '#6B7280', fontSize: '0.92rem' }}>
                {loading ? 'Parsing your water hammer data…' : 'Click to select or drag & drop your .TAB file'}
              </p>
            </div>
          </Card>
        ) : (

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ═══ ROW 1 — Control Panel ════════════════════════ */}
            <Card>
              <SectionLabel icon={Sliders}>Control Panel</SectionLabel>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.6fr auto auto auto',
                gap: '16px', alignItems: 'end'
              }}>

                {/* Metric */}
                <div>
                  <label style={labelStyle}>Metric</label>
                  <select
                    value={selectedMetric}
                    onChange={(e) => { setSelectedMetric(e.target.value); resetSimulation(); }}
                    style={selectStyle}
                  >
                    <option value="DISCHARGE">Discharge (CFS)</option>
                    <option value="ENERGY_ELEV">Energy Elevation (FEET)</option>
                  </select>
                </div>

                {/* Time step */}
                <div>
                  <label style={labelStyle}>
                    Time Step — <span style={{ color: '#6366F1' }}>{timeStep.toFixed(2)} s</span>
                  </label>
                  <input
                    type="range" min="0.01" max="5" step="0.01"
                    value={timeStep}
                    onChange={(e) => { setTimeStep(parseFloat(e.target.value)); resetSimulation(); }}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#6366F1' }}
                  />
                </div>

                {/* Loaded indicator */}
                <div style={{
                  background: '#F0FDF4', border: '1.5px solid #BBF7D0',
                  borderRadius: '8px', padding: '8px 14px', whiteSpace: 'nowrap'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#15803D', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '.04em' }}>Loaded</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#14532D' }}>{rawData.length.toLocaleString()} pts</div>
                </div>

                {/* Analysis toggle */}
                <button
                  onClick={() => setShowAnalysis(v => !v)}
                  style={{
                    ...btnOutline,
                    background: showAnalysis ? '#EEF2FF' : '#fff',
                    borderColor: showAnalysis ? '#6366F1' : '#D1D5DB',
                    color: showAnalysis ? '#6366F1' : '#6B7280'
                  }}
                >
                  <Table2 size={14} strokeWidth={2.2} />
                  Analysis
                  {showAnalysis ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>

                {/* Load New File */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={btnPrimary}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#4F46E5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#6366F1'; }}
                >
                  <Upload size={14} strokeWidth={2.5} />
                  Load New File
                </button>
              </div>
            </Card>

            {/* ═══ ROW 2 — Filters ═════════════════════════════ */}
            <Card>
              <SectionLabel icon={Filter}>Filters</SectionLabel>

              {/* Time sliders */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
                <div>
                  <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Start Time</span>
                    <span style={{ color: '#6366F1' }}>{timeRange[0].toFixed(2)} s</span>
                  </label>
                  <input
                    type="range" min="0" max={timeRange[1]} step="0.1"
                    value={timeRange[0]}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (v <= timeRange[1]) { setTimeRange([v, timeRange[1]]); resetSimulation(); }
                    }}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#6366F1' }}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
                    <span>End Time</span>
                    <span style={{ color: '#6366F1' }}>{timeRange[1].toFixed(2)} s</span>
                  </label>
                  <input
                    type="range" min={timeRange[0]} max={maxTime} step="0.1"
                    value={timeRange[1]}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (v >= timeRange[0]) { setTimeRange([timeRange[0], v]); resetSimulation(); }
                    }}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#6366F1' }}
                  />
                </div>
              </div>

              {/* Node header with select/deselect all */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Nodes &nbsp;<span style={{ color: '#9CA3AF', fontWeight: 400, textTransform: 'none' }}>
                    ({selectedNodes.length}/{availableNodes.length})
                  </span>
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => setSelectedNodes([...availableNodes])} style={btnTiny}>Select All</button>
                  <button onClick={() => setSelectedNodes([])} style={btnTiny}>Deselect All</button>
                </div>
              </div>

              {/* Node chips */}
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '7px',
                maxHeight: '150px', overflowY: 'auto',
                padding: '10px', background: '#F9FAFB',
                borderRadius: '8px', border: '1px solid #E5E7EB'
              }}>
                {availableNodes.map((node) => {
                  const color  = nodeColor(node);
                  const active = selectedNodes.includes(node);
                  return (
                    <button
                      key={node}
                      onClick={() => setSelectedNodes(active
                        ? selectedNodes.filter(n => n !== node)
                        : [...selectedNodes, node]
                      )}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '4px 11px', borderRadius: '999px',
                        border: `1.5px solid ${active ? color : '#D1D5DB'}`,
                        background: active ? `${color}18` : '#fff',
                        color: active ? color : '#6B7280',
                        fontWeight: active ? 700 : 500,
                        fontSize: '0.78rem', cursor: 'pointer', transition: 'all .12s'
                      }}
                    >
                      <span style={{
                        width: '7px', height: '7px', borderRadius: '50%',
                        background: active ? color : '#D1D5DB', flexShrink: 0
                      }} />
                      {node}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* ═══ ROW 3 — Graph Card ══════════════════════════ */}
            {selectedNodes.length > 0 && chartData.length > 0 && (
              <Card>
                {/* graph header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '8px',
                      background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Activity size={18} color="#6366F1" strokeWidth={2.2} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                        {selectedMetric === 'DISCHARGE' ? 'Discharge Flow' : 'Energy Elevation'}
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#9CA3AF' }}>{metricUnit}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                      { label: 'Data Points', value: chartData.length.toLocaleString() },
                      { label: 'Nodes',       value: selectedNodes.length },
                      { label: 'Metric',      value: metricUnit }
                    ].map(({ label, value }) => (
                      <span key={label} style={{
                        padding: '4px 11px', borderRadius: '999px',
                        background: '#F3F4F6', color: '#374151', fontSize: '0.76rem', fontWeight: 600
                      }}>
                        {value} <span style={{ color: '#9CA3AF', fontWeight: 400 }}>{label}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* ── Simulation toolbar ────────────────────────── */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                  background: '#F8FAFF', border: '1px solid #E0E7FF',
                  borderRadius: '10px', padding: '10px 16px', marginBottom: '16px'
                }}>
                  {/* buttons */}
                  <button
                    title="Reset"
                    onClick={resetSimulation}
                    style={{ ...simBtn, color: '#6B7280' }}
                  >
                    <SkipBack size={15} strokeWidth={2.4} />
                  </button>

                  {isSimulating ? (
                    <button title="Pause" onClick={pauseSimulation} style={{ ...simBtn, background: '#FEF3C7', color: '#D97706', borderColor: '#FDE68A' }}>
                      <Pause size={15} strokeWidth={2.4} />
                    </button>
                  ) : (
                    <button
                      title="Run Simulation"
                      onClick={() => simIndex >= chartData.length - 1 ? (setSimIndex(0), setTimeout(startSimulation, 50)) : startSimulation()}
                      style={{ ...simBtn, background: '#EEF2FF', color: '#6366F1', borderColor: '#C7D2FE' }}
                    >
                      <Play size={15} strokeWidth={2.4} />
                    </button>
                  )}

                  <button title="Stop" onClick={stopSimulation} style={{ ...simBtn, color: '#EF4444', borderColor: '#FECACA', background: '#FFF1F2' }}>
                    <Square size={15} strokeWidth={2.4} />
                  </button>

                  {/* progress bar */}
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <div style={{
                      height: '6px', background: '#E5E7EB', borderRadius: '99px',
                      overflow: 'hidden', cursor: 'pointer'
                    }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = (e.clientX - rect.left) / rect.width;
                      setSimIndex(Math.round(pct * (chartData.length - 1)));
                    }}>
                      <div style={{
                        height: '100%', width: `${simPct}%`,
                        background: 'linear-gradient(90deg, #6366F1, #8B5CF6)',
                        borderRadius: '99px', transition: 'width .05s linear'
                      }} />
                    </div>
                  </div>

                  {/* time display */}
                  <span style={{
                    fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem',
                    color: '#6366F1', fontWeight: 700, minWidth: '90px'
                  }}>
                    {simTime != null ? `T = ${simTime.toFixed(2)} s` : '—'}
                  </span>

                  {/* speed */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#9CA3AF', whiteSpace: 'nowrap' }}>Speed</span>
                    <select
                      value={simSpeed}
                      onChange={(e) => setSimSpeed(Number(e.target.value))}
                      style={{ ...selectStyle, padding: '4px 8px', fontSize: '0.78rem', width: 'auto' }}
                    >
                      <option value={200}>0.5×</option>
                      <option value={100}>1×</option>
                      <option value={60}>1.5×</option>
                      <option value={40}>2×</option>
                      <option value={20}>4×</option>
                      <option value={8}>10×</option>
                    </select>
                  </div>
                </div>

                {/* ── Scrollable chart container ─────────────── */}
                <div
                  ref={scrollContainerRef}
                  onScroll={(e) => { scrollLeftRef.current = e.target.scrollLeft; }}
                  style={{
                    overflowX: 'auto', overflowY: 'hidden',
                    borderRadius: '8px', position: 'relative',
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#C7D2FE #F3F4F6',
                  }}
                >
                  {/* ── Vertical 2-column simulation panel ────── */}
                  {simValues && simTime != null && (() => {
                    const MARGIN_LEFT  = 10 + 72;
                    const MARGIN_RIGHT = 24;
                    const plotW = chartPxWidth - MARGIN_LEFT - MARGIN_RIGHT;
                    const minT  = chartData[0]?.time ?? 0;
                    const maxT  = chartData[chartData.length - 1]?.time ?? 1;
                    const xAbs  = MARGIN_LEFT + ((simTime - minT) / (maxT - minT)) * plotW;

                    const PANEL_W = 320;
                    /* flip panel to left side of line when near right edge of content */
                    const left = xAbs + PANEL_W + 10 > chartPxWidth
                      ? xAbs - PANEL_W - 10
                      : xAbs + 10;

                    const nodes    = selectedNodes;
                    const half     = Math.ceil(nodes.length / 2);
                    const col1     = nodes.slice(0, half);
                    const col2     = nodes.slice(half);

                    return (
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        left: `${Math.max(4, left)}px`,
                        width: `${PANEL_W}px`,
                        background: '#1E293B',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        boxShadow: '0 8px 28px rgba(0,0,0,.4)',
                        zIndex: 20,
                        pointerEvents: 'none',
                      }}>
                        {/* time header */}
                        <div style={{
                          color: '#94A3B8', fontSize: '0.75rem', fontWeight: 700,
                          marginBottom: '8px', borderBottom: '1px solid #334155',
                          paddingBottom: '6px', textAlign: 'center', letterSpacing: '.04em'
                        }}>
                          Time: {simTime.toFixed(2)} s
                        </div>
                        {/* 2-column grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px' }}>
                          {[col1, col2].map((col, ci) => (
                            <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {col.map(node => (
                                <div key={node} style={{
                                  display: 'flex', alignItems: 'center',
                                  justifyContent: 'space-between', gap: '6px'
                                }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                    <span style={{
                                      width: '7px', height: '7px', borderRadius: '50%',
                                      background: nodeColor(node), flexShrink: 0
                                    }} />
                                    <span style={{
                                      color: '#94A3B8', fontSize: '0.72rem',
                                      fontWeight: 500, overflow: 'hidden',
                                      textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }}>
                                      {node}
                                    </span>
                                  </span>
                                  <span style={{
                                    color: '#F1F5F9', fontSize: '0.75rem',
                                    fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {simValues[node] != null
                                      ? `${simValues[node].toFixed(2)} ${metricUnit}`
                                      : '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ width: `${chartPxWidth}px`, paddingBottom: '4px' }}>
                    <LineChart
                      width={chartPxWidth}
                      height={380}
                      data={chartData}
                      margin={{ top: 8, right: 24, left: 10, bottom: 30 }}
                    >
                      <CartesianGrid strokeDasharray="4 4" stroke="#F3F4F6" vertical={false} />
                      <XAxis
                        dataKey="time"
                        stroke="#D1D5DB"
                        tick={{ fontSize: 10, fill: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}
                        tickLine={{ stroke: '#E5E7EB' }}
                        axisLine={{ stroke: '#E5E7EB' }}
                        interval={0}
                        label={{
                          value: 'Time (seconds)', position: 'insideBottomRight',
                          offset: -6, fill: '#9CA3AF', fontSize: 11
                        }}
                      />
                      <YAxis
                        stroke="#D1D5DB"
                        tick={{ fontSize: 10, fill: '#9CA3AF' }}
                        tickLine={false}
                        axisLine={false}
                        width={72}
                        label={{
                          value: metricLabel, angle: -90,
                          position: 'insideLeft', offset: 12,
                          fill: '#9CA3AF', fontSize: 11
                        }}
                      />
                      <Tooltip
                        content={<CustomTooltip metric={selectedMetric} />}
                        cursor={{ stroke: '#6366F1', strokeWidth: 1.5, strokeDasharray: '4 3' }}
                      />
                      <Legend
                        wrapperStyle={{
                          paddingTop: '14px', fontSize: '0.78rem', fontWeight: 600,
                          maxHeight: '72px', overflowY: 'auto'
                        }}
                        iconType="circle" iconSize={8}
                      />
                      {/* simulation reference line */}
                      {simTime != null && (
                        <ReferenceLine
                          x={simTime}
                          stroke="#6366F1"
                          strokeWidth={2}
                          strokeDasharray="0"
                          label={{
                            value: `${simTime.toFixed(2)}s`,
                            position: 'top', fill: '#6366F1',
                            fontSize: 10, fontWeight: 700
                          }}
                        />
                      )}
                      {selectedNodes.map((node) => (
                        <Line
                          key={node}
                          type="monotone"
                          dataKey={node}
                          stroke={nodeColor(node)}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                          activeDot={{ r: 5, strokeWidth: 0 }}
                        />
                      ))}
                    </LineChart>
                  </div>
                </div>

                {/* ── Export row ─────────────────────────────── */}
                <div style={{
                  marginTop: '16px', paddingTop: '16px',
                  borderTop: '1px solid #F3F4F6',
                  display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'
                }}>
                  <select
                    value={exportMode}
                    onChange={(e) => setExportMode(e.target.value)}
                    style={{ ...selectStyle, width: 'auto', padding: '7px 12px', fontSize: '0.82rem' }}
                  >
                    <option value="selected">Selected Nodes</option>
                    <option value="all">All Nodes</option>
                    <option value="single">Single Node…</option>
                  </select>

                  {exportMode === 'single' && (
                    <select
                      value={singleExportNode}
                      onChange={(e) => setSingleExportNode(e.target.value)}
                      style={{ ...selectStyle, width: 'auto', padding: '7px 12px', fontSize: '0.82rem' }}
                    >
                      <option value="">Choose node</option>
                      {availableNodes.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}

                  <button
                    onClick={exportToCSV}
                    style={btnPrimary}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#4F46E5'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#6366F1'; }}
                  >
                    <Download size={14} strokeWidth={2.5} /> Export CSV
                  </button>

                  <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>
                    {chartData.length.toLocaleString()} rows · {metricLabel}
                  </span>
                </div>
              </Card>
            )}

            {/* ═══ ROW 4 — Time Analysis Panel (collapsible) ════ */}
            {showAnalysis && rawData.length > 0 && (
              <Card>
                <SectionLabel icon={Table2}>Time-Step Analysis</SectionLabel>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
                  <label style={labelStyle}>Select Time Step</label>
                  <select
                    value={selectedTime ?? ''}
                    onChange={(e) => setSelectedTime(e.target.value ? parseFloat(e.target.value) : null)}
                    style={{ ...selectStyle, width: 'auto', minWidth: '160px' }}
                  >
                    <option value="">— pick a time —</option>
                    {rawData.map(d => (
                      <option key={d.time} value={d.time}>{d.time.toFixed(2)} s</option>
                    ))}
                  </select>
                </div>

                {currentTimeValues ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{
                      width: '100%', borderCollapse: 'collapse',
                      fontSize: '0.85rem'
                    }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Node</th>
                          <th style={thStyle}>{metricLabel}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(currentTimeValues).map(([node, value], idx) => (
                          <tr key={node} style={{ background: idx % 2 ? '#F9FAFB' : '#fff' }}>
                            <td style={tdStyle}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                  width: '8px', height: '8px', borderRadius: '50%',
                                  background: nodeColor(node), flexShrink: 0
                                }} />
                                {node}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>
                              {value != null ? Number(value).toFixed(2) : '—'} {metricUnit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: '#9CA3AF', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                    Select a time step above to view node values.
                  </p>
                )}
              </Card>
            )}

          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".TAB,.tab,.txt"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />
    </div>
  );
};

/* ──────────────── shared micro styles ──────────────── */
const labelStyle = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600,
  color: '#6B7280', marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '.04em'
};

const selectStyle = {
  width: '100%', padding: '9px 32px 9px 12px', fontSize: '0.875rem',
  border: '1.5px solid #E5E7EB', borderRadius: '8px',
  color: '#111827', fontWeight: 500, cursor: 'pointer',
  background: `#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236B7280' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E") no-repeat calc(100% - 10px) center`,
  appearance: 'none', outline: 'none'
};

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: '7px',
  padding: '9px 18px', background: '#6366F1', color: '#fff',
  border: 'none', borderRadius: '8px', fontWeight: 600,
  fontSize: '0.875rem', cursor: 'pointer', whiteSpace: 'nowrap',
  transition: 'background .15s'
};

const btnOutline = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '9px 14px', background: '#fff', color: '#6B7280',
  border: '1.5px solid #D1D5DB', borderRadius: '8px', fontWeight: 600,
  fontSize: '0.82rem', cursor: 'pointer', transition: 'all .15s',
  whiteSpace: 'nowrap'
};

const btnTiny = {
  padding: '4px 10px', borderRadius: '6px',
  border: '1px solid #D1D5DB', background: '#fff',
  color: '#374151', fontSize: '0.75rem', fontWeight: 600,
  cursor: 'pointer'
};

const simBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '32px', height: '32px', borderRadius: '7px',
  border: '1.5px solid #E5E7EB', background: '#fff',
  cursor: 'pointer', flexShrink: 0, transition: 'all .12s'
};

const thStyle = {
  padding: '8px 12px', textAlign: 'left',
  fontWeight: 700, fontSize: '0.78rem',
  color: '#6B7280', background: '#F9FAFB',
  borderBottom: '1px solid #E5E7EB',
  textTransform: 'uppercase', letterSpacing: '.04em'
};

const tdStyle = {
  padding: '8px 12px',
  borderBottom: '1px solid #F3F4F6',
  color: '#374151', fontSize: '0.85rem'
};

export default WaterHammerDashboard;
