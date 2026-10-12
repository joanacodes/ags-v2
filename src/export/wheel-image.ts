/**
 * The chart wheel as a PNG for exported documents (browser only).
 *
 * The app's own <ChartWheel> is rendered off-screen in the light palette,
 * its colours are resolved to plain values (the live SVG uses CSS
 * variables, which an image can't see), and the result is drawn on a
 * white canvas. Returns null if anything fails: the document is still
 * produced, just without the wheel.
 */
import { createElement } from "react";
import type { Chart } from "@/types";

const STYLE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
] as const;

const SIZE = 1200;

export async function renderWheelPng(chart: Chart): Promise<string | null> {
  if (typeof document === "undefined" || chart.planets.length === 0) return null;
  const [{ createRoot }, { ChartWheel }] = await Promise.all([
    import("react-dom/client"),
    import("@/components/chart/chart-wheel"),
  ]);
  const host = document.createElement("div");
  host.className = "theme-light";
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:560px;pointer-events:none;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(createElement(ChartWheel, { chart }));
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    const svg = host.querySelector("svg");
    if (svg === null) return null;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    const originals = [svg, ...Array.from(svg.querySelectorAll("*"))];
    const copies = [clone, ...Array.from(clone.querySelectorAll("*"))];
    originals.forEach((original, i) => {
      const copy = copies[i];
      const computed = window.getComputedStyle(original);
      const inline = STYLE_PROPS.map((prop) => `${prop}:${computed.getPropertyValue(prop)}`).join(";");
      copy.removeAttribute("class");
      copy.setAttribute("style", inline);
    });
    // The wheel fades in on screen: export it fully drawn.
    clone.style.opacity = "1";
    clone.style.transform = "none";
    clone.setAttribute("width", String(SIZE));
    clone.setAttribute("height", String(SIZE));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    const markup = new XMLSerializer().serializeToString(clone);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("wheel image failed to load"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext("2d");
    if (context === null) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, SIZE, SIZE);
    context.drawImage(image, 0, 0, SIZE, SIZE);
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("[export] chart wheel image failed", error);
    return null;
  } finally {
    root.unmount();
    host.remove();
  }
}
