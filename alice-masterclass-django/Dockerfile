FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1

WORKDIR /usr/src/app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod 777 /usr/src/app/masterclass/migrations
RUN chmod 777 /usr/src/app/strangeness/migrations

EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
