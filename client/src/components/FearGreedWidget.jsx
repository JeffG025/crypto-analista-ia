import React from 'react';

const FearGreedWidget = ({ data }) => {
  if (!data) return null;

  const value = parseInt(data.value);
  const classification = data.value_classification;
  const arrowPosition = `${value}%`;

  let color = '#94a3b8';
  if (value < 25) color = '#ef4444';      // Miedo Extremo
  else if (value < 50) color = '#f97316'; // Miedo
  else if (value < 75) color = '#eab308'; // Neutral/Codicia
  else color = '#10b981';                 // Codicia Extrema

  return (
    <div className="sentiment-widget">
      <div className="sentiment-header">
        <span className="sentiment-title">🧠 Sentimiento del Mercado:</span>
        <span className="sentiment-value" style={{ color: color }}>
          {classification} ({value})
        </span>
      </div>

      <div className="gauge-container">
        <div className="gauge-bar"></div>
        <div className="gauge-arrow" style={{ left: arrowPosition }}>▼</div>
      </div>
      
      <div className="gauge-labels">
        <span>Miedo (0)</span>
        <span>Codicia (100)</span>
      </div>
    </div>
  );
};

export default FearGreedWidget;