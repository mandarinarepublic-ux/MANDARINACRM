'use client'

import { useState, useRef } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const ZONES = [
  // FRONT
  { id: "front_chest_left",   label: "Pecho sup. izq.",  side: "front", svgX: 112, svgY: 108, svgW: 44, svgH: 38 },
  { id: "front_chest_right",  label: "Pecho sup. der.",  side: "front", svgX: 164, svgY: 108, svgW: 44, svgH: 38 },
  { id: "front_center",       label: "Pecho central",    side: "front", svgX: 112, svgY: 148, svgW: 96, svgH: 60 },
  { id: "front_bottom",       label: "Pecho inferior",   side: "front", svgX: 112, svgY: 210, svgW: 96, svgH: 50 },
  { id: "front_sleeve_left",  label: "Manga izq.",        side: "front", svgX: 46,  svgY: 110, svgW: 60, svgH: 36 },
  { id: "front_sleeve_right", label: "Manga der.",        side: "front", svgX: 214, svgY: 110, svgW: 60, svgH: 36 },
  // BACK
  { id: "back_top",           label: "Espalda superior", side: "back",  svgX: 112, svgY: 90,  svgW: 96, svgH: 55 },
  { id: "back_center",        label: "Espalda central",  side: "back",  svgX: 112, svgY: 148, svgW: 96, svgH: 65 },
  { id: "back_bottom",        label: "Espalda inferior", side: "back",  svgX: 112, svgY: 216, svgW: 96, svgH: 46 },
  { id: "back_shoulder_left", label: "Hombro izq.",       side: "back",  svgX: 46,  svgY: 90,  svgW: 62, svgH: 38 },
  { id: "back_shoulder_right",label: "Hombro der.",       side: "back",  svgX: 212, svgY: 90,  svgW: 62, svgH: 38 },
  { id: "back_sleeve_left",   label: "Manga izq.",        side: "back",  svgX: 46,  svgY: 130, svgW: 60, svgH: 36 },
  { id: "back_sleeve_right",  label: "Manga der.",        side: "back",  svgX: 214, svgY: 130, svgW: 60, svgH: 36 },
];

const ZONE_PROMPT_LABELS = {
  front_chest_left:   "upper-left chest area",
  front_chest_right:  "upper-right chest area",
  front_center:       "center chest / front torso",
  front_bottom:       "lower front / hem area",
  front_sleeve_left:  "left sleeve (front view)",
  front_sleeve_right: "right sleeve (front view)",
  back_top:           "upper back / collar area",
  back_center:        "center back / main back panel",
  back_bottom:        "lower back / back hem",
  back_shoulder_left: "left shoulder / back",
  back_shoulder_right:"right shoulder / back",
  back_sleeve_left:   "left sleeve (back view)",
  back_sleeve_right:  "right sleeve (back view)",
};

const STYLES = [
  { id: "streetwear", label: "Streetwear / Urban" },
  { id: "studio",     label: "Studio / Editorial" },
  { id: "anime",      label: "Anime / Pop Culture" },
  { id: "minimalist", label: "Minimalista" },
];

const BACKGROUNDS = [
  { id: "gradient", label: "Gradiente oscuro" },
  { id: "void",     label: "Negro puro" },
  { id: "light",    label: "Blanco/gris" },
  { id: "neon",     label: "Neón / cyberpunk" },
  { id: "nature",   label: "Exterior" },
];

const HOODIES = [
  { id: "pullover",  label: "Pullover" },
  { id: "zip",       label: "Zip hoodie" },
  { id: "oversized", label: "Oversized" },
];

const ACCENT = "#ff6b2b";
const BG = "#0a0a0a";
const PANEL = "#111";
const BORDER = "#222";

// ─── HOODIE SVG (front & back schematic) ─────────────────────────────────────

function HoodieSVG({ side, zoneDesigns, activeZone, onZoneClick }) {
  const zones = ZONES.filter(z => z.side === side);

  // Simple hoodie outline paths
  const frontPath = "M150,30 L130,50 L110,55 C90,60 60,75 46,100 L46,270 L110,270 L110,260 L115,265 L185,265 L190,260 L190,270 L254,270 L254,100 C240,75 210,60 190,55 L170,50 Z";
  const hoodLeft  = "M150,30 L130,50 L125,68 C135,60 145,55 150,54 Z";
  const hoodRight = "M150,30 L170,50 L175,68 C165,60 155,55 150,54 Z";
  const sleeveL   = "M46,100 L20,110 L18,200 L46,200 Z";
  const sleeveR   = "M254,100 L280,110 L282,200 L254,200 Z";

  return (
    <svg viewBox="0 0 300 300" style={{ width: "100%", maxWidth: 300 }}>
      {/* Body */}
      <path d={frontPath} fill="#1a1a1a" stroke="#444" strokeWidth="1.5" />
      <path d={hoodLeft}  fill="#1e1e1e" stroke="#444" strokeWidth="1" />
      <path d={hoodRight} fill="#1e1e1e" stroke="#444" strokeWidth="1" />
      <path d={sleeveL}   fill="#1a1a1a" stroke="#444" strokeWidth="1.5" />
      <path d={sleeveR}   fill="#1a1a1a" stroke="#444" strokeWidth="1.5" />

      {/* Clickable zones */}
      {zones.map(z => {
        const isActive  = activeZone === z.id;
        const hasDesign = !!zoneDesigns[z.id];
        const fill = isActive
          ? "rgba(255,107,43,0.35)"
          : hasDesign
          ? "rgba(255,107,43,0.18)"
          : "rgba(255,255,255,0.03)";
        const stroke = isActive ? ACCENT : hasDesign ? "rgba(255,107,43,0.6)" : "#333";

        return (
          <g key={z.id} onClick={() => onZoneClick(z.id)} style={{ cursor: "pointer" }}>
            <rect
              x={z.svgX} y={z.svgY} width={z.svgW} height={z.svgH}
              rx={4} fill={fill} stroke={stroke} strokeWidth={isActive ? 1.5 : 1}
              strokeDasharray={hasDesign ? "0" : "3,3"}
            />
            {hasDesign && (
              <text x={z.svgX + z.svgW / 2} y={z.svgY + z.svgH / 2 + 4}
                textAnchor="middle" fontSize="9" fill={ACCENT} fontWeight="bold">✓</text>
            )}
            {!hasDesign && (
              <text x={z.svgX + z.svgW / 2} y={z.svgY + z.svgH / 2 + 3}
                textAnchor="middle" fontSize="7.5" fill="#555">+</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function HoodiePromptPage() {
  const [svgSide, setSvgSide]           = useState("front");
  const [activeZone, setActiveZone]     = useState(null);
  const [zoneDesigns, setZoneDesigns]   = useState({});   // zoneId → { file, preview, description }
  const [style, setStyle]               = useState("streetwear");
  const [background, setBackground]     = useState("gradient");
  const [hoodieType, setHoodieType]     = useState("pullover");
  const [color, setColor]               = useState("#000000");
  const [prompt, setPrompt]             = useState("");
  const [loading, setLoading]           = useState(false);
  const [copied, setCopied]             = useState(false);
  const [analyzing, setAnalyzing]       = useState(false);
  const fileRef = useRef();

  // ── zone click: open file picker
  const handleZoneClick = (zoneId) => {
    setActiveZone(zoneId);
    fileRef.current.value = "";
    fileRef.current.click();
  };

  // ── file chosen for active zone
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeZone) return;
    const preview = await new Promise(res => {
      const r = new FileReader();
      r.onload = ev => res(ev.target.result);
      r.readAsDataURL(file);
    });
    setZoneDesigns(prev => ({
      ...prev,
      [activeZone]: { file, preview, description: "" },
    }));
  };

  const removeZone = (zoneId) => {
    setZoneDesigns(prev => { const n = { ...prev }; delete n[zoneId]; return n; });
    if (activeZone === zoneId) setActiveZone(null);
  };

  const toBase64 = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

  // Analiza la imagen vía la ruta API del servidor (la API key nunca sale del server)
  const analyzeImage = async (file) => {
    const base64 = await toBase64(file);
    const mediaType = file.type || "image/png";
    const res = await fetch("/api/analyze-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, mediaType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Error al analizar la imagen");
    return data.description || "custom graphic artwork";
  };

  const generatePrompt = async () => {
    setLoading(true);
    setAnalyzing(true);
    setPrompt("");

    // Analyze all uploaded images
    const described = { ...zoneDesigns };
    for (const [zoneId, z] of Object.entries(zoneDesigns)) {
      if (z.file && !z.description) {
        try {
          const desc = await analyzeImage(z.file);
          described[zoneId] = { ...z, description: desc };
        } catch {
          described[zoneId] = { ...z, description: "custom graphic design" };
        }
      }
    }
    setZoneDesigns(described);
    setAnalyzing(false);

    // Build placement string
    const placements = Object.entries(described).map(([zoneId, z]) => {
      const locationLabel = ZONE_PROMPT_LABELS[zoneId] || zoneId;
      const desc = z.description || "custom graphic design";
      return `on the ${locationLabel}: ${desc}`;
    });

    const placementText = placements.length > 0
      ? `The hoodie has the following custom graphic prints: ${placements.join("; ")}.`
      : "The hoodie features a clean, unprinted design.";

    const bgMap = {
      gradient: "dramatic dark gradient background with subtle smoke or fog effects",
      void:     "pure black void background, infinite depth",
      light:    "clean white or light gray studio background with soft shadows",
      neon:     "cyberpunk neon lights background, purple and blue glowing atmosphere",
      nature:   "moody outdoor environment with natural bokeh",
    };
    const styleMap = {
      streetwear: "streetwear fashion photography, raw and authentic, urban aesthetic",
      studio:     "high-end editorial fashion photography, professional studio lighting",
      anime:      "anime and pop culture aesthetic, vibrant and dynamic composition",
      minimalist: "minimalist product photography, clean and elegant",
    };
    const hoodieMap = {
      pullover:  "classic pullover hoodie",
      zip:       "zip-up hoodie with front zipper",
      oversized: "oversized boxy hoodie with dropped shoulders",
    };

    const hexToName = (hex) => {
      const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      if (r<40&&g<40&&b<40) return "jet black";
      if (r>215&&g>215&&b>215) return "crisp white";
      if (r>180&&g>100&&b<80) return "deep orange-red";
      if (r>g&&r>b) return "deep red";
      if (g>r&&g>b) return "forest green";
      if (b>r&&b>g) return "navy blue";
      return `color ${hex}`;
    };

    const hasFront = Object.keys(described).some(k => ZONES.find(z=>z.id===k)?.side==="front");
    const hasBack  = Object.keys(described).some(k => ZONES.find(z=>z.id===k)?.side==="back");
    const angleHint = hasFront && hasBack
      ? "shown in a dynamic 3/4 rotation angle that reveals both the front chest design and the back panel"
      : hasFront
      ? "centered in frame showing the front design clearly"
      : hasBack
      ? "rotated to show the back panel clearly"
      : "floating centered in frame";

    const finalPrompt = `Product photography of a ${hexToName(color)} ${hoodieMap[hoodieType]} floating and levitating in mid-air, ghostly invisible mannequin effect, perfectly shaped and inflated as if worn by an invisible person. ${placementText} The hoodie is ${angleHint}. ${bgMap[background]}. ${styleMap[style]}. Cinematic lighting with dramatic rim lights and soft fill that highlight the fabric texture and every graphic print with crisp detail. Each printed area is sharp and well-lit. The hoodie casts a subtle shadow below it. Shot with an 85mm lens, shallow depth of field. Ultra-detailed, 8K resolution, hyperrealistic fabric texture and print quality, commercial apparel photography.`;

    setPrompt(finalPrompt);
    setLoading(false);
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const frontZones = ZONES.filter(z => z.side === "front");
  const backZones  = ZONES.filter(z => z.side === "back");
  const totalDesigns = Object.keys(zoneDesigns).length;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: "#f0f0f0", fontFamily: "'Inter', sans-serif", padding: "28px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, textTransform: "uppercase", marginBottom: 6 }}>Mandarina Republic</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Hoodie Prompt Generator</h1>
          <p style={{ color: "#666", marginTop: 6, fontSize: 13 }}>Asigna diseños a cada zona del hoodie y genera tu prompt de imagen</p>
        </div>

        {/* ── HOODIE CONFIG ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          {/* Type */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
            <Label>Tipo</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {HOODIES.map(h => (
                <SmallChip key={h.id} active={hoodieType===h.id} onClick={()=>setHoodieType(h.id)}>{h.label}</SmallChip>
              ))}
            </div>
          </div>
          {/* Color */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
            <Label>Color base</Label>
            <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
              <input type="color" value={color} onChange={e=>setColor(e.target.value)}
                style={{ width: 56, height: 56, borderRadius: 8, border: "none", cursor: "pointer" }} />
            </div>
            <div style={{ textAlign: "center", fontSize: 11, color: "#666", marginTop: 6 }}>{color.toUpperCase()}</div>
            <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
              {["#000000","#FFFFFF","#1a1a2e","#ff6b2b","#C49B4C"].map(c => (
                <div key={c} onClick={()=>setColor(c)} style={{
                  width: 18, height: 18, borderRadius: "50%", background: c, cursor: "pointer",
                  border: color===c ? `2px solid ${ACCENT}` : "2px solid #333",
                }} />
              ))}
            </div>
          </div>
          {/* Style */}
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
            <Label>Estilo</Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {STYLES.map(s => (
                <SmallChip key={s.id} active={style===s.id} onClick={()=>setStyle(s.id)}>{s.label}</SmallChip>
              ))}
            </div>
          </div>
        </div>

        {/* Background row */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 16px", marginBottom: 24 }}>
          <Label>Fondo / ambiente</Label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {BACKGROUNDS.map(b => (
              <Chip key={b.id} active={background===b.id} onClick={()=>setBackground(b.id)}>{b.label}</Chip>
            ))}
          </div>
        </div>

        {/* ── PLACEMENT SECTION ── */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <Label>Placement de diseños</Label>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>Haz clic en una zona del hoodie para asignarle un diseño</div>
            </div>
            {totalDesigns > 0 && (
              <div style={{ background: "rgba(255,107,43,0.12)", border: `1px solid rgba(255,107,43,0.3)`, borderRadius: 20, padding: "4px 12px", fontSize: 12, color: ACCENT, fontWeight: 600 }}>
                {totalDesigns} zona{totalDesigns !== 1 ? "s" : ""} con diseño
              </div>
            )}
          </div>

          {/* Side toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["front","back"].map(s => (
              <button key={s} onClick={()=>setSvgSide(s)} style={{
                flex: 1, padding: "8px", borderRadius: 8,
                border: `1.5px solid ${svgSide===s ? ACCENT : "#333"}`,
                background: svgSide===s ? "rgba(255,107,43,0.1)" : "transparent",
                color: svgSide===s ? ACCENT : "#666", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                {s === "front" ? "👕 Parte frontal" : "🔙 Parte trasera"}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
            {/* SVG map */}
            <div style={{ position: "relative" }}>
              <HoodieSVG
                side={svgSide}
                zoneDesigns={zoneDesigns}
                activeZone={activeZone}
                onZoneClick={handleZoneClick}
              />
            </div>

            {/* Zone list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 310, overflowY: "auto" }}>
              {(svgSide === "front" ? frontZones : backZones).map(z => {
                const design = zoneDesigns[z.id];
                return (
                  <div key={z.id}
                    onClick={() => !design && handleZoneClick(z.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                      borderRadius: 8, border: `1px solid ${activeZone===z.id ? ACCENT : design ? "rgba(255,107,43,0.3)" : "#2a2a2a"}`,
                      background: activeZone===z.id ? "rgba(255,107,43,0.08)" : design ? "rgba(255,107,43,0.04)" : "#0d0d0d",
                      cursor: design ? "default" : "pointer", transition: "all 0.15s",
                    }}>
                    {design ? (
                      <img src={design.preview} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: 6, background: "#1a1a1a", border: "1px dashed #333", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ color: "#444", fontSize: 16 }}>+</span>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: design ? "#ddd" : "#666" }}>{z.label}</div>
                      {design && (
                        <div style={{ fontSize: 10, color: "#555", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {design.file.name}
                        </div>
                      )}
                    </div>
                    {design ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={(e)=>{e.stopPropagation(); handleZoneClick(z.id);}} style={{ ...iconBtn, color: "#888" }} title="Cambiar">✏️</button>
                        <button onClick={(e)=>{e.stopPropagation(); removeZone(z.id);}} style={{ ...iconBtn, color: "#666" }} title="Eliminar">✕</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, color: "#444" }}>clic para agregar</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Hidden file input */}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />

        {/* Generate button */}
        <button
          onClick={generatePrompt}
          disabled={loading}
          style={{
            width: "100%", padding: "16px", borderRadius: 12, border: "none",
            background: loading ? "#222" : `linear-gradient(135deg, ${ACCENT}, #e63900)`,
            color: loading ? "#555" : "#fff", fontSize: 15, fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer", letterSpacing: 0.3,
          }}
        >
          {loading
            ? analyzing
              ? `⏳ Analizando ${totalDesigns} diseño${totalDesigns!==1?"s":""}...`
              : "⏳ Construyendo prompt..."
            : `✨ Generar Prompt${totalDesigns > 0 ? ` con ${totalDesigns} diseño${totalDesigns!==1?"s":""}` : ""}`}
        </button>

        {/* Result */}
        {prompt && (
          <div style={{ marginTop: 20, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: ACCENT, textTransform: "uppercase", letterSpacing: 2, fontWeight: 600 }}>Prompt generado</span>
              <button onClick={copyPrompt} style={{ background: "none", border: `1px solid #333`, borderRadius: 6, color: "#aaa", fontSize: 12, cursor: "pointer", padding: "5px 12px" }}>
                {copied ? "✅ Copiado" : "📋 Copiar"}
              </button>
            </div>
            <p style={{ color: "#ccc", lineHeight: 1.75, fontSize: 13, margin: 0, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
              {prompt}
            </p>
            <div style={{ marginTop: 16, padding: "12px 14px", background: "#0d0d0d", borderRadius: 8, borderLeft: `3px solid ${ACCENT}` }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>💡 Dónde usarlo:</div>
              <div style={{ fontSize: 12, color: "#888", lineHeight: 1.9 }}>
                • <strong style={{ color: "#bbb" }}>Midjourney</strong> — añade <code style={{ color: ACCENT }}>--ar 4:5 --v 6 --style raw</code><br/>
                • <strong style={{ color: "#bbb" }}>DALL·E 3</strong> — pega directo en ChatGPT<br/>
                • <strong style={{ color: "#bbb" }}>Adobe Firefly</strong> — ideal para mockups de moda<br/>
                • <strong style={{ color: "#bbb" }}>Stable Diffusion</strong> — con ControlNet + modelo ropa
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────

function Label({ children }) {
  return <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>{children}</div>;
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 14px", borderRadius: 20,
      border: `1.5px solid ${active ? ACCENT : "#2a2a2a"}`,
      background: active ? "rgba(255,107,43,0.12)" : "transparent",
      color: active ? ACCENT : "#666", fontSize: 12, cursor: "pointer",
      fontWeight: active ? 600 : 400, transition: "all 0.15s",
    }}>{children}</button>
  );
}

function SmallChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 10px", borderRadius: 6, textAlign: "left",
      border: `1px solid ${active ? ACCENT : "#2a2a2a"}`,
      background: active ? "rgba(255,107,43,0.1)" : "transparent",
      color: active ? ACCENT : "#555", fontSize: 11, cursor: "pointer",
      fontWeight: active ? 600 : 400,
    }}>{children}</button>
  );
}

const iconBtn = {
  background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: 13,
};
