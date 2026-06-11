import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const UPDATED = '10 de junio de 2026';
const BOT = '@cryptomind_analista_bot';

function LegalShell({ title, children }) {
    useEffect(() => {
        document.title = `${title} — CryptoMind`;
        return () => { document.title = 'CryptoMind — Señales y Análisis Crypto con IA en Español'; };
    }, [title]);
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
                <h1>{title}</h1>
                <p className="legal-updated">Última actualización: {UPDATED}</p>
                {children}
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

export function Terms() {
    return (
        <LegalShell title="Términos y Condiciones">
            <h2>1. Aceptación</h2>
            <p>
                Al crear una cuenta o utilizar CryptoMind (la "Plataforma"), incluyendo el sitio web y el bot
                de Telegram {BOT}, aceptas estos Términos y Condiciones. Si no estás de acuerdo, no utilices el servicio.
                Debes ser mayor de 18 años para usar la Plataforma.
            </p>

            <h2>2. Descripción del servicio</h2>
            <p>
                CryptoMind es una <strong>herramienta de software de análisis e información</strong> sobre el mercado de
                criptomonedas: indicadores técnicos (RSI, MACD, Bandas de Bollinger, medias móviles), gráficas,
                señales informativas generadas automáticamente por software, alertas de precio y contenido generado
                por inteligencia artificial.
            </p>
            <p>
                CryptoMind <strong>NO</strong> es una casa de bolsa, exchange, asesor de inversiones ni entidad financiera.
                <strong> No ejecutamos operaciones de compraventa, no custodiamos fondos ni criptomonedas, no vendemos
                criptoactivos y no ofrecemos asesoría financiera personalizada.</strong>
            </p>

            <h2>3. Aviso de riesgo — léelo con atención</h2>
            <p>
                El mercado de criptomonedas es <strong>extremadamente volátil</strong>. Toda la información publicada en
                la Plataforma (señales, predicciones, análisis IA, indicadores, historial de señales) tiene fines
                <strong> exclusivamente informativos y educativos</strong>:
            </p>
            <ul>
                <li>Ninguna señal o análisis constituye una recomendación de inversión.</li>
                <li>Las señales pueden fallar. El rendimiento pasado no garantiza resultados futuros.</li>
                <li>Cualquier decisión de inversión que tomes es <strong>tu exclusiva responsabilidad</strong>.</li>
                <li>Nunca inviertas dinero que no estés dispuesto a perder.</li>
            </ul>

            <h2>4. Cuentas</h2>
            <p>
                Te comprometes a proporcionar información veraz al registrarte y a mantener la confidencialidad de tus
                credenciales. Eres responsable de toda actividad realizada desde tu cuenta. Podemos suspender o eliminar
                cuentas que violen estos términos.
            </p>

            <h2>5. Planes, pagos y cancelación</h2>
            <ul>
                <li>El plan <strong>Free</strong> es gratuito y tiene límites de uso (consultas diarias, número de alertas, funciones restringidas).</li>
                <li>El plan <strong>Premium</strong> es una suscripción mensual de <strong>$99 MXN</strong> (precio con impuestos incluidos), procesada de forma segura por <strong>Stripe</strong>. CryptoMind no almacena los datos de tu tarjeta.</li>
                <li>La suscripción se <strong>renueva automáticamente</strong> cada mes hasta que la canceles.</li>
                <li>Puedes cancelar en cualquier momento; mantendrás el acceso Premium hasta el final del periodo ya pagado. No se otorgan reembolsos proporcionales por periodos parciales.</li>
                <li>Los cargos erróneos o duplicados se revisan caso por caso — contáctanos.</li>
                <li>Los precios pueden cambiar; te notificaremos con anticipación y aplicarán a partir del siguiente periodo de facturación.</li>
            </ul>

            <h2>6. Uso aceptable</h2>
            <p>Está prohibido:</p>
            <ul>
                <li>Revender, redistribuir o publicar masivamente el contenido de la Plataforma (incluyendo señales Premium).</li>
                <li>Usar bots, scrapers o accesos automatizados no autorizados.</li>
                <li>Intentar vulnerar la seguridad, sobrecargar el servicio o acceder a cuentas de terceros.</li>
                <li>Usar la Plataforma para actividades ilícitas.</li>
            </ul>

            <h2>7. Propiedad intelectual</h2>
            <p>
                El software, diseño, marca y contenidos de CryptoMind son propiedad de su operador. Se te otorga una
                licencia personal, limitada y no transferible para usar la Plataforma. Los datos de mercado provienen
                de fuentes de terceros (CoinGecko, Alternative.me) y pertenecen a sus respectivos titulares.
            </p>

            <h2>8. Disponibilidad del servicio</h2>
            <p>
                La Plataforma se ofrece "tal cual" y "según disponibilidad". Dependemos de servicios de terceros
                (proveedores de datos, hosting, Telegram, procesadores de pago), por lo que no garantizamos
                disponibilidad ininterrumpida, ausencia de errores ni exactitud de los datos de mercado. Podemos
                modificar o descontinuar funciones notificándolo razonablemente.
            </p>

            <h2>9. Limitación de responsabilidad</h2>
            <p>
                En la máxima medida permitida por la ley: CryptoMind no será responsable por pérdidas de inversión,
                lucro cesante, pérdida de datos ni daños indirectos derivados del uso de la Plataforma. En cualquier
                caso, la responsabilidad total acumulada se limita al monto que hayas pagado por el servicio en los
                últimos 3 meses.
            </p>

            <h2>10. Modificaciones</h2>
            <p>
                Podemos actualizar estos términos. Publicaremos la versión vigente en esta página con su fecha de
                actualización; el uso continuado del servicio implica su aceptación.
            </p>

            <h2>11. Ley aplicable</h2>
            <p>
                Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia se
                someterá a los tribunales competentes de México.
            </p>

            <h2>12. Contacto</h2>
            <p>
                Para dudas, soporte, facturación o reclamaciones: escríbenos por Telegram a {BOT}.
            </p>
        </LegalShell>
    );
}

export function Privacy() {
    return (
        <LegalShell title="Aviso de Privacidad">
            <p>
                En cumplimiento de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares
                (LFPDPPP), el operador de CryptoMind (el "Responsable") pone a tu disposición el presente Aviso de
                Privacidad respecto de los datos personales recabados a través del sitio web y el bot de Telegram {BOT}.
            </p>

            <h2>1. Datos personales que recabamos</h2>
            <ul>
                <li><strong>De identificación y contacto:</strong> nombre y correo electrónico (al registrarte); foto de perfil si inicias sesión con Google.</li>
                <li><strong>De tu cuenta de Telegram:</strong> identificador numérico y nombre de usuario, únicamente si decides vincularla.</li>
                <li><strong>De uso del servicio:</strong> alertas configuradas, monedas de interés (watchlist), preferencias (idioma, tema, divisa) y consultas realizadas al asistente.</li>
                <li><strong>De pago:</strong> los pagos se procesan directamente por <strong>Stripe</strong>. CryptoMind <strong>no recibe ni almacena</strong> números de tarjeta; solo conservamos el estado de tu suscripción y un identificador de cliente de Stripe.</li>
            </ul>
            <p>No recabamos datos personales sensibles.</p>

            <h2>2. Finalidades del tratamiento</h2>
            <p><strong>Primarias (necesarias para el servicio):</strong></p>
            <ul>
                <li>Crear y administrar tu cuenta; autenticarte.</li>
                <li>Prestar las funciones de la Plataforma: análisis, alertas de precio, notificaciones por Telegram, asistente IA.</li>
                <li>Procesar tu suscripción y cobros a través de Stripe.</li>
                <li>Enviarte correos transaccionales (por ejemplo, recuperación de contraseña).</li>
                <li>Brindarte soporte.</li>
            </ul>
            <p><strong>Secundarias:</strong> mejorar el servicio y elaborar estadísticas de uso de forma agregada. Puedes oponerte a estas finalidades contactándonos.</p>

            <h2>3. Encargados y transferencias</h2>
            <p>
                Para operar utilizamos proveedores que tratan datos por cuenta del Responsable, algunos ubicados en el
                extranjero (principalmente EE. UU.):
            </p>
            <ul>
                <li><strong>Supabase</strong> — base de datos.</li>
                <li><strong>Stripe</strong> — procesamiento de pagos.</li>
                <li><strong>Google</strong> — inicio de sesión opcional (OAuth).</li>
                <li><strong>Telegram</strong> — entrega de mensajes y alertas del bot.</li>
                <li><strong>Brevo</strong> — envío de correos transaccionales.</li>
                <li><strong>Render y Vercel</strong> — alojamiento de la aplicación.</li>
            </ul>
            <p>
                Estos proveedores actúan conforme a sus propias políticas de privacidad y a las instrucciones del
                Responsable. No vendemos ni compartimos tus datos con terceros para fines publicitarios.
            </p>

            <h2>4. Cookies y almacenamiento local</h2>
            <p>
                Utilizamos almacenamiento local del navegador (localStorage) para mantener tu sesión iniciada y guardar
                tus preferencias de interfaz. No utilizamos cookies publicitarias ni rastreadores de terceros.
            </p>

            <h2>5. Derechos ARCO</h2>
            <p>
                Tienes derecho a <strong>A</strong>cceder, <strong>R</strong>ectificar, <strong>C</strong>ancelar u
                <strong> O</strong>ponerte al tratamiento de tus datos, así como a revocar tu consentimiento. Puedes
                ejercerlos contactándonos por Telegram en {BOT}, indicando tu correo registrado y el derecho que deseas
                ejercer. Responderemos en los plazos previstos por la LFPDPPP. Asimismo, puedes rectificar tu nombre y
                eliminar tus alertas directamente desde tu perfil en la Plataforma.
            </p>
            <p>
                Si consideras que tu derecho a la protección de datos ha sido vulnerado, puedes acudir al INAI
                (Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales).
            </p>

            <h2>6. Conservación y seguridad</h2>
            <p>
                Conservamos tus datos mientras tu cuenta exista y durante los plazos legales aplicables. Aplicamos
                medidas de seguridad administrativas y técnicas: cifrado de las comunicaciones (HTTPS), contraseñas
                almacenadas con hash criptográfico y acceso restringido a la base de datos.
            </p>

            <h2>7. Cambios a este aviso</h2>
            <p>
                Cualquier modificación a este Aviso de Privacidad se publicará en esta página indicando la fecha de
                última actualización.
            </p>
        </LegalShell>
    );
}
