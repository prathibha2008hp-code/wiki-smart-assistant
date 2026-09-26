import { useState } from "react";
import "./App.css";

function App() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchWiki = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setAnswer("");
    setResults([]);

    try {
      const response = await fetch("http://127.0.0.1:8000/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query,
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
      console.error(error);
      setAnswer(
        "Could not connect to the backend. Please make sure the server is running."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      searchWiki();
    }
  };

  return (
    <div className="app">
      <div className="background-glow glow-one"></div>
      <div className="background-glow glow-two"></div>

      <main className="container">

        {/* Header */}
        <header className="hero">
          <div className="logo">📚</div>

          <h1>Wiki Smart Assistant</h1>

          <p>
            Ask questions and discover Wikipedia knowledge using
            AI-powered semantic search.
          </p>
        </header>

        {/* Search */}
        <section className="search-section">
          <div className="search-box">

            <input
              type="text"
              placeholder="Ask something about Wikipedia..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />

            <button
              onClick={searchWiki}
              disabled={loading || !query.trim()}
            >
              {loading ? "Searching..." : "Search"}
            </button>

          </div>

          <p className="search-hint">
            Press Enter to search
          </p>
        </section>

        {/* Loading */}
        {loading && (
          <div className="loading-card">
            <div className="spinner"></div>

            <h3>Searching Wikipedia...</h3>

            <p>
              Finding the most relevant articles for your question.
            </p>
          </div>
        )}

        {/* Answer */}
        {!loading && answer && (
          <section className="answer-card">

            <div className="section-heading">
              <span className="heading-icon">🤖</span>

              <div>
                <h2>Answer</h2>
                <span>Based on relevant Wikipedia articles</span>
              </div>
            </div>

            <p className="answer-text">
              {answer}
            </p>

          </section>
        )}

        {/* Related Articles */}
        {!loading && results.length > 0 && (
          <section className="results-section">

            <div className="section-heading">
              <span className="heading-icon">📖</span>

              <div>
                <h2>Related Articles</h2>
                <span>
                  Wikipedia articles related to your question
                </span>
              </div>
            </div>

            <div className="results">

              {results.map((article, index) => (
                <article
                  className="result-card"
                  key={`${article.name}-${index}`}
                >

                  <div className="result-number">
                    {index + 1}
                  </div>

                  <div className="result-content">

                    <h3>
                      {article.name || "Wikipedia Article"}
                    </h3>

                    <p>
                      {article.description ||
                        article.abstract ||
                        "No description available."}
                    </p>

                    <div className="result-footer">

                      <span className="score">
                        Similarity:{" "}
                        {typeof article.score === "number"
                          ? article.score.toFixed(3)
                          : "N/A"}
                      </span>

                      {article.url && (
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Read on Wikipedia →
                        </a>
                      )}

                    </div>

                  </div>

                </article>
              ))}

            </div>

          </section>
        )}

        {/* Empty state */}
        {!loading && !answer && results.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔎</div>

            <h2>Start exploring</h2>

            <p>
              Ask a question above and discover relevant
              Wikipedia knowledge.
            </p>
          </div>
        )}

        {/* Footer */}
        <footer>
          <p>
            Wiki Smart Assistant • Semantic Search • FAISS • FastAPI • React
          </p>
        </footer>

      </main>
    </div>
  );
}

export default App;