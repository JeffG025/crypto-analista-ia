const express = require('express');
const cors = require('cors');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

app.use(cors());
app.use(express.json());
// Ruta de prueba para la página de inicio
app.get('/', (req, res) => {
    res.send('<h1>¡El Backend está vivo! 🚀</h1><p>El cerebro de tu IA está esperando órdenes.</p>');
});
// Rutas
app.use('/api/chat', chatRoutes);

module.exports = app;