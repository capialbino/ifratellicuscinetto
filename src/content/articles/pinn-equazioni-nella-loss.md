---
title: "Physics-Informed Neural Networks: mettere le equazioni nella Loss"
description: "Come costringere una rete neurale a rispettare conservazione della massa ed equazioni differenziali alle derivate parziali senza avere milioni di dati."
pubDate: 2026-11-15
author: "alessandro-capialbi"
category: "AI & Software"
tags: ["pinn", "pytorch", "pde", "deep-learning"]
level: "Tecnico / Avanzato"
---

Nel deep learning classico insegniamo a una rete neurale a mappare input $x$ su output $y$ mostrandole migliaia di coppie $(x_i, y_i)$. Ma in ingegneria i dati sperimentali costano cari, mentre **conosciamo benissimo le equazioni differenziali** che governano il sistema.

Le **PINN** (*Physics-Informed Neural Networks*) sfruttano un'idea semplice e geniale: usare la differenziazione automatica (`autograd`) per calcolare le derivate della rete rispetto alle coordinate spazio-temporali e penalizzare nella *loss function* la violazione della fisica.

## 1. L'anatomia della Loss Function fisica

Supponiamo di voler modellare la diffusione del calore 1D in una barra metallica:

$$
\frac{\partial u}{\partial t} - \alpha \frac{\partial^2 u}{\partial x^2} = 0
$$

Invece di limitarci all'errore sui punti misurati dai sensori ($\mathcal{L}_{\text{data}}$), aggiungiamo il residuo dell'equazione differenziale valutato su punti di collocazione $(x_c, t_c)$ campionati nel dominio, più le condizioni al contorno:

$$
\mathcal{L} = \mathcal{L}_{\text{data}} + \lambda_{\text{pde}} \mathcal{L}_{\text{pde}} + \lambda_{\text{bc}} \mathcal{L}_{\text{bc}}
$$

## 2. Implementazione minimale in PyTorch

Ecco quanto è compatto scrivere il residuo fisico sfruttando `torch.autograd.grad`:

```python
import torch

def heat_pde_residual(model, x: torch.Tensor, t: torch.Tensor, alpha: float) -> torch.Tensor:
    x.requires_grad_(True)
    t.requires_grad_(True)

    u = model(torch.cat([x, t], dim=1))
    u_t = torch.autograd.grad(u, t, grad_outputs=torch.ones_like(u), create_graph=True)[0]
    u_x = torch.autograd.grad(u, x, grad_outputs=torch.ones_like(u), create_graph=True)[0]
    u_xx = torch.autograd.grad(u_x, x, grad_outputs=torch.ones_like(u_x), create_graph=True)[0]

    residual = u_t - alpha * u_xx
    return torch.mean(residual ** 2)
```

## 3. Quando convengono rispetto a un solver FEM/CFD?

| Aspetto | Solver FEM / CFD classico | PINN |
| :--- | :--- | :--- |
| **Mesh** | Obbligatoria e spesso complessa | Mesh-free (punti campionati) |
| **Problemi inversi** | Costosi (richiedono molti run) | Naturali (parametri come pesi trainabili) |
| **Affidabilità su singolo caso** | Altissima e certificata | Sensibile al bilanciamento dei $\lambda$ |
| **Costo di inferenza** | Alto per ogni nuova geometria | Millisecondi dopo il training |

> **Attenzione al mito:** le PINN non sostituiscono Ansys o OpenFOAM per certificare un componente critico. Brillano invece nei **problemi inversi** (es. stimare la diffusività $\alpha$ incognita da poche termocoppie) e come *surrogate model* parametrici.
