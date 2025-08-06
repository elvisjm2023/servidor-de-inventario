    -- Tabla usuarios
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        rol VARCHAR(20) DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario')),
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activo BOOLEAN DEFAULT true
    );

    -- Tabla de categorías
    CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activo BOOLEAN DEFAULT true
    );

    -- Tabla de Productos
    CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        descripcion TEXT,
        categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
        precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
        stock_actual INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
        stock_minimo INTEGER DEFAULT 5,
        codigo_producto VARCHAR(50) UNIQUE,
        imagen_url VARCHAR(500),
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activo BOOLEAN DEFAULT true
    );

    -- Tabla de Historial de Movimientos
    CREATE TABLE IF NOT EXISTS movimientos_inventario (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
        tipo_movimiento VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('entrada', 'salida')),
        cantidad INTEGER NOT NULL CHECK (cantidad > 0),
        precio_unitario DECIMAL(10,2),
        motivo VARCHAR(200),
        observaciones TEXT,
        fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Índices para mejorar rendimiento
    CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
    CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);
    CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos_inventario(producto_id);
    CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos_inventario(fecha_movimiento);
    CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

    -- Función para actualizar fecha_actualizacion automáticamente
    CREATE OR REPLACE FUNCTION actualizar_fecha_modificacion()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.fecha_actualizacion = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    -- Trigger para productos
    DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_actualizar_productos') THEN
            CREATE TRIGGER trigger_actualizar_productos
                BEFORE UPDATE ON productos
                FOR EACH ROW
                EXECUTE FUNCTION actualizar_fecha_modificacion();
        END IF;
    END $$;


    -- Datos iniciales de prueba (solo si la tabla está vacía)
    INSERT INTO usuarios (nombre, email, password, rol)
    SELECT 'Administrador', 'admin@admin.com', '$2b$10$bc3iIsB/Ie6itJSqsfzzQORZ.cBtquuG3U7mj/4oWHV553GHclTZi', 'admin'
    WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'admin@admin.com');

    INSERT INTO categorias (nombre, descripcion)
    SELECT 'Electrónicos', 'Dispositivos y componentes electrónicos'
    WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nombre = 'Electrónicos');

    INSERT INTO categorias (nombre, descripcion)
    SELECT 'Oficina', 'Material de oficina y papelería'
    WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nombre = 'Oficina');

    INSERT INTO categorias (nombre, descripcion)
    SELECT 'Limpieza', 'Productos de limpieza y aseo'
    WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nombre = 'Limpieza');

    INSERT INTO categorias (nombre, descripcion)
    SELECT 'Herramientas', 'Herramientas de trabajo y mantenimiento'
    WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nombre = 'Herramientas');

    INSERT INTO categorias (nombre, descripcion)
    SELECT 'Consumibles', 'Productos de consumo regular'
    WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE nombre = 'Consumibles');

    -- Productos de ejemplo (asegúrate de que las categorías existan antes de insertar productos)
    INSERT INTO productos (nombre, descripcion, categoria_id, precio, stock_actual, stock_minimo, codigo_producto)
    SELECT 'Laptop Dell Inspiron', 'Laptop para oficina 8GB RAM 256GB SSD', (SELECT id FROM categorias WHERE nombre = 'Electrónicos'), 650.00, 15, 5, 'LAP001'
    WHERE NOT EXISTS (SELECT 1 FROM productos WHERE codigo_producto = 'LAP001');

    INSERT INTO productos (nombre, descripcion, categoria_id, precio, stock_actual, stock_minimo, codigo_producto)
    SELECT 'Mouse Inalámbrico', 'Mouse óptico inalámbrico USB', (SELECT id FROM categorias WHERE nombre = 'Electrónicos'), 25.50, 50, 10, 'MOU001'
    WHERE NOT EXISTS (SELECT 1 FROM productos WHERE codigo_producto = 'MOU001');

    INSERT INTO productos (nombre, descripcion, categoria_id, precio, stock_actual, stock_minimo, codigo_producto)
    SELECT 'Papel Bond A4', 'Resma de papel bond blanco A4 500 hojas', (SELECT id FROM categorias WHERE nombre = 'Oficina'), 4.50, 100, 20, 'PAP001'
    WHERE NOT EXISTS (SELECT 1 FROM productos WHERE codigo_producto = 'PAP001');

    INSERT INTO productos (nombre, descripcion, categoria_id, precio, stock_actual, stock_minimo, codigo_producto)
    SELECT 'Detergente Líquido', 'Detergente líquido para limpieza 1L', (SELECT id FROM categorias WHERE nombre = 'Limpieza'), 3.25, 75, 15, 'DET001'
    WHERE NOT EXISTS (SELECT 1 FROM productos WHERE codigo_producto = 'DET001');

    INSERT INTO productos (nombre, descripcion, categoria_id, precio, stock_actual, stock_minimo, codigo_producto)
    SELECT 'Destornillador Phillips', 'Destornillador Phillips #2', (SELECT id FROM categorias WHERE nombre = 'Herramientas'), 8.75, 30, 5, 'DES001'
    WHERE NOT EXISTS (SELECT 1 FROM productos WHERE codigo_producto = 'DES001');

    -- Algunos movimientos de ejemplo (asegúrate de que productos y usuarios existan)
    INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo_movimiento, cantidad, precio_unitario, motivo)
    SELECT
        (SELECT id FROM productos WHERE codigo_producto = 'LAP001'),
        (SELECT id FROM usuarios WHERE email = 'admin@admin.com'),
        'entrada', 20, 650.00, 'Compra inicial'
    WHERE NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE producto_id = (SELECT id FROM productos WHERE codigo_producto = 'LAP001') AND tipo_movimiento = 'entrada' AND cantidad = 20);

    INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo_movimiento, cantidad, precio_unitario, motivo)
    SELECT
        (SELECT id FROM productos WHERE codigo_producto = 'MOU001'),
        (SELECT id FROM usuarios WHERE email = 'admin@admin.com'),
        'entrada', 60, 25.50, 'Compra inicial'
    WHERE NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE producto_id = (SELECT id FROM productos WHERE codigo_producto = 'MOU001') AND tipo_movimiento = 'entrada' AND cantidad = 60);

    INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo_movimiento, cantidad, precio_unitario, motivo)
    SELECT
        (SELECT id FROM productos WHERE codigo_producto = 'PAP001'),
        (SELECT id FROM usuarios WHERE email = 'admin@admin.com'),
        'entrada', 120, 4.50, 'Compra inicial'
    WHERE NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE producto_id = (SELECT id FROM productos WHERE codigo_producto = 'PAP001') AND tipo_movimiento = 'entrada' AND cantidad = 120);

    INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo_movimiento, cantidad, precio_unitario, motivo)
    SELECT
        (SELECT id FROM productos WHERE codigo_producto = 'LAP001'),
        (SELECT id FROM usuarios WHERE email = 'admin@admin.com'),
        'salida', 5, 650.00, 'Venta a cliente'
    WHERE NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE producto_id = (SELECT id FROM productos WHERE codigo_producto = 'LAP001') AND tipo_movimiento = 'salida' AND cantidad = 5);

    INSERT INTO movimientos_inventario (producto_id, usuario_id, tipo_movimiento, cantidad, precio_unitario, motivo)
    SELECT
        (SELECT id FROM productos WHERE codigo_producto = 'MOU001'),
        (SELECT id FROM usuarios WHERE email = 'admin@admin.com'),
        'salida', 10, 25.50, 'Distribución a oficinas'
    WHERE NOT EXISTS (SELECT 1 FROM movimientos_inventario WHERE producto_id = (SELECT id FROM productos WHERE codigo_producto = 'MOU001') AND tipo_movimiento = 'salida' AND cantidad = 10);

    -- Vistas (se crean o reemplazan si ya existen)
    CREATE OR REPLACE VIEW vista_productos_stock AS
    SELECT
        p.id,
        p.nombre,
        p.descripcion,
        c.nombre as categoria,
        p.precio,
        p.stock_actual,
        p.stock_minimo,
        p.codigo_producto,
        CASE
            WHEN p.stock_actual <= p.stock_minimo THEN 'Bajo'
            WHEN p.stock_actual <= (p.stock_minimo * 2) THEN 'Medio'
            ELSE 'Alto'
        END as nivel_stock,
        p.fecha_creacion,
        p.fecha_actualizacion
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.activo = true;

    CREATE OR REPLACE VIEW vista_movimientos_detalle AS
    SELECT
        m.id,
        p.nombre as producto,
        p.codigo_producto,
        u.nombre as usuario,
        m.tipo_movimiento,
        m.cantidad,
        m.precio_unitario,
        (m.cantidad * m.precio_unitario) as valor_total,
        m.motivo,
        m.fecha_movimiento
    FROM movimientos_inventario m
    JOIN productos p ON m.producto_id = p.id
    JOIN usuarios u ON m.usuario_id = u.id
    ORDER BY m.fecha_movimiento DESC;
    