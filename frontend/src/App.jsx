import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { LANGUAGES, LANGUAGE_STORAGE_KEY, translations } from "./translations";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const CHAT_STORAGE_KEY = "wiki-smart-assistant-chat";
const HISTORY_STORAGE_KEY = "wiki-smart-assistant-history";
const THEME_STORAGE_KEY = "wiki-smart-assistant-theme";
const MAX_CONTEXT_MESSAGES = 6;
const MAX_HISTORY_ITEMS = 50;

function sanitizeTopic(value) {
  if (!value) return "";

  return value
    .replace(/[?!.]/g, "")
    .replace(/^(what|who|how|when|where|why|which)\s+(is|are|was|were|does|do|did|can|should|would|will)\s+/i, "")
    .replace(/^the\s+/i, "")
    .trim();
}

function buildSuggestions(query, results, text) {
  const primaryTopic = sanitizeTopic(results?.[0]?.name || query);
  const topic = primaryTopic || sanitizeTopic(query);

  if (!topic) {
    return [];
  }

  const templates = [
    text.suggestionFacts(topic),
    text.suggestionHistory(topic),
    text.suggestionHow(topic),
    text.suggestionEvents(topic),
  ];

  const unique = [...new Set(templates.map((item) => item.trim()))];
  return unique.slice(0, 4);
}

function cleanTextForSpeech(text) {
  return String(text || "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchWikipediaPreview(title) {
  const cleanTitle = sanitizeTopic(title || "");

  if (!cleanTitle) {
    return null;
  }

  try {
    const encodedTitle = encodeURIComponent(cleanTitle);
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data?.title) {
      return null;
    }

    return {
      title: data.title,
      description: data.description || "Wikipedia summary",
      extract: data.extract || "",
      thumbnail: data.thumbnail?.source || "",
      url: data.content_urls?.desktop?.page || data.content_urls?.mobile?.page || "",
      categories: Array.isArray(data.categories) ? data.categories : [],
    };
  } catch (error) {
    console.error("Wikipedia preview error:", error);
    return null;
  }
}

function App() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [results, setResults] = useState([]);
  const [featuredArticle, setFeaturedArticle] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState(() => {
    try {
      const savedMessages = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || "[]");
      return Array.isArray(savedMessages) ? savedMessages : [];
    } catch (error) {
      console.error("Failed to restore chat history:", error);
      return [];
    }
  });
  const [history, setHistory] = useState(() => {
    try {
      const savedHistory = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || "[]");
      return Array.isArray(savedHistory) ? savedHistory : [];
    } catch (error) {
      console.error("Failed to restore search history:", error);
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "dark";
      return savedTheme === "light" ? "light" : "dark";
    } catch (error) {
      console.error("Failed to restore theme:", error);
      return "dark";
    }
  });
  const [language, setLanguage] = useState(() => {
    try {
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return translations[savedLanguage] ? savedLanguage : "en";
    } catch (error) {
      console.error("Failed to restore language:", error);
      return "en";
    }
  });
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [shareNotice, setShareNotice] = useState("");
  const recognitionRef = useRef(null);
  const shareNoticeTimerRef = useRef(null);
  const text = translations[language];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(
    () => () => {
      window.clearTimeout(shareNoticeTimerRef.current);
      window.speechSynthesis?.cancel();
      recognitionRef.current?.stop();
    },
    []
  );

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    } else {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  }, [messages]);

  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } else {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    }
  }, [history]);

  useEffect(() => {
    let isCancelled = false;

    async function loadFeaturedArticle() {
      if (!results.length) {
        setFeaturedArticle(null);
        return;
      }

      const article = results[0];
      const preview = await fetchWikipediaPreview(article.name || article.title || article.url);

      if (!isCancelled) {
        setFeaturedArticle(preview);
      }
    }

    loadFeaturedArticle();

    return () => {
      isCancelled = true;
    };
  }, [results]);

  const recentContext = useMemo(
    () => messages.slice(-MAX_CONTEXT_MESSAGES),
    [messages]
  );

  const updateHistory = (entry) => {
    setHistory((previous) => {
      const normalized = entry.trim();
      if (!normalized) return previous;

      const deduped = previous.filter(
        (item) => item.toLowerCase() !== normalized.toLowerCase()
      );

      return [normalized, ...deduped].slice(0, MAX_HISTORY_ITEMS);
    });
  };

  const clearConversation = () => {
    setMessages([]);
    setAnswer("");
    setResults([]);
    setFeaturedArticle(null);
    setSuggestions([]);
    setQuery("");
    setLoading(false);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  };

  const runSearch = async (searchQuery) => {
    const trimmed = searchQuery.trim();

    if (!trimmed || loading) {
      return;
    }

    setLoading(true);
    setAnswer("");
    setResults([]);
    setFeaturedArticle(null);
    setSuggestions([]);

    try {
      const response = await fetch(`${API_URL}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: trimmed,
          top_k: 5,
          history: recentContext,
          language,
        }),
      });

      if (!response.ok) {
        throw new Error("Search request failed");
      }

      const data = await response.json();
      const finalAnswer = data.answer || text.noAnswer;
      const nextResults = data.results || [];

      setAnswer(finalAnswer);
      setResults(nextResults);
      setSuggestions(buildSuggestions(trimmed, nextResults, text));
      updateHistory(trimmed);

      setMessages((previous) => {
        const next = [
          ...previous,
          { id: crypto.randomUUID(), role: "user", content: trimmed },
          { id: crypto.randomUUID(), role: "assistant", content: finalAnswer },
        ];

        return next.slice(-12);
      });
    } catch (error) {
      console.error("Search error:", error);
      setAnswer(text.connectError);
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

  const submitExample = (example) => {
    setQuery(example);
    runSearch(example);
  };

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const handleLanguageChange = (event) => {
    setLanguage(event.target.value);
    setVoiceStatus("");
  };

  const showShareNotice = (message) => {
    setShareNotice(message);
    window.clearTimeout(shareNoticeTimerRef.current);
    shareNoticeTimerRef.current = window.setTimeout(() => {
      setShareNotice("");
    }, 3500);
  };

  const shareAnswer = async () => {
    const shareUrl = window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Wiki Smart Assistant",
          text: answer,
          url: shareUrl,
        });
        showShareNotice(text.shared);
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          showShareNotice(text.shareCancelled);
          return;
        }
        console.error("Web Share failed:", error);
        showShareNotice(text.shareError);
        return;
      }
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is not available.");
      }

      await navigator.clipboard.writeText(answer);
      showShareNotice(text.copied);
    } catch (error) {
      console.error("Could not copy answer to clipboard:", error);
      showShareNotice(text.shareError);
    }
  };

  const toggleVoiceInput = () => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setVoiceStatus(text.voiceUnsupported);
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      setVoiceStatus(text.voiceStopped);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = language === "kn" ? "kn-IN" : language === "hi" ? "hi-IN" : "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus(text.voiceListening);
    };

    recognition.onresult = (event) => {
      let transcript = "";

      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }

      setQuery(transcript.trim());
      setVoiceStatus(text.voiceCaptured);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setVoiceStatus(text.voiceError);
    };

    recognition.onend = () => {
      setIsListening(false);
      setVoiceStatus(text.voiceReady);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const toggleSpeak = (messageId, content) => {
    if (!("speechSynthesis" in window)) {
      return;
    }

    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(content));
    utterance.lang = language === "kn" ? "kn-IN" : language === "hi" ? "hi-IN" : "en-US";

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeakingMessageId(messageId);

    utterance.onend = () => {
      setSpeakingMessageId(null);
    };

    utterance.onerror = () => {
      setSpeakingMessageId(null);
    };
  };

  const displayedMessages = messages.filter((message) => message.content?.trim());

  return (
    <div className="app-shell">
      <div className="background-glow glow-one"></div>
      <div className="background-glow glow-two"></div>

      <div className="page-layout">
        <aside className="history-panel">
          <div className="history-header">
            <div>
              <p className="eyebrow">{text.history}</p>
              <h2>{text.recentSearches}</h2>
            </div>
            <button type="button" className="small-button" onClick={clearHistory}>
              {text.clearHistory}
            </button>
          </div>

          <div className="history-list">
            {history.length === 0 ? (
              <p className="empty-history">{text.noSearches}</p>
            ) : (
              history.map((entry) => (
                <button
                  type="button"
                  key={entry}
                  className="history-item"
                  onClick={() => {
                    setQuery(entry);
                    runSearch(entry);
                  }}
                >
                  {entry}
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="content-column">
          <header className="top-bar">
            <div className="brand-block">
              <div className="logo">◈</div>
              <div>
                <p className="eyebrow">AI RESEARCH ASSISTANT</p>
                <h1>
                  Wiki Smart <span>Assistant</span>
                </h1>
              </div>
            </div>

            <div className="toolbar">
              <label className="language-control">
                <span>{text.language}</span>
                <select
                  value={language}
                  onChange={handleLanguageChange}
                  aria-label={text.language}
                >
                  {LANGUAGES.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="secondary-button" onClick={clearConversation}>
                {text.newChat}
              </button>
              <button type="button" className="icon-button" onClick={toggleTheme} aria-label={text.toggleTheme}>
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
            </div>
          </header>

          <section className="search-section">
            <div className="search-box">
              <div className="search-icon">⌕</div>
              <input
                type="text"
                placeholder={text.searchPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />

              <button
                type="button"
                className={isListening ? "voice-button active" : "voice-button"}
                onClick={toggleVoiceInput}
                aria-label={isListening ? text.stopVoice : text.startVoice}
                disabled={loading}
                title={isListening ? "Stop listening" : "Use voice input"}
              >
                {isListening ? "◉" : "🎤"}
              </button>

              <button type="button" onClick={searchWiki} disabled={loading || !query.trim()}>
                {loading ? (
                  <>
                    <span className="button-spinner"></span>
                    {text.loading}
                  </>
                ) : (
                  <>
                    {text.search} <span>→</span>
                  </>
                )}
              </button>
            </div>

            <div className="search-meta">
              <p className="search-hint">
                {text.pressEnter} <kbd>Enter</kbd> {text.toResearch}
              </p>
              <span className={`voice-status ${isListening ? "active" : ""}`}>
                {voiceStatus || text.voiceReady}
              </span>
            </div>
          </section>

          {loading && (
            <section className="loading-card" aria-live="polite">
              <div className="loading-header">
                <div className="agent-orb">
                  <div className="orb-core"></div>
                </div>
                <div>
                  <h3>{text.loadingTitle}</h3>
                  <p>{text.loadingDescription}</p>
                </div>
              </div>

              <div className="pipeline">
                <div className="pipeline-step active">
                  <div className="pipeline-icon">⌕</div>
                  <span>{text.semanticSearch}</span>
                </div>
                <div className="pipeline-line"></div>
                <div className="pipeline-step active">
                  <div className="pipeline-icon">✦</div>
                  <span>{text.answerSynthesis}</span>
                </div>
                <div className="pipeline-line"></div>
                <div className="pipeline-step active">
                  <div className="pipeline-icon">◆</div>
                  <span>{text.wikipediaContext}</span>
                </div>
              </div>
            </section>
          )}

          {displayedMessages.length > 0 && (
            <section className="conversation-panel">
              <div className="section-heading">
                <div className="heading-icon ai-icon">✦</div>
                <div>
                  <h2>{text.conversation}</h2>
                  <span>{text.currentTopicMemory}</span>
                </div>
              </div>

              <div className="message-list">
                {displayedMessages.map((message) => (
                  <div key={message.id} className={`message-row ${message.role}`}>
                    <div className="message-bubble">
                      <strong>{message.role === "user" ? text.you : text.assistant}</strong>
                      <p>{message.content}</p>
                    </div>

                    {message.role === "assistant" && (
                      <button
                        type="button"
                        className="read-aloud-button"
                        onClick={() => toggleSpeak(message.id, message.content)}
                        aria-label={text.readResponseAloud}
                      >
                        {speakingMessageId === message.id ? text.stopReading : text.readAloud}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!loading && answer && (
            <section className="answer-card">
              <div className="section-heading">
                <div className="heading-icon ai-icon">✦</div>
                <div>
                  <h2>{text.aiAnswer}</h2>
                  <span>{text.groundedDescription}</span>
                </div>
                <div className="answer-heading-actions">
                  <div className="verified-badge">✓ {text.grounded}</div>
                  <button
                    type="button"
                    className="share-button read-answer-button"
                    onClick={() => toggleSpeak("current-answer", answer)}
                    aria-label={
                      speakingMessageId === "current-answer"
                        ? text.stopReading
                        : text.readResponseAloud
                    }
                    aria-pressed={speakingMessageId === "current-answer"}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      focusable="false"
                    >
                      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
                      <path d="M17 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" />
                    </svg>
                    {speakingMessageId === "current-answer"
                      ? text.stopReading
                      : text.readAloud}
                  </button>
                  <button
                    type="button"
                    className="share-button"
                    onClick={shareAnswer}
                    aria-label={text.shareAnswerLabel}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.4" />
                    </svg>
                    {text.shareAnswer}
                  </button>
                </div>
              </div>

              <div className="answer-divider"></div>
              <p className="answer-text">{answer}</p>
              {shareNotice && (
                <div className="share-toast" role="status" aria-live="polite">
                  {shareNotice}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="suggestions-panel">
                  <h3>{text.suggestedFollowUps}</h3>
                  <div className="suggestion-list">
                    {suggestions.map((suggestion) => (
                      <button
                        type="button"
                        key={suggestion}
                        className="suggestion-pill"
                        onClick={() => {
                          setQuery(suggestion.replace(/\?$/, ""));
                          runSearch(suggestion.replace(/\?$/, ""));
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {featuredArticle && (
            <section className="preview-card">
              <div className="section-heading">
                <div className="heading-icon">◫</div>
                <div>
                  <h2>{text.wikipediaPreview}</h2>
                  <span>{text.relatedArticle}</span>
                </div>
              </div>

              <div className="preview-layout">
                {featuredArticle.thumbnail ? (
                  <img
                    src={featuredArticle.thumbnail}
                    alt={featuredArticle.title}
                    className="preview-image"
                  />
                ) : (
                  <div className="preview-placeholder">Wikipedia</div>
                )}

                <div className="preview-copy">
                  <h3>{featuredArticle.title}</h3>
                  <p>{featuredArticle.description || featuredArticle.extract || text.noDescription}</p>
                  {featuredArticle.categories?.length > 0 && (
                    <div className="category-list">
                      {featuredArticle.categories.slice(0, 3).map((category) => (
                        <span key={category} className="category-tag">
                          {category}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="preview-actions">
                    {featuredArticle.url ? (
                      <a href={featuredArticle.url} target="_blank" rel="noreferrer">
                        {text.readFullArticle}
                      </a>
                    ) : null}
                    <a href="https://en.wikipedia.org/" target="_blank" rel="noreferrer">
                      {text.wikipediaSource}
                    </a>
                  </div>
                </div>
              </div>
            </section>
          )}

          {!loading && results.length > 0 && (
            <section className="results-section">
              <div className="section-heading">
                <div className="heading-icon">◫</div>
                <div>
                  <h2>{text.researchSources}</h2>
                  <span>
                    {results.length} Wikipedia {results.length === 1 ? text.source : text.sources} {text.retrieved}
                  </span>
                </div>
              </div>

              <div className="results">
                {results.map((article, index) => (
                  <article className="result-card" key={`${article.name || "article"}-${index}`}>
                    <div className="result-number">{String(index + 1).padStart(2, "0")}</div>
                    <div className="result-content">
                      <div className="result-title-row">
                        <h3>{article.name || "Wikipedia article"}</h3>
                        <span className="source-label">WIKIPEDIA</span>
                      </div>

                      <p>{article.description || article.abstract || text.noDescription}</p>

                      <div className="result-footer">
                        <span className="score">
                          {typeof article.score === "number"
                            ? `${text.semanticMatch} ${article.score.toFixed(3)}`
                            : "Wikipedia API"}
                        </span>

                        {article.url && (
                          <a href={article.url} target="_blank" rel="noreferrer">
                            {text.readFullArticle} <span>↗</span>
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

              <h2>{text.emptyTitle}</h2>
              <p>
                {text.emptyDescription}
              </p>

              <div className="example-queries">
                <span>{text.tryAsking}</span>
                <button type="button" onClick={() => submitExample("Who was Albert Einstein?")}>
                  Who was Albert Einstein?
                </button>
                <button type="button" onClick={() => submitExample("What is artificial intelligence?")}>
                  What is artificial intelligence?
                </button>
                <button type="button" onClick={() => submitExample("How does photosynthesis work?")}>
                  How does photosynthesis work?
                </button>
                <button type="button" onClick={() => submitExample("What is the history of India?")}>
                  What is the history of India?
                </button>
              </div>
            </div>
          )}

          <footer>
            <div className="footer-line"></div>
            <p>Wiki Smart Assistant</p>
            <span>Wikimedia Dataset · FAISS · RAG · Groq · React</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default App;