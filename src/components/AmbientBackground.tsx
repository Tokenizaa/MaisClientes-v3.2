import { useEffect, useRef } from 'react';

const CONTROL_ROOM_IMAGE = 'https://raw.githubusercontent.com/Tokenizaa/sci-fi/main/src/assets/images/scifi_control_room_bg_1793541718927.jpg';
const PALETTE = [
  { color: '0, 240, 255', glow: '0, 240, 255' },
  { color: '255, 0, 127', glow: '255, 0, 127' },
  { color: '255, 23, 68', glow: '255, 23, 68' },
  { color: '56, 189, 248', glow: '37, 99, 235' },
];

interface Particle {
  x: number; y: number; vx: number; vy: number; radius: number;
  alpha: number; depth: 0 | 1 | 2; color: string; glow: string;
  phase: number; speed: number;
}

/** Decorative particle field only; particles never represent scraped leads. */
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionPreference.matches) return;

    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;
    const isMobile = () => window.innerWidth < 768;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = isMobile() ? 30 : 64;
      particles = Array.from({ length: count }, () => {
        const depth = (Math.random() < 0.24 ? 2 : Math.random() < 0.62 ? 1 : 0) as 0 | 1 | 2;
        const palette = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        return {
          x: Math.random() * width, y: Math.random() * height,
          vx: (Math.random() - 0.5) * (depth === 2 ? 0.28 : 0.16),
          vy: (Math.random() - 0.5) * (depth === 2 ? 0.28 : 0.16) - 0.035,
          radius: depth === 2 ? 2 + Math.random() * 1.6 : depth === 1 ? 1.2 + Math.random() : 0.55 + Math.random() * 0.6,
          alpha: depth === 2 ? 0.42 + Math.random() * 0.25 : depth === 1 ? 0.24 + Math.random() * 0.2 : 0.12 + Math.random() * 0.12,
          depth, color: palette.color, glow: palette.glow,
          phase: Math.random() * Math.PI * 2, speed: 0.004 + Math.random() * 0.012,
        };
      });
    };

    const draw = () => {
      if (!running) return;
      context.clearRect(0, 0, width, height);
      const connectionDistance = isMobile() ? 78 : 112;

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.phase += p.speed;
        p.x += p.vx + Math.cos(p.phase) * 0.07;
        p.y += p.vy + Math.sin(p.phase) * 0.07;
        if (p.x < -12) p.x = width + 12;
        if (p.x > width + 12) p.x = -12;
        if (p.y < -12) p.y = height + 12;
        if (p.y > height + 12) p.y = -12;

        for (let j = i + 1; j < particles.length; j += 1) {
          const q = particles[j];
          const distance = Math.hypot(p.x - q.x, p.y - q.y);
          if (distance < connectionDistance) {
            const opacity = (1 - distance / connectionDistance) * 0.095 * Math.min(p.alpha, q.alpha);
            context.beginPath();
            context.moveTo(p.x, p.y);
            context.lineTo(q.x, q.y);
            context.strokeStyle = `rgba(0, 210, 235, ${opacity})`;
            context.lineWidth = 0.65;
            context.stroke();
          }
        }

        context.beginPath();
        context.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        context.fill();

        if (p.depth > 0) {
          context.beginPath();
          context.arc(p.x, p.y, p.radius * (p.depth === 2 ? 3.4 : 2.1), 0, Math.PI * 2);
          context.fillStyle = `rgba(${p.glow}, ${p.alpha * 0.16})`;
          context.fill();
        }
      }
      frame = window.requestAnimationFrame(draw);
    };

    const start = () => {
      if (running || document.hidden) return;
      running = true;
      frame = window.requestAnimationFrame(draw);
    };
    const stop = () => { running = false; window.cancelAnimationFrame(frame); };
    const onVisibility = () => document.hidden ? stop() : start();
    const onMotionChange = () => motionPreference.matches ? stop() : start();

    resize();
    start();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    motionPreference.addEventListener?.('change', onMotionChange);
    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      motionPreference.removeEventListener?.('change', onMotionChange);
    };
  }, []);

  return (
    <div className="app-ambient" aria-hidden="true">
      <img className="app-ambient-image" src={CONTROL_ROOM_IMAGE} alt="" />
      <div className="app-ambient-vignette" />
      <div className="app-ambient-scrim" />
      <div className="app-ambient-scanlines" />
      <div className="app-ambient-glow app-ambient-glow-cyan" />
      <div className="app-ambient-glow app-ambient-glow-magenta" />
      <div className="app-ambient-glow app-ambient-glow-green" />
      <div className="app-ambient-glow app-ambient-glow-red" />
      <div className="app-ambient-edge app-ambient-edge-top" />
      <div className="app-ambient-edge app-ambient-edge-bottom" />
      <canvas ref={canvasRef} className="app-ambient-canvas" />
    </div>
  );
}
