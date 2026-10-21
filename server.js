const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

function leerBD() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            return { perfiles: {}, boletos: [], otps: {} };
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return { perfiles: {}, boletos: [], otps: {} };
    }
}

function guardarBD(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error("Error al guardar en database.json", e);
    }
}

// 1. Registro con Contraseña y Código OTP
app.post('/api/auth/register', (req, res) => {
    const { nombreCompleto, correo, pasaporte, password } = req.body;
    const db = leerBD();

    // Verificar si el correo ya existe
    const existe = Object.values(db.perfiles).find(p => p.correo === correo);
    if (existe) {
        return res.status(400).json({ status: "ERROR", mensaje: "El correo ya está registrado" });
    }

    const userId = "USR-" + Math.floor(1000 + Math.random() * 9000);
    const otpCodigo = Math.floor(100000 + Math.random() * 900000).toString();

    const nuevoPerfil = {
        id: userId,
        nombreCompleto,
        correo,
        pasaporte,
        password, // En producción se usa bcrypt
        verificado: false
    };

    db.perfiles[userId] = nuevoPerfil;
    if (!db.otps) db.otps = {};
    db.otps[correo] = otpCodigo;

    guardarBD(db);

    console.log(`[AUTH] Usuario registrado: ${correo}. Código OTP enviado: ${otpCodigo}`);
    res.json({
        status: "OK",
        mensaje: "Código de verificación enviado al correo",
        usuarioId: userId,
        otpSimulado: otpCodigo // Se retorna para fácil prueba en la app
    });
});

// 2. Verificación de Código OTP
app.post('/api/auth/verify-otp', (req, res) => {
    const { correo, otp } = req.body;
    const db = leerBD();

    if (db.otps && db.otps[correo] === otp) {
        // Marcar usuario como verificado
        const userKey = Object.keys(db.perfiles).find(k => db.perfiles[k].correo === correo);
        if (userKey) {
            db.perfiles[userKey].verificado = true;
            delete db.otps[correo];
            guardarBD(db);
            return res.json({ status: "OK", perfil: db.perfiles[userKey] });
        }
    }

    res.status(400).json({ status: "ERROR", mensaje: "Código de verificación incorrecto" });
});

// 3. Iniciar Sesión con Correo y Contraseña
app.post('/api/auth/login', (req, res) => {
    const { correo, password } = req.body;
    const db = leerBD();

    const usuario = Object.values(db.perfiles).find(p => p.correo === correo && p.password === password);

    if (usuario) {
        console.log(`[AUTH] Inicio de sesión exitoso: ${correo}`);
        res.json({ status: "OK", perfil: usuario });
    } else {
        res.status(401).json({ status: "ERROR", mensaje: "Correo o contraseña incorrectos" });
    }
});

// 4. Vuelos, Asientos, Reservas y Validación QR
app.get('/api/vuelos', (req, res) => {
    res.json({
        status: "OK",
        vuelos: [
            { id: "AZ496", origen: "CIUDAD DE MÉXICO", destino: "PARÍS", hora: "10:30", precio: 18000.0, aerolinea: "Aeropuerto Zero", aeronave: "Boeing 787-9 Dreamliner" },
            { id: "AZ882", origen: "GUADALAJARA", destino: "TOKIO", hora: "18:30", precio: 18000.0, aerolinea: "Aeropuerto Zero", aeronave: "Boeing 737-800" }
        ]
    });
});

app.get('/api/vuelos/:id/asientos', (req, res) => {
    const db = leerBD();
    const asientos = [];
    for (let f = 1; f <= 18; f++) {
        let clase = "Turista";
        if (f <= 3) clase = "Primera Clase";
        else if (f <= 8) clase = "Ejecutiva";

        for (let l of ['A', 'B', 'C', 'D']) {
            const num = `${f}${l}`;
            const ocupado = db.boletos.some(b => b.vueloId === req.params.id && b.asientos.includes(num));
            asientos.push({ numero: num, ocupado: ocupado, clase: clase });
        }
    }
    res.json({ status: "OK", vueloId: req.params.id, mapaAsientos: asientos });
});

app.post('/api/perfil', (req, res) => {
    const perfil = req.body;
    const db = leerBD();
    db.perfiles[perfil.id] = perfil;
    guardarBD(db);
    res.json({ status: "OK", mensaje: "Perfil sincronizado correctamente" });
});

app.get('/api/perfil/:id', (req, res) => {
    const db = leerBD();
    const perfil = db.perfiles[req.params.id];
    if (perfil) {
        res.json(perfil);
    } else {
        res.status(404).json({ status: "NOT_FOUND", mensaje: "Perfil no encontrado" });
    }
});

app.post('/api/vuelos/reservar', (req, res) => {
    const { boletoDetalle } = req.body;
    const db = leerBD();

    if (boletoDetalle) {
        db.boletos.push(boletoDetalle);
        guardarBD(db);
    }

    res.json({ status: "OK", mensaje: "Boleto guardado y sincronizado" });
});

app.get('/api/boletos/usuario/:usuarioId', (req, res) => {
    const db = leerBD();
    const misBoletos = db.boletos.filter(b => b.usuarioId === req.params.usuarioId);
    res.json({ status: "OK", boletos: misBoletos });
});

app.get('/api/boletos/validar/:codigoReserva', (req, res) => {
    const { codigoReserva } = req.params;
    const db = leerBD();
    const boleto = db.boletos.find(b => b.codigoReserva === codigoReserva);

    if (boleto) {
        res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Validación de Boleto - Aeropuerto Zero</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #070E23; color: white; text-align: center; padding: 20px; }
                    .card { background: #141E38; max-width: 450px; margin: 0 auto; border-radius: 20px; padding: 25px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #00B4D8; }
                    h1 { color: #00B4D8; margin-bottom: 5px; font-size: 24px; }
                    .status { color: #2E7D32; background: rgba(46, 125, 50, 0.2); padding: 8px; border-radius: 10px; font-weight: bold; display: inline-block; margin-bottom: 15px; }
                    .data-row { text-align: left; margin: 12px 0; border-bottom: 1px solid #2A3A5E; padding-bottom: 8px; }
                    .label { color: #888; font-size: 11px; text-transform: uppercase; font-weight: bold; }
                    .value { font-size: 16px; font-weight: bold; color: #FFF; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>AEROPUERTO ZERO</h1>
                    <p style="color: #5BC0BE; font-size: 12px; margin-top: 0;">Sistema Oficial de Validación</p>
                    <div class="status">✔ BOLETO OFICIAL VALIDADO EN NUBE</div>
                    <div class="data-row"><div class="label">Pasajero</div><div class="value">${boleto.pasajero}</div></div>
                    <div class="data-row"><div class="label">Vuelo & Ruta</div><div class="value">${boleto.vueloId} (${boleto.codigoOrigen} ➔ ${boleto.codigoDestino})</div></div>
                    <div class="data-row"><div class="label">Asientos</div><div class="value" style="color: #00B4D8;">${boleto.asientos}</div></div>
                    <div class="data-row"><div class="label">Código de Reserva</div><div class="value">${boleto.codigoReserva}</div></div>
                </div>
            </body>
            </html>
        `);
    } else {
        res.send(`<h1 style="color: white; text-align: center;">Boleto Válido - Reserva ${codigoReserva}</h1>`);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Aeropuerto Zero activo en puerto ${PORT}`));
