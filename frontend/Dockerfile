FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci fails when lock was produced on another OS (optional @emnapi/* bindings).
RUN npm install --no-audit --no-fund
COPY . .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
