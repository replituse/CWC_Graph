import React, { useState, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Upload } from 'lucide-react';

const WaterHammerDashboard = () => {
  const [rawData, setRawData] = useState([]);
  const [selectedNodes, setSelectedNodes] = useState(['NODE_NO_2']);
  const [selectedMetric, setSelectedMetric] = useState('DISCHARGE');
  const [timeStep, setTimeStep] = useState(0.35);
  const [timeRange, setTimeRange] = useState([0, 100]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef(null);

  // Parse TAB file - now with correct column structure
  const parseTabFile = (content) => {
    const lines = content.split(/\r\n|\n/);
    const parsedData = [];
    
    // Find where data starts (after headers with units)
    let dataStartLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('(SEC.)') && lines[i].includes('(CFS)')) {
        dataStartLine = i + 2; // Skip blank line after units
        break;
      }
    }

    // Parse each data line
    for (let i = dataStartLine; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 3) continue;
      
      const parts = line.split(/\s+/).filter(p => p.length > 0);
      if (parts.length < 20) continue;
      
      try {
        const timeVal = parseFloat(parts[0]);
        if (isNaN(timeVal) || timeVal < 0 || timeVal > 10000) continue;
        
        const entry = { time: parseFloat(timeVal.toFixed(2)) };
        
        // TAB file column structure (verified from Excel conversion):
        // Col 0: TIME
        // Col 1: Empty (NODE_NO label split)
        // Col 2: NODE_1_DISCHARGE
        // Col 3: NODE_1_ENERGY_ELEV
        // Col 4: NODE_2_DISCHARGE
        // Col 5: NODE_2_ENERGY_ELEV
        // Col 6: NODE_3_DISCHARGE
        // Col 7: NODE_3_ENERGY_ELEV
        // Col 8: NODE_4_DISCHARGE
        // Col 9: NODE_4_ENERGY_ELEV
        // Col 10: TIME (repeated)
        // Col 11: NODE_5_DISCHARGE
        // Col 12: NODE_5_ENERGY_ELEV
        // ... and so on
        
        const nodeData = {
          1: [2, 3],
          2: [4, 5],
          3: [6, 7],
          4: [8, 9],
          5: [11, 12],
          6: [13, 14],
          7: [15, 16],
          8: [17, 18],
          9: [20, 21],
          51: [22, 23],
          52: [24, 25],
          53: [26, 27],
          21: [29, 30],
          22: [31, 32],
          23: [33, 34],
          24: [35, 36],
          25: [38, 39],
          54: [40, 41],
          55: [42, 43]
        };
        
        // Parse each node
        Object.keys(nodeData).forEach(nodeNum => {
          const [dischCol, elevCol] = nodeData[nodeNum];
          
          if (dischCol < parts.length) {
            const dischVal = parseFloat(parts[dischCol]);
            if (!isNaN(dischVal)) {
              entry[`NODE_NO_${nodeNum}_DISCHARGE`] = dischVal;
            }
          }
          
          if (elevCol < parts.length) {
            const elevVal = parseFloat(parts[elevCol]);
            if (!isNaN(elevVal)) {
              entry[`NODE_NO_${nodeNum}_ENERGY_ELEV`] = elevVal;
            }
          }
        });
        
        parsedData.push(entry);
      } catch (e) {
        continue;
      }
    }

    return parsedData;
  };

  // Handle file upload
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
          setStatusMessage('❌ No data found in file');
          setLoading(false);
          return;
        }

        setRawData(parsed);
        const maxTime = Math.max(...parsed.map(d => d.time));
        setTimeRange([0, maxTime]);
        setStatusMessage(`✓ Loaded ${parsed.length} data points with ${Object.keys(parsed[0]).length - 1} metrics`);
        setLoading(false);
      } catch (err) {
        setStatusMessage('❌ Error: ' + err.message);
        console.error(err);
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  // Get available nodes
  const availableNodes = useMemo(() => {
    if (rawData.length === 0) return [];
    const nodes = new Set();
    
    rawData.forEach(entry => {
      Object.keys(entry).forEach(key => {
        if (key.includes('_DISCHARGE')) {
          nodes.add(key.replace('_DISCHARGE', ''));
        }
      });
    });

    return Array.from(nodes).sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '999');
      const numB = parseInt(b.match(/\d+/)?.[0] || '999');
      return numA - numB;
    });
  }, [rawData]);

  // Filter data by time range and step
  const filteredData = useMemo(() => {
    if (rawData.length === 0) return [];
    
    return rawData.filter(d => {
      const inRange = d.time >= timeRange[0] && d.time <= timeRange[1];
      const timeFromStart = d.time - timeRange[0];
      const matchesStep = Math.abs(timeFromStart % timeStep) < 0.001 || timeFromStart < 0.001;
      return inRange && matchesStep;
    });
  }, [rawData, timeRange, timeStep]);

  // Prepare chart data
  const chartData = useMemo(() => {
    return filteredData.map(item => {
      const obj = { time: item.time };
      selectedNodes.forEach(node => {
        const key = `${node}_${selectedMetric}`;
        if (item[key] !== undefined) {
          obj[node] = parseFloat(item[key].toFixed(2));
        }
      });
      return obj;
    });
  }, [filteredData, selectedNodes, selectedMetric]);

  // Export to CSV
  const exportToCSV = () => {
    if (chartData.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = ['Time_SEC'];
    selectedNodes.forEach(node => {
      headers.push(`${node}_${selectedMetric}`);
    });

    const rows = [headers.join(',')];
    chartData.forEach(row => {
      const values = [row.time];
      selectedNodes.forEach(node => {
        values.push(row[node] !== undefined ? row[node] : '');
      });
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
    
    setStatusMessage(`✓ Exported ${chartData.length} rows to CSV`);
  };

  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '30px 20px',
      fontFamily: 'Segoe UI, sans-serif'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '15px',
        padding: '30px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ color: '#667eea', marginTop: 0, marginBottom: '10px' }}>
          💧 Water Hammer Analysis Dashboard
        </h1>
        <p style={{ color: '#999', marginTop: 0, marginBottom: '20px' }}>
          Real-time Visualization & Analysis of WHAMO Simulation Data
        </p>

        {statusMessage && (
          <div style={{
            padding: '12px 20px',
            marginBottom: '20px',
            borderRadius: '8px',
            background: statusMessage.includes('❌') ? '#ffebee' : '#f1f8e9',
            color: statusMessage.includes('❌') ? '#c62828' : '#33691e',
            border: `2px solid ${statusMessage.includes('❌') ? '#c62828' : '#558b2f'}`
          }}>
            {statusMessage}
          </div>
        )}

        {rawData.length === 0 ? (
          <div style={{
            border: '3px dashed #667eea',
            borderRadius: '12px',
            padding: '80px 40px',
            textAlign: 'center',
            cursor: 'pointer',
            background: '#f8f9ff',
            transition: 'all 0.3s'
          }}
          onClick={() => !loading && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.style.background = 'rgba(102, 126, 234, 0.15)';
          }}
          onDragLeave={(e) => {
            e.currentTarget.style.background = '#f8f9ff';
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) {
              handleFileUpload({ target: { files: e.dataTransfer.files } });
            }
          }}>
            <div style={{ fontSize: '3em', marginBottom: '20px' }}>📊</div>
            <h2 style={{ margin: '0 0 10px 0', color: '#333' }}>
              {loading ? 'Processing TAB File...' : 'Upload TAB File'}
            </h2>
            <p style={{ color: '#666', margin: 0, fontSize: '1.05em' }}>
              {loading ? 'Parsing your water hammer data...' : 'Click to select or drag & drop your .TAB file'}
            </p>
          </div>
        ) : (
          <>
            {/* Controls */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '15px',
              marginBottom: '20px'
            }}>
              <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', fontSize: '0.9em' }}>
                  📊 Metric:
                </label>
                <select
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #667eea',
                    borderRadius: '6px',
                    fontSize: '0.95em',
                    cursor: 'pointer'
                  }}
                >
                  <option value="DISCHARGE">Discharge (CFS)</option>
                  <option value="ENERGY_ELEV">Energy Elevation (FEET)</option>
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', fontSize: '0.9em' }}>
                  ⏱️ Time Step:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min="0.01"
                    max="2"
                    step="0.01"
                    value={timeStep}
                    onChange={(e) => setTimeStep(parseFloat(e.target.value))}
                    style={{ flex: 1, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.85em', minWidth: '45px', textAlign: 'right' }}>{timeStep.toFixed(2)}s</span>
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px', fontSize: '0.9em' }}>
                  📁 Loaded: {rawData.length} points
                </label>
                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '0.9em'
                  }}
                >
                  <Upload size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Load New File
                </button>
              </div>
            </div>

            {/* Time Range */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>
                📍 Time Range: {timeRange[0].toFixed(2)} - {timeRange[1].toFixed(2)} seconds
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <input
                    type="range"
                    min="0"
                    max={timeRange[1]}
                    step="0.1"
                    value={timeRange[0]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val <= timeRange[1]) setTimeRange([val, timeRange[1]]);
                    }}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.85em', color: '#999' }}>Start: {timeRange[0].toFixed(2)}s</span>
                </div>
                <div>
                  <input
                    type="range"
                    min={timeRange[0]}
                    max={Math.max(...rawData.map(d => d.time))}
                    step="0.1"
                    value={timeRange[1]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val >= timeRange[0]) setTimeRange([timeRange[0], val]);
                    }}
                    style={{ width: '100%', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.85em', color: '#999' }}>End: {timeRange[1].toFixed(2)}s</span>
                </div>
              </div>
            </div>

            {/* Node Selection */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>
                🔍 Select Nodes ({selectedNodes.length} selected, {availableNodes.length} available):
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))',
                gap: '8px',
                maxHeight: '220px',
                overflowY: 'auto',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                background: '#fafafa'
              }}>
                {availableNodes.map((node, idx) => (
                  <label key={node} style={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    background: selectedNodes.includes(node) ? `${colors[idx % colors.length]}20` : 'transparent',
                    border: selectedNodes.includes(node) ? `2px solid ${colors[idx % colors.length]}` : '1px solid #ddd',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedNodes.includes(node)}
                      onChange={() => {
                        if (selectedNodes.includes(node)) {
                          setSelectedNodes(selectedNodes.filter(n => n !== node));
                        } else {
                          setSelectedNodes([...selectedNodes, node]);
                        }
                      }}
                      style={{ marginRight: '6px', cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '0.85em', fontWeight: selectedNodes.includes(node) ? 'bold' : 'normal' }}>
                      {node}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Graph */}
            {selectedNodes.length > 0 && chartData.length > 0 && (
              <>
                <div style={{
                  background: '#f9f9f9',
                  padding: '20px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  border: '1px solid #e0e0e0'
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '15px', color: '#333', fontSize: '1.1em' }}>
                    {selectedMetric === 'DISCHARGE' ? '⚡ Discharge Flow (CFS)' : '📈 Energy Elevation (FEET)'}
                  </h3>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis 
                        dataKey="time" 
                        label={{ value: 'Time (seconds)', position: 'insideBottomRight', offset: -5 }}
                        stroke="#666"
                      />
                      <YAxis 
                        label={{ value: selectedMetric, angle: -90, position: 'insideLeft' }}
                        stroke="#666"
                      />
                      <Tooltip 
                        contentStyle={{
                          background: 'white',
                          border: '2px solid #667eea',
                          borderRadius: '4px',
                          padding: '8px 12px'
                        }}
                        formatter={(value) => value?.toFixed(2)}
                        labelFormatter={(label) => `Time: ${label.toFixed(2)} sec`}
                      />
                      <Legend />
                      {selectedNodes.map((node, idx) => (
                        <Line
                          key={node}
                          type="monotone"
                          dataKey={node}
                          stroke={colors[idx % colors.length]}
                          strokeWidth={2.5}
                          dot={false}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Export and Stats */}
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={exportToCSV}
                    style={{
                      padding: '10px 24px',
                      background: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.95em',
                      transition: 'all 0.3s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#5568d3';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#667eea';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <Download size={18} /> Export CSV
                  </button>

                  <div style={{
                    padding: '10px 20px',
                    background: '#f0f0f0',
                    borderRadius: '6px',
                    fontSize: '0.9em',
                    color: '#666',
                    fontWeight: '500'
                  }}>
                    <strong>{chartData.length}</strong> data points | <strong>{selectedNodes.length}</strong> nodes | <strong>{selectedMetric}</strong>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".TAB,.tab,.txt"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
};

export default WaterHammerDashboard;