require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, testConnection } = require('./db');

// Crear la aplicación Express
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'UTM.ti.2021'; // clave creada usando .env

// Middlewares
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'], // Frontend URLs
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Middleware para logging de requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`🌐 ${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Middleware para verificar JWT
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Token de acceso requerido' 
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                message: 'Token inválido o expirado' 
            });
        }
        req.user = user;
        next();
    });
};

// Middleware para verificar rol de administrador
const verificarAdmin = (req, res, next) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Acceso denegado. Se requieren permisos de administrador'
        });
    }
    next();
};
//para ver errores
app.use((req, res, next) => {
    console.log('🔍 Accediendo a ruta:', req.method, req.path);
    next();
});

// ====================== RUTAS DE AUTENTICACIÓN ======================

// Ruta de prueba
app.get('/', (req, res) => {
    res.json({ 
        success: true, 
        message: 'API de Inventario funcionando correctamente',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Registro de usuario
app.post('/api/auth/registro', async (req, res) => {
    try {
        const { nombre, email, password, rol = 'usuario' } = req.body;

        // Validaciones básicas
        if (!nombre || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, email y contraseña son requeridos'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'La contraseña debe tener al menos 6 caracteres'
            });
        }

        // Verificar si el email ya existe
        const usuarioExistente = await query(
            'SELECT id FROM usuarios WHERE email = $1',
            [email.toLowerCase()]
        );

        if (usuarioExistente.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'El email ya está registrado'
            });
        }

        // Hashear la contraseña
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insertar el nuevo usuario
        const nuevoUsuario = await query(
            `INSERT INTO usuarios (nombre, email, password, rol) 
             VALUES ($1, $2, $3, $4) 
             RETURNING id, nombre, email, rol, fecha_creacion`,
            [nombre, email.toLowerCase(), hashedPassword, rol]
        );

        res.status(201).json({
            success: true,
            message: 'Usuario registrado exitosamente',
            usuario: nuevoUsuario.rows[0]
        });

    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Login de usuario
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validaciones básicas
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email y contraseña son requeridos'
            });
        }

        // Buscar usuario por email
        const usuario = await query(
            'SELECT id, nombre, email, password, rol FROM usuarios WHERE email = $1 AND activo = true',
            [email.toLowerCase()]
        );

        if (usuario.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        const usuarioData = usuario.rows[0];

        // Verificar contraseña
        const passwordValida = await bcrypt.compare(password, usuarioData.password);

        if (!passwordValida) {
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        // Generar JWT token
        const token = jwt.sign(
            { 
                id: usuarioData.id, 
                email: usuarioData.email, 
                rol: usuarioData.rol 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login exitoso',
            token,
            usuario: {
                id: usuarioData.id,
                nombre: usuarioData.nombre,
                email: usuarioData.email,
                rol: usuarioData.rol
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Verificar token (para mantener sesión)
app.get('/api/auth/verificar', verificarToken, (req, res) => {
    res.json({
        success: true,
        usuario: req.user
    });
});

// ====================== RUTAS DE PRODUCTOS ======================

// Obtener todos los productos
app.get('/api/productos', verificarToken, async (req, res) => {
    try {
        const { categoria, buscar, limite = 50, pagina = 1 } = req.query;
        
        let queryText = `
            SELECT p.*, c.nombre as categoria_nombre 
            FROM productos p 
            LEFT JOIN categorias c ON p.categoria_id = c.id 
            WHERE p.activo = true
        `;
        const params = [];
        let paramCount = 0;

        // Filtro por categoría
        if (categoria) {
            paramCount++;
            queryText += ` AND p.categoria_id = $${paramCount}`;
            params.push(categoria);
        }

        // Filtro de búsqueda
        if (buscar) {
            paramCount++;
            queryText += ` AND (p.nombre ILIKE $${paramCount} OR p.codigo_producto ILIKE $${paramCount})`;
            params.push(`%${buscar}%`);
        }

        queryText += ` ORDER BY p.fecha_creacion DESC`;

        // Paginación
        const offset = (pagina - 1) * limite;
        paramCount++;
        queryText += ` LIMIT $${paramCount}`;
        params.push(parseInt(limite));
        
        paramCount++;
        queryText += ` OFFSET $${paramCount}`;
        params.push(offset);

        const productos = await query(queryText, params);

        res.json({
            success: true,
            productos: productos.rows,
            total: productos.rows.length,
            pagina: parseInt(pagina),
            limite: parseInt(limite)
        });

    } catch (error) {
        console.error('Error al obtener productos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener productos'
        });
    }
});

// Obtener un producto por ID
app.get('/api/productos/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        const producto = await query(
            `SELECT p.*, c.nombre as categoria_nombre 
             FROM productos p 
             LEFT JOIN categorias c ON p.categoria_id = c.id 
             WHERE p.id = $1 AND p.activo = true`,
            [id]
        );

        if (producto.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        res.json({
            success: true,
            producto: producto.rows[0]
        });

    } catch (error) {
        console.error('Error al obtener producto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener producto'
        });
    }
});

// Crear nuevo producto
app.post('/api/productos', verificarToken, async (req, res) => {
    try {
        const { 
            nombre, 
            descripcion, 
            categoria_id, 
            precio, 
            stock_actual, 
            stock_minimo = 5, 
            codigo_producto,
            imagen_url 
        } = req.body;

        // Validaciones
        if (!nombre || !precio || stock_actual === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Nombre, precio y stock actual son requeridos'
            });
        }

        if (precio < 0 || stock_actual < 0) {
            return res.status(400).json({
                success: false,
                message: 'El precio y stock no pueden ser negativos'
            });
        }

        // Verificar código único si se proporciona
        if (codigo_producto) {
            const codigoExistente = await query(
                'SELECT id FROM productos WHERE codigo_producto = $1',
                [codigo_producto]
            );

            if (codigoExistente.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'El código de producto ya existe'
                });
            }
        }

        const nuevoProducto = await query(
            `INSERT INTO productos 
             (nombre, descripcion, categoria_id, precio, stock_actual, stock_minimo, codigo_producto, imagen_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING *`,
            [nombre, descripcion, categoria_id, precio, stock_actual, stock_minimo, codigo_producto, imagen_url]
        );

        // Registrar movimiento inicial si hay stock
        if (stock_actual > 0) {
            await query(
                `INSERT INTO movimientos_inventario 
                 (producto_id, usuario_id, tipo_movimiento, cantidad, precio_unitario, motivo) 
                 VALUES ($1, $2, 'entrada', $3, $4, 'Stock inicial')`,
                [nuevoProducto.rows[0].id, req.user.id, stock_actual, precio]
            );
        }

        res.status(201).json({
            success: true,
            message: 'Producto creado exitosamente',
            producto: nuevoProducto.rows[0]
        });

    } catch (error) {
        console.error('Error al crear producto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear producto'
        });
    }
});

// Actualizar producto
app.put('/api/productos/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            nombre, 
            descripcion, 
            categoria_id, 
            precio, 
            stock_minimo, 
            codigo_producto,
            imagen_url 
        } = req.body;

        // Verificar que el producto existe
        const productoExistente = await query(
            'SELECT * FROM productos WHERE id = $1 AND activo = true',
            [id]
        );

        if (productoExistente.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        // Verificar código único si se cambió
        if (codigo_producto && codigo_producto !== productoExistente.rows[0].codigo_producto) {
            const codigoExistente = await query(
                'SELECT id FROM productos WHERE codigo_producto = $1 AND id != $2',
                [codigo_producto, id]
            );

            if (codigoExistente.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'El código de producto ya existe'
                });
            }
        }

        const productoActualizado = await query(
            `UPDATE productos 
             SET nombre = $1, descripcion = $2, categoria_id = $3, precio = $4, 
                 stock_minimo = $5, codigo_producto = $6, imagen_url = $7, 
                 fecha_actualizacion = CURRENT_TIMESTAMP
             WHERE id = $8 
             RETURNING *`,
            [nombre, descripcion, categoria_id, precio, stock_minimo, codigo_producto, imagen_url, id]
        );

        res.json({
            success: true,
            message: 'Producto actualizado exitosamente',
            producto: productoActualizado.rows[0]
        });

    } catch (error) {
        console.error('Error al actualizar producto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al actualizar producto'
        });
    }
});

// Eliminar producto (soft delete)
app.delete('/api/productos/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;

        const producto = await query(
            'UPDATE productos SET activo = false WHERE id = $1 AND activo = true RETURNING *',
            [id]
        );

        if (producto.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Producto eliminado exitosamente'
        });

    } catch (error) {
        console.error('Error al eliminar producto:', error);
        res.status(500).json({
            success: false,
            message: 'Error al eliminar producto'
        });
    }
});

// ====================== RUTAS DE CATEGORÍAS ======================

// Obtener todas las categorías
app.get('/api/categorias', verificarToken, async (req, res) => {
    try {
        const categorias = await query(
            'SELECT * FROM categorias WHERE activo = true ORDER BY nombre',
            []
        );

        res.json({
            success: true,
            categorias: categorias.rows
        });

    } catch (error) {
        console.error('Error al obtener categorías:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener categorías'
        });
    }
});

// Crear nueva categoría
app.post('/api/categorias', verificarToken, verificarAdmin, async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;

        if (!nombre) {
            return res.status(400).json({
                success: false,
                message: 'El nombre de la categoría es requerido'
            });
        }

        const nuevaCategoria = await query(
            'INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) RETURNING *',
            [nombre, descripcion]
        );

        res.status(201).json({
            success: true,
            message: 'Categoría creada exitosamente',
            categoria: nuevaCategoria.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') { // Unique violation
            return res.status(400).json({
                success: false,
                message: 'Ya existe una categoría con ese nombre'
            });
        }
        console.error('Error al crear categoría:', error);
        res.status(500).json({
            success: false,
            message: 'Error al crear categoría'
        });
    }
});

// ====================== RUTAS DE MOVIMIENTOS ======================

// Registrar movimiento de inventario
app.post('/api/movimientos', verificarToken, async (req, res) => {
    try {
        const { producto_id, tipo_movimiento, cantidad, precio_unitario, motivo, observaciones } = req.body;

        // Validaciones
        if (!producto_id || !tipo_movimiento || !cantidad) {
            return res.status(400).json({
                success: false,
                message: 'Producto, tipo de movimiento y cantidad son requeridos'
            });
        }

        if (!['entrada', 'salida'].includes(tipo_movimiento)) {
            return res.status(400).json({
                success: false,
                message: 'Tipo de movimiento debe ser "entrada" o "salida"'
            });
        }

        if (cantidad <= 0) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad debe ser mayor a 0'
            });
        }

        // Verificar que el producto existe
        const producto = await query(
            'SELECT * FROM productos WHERE id = $1 AND activo = true',
            [producto_id]
        );

        if (producto.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        const stockActual = producto.rows[0].stock_actual;

        // Verificar stock suficiente para salidas
        if (tipo_movimiento === 'salida' && stockActual < cantidad) {
            return res.status(400).json({
                success: false,
                message: `Stock insuficiente. Disponible: ${stockActual}, Solicitado: ${cantidad}`
            });
        }

        // Calcular nuevo stock
        const nuevoStock = tipo_movimiento === 'entrada' 
            ? stockActual + parseInt(cantidad)
            : stockActual - parseInt(cantidad);

        // Iniciar transacción
        const client = await require('./db').getClient();
        
        try {
            await client.query('BEGIN');

            // Registrar movimiento
            const movimiento = await client.query(
                `INSERT INTO movimientos_inventario 
                 (producto_id, usuario_id, tipo_movimiento, cantidad, precio_unitario, motivo, observaciones) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7) 
                 RETURNING *`,
                [producto_id, req.user.id, tipo_movimiento, cantidad, precio_unitario, motivo, observaciones]
            );

            // Actualizar stock del producto
            await client.query(
                'UPDATE productos SET stock_actual = $1, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $2',
                [nuevoStock, producto_id]
            );

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                message: 'Movimiento registrado exitosamente',
                movimiento: movimiento.rows[0],
                nuevo_stock: nuevoStock
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Error al registrar movimiento:', error);
        res.status(500).json({
            success: false,
            message: 'Error al registrar movimiento'
        });
    }
});

// Obtener historial de movimientos
app.get('/api/movimientos', verificarToken, async (req, res) => {
    try {
        const { producto_id, tipo, limite = 50, pagina = 1 } = req.query;
        
        let queryText = `
            SELECT m.*, p.nombre as producto_nombre, p.codigo_producto, u.nombre as usuario_nombre
            FROM movimientos_inventario m
            JOIN productos p ON m.producto_id = p.id
            JOIN usuarios u ON m.usuario_id = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 0;

        if (producto_id) {
            paramCount++;
            queryText += ` AND m.producto_id = $${paramCount}`;
            params.push(producto_id);
        }

        if (tipo) {
            paramCount++;
            queryText += ` AND m.tipo_movimiento = $${paramCount}`;
            params.push(tipo);
        }

        queryText += ` ORDER BY m.fecha_movimiento DESC`;

        // Paginación
        const offset = (pagina - 1) * limite;
        paramCount++;
        queryText += ` LIMIT $${paramCount}`;
        params.push(parseInt(limite));
        
        paramCount++;
        queryText += ` OFFSET $${paramCount}`;
        params.push(offset);

        const movimientos = await query(queryText, params);

        res.json({
            success: true,
            movimientos: movimientos.rows,
            total: movimientos.rows.length,
            pagina: parseInt(pagina),
            limite: parseInt(limite)
        });

    } catch (error) {
        console.error('Error al obtener movimientos:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener movimientos'
        });
    }
});

// ====================== RUTAS DE REPORTES ======================

// Dashboard - Estadísticas generales
app.get('/api/dashboard', verificarToken, async (req, res) => {
    try {
        // Total de productos
        const totalProductos = await query(
            'SELECT COUNT(*) as total FROM productos WHERE activo = true'
        );

        // Productos con stock bajo
        const stockBajo = await query(
            'SELECT COUNT(*) as total FROM productos WHERE activo = true AND stock_actual <= stock_minimo'
        );

        // Valor total del inventario
        const valorInventario = await query(
            'SELECT SUM(precio * stock_actual) as valor_total FROM productos WHERE activo = true'
        );

        // Movimientos del mes actual
        const movimientosMes = await query(
            `SELECT COUNT(*) as total, tipo_movimiento 
             FROM movimientos_inventario 
             WHERE DATE_TRUNC('month', fecha_movimiento) = DATE_TRUNC('month', CURRENT_DATE)
             GROUP BY tipo_movimiento`
        );

        // Productos más movidos (últimos 30 días)
        const productosMasMovidos = await query(
            `SELECT p.nombre, p.codigo_producto, SUM(m.cantidad) as total_movido
             FROM movimientos_inventario m
             JOIN productos p ON m.producto_id = p.id
             WHERE m.fecha_movimiento >= CURRENT_DATE - INTERVAL '30 days'
             GROUP BY p.id, p.nombre, p.codigo_producto
             ORDER BY total_movido DESC
             LIMIT 5`
        );

        res.json({
            success: true,
            dashboard: {
                total_productos: parseInt(totalProductos.rows[0].total),
                productos_stock_bajo: parseInt(stockBajo.rows[0].total),
                valor_total_inventario: parseFloat(valorInventario.rows[0].valor_total || 0),
                movimientos_mes: movimientosMes.rows,
                productos_mas_movidos: productosMasMovidos.rows
            }
        });

    } catch (error) {
        console.error('Error al obtener dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener estadísticas del dashboard'
        });
    }
});

// ====================== MANEJO DE ERRORES ======================

// Middleware para manejar rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Ruta no encontrada'
    });
});

// Middleware para manejo global de errores
app.use((error, req, res, next) => {
    console.error('Error no manejado:', error);
    res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
    });
});

// ====================== INICIAR SERVIDOR ======================

// Función para iniciar el servidor
const iniciarServidor = async () => {
    try {
        // Probar conexión a la base de datos
        await testConnection();
        
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`\n Servidor iniciado exitosamente`);
            console.log(`URL: http://localhost:${PORT}`);
            console.log(`Timestamp: ${new Date().toISOString()}`);
            console.log(`Base de datos: PostgreSQL - inventario_db`);
            console.log(`Logs: Habilitados`);
            console.log(`\n Rutas disponibles:`);
            console.log(`   POST /api/auth/registro - Registro de usuarios`);
            console.log(`   POST /api/auth/login - Iniciar sesión`);
            console.log(`   GET  /api/auth/verificar - Verificar token`);
            console.log(`   GET  /api/productos - Obtener productos`);
            console.log(`   POST /api/productos - Crear producto`);
            console.log(`   PUT  /api/productos/:id - Actualizar producto`);
            console.log(`   DELETE /api/productos/:id - Eliminar producto`);
            console.log(`   GET  /api/categorias - Obtener categorías`);
            console.log(`   POST /api/categorias - Crear categoría`);
            console.log(`   POST /api/movimientos - Registrar movimiento`);
            console.log(`   GET  /api/movimientos - Historial de movimientos`);
            console.log(`   GET  /api/dashboard - Estadísticas generales`);
            console.log(`\n ¡API lista para recibir peticiones!`);
        });
        
    } catch (error) {
        console.error('Error al iniciar el servidor:', error);
        process.exit(1);
    }
};

// Iniciar el servidor
iniciarServidor();
