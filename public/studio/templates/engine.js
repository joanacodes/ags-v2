/* The Studio's template engine, shared by every video template.
 *
 * A template is a page that, given a spec and a timeline (the voice's caption segments and the
 * on-screen lines' scenes, computed by the Studio's TypeScript), lists its visual states (what is on
 * screen between two changes) and shows any one of them. The renderer on the runner calls
 * studioTemplate.init → states → show(i) and photographs each state on a transparent background; the
 * Video studio's preview frames the same page with ?preview=1 and sends it the time as the scrubber moves.
 */
(function () {
  "use strict";
  const preview = new URLSearchParams(location.search).has("preview");
  if (preview) document.documentElement.classList.add("is-preview");

  const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // Symbols stay text, never colour emoji.
  const plain = (s) => String(s == null ? "" : s).replace(/([☀-⛿✀-➿■-◿])(?!︎)/g, "$1︎");

  /** Shrink the type of every [data-fit] inside a box until the box's words fit it, to a floor. */
  function fit(box) {
    const warnings = [];
    if (!box) return warnings;
    const items = [...box.querySelectorAll("[data-fit]")];
    for (const el of items) el.style.fontSize = "";
    const over = () => box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
    let rounds = 0;
    while (over() && rounds++ < 90) {
      let moved = false;
      for (const el of items) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        const floor = parseFloat(el.dataset.fit || "0");
        if (size * 0.96 >= floor) {
          el.style.fontSize = size * 0.96 + "px";
          moved = true;
        }
      }
      if (!moved) break;
    }
    if (over()) warnings.push("text still overflows its box after shrinking to the minimum");
    return warnings;
  }

  /** The moments the picture changes: every scene and caption boundary, merged and sorted. */
  function cuts(timeline) {
    const set = new Set([0, timeline.duration]);
    for (const s of timeline.scenes || []) {
      set.add(s.start);
      set.add(s.end);
    }
    for (const c of timeline.captions || []) {
      set.add(c.start);
      set.add(c.end);
    }
    return [...set].filter((t) => t >= 0 && t <= timeline.duration).sort((a, b) => a - b);
  }

  /** The states between consecutive cuts, each naming the scene and the caption on screen then. */
  function baseStates(timeline) {
    const times = cuts(timeline);
    const out = [];
    for (let i = 0; i < times.length - 1; i++) {
      const start = times[i];
      const end = times[i + 1];
      if (end - start < 0.001) continue;
      const mid = (start + end) / 2;
      const scene = (timeline.scenes || []).findIndex((s) => s.start <= mid && mid < s.end);
      const caption = (timeline.captions || []).findIndex((c) => c.start <= mid && mid < c.end);
      const prev = out[out.length - 1];
      if (prev && prev.scene === scene && prev.caption === caption) {
        prev.end = end;
        continue;
      }
      out.push({ start, end, scene, caption });
    }
    return out;
  }

  let current = null;
  let states = [];
  let timeline = { duration: 0, scenes: [], captions: [] };
  let spec = {};
  let warnings = [];

  async function init(nextSpec, nextTimeline) {
    spec = nextSpec || {};
    timeline = nextTimeline || { duration: 0, scenes: [], captions: [] };
    document.documentElement.lang = spec.language || "en";
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
    await document.fonts.ready;
    warnings = [];
    current.build(spec, { esc, plain, fit: (box) => warnings.push(...fit(box)) });
    states = current.states ? current.states(spec, timeline, baseStates(timeline)) : baseStates(timeline);
    await raf();
    return states;
  }

  async function show(i) {
    const state = states[i];
    if (!state) return;
    current.show(state, spec, timeline, { esc, plain, fit: (box) => warnings.push(...fit(box)) });
    await raf();
  }

  function stateAt(t) {
    return Math.max(0, states.findIndex((s) => s.start <= t && t < s.end));
  }

  window.defineTemplate = function (template) {
    current = template;
    window.studioTemplate = {
      init,
      show,
      stateAt,
      states: () => states,
      glass: () => (current.glass ? current.glass(spec) : []),
      warnings: () => [...new Set(warnings)],
    };
    // The renderer hands the spec in through window.__spec / __timeline before the page loads.
    if (window.__spec) {
      init(window.__spec, window.__timeline).then(() => {
        window.__ready = true;
      });
    }
  };

  // The Video studio's preview speaks to the frame by messages.
  window.addEventListener("message", async (event) => {
    if (event.origin !== location.origin || !event.data || typeof event.data !== "object") return;
    const msg = event.data;
    if (msg.type === "studio:load" && window.studioTemplate) {
      await window.studioTemplate.init(msg.spec, msg.timeline);
      await window.studioTemplate.show(0);
      parent.postMessage({ type: "studio:loaded", states: states.map((s) => ({ start: s.start, end: s.end })), warnings: window.studioTemplate.warnings() }, location.origin);
    } else if (msg.type === "studio:seek" && window.studioTemplate) {
      await window.studioTemplate.show(stateAt(Number(msg.t) || 0));
    }
  });
})();
