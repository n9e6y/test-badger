# Caddy serving the built React apps. Build context: frontend/ (the current app).
# The redesign (frontend-v2/, served at NEW_APP_SITE) comes in as the extra build context "v2".
FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS build-v2
WORKDIR /src
COPY --from=v2 package.json package-lock.json ./
RUN npm ci
COPY --from=v2 . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /src/dist /srv/frontend
COPY --from=build-v2 /src/dist /srv/frontend-v2
