# === Stage 1: Build Frontend ===
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# 先拷贝依赖声明，利用 Docker 缓存层加速
COPY package.json package-lock.json ./

# 安装依赖（公网使用默认 npm registry）
RUN npm install

# 拷贝源码并构建
COPY . .

# 前端构建参数：公网模式默认 VITE_BASE_PATH=/, VITE_APP_KEY=
# 盒子模式构建时传入：--build-arg VITE_BASE_PATH=/who-is-wodi/ --build-arg VITE_APP_KEY=who-is-wodi
ARG VITE_BASE_PATH=/
ARG VITE_APP_KEY=
ENV VITE_BASE_PATH=$VITE_BASE_PATH
ENV VITE_APP_KEY=$VITE_APP_KEY

RUN npm run build

# === Stage 2: Build API Server ===
FROM node:18-alpine AS api-builder

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm install

COPY server/ .

# === Stage 3: Deploy ===
FROM node:18-alpine

# 安装 Node.js API 服务
COPY --from=api-builder /app/server /app/server

# 前端 package.json（server/index.js 读取 fde.appKey 等元数据）
COPY package.json /app/package.json

# 前端产物
COPY --from=frontend-builder /app/dist /app/dist

# 启动脚本
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 5201

CMD ["/app/start.sh"]
