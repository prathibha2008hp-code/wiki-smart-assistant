import json
import os

import faiss
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer


app = FastAPI(title="Wiki Smart Assistant")


# -----------------------------
# CORS
# -----------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://wiki-smart-assistant-7xn26njdy-leaders15.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# API Keys
# -----------------------------

groq_api_key = os.getenv("GROQ_API_KEY")

if not groq_api_key:
    raise RuntimeError(
        "GROQ_API_KEY is missing. Set it in the server environment."
    )


groq_client = Groq(api_key=groq_api_key)

GROQ_MODEL = "openai/gpt-oss-20b"


# -----------------------------
# Load Embedding Model
# -----------------------------

print("Loading embedding model...")

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")


# -----------------------------
# Load FAISS Index
# -----------------------------

print("Loading FAISS index...")

index = faiss.read_index("index/articles.index")


# -----------------------------
# Load Article Metadata
# -----------------------------

print("Loading article metadata...")

with open("index/articles.json", "r", encoding="utf-8") as f:
    articles = json.load(f)


print("Wiki Smart Assistant backend ready!")


# -----------------------------
# Request Model
# -----------------------------

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


# -----------------------------
# Local Wikipedia Search
# -----------------------------

def search_local_wikipedia(query, top_k=5):

    query_embedding = embedding_model.encode(
        [query],
        convert_to_numpy=True
    ).astype("float32")

    faiss.normalize_L2(query_embedding)

    scores, indices = index.search(
        query_embedding,
        top_k
    )

    results = []

    for score, idx in zip(scores[0], indices[0]):

        if idx == -1:
            continue

        article = articles[idx]

        results.append(
            {
                "score": float(score),
                "name": article.get("name"),
                "description": article.get("description"),
                "abstract": article.get("abstract"),
                "url": article.get("url"),
            }
        )

    return results


# -----------------------------
# Wikipedia API Fallback
# -----------------------------

def search_wikipedia_api(query):

    print("Local search was not sufficiently relevant.")
    print("Searching Wikipedia API...")

    try:

        response = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "format": "json",
                "list": "search",
                "srsearch": query,
                "srlimit": 3,
            },
            headers={
                "User-Agent": "WikiSmartAssistant/1.0"
            },
            timeout=10,
        )

        response.raise_for_status()

        data = response.json()

        search_results = (
            data.get("query", {})
            .get("search", [])
        )

        results = []

        for item in search_results:

            title = item.get("title")

            if not title:
                continue

            summary_response = requests.get(
                "https://en.wikipedia.org/api/rest_v1/page/summary/"
                + requests.utils.quote(title, safe=""),
                headers={
                    "User-Agent": "WikiSmartAssistant/1.0"
                },
                timeout=10,
            )

            if summary_response.ok:

                summary = summary_response.json()

                results.append(
                    {
                        "score": 1.0,
                        "name": title,
                        "description": summary.get(
                            "description"
                        ),
                        "abstract": summary.get(
                            "extract"
                        ),
                        "url": (
                            summary.get("content_urls", {})
                            .get("desktop", {})
                            .get("page")
                        ),
                    }
                )

        return results

    except Exception as error:

        print("Wikipedia API error:", error)

        return []


# -----------------------------
# Create RAG Context
# -----------------------------

def create_context(results):

    context_parts = []

    for article in results:

        name = article.get(
            "name"
        ) or "Unknown article"

        text = (
            article.get("abstract")
            or article.get("description")
            or ""
        )

        if text:

            context_parts.append(
                f"Article: {name}\n"
                f"Content: {text}"
            )

    return "\n\n".join(context_parts)


# -----------------------------
# Generate AI Answer
# -----------------------------

def generate_answer(query, context):

    if not context:

        return (
            "I couldn't find enough relevant "
            "Wikipedia information to answer this question."
        )

    try:

        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Wiki Smart Assistant, "
                        "an AI research assistant. "
                        "Answer the user's question using ONLY "
                        "the provided Wikipedia context. "
                        "Do not invent facts that are not present "
                        "in the context. "
                        "Write a well-developed answer of at least "
                        "3-5 sentences, covering the key facts "
                        "available in the context. "
                        "If the context does not contain enough "
                        "information, say so explicitly."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Question:\n{query}\n\n"
                        f"Wikipedia context:\n{context}"
                    ),
                },
            ],
            temperature=0.3,
            max_tokens=700,
        )

        return response.choices[0].message.content.strip()

    except Exception as error:

        print("Groq error:", error)

        return (
            "The Wikipedia search worked, "
            "but the AI answer could not be generated."
        )


# -----------------------------
# Home Endpoint
# -----------------------------

@app.get("/")
def home():

    return {
        "message": "Wiki Smart Assistant API is running!"
    }


# -----------------------------
# Search Endpoint
# -----------------------------

@app.post("/search")
def search(request: SearchRequest):

    query = request.query.strip()

    if not query:

        return {
            "query": query,
            "answer": "Please enter a question.",
            "results": [],
        }

    results = search_local_wikipedia(
        query,
        request.top_k
    )

    use_wikipedia_api = False

    if not results:

        use_wikipedia_api = True

    else:

        best_score = results[0]["score"]

        if best_score < 0.60:

            use_wikipedia_api = True

    if use_wikipedia_api:

        api_results = search_wikipedia_api(query)

        if api_results:

            results = api_results

    context = create_context(results)

    answer = generate_answer(
        query,
        context
    )

    return {
        "query": query,
        "answer": answer,
        "results": results,
    }
