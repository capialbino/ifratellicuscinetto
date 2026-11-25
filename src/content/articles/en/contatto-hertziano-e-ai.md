---
language: "en"
title: "Hertzian Contact and AI: Predicting Bearing Wear Before Failure"
description: "From Hertzian contact pressure to neural-network vibration analysis: combining bearing physics and machine learning for predictive maintenance."
pubDate: 2026-11-20
author: "federico-pappafava"
category: "Meccatronica & Hybrid"
tags: ["bearings", "tribology", "predictive-maintenance", "fft"]
level: "Tecnico / Avanzato"
sourceHash: "6aa1a107d36caa3f"
---

We couldn't launch this site without talking about the component behind our name: the **rolling-element bearing**. It may seem simple until you start calculating what happens in the microscopic contact patch between a ball and its raceway.

## 1. The physics: Hertzian contact pressure

When a steel ball presses against the inner raceway under a normal load $F$, the contact is never truly a point. Elastic deformation creates an elliptical contact area where the maximum pressure $p_0$ can easily reach **gigapascal** levels:

$$
p_0 = \frac{3F}{2\pi a b}
$$

Here, $a$ and $b$ are the semi-axes of the contact ellipse, determined by the equivalent Young's modulus $E^*$ and the principal radii of curvature. The fascinating detail? The maximum shear stress $\tau_{\max}$ is **not** at the surface, but at a depth of approximately $z \approx 0.48 a$ below the raceway. That's where contact-fatigue microcracks (*spalling*) begin.

## 2. Characteristic fault frequencies

Before a bearing seizes, each ball passing over a small defect produces a periodic mechanical impulse. Given the geometry (number of balls $N_b$, ball diameter $d$, pitch diameter $D$, contact angle $\alpha$, and shaft rotational frequency $f_r$), we can analytically calculate the **BPFO** (*Ball Pass Frequency Outer*):

$$
\text{BPFO} = \frac{N_b}{2} f_r \left(1 - \frac{d}{D} \cos\alpha\right)
$$

> **Rule of thumb:** with an accelerometer mounted on the housing, the first signs of damage don't appear directly at the low BPFO frequency. They appear as *amplitude modulation* of high-frequency structural resonances (2–15 kHz).

## 3. Where artificial intelligence comes in

If these frequencies are known analytically, why use machine learning? Because real industrial systems have complications:

1. Rotational speed $f_r$ is not constant (transients, ramps, and variable loads).
2. Background noise from nearby gears masks weak impulses.
3. We want to estimate **RUL** (*Remaining Useful Life*), not just say "it failed."

A sound approach is to extract the *Envelope Spectrum* (using the Hilbert transform) and feed a lightweight model that combines physics-based features (energy in the BPFO/BPFI bands) with a classifier or time-series regressor:

```python
import numpy as np
from scipy.signal import hilbert

def envelope_spectrum(signal: np.ndarray, fs: float) -> tuple[np.ndarray, np.ndarray]:
    """Compute the analytical envelope spectrum for bearing analysis."""
    analytic = hilbert(signal - np.mean(signal))
    envelope = np.abs(analytic)
    envelope -= np.mean(envelope)
    freqs = np.fft.rfftfreq(len(envelope), d=1.0 / fs)
    amps = np.abs(np.fft.rfft(envelope)) / len(envelope)
    return freqs, amps
```

## Conclusion

An AI engineer who feeds raw signals into a giant Transformer without knowing the BPFO wastes parameters and data. A mechanical engineer who only watches an RMS threshold misses incipient faults. **Together, physics guides the features and the model learns the variability of the real world.**
