---
language: "en"
title: "Shaft-Hub Fits and ISO Tolerances: Why ±0.01 mm Changes Everything"
description: "A practical, no-nonsense guide to clearances, interference fits, thermal expansion, and common mistakes when moving from CAD to the workshop."
pubDate: 2026-11-10
author: "luca"
category: "Meccanica"
tags: ["tolerances", "cad", "design", "workshop"]
level: "Intermedio"
---

In CAD, two cylinders with a nominal diameter of $\varnothing 30\,\text{mm}$ always fit together perfectly. Then you send the drawing to the workshop, get the parts back, and discover that the shaft either wobbles in the bore or won't go in even with a hammer.

Understanding the **ISO 286** system (e.g. `H7/g6` vs. `H7/p6`) isn't about decorating a title block: it's about controlling elastic energy, press-fit pressure, and thermal reliability.

## 1. Hole-basis vs. shaft-basis systems

The **hole-basis** system (`H`) is used in most mechanical applications: the lower deviation of the hole is zero. Why? Reamers and internal machining tools come in fixed standard sizes, while adjusting a grinding or turning pass on a shaft's outside diameter is much easier.

- **Clearance fit (`H7/g6`, `H7/f7`):** allows relative motion or quick assembly, leaving room for a lubricant film.
- **Transition fit (`H7/k6`, `H7/j6`):** common for bearing seats where accurate centring is needed without excessively deforming the rings.
- **Interference fit (`H7/p6`, `H7/s6`):** transmits torque through friction without a key, but creates significant hoop stress in the hub.

## 2. The thermal expansion trap

Many designers size the interference at $20\,^\circ\text{C}$ and forget that, in service, the shaft (perhaps steel, $\alpha_{\text{Fe}} \approx 12 \times 10^{-6}\,\text{K}^{-1}$) and hub (perhaps an aluminium alloy, $\alpha_{\text{Al}} \approx 23 \times 10^{-6}\,\text{K}^{-1}$) operate at $90\,^\circ\text{C}$.

The difference in diametral expansion for a diameter $D = 50\,\text{mm}$ and $\Delta T = 70\,\text{K}$ is:

$$
\Delta D = D \cdot (\alpha_{\text{Al}} - \alpha_{\text{Fe}}) \cdot \Delta T \approx 50 \cdot 11 \times 10^{-6} \cdot 70 \approx 0.0385\,\text{mm}
$$

Almost **four hundredths of a millimetre** lost to temperature alone: enough to turn an interference fit into a loose fit that starts to slip.

## 3. A golden rule for hot mounting

When fitting a bearing with interference, **never exceed $110\text{–}120\,^\circ\text{C}$** with an induction heater; otherwise, you risk altering the temper of 100Cr6 bearing steel and reducing raceway hardness. Always check surface roughness $R_a$ as well: machining peaks flatten during pressing, reducing effective interference by roughly $0.8 \cdot (R_{z,\text{shaft}} + R_{z,\text{bore}})$.
