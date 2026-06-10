const aiService = require('../services/aiService');
const cryptoService = require('../services/cryptoService');

// Función auxiliar para empaquetar gráficas (MODO SECUENCIAL para evitar bloqueos)
const fetchUnifiedChart = async (coinsList, daysCount, currencyCode) => {
    let labels = [];
    const datasets = [];

    console.log(`📊 Iniciando carga secuencial para: ${coinsList.join(', ')}`);

    // Usamos un bucle for..of para ir UNO POR UNO (CoinGecko bloquea peticiones paralelas)
    for (const coin of coinsList) {
        try {
            console.log(`   ⏳ Descargando datos de: ${coin}...`);
            
            // Obtenemos historial
            const data = await cryptoService.getChartHistory(coin, daysCount, currencyCode);
            
            // Si obtenemos datos válidos
            if (data && data.data && data.data.length > 0) {
                // Guardamos las etiquetas (fechas) de la primera que tenga datos
                if (labels.length === 0 && data.labels.length > 0) {
                    labels = data.labels;
                }
                
                datasets.push({
                    label: coin.toUpperCase(),
                    data: data.data,
                    fill: false,
                    tension: 0.4
                });
                console.log(`   ✅ ${coin} descargado correctamente (${data.data.length} puntos).`);
            } else {
                console.warn(`   ⚠️ ${coin} no devolvió datos.`);
            }

        } catch (err) {
            console.error(`   ❌ Error obteniendo gráfica para ${coin}:`, err.message);
        }
    }

    console.log(`🏁 Carga terminada. Datasets válidos: ${datasets.length}`);

    return {
        labels: labels,
        datasets: datasets
    };
};

const handleChat = async (req, res) => {
    const { message, history, currency = 'usd', isUpdate, coins, days, lang = 'es' } = req.body;

    try {
        // --- 🔄 MODO RÁPIDO (UPDATE) ---
        if (isUpdate && coins) {
             console.log(`🔄 Update rápido: ${coins}`);
             const marketData = await cryptoService.getMarketData(coins, currency);
             
             let chartData = null;
             if (days) {
                 chartData = await fetchUnifiedChart(coins, days, currency);
             }

             return res.json({
                type: 'chart',
                stats: marketData,
                chartData: chartData,
                coins: coins,
                days: days,
                currency: currency
            });
        }

        // --- 🤖 MODO IA (NORMAL) ---
        const aiResponse = await aiService.analyzeIntent(message, history, lang);

        // Si la IA pide gráfica O comparación
        if (aiResponse.type === 'comparison' || aiResponse.type === 'chart') {
            
            // Aseguramos que 'coins' sea siempre un array (por si la IA manda texto)
            let targetCoins = aiResponse.coins;
            if (typeof targetCoins === 'string') {
                targetCoins = [targetCoins];
            }

            if (targetCoins && targetCoins.length > 0) {
                try {
                    // 1. Stats (Precios actuales)
                    const marketData = await cryptoService.getMarketData(targetCoins, currency);
                    aiResponse.stats = marketData;

                    // 2. Gráfica Unificada (Multi-línea)
                    const chartDays = aiResponse.days || (aiResponse.type === 'comparison' ? 30 : 7);
                    
                    const chartData = await fetchUnifiedChart(targetCoins, chartDays, currency);
                    
                    aiResponse.chartData = chartData;
                    
                    // Guardamos metadatos corregidos
                    aiResponse.coins = targetCoins; 
                    aiResponse.days = chartDays;

                } catch (dataError) {
                    console.error("Error datos crypto:", dataError);
                    aiResponse.text += "\n(Hubo un problema técnico generando la imagen).";
                }
            }
        }

        res.json(aiResponse);

    } catch (error) {
        console.error("Error general:", error);
        res.status(500).json({ type: 'text', reply: 'Error interno del servidor.' });
    }
};

module.exports = { handleChat };