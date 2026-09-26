import json

import faiss
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer


# Create FastAPI app
app = FastAPI(title="Wiki Smart Assistant")


# CORS - allow React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Load embedding model
print("Loading embedding model...")
model = SentenceTransformer("all-MiniLM-L6-v2")


# Load FAISS index
print("Loading FAISS index...")
index = faiss.read_index("index/articles.index")


# Load article metadata
print("Loading article metadata...")

with open("index/articles.json", "r", encoding="utf-8") as f:
    articles = json.load(f)


print("Wiki Smart Assistant backend ready!")


# Search request format
class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


# Home endpoint
@app.get("/")
def home():
    return {
        "message": "Wiki Smart Assistant API is running!"
    }


# Search endpoint
@app.post("/search")
def search(request: SearchRequest):

    query = request.query.strip()

    if not query:
        return {
            "query": query,
            "answer": "Please enter a question.",
            "results": []
        }

    # Convert query into embedding
    query_embedding = model.encode(
        [query],
        convert_to_numpy=True
    ).astype("float32")

    # Normalize embedding
    faiss.normalize_L2(query_embedding)

    # Search FAISS
    scores, indices = index.search(
        query_embedding,
        request.top_k
    )

    results = []

    for score, idx in zip(scores[0], indices[0]):

        if idx == -1:
            continue

        article = articles[idx]

        results.append({
            "score": float(score),
            "name": article.get("name"),
            "description": article.get("description"),
            "abstract": article.get("abstract"),
            "url": article.get("url")
        })

    # Build answer from retrieved Wikipedia content
    answer_parts = []

    for article in results[:3]:

        text = article.get("abstract") or article.get("description")

        if text:
            answer_parts.append(
                f"{article.get('name')}: {text}"
            )

    answer = "\n\n".join(answer_parts)

    if not answer:
        answer = "I couldn't find enough information for this question."

    return {
        "query": query,
        "answer": answer,
        "results": results
    }