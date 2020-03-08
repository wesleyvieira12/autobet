FROM node:latest

RUN mkdir ~/autobet

RUN apt update && apt-get install -y wget

WORKDIR "/autobet"

COPY . .

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    supervisor
 
COPY ./supervisor/supervisord.conf /etc/supervisor
COPY ./supervisor/configs-supervisor /etc/supervisor/conf.d

ENTRYPOINT ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
