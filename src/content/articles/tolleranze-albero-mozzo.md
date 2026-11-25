---
title: "Accoppiamenti albero-mozzo e tolleranze ISO: perché ±0.01 mm cambia tutto"
description: "Guida pratica e senza misteri su giochi, interferenze, dilatazioni termiche e errori tipici quando si passa dal CAD all'officina."
pubDate: 2026-11-10
author: "alessandro-rossi"
category: "Meccanica"
tags: ["tolleranze", "cad", "progettazione", "officina"]
level: "Intermedio"
---

Sul CAD due cilindri con diametro nominale $\varnothing 30\,\text{mm}$ entrano sempre uno dentro l'altro alla perfezione. Poi mandi la tavola in officina, ti tornano i pezzi e scopri che l'albero o balla nel foro o non entra nemmeno a martellate.

Capire il sistema **ISO 286** (es. `H7/g6` vs `H7/p6`) non serve a decorare il cartiglio: serve a controllare energia elastica, pressione di forzamento e affidabilità termica.

## 1. Foro base vs Albero base

Nella stragrande maggioranza delle applicazioni meccaniche si usa il sistema **foro base** (`H`): lo scostamento inferiore del foro è zero. Perché? Perché gli alesatori e gli utensili da interno hanno dimensioni standard fisse, mentre è molto più facile regolare la passata di rettifica o tornitura sul diametro esterno dell'albero.

- **Accoppiamento con gioco (`H7/g6`, `H7/f7`):** garantisce movimento relativo o montaggio rapido, lasciando spazio per il film lubrificante.
- **Accoppiamento incerto (`H7/k6`, `H7/j6`):** tipico per sedi di cuscinetti dove serve precisione di centraggio senza deformare eccessivamente gli anelli.
- **Accoppiamento con interferenza (`H7/p6`, `H7/s6`):** trasmette coppia tramite attrito senza linguetta, ma genera tensioni circonferenziali importanti nel mozzo.

## 2. La trappola della dilatazione termica

Molti progettisti dimensionano l'interferenza a $20\,^\circ\text{C}$ dimenticandosi che in esercizio l'albero (magari in acciaio, $\alpha_{\text{Fe}} \approx 12 \times 10^{-6}\,\text{K}^{-1}$) e il mozzo (magari in lega di alluminio, $\alpha_{\text{Al}} \approx 23 \times 10^{-6}\,\text{K}^{-1}$) lavorano a $90\,^\circ\text{C}$.

La differenza di espansione diametrale su un diametro $D = 50\,\text{mm}$ per $\Delta T = 70\,\text{K}$ vale:

$$
\Delta D = D \cdot (\alpha_{\text{Al}} - \alpha_{\text{Fe}}) \cdot \Delta T \approx 50 \cdot 11 \times 10^{-6} \cdot 70 \approx 0.0385\,\text{mm}
$$

Quasi **4 centesimi di millimetro** persi solo per la temperatura: abbastanza per trasformare un accoppiamento forzato in un accoppiamento libero che inizia a slittare.

## 3. Regola d'oro per il montaggio a caldo

Se devi calettare un cuscinetto con interferenza, **non superare mai i $110\text{–}120\,^\circ\text{C}$** con il riscaldatore a induzione (altrimenti rischi di alterare il rinvenimento dell'acciaio da cuscinetti 100Cr6 e ridurre la durezza delle piste) e verifica sempre la rugosità $R_a$: le creste di lavorazione si schiacciano durante il piantaggio, riducendo l'interferenza effettiva di circa $0.8 \cdot (R_{z,\text{albero}} + R_{z,\text{foro}})$.
