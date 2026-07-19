FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
# Starts without HERMOSO_TOKEN (introspection works; tool calls need the token)
ENTRYPOINT ["node", "mcp/hermoso-mcp.mjs"]
