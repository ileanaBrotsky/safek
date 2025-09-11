FROM node:18-alpine

# Instalar curl para health check
RUN apk add --no-cache curl

# Crear directorio de trabajo
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias (incluyendo dev para nodemon)
RUN npm install