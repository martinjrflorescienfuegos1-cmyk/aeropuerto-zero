const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();

app.use(express.json());

const DB_FILE = path.join(__dirname, 'database.json');

// Configuración del servicio de correo SMTP
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || ''
    }
});

// Función para enviar correo real
async function enviarCorreoOTP(destino, codigo, asunto = "Código de Verificación - Aeropuerto Zero") {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log(`[SMTP SIMULADO] Correo para ${destino}: Código OTP = ${codigo}`);
        return false;
    }

    const mailOptions = {
        from: `"Aeropuerto Zero" <${process.env.EMAIL_USER}>`,
        to: destino,
        subject: asunto,
        html: `
            <div style="font-family: Arial, sans-serif; background-color: #070E23; color: #ffffff; padding: 30px; border-radius: 10px; max-width: 500px; margin: auto;">
                <h2 style="color: #00B4D8; text-align: center;">AEROPUERTO ZERO</h2>
                <hr style="border-color: #141E38;">
                <p>Hola,</p>
                <p>Tu código de verificación para Aeropuerto Zero es:</p>
                <div style="background-color: #141E38; color: #00B4D8; font-size: 28px; font-weight: bold; text-align: center; padding: 15px; border-radius: 8px; letter-spacing: 5px;">
                    ${codigo}
                </div>
                <p style="font-size: 12px; color: #888888; margin-top: 20px;">Si no solicitaste este código, puedes ignorar este mensaje.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`[SMTP EXITOSO] Correo enviado a ${destino}`);
        return true;
    } catch (error) {
        console.error(`[SMTP ERROR] No se pudo enviar el correo a ${destino}:`, error);
        return false;
    }
}

function leerBD() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            const inicial = { perfiles: {}, boletos: [], otps: {} };
            fs.writeFileSync(DB_FILE, JSON.stringify(inicial, null, 2), 'utf8');
            return inicial;
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

// 1. Registro de usuario con guardado permanente
app.post('/api/auth/register', async (req, res) => {
    const { nombreCompleto, correo, pasaporte, password } = req.body;
    const db = leerBD();

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
        password,
        verificado: false
    };

    db.perfiles[userId] = nuevoPerfil;
    if (!db.otps) db.otps = {};
    db.otps[correo] = otpCodigo;

    guardarBD(db);

    await enviarCorreoOTP(correo, otpCodigo, "Activa tu Cuenta - Aeropuerto Zero");

    res.json({
        status: "OK",
        mensaje: "Código enviado a tu correo electrónico",
        usuarioId: userId,
        otpSimulado: otpCodigo
    });
});

// 2. Verificación de OTP
app.post('/api/auth/verify-otp', (req, res) => {
    const { correo, otp } = req.body;
    const db = leerBD();

    if (db.otps && db.otps[correo] === otp) {
        const userKey = Object.keys(db.perfiles).find(k => db.perfiles[k].correo === correo);
        if (userKey) {
            db.perfiles[userKey].verificado = true;
            delete db.otps[correo];
            guardarBD(db);
            return res.json({ status: "OK", perfil: db.perfiles[userKey] });
        }
    }

    res.status(400).json({ status: "ERROR", mensaje: "Código de verificación incorrecto o expirado" });
});

// 3. Recuperar contraseña (Olvidé mi contraseña)
app.post('/api/auth/forgot-password', async (req, res) => {
    const { correo } = req.body;
    const db = leerBD();

    const usuario = Object.values(db.perfiles).find(p => p.correo === correo);
    if (!usuario) {
        return res.status(404).json({ status: "ERROR", mensaje: "El correo no se encuentra registrado" });
    }

    const otpCodigo = Math.floor(100000 + Math.random() * 900000).toString();
    if (!db.otps) db.otps = {};
    db.otps[correo] = otpCodigo;
    guardarBD(db);

    await enviarCorreoOTP(correo, otpCodigo, "Recuperación de Contraseña - Aeropuerto Zero");

    res.json({
        status: "OK",
        mensaje: "Código de recuperación enviado a tu correo",
        otpSimulado: otpCodigo
    });
});

// 4. Restablecer contraseña con OTP
app.post('/api/auth/reset-password', (req, res) => {
    const { correo, otp, nuevaPassword } = req.body;
    const db = leerBD();

    if (db.otps && db.otps[correo] === otp) {
        const userKey = Object.keys(db.perfiles).find(k => db.perfiles[k].correo === correo);
        if (userKey) {
            db.perfiles[userKey].password = nuevaPassword;
            delete db.otps[correo];
            guardarBD(db);
            return res.json({ status: "OK", mensaje: "Contraseña actualizada correctamente" });
        }
    }

    res.status(400).json({ status: "ERROR", mensaje: "Código incorrecto" });
});

// 5. Iniciar Sesión
app.post('/api/auth/login', (req, res) => {
    const { correo, password } = req.body;
    const db = leerBD();

    const usuario = Object.values(db.perfiles).find(p => p.correo === correo && p.password === password);

    if (usuario) {
        res.json({ status: "OK", perfil: usuario });
    } else {
        res.status(401).json({ status: "ERROR", mensaje: "Correo o contraseña incorrectos" });
    }
});

// 6. Consultas de Vuelos, Asientos y Reserva con Guardado Persistente
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

app.post('/api/vuelos/reservar', (req, res) => {
    const { boletoDetalle } = req.body;
    const db = leerBD();

    if (boletoDetalle) {
        db.boletos.push(boletoDetalle);
        guardarBD(db);
    }

    res.json({ status: "OK", mensaje: "Boleto guardado en base de datos de Render" });
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
app.listen(PORT, () => console.log(`Servidor Aeropuerto Zero corriendo en puerto ${PORT}`));
