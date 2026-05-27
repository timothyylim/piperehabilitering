# pipe-reviews — daily google reviews → commit → push to piperehabilitering repo
#
# Runs on a supercronic schedule inside the container. Clones the repo via
# a GitHub deploy key (mounted from host), runs update_reviews.py, commits
# + pushes if anything changed.

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

# git identity used for commits from this workload
RUN git config --system user.name "arrakis-pipe-reviews" \
 && git config --system user.email "arrakis-pipe-reviews@users.noreply.github.com"

RUN useradd -u 1000 -m runner \
 && mkdir -p /data /workspace \
 && chown runner:runner /data /workspace

# pre-populate known_hosts and ssh config for the github-pipe-rehab alias
# (the private key itself is mounted at runtime via compose.yml)
RUN mkdir -p /home/runner/.ssh \
 && ssh-keyscan -t ed25519,rsa github.com > /home/runner/.ssh/known_hosts 2>/dev/null \
 && chown -R runner:runner /home/runner/.ssh \
 && chmod 700 /home/runner/.ssh \
 && chmod 600 /home/runner/.ssh/known_hosts

COPY --chown=runner:runner ssh_config /home/runner/.ssh/config
RUN chmod 600 /home/runner/.ssh/config

WORKDIR /app
COPY update_reviews.py entrypoint.sh crontab ./
RUN chmod +x update_reviews.py entrypoint.sh

USER runner
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["supercronic", "-quiet", "/app/crontab"]
