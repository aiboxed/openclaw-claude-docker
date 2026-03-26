FROM node:20

WORKDIR /app

RUN apt-get update && apt-get install -y bash sudo

RUN npm install -g @anthropic-ai/claude-code

RUN adduser --disabled-password --gecos "" claude-user

RUN mkdir -p /home/claude-user/.claude && \
    echo '{"permissions":{"allow":["Bash(*)","Write(*)","Edit(*)","Read(*)","MultiEdit(*)"],"deny":[]}}' \
      > /home/claude-user/.claude/settings.json && \
    echo '{"firstStartTime":"2026-01-01T00:00:00.000Z"}' \
      > /home/claude-user/.claude.json && \
    chown -R claude-user:claude-user /home/claude-user && \
    echo 'claude-user ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

COPY package.json ./
RUN npm install

COPY server.js ./
RUN chown -R claude-user:claude-user /app

EXPOSE 3000

CMD ["node", "server.js"]
