FROM registry.cern.ch/quay.io/sclorg/httpd-24-c9s

# Keep the same document root layout as production.
# Angular application builder outputs SPA under dist/browser/
COPY ./dist/browser/ /var/www/html/
