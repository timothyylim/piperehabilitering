# pipe-serp-monitor — daily Serper SERP snapshots -> commit -> push

FROM node:20-slim

ARG SUPERCRONIC_VERSION=v0.2.29
ARG SUPERCRONIC_URL=https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      curl ca-certificates tini git openssh-client tzdata \
 && curl -fsSL "${SUPERCRONIC_URL}" -o /usr/local/bin/supercronic \
 && chmod +x /usr/local/bin/supercronic \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

ENV TZ=Europe/Oslo

RUN git config --system user.name "arrakis-pipe-serp-monitor" \
 && git config --system user.email "arrakis-pipe-serp-monitor@users.noreply.github.com"

RUN mkdir -p /data /workspace \
 && chown node:node /data /workspace

RUN mkdir -p /home/node/.ssh \
 && ssh-keyscan -t ed25519,rsa github.com > /home/node/.ssh/known_hosts 2>/dev/null \
 && chown -R node:node /home/node/.ssh \
 && chmod 700 /home/node/.ssh \
 && chmod 600 /home/node/.ssh/known_hosts

COPY --chown=node:node ssh_config /home/node/.ssh/config
RUN chmod 600 /home/node/.ssh/config

WORKDIR /app
COPY serp_monitor.mjs keywords.json entrypoint.sh crontab ./
RUN chmod +x entrypoint.sh serp_monitor.mjs

USER node
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["supercronic", "-quiet", "/app/crontab"]
