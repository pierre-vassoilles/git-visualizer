# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Étape 1 — build de l'application Vue/Vite (génère dist/)
# ─────────────────────────────────────────────────────────────
ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27

FROM node:${NODE_VERSION}-alpine AS build

WORKDIR /app

# Installe les dépendances en couche séparée pour profiter du cache Docker
COPY package.json package-lock.json ./
RUN npm ci

# Copie le reste des sources et build de production
COPY . .
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Étape 2 — image de prod : Nginx sert les fichiers statiques
# ─────────────────────────────────────────────────────────────
FROM nginx:${NGINX_VERSION}-alpine AS runtime

# Config Nginx adaptée à une SPA (fallback index.html)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Artefacts buildés
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Nginx tourne au premier plan (PID 1) — bon citoyen Docker
CMD ["nginx", "-g", "daemon off;"]
