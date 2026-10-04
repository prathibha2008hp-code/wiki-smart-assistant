# Wiki Smart Assistant

A semantic Wikipedia search and AI assistant built with a FastAPI backend and a React/Vite frontend. The app retrieves relevant Wikipedia content, generates grounded answers with Groq, and offers a polished research experience with memory, voice input, speech output, search history, and theme controls.

## Features

- Semantic local Wikipedia search using FAISS and SentenceTransformers
- Groq-backed answer generation grounded in retrieved article context
- Conversation memory with a capped context window for follow-up questions
- New Chat / clear conversation controls
- Suggested follow-up questions after each answer
- Browser voice input using Web Speech API when supported
- Text-to-speech reading for assistant responses using SpeechSynthesis
- Wikipedia article preview cards with thumbnails and source links
- Search history stored in localStorage with deduplication and hideable panel
- Light/dark theme with persistence to localStorage
- English, Kannada, and Hindi UI translations with persistent language selection
- Groq answers generated in the selected UI language
- Share answers using the browser Web Share API or clipboard fallback
- Responsive loading and empty states

## Project structure

- `server.py` — FastAPI backend and local Wikipedia search API
- `frontend/` — Vite + React frontend
- `index/` — FAISS index and metadata used by the backend

## Environment setup

Create a `.env` file or export the required environment variable before running the backend:

```bash
export GROQ_API_KEY="your_groq_api_key"
```

For the frontend, you can optionally point to a different backend URL:

```bash
export VITE_API_URL="http://127.0.0.1:8000"
```

## Local development

Backend:

```bash
cd "C:\Users\Prathibha\Desktop\wiki-smart-assistant"
venv\Scripts\python.exe -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

Frontend:

```bash
cd "C:\Users\Prathibha\Desktop\wiki-smart-assistant\frontend"
npm install
npm run dev
```

## Production build

```bash
cd "C:\Users\Prathibha\Desktop\wiki-smart-assistant\frontend"
npm run build
```

## Team

Team Number: 117
