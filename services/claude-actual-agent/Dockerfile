FROM node:20-bookworm-slim

# Claude Code CLI, on the host's existing subscription (auth done post-build via mounted volume).
RUN npm install -g @anthropic-ai/claude-code

# better-sqlite3 (a transitive dep of @actual-app/api) falls back to compiling
# from source when no matching prebuilt binary is available.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/node/actual-budget /home/node/.claude \
    && chown -R node:node /home/node/actual-budget /home/node/.claude

USER node
WORKDIR /home/node/actual-budget
COPY --chown=node:node actual-budget/package.json actual-budget/package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node actual-budget/cli.mjs ./

ENV CLAUDE_CONFIG_DIR=/home/node/.claude

ENTRYPOINT ["claude"]
CMD ["remote-control"]
