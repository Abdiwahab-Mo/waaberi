FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Long timeout + threads: phone-prompt payments wait up to ~90s for the donor to enter their PIN
CMD ["gunicorn", "-b", "0.0.0.0:5000", "--workers", "2", "--threads", "8", "--timeout", "120", "app:create_app()"]
