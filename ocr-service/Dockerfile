# PaddleOCR sidecar for VoltProof. Deploy as a separate Cloud Run service:
#   gcloud run deploy voltproof-ocr --source ocr-service --region $REGION --no-allow-unauthenticated --memory 4Gi --cpu 2
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py copy_move.py ./
# Download the English models at build time so cold starts do not fetch them.
RUN python -c "from app import engine; engine('en')"
ENV PORT=8080
CMD ["python", "app.py"]
