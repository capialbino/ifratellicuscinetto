---
language: "en"
title: "Physics-Informed Neural Networks: Putting Equations in the Loss"
description: "How to make a neural network respect mass conservation and partial differential equations without millions of data points."
pubDate: 2026-11-15
author: "alessandro"
category: "AI & Software"
tags: ["pinn", "pytorch", "pde", "deep-learning"]
level: "Tecnico / Avanzato"
sourceHash: "7eda9cbdd85f3928"
---

In conventional deep learning, we teach a neural network to map inputs $x$ to outputs $y$ by showing it thousands of pairs $(x_i, y_i)$. But in engineering, experimental data is expensive, while we often **know the differential equations** that govern the system very well.

**Physics-Informed Neural Networks (PINNs)** use a simple, powerful idea: apply automatic differentiation (`autograd`) to calculate derivatives of the network with respect to space-time coordinates, then penalize violations of physics in the *loss function*.

## 1. Anatomy of a physics-informed loss

Suppose we want to model 1D heat diffusion in a metal rod:

$$
\frac{\partial u}{\partial t} - \alpha \frac{\partial^2 u}{\partial x^2} = 0
$$

Instead of relying only on errors at sensor measurements ($\mathcal{L}_{\text{data}}$), we add the differential-equation residual evaluated at collocation points $(x_c, t_c)$ sampled across the domain, along with the boundary conditions:

$$
\mathcal{L} = \mathcal{L}_{\text{data}} + \lambda_{\text{pde}} \mathcal{L}_{\text{pde}} + \lambda_{\text{bc}} \mathcal{L}_{\text{bc}}
$$

## 2. A minimal PyTorch implementation

Here's how compactly we can write the physics residual using `torch.autograd.grad`:

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

## 3. When are PINNs preferable to an FEM/CFD solver?

| Aspect | Traditional FEM / CFD solver | PINN |
| :--- | :--- | :--- |
| **Mesh** | Required and often complex | Mesh-free (sampled points) |
| **Inverse problems** | Expensive (many runs required) | Natural (parameters can be trainable weights) |
| **Reliability for one case** | Very high and validated | Sensitive to $\lambda$ balancing |
| **Inference cost** | High for every new geometry | Milliseconds after training |

> **Myth to avoid:** PINNs don't replace Ansys or OpenFOAM for certifying critical components. They excel at **inverse problems** (e.g. estimating unknown diffusivity $\alpha$ from a few thermocouples) and as parametric *surrogate models*.
