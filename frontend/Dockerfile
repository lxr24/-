# TODO Start: [Student] Complete Dockerfile
# 构建阶段：安装依赖、构建 standalone
FROM node:22 AS builder
WORKDIR /app

# 安装 pnpm 并配置本地源(本地源是小作业文档给的)
RUN npm install -g pnpm && \
    pnpm config set registry https://registry.npmmirror.com/

# 复制项目文件并安装依赖
COPY . .
RUN pnpm install

# 构建 standalone 输出
RUN pnpm run build

# 运行阶段：最小化镜像，仅保留运行所需
FROM node:22-slim
WORKDIR /app

# 从构建阶段复制必要文件
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 设置生产环境
ENV NODE_ENV=production

# 设置默认监听端口为 80
ENV PORT=80

# 暴露 80 端口（HTTP 默认端口）
EXPOSE 80

# 启动服务：server.js 会读取 process.env.PORT，若未设置则使用上面的默认 80
CMD ["node", "server.js"]
# TODO End