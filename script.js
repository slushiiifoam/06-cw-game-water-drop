// Core game rules.
const GAME_DURATION = 30;
const GOAL_SCORE = 20;

// Stage tuning controls how fast the game feels over time.
const STAGES = [
  {
    name: "Fresh Flow",
    label: "Stage 1: Fresh Flow",
    tip: "Drops are moving at a calm pace.",
    spawnDelay: 980,
    fallDuration: 5.2,
  },
  {
    name: "Rising Current",
    label: "Stage 2: Rising Current",
    tip: "Drops are falling faster!",
    spawnDelay: 760,
    fallDuration: 4,
  },
  {
    name: "Water Rush",
    label: "Stage 3: Water Rush",
    tip: "Final push! Fast drops incoming!",
    spawnDelay: 550,
    fallDuration: 3,
  },
];

// End-screen messages are chosen randomly to keep replays fresh.
const WIN_MESSAGES = [
  "Amazing work! Your gallons reached families with clean water.",
  "You did it! Every drop counted toward real impact.",
  "Goal unlocked! You powered through the rush and delivered hope.",
  "Great run! You collected enough gallons to make a difference.",
];

const LOSE_MESSAGES = [
  "So close. Try again and catch a few more clean drops.",
  "Keep going. Every replay helps you get closer to the 20-gallon goal.",
  "Nice attempt. Watch for polluted drops and build your streak.",
  "Almost there. One more run can push you over the goal.",
];

// Cache all DOM elements once so functions can reuse them quickly.
const gameContainer = document.getElementById("game-container");
const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const stageNameEl = document.getElementById("stage-name");
const stageTextEl = document.getElementById("stage-text");
const stageTipEl = document.getElementById("stage-tip");
const goalProgressEl = document.getElementById("goal-progress");
const canFillEl = document.getElementById("can-fill");
const endScreenEl = document.getElementById("end-screen");
const endTitleEl = document.getElementById("end-title");
const endMessageEl = document.getElementById("end-message");
const startBtn = document.getElementById("start-btn");
const resetBtn = document.getElementById("reset-btn");
const stageBannerEl = document.getElementById("stage-banner");

// Mutable runtime state for one game session.
let gameRunning = false;
let score = 0;
let timeLeft = GAME_DURATION;
let timerId = null;
let spawnTimeoutId = null;
let stageBannerTimeoutId = null;
let currentStageName = STAGES[0].name;

// Wire up user controls.
startBtn.addEventListener("click", startGame);
resetBtn.addEventListener("click", resetGame);

// Initial screen state before first run.
renderUI();
setStageUI(getCurrentStage());
hideStageBanner();

// Starts a new run by enabling gameplay loop, timer countdown, and drop spawning.
function startGame() {
  // Ignore start if a run is active or if timer already reached 0.
  if (gameRunning) return;
  if (timeLeft <= 0) return;

  // Enter active game mode.
  gameRunning = true;
  hideEndScreen();
  startBtn.disabled = true;

  // Show current stage banner briefly when run starts.
  showStageBanner(getCurrentStage());

  // Start countdown + drop generation loops.
  timerId = setInterval(tickTimer, 1000);
  scheduleNextDrop();
}

// Resets all gameplay state, clears effects, and returns UI to initial values.
function resetGame() {
  // Stop everything first so no old timers continue running.
  stopGameLoop();
  removeAllDropsAndEffects();

  // Restore initial values.
  score = 0;
  timeLeft = GAME_DURATION;
  gameRunning = false;

  // Reset controls and overlays.
  startBtn.disabled = false;

  hideEndScreen();
  hideStageBanner();
  renderUI();
  setStageUI(getCurrentStage());
  currentStageName = STAGES[0].name;
}

// Runs once per second to update time, stage transitions, and end-of-game checks.
function tickTimer() {
  // Safety guard if interval fires after game has ended.
  if (!gameRunning) return;

  // Decrement timer once per second and clamp at 0.
  timeLeft -= 1;
  if (timeLeft < 0) timeLeft = 0;

  // If stage changed (time threshold crossed), show banner again.
  const stage = getCurrentStage();
  if (stage.name !== currentStageName) {
    currentStageName = stage.name;
    showStageBanner(stage);
  }

  // Update HUD text each tick.
  renderUI();
  setStageUI(stage);

  // End run when timer finishes.
  if (timeLeft <= 0) {
    endGame();
  }
}

// Returns the current stage object based on remaining time.
function getCurrentStage() {
  // Stage changes by remaining time ranges.
  if (timeLeft > 20) return STAGES[0];
  if (timeLeft > 10) return STAGES[1];
  return STAGES[2];
}

// Spawns one drop now, then schedules the next spawn using stage pacing.
function scheduleNextDrop() {
  // Stop spawning if game is paused/ended.
  if (!gameRunning) return;

  // Spawn based on current stage pacing.
  const stage = getCurrentStage();
  createDrop(stage);

  // Small jitter prevents perfectly predictable rhythm.
  const randomJitter = Math.random() * 160;
  // Schedule next drop based on current stage's spawn delay + jitter.
  spawnTimeoutId = setTimeout(scheduleNextDrop, stage.spawnDelay + randomJitter);
}

// Creates one falling drop element, wires click behavior, and handles cleanup.
function createDrop(stage) {
  // 70% clean, 30% polluted.
  const isCleanDrop = (Math.random() * 10) < 7; 
  const drop = document.createElement("img");

  // Pick image asset based on drop type.
  drop.className = "drop";
  drop.src = isCleanDrop ? "img/cleanwaterdrop.png" : "img/pollutedwaterdrop.png";
  drop.alt = isCleanDrop ? "Clean water drop" : "Polluted water drop";

  // Random size + horizontal position within container bounds.
  const size = randomBetween(52, 84);
  const containerWidth = gameContainer.clientWidth;
  const containerHeight = gameContainer.clientHeight;

  drop.style.width = `${size}px`;
  drop.style.height = `${size}px`;
  // Ensure drop stays within container horizontally.
  drop.style.left = `${Math.random() * Math.max(1, containerWidth - size)}px`;
  drop.style.animationDuration = `${stage.fallDuration}s`;
  drop.style.setProperty("--fall-distance", `${containerHeight + size + 36}px`);

  // Prevent double counting if user taps repeatedly before removal.
  let clicked = false;
  // Handle clicks/taps on the drop for scoring and feedback.
  drop.addEventListener("pointerdown", (event) => {
    if (!gameRunning || clicked) return;
    clicked = true;

    // Clean gives +1, polluted gives -1.
    const points = isCleanDrop ? 1 : -1;
    applyScore(points);

    // Add quick feedback at click location.
    createSplash(event.clientX, event.clientY, isCleanDrop);
    createScorePop(event.clientX, event.clientY, points);

    // Freeze drop at its current visual position, then fade it out.
    // This avoids transform snapping artifacts while animation is active.
    const frozenTransform = window.getComputedStyle(drop).transform;
    drop.style.animation = "none";
    drop.style.transform = frozenTransform === "none" ? "translateY(0)" : frozenTransform;
    drop.style.transition = "transform 120ms ease, opacity 120ms ease, filter 120ms ease";
    drop.style.filter = isCleanDrop
      ? "drop-shadow(0 0 8px rgba(79, 203, 83, 0.85))"
      : "drop-shadow(0 0 8px rgba(245, 64, 44, 0.85))";
    drop.style.opacity = "0";
    setTimeout(() => drop.remove(), 120);
  });

  // Remove missed drops when fall animation completes.
  drop.addEventListener("animationend", () => {
    drop.remove();
  });

  gameContainer.appendChild(drop);
}

// Applies score changes and clamps score so it never goes below zero.
function applyScore(amount) {
  // Keep score from dropping below zero for cleaner UX.
  score += amount;
  if (score < 0) score = 0;

  renderUI();
}

// Re-renders dynamic HUD values like score, timer, stage label, and can fill.
function renderUI() {
  // Update basic counters.
  scoreEl.textContent = score;
  timeEl.textContent = timeLeft;

  // Fill the can based on progress toward GOAL_SCORE.
  const progressRatio = Math.min(score / GOAL_SCORE, 1);
  const progressPercent = Math.round(progressRatio * 100);
  goalProgressEl.textContent = `${progressPercent}%`;
  canFillEl.style.height = `${progressPercent}%`;

  // Small stage label in HUD.
  stageNameEl.textContent = getCurrentStage().name;
}

// Updates the stage banner text content for the active stage.
function setStageUI(stage) {
  // Text inside the yellow stage banner.
  stageTextEl.textContent = stage.label;
  stageTipEl.textContent = stage.tip;
}

// Ends the run, shows win/lose message, and triggers confetti when player wins.
function endGame() {
  // Stop loops and lock gameplay.
  stopGameLoop();
  gameRunning = false;

  // Reset button is now the only replay action.
  startBtn.disabled = true;
  hideStageBanner();

  // Choose message pool based on score goal.
  const playerWon = score >= GOAL_SCORE;
  const selectedMessage = pickRandom(playerWon ? WIN_MESSAGES : LOSE_MESSAGES);

  // Show end overlay.
  endTitleEl.textContent = playerWon ? "You Win!" : "Keep Going!";
  endMessageEl.textContent = selectedMessage;
  endScreenEl.classList.remove("hidden");

  // Celebrate wins with confetti.
  if (playerWon) {
    burstConfetti();
  }
}

// Hides the end-game overlay panel.
function hideEndScreen() {
  // Hide overlay when starting or resetting.
  endScreenEl.classList.add("hidden");
}

// Stops all active timers/timeouts used by gameplay and stage banner timing.
function stopGameLoop() {
  // Clear every active timer/timeout used by gameplay.
  clearInterval(timerId);
  clearTimeout(spawnTimeoutId);
  clearTimeout(stageBannerTimeoutId);
  timerId = null;
  spawnTimeoutId = null;
  stageBannerTimeoutId = null;
}

// Removes transient gameplay nodes (drops and visual effects) from the playfield.
function removeAllDropsAndEffects() {
  // Remove all transient nodes so reset starts cleanly.
  gameContainer.querySelectorAll(".drop, .splash, .score-pop").forEach((node) => {
    node.remove();
  });
}

// Creates a short-lived splash effect at the user's interaction point.
function createSplash(clientX, clientY, isCleanDrop) {
  // Spawn a small pulse exactly where player tapped/clicked.
  const splash = document.createElement("span");
  const { x, y } = toContainerPosition(clientX, clientY);

  splash.className = "splash";
  splash.style.left = `${x}px`;
  splash.style.top = `${y}px`;
  splash.style.backgroundColor = isCleanDrop ? "rgba(46, 157, 247, 0.55)" : "rgba(245, 64, 44, 0.55)";

  gameContainer.appendChild(splash);
  setTimeout(() => splash.remove(), 460);
}

// Creates floating +1/-1 feedback text at the interaction point.
function createScorePop(clientX, clientY, points) {
  // Floating +1 / -1 text near interaction point.
  const pop = document.createElement("span");
  const { x, y } = toContainerPosition(clientX, clientY);

  pop.className = `score-pop ${points > 0 ? "good" : "bad"}`;
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  pop.textContent = points > 0 ? "+1" : "-1";

  gameContainer.appendChild(pop);
  setTimeout(() => pop.remove(), 620);
}

// Converts viewport pointer coordinates into coordinates local to the game container.
function toContainerPosition(clientX, clientY) {
  // Convert viewport coordinates to playfield-local coordinates.
  const rect = gameContainer.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

// Generates a burst of animated confetti pieces for the win celebration.
function burstConfetti() {
  // Use canvas-confetti when available, scoped visually to the game area.
  if (typeof confetti !== "function") return;

  const rect = gameContainer.getBoundingClientRect();
  const colors = ["#ffc907", "#2e9df7", "#4fcb53", "#ff902a", "#f16061"];
  const centerX = (rect.left + rect.width / 2) / window.innerWidth;
  const topY = Math.max(0, rect.top / window.innerHeight);

  confetti({
    particleCount: 140,
    spread: 95,
    startVelocity: 42,
    ticks: 220,
    scalar: 0.95,
    zIndex: 20,
    colors,
    disableForReducedMotion: true,
    origin: { x: centerX, y: topY + 0.05 },
  });

  setTimeout(() => {
    confetti({
      particleCount: 90,
      spread: 120,
      startVelocity: 36,
      ticks: 180,
      scalar: 0.9,
      zIndex: 20,
      colors,
      disableForReducedMotion: true,
      origin: { x: centerX, y: topY + 0.08 },
    });
  }, 220);
}

// Returns a randomly selected item from a provided array.
function pickRandom(options) {
  // Return one random item from an array.
  return options[Math.floor(Math.random() * options.length)];
}

// Returns a random decimal between min (inclusive) and max (exclusive).
function randomBetween(min, max) {
  // Return random decimal in [min, max).
  return Math.random() * (max - min) + min;
}

// Shows the stage banner, updates its text, then auto-hides it after 5 seconds.
function showStageBanner(stage) {
  // Show the stage banner for 5 seconds.
  setStageUI(stage);
  stageBannerEl.classList.remove("banner-hidden");
  clearTimeout(stageBannerTimeoutId);
  stageBannerTimeoutId = setTimeout(hideStageBanner, 5000);
}

// Hides the stage banner until the next start/stage-change event.
function hideStageBanner() {
  // Hide stage banner until next stage/start event.
  stageBannerEl.classList.add("banner-hidden");
}
