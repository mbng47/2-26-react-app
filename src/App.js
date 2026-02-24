import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

// TODO: Replace this with your own Spotify app client ID
// Create an app at https://developer.spotify.com/dashboard
// and set the Redirect URI to http://localhost:3000
const SPOTIFY_CLIENT_ID = process.env.REACT_APP_SPOTIFY_CLIENT_ID;
const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const SPOTIFY_REDIRECT_URI = `${window.location.origin}/callback`;
const SPOTIFY_SCOPES = ['user-top-read'];

function buildAuthUrl() {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'token',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES.join(' '),
    show_dialog: 'true',
  });

  return `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
}

function parseTokenFromHash(hash) {
  if (!hash.startsWith('#')) return null;

  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get('access_token');
  const expiresIn = params.get('expires_in');

  if (!accessToken) return null;

  const expiresAt = expiresIn
    ? Date.now() + Number(expiresIn) * 1000
    : Date.now() + 3600 * 1000;

  return { accessToken, expiresAt };
}

function getStoredToken() {
  try {
    const raw = window.localStorage.getItem('spotify_token');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) {
      window.localStorage.removeItem('spotify_token');
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeToken(token) {
  window.localStorage.setItem('spotify_token', JSON.stringify(token));
}

async function fetchTopArtists(accessToken) {
  const response = await fetch(
    'https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const message = `Spotify API error (${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  return data.items || [];
}

function aggregateGenresFromArtists(artists) {
  const counts = {};

  artists.forEach((artist) => {
    if (!artist.genres) return;
    artist.genres.forEach((genre) => {
      const key = genre.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
  });

  const entries = Object.entries(counts).map(([genre, count]) => ({
    genre,
    count,
  }));

  entries.sort((a, b) => b.count - a.count);
  return entries;
}

function GenreBars({ genres }) {
  const maxCount = useMemo(
    () => (genres.length ? Math.max(...genres.map((g) => g.count)) : 0),
    [genres]
  );

  if (!genres.length) {
    return <p className="App-empty">No genres found yet. Try listening to more music on Spotify.</p>;
  }

  return (
    <div className="Genres-container">
      {genres.map((g) => {
        const widthPercent = maxCount ? (g.count / maxCount) * 100 : 0;
        return (
          <div key={g.genre} className="Genre-row">
            <div className="Genre-label">
              <span>{g.genre}</span>
              <span className="Genre-count">{g.count}</span>
            </div>
            <div className="Genre-bar-background">
              <div
                className="Genre-bar-fill"
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [token, setToken] = useState(() => getStoredToken());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [genres, setGenres] = useState([]);

  // Handle OAuth redirect fragment once on load
  useEffect(() => {
    if (!window.location.hash) {
      return;
    }

    const tokenFromHash = parseTokenFromHash(window.location.hash);
    if (tokenFromHash) {
      storeToken(tokenFromHash);
      setToken(tokenFromHash);
    }

    // Clean up the URL so the hash isn't visible
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.search
    );
  }, []);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function loadGenres() {
      setLoading(true);
      setError('');

      try {
        const artists = await fetchTopArtists(token.accessToken);
        if (cancelled) return;
        const aggregated = aggregateGenresFromArtists(artists);
        setGenres(aggregated);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load genres from Spotify.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadGenres();

    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleConnectClick() {
    if (!SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID === 'YOUR_SPOTIFY_CLIENT_ID_HERE') {
      alert(
        'Please set your Spotify client ID in src/App.js before connecting.'
      );
      return;
    }
    window.location.href = buildAuthUrl();
  }

  function handleLogout() {
    window.localStorage.removeItem('spotify_token');
    setToken(null);
    setGenres([]);
    setError('');
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="App-header-top">
          <h1 className="App-title">Your Spotify Genre Map</h1>
          {token ? (
            <button className="App-button App-button-secondary" onClick={handleLogout}>
              Disconnect
            </button>
          ) : null}
        </div>

        {!token && (
          <div className="App-panel">
            <p>
              Connect your Spotify account to see a visual breakdown of the genres
              you listen to most, based on your top artists.
            </p>
            <button className="App-button" onClick={handleConnectClick}>
              Connect with Spotify
            </button>
            <p className="App-helper">
              You&apos;ll be redirected to Spotify to authorize this app, then brought
              back here.
            </p>
          </div>
        )}

        {token && (
          <div className="App-content">
            {loading && <p className="App-status">Loading your genres from Spotify…</p>}
            {error && <p className="App-error">{error}</p>}
            {!loading && !error && (
              <>
                <p className="App-subtitle">
                  These genres are calculated from your top Spotify artists (last few months).
                </p>
                <GenreBars genres={genres} />
              </>
            )}
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
