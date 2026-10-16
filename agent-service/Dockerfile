# VoltProof evidence agent (ADK). Deploy as its own Cloud Run service, private:
#   gcloud run deploy voltproof-agent --source agent-service --no-allow-unauthenticated
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py ./
COPY voltproof_agent ./voltproof_agent
ENV PORT=8080 GOOGLE_GENAI_USE_VERTEXAI=TRUE
CMD ["python", "main.py"]
