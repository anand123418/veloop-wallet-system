import { useEffect, useState } from "react";
import { api } from "../api.js";
import { ErrorBox, Loading } from "../components/State.jsx";
import DemoAdPlayer from "../components/DemoAdPlayer.jsx";

const fmt = (amount) => Number(amount).toLocaleString("en-IN");
const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const formatDailyReset = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : formatTime(seconds);
};
const RPS_CHOICES = [
  { id: "rock", label: "Stone", symbol: "✊" },
  { id: "paper", label: "Paper", symbol: "✋" },
  { id: "scissors", label: "Scissors", symbol: "✌️" },
];

function hintText(hint) {
  if (hint === "HIGHER") return "Go higher";
  if (hint === "LOWER") return "Go lower";
  return "Try another number";
}

export default function Games() {
  const [game, setGame] = useState(null);
  const [numberGuessDaily, setNumberGuessDaily] = useState(null);
  const [stonePaperScissors, setStonePaperScissors] = useState(null);
  const [selectedGame, setSelectedGame] = useState("number_guess");
  const [challenge, setChallenge] = useState(null);
  const [selectedGuess, setSelectedGuess] = useState(null);
  const [guessKey, setGuessKey] = useState("");
  const [challengeKey, setChallengeKey] = useState("");
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rpsChoice, setRpsChoice] = useState("");
  const [rpsBusy, setRpsBusy] = useState(false);
  const [rpsLastPlay, setRpsLastPlay] = useState(null);
  const [rpsKey, setRpsKey] = useState("");
  const [showDemoAd, setShowDemoAd] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getGames();
      setGame(data.games?.[0] || null);
      setNumberGuessDaily(data.numberGuess);
      setStonePaperScissors(data.stonePaperScissors);
      setRpsLastPlay(data.stonePaperScissors?.recentPlays?.[0] || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (challenge?.status !== "ACTIVE") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge?.status, challenge?.expiresAt]);

  useEffect(() => {
    if (selectedGame !== "stone_paper_scissors") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedGame]);

  useEffect(() => {
    if (selectedGame !== "number_guess" || !numberGuessDaily?.resetsAt) return undefined;
    const resetDelay = Math.max(0, new Date(numberGuessDaily.resetsAt).getTime() - Date.now()) + 500;
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.getGames();
        setGame(data.games?.[0] || null);
        setNumberGuessDaily(data.numberGuess);
        setNow(Date.now());
      } catch (err) {
        setError(err.message);
      }
    }, resetDelay);
    return () => window.clearTimeout(timer);
  }, [selectedGame, numberGuessDaily?.resetsAt]);

  useEffect(() => {
    if (selectedGame !== "number_guess" || !numberGuessDaily?.resetsAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [selectedGame, numberGuessDaily?.resetsAt]);

  useEffect(() => {
    if (selectedGame !== "stone_paper_scissors" || !stonePaperScissors?.resetsAt) return undefined;
    const resetDelay = Math.max(0, new Date(stonePaperScissors.resetsAt).getTime() - Date.now()) + 500;
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.getGames();
        setStonePaperScissors(data.stonePaperScissors);
        setRpsLastPlay(data.stonePaperScissors?.recentPlays?.[0] || null);
        setNow(Date.now());
      } catch (err) {
        setError(err.message);
      }
    }, resetDelay);
    return () => window.clearTimeout(timer);
  }, [selectedGame, stonePaperScissors?.resetsAt]);

  const playStonePaperScissors = async () => {
    if (rpsBusy || !rpsChoice || stonePaperScissors?.playsRemaining < 1) return;
    setRpsBusy(true);
    setError("");
    setNotice("");
    const key = rpsKey || crypto.randomUUID();
    setRpsKey(key);
    try {
      const data = await api.playStonePaperScissors(rpsChoice, key);
      setStonePaperScissors(data.daily);
      setRpsLastPlay(data.play);
      setRpsKey("");
      setRpsChoice("");
      setShowDemoAd(true);
      if (data.play.outcome === "WIN") {
        setNotice(`You win! ${fmt(data.play.rewardAmount)} VEs have been added to your wallet.`);
        window.dispatchEvent(new Event("veloop:wallet-updated"));
      } else if (data.play.outcome === "TIE") {
        setNotice("It’s a tie! No VEs were awarded this round.");
      } else {
        setNotice("Your opponent wins this round. Try again while you have rounds left today.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRpsBusy(false);
    }
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const key = challengeKey || crypto.randomUUID();
    setChallengeKey(key);
    try {
      const data = await api.createGameChallenge(key);
      setChallenge(data.challenge);
      setNumberGuessDaily(data.daily);
      setNow(Date.now());
      setSelectedGuess(null);
      setGuessKey("");
      setChallengeKey("");
    } catch (err) {
      setError(err.message);
      if (err.status === 429) {
        try {
          const data = await api.getGames();
          setNumberGuessDaily(data.numberGuess);
        } catch (refreshError) {
          setError(refreshError.message);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const submitGuess = async () => {
    if (busy || !challenge || selectedGuess === null) return;
    setBusy(true);
    setError("");
    const key = guessKey || crypto.randomUUID();
    setGuessKey(key);
    try {
      const data = await api.submitGameGuess(challenge.challengeId, selectedGuess, key);
      setChallenge(data.challenge);
      setGuessKey("");
      setSelectedGuess(null);
      if (["WON", "LOST", "EXPIRED"].includes(data.attempt?.status) || data.challenge.status === "EXPIRED") {
        setShowDemoAd(true);
      }
      if (data.attempt?.status === "WON") {
        setNotice(`Correct! You won ${fmt(data.attempt.rewardAmount)} VEs.`);
        window.dispatchEvent(new Event("veloop:wallet-updated"));
      } else if (data.attempt?.status === "LOST") {
        setNotice(`No more guesses. The number was ${data.challenge.targetNumber}.`);
      } else if (data.attempt?.status === "EXPIRED" || data.challenge.status === "EXPIRED") {
        setNotice("This challenge expired. Start a new game to play again.");
      } else if (data.attempt?.correct === false) {
        setNotice(`${hintText(data.attempt.hint)}. ${data.attempt.attemptsRemaining} guess(es) remaining.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remainingSeconds = challenge?.status === "ACTIVE"
    ? Math.max(0, Math.ceil((new Date(challenge.expiresAt).getTime() - now) / 1000))
    : 0;
  const expired = Boolean(challenge && challenge.status === "ACTIVE" && remainingSeconds === 0);
  const active = challenge?.status === "ACTIVE" && !expired;
  const guesses = challenge?.guesses || [];
  const maxAttempts = challenge?.maxAttempts || game?.maxAttempts || 0;
  const attemptsRemaining = challenge?.attemptsRemaining ?? maxAttempts;
  const numberGuessSecondsUntilReset = numberGuessDaily?.resetsAt
    ? Math.max(0, Math.ceil((new Date(numberGuessDaily.resetsAt).getTime() - now) / 1000))
    : 0;

  useEffect(() => {
    if (selectedGame === "number_guess" && expired) setShowDemoAd(true);
  }, [expired, selectedGame]);

  if (loading) return <Loading label="Loading games…" />;
  if (error && !game) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="game-page">
      {showDemoAd && (
        <DemoAdPlayer
          durationSeconds={5}
          title="Thanks for playing VELoop"
          claimReady
          claimLabel="Continue to games"
          onClaim={() => setShowDemoAd(false)}
        />
      )}
      <div className="game-mode-selector" role="group" aria-label="Choose a game">
        <button type="button" className={selectedGame === "number_guess" ? "active" : ""}
          aria-pressed={selectedGame === "number_guess"} onClick={() => { setSelectedGame("number_guess"); setError(""); setNotice(""); }}>
          <span aria-hidden="true">◈</span><span><strong>Number Guess</strong><small>Use clues to find the number</small></span>
        </button>
        <button type="button" className={selectedGame === "stone_paper_scissors" ? "active" : ""}
          aria-pressed={selectedGame === "stone_paper_scissors"} onClick={() => { setSelectedGame("stone_paper_scissors"); setError(""); setNotice(""); }}>
          <span aria-hidden="true">✊</span><span><strong>Stone Paper Scissors</strong><small>Play up to five rounds each day</small></span>
        </button>
      </div>
      {error && <p className="field-error game-alert" role="alert">{error}</p>}
      {notice && <p className="game-notice" role="status">{notice}</p>}
      {selectedGame === "stone_paper_scissors" ? (
        stonePaperScissors ? (
          <>
            <section className="rps-hero">
              <div>
                <p className="game-eyebrow"><span aria-hidden="true">✦</span> DAILY DUEL</p>
                <h2>Stone Paper Scissors</h2>
                <p>Pick your move and see if you can beat the VELoop opponent.</p>
                <div className="rps-reward-chip">Win <strong>{fmt(stonePaperScissors.rewardVes)} VEs</strong> each round</div>
              </div>
              <div className="rps-hero-symbols" aria-hidden="true">
                <span>✊</span><span>✋</span><span>✌️</span>
              </div>
            </section>

            <div className="rps-dashboard">
              <section className="card rps-play-card">
                <div className="rps-card-heading">
                  <div><p className="game-section-label">YOUR MOVE</p><h3>Choose your hand</h3></div>
                  <span className="rps-rounds-badge">{stonePaperScissors.playsRemaining} / {stonePaperScissors.dailyLimit} left today</span>
                </div>
                <p className="muted rps-description">Each round uses one daily play. Wins earn VEs; ties and losses don’t.</p>
                <div className="rps-choices" role="group" aria-label="Choose rock, paper, or scissors">
                  {RPS_CHOICES.map((choice) => (
                    <button key={choice.id} type="button"
                      className={`rps-choice ${rpsChoice === choice.id ? "selected" : ""}`}
                      onClick={() => { setRpsChoice(choice.id); setRpsKey(crypto.randomUUID()); }}
                      disabled={rpsBusy || stonePaperScissors.playsRemaining < 1}
                      aria-pressed={rpsChoice === choice.id}>
                      <span className="rps-choice-symbol" aria-hidden="true">{choice.symbol}</span>
                      <strong>{choice.label}</strong>
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary rps-play-button" onClick={playStonePaperScissors}
                  disabled={rpsBusy || !rpsChoice || stonePaperScissors.playsRemaining < 1}>
                  {rpsBusy ? "Playing round…" : stonePaperScissors.playsRemaining < 1 ? "Daily rounds used" : "Play round"}
                  {!rpsBusy && stonePaperScissors.playsRemaining > 0 && <span aria-hidden="true">→</span>}
                </button>
                <p className="rps-reset-note">
                  {stonePaperScissors.playsRemaining > 0
                    ? `Rounds reset in ${formatDailyReset(Math.max(0, Math.ceil((new Date(stonePaperScissors.resetsAt).getTime() - now) / 1000)))}`
                    : `Your next rounds are available at ${new Date(stonePaperScissors.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })}`}
                </p>
              </section>

              {rpsLastPlay && (
                <section className={`card rps-result-card rps-result-${rpsLastPlay.outcome.toLowerCase()}`} aria-live="polite">
                  <p className="game-section-label">LATEST ROUND</p>
                  <h3>{rpsLastPlay.outcome === "WIN" ? "You win!" : rpsLastPlay.outcome === "TIE" ? "It’s a tie!" : "Opponent wins"}</h3>
                  <div className="rps-versus">
                    <div><span>{RPS_CHOICES.find((choice) => choice.id === rpsLastPlay.playerChoice)?.symbol}</span><small>You</small></div>
                    <strong>VS</strong>
                    <div><span>{RPS_CHOICES.find((choice) => choice.id === rpsLastPlay.opponentChoice)?.symbol}</span><small>VELoop</small></div>
                  </div>
                  {rpsLastPlay.outcome === "WIN"
                    ? <p className="rps-outcome-reward">+{fmt(rpsLastPlay.rewardAmount)} VEs earned</p>
                    : <p className="muted rps-outcome-reward">{rpsLastPlay.outcome === "TIE" ? "No reward for a tie." : "No reward this round."}</p>}
                </section>
              )}
            </div>

            <section className="card rps-history-card">
              <div className="game-history-heading">
                <h4>Today’s rounds</h4>
                <span>{stonePaperScissors.playsUsed} played</span>
              </div>
              {stonePaperScissors.recentPlays.length === 0 ? (
                <p className="muted rps-empty-history">Your rounds will appear here after you play.</p>
              ) : (
                <div className="rps-history-list">
                  {stonePaperScissors.recentPlays.map((play) => (
                    <div className="rps-history-item" key={play.playId}>
                      <span className={`rps-history-outcome ${play.outcome.toLowerCase()}`}>{play.outcome}</span>
                      <span>{RPS_CHOICES.find((choice) => choice.id === play.playerChoice)?.symbol} <span aria-hidden="true">vs</span> {RPS_CHOICES.find((choice) => choice.id === play.opponentChoice)?.symbol}</span>
                      <strong>{play.rewardAmount > 0 ? `+${fmt(play.rewardAmount)} VEs` : "—"}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="card game-empty"><p className="muted">Loading daily game status…</p></section>
        )
      ) : !game ? (
        <section className="card game-empty">
          <span className="game-empty-icon" aria-hidden="true">◈</span>
          <h2>No games available</h2>
          <p className="muted">Check back later for new wallet challenges.</p>
        </section>
      ) : (
        <>
          <section className="game-hero">
            <div className="game-hero-copy">
              <p className="game-eyebrow"><span aria-hidden="true">✦</span> VELOOP MINI-GAME</p>
              <h2>{game.name}</h2>
              <p>{game.description} Use the clues to find the hidden number.</p>
            </div>
            <div className="game-prize" aria-label={`Reward ${fmt(game.rewardVes)} VEs`}>
              <span className="game-prize-icon" aria-hidden="true">✦</span>
              <span className="game-prize-caption">REWARD</span>
              <strong>+{fmt(game.rewardVes)}</strong>
              <span className="game-prize-unit">VEs</span>
            </div>
            <span className="game-orbit game-orbit-one" aria-hidden="true" />
            <span className="game-orbit game-orbit-two" aria-hidden="true" />
          </section>

          <section className={`card game-card ${active ? "game-card-active" : ""}`}>
            <div className="game-card-heading">
              <div>
                <p className="game-section-label">NUMBER CHALLENGE</p>
                <h3>{active ? "Find the hidden number" : challenge ? "Round complete" : "Ready to play?"}</h3>
              </div>
              {active ? (
                <span className={`game-timer ${remainingSeconds <= 60 ? "game-timer-urgent" : ""}`}
                  aria-label={`Time remaining: ${formatTime(remainingSeconds)}`}>
                  <span aria-hidden="true">◷</span> {formatTime(remainingSeconds)}
                </span>
              ) : challenge ? (
                <span className={`game-status game-status-${expired ? "expired" : challenge.status.toLowerCase()}`}>
                  {expired ? "EXPIRED" : challenge.status}
                </span>
              ) : null}
            </div>
            <div className="number-guess-daily" aria-live="polite">
              <span>{numberGuessDaily?.playsRemaining ?? 0} / {numberGuessDaily?.dailyLimit ?? game.dailyLimit} rounds left today</span>
              <span>Win {fmt(game.rewardVes)} VEs per round</span>
            </div>

            {active ? (
              <>
                <div className="game-range" aria-label={`Choose a number from ${challenge.minNumber} to ${challenge.maxNumber}`}>
                  <span>{challenge.minNumber}</span>
                  <span className="game-range-line" />
                  <span>{challenge.maxNumber}</span>
                </div>
                <p className="game-instructions">
                  Pick a number from <strong>{challenge.minNumber}–{challenge.maxNumber}</strong>.
                  You have <strong>{attemptsRemaining}</strong> {attemptsRemaining === 1 ? "guess" : "guesses"} left.
                </p>
                <div className="game-attempts" aria-label={`${challenge.attemptsUsed} of ${maxAttempts} guesses used`}>
                  {Array.from({ length: maxAttempts }, (_, index) => (
                    <span key={index} className={`game-attempt-dot ${index < challenge.attemptsUsed ? "used" : ""}`} />
                  ))}
                  <span>{challenge.attemptsUsed} / {maxAttempts} used</span>
                </div>
                <div className="guess-options" role="group" aria-label="Choose a number">
                  {Array.from(
                    { length: challenge.maxNumber - challenge.minNumber + 1 },
                    (_, index) => challenge.minNumber + index
                  ).map((number) => (
                    <button
                      type="button"
                      className={`guess-option ${selectedGuess === number ? "selected" : ""}`}
                      key={number}
                      onClick={() => { setSelectedGuess(number); setGuessKey(crypto.randomUUID()); }}
                      disabled={busy}
                      aria-pressed={selectedGuess === number}
                    >
                      {number}
                    </button>
                  ))}
                </div>
                <button className="btn btn-primary game-submit" onClick={submitGuess} disabled={busy || selectedGuess === null}>
                  {busy ? "Checking your guess…" : selectedGuess === null ? "Choose a number" : `Submit ${selectedGuess}`}
                  {!busy && <span aria-hidden="true">→</span>}
                </button>
              </>
            ) : (
              <div className="game-ready">
                <p className="muted">
                  {expired
                    ? "The timer ran out. Start a fresh round when you’re ready."
                    : challenge?.status === "WON"
                      ? "Great guessing! Your reward has been added to your wallet."
                      : challenge?.status === "LOST"
                        ? "That was a close one. Try another round and use the clues."
                        : "Guess correctly before your attempts run out to win VEs."}
                </p>
                <button className="btn btn-primary game-submit" onClick={start}
                  disabled={busy || (numberGuessDaily?.playsRemaining ?? 0) < 1}>
                  {busy ? "Preparing your game…" : (numberGuessDaily?.playsRemaining ?? 0) < 1 ? "Daily rounds used" : challenge ? "Play again" : "Start a new game"}
                  {!busy && <span aria-hidden="true">→</span>}
                </button>
                {(numberGuessDaily?.playsRemaining ?? 0) < 1 && (
                  <p className="number-guess-reset">Your next rounds are available in {formatDailyReset(numberGuessSecondsUntilReset)} (UTC).</p>
                )}
              </div>
            )}

            {guesses.length > 0 && (
              <div className="game-history">
                <div className="game-history-heading">
                  <h4>Your guesses</h4>
                  <span>{guesses.length} {guesses.length === 1 ? "try" : "tries"}</span>
                </div>
                <ol className="game-guess-list">
                  {guesses.map((attempt, index) => (
                    <li key={`${attempt.createdAt || index}-${index}`}
                      className={`game-guess-item ${attempt.correct ? "correct" : ""}`}>
                      <span className="game-guess-number">{attempt.guess}</span>
                      <span className="game-guess-result">
                        {attempt.correct ? "Correct guess" : hintText(attempt.hint)}
                      </span>
                      <span className={`game-guess-hint ${attempt.correct ? "correct" : ""}`}>
                        {attempt.correct ? "WON" : `#${index + 1}`}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          <p className="game-footnote">
            Demo rules: {game.maxAttempts} guesses · {game.challengeTtlMinutes}-minute rounds ·
            {` ${fmt(game.rewardVes)} VEs per win`}
          </p>
        </>
      )}
    </div>
  );
}
