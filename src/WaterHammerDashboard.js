import React, { useState, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Upload, CheckCircle, AlertCircle, Activity, Filter, Sliders, FileText } from 'lucide-react';

/* ─────────────────────────── palette ─────────────────────────── */
const COLORS = [
  '#6366F1','#F43F5E','#10B981','#F59E0B','#3B82F6',
  '#EC4899','#14B8A6','#A855F7','#EF4444','#22C55E',
  '#0EA5E9','#FB923C','#8B5CF6','#06B6D4','#84CC16',
  '#D946EF','#F97316','#2DD4BF','#60A5FA','#FBBF24',
];

/* ─────────────────────────── subcomponents ─────────────────────── */
const Card = ({ children, style = {} }) => (
  <div style={{
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)',
    border: '1px solid #E5E7EB',
    padding: '20px 24px',
    ...style
  }}>
    {children}
  </div>
);

const SectionLabel = ({ icon: Icon, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
    {Icon && <Icon size={15} color="#6366F1" strokeWidth={2.2} />}
    <span style={{ fontWeight: 700, fontSize: '0.82rem', letterSpacing: '.04em', textTransform: 'uppercase', color: '#374151' }}>
      {children}
    </span>
  </div>
);

const CustomTooltip = ({ active, payload, label, metric }) => {
  if (!active || !payload || !payload.length) return null;
  const unit = metric === 'DISCHARGE' ? 'CFS' : 'FEET';
  return (
    <div style={{
      background: '#1E293B',
      borderRadius: '10px',
      padding: '12px 16px',
      boxShadow: '0 8px 24px rgba(0,0,0,.25)',
      minWidth: '180px'
    }}>
      <div style={{ color: '#94A3B8', fontSize: '0.78rem', marginBottom: '8px', fontWeight: 600 }}>
        Time: {Number(label).toFixed(2)} s
      </div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '4px' }}>
          <span style={{ color: entry.color, fontSize: '0.82rem', fontWeight: 600 }}>{entry.dataKey}</span>
          <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 700 }}>
            {Number(entry.value).toFixed(2)} {unit}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ─────────────────────────── main component ─────────────────────── */
const WaterHammerDashboard = () => {
  const [rawData, setRawData] = useState([]);
  const [selectedNodes, setSelectedNodes] = useState(['NODE_NO_2']);
  const [selectedMetric, setSelectedMetric] = useState('DISCHARGE');
  const [timeStep, setTimeStep] = useState(0.35);
  const [timeRange, setTimeRange] = useState([0, 100]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef(null);

  /* ── parse TAB file (unchanged logic) ── */
  const parseTabFile = (content) => {
    const lines = content.split(/\r\n|\n/);
    const parsedData = [];

    let dataStartLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('(SEC.)') && lines[i].includes('(CFS)')) {
        dataStartLine = i + 2;
        break;
      }
    }

    for (let i = dataStartLine; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 3) continue;

      const parts = line.split(/\s+/).filter(p => p.length > 0);
      if (parts.length < 20) continue;

      try {
        const timeVal = parseFloat(parts[0]);
        if (isNaN(timeVal) || timeVal < 0 || timeVal > 10000) continue;

        const entry = { time: parseFloat(timeVal.toFixed(2)) };

        const nodeData = {
          1: [2, 3], 2: [4, 5], 3: [6, 7], 4: [8, 9],
          5: [11, 12], 6: [13, 14], 7: [15, 16], 8: [17, 18],
          9: [20, 21], 51: [22, 23], 52: [24, 25], 53: [26, 27],
          21: [29, 30], 22: [31, 32], 23: [33, 34], 24: [35, 36],
          25: [38, 39], 54: [40, 41], 55: [42, 43]
        };

        Object.keys(nodeData).forEach(nodeNum => {
          const [dischCol, elevCol] = nodeData[nodeNum];
          if (dischCol < parts.length) {
            const dischVal = parseFloat(parts[dischCol]);
            if (!isNaN(dischVal)) entry[`NODE_NO_${nodeNum}_DISCHARGE`] = dischVal;
          }
          if (elevCol < parts.length) {
            const elevVal = parseFloat(parts[elevCol]);
            if (!isNaN(elevVal)) entry[`NODE_NO_${nodeNum}_ENERGY_ELEV`] = elevVal;
          }
        });

        parsedData.push(entry);
      } catch (e) { continue; }
    }

    return parsedData;
  };

  /* ── file upload handler (unchanged logic) ── */
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setStatusMessage('Parsing TAB file...');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = parseTabFile(event.target.result);
        if (parsed.length === 0) {
          setStatusMessage('error:No data found in file');
          setLoading(false);
          return;
        }
        setRawData(parsed);
        const maxTime = Math.max(...parsed.map(d => d.time));
        setTimeRange([0, maxTime]);
        setStatusMessage(`success:Loaded ${parsed.length} data points with ${Object.keys(parsed[0]).length - 1} metrics`);
        setLoading(false);
      } catch (err) {
        setStatusMessage('error:' + err.message);
        console.error(err);
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  /* ── available nodes (unchanged logic) ── */
  const availableNodes = useMemo(() => {
    if (rawData.length === 0) return [];
    const nodes = new Set();
    rawData.forEach(entry => {
      Object.keys(entry).forEach(key => {
        if (key.includes('_DISCHARGE')) nodes.add(key.replace('_DISCHARGE', ''));
      });
    });
    return Array.from(nodes).sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '999');
      const numB = parseInt(b.match(/\d+/)?.[0] || '999');
      return numA - numB;
    });
  }, [rawData]);

  /* ── filtered data (unchanged logic) ── */
  const filteredData = useMemo(() => {
    if (rawData.length === 0) return [];
    return rawData.filter(d => {
      const inRange = d.time >= timeRange[0] && d.time <= timeRange[1];
      const timeFromStart = d.time - timeRange[0];
      const matchesStep = Math.abs(timeFromStart % timeStep) < 0.001 || timeFromStart < 0.001;
      return inRange && matchesStep;
    });
  }, [rawData, timeRange, timeStep]);

  /* ── chart data (unchanged logic) ── */
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

  /* ── CSV export (unchanged logic) ── */
  const exportToCSV = () => {
    if (chartData.length === 0) { alert('No data to export'); return; }
    const headers = ['Time_SEC'];
    selectedNodes.forEach(node => headers.push(`${node}_${selectedMetric}`));
    const rows = [headers.join(',')];
    chartData.forEach(row => {
      const values = [row.time];
      selectedNodes.forEach(node => values.push(row[node] !== undefined ? row[node] : ''));
      rows.push(values.join(','));
    });
    const csvText = rows.join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `water_hammer_${selectedMetric}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setStatusMessage(`success:Exported ${chartData.length} rows to CSV`);
  };

  /* ── helpers ── */
  const isError  = statusMessage.startsWith('error:');
  const isSuccess = statusMessage.startsWith('success:');
  const displayMsg = statusMessage.replace(/^(error:|success:)/, '');
  const maxTime = rawData.length > 0 ? Math.max(...rawData.map(d => d.time)) : 100;
  const metricLabel = selectedMetric === 'DISCHARGE' ? 'Discharge (CFS)' : 'Energy Elevation (FEET)';
  const metricUnit  = selectedMetric === 'DISCHARGE' ? 'CFS' : 'FEET';

  /* ── node color lookup ── */
  const nodeColor = (node) => COLORS[availableNodes.indexOf(node) % COLORS.length];

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #6D28D9 100%)',
      padding: '28px 20px 40px',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      boxSizing: 'border-box'
    }}>

      {/* ── Page wrapper ── */}
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>

        {/* ── Header ── */}
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
              letterSpacing: '-0.02em', textShadow: '0 1px 3px rgba(0,0,0,.15)'
            }}>
              Water Hammer Analysis Dashboard
            </h1>
          </div>
          <p style={{
            margin: '0 0 0 52px', color: 'rgba(255,255,255,.7)',
            fontSize: '0.88rem', fontWeight: 400
          }}>
            Real-time Visualization &amp; Analysis of WHAMO Simulation Data
          </p>
        </div>

        {/* ── Status badge ── */}
        {displayMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '12px 18px', borderRadius: '10px', marginBottom: '18px',
            background: isError ? '#FEF2F2' : '#F0FDF4',
            border: `1.5px solid ${isError ? '#FECACA' : '#BBF7D0'}`,
            color: isError ? '#B91C1C' : '#15803D',
            fontSize: '0.875rem', fontWeight: 500
          }}>
            {isError
              ? <AlertCircle size={16} color="#B91C1C" />
              : <CheckCircle size={16} color="#15803D" />}
            {displayMsg}
          </div>
        )}

        {/* ── Upload screen ── */}
        {rawData.length === 0 ? (
          <Card style={{ padding: '0' }}>
            <div
              onClick={() => !loading && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = '#EEF2FF'; }}
              onDragLeave={(e) => { e.currentTarget.style.background = ''; }}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files[0]) handleFileUpload({ target: { files: e.dataTransfer.files } });
              }}
              style={{
                padding: '80px 40px', textAlign: 'center', cursor: 'pointer',
                borderRadius: '12px', border: '2.5px dashed #C7D2FE',
                background: '#F5F3FF', transition: 'background .2s'
              }}
            >
              <div style={{
                width: '72px', height: '72px', borderRadius: '16px',
                background: '#EEF2FF', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 20px'
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

          /* ── Main dashboard grid ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Row 1: Control Panel ── */}
            <Card>
              <SectionLabel icon={Sliders}>Control Panel</SectionLabel>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1.6fr auto auto',
                gap: '16px',
                alignItems: 'end'
              }}>

                {/* Metric */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Metric
                  </label>
                  <select
                    value={selectedMetric}
                    onChange={(e) => setSelectedMetric(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 12px', fontSize: '0.875rem',
                      border: '1.5px solid #E5E7EB', borderRadius: '8px',
                      color: '#111827', fontWeight: 500, cursor: 'pointer',
                      background: '#fff', outline: 'none',
                      appearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236B7280' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat', backgroundPosition: 'calc(100% - 12px) center',
                      paddingRight: '32px'
                    }}
                  >
                    <option value="DISCHARGE">Discharge (CFS)</option>
                    <option value="ENERGY_ELEV">Energy Elevation (FEET)</option>
                  </select>
                </div>

                {/* Time step */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Time Step — <span style={{ color: '#6366F1' }}>{timeStep.toFixed(2)} s</span>
                  </label>
                  <input
                    type="range" min="0.01" max="2" step="0.01"
                    value={timeStep}
                    onChange={(e) => setTimeStep(parseFloat(e.target.value))}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#6366F1', height: '4px' }}
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

                {/* Load new file */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '9px 18px', background: '#6366F1', color: '#fff',
                    border: 'none', borderRadius: '8px', fontWeight: 600,
                    fontSize: '0.875rem', cursor: 'pointer', whiteSpace: 'nowrap',
                    transition: 'background .15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#4F46E5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#6366F1'; }}
                >
                  <Upload size={15} strokeWidth={2.5} />
                  Load New File
                </button>
              </div>
            </Card>

            {/* ── Row 2: Filter Panel ── */}
            <Card>
              <SectionLabel icon={Filter}>Filters</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>

                {/* Start slider */}
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <span>Start Time</span>
                    <span style={{ color: '#6366F1' }}>{timeRange[0].toFixed(2)} s</span>
                  </label>
                  <input
                    type="range" min="0" max={timeRange[1]} step="0.1"
                    value={timeRange[0]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val <= timeRange[1]) setTimeRange([val, timeRange[1]]);
                    }}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#6366F1' }}
                  />
                </div>

                {/* End slider */}
                <div>
                  <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    <span>End Time</span>
                    <span style={{ color: '#6366F1' }}>{timeRange[1].toFixed(2)} s</span>
                  </label>
                  <input
                    type="range" min={timeRange[0]} max={maxTime} step="0.1"
                    value={timeRange[1]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val >= timeRange[0]) setTimeRange([timeRange[0], val]);
                    }}
                    style={{ width: '100%', cursor: 'pointer', accentColor: '#6366F1' }}
                  />
                </div>
              </div>

              {/* Node chips */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  Nodes
                </span>
                <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>
                  {selectedNodes.length} of {availableNodes.length} selected
                </span>
              </div>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '8px',
                maxHeight: '160px', overflowY: 'auto',
                padding: '10px', background: '#F9FAFB',
                borderRadius: '8px', border: '1px solid #E5E7EB'
              }}>
                {availableNodes.map((node) => {
                  const color = nodeColor(node);
                  const active = selectedNodes.includes(node);
                  return (
                    <button
                      key={node}
                      onClick={() => {
                        if (active) setSelectedNodes(selectedNodes.filter(n => n !== node));
                        else setSelectedNodes([...selectedNodes, node]);
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '5px 12px', borderRadius: '999px',
                        border: `1.5px solid ${active ? color : '#D1D5DB'}`,
                        background: active ? `${color}18` : '#fff',
                        color: active ? color : '#6B7280',
                        fontWeight: active ? 700 : 500,
                        fontSize: '0.8rem', cursor: 'pointer',
                        transition: 'all .15s'
                      }}
                    >
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: active ? color : '#D1D5DB',
                        flexShrink: 0, transition: 'background .15s'
                      }} />
                      {node}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* ── Row 3: Graph Card ── */}
            {selectedNodes.length > 0 && chartData.length > 0 && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
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
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#9CA3AF' }}>{metricUnit}</p>
                    </div>
                  </div>

                  {/* Stats pill */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Data Points', value: chartData.length.toLocaleString() },
                      { label: 'Nodes', value: selectedNodes.length },
                      { label: 'Metric', value: metricUnit }
                    ].map(({ label, value }) => (
                      <span key={label} style={{
                        padding: '4px 12px', borderRadius: '999px',
                        background: '#F3F4F6', color: '#374151',
                        fontSize: '0.78rem', fontWeight: 600
                      }}>
                        {value} <span style={{ color: '#9CA3AF', fontWeight: 400 }}>{label}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Chart */}
                <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                  <div style={{ minWidth: '500px' }}>
                    <ResponsiveContainer width="100%" height={380}>
                      <LineChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#F3F4F6" vertical={false} />
                        <XAxis
                          dataKey="time"
                          stroke="#9CA3AF"
                          tick={{ fontSize: 11, fill: '#6B7280' }}
                          tickLine={false}
                          axisLine={{ stroke: '#E5E7EB' }}
                          label={{ value: 'Time (seconds)', position: 'insideBottomRight', offset: -8, fill: '#9CA3AF', fontSize: 11 }}
                        />
                        <YAxis
                          stroke="#9CA3AF"
                          tick={{ fontSize: 11, fill: '#6B7280' }}
                          tickLine={false}
                          axisLine={false}
                          label={{ value: metricLabel, angle: -90, position: 'insideLeft', offset: 10, fill: '#9CA3AF', fontSize: 11 }}
                          width={70}
                        />
                        <Tooltip content={<CustomTooltip metric={selectedMetric} />} />
                        <Legend
                          wrapperStyle={{
                            paddingTop: '16px', fontSize: '0.8rem', fontWeight: 600,
                            maxHeight: '80px', overflowY: 'auto', overflowX: 'hidden'
                          }}
                          iconType="circle"
                          iconSize={8}
                        />
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
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Export row */}
                <div style={{
                  marginTop: '16px', paddingTop: '16px',
                  borderTop: '1px solid #F3F4F6',
                  display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
                }}>
                  <button
                    onClick={exportToCSV}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '7px',
                      padding: '9px 20px', background: '#6366F1', color: '#fff',
                      border: 'none', borderRadius: '8px', fontWeight: 600,
                      fontSize: '0.875rem', cursor: 'pointer', transition: 'background .15s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#4F46E5'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#6366F1'; }}
                  >
                    <Download size={15} strokeWidth={2.5} /> Export CSV
                  </button>
                  <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
                    {chartData.length.toLocaleString()} rows · {selectedNodes.length} nodes · {metricLabel}
                  </span>
                </div>
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

export default WaterHammerDashboard;
