import { useState } from "react";
import "./App.css";

function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchWiki = async () => {
    if (!query.trim()) return;

    setLoading(true);

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

      const data = await response.json();
      setResults(data.results || []);
    } catch (error) {
      console.error(error);
      alert("Could not connect to the backend.");
    }

    setLoading(false);
  };

  return (
    <div className="app">
      <div className="container">
        <h1>📚 Wiki Smart Assistant</h1>

        <p className="subtitle">
          Search Wikipedia using AI-powered semantic search
        </p>

        <div className="search-box">
          <input
            type="text"
            placeholder="Ask something about Wikipedia..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchWiki();
            }}
          />

          <button onClick={searchWiki}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="results">
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
                <a href={article.url} target="_blank" rel="noreferrer">
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