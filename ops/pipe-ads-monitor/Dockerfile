# pipe-ads-monitor — weekly Google Ads stats + auto-negatives -> commit -> push

FROM python:3.12-slim

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

RUN pip install --no-cache-dir \
      google-ads==31.0.0 \
      pyyaml

RUN git config --system user.name "arrakis-pipe-ads-monitor" \
 && git config --system user.email "arrakis-pipe-ads-monitor@users.noreply.github.com"

RUN useradd -m -s /bin/bash appuser

RUN mkdir -p /data /workspace \
 && chown appuser:appuser /data /workspace

RUN mkdir -p /home/appuser/.ssh \
 && ssh-keyscan -t ed25519,rsa github.com > /home/appuser/.ssh/known_hosts 2>/dev/null \
 && chown -R appuser:appuser /home/appuser/.ssh \
 && chmod 700 /home/appuser/.ssh \
 && chmod 600 /home/appuser/.ssh/known_hosts

COPY --chown=appuser:appuser ssh_config /home/appuser/.ssh/config
RUN chmod 600 /home/appuser/.ssh/config

WORKDIR /app
COPY ads_monitor.py entrypoint.sh crontab ./
RUN chmod +x entrypoint.sh

USER appuser
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["supercronic", "-quiet", "/app/crontab"]
