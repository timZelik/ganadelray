#!/bin/sh
# Runs a build step that downloads packages, trusting an optional extra CA certificate.
# Only needed behind a TLS-intercepting proxy:  docker build --secret id=extra_ca_certificates,src=proxy-ca.pem ...
set -e
certificate=/run/secrets/extra_ca_certificates
if [ -s "$certificate" ]; then
  export NODE_EXTRA_CA_CERTS="$certificate"
  cat "$certificate" >> /etc/ssl/certs/ca-certificates.crt
fi
exec "$@"
