FROM node:18-alpine AS build

WORKDIR /usr/src/app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --only=production

# Copiar código fuente
COPY . .

# --- Fase de Producción ---
# Usar una imagen más pequeña para la ejecución final
FROM node:18-alpine

WORKDIR /usr/src/app

# Copiar las dependencias y el código desde la fase de build
COPY --from=build /usr/src/app .

# Exponer puerto
EXPOSE 5000

# Comando de inicio
CMD ["node", "index.js"]