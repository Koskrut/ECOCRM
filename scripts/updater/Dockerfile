FROM docker:27-cli
RUN apk add --no-cache nodejs
COPY scripts/updater/agent.mjs /app/agent.mjs
WORKDIR /app
ENV UPDATER_AGENT_HOST=0.0.0.0
ENV UPDATER_AGENT_PORT=7788
# Base image ENTRYPOINT is docker-entrypoint.sh; it would rewrite
# CMD ["node","agent.mjs"] into `docker node agent.mjs` and the agent never starts.
ENTRYPOINT ["/usr/bin/node", "/app/agent.mjs"]
