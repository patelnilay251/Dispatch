from mistralai import Mistral

from app.core.config import settings

client = Mistral(api_key=settings.MISTRAL_API_KEY)