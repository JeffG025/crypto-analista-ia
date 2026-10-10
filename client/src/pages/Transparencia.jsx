import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { signalsAPI } from '../utils/api';

// Resultados del backtest del 4 de agosto de 2026. Son fijos a propósito: correrlo
// pide 5 años de velas de Binance, demasiado para una petición web. Se reproduce con
// `node scripts/backtest-binance.js` en el repo.
const ESTUDIO_FECHA = '4 de agosto de 2026';

const REGIMENES = [
    { nombre: 'Mercado alcista (BTC sobre su SMA200)', ops: 417, senal: '49.9%', base: '48.1%', ventaja: '+1.7 pts', z: '0.61' },
    { nombre: 'Mercado bajista (BTC bajo su SMA200)', ops: 454, senal: '46.3%', base: '48.0%', ventaja: '−1.7 pts', z: '−0.61' },
];

function Stat({ valor, etiqueta, nota }) {
    return (
        <div className="transp-stat">
            <span className="transp-stat-value">{valor}</span>
            <span className="transp-stat-label">{etiqueta}</span>
            {nota && <span className="transp-stat-note">{nota}</span>}
        </div>
    );
}

export default function Transparencia() {
    const [stats, setStats] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        document.title = 'Transparencia — CryptoMind';
        return () => { document.title = 'CryptoMind — Señales y Análisis Crypto con IA en Español'; };
    }, []);

    useEffect(() => {
        signalsAPI.public()
            .then(res => setStats(res.data.stats))
            .catch(() => setError(true));
    }, []);

    const pctOrDash = (v) => (v === null || v === undefined ? '—' : `${v}%`);

    return (
        <div className="legal-page">
            <nav className="landing-nav">
                <Link to="/" className="brand-logo" style={{ marginBottom: 0, textDecoration: 'none' }}>
                    <span className="logo-icon" style={{ fontSize: 22 }}>₿</span>
                    <span className="logo-text" style={{ fontSize: 18 }}>CryptoMind</span>
                </Link>
                <Link to="/" className="landing-login-btn">← Volver</Link>
            </nav>

            <article className="legal-content">
                <h1>Transparencia</h1>
                <p className="legal-updated">
                    Casi ninguna herramienta de señales publica qué tan seguido acierta. Aquí está la nuestra,
                    incluyendo lo que no nos conviene.
                </p>

                <h2>1. Rendimiento real, medido en vivo</h2>
                <p>
                    Cada señal que publica el scanner queda registrada con su precio de entrada. Siete días después
                    se compara contra el precio real y se marca como acierto o fallo. Estos números salen de esa
                    base de datos y se actualizan solos — no los escribimos a mano.
                </p>

                {error && <p className="transp-error">No se pudieron cargar las estadísticas en este momento.</p>}

                {stats && (
                    <>
                        <div className="transp-stats-grid">
                            <Stat valor={stats.total} etiqueta="Señales publicadas" />
                            <Stat valor={stats.evaluated} etiqueta="Ya evaluadas" nota={`horizonte ${stats.horizonDays} días`} />
                            <Stat valor={pctOrDash(stats.hitRate)} etiqueta="Tasa de acierto" nota="dirección correcta" />
                        </div>

                        <table className="transp-table">
                            <thead>
                                <tr>
                                    <th>Tipo de señal</th>
                                    <th>Evaluadas</th>
                                    <th>Aciertos</th>
                                    <th>Tasa</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>🟢 Alcistas</td>
                                    <td>{stats.bullish.evaluated}</td>
                                    <td>{stats.bullish.hits}</td>
                                    <td>{pctOrDash(stats.bullish.hitRate)}</td>
                                </tr>
                                <tr>
                                    <td>🔴 Bajistas</td>
                                    <td>{stats.bearish.evaluated}</td>
                                    <td>{stats.bearish.hits}</td>
                                    <td>{pctOrDash(stats.bearish.hitRate)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </>
                )}

                <h2>2. Qué significa el % de concordancia</h2>
                <p>
                    En el análisis técnico verás un número llamado <strong>Concordancia</strong>. Mide únicamente
                    <strong> qué tan de acuerdo están los indicadores entre sí</strong> (RSI, MACD, Bollinger y medias
                    móviles apuntando en la misma dirección).
                </p>
                <p className="transp-callout">
                    ⚠️ <strong>La concordancia no es una tasa de acierto.</strong> No sale de ningún historial. Que
                    una señal muestre 70% de concordancia no significa que acierte el 70% de las veces. La tasa de
                    acierto real es la de la sección 1.
                </p>
                <p>
                    Antes ese campo se llamaba "Fiabilidad", lo cual se prestaba a confusión. Lo renombramos en
                    agosto de 2026 al detectar el problema.
                </p>

                <h2>3. Auditamos nuestro propio sistema. No pasó la prueba.</h2>
                <p>
                    El {ESTUDIO_FECHA} sometimos la señal técnica a un backtest con <strong>5 años de datos
                    diarios</strong> (2021–2026), 10 criptomonedas y <strong>16,180 observaciones</strong>, calculando
                    la señal con solo la información disponible en cada fecha.
                </p>
                <p>
                    La pregunta no era "¿ganó dinero?" sino <strong>"¿lo hizo mejor que comprar en un día
                    cualquiera?"</strong>. Una señal que sube cuando todo el mercado sube no aporta nada.
                </p>

                <h3>El método, fijado antes de ver los resultados</h3>
                <ol className="transp-list">
                    <li>El periodo se partió en dos: 70% antiguo para elegir la mejor configuración, 30% reciente intacto.</li>
                    <li>La configuración ganadora se probó <strong>una sola vez</strong> sobre el periodo intacto.</li>
                    <li>Se usaron ventanas no solapadas, para que cada observación fuera independiente.</li>
                    <li>Criterio de aprobación declarado de antemano: ventaja positiva y significancia estadística (z &gt; 2).</li>
                </ol>

                <h3>El resultado</h3>
                <p className="transp-callout transp-callout-bad">
                    ❌ <strong>No encontramos ventaja predictiva.</strong> La mejor configuración del periodo de
                    calibración rindió <strong>9.8 puntos por debajo</strong> de simplemente comprar en esos mismos
                    días. Ninguna de las 7 configuraciones probadas dio ventaja positiva fuera de muestra.
                </p>

                <p>
                    También probamos la hipótesis más obvia — que la señal falla por operar en mercado a la baja — y
                    la medimos en ambos regímenes:
                </p>

                <table className="transp-table">
                    <thead>
                        <tr>
                            <th>Régimen</th>
                            <th>Ops</th>
                            <th>Señal</th>
                            <th>Comprar siempre</th>
                            <th>Ventaja</th>
                            <th>z</th>
                        </tr>
                    </thead>
                    <tbody>
                        {REGIMENES.map(r => (
                            <tr key={r.nombre}>
                                <td>{r.nombre}</td>
                                <td>{r.ops}</td>
                                <td>{r.senal}</td>
                                <td>{r.base}</td>
                                <td>{r.ventaja}</td>
                                <td>{r.z}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <p>
                    En mercado alcista la señal sale ligeramente mejor, pero con <strong>z = 0.61</strong> — muy por
                    debajo del 2 que haría falta para distinguirlo del azar. La simetría entre ambas filas (+1.7 y
                    −1.7) es la firma de una regla que <strong>hereda la dirección del mercado</strong> en vez de
                    anticiparla.
                </p>

                <h2>4. Entonces, ¿para qué sirve CryptoMind?</h2>
                <p>Con lo anterior sobre la mesa, esto es lo que la herramienta hace bien y lo que no:</p>
                <div className="transp-two-col">
                    <div className="transp-col transp-col-good">
                        <h4>✓ Sirve para</h4>
                        <ul>
                            <li>Ver RSI, MACD, Bollinger y medias calculados correctamente, sin hacerlo a mano</li>
                            <li>Entender qué significa cada indicador, explicado en español claro</li>
                            <li>Recibir alertas cuando una moneda toca el precio que te interesa</li>
                            <li>Seguir el mercado sin instalar nada ni pagar terminales caras</li>
                            <li>Aprender análisis técnico con datos reales</li>
                        </ul>
                    </div>
                    <div className="transp-col transp-col-bad">
                        <h4>✗ No sirve para</h4>
                        <ul>
                            <li>Predecir el precio futuro — nada lo hace de forma confiable</li>
                            <li>Decidir cuándo comprar o vender por ti</li>
                            <li>Sustituir a un asesor financiero autorizado</li>
                            <li>Garantizar rendimientos de ningún tipo</li>
                        </ul>
                    </div>
                </div>

                <h2>5. Reproduce esto tú mismo</h2>
                <p>
                    No te pedimos que nos creas. Los scripts que generaron estos números están en el repositorio,
                    en <code>server/scripts/</code>:
                </p>
                <ul className="transp-list">
                    <li><code>backtest.js</code> — compara la señal contra el baseline</li>
                    <li><code>backtest-filtros.js</code> — prueba filtros de tendencia</li>
                    <li><code>backtest-binance.js</code> — el estudio de 5 años con validación fuera de muestra</li>
                </ul>

                <h2>6. Por qué publicamos esto</h2>
                <p>
                    Publicar que tu propio producto no predice el mercado es mal marketing y buena ingeniería. La
                    alternativa era dejar un número llamado "Fiabilidad" que la gente iba a leer como probabilidad
                    de acierto, y no lo era.
                </p>
                <p>
                    Si alguna vez encontramos una regla con ventaja demostrable, la publicaremos con el mismo rigor
                    con el que publicamos este fracaso.
                </p>

                <p className="transp-final">
                    ⚠️ CryptoMind es una herramienta de análisis e información. Nada de lo aquí publicado es consejo
                    financiero. El mercado de criptomonedas es volátil — invierte solo lo que estés dispuesto a perder.
                </p>
            </article>

            <footer className="landing-footer">
                <p className="landing-copy">
                    <Link to="/terms" className="legal-footer-link">Términos y Condiciones</Link>
                    {' · '}
                    <Link to="/privacy" className="legal-footer-link">Aviso de Privacidad</Link>
                </p>
            </footer>
        </div>
    );
}
