FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY detect_lenses.py server.py MODEL_SOURCE.txt ./
COPY models/best.pt ./models/best.pt

ENV LENS_SEGMENT_HOST=0.0.0.0
ENV LENS_SEGMENT_PORT=8090
EXPOSE 8090

CMD ["python", "server.py"]
