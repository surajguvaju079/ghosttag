FROM node:24-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/validation/package.json packages/validation/package.json
COPY packages/types/package.json packages/types/package.json

RUN pnpm install --filter @ghosttag/api... --frozen-lockfile

COPY . .

RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/ghosttag?schema=public" \
    pnpm --filter @ghosttag/api exec prisma generate

RUN pnpm --filter @ghosttag/api build

FROM build AS runtime

WORKDIR /workspace/apps/api

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
