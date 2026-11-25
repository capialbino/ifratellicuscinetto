---
title: "Contatto Hertziano e AI: prevedere l'usura di un cuscinetto prima che ceda"
description: "Dalle pressioni di contatto di Hertz all'analisi vibrazionale con reti neurali: come unire fisica del cuscinetto e machine learning nella manutenzione predittiva."
pubDate: 2026-11-20
author: "federico"
category: "Meccatronica & Hybrid"
tags: ["cuscinetti", "tribologia", "manutenzione-predittiva", "fft"]
level: "Tecnico / Avanzato"
---

Non potevamo inaugurare questo spazio senza parlare del componente che ci dà il nome: il **cuscinetto volvente**. Sembra un oggetto banale finché non inizi a calcolare cosa succede nella microscopica impronta di contatto tra una sfera e la sua pista.

## 1. La fisica del problema: la pressione di Hertz

Quando una sfera d'acciaio preme contro la pista interna con carico normale $F$, il contatto non è mai puntiforme. La deformazione elastica genera un'area ellittica di contatto in cui la pressione massima $p_0$ raggiunge facilmente valori dell'ordine dei **gigapascal**:

$$
p_0 = \frac{3F}{2\pi a b}
$$

dove $a$ e $b$ sono i semiassi dell'ellisse di contatto, dipendenti dal modulo di Young equivalente $E^*$ e dai raggi di curvatura principali. Il dettaglio affascinante? La tensione tangenziale massima $\tau_{\max}$ **non** si trova in superficie, ma a una profondità $z \approx 0.48 a$ sotto la pista: è lì che nascono le micro-cricche da fatica da contatto (*spalling*).

## 2. Le frequenze caratteristiche di guasto

Prima che il cuscinetto grippi, ogni passaggio di una sfera sopra una micro-scheggiatura genera un impulso meccanico periodico. In base alla geometria (numero di sfere $N_b$, diametro sfera $d$, diametro primitivo $D$, angolo di contatto $\alpha$ e frequenza di rotazione dell'albero $f_r$), possiamo calcolare analiticamente la **BPFO** (*Ball Pass Frequency Outer*):

$$
\text{BPFO} = \frac{N_b}{2} f_r \left(1 - \frac{d}{D} \cos\alpha\right)
$$

> **Regola pratica:** in un accelerometro montato sul supporto, i primi segnali di danneggiamento non compaiono direttamente alle basse frequenze di BPFO, ma come *modulazione in ampiezza* delle risonanze strutturali ad alta frequenza (2–15 kHz).

## 3. Dove entra in gioco l'Intelligenza Artificiale

Se le frequenze sono note analiticamente, perché usare il Machine Learning? Perché nella realtà industriale:

1. La velocità di rotazione $f_r$ non è costante (transitori, rampe, carichi variabili).
2. Il rumore di fondo di ingranaggi adiacenti copre gli impulsi deboli.
3. Vogliamo stimare la **RUL** (*Remaining Useful Life*), non solo dire "si è rotto".

Un approccio pulito consiste nell'estrarre lo spettro dell'inviluppo (*Envelope Spectrum* tramite trasformata di Hilbert) e alimentare un modello leggero che combini feature fisiche (energia nelle bande BPFO/BPFI) con un classificatore o regressore temporale:

```python
import numpy as np
from scipy.signal import hilbert

def envelope_spectrum(signal: np.ndarray, fs: float) -> tuple[np.ndarray, np.ndarray]:
    """Calcola lo spettro dell'inviluppo analitico per analisi cuscinetti."""
    analytic = hilbert(signal - np.mean(signal))
    envelope = np.abs(analytic)
    envelope -= np.mean(envelope)
    freqs = np.fft.rfftfreq(len(envelope), d=1.0 / fs)
    amps = np.abs(np.fft.rfft(envelope)) / len(envelope)
    return freqs, amps
```

## Conclusione

Un ingegnere informatico che butta il segnale grezzo dentro un Transformer gigante senza conoscere la BPFO spreca parametri e dati. Un ingegnere meccanico che guarda solo una soglia RMS perde i guasti incipienti. **Insieme, la fisica guida le feature e il modello impara la variabilità del mondo reale.**
