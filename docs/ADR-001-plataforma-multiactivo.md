# ADR-001: De plataforma solo-crypto a plataforma multi-activo

**Estado:** Propuesto
**Fecha:** 2026-08-19
**Decide:** Jeffrey (dev único)

## Contexto

CryptoMind hoy analiza el top 10 de criptomonedas: descarga 200 días de precios de CoinGecko,
calcula indicadores técnicos, emite una señal direccional y la publica en web y Telegram.

Tres fuerzas empujan el cambio:

1. **El backtest del 04-ago-2026** (16.180 observaciones, validación out-of-sample con criterio
   fijado de antemano) demostró que la señal técnica no tiene ventaja predictiva en crypto. El
   producto sigue vendiendo suscripciones sobre esa señal.
2. **Se quiere exponer predicción direccional (sube/baja) con un porcentaje de fiabilidad.** El
   campo anterior (`reliability = 40 + |score|/8*40`) no medía nada: era una transformación del
   propio score. Debe reemplazarse por acierto histórico medido.
3. **Se quiere abrir la vertical de acciones/bolsa**, con el mismo funcionamiento.

**Hallazgo determinante:** `scoreFromPrices(prices)` en `server/src/services/technicalService.js`
es una función pura que recibe `number[]`. Ya es agnóstica al tipo de activo. Lo específico de
crypto se reduce a: (a) `cryptoService` como fuente de datos, (b) las columnas `coin_id` /
`coin_symbol` de la tabla `signals`, (c) la copy y la lista de monedas del cliente.

### Restricciones

| Restricción | Implicación |
|---|---|
| Dev único apoyado en IA | Minimizar superficie operativa; nada de microservicios |
| Render plan free | Cold starts; no depender de estado en memoria del proceso |
| Presupuesto bajo | Solo APIs con tier gratuito viable |
| Ingresos en 1-3 meses | Preferir lo reversible y lo entregable, no lo elegante |
| Mercado angloparlante | La vertical de acciones es la que ese mercado paga |

---

## Decisión

Convertir CryptoMind en **una sola plataforma multi-activo** donde la clase de activo es un
campo, no un producto distinto. Introducir una interfaz `MarketDataProvider`, cachear las series
históricas en Supabase, y sustituir el porcentaje de fiabilidad inventado por una **tabla de
calibración generada por el backtest**, versionada en el repositorio.

---

## Opciones consideradas

### Decisión 1 — ¿Un producto o dos?

#### Opción A: Una plataforma multi-activo *(elegida)*

| Dimensión | Evaluación |
|---|---|
| Complejidad | Baja — el motor ya es agnóstico |
| Coste | Sin cambio (un Render, un Vercel, una Supabase) |
| Escalabilidad | Añadir una clase de activo = un provider nuevo |
| Familiaridad | Total; es el código que ya existe |

**A favor:** el motor no se toca. Una sola suscripción Stripe cubre crypto y acciones, lo que
sube el ARPU en vez de partir la audiencia. La marca pasa a ser el *método* (calibración honesta),
no el activo. Un solo deploy que mantener.

**En contra:** el nombre "CryptoMind" deja de describir el producto. Riesgo de que la UI se
vuelva confusa si las dos clases de activo no se separan bien en la navegación.

#### Opción B: Dos productos separados con un paquete núcleo compartido

**A favor:** cada marca habla a su audiencia; SEO más limpio por vertical.

**En contra:** duplica deploys, dominios, webhooks de Stripe, bots y monitoreo — para un dev
único en plan free es el coste dominante. Obliga a extraer un paquete compartido y versionarlo
antes de poder entregar nada. Contradice la restricción de 1-3 meses.

#### Opción C: Congelar crypto y arrancar acciones desde cero

**En contra:** tira a la basura auth, roles, Stripe, alertas, i18n, el bot y la infraestructura de
backtest — que es justamente el activo diferenciador. Descartada sin discusión.

---

### Decisión 2 — Abstracción de fuente de datos

Se introduce una interfaz mínima, deliberadamente estrecha:

```js
// server/src/providers/types.js  (contrato, no clase)
// getPriceSeries(symbol, days) -> Promise<number[]>   cierres ajustados, orden cronológico
// getQuote(symbol)             -> Promise<{ price, change24h, currency }>
// listUniverse()               -> Promise<Array<{ symbol, name }>>
// meta                         -> { assetClass, tradingCalendar }
```

`cryptoProvider` envuelve el `cryptoService` actual sin cambios de comportamiento.
`equityProvider` es nuevo.

**Sobre el proveedor de acciones:** los límites de los tiers gratuitos cambian a menudo y no debo
darlos por ciertos de memoria — hay que verificarlos antes de elegir. Los candidatos y el criterio:

| Proveedor | Para qué sirve aquí | A verificar |
|---|---|---|
| Financial Modeling Prep | Histórico EOD + fundamentales en una sola API | Límite diario del tier free |
| Twelve Data | Histórico EOD, buena cobertura | Límite diario y si el free cubre `adjusted` |
| Finnhub | Cotizaciones y perfiles | Si el histórico está en el tier free |
| Stooq | CSV EOD sin API key, cero fricción | Cobertura de tickers y estabilidad |
| SEC EDGAR | Fundamentales reales (10-K/10-Q) | Gratis y oficial, pero parsear filings es fase 2 |

**Criterio de selección:** histórico diario ajustado por splits y dividendos de ≥250 sesiones, para
un universo fijo de ~20 tickers. No hace falta tiempo real — los datos con retraso son más baratos
y no cambian el análisis en horizontes de 7 días.

**La pieza que quita la dependencia del proveedor:** cachear las series en Supabase.

```sql
create table if not exists price_series (
    asset_class text not null,
    symbol      text not null,
    session_date date not null,
    close_adj   numeric not null,
    primary key (asset_class, symbol, session_date)
);
```

Un job diario descarga solo las sesiones que faltan. El scanner y el backtest leen de Supabase,
nunca del proveedor. Esto hace que el rate limit del tier gratuito sea irrelevante, que cambiar de
proveedor sea un cambio de una sola función, y que el backtest sea reproducible sobre datos fijos
en vez de depender de lo que devuelva la API ese día.

---

### Decisión 3 — Persistencia de la tabla de calibración

Es el corazón del "porcentaje de fiabilidad". Debe salir de medir el historial, no de una fórmula.

`server/scripts/backtest.js` **ya calcula** acierto por tipo de señal, tamaño de muestra, baseline
y edge (líneas 120-145). Hoy solo lo imprime en consola. Hay que persistirlo.

#### Opción A: Archivo JSON en el repositorio *(elegida)*

```json
{
  "generatedAt": "2026-08-19",
  "crypto": {
    "h7": {
      "baseline": { "upRate": 54.1, "n": 16180 },
      "buckets": {
        "ALCISTA FUERTE": { "hitRate": 52.5, "n": 1612, "edge": -1.6, "ci95": 2.4 }
      }
    }
  }
}
```

**A favor:** es dato de referencia estático que solo cambia cuando se vuelve a correr el backtest.
Vivir en git da historial de cuándo cambió la calibración y por qué. Sin round-trip a la base de
datos, sin problemas por cold start de Render. Lo leen igual la API y los scripts.

**En contra:** regenerarlo exige un deploy. Aceptable: recalibrar es un evento deliberado y raro,
no algo continuo.

#### Opción B: Tabla en Supabase

**A favor:** actualizable sin deploy; permitiría recalibración continua.
**En contra:** una consulta más en la ruta caliente, y quita la trazabilidad en git de un número
que es una afirmación pública sobre el producto. Se adopta solo si más adelante se quiere
recalibración automática.

**Regla de integridad, no negociable:** si un bucket tiene `n` bajo o el intervalo de confianza
cruza el baseline, la UI muestra el número **junto al baseline y al tamaño de muestra**, nunca
solo. Un "52%" desnudo se lee como probabilidad de acierto; "52% frente a un mercado que subió
54% de las veces, sobre 1.612 casos" se lee como lo que es.

---

### Decisión 4 — Cambios de esquema

Aditivos, sin renombrar nada:

```sql
alter table signals add column if not exists asset_class text not null default 'crypto';
```

`coin_id` y `coin_symbol` conservan el nombre y pasan a significar "identificador del activo".
Renombrarlos es churn sin beneficio visible. La columna `reliability`, que hasta ahora guardaba
un número sin significado, pasa por fin a guardar el acierto medido — el nombre se vuelve honesto
sin tocar el esquema.

---

## Análisis de trade-offs

El trade-off central es **superficie operativa contra claridad de marca**. La Opción B (dos
productos) daría marcas más nítidas, pero el coste recae entero sobre un dev único en tiers
gratuitos con un plazo de 1-3 meses. La Opción A concentra todo el riesgo en un solo punto —
la navegación de la UI — que es el más barato de corregir.

El segundo trade-off es **precisión contra honestidad en el número de fiabilidad**. La versión
inventada podía mostrar 80% y vendía mejor. La versión medida probablemente muestre ~50% en
crypto. Se elige la medida: ya está publicado en la página de Transparencia que la señal no tiene
ventaja, y sostener dos números contradictorios en el mismo producto es insostenible frente a un
usuario que paga.

---

## Consecuencias

**Se vuelve más fácil**
- Añadir una tercera clase de activo: implementar un provider y correr el backtest.
- Cambiar de proveedor de datos: una sola función, gracias a la caché en Supabase.
- Defender el producto: cada porcentaje tiene detrás una muestra y un baseline.

**Se vuelve más difícil**
- Vender la promesa. La fiabilidad medida no dará números espectaculares.
- El calendario bursátil: las acciones no cotizan 24/7. El scanner de 6h y los cálculos de
  horizonte deben contar sesiones, no días naturales — festivos y fines de semana rompen la
  aritmética actual.
- Los datos de acciones exigen **cierre ajustado** por splits y dividendos. Con precios sin
  ajustar, un split de 4:1 aparece como una caída del 75% y envenena todos los indicadores.

**Hay que revisitar**
- Si el backtest de acciones tampoco encuentra ventaja, la propuesta de valor deja de ser la
  señal y pasa a ser el research (resúmenes de filings, qué cambió trimestre a trimestre). Vale
  la pena decidirlo **después** de ver el número, no antes.
- Encuadre regulatorio: análisis general y educativo, nunca recomendación personalizada. En
  EE.UU. el consejo de inversión personalizado exige registro como RIA.
- El nombre. "CryptoMind" deja de describir el producto en cuanto entra bolsa.

---

## Plan de acción

1. [ ] **Persistir la calibración.** Hacer que `backtest.js` emita `server/data/calibration.json`
       con acierto, n, baseline, edge e IC95 por bucket y horizonte.
2. [ ] **Sustituir `agreement` por `reliability` medida** en `technicalService.js`, leyendo la
       tabla de calibración. Exponer `direction`, `reliability`, `baseline`, `sampleSize`.
3. [ ] **UI de la predicción**: dirección + fiabilidad, siempre acompañada de baseline y muestra.
4. [ ] **Extraer `MarketDataProvider`** y reescribir `cryptoService` como `cryptoProvider`, sin
       cambio de comportamiento.
5. [ ] **Tabla `price_series` + job diario de ingesta.**
6. [ ] **Elegir proveedor de acciones** verificando límites actuales del tier gratuito.
7. [ ] **`equityProvider`** con cierre ajustado y calendario de sesiones.
8. [ ] **Correr el backtest sobre acciones** y publicar el resultado, salga lo que salga.
9. [ ] **Rebrand de nombre y navegación** una vez exista la segunda clase de activo.
