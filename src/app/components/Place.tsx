"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { PALETTE, COLOR_NAMES, SIZE } from "@/lib/config";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const api = (p: string) => `${BASE}/api/${p}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jd = async (r: Response): Promise<any> => r.json().catch(() => ({}));

type Ev = { id: number; idx: number; color: number; name: string; ts: number };
type Stats = { pixels: number; painters: number; top: { name: string; count: number }[] };
type PixelInfo = { last: { name: string; color: number; ts: number } | null; changes: number };

const RGB = PALETTE.map((h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]);

function ago(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return `hace ${h} h`;
}

export default function Place() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<ImageData | null>(null);
  const boardRef = useRef<Uint8Array>(new Uint8Array(SIZE * SIZE));
  const viewRef = useRef({ scale: 4, ox: 0, oy: 0, fit: 4 });
  const lastIdRef = useRef(0);
  const selRef = useRef<{ x: number; y: number } | null>(null);
  const colorRef = useRef(13);
  const flashRef = useRef<{ idx: number; t: number }[]>([]);
  const replayingRef = useRef(false);
  const rafRef = useRef(0);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tv, setTv] = useState(false);
  const [sel, setSel] = useState<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState(13);
  const [name, setName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [feed, setFeed] = useState<Ev[]>([]);
  const [active, setActive] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [info, setInfo] = useState<PixelInfo | null>(null);
  const [painting, setPainting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [replay, setReplay] = useState<null | { loading: boolean; progress: number }>(null);
  const [qr, setQr] = useState("");
  const [myCount, setMyCount] = useState(0);

  // ---------- render ----------
  const draw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const c = canvasRef.current, off = offRef.current;
      if (!c || !off) return;
      const ctx = c.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      const { scale, ox, oy } = viewRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      const w = SIZE * scale;
      // sombra dura tipo sticker
      ctx.fillStyle = "#1B1E3C";
      ctx.fillRect(ox + 6, oy + 6, w, w);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, ox, oy, w, w);
      if (scale >= 12) {
        ctx.strokeStyle = "rgba(27,30,60,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < SIZE; i++) {
          const p = Math.round(ox + i * scale) + 0.5;
          ctx.moveTo(p, oy); ctx.lineTo(p, oy + w);
          const q = Math.round(oy + i * scale) + 0.5;
          ctx.moveTo(ox, q); ctx.lineTo(ox + w, q);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = "#1B1E3C";
      ctx.lineWidth = 2;
      ctx.strokeRect(ox - 1, oy - 1, w + 2, w + 2);

      // destellos de píxeles recién pintados por otros
      const t = performance.now();
      flashRef.current = flashRef.current.filter((f) => t - f.t < 900);
      for (const f of flashRef.current) {
        const k = (t - f.t) / 900;
        const x = (f.idx % SIZE) * scale + ox, y = Math.floor(f.idx / SIZE) * scale + oy;
        const r = scale * (0.5 + k * 1.6);
        ctx.strokeStyle = `rgba(67,83,255,${1 - k})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + scale / 2 - r, y + scale / 2 - r, r * 2, r * 2);
      }

      const s = selRef.current;
      if (s && !replayingRef.current) {
        const x = s.x * scale + ox, y = s.y * scale + oy;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = PALETTE[colorRef.current];
        ctx.fillRect(x, y, scale, scale);
        ctx.globalAlpha = 1;
        const pad = Math.max(2, scale * 0.15);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#1B1E3C";
        ctx.strokeRect(x - pad, y - pad, scale + pad * 2, scale + pad * 2);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - pad - 2, y - pad - 2, scale + pad * 2 + 4, scale + pad * 2 + 4);
      }
      if (flashRef.current.length) draw();
    });
  }, []);

  const putPixel = useCallback((idx: number, c: number, target?: Uint8Array) => {
    (target ?? boardRef.current)[idx] = c;
    if (replayingRef.current && !target) return;
    const img = imgRef.current;
    if (!img) return;
    const [r, g, b] = RGB[c] ?? RGB[0];
    const o = idx * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }, []);

  const flushImage = useCallback(() => {
    const off = offRef.current, img = imgRef.current;
    if (off && img) off.getContext("2d")!.putImageData(img, 0, 0);
  }, []);

  const paintAll = useCallback((arr: Uint8Array) => {
    const img = imgRef.current!;
    for (let i = 0; i < arr.length; i++) {
      const [r, g, b] = RGB[arr[i]] ?? RGB[0];
      const o = i * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    flushImage();
  }, [flushImage]);

  const fitView = useCallback(() => {
    const st = stageRef.current, c = canvasRef.current;
    if (!st || !c) return;
    const { width, height } = st.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    const fit = (Math.min(width, height) - 28) / SIZE;
    const v = viewRef.current;
    const first = v.fit === 4 && v.ox === 0;
    v.fit = fit;
    if (first || v.scale < fit) {
      v.scale = fit;
      v.ox = (width - SIZE * fit) / 2;
      v.oy = (height - SIZE * fit) / 2;
    }
    draw();
  }, [draw]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    const v = viewRef.current;
    const next = Math.min(60, Math.max(v.fit * 0.6, v.scale * factor));
    const k = next / v.scale;
    v.ox = cx - (cx - v.ox) * k;
    v.oy = cy - (cy - v.oy) * k;
    v.scale = next;
    draw();
  }, [draw]);

  const resetView = useCallback(() => {
    const st = stageRef.current;
    if (!st) return;
    const { width, height } = st.getBoundingClientRect();
    const v = viewRef.current;
    v.scale = v.fit;
    v.ox = (width - SIZE * v.fit) / 2;
    v.oy = (height - SIZE * v.fit) / 2;
    draw();
  }, [draw]);

  const select = useCallback((p: { x: number; y: number } | null) => {
    selRef.current = p;
    setSel(p);
    draw();
  }, [draw]);

  // ---------- init ----------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isTv = params.has("tv");
    setTv(isTv);
    try {
      const n = localStorage.getItem("kp_name");
      if (n) setName(n);
    } catch {}

    const off = document.createElement("canvas");
    off.width = SIZE; off.height = SIZE;
    offRef.current = off;
    imgRef.current = off.getContext("2d")!.createImageData(SIZE, SIZE);

    (async () => {
      try {
        const r = await fetch(api("board"), { cache: "no-store" });
        if (!r.ok) throw new Error((await jd(r))?.error ?? "No se pudo cargar el lienzo");
        const d = await jd(r);
        const arr = boardRef.current;
        for (let i = 0; i < arr.length; i++) arr[i] = parseInt(d.board[i], 16) || 0;
        paintAll(arr);
        lastIdRef.current = d.lastId;
        setCooldownUntil(Date.now() + d.cooldownLeft);
        setMyCount(d.me?.count ?? 0);
        if (d.me?.name && !localStorage.getItem("kp_name")) setName(d.me.name);
        setReady(true);
        fitView();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar el lienzo");
      }
    })();

    const url = window.location.origin + BASE + "/";
    QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#1B1E3C", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => {});
  }, [paintAll, fitView]);

  useEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    const ro = new ResizeObserver(() => fitView());
    ro.observe(st);
    return () => ro.disconnect();
  }, [fitView, tv]);

  // ---------- polling ----------
  useEffect(() => {
    if (!ready) return;
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(api(`updates?after=${lastIdRef.current}`), { cache: "no-store" });
        if (!r.ok) return;
        const d: { events: Ev[]; active: number } = await jd(r);
        if (stop) return;
        setActive(d.active);
        if (!d.events.length) return;
        const t = performance.now();
        for (const e of d.events) {
          putPixel(e.idx, e.color);
          flashRef.current.push({ idx: e.idx, t });
        }
        if (flashRef.current.length > 40) flashRef.current = flashRef.current.slice(-40);
        lastIdRef.current = d.events[d.events.length - 1].id;
        if (!replayingRef.current) flushImage();
        draw();
        setFeed((f) => [...d.events.slice(-12).reverse(), ...f].slice(0, 12));
      } catch {}
    };
    const loadStats = async () => {
      try {
        const r = await fetch(api("stats"), { cache: "no-store" });
        if (r.ok) setStats(await jd(r));
      } catch {}
    };
    // feed inicial: últimos píxeles pintados antes de abrir la página
    (async () => {
      try {
        const r = await fetch(api(`updates?after=${Math.max(0, lastIdRef.current - 12)}`), { cache: "no-store" });
        const d = await jd(r);
        if (!stop && d.events) setFeed((f) => (f.length ? f : [...d.events].reverse().slice(0, 12)));
      } catch {}
    })();
    tick(); loadStats();
    const a = setInterval(tick, 1500);
    const b = setInterval(loadStats, 10000);
    return () => { stop = true; clearInterval(a); clearInterval(b); };
  }, [ready, putPixel, flushImage, draw]);

  // reloj para el cooldown y los "hace X"
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // info del píxel seleccionado
  useEffect(() => {
    if (!sel) { setInfo(null); return; }
    let cancel = false;
    const idx = sel.y * SIZE + sel.x;
    const h = setTimeout(async () => {
      try {
        const r = await fetch(api(`pixel?i=${idx}`), { cache: "no-store" });
        if (r.ok && !cancel) setInfo(await jd(r));
      } catch {}
    }, 120);
    return () => { cancel = true; clearTimeout(h); };
  }, [sel, feed]);

  useEffect(() => { colorRef.current = color; draw(); }, [color, draw]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------- pan / zoom / tap ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; sx: number; sy: number; dist: number; scale: number; lx: number; ly: number }>({
    moved: false, sx: 0, sy: 0, dist: 0, scale: 1, lx: 0, ly: 0,
  });

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.moved = false; g.sx = p.x; g.sy = p.y; g.lx = p.x; g.ly = p.y;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.dist = Math.hypot(a.x - b.x, a.y - b.y);
      g.scale = viewRef.current.scale;
      g.lx = (a.x + b.x) / 2; g.ly = (a.y + b.y) / 2;
      g.moved = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current, v = viewRef.current;
    if (pointers.current.size === 1) {
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > 6) g.moved = true;
      if (g.moved) {
        v.ox += p.x - g.lx; v.oy += p.y - g.ly;
        g.lx = p.x; g.ly = p.y;
        draw();
      }
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      v.ox += mx - g.lx; v.oy += my - g.ly;
      g.lx = mx; g.ly = my;
      const target = g.scale * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist);
      zoomAt(target / v.scale, mx, my);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const had = pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (had && pointers.current.size === 0 && !g.moved && !tv) {
      const p = localPoint(e);
      const v = viewRef.current;
      const x = Math.floor((p.x - v.ox) / v.scale), y = Math.floor((p.y - v.oy) / v.scale);
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) {
        select({ x, y });
        if (v.scale < 10) zoomAt(Math.min(3, 14 / v.scale), p.x, p.y);
      } else select(null);
    }
    if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      g.lx = only.x; g.ly = only.y;
    }
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = localPoint(e);
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [zoomAt, ready]);

  // ---------- pintar ----------
  const cooldownLeft = Math.max(0, cooldownUntil - now);
  const canPaint = !!sel && cooldownLeft === 0 && !painting && !replay;

  const paint = useCallback(async () => {
    if (!selRef.current || painting || replayingRef.current) return;
    if (cooldownUntil > Date.now()) return;
    const { x, y } = selRef.current;
    const idx = y * SIZE + x;
    const prev = boardRef.current[idx];
    const c = colorRef.current;
    setPainting(true);
    putPixel(idx, c); flushImage(); draw();
    try {
      const r = await fetch(api("paint"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y, c, name }),
      });
      const d = await jd(r);
      if (!r.ok) {
        putPixel(idx, prev); flushImage(); draw();
        if (d.cooldownLeft) setCooldownUntil(Date.now() + d.cooldownLeft);
        setToast(d.error ?? "No se pudo pintar. Probá de nuevo.");
      } else {
        setCooldownUntil(Date.now() + d.cooldownLeft);
        setMyCount((n) => n + 1);
        setToast(`Pintaste (${x}, ${y}) de ${COLOR_NAMES[c].toLowerCase()}`);
      }
    } catch {
      putPixel(idx, prev); flushImage(); draw();
      setToast("Sin conexión. Tu píxel no se guardó.");
    } finally {
      setPainting(false);
    }
  }, [painting, cooldownUntil, name, putPixel, flushImage, draw]);

  // teclado: flechas mueven la selección, Enter pinta, +/- zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const s = selRef.current;
      const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        const base = s ?? { x: SIZE / 2, y: SIZE / 2 };
        select({ x: Math.min(SIZE - 1, Math.max(0, base.x + dx)), y: Math.min(SIZE - 1, Math.max(0, base.y + dy)) });
      } else if (e.key === "Enter" && s) {
        paint();
      } else if (e.key === "+" || e.key === "=") {
        const r = canvasRef.current!.getBoundingClientRect();
        zoomAt(1.4, r.width / 2, r.height / 2);
      } else if (e.key === "-") {
        const r = canvasRef.current!.getBoundingClientRect();
        zoomAt(1 / 1.4, r.width / 2, r.height / 2);
      } else if (e.key === "Escape") {
        select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paint, select, zoomAt]);

  // ---------- timelapse ----------
  const playTimelapse = useCallback(async () => {
    if (replayingRef.current) return;
    replayingRef.current = true;
    setReplay({ loading: true, progress: 0 });
    select(null);
    const all: [number, number][] = [];
    try {
      let after = 0;
      for (let guard = 0; guard < 40; guard++) {
        const r = await fetch(api(`history?after=${after}`), { cache: "no-store" });
        const d = await jd(r);
        all.push(...d.events);
        if (d.done || d.nextAfter == null) break;
        after = d.nextAfter;
      }
    } catch {}
    const tmp = new Uint8Array(SIZE * SIZE);
    paintAll(tmp);
    setReplay({ loading: false, progress: 0 });
    const duration = Math.min(14000, Math.max(3500, all.length * 4));
    const start = performance.now();
    let i = 0;
    await new Promise<void>((done) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - start) / duration);
        const target = Math.floor(all.length * k);
        const img = imgRef.current!;
        for (; i < target; i++) {
          const [idx, c] = all[i];
          tmp[idx] = c;
          const [r, g, b] = RGB[c] ?? RGB[0];
          const o = idx * 4;
          img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
        }
        flushImage(); draw();
        setReplay({ loading: false, progress: k });
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    setTimeout(() => {
      replayingRef.current = false;
      paintAll(boardRef.current);
      draw();
      setReplay(null);
    }, 900);
  }, [paintAll, flushImage, draw, select]);

  // modo proyector: timelapse automático cada 4 minutos
  useEffect(() => {
    if (!tv || !ready) return;
    const t = setInterval(playTimelapse, 240_000);
    return () => clearInterval(t);
  }, [tv, ready, playTimelapse]);

  const download = () => {
    const out = document.createElement("canvas");
    const k = 10;
    out.width = SIZE * k; out.height = SIZE * k;
    const ctx = out.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offRef.current!, 0, 0, out.width, out.height);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `konex-place-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
    a.click();
  };

  const saveName = (v: string) => {
    const n = v.trim().slice(0, 20);
    setName(n);
    try { localStorage.setItem("kp_name", n); } catch {}
    setEditingName(false);
  };

  // ---------- UI ----------
  const joinUrl = typeof window !== "undefined" ? window.location.host + BASE : "";

  return (
    <div className={`app ${tv ? "is-tv" : ""}`}>
      <header className="top">
        <h1 className="wordmark">
          konex<span>/</span>place
        </h1>
        <p className="tagline">
          {tv
            ? "Un lienzo de 10.000 píxeles que pinta todo Nerdearla."
            : "Pintá un píxel cada 15 segundos. El dibujo lo hacemos entre todos."}
        </p>
        <div className="live" aria-live="polite">
          <i className="dot" />
          {active === 1 ? "1 persona pintando" : `${active} personas pintando`}
        </div>
      </header>

      <main className="layout">
        <section className="stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="board"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Lienzo colaborativo. Tocá un píxel para elegirlo, arrastrá para moverte y usá dos dedos para hacer zoom."
            role="img"
          />
          {!ready && !error && <div className="overlay">Cargando el lienzo…</div>}
          {error && (
            <div className="overlay is-error">
              <strong>No pudimos cargar el lienzo.</strong>
              <span>{error}. Recargá la página en unos segundos.</span>
            </div>
          )}
          {replay && (
            <div className="replay-bar">
              {replay.loading ? "Juntando cada píxel pintado…" : "Timelapse"}
              <span className="track"><span style={{ width: `${replay.progress * 100}%` }} /></span>
            </div>
          )}
          {!tv && (
            <div className="zoom">
              <button aria-label="Acercar" onClick={() => { const r = canvasRef.current!.getBoundingClientRect(); zoomAt(1.5, r.width / 2, r.height / 2); }}>+</button>
              <button aria-label="Alejar" onClick={() => { const r = canvasRef.current!.getBoundingClientRect(); zoomAt(1 / 1.5, r.width / 2, r.height / 2); }}>−</button>
              <button aria-label="Ver lienzo completo" onClick={resetView} className="fit">⤢</button>
            </div>
          )}
          {!tv && !sel && ready && !replay && <div className="hint">Tocá el lienzo para elegir un píxel</div>}
        </section>

        <aside className="side">
          {tv ? (
            <div className="join">
              <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} />
              <div>
                <p className="join-title">Escaneá y pintá</p>
                <p className="join-url">{joinUrl}</p>
              </div>
            </div>
          ) : (
            <div className="dock">
              <div className="coords">
                {sel ? (
                  <>
                    <b>
                      ({sel.x}, {sel.y})
                    </b>
                    <span>
                      {info === null
                        ? "…"
                        : info.last
                        ? `${info.last.name} lo pintó ${ago(info.last.ts)}${info.changes > 1 ? ` · cambió ${info.changes} veces` : ""}`
                        : "Nadie lo pintó todavía"}
                    </span>
                  </>
                ) : (
                  <span>Elegí un píxel en el lienzo y después un color.</span>
                )}
              </div>

              <div className="palette" role="radiogroup" aria-label="Color">
                {PALETTE.map((hex, i) => (
                  <button
                    key={hex}
                    role="radio"
                    aria-checked={color === i}
                    aria-label={COLOR_NAMES[i]}
                    title={COLOR_NAMES[i]}
                    className={color === i ? "on" : ""}
                    style={{ background: hex }}
                    onClick={() => setColor(i)}
                  />
                ))}
              </div>

              <button className="paint" disabled={!canPaint} onClick={paint}>
                {cooldownLeft > 0 ? (
                  <>
                    <span className="cool" style={{ width: `${(cooldownLeft / 15000) * 100}%` }} />
                    <span className="label">Podés volver a pintar en {Math.ceil(cooldownLeft / 1000)} s</span>
                  </>
                ) : painting ? (
                  <span className="label">Pintando…</span>
                ) : sel ? (
                  <span className="label">
                    Pintar de <i className="chip" style={{ background: PALETTE[color] }} /> {COLOR_NAMES[color].toLowerCase()}
                  </span>
                ) : (
                  <span className="label">Elegí un píxel para pintar</span>
                )}
              </button>

              <div className="me">
                {editingName || !name ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveName(new FormData(e.currentTarget).get("n") as string);
                    }}
                  >
                    <label htmlFor="n">Firmá tus píxeles</label>
                    <div className="row">
                      <input id="n" name="n" defaultValue={name} maxLength={20} placeholder="Tu nombre o @usuario" autoComplete="nickname" />
                      <button type="submit">Guardar</button>
                    </div>
                  </form>
                ) : (
                  <p>
                    Pintás como <b>{name}</b>
                    {myCount > 0 && <> · {myCount === 1 ? "1 píxel" : `${myCount} píxeles`}</>}{" "}
                    <button className="link" onClick={() => setEditingName(true)}>Cambiar</button>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="numbers">
            <div>
              <b>{stats ? stats.pixels.toLocaleString("es-AR") : "–"}</b>
              <span>píxeles pintados</span>
            </div>
            <div>
              <b>{stats ? stats.painters.toLocaleString("es-AR") : "–"}</b>
              <span>personas participaron</span>
            </div>
          </div>

          <div className="panel feed">
            <h2>Últimos píxeles</h2>
            {feed.length === 0 ? (
              <p className="empty">Todavía no hay actividad. El primer píxel puede ser el tuyo.</p>
            ) : (
              <ul>
                {feed.slice(0, tv ? 8 : 6).map((e) => (
                  <li key={e.id}>
                    <i className="chip" style={{ background: PALETTE[e.color] }} />
                    <span className="who">{e.name}</span>
                    <span className="where">({e.idx % SIZE}, {Math.floor(e.idx / SIZE)})</span>
                    <span className="when">{ago(e.ts)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {stats && stats.top.length > 0 && (
            <div className="panel top5">
              <h2>Quienes más pintaron</h2>
              <ol>
                {stats.top.map((t, i) => (
                  <li key={i}>
                    <span className="who">{t.name}</span>
                    <span className="bar"><span style={{ width: `${(t.count / stats.top[0].count) * 100}%` }} /></span>
                    <b>{t.count}</b>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="actions">
            <button onClick={playTimelapse} disabled={!!replay || !ready}>Ver timelapse</button>
            <button onClick={download} disabled={!ready}>Descargar PNG</button>
            {!tv && <a href={`${BASE}/?tv`}>Modo proyector</a>}
          </div>
        </aside>
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
