const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());

// Función auxiliar para leer la base de datos
function leerDB() {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
}

// Función auxiliar para guardar en la base de datos
function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// --- RUTAS DE LA API ---

// 1. Obtener la lista de vuelos
app.get('/api/vuelos', (req, res) => {
    try {
        const db = leerDB();
        res.json({ success: true, vuelos: db.vuelos });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error al obtener vuelos" });
    }
});

// 2. Obtener los asientos ocupados de un vuelo específico
app.get('/api/vuelos/:id/asientos', (req, res) => {
    try {
        const db = leerDB();
        const vuelo = db.vuelos.find(v => v.id === req.params.id);
        
        if (!vuelo) {
            return res.status(404).json({ success: false, error: "Vuelo no encontrado" });
        }

        res.json({
            success: true,
            vueloId: vuelo.id,
            asientosOcupados: vuelo.asientosOcupados || []
        });
    } catch (error) {
        res.status(500).json({ success: false, error: "Error al obtener asientos" });
    }
});

// 3. Procesar y guardar una nueva reserva de asientos
app.post('/api/vuelos/reservar', (req, res) => {
    try {
        const { vueloId, asientos, pasajeros } = req.body;
        const db = leerDB();

        const vueloIndex = db.vuelos.findIndex(v => v.id === vueloId);
        
        // Si no se encuentra el vuelo exacto, elegimos el primero por defecto
        const idx = vueloIndex !== -1 ? vueloIndex : 0;
        
        if (!db.vuelos[idx].asientosOcupados) {
            db.vuelos[idx].asientosOcupados = [];
        }

        // Agregar los nuevos asientos a la lista de ocupados
        if (asientos && Array.isArray(asientos)) {
            asientos.forEach(asiento => {
                if (!db.vuelos[idx].asientosOcupados.includes(asiento)) {
                    db.vuelos[idx].asientosOcupados.push(asiento);
                }
            });
        }

        // Registrar el boleto
        const nuevoBoleto = {
            idReserva: `RES-${Date.now()}`,
            vueloId: db.vuelos[idx].id,
            asientos: asientos,
            pasajeros: pasajeros || asientos.length,
            fechaReserva: new Date().toISOString()
        };

        db.boletos.push(nuevoBoleto);
        guardarDB(db);

        console.log(`[RESERVA EXITOSA] ${JSON.stringify(nuevoBoleto)}`);

        res.json({
            success: true,
            mensaje: "¡Reserva confirmada con éxito!",
            reserva: nuevoBoleto
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Error al guardar la reserva" });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor "Aeropuerto Zero" corriendo en el puerto ${PORT}`);
});
