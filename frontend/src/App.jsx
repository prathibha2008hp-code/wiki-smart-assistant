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
      setAnswer("Could not connect to the backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="container">

        <h1>📚 Wiki Smart Assistant</h1>

        <p className="subtitle">
          Ask questions and search Wikipedia using AI-powered semantic search
        </p>

        <div className="search-box">
          <input
            type="text"
            placeholder="Ask something about Wikipedia..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                searchWiki();
              }
            }}
          />

          <button onClick={searchWiki} disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {answer && (
          <div className="answer-card">
            <h2>🤖 Answer</h2>
            <p>{answer}</p>
          </div>
        )}

        <div className="results">

          {results.length > 0 && (
            <h2 className="results-title">
              📖 Related Articles
            </h2>
          )}

          {results.map((article, index) => (
            <div className="result-card" key={index}>

              <h2>{article.name}</h2>

              <p>
                {article.description ||
                  article.abstract ||
                  "No description available."}
              </p>

              <div className="score">
                Similarity: {article.score.toFixed(3)}
              </div>

              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read Wikipedia →
                </a>
              )}

            </div>
          ))}

        </div>

      </div>
    </div>
  );
}

export default App;