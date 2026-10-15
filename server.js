const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());

// Inicializar la base de datos en archivo si no existe
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        vuelos: [
            {
                id: "VUE-001",
                destino: "Tokio (NRT) - Japón",
                origen: "Ciudad de México (MEX)",
                salida: "2026-10-14T08:00:00Z",
                duracionHoras: 14.5,
                llegadaEstimada: "2026-10-14T22:30:00Z",
                estado: "En Vuelo",
                puerta: "Gate A4",
                avion: "Boeing 777-300ER"
            },
            {
                id: "VUE-002",
                destino: "Madrid (MAD) - España",
                origen: "Ciudad de México (MEX)",
                salida: "2026-10-14T20:00:00Z",
                duracionHoras: 10.0,
                llegadaEstimada: "2026-10-15T06:00:00Z",
                estado: "Abordando",
                puerta: "Gate B2",
                avion: "Airbus A350"
            }
        ],
        boletos: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

// Funciones auxiliares para leer y escribir en disco
function getData() {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

function saveData(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 1. Obtener todos los vuelos (Tablero FIDS)
app.get('/api/vuelos', (req, res) => {
    const db = getData();
    res.json({ success: true, total: db.vuelos.length, vuelos: db.vuelos });
});

// 2. Programar un nuevo vuelo (Torre de Control)
app.post('/api/vuelos', (req, res) => {
    const db = getData();
    const { id, destino, origen, salida, duracionHoras, puerta, avion } = req.body;
    
    const fechaSalida = new Date(salida);
    const llegada = new Date(fechaSalida.getTime() + duracionHoras * 60 * 60 * 1000);

    const nuevoVuelo = {
        id: id || `VUE-00${db.vuelos.length + 1}`,
        destino,
        origen: origen || "Ciudad de México (MEX)",
        salida,
        duracionHoras,
        llegadaEstimada: llegada.toISOString(),
        estado: "Programado",
        puerta: puerta || "Gate C1",
        avion: avion || "Boeing 787 Dreamliner"
    };

    db.vuelos.push(nuevoVuelo);
    saveData(db);
    res.status(201).json({ success: true, mensaje: "Vuelo programado con éxito", vuelo: nuevoVuelo });
});

// 3. Generar Boleto / Check-in con código QR único
app.post('/api/boletos', (req, res) => {
    const db = getData();
    const { pasajero, vueloId, asiento } = req.body;

    const vuelo = db.vuelos.find(v => v.id === vueloId);
    if (!vuelo) {
        return res.status(404).json({ success: false, mensaje: "Vuelo no encontrado en el sistema" });
    }

    const codigoQR = `AEZ-QR-${Math.floor(100000 + Math.random() * 900000)}`;

    const nuevoBoleto = {
        idBoleto: `BOL-${db.boletos.length + 1}`,
        pasajero: pasajero || "Pasajero Anónimo",
        vueloId: vuelo.id,
        destino: vuelo.destino,
        salida: vuelo.salida,
        puerta: vuelo.puerta,
        asiento: asiento || "12A",
        codigoQR,
        estadoAbordaje: "No Abordado"
    };

    db.boletos.push(nuevoBoleto);
    saveData(db);
    res.status(201).json({ success: true, mensaje: "Pase de abordar generado con éxito", boleto: nuevoBoleto });
});

// 4. Consultar boletos emitidos
app.get('/api/boletos', (req, res) => {
    const db = getData();
    res.json({ success: true, total: db.boletos.length, boletos: db.boletos });
});

app.listen(PORT, () => {
    console.log(`✈️ Torre de Control (Persistente) operando en http://localhost:${PORT}`);
});
