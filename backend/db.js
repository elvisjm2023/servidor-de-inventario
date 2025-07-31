require('dotenv').config();

const { Pool } = require('pg');

// Configuración de la base de datos
const pool = new Pool({
    user: process.env.DB_USER,        //usuario de PostgreSQL
    host: process.env.DB_HOST,       // Host de la base de datos
    database: process.env.DB_NAME, // Nombre de la base de datos
    password: process.env.DB_PASSWORD, //contraseña de PostgreSQL
    port: parseInt(process.env.DB_PORT, 10),  // Puerto de PostgreSQL
    ssl: false,             // Para desarrollo local
    max: 20,                // Máximo número de conexiones
    idleTimeoutMillis: 30000, // Tiempo de espera para conexiones inactivas
    connectionTimeoutMillis: 2000, // Tiempo de espera para establecer conexión
});

// Evento para manejar errores de conexión
pool.on('error', (err, client) => {
    console.error('Error inesperado en el cliente de la base de datos:', err);
    process.exit(-1);
});

// Función para probar la conexión
const testConnection = async () => {
    try {
        const client = await pool.connect();
        console.log('Conexión exitosa a PostgreSQL');
        const result = await client.query('SELECT NOW()');
        console.log('Hora del servidor:', result.rows[0].now);
        client.release();
    } catch (err) {
        console.error('Error al conectar con PostgreSQL:', err.message);
        process.exit(1);
    }
};

// Función helper para ejecutar consultas
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Query ejecutada:', { text, duration: `${duration}ms`, rows: res.rowCount });
        return res;
    } catch (err) {
        console.error('Error en query:', err);
        throw err;
    }
};

// Función para obtener un cliente específico (para transacciones)
const getClient = async () => {
    const client = await pool.connect();
    const originalQuery = client.query;
    const originalRelease = client.release;

    // Agregar logging a las consultas del cliente
    client.query = (...args) => {
        client.lastQuery = args;
        const start = Date.now();
        return originalQuery.apply(client, args).then((res) => {
            const duration = Date.now() - start;
            console.log('Client query ejecutada:', { 
                text: args[0], 
                duration: `${duration}ms`, 
                rows: res.rowCount 
            });
            return res;
        });
    };

    // Agregar timeout a la liberación del cliente
    const timeout = setTimeout(() => {
        console.error('Cliente no liberado después de 5 segundos');
        console.error('Última query:', client.lastQuery);
    }, 5000);

    client.release = () => {
        clearTimeout(timeout);
        client.query = originalQuery;
        client.release = originalRelease;
        return originalRelease.apply(client);
    };

    return client;
};

// Función para cerrar todas las conexiones
const closePool = async () => {
    try {
        await pool.end();
        console.log('🔌 Pool de conexiones cerrado correctamente');
    } catch (err) {
        console.error('Error al cerrar el pool:', err);
    }
};

// Manejo de señales para cerrar conexiones correctamente
process.on('SIGINT', async () => {
    console.log('\nRecibida señal SIGINT. Cerrando conexiones...');
    await closePool();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nRecibida señal SIGTERM. Cerrando conexiones...');
    await closePool();
    process.exit(0);
});

module.exports = {
    pool,
    query,
    getClient,
    testConnection,
    closePool
};