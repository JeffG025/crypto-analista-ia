import React from 'react';

const CryptoStats = ({ stats, currencyCode = 'usd' }) => {
  // 1. Protección: Si no hay datos, no mostramos nada
  if (!stats) return null;

  // 2. Normalización: Aseguramos que SIEMPRE sea un array, aunque venga una sola moneda
  const statsList = Array.isArray(stats) ? stats : [stats];

  if (statsList.length === 0) return null;

  // Formateador de dinero
  const formatMoney = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode.toUpperCase(),
      minimumFractionDigits: 2,
      notation: value < 1 ? "standard" : "compact" // Compacto para números grandes ($65k), normal para chicos ($0.50)
    }).format(value);
  };

  return (
    <div style={{ 
        display: 'grid', 
        /* Si es 1 moneda usa 1 columna, si son 2+ usa columnas automáticas */
        gridTemplateColumns: statsList.length > 1 ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr', 
        gap: '10px', 
        marginTop: '10px',
        width: '100%'
    }}>
      
      {statsList.map((coin, index) => {
          const isPositive = coin.price_change_24h >= 0;
          const changeColor = isPositive ? '#10b981' : '#ef4444';
          const arrow = isPositive ? '▲' : '▼';

          return (
            <div key={index} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(30, 41, 59, 0.7)', // Fondo semitransparente
              padding: '15px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.05)',
              backdropFilter: 'blur(5px)'
            }}>
              
              {/* Lado Izquierdo: Icono y Nombre */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img 
                    src={coin.image} 
                    alt={coin.name} 
                    style={{ width: '32px', height: '32px', borderRadius: '50%' }} 
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 'bold', color: 'white', fontSize: '0.95rem' }}>{coin.name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>{coin.symbol}</span>
                </div>
              </div>

              {/* Lado Derecho: Precio y Porcentaje */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>
                    {formatMoney(coin.current_price)}
                </div>
                <div style={{ fontSize: '0.85rem', color: changeColor, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                    <span>{arrow} {Math.abs(coin.price_change_24h).toFixed(2)}%</span>
                </div>
              </div>

            </div>
          );
      })}
    </div>
  );
};

export default CryptoStats;