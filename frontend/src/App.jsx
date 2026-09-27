import { useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function App() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async (searchQuery) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setLoading(true);
    setAnswer("");
    setResults([]);

    try {
      const response = await fetch(`${API_URL}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: trimmed,
          top_k: 5,
        }),
      });

      if (!response.ok) {
        throw new Error("Search request failed");
      }

      const data = await response.json();

      setAnswer(data.answer || "No answer found.");
      setResults(data.results || []);
    } catch (error) {
      console.error("Search error:", error);
      setAnswer("Could not connect to the backend.");
    } finally {
      setLoading(false);
    }
  };

  const searchWiki = () => runSearch(query);

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      searchWiki();
    }
  };

  const useExample = (example) => {
    setQuery(example);
    runSearch(example);
  };

  return (
    <div className="app">
      <div className="background-glow glow-one"></div>
      <div className="background-glow glow-two"></div>

      <main className="container">
        <header className="hero">
          <div className="logo">◈</div>

          <div className="eyebrow">AI RESEARCH ASSISTANT</div>

          <h1>
            Wiki Smart <span>Assistant</span>
          </h1>

          <p>
            Ask a question. Explore Wikipedia knowledge.
            <br />
            Get a grounded answer powered by semantic search and AI agents.
          </p>

          <div className="tech-badges">
            <span>FAISS</span>
            <span>RAG</span>
            <span>Antigravity</span>
            <span>Groq</span>
          </div>
        </header>

        <section className="search-section">
          <div className="search-box">
            <div className="search-icon">⌕</div>

            <input
              type="text"
              placeholder="Ask anything about Wikipedia..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />

            <button onClick={searchWiki} disabled={loading || !query.trim()}>
              {loading ? (
                <>
                  <span className="button-spinner"></span>
                  Researching
                </>
              ) : (
                <>
                  Search <span>→</span>
                </>
              )}
            </button>
          </div>

          <p className="search-hint">
            Press <kbd>Enter</kbd> to start your research
          </p>
        </section>

        {loading && (
          <section className="loading-card">
            <div className="loading-header">
              <div className="agent-orb">
                <div className="orb-core"></div>
              </div>

              <div>
                <h3>AI Research Agent is working</h3>
                <p>Searching, retrieving and synthesizing Wikipedia knowledge</p>
              </div>
            </div>

            <div className="pipeline">
              <div className="pipeline-step active">
                <div className="pipeline-icon">⌕</div>
                <span>FAISS</span>
                <small>Semantic Search</small>
              </div>

              <div className="pipeline-line"></div>

              <div className="pipeline-step active">
                <div className="pipeline-icon">✦</div>
                <span>Antigravity</span>
                <small>AI Research Agent</small>
              </div>

              <div className="pipeline-line"></div>

              <div className="pipeline-step active">
                <div className="pipeline-icon">◆</div>
                <span>Groq</span>
                <small>Final Answer</small>
              </div>
            </div>
          </section>
        )}

        {!loading && answer && (
          <section className="answer-card">
            <div className="section-heading">
              <div className="heading-icon ai-icon">✦</div>

              <div>
                <h2>AI Answer</h2>
                <span>Grounded in retrieved Wikipedia knowledge</span>
              </div>

              <div className="verified-badge">✓ Grounded</div>
            </div>

            <div className="answer-divider"></div>

            <p className="answer-text">{answer}</p>
          </section>
        )}

        {!loading && results.length > 0 && (
          <section className="results-section">
            <div className="section-heading">
              <div className="heading-icon">◫</div>

              <div>
                <h2>Research Sources</h2>
                <span>
                  {results.length} Wikipedia{" "}
                  {results.length === 1 ? "source" : "sources"} retrieved
                </span>
              </div>
            </div>

            <div className="results">
              {results.map((article, index) => (
                <article
                  className="result-card"
                  key={`${article.name || "article"}-${index}`}
                >
                  <div className="result-number">
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  <div className="result-content">
                    <div className="result-title-row">
                      <h3>{article.name || "Wikipedia Article"}</h3>
                      <span className="source-label">WIKIPEDIA</span>
                    </div>

                    <p>
                      {article.description ||
                        article.abstract ||
                        "No description available."}
                    </p>

                    <div className="result-footer">
                      <span className="score">
                        {typeof article.score === "number"
                          ? `Semantic match ${article.score.toFixed(3)}`
                          : "Wikipedia API"}
                      </span>

                      {article.url && (
                        <a href={article.url} target="_blank" rel="noreferrer">
                          Read article <span>↗</span>
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {!loading && !answer && results.length === 0 && (
          <div className="empty-state">
            <div className="empty-visual">
              <div className="empty-ring ring-one"></div>
              <div className="empty-ring ring-two"></div>
              <div className="empty-core">✦</div>
            </div>

            <h2>Start exploring knowledge</h2>

            <p>
              Ask a question and let the research agent discover relevant
              Wikipedia information for you.
            </p>

            <div className="example-queries">
              <span>Try asking</span>

              <button onClick={() => useExample("Who was Albert Einstein?")}>
                Who was Albert Einstein?
              </button>

              <button
                onClick={() => useExample("What is artificial intelligence?")}
              >
                What is artificial intelligence?
              </button>

              <button
                onClick={() => useExample("How does photosynthesis work?")}
              >
                How does photosynthesis work?
              </button>

              <button
                onClick={() => useExample("What is the history of India?")}
              >
                What is the history of India?
              </button>
            </div>
          </div>
        )}

        <footer>
          <div className="footer-line"></div>
          <p>Wiki Smart Assistant</p>
          <span>Wikimedia Dataset · FAISS · RAG · Antigravity · Groq · React</span>
        </footer>
      </main>
    </div>
  );
}

export default App;