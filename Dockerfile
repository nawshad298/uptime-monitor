FROM node:20-alpine
WORKDIR /app
RUN apk update && apk upgrade --no-cache
RUN npm install -g npm@latest
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
