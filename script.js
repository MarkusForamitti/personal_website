const revealItems = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.14 }
);

revealItems.forEach((item) => observer.observe(item));

const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear().toString();

const staffCanvas = document.getElementById("music-staff");
if (staffCanvas) {
  const playBtn = document.getElementById("play-notes");
  const stopBtn = document.getElementById("stop-notes");
  const clearBtn = document.getElementById("clear-notes");
  const tempoEl = document.getElementById("tempo");
  const tempoValueEl = document.getElementById("tempo-value");
  const ctx = staffCanvas.getContext("2d");

  const columns = 12;
  const staffSteps = 9; // line-space positions; lines are even indices
  const marginX = 22;
  const marginY = 16;
  const notes = [];
  const accButtons = Array.from(document.querySelectorAll(".acc-chip"));

  // Two octaves below previous mapping: G3..F2 (naturals).
  const midiByStep = [55, 53, 52, 50, 48, 47, 45, 43, 41];
  let selectedAccidental = 0;

  let width = 0;
  let height = 0;
  let activeCol = -1;
  let playTimer = null;
  let isPlaying = false;
  let hoverCell = null;
  let audioCtx = null;

  const stepWidth = () => (width - marginX * 2) / columns;
  const rowHeight = () => (height - marginY * 2) / (staffSteps - 1);
  const xForCol = (col) => marginX + col * stepWidth() + stepWidth() / 2;
  const yForStep = (step) => marginY + step * rowHeight();

  const ensureAudio = () => {
    if (!audioCtx) audioCtx = new window.AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
  };

  const midiToFreq = (midi) => 440 * 2 ** ((midi - 69) / 12);

  const playFreq = (freq, short = false) => {
    ensureAudio();
    const now = audioCtx.currentTime;
    const duration = short ? 0.22 : 0.46;

    const oscA = audioCtx.createOscillator();
    const oscB = audioCtx.createOscillator();
    const oscC = audioCtx.createOscillator();
    const gainA = audioCtx.createGain();
    const gainB = audioCtx.createGain();
    const gainC = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const master = audioCtx.createGain();

    oscA.type = "sawtooth";
    oscB.type = "triangle";
    oscC.type = "sine";

    oscA.frequency.setValueAtTime(freq, now);
    oscB.frequency.setValueAtTime(freq * 0.5, now);
    oscC.frequency.setValueAtTime(freq * 2, now);

    gainA.gain.setValueAtTime(0.18, now);
    gainB.gain.setValueAtTime(0.11, now);
    gainC.gain.setValueAtTime(0.04, now);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.setValueAtTime(0.8, now);

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.24, now + 0.04);
    master.gain.exponentialRampToValueAtTime(0.11, now + 0.18);
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscA.connect(gainA);
    oscB.connect(gainB);
    oscC.connect(gainC);
    gainA.connect(filter);
    gainB.connect(filter);
    gainC.connect(filter);
    filter.connect(master);
    master.connect(audioCtx.destination);

    oscA.start(now);
    oscB.start(now);
    oscC.start(now);
    oscA.stop(now + duration + 0.02);
    oscB.stop(now + duration + 0.02);
    oscC.stop(now + duration + 0.02);
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);

    if (activeCol >= 0) {
      ctx.fillStyle = "rgba(255, 127, 80, 0.13)";
      ctx.fillRect(
        marginX + activeCol * stepWidth(),
        marginY - 6,
        stepWidth(),
        height - (marginY - 6) * 2
      );
    }

    ctx.strokeStyle = "#e4dece";
    ctx.lineWidth = 1;
    for (let line = 0; line < staffSteps; line += 2) {
      const y = marginY + line * rowHeight();
      ctx.beginPath();
      ctx.moveTo(marginX, y);
      ctx.lineTo(width - marginX, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#f0ebdf";
    for (let col = 0; col <= columns; col += 1) {
      const x = marginX + col * stepWidth();
      ctx.beginPath();
      ctx.moveTo(x, marginY - 7);
      ctx.lineTo(x, height - marginY + 7);
      ctx.stroke();
    }

    if (hoverCell) {
      ctx.fillStyle = "rgba(15, 122, 104, 0.12)";
      ctx.beginPath();
      ctx.ellipse(xForCol(hoverCell.col), yForStep(hoverCell.step), 8, 6, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    notes.forEach((note) => {
      const x = xForCol(note.col);
      const y = yForStep(note.step);
      ctx.fillStyle = "#0f7a68";
      ctx.beginPath();
      ctx.ellipse(x, y, 8, 6, -0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#0f7a68";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 7, y);
      ctx.lineTo(x + 7, y - 19);
      ctx.stroke();

      if (note.acc !== 0) {
        ctx.fillStyle = "#34564e";
        ctx.font = "12px Space Grotesk, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(note.acc > 0 ? "♯" : "♭", x - 13, y - 1);
      }
    });
  };

  const gridFromEvent = (event) => {
    const rect = staffCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const col = Math.max(0, Math.min(columns - 1, Math.floor((x - marginX) / stepWidth())));
    const step = Math.max(0, Math.min(staffSteps - 1, Math.round((y - marginY) / rowHeight())));
    return { col, step };
  };

  const noteIndexAt = (col, step) => notes.findIndex((note) => note.col === col && note.step === step);

  const setTempoLabel = () => {
    if (tempoEl && tempoValueEl) tempoValueEl.textContent = `${tempoEl.value} BPM`;
  };

  const stop = () => {
    if (playTimer) window.clearTimeout(playTimer);
    playTimer = null;
    isPlaying = false;
    activeCol = -1;
    draw();
  };

  const playStep = (col) => {
    if (!isPlaying) return;
    activeCol = col;
    notes
      .filter((n) => n.col === col)
      .forEach((n) => playFreq(midiToFreq(midiByStep[n.step] + n.acc)));
    draw();

    const bpm = Number(tempoEl ? tempoEl.value : 108);
    const ms = (60_000 / bpm) / 2;
    playTimer = window.setTimeout(() => {
      const next = col + 1;
      if (next >= columns) {
        stop();
      } else {
        playStep(next);
      }
    }, ms);
  };

  const resize = () => {
    const rect = staffCanvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    staffCanvas.width = Math.floor(width * window.devicePixelRatio);
    staffCanvas.height = Math.floor(height * window.devicePixelRatio);
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    draw();
  };

  staffCanvas.addEventListener("mousemove", (event) => {
    hoverCell = gridFromEvent(event);
    draw();
  });

  staffCanvas.addEventListener("mouseleave", () => {
    hoverCell = null;
    draw();
  });

  staffCanvas.addEventListener("click", (event) => {
    const { col, step } = gridFromEvent(event);
    const existing = noteIndexAt(col, step);
    if (existing >= 0) {
      if (notes[existing].acc === selectedAccidental) {
        notes.splice(existing, 1);
      } else {
        notes[existing].acc = selectedAccidental;
      }
    } else {
      notes.push({ col, step, acc: selectedAccidental });
      notes.sort((a, b) => a.col - b.col || a.step - b.step);
      playFreq(midiToFreq(midiByStep[step] + selectedAccidental), true);
    }
    draw();
  });

  accButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedAccidental = Number(btn.dataset.acc || "0");
      accButtons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (isPlaying) return;
      ensureAudio();
      isPlaying = true;
      playStep(0);
    });
  }

  if (stopBtn) stopBtn.addEventListener("click", stop);

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      stop();
      notes.length = 0;
      draw();
    });
  }

  if (tempoEl) {
    tempoEl.addEventListener("input", setTempoLabel);
    setTempoLabel();
  }

  window.addEventListener("resize", resize);
  resize();
}
