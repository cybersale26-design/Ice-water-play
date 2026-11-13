# Game server image. Build from the REPO ROOT:
#   docker build -f apps/server/Dockerfile -t icewater-server .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
RUN npm install --workspace @icewater/shared --workspace @icewater/server --include-workspace-root=true \
 && npm run build -w @icewater/shared \
 && npm run build -w @icewater/server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/server ./apps/server
USER node
EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]
