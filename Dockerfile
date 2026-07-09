# Use Node 22 LTS - required because npm@latest needs Node ^22.22.2 || ^24.15.0 || >=26.0.0
FROM node:22-alpine

WORKDIR /app

RUN apk update && apk upgrade --no-cache

RUN npm install -g npm@latest

COPY package*.json ./

RUN npm ci --omit=dev

# Copy the rest of the application source
COPY . .

# Expose the port your app listens on (adjust if different)
EXPOSE 3000

# Start the application (adjust to match your actual start command)
CMD ["node", "index.js"]





