FROM httpd:2.4-alpine

# Match OKD Service/Route (8080) and enable .htaccess SPA routing from dist/
RUN sed -i \
    -e 's/#LoadModule rewrite_module modules\/mod_rewrite.so/LoadModule rewrite_module modules\/mod_rewrite.so/' \
    -e 's/#LoadModule headers_module modules\/mod_headers.so/LoadModule headers_module modules\/mod_headers.so/' \
    -e 's/AllowOverride none/AllowOverride All/' \
    -e 's/AllowOverride None/AllowOverride All/' \
    -e 's/Listen 80/Listen 8080/' \
    /usr/local/apache2/conf/httpd.conf

COPY ./dist/ /usr/local/apache2/htdocs/

EXPOSE 8080
