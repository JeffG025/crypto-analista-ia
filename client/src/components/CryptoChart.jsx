import React, { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];

// Colores neutrales que funcionan en tema claro y oscuro
const TICK_COLOR = '#7d8da6';
const GRID_COLOR = 'rgba(148, 163, 184, 0.15)';

const CryptoChart = ({ data, currencyCode = 'usd' }) => {
  const [showPercentage, setShowPercentage] = useState(false);

  if (!data || !data.datasets || data.datasets.length === 0) {
    return (
        <div style={{ padding: '20px', textAlign: 'center', color: TICK_COLOR }}>
            <p>⚠️ Esperando datos...</p>
        </div>
    );
  }

  // Normalización para comparar monedas en % de rendimiento
  const processedData = useMemo(() => {
    if (!showPercentage) return data;

    const newDatasets = data.datasets.map(dataset => {
        const startValue = dataset.data[0] || 1;
        const normalizedData = dataset.data.map(value =>
            ((value - startValue) / startValue) * 100
        );
        return { ...dataset, data: normalizedData };
    });

    return { ...data, datasets: newDatasets };
  }, [data, showPercentage]);

  const finalDatasets = processedData.datasets.map((dataset, index) => {
      const color = COLORS[index % COLORS.length];
      return {
          ...dataset,
          borderColor: color,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 6,
          label: showPercentage ? `${dataset.label} (%)` : dataset.label
      };
  });

  const chartData = { ...processedData, datasets: finalDatasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: data.datasets.length > 1,
        labels: { color: TICK_COLOR, font: { size: 10 }, boxWidth: 10 }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        callbacks: {
            label: (context) => {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) {
                    if (showPercentage) {
                        label += context.parsed.y.toFixed(2) + '%';
                    } else {
                        label += new Intl.NumberFormat('en-US', {
                            style: 'currency', currency: currencyCode.toUpperCase()
                        }).format(context.parsed.y);
                    }
                }
                return label;
            }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: TICK_COLOR, maxTicksLimit: 6, font: { size: 10 } }
      },
      y: {
        grid: { color: GRID_COLOR },
        ticks: {
            color: TICK_COLOR,
            font: { size: 10 },
            callback: (value) => {
                if (showPercentage) return value.toFixed(1) + '%';
                return new Intl.NumberFormat('en-US', {
                    style: 'currency', currency: currencyCode.toUpperCase(), notation: "compact"
                }).format(value);
            }
        }
      },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  };

  return (
    <div style={{ marginTop: '15px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '5px' }}>
            <button className="chart-mode-btn" onClick={() => setShowPercentage(!showPercentage)}>
                {showPercentage ? '📈 %' : '💲'}
            </button>
        </div>

        <div style={{ height: '250px', width: '100%' }}>
            <Line options={options} data={chartData} />
        </div>
    </div>
  );
};

export default CryptoChart;
