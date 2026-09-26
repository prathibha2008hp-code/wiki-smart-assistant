import json
import os

import faiss
import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from groq import Groq


app = FastAPI(title="Wiki Smart Assistant")


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


groq_api_key = os.getenv("GROQ_API_KEY")

if not groq_api_key:
    raise RuntimeError(
        "GROQ_API_KEY is missing. Set it in the server terminal first."
    )


groq_client = Groq(api_key=groq_api_key)

GROQ_MODEL = "openai/gpt-oss-20b"


print("Loading embedding model...")

embedding_model = SentenceTransformer(
    "all-MiniLM-L6-v2"
)


print("Loading FAISS index...")

index = faiss.read_index(
    "index/articles.index"
)


print("Loading article metadata...")

with open(
    "index/articles.json",
    "r",
    encoding="utf-8"
) as f:
    articles = json.load(f)


print("Wiki Smart Assistant backend ready!")


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


def search_local_wikipedia(query, top_k=5):
    """
    Search the local FAISS Wikipedia dataset.
    """

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

    for score, idx in zip(
        scores[0],
        indices[0]
    ):

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

    return results


def search_wikipedia_api(query):
    """
    Search the public Wikipedia API for an article
    when the local dataset does not contain a good match.
    """

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
                "srlimit": 3
            },
            headers={
                "User-Agent": "WikiSmartAssistant/1.0"
            },
            timeout=10
        )

        response.raise_for_status()

        data = response.json()

        search_results = data.get(
            "query",
            {}
        ).get(
            "search",
            []
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
                timeout=10
            )

            if summary_response.ok:

                summary = summary_response.json()

                results.append({
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
                    )
                })

        return results

    except Exception as error:

        print(
            "Wikipedia API error:",
            error
        )

        return []


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

    return "\n\n".join(
        context_parts
    )


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
                        "You are Wiki Smart Assistant. "
                        "Answer the user's question using "
                        "ONLY the provided Wikipedia context. "
                        "Do not invent facts. "
                        "Give a clear and concise answer. "
                        "If the context does not contain enough "
                        "information, say so."
                    )
                },

                {
                    "role": "user",
                    "content": (
                        f"Question:\n{query}\n\n"
                        f"Wikipedia context:\n{context}"
                    )
                }

            ],

            temperature=0.2,

            max_tokens=500
        )

        return (
            response.choices[0]
            .message
            .content
            .strip()
        )

    except Exception as error:

        print(
            "Groq error:",
            error
        )

        return (
            "The Wikipedia search worked, "
            "but the AI answer could not be generated."
        )


@app.get("/")
def home():

    return {
        "message": "Wiki Smart Assistant API is running!"
    }


@app.post("/search")
def search(request: SearchRequest):

    query = request.query.strip()

    if not query:

        return {
            "query": query,
            "answer": "Please enter a question.",
            "results": []
        }


    # -------------------------------------------------
    # STEP 1: Search local FAISS dataset
    # -------------------------------------------------

    results = search_local_wikipedia(
        query,
        request.top_k
    )


    # -------------------------------------------------
    # STEP 2: Check whether local results are relevant
    # -------------------------------------------------

    use_wikipedia_api = False

    if not results:

        use_wikipedia_api = True

    else:

        best_score = results[0]["score"]

        # Low similarity means the local dataset
        # probably does not contain the requested topic.

        if best_score < 0.60:

            use_wikipedia_api = True


    # -------------------------------------------------
    # STEP 3: Wikipedia API fallback
    # -------------------------------------------------

    if use_wikipedia_api:

        api_results = search_wikipedia_api(
            query
        )

        if api_results:

            results = api_results


    # -------------------------------------------------
    # STEP 4: Create context for Groq
    # -------------------------------------------------

    context = create_context(
        results
    )


    # -------------------------------------------------
    # STEP 5: Generate AI answer
    # -------------------------------------------------

    answer = generate_answer(
        query,
        context
    )


    # -------------------------------------------------
    # STEP 6: Return response
    # -------------------------------------------------

    return {

        "query": query,

        "answer": answer,

        "results": results

    }