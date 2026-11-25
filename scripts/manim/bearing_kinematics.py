"""
Bearing Kinematics — Deep Groove Ball Bearing (Epicyclic Rolling Without Slip)
Seamless 8-second loop (1280x720, 60fps) for I Fratelli Cuscinetto.

Exact geometry chosen for a 100% seamless loop over 2 inner-ring revolutions:
  R_i = 1.50  (inner raceway radius)
  R_o = 2.50  (outer raceway radius, fixed)
  R_p = 2.00  (pitch circle radius)
  r_b = 0.50  (ball radius, d = 1.00, D_p = 4.00)
  Z   = 8     (number of balls)

No-slip kinematics (outer ring fixed, w_o = 0):
  w_c / w_i = R_i / (2 * R_p) = 1.50 / 4.00 =  3/8
  w_b / w_i = -R_i / (2 * r_b) = -1.50 / 1.00 = -3/2

Over delta(theta_i) = 4*pi (2 full turns of inner ring):
  - Inner ring:  +2 turns
  - Cage:        +3/4 turn (= 6 ball pitches out of 8 -> exact symmetry)
  - Each ball:   -3 full spins (exact return of radial marker)
"""

import math
from manim import (
    Annulus,
    Arrow,
    Circle,
    DashedVMobject,
    Dot,
    Line,
    MarkupText,
    Scene,
    Text,
    VGroup,
    ValueTracker,
    always_redraw,
    config,
    linear,
    LEFT,
    RIGHT,
    UP,
    DOWN,
)

# Output styling: Alabaster Titanium (matches site --bg #f5f5f7)
config.background_color = "#f5f5f7"
config.pixel_width = 1280
config.pixel_height = 720
config.frame_rate = 60


class BearingKinematics(Scene):
    def construct(self):
        # Palette
        INK = "#1d1d1f"
        MUTED = "#6e6e73"
        BORDER = "#c7c7cc"
        RING_OUTER_FILL = "#e6e6eb"
        RING_INNER_FILL = "#dde4ee"
        BALL_FILL = "#ffffff"
        CAGE_COLOR = "#9a7b4f"
        ACCENT_BLUE = "#0071e3"
        ACCENT_TEAL = "#0f766e"
        ACCENT_CORAL = "#c85a17"

        # Geometry (exact seamless ratios)
        CENTER = LEFT * 2.55
        R_BORE = 0.86
        R_I = 1.50
        R_O = 2.50
        R_EXT = 2.98
        R_P = 0.5 * (R_I + R_O)  # 2.00
        R_B = 0.5 * (R_O - R_I)  # 0.50
        Z = 8

        # Exact kinematic ratios
        RATIO_CAGE = R_I / (2.0 * R_P)    # +3/8
        RATIO_BALL = -R_I / (2.0 * R_B)   # -3/2

        # ── Static outer ring (fixed) ──────────────────────────────────────
        outer_ring = Annulus(
            inner_radius=R_O,
            outer_radius=R_EXT,
            fill_color=RING_OUTER_FILL,
            fill_opacity=1.0,
            stroke_color=INK,
            stroke_width=2.0,
        ).move_to(CENTER)

        # Subtle ground/fixed hash marks around outer ring
        ground_ticks = VGroup()
        for k in range(24):
            ang = k * (2 * math.pi / 24)
            p1 = CENTER + R_EXT * math.cos(ang) * RIGHT + R_EXT * math.sin(ang) * UP
            p2 = CENTER + (R_EXT + 0.16) * math.cos(ang + 0.05) * RIGHT + (R_EXT + 0.16) * math.sin(ang + 0.05) * UP
            ground_ticks.add(Line(p1, p2, stroke_color=BORDER, stroke_width=1.4))

        # Crosshair axes
        axis_h = DashedVMobject(
            Line(CENTER + LEFT * (R_EXT + 0.35), CENTER + RIGHT * (R_EXT + 0.35), stroke_color=BORDER, stroke_width=1.1),
            num_dashes=26,
        )
        axis_v = DashedVMobject(
            Line(CENTER + DOWN * (R_EXT + 0.35), CENTER + UP * (R_EXT + 0.35), stroke_color=BORDER, stroke_width=1.1),
            num_dashes=26,
        )

        # Pitch circle
        pitch_circle = DashedVMobject(
            Circle(radius=R_P, stroke_color=CAGE_COLOR, stroke_width=1.4, stroke_opacity=0.65).move_to(CENTER),
            num_dashes=48,
        )

        # ── Driving angle tracker (2 full inner-ring revolutions = 4*pi) ──
        theta_i = ValueTracker(0.0)

        # Dynamic inner ring with shaft keyway & raceway highlight
        def build_inner_ring():
            t = theta_i.get_value()
            g = VGroup()
            ring = Annulus(
                inner_radius=R_BORE,
                outer_radius=R_I,
                fill_color=RING_INNER_FILL,
                fill_opacity=1.0,
                stroke_color=INK,
                stroke_width=1.8,
            ).move_to(CENTER)
            raceway = Circle(
                radius=R_I,
                stroke_color=ACCENT_BLUE,
                stroke_width=2.6,
            ).move_to(CENTER)
            g.add(ring, raceway)

            # 4 subtle radial ticks on inner ring + 1 primary keyway marker (blue)
            for k in range(4):
                ang = t + k * (math.pi / 2)
                r0 = R_BORE + 0.06
                r1 = R_I - 0.10
                p0 = CENTER + r0 * math.cos(ang) * RIGHT + r0 * math.sin(ang) * UP
                p1 = CENTER + r1 * math.cos(ang) * RIGHT + r1 * math.sin(ang) * UP
                is_primary = k == 0
                g.add(
                    Line(
                        p0,
                        p1,
                        stroke_color=ACCENT_BLUE if is_primary else MUTED,
                        stroke_width=3.2 if is_primary else 1.4,
                        stroke_opacity=1.0 if is_primary else 0.45,
                    )
                )

            # Center shaft dot
            g.add(Dot(CENTER, radius=0.055, color=INK))
            return g

        inner_ring_dyn = always_redraw(build_inner_ring)

        # Dynamic cage + 8 rolling balls + instantaneous velocity triangle on top-most ball
        def build_balls_and_vectors():
            t = theta_i.get_value()
            t_c = RATIO_CAGE * t
            t_b = RATIO_BALL * t

            g = VGroup()

            # Cage ring connecting ball centers
            cage_ring = Circle(
                radius=R_P,
                stroke_color=CAGE_COLOR,
                stroke_width=2.2,
                stroke_opacity=0.75,
            ).move_to(CENTER)
            g.add(cage_ring)

            # Track which ball is closest to the top (angle pi/2) for the velocity profile
            best_idx = 0
            best_dist = 1e9
            ball_angles = []
            for k in range(Z):
                ang = (t_c + k * (2 * math.pi / Z)) % (2 * math.pi)
                ball_angles.append(ang)
                diff = abs((ang - math.pi / 2 + math.pi) % (2 * math.pi) - math.pi)
                if diff < best_dist:
                    best_dist = diff
                    best_idx = k

            vectors_overlay = VGroup()

            for k, ang in enumerate(ball_angles):
                cx = CENTER[0] + R_P * math.cos(ang)
                cy = CENTER[1] + R_P * math.sin(ang)
                c_pos = cx * RIGHT + cy * UP

                is_focus = k == best_idx

                # Ball body
                ball = Circle(
                    radius=R_B,
                    fill_color=BALL_FILL,
                    fill_opacity=1.0,
                    stroke_color=ACCENT_TEAL if is_focus else INK,
                    stroke_width=2.4 if is_focus else 1.8,
                ).move_to(c_pos)

                # Radial spin reference line (shows real clockwise spin w_b)
                spin_ang = t_b + k * (2 * math.pi / Z)
                p_edge = c_pos + (R_B - 0.06) * math.cos(spin_ang) * RIGHT + (R_B - 0.06) * math.sin(spin_ang) * UP
                p_opp = c_pos - (R_B - 0.14) * math.cos(spin_ang) * RIGHT - (R_B - 0.14) * math.sin(spin_ang) * UP
                spin_line = Line(
                    p_opp,
                    p_edge,
                    stroke_color=ACCENT_CORAL if is_focus else MUTED,
                    stroke_width=2.2 if is_focus else 1.5,
                    stroke_opacity=0.95 if is_focus else 0.55,
                )
                spin_dot = Dot(
                    p_edge,
                    radius=0.055 if is_focus else 0.04,
                    color=ACCENT_CORAL if is_focus else INK,
                )
                center_dot = Dot(
                    c_pos,
                    radius=0.045,
                    color=ACCENT_TEAL if is_focus else CAGE_COLOR,
                )

                g.add(ball, spin_line, spin_dot, center_dot)

                # Live velocity triangle on the focus ball (drawn above all balls)
                if is_focus:
                    rad_u = math.cos(ang) * RIGHT + math.sin(ang) * UP
                    tan_u = -math.sin(ang) * RIGHT + math.cos(ang) * UP  # CCW tangent

                    p_inner = CENTER + R_I * rad_u
                    p_center = CENTER + R_P * rad_u
                    p_outer = CENTER + R_O * rad_u

                    v_i_len = 0.92
                    v_c_len = 0.5 * v_i_len

                    arr_vi = Arrow(
                        p_inner,
                        p_inner + v_i_len * tan_u,
                        buff=0,
                        stroke_width=3.2,
                        max_tip_length_to_length_ratio=0.24,
                        color=ACCENT_BLUE,
                    )
                    arr_vc = Arrow(
                        p_center,
                        p_center + v_c_len * tan_u,
                        buff=0,
                        stroke_width=3.0,
                        max_tip_length_to_length_ratio=0.32,
                        color=ACCENT_TEAL,
                    )
                    profile_line = DashedVMobject(
                        Line(
                            p_outer,
                            p_inner + v_i_len * tan_u,
                            stroke_color=INK,
                            stroke_width=1.5,
                            stroke_opacity=0.72,
                        ),
                        num_dashes=10,
                    )
                    icr_dot = Dot(p_outer, radius=0.065, color=INK)
                    vectors_overlay.add(profile_line, arr_vi, arr_vc, icr_dot)

            g.add(vectors_overlay)
            return g

        balls_dyn = always_redraw(build_balls_and_vectors)

        # ── Right-side technical legend (universal notation, IT & EN) ──────
        FONT = "Segoe UI"
        MONO = "Consolas"

        panel_x = 3.25
        kicker = Text("KINEMATICS · Z = 8", font=MONO, font_size=18, color=MUTED)
        title = Text("Rolling Without Slip", font=FONT, font_size=30, weight="BOLD", color=INK)
        rule = Line(LEFT * 2.15, RIGHT * 2.15, stroke_color=BORDER, stroke_width=1.2)

        def legend_row(dot_color, eq_markup, sub_markup):
            dot = Dot(radius=0.07, color=dot_color)
            eq = MarkupText(eq_markup, font=MONO, font_size=21, color=INK)
            sub = MarkupText(sub_markup, font=FONT, font_size=16, color=MUTED)
            txt = VGroup(eq, sub).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
            row = VGroup(dot, txt).arrange(RIGHT, aligned_edge=UP, buff=0.22)
            dot.shift(DOWN * 0.11)
            return row

        r1 = legend_row(ACCENT_BLUE, "v<sub>i</sub> = ω<sub>i</sub> · R<sub>i</sub>", "Inner raceway (driving)")
        r2 = legend_row(ACCENT_TEAL, "ω<sub>c</sub> = ½ ω<sub>i</sub> (1 − d / D<sub>p</sub>)", "Cage orbit  =  +3/8 ω<sub>i</sub>")
        r3 = legend_row(ACCENT_CORAL, "ω<sub>b</sub> = −(R<sub>i</sub> / 2r) ω<sub>i</sub>", "Ball spin   =  −3/2 ω<sub>i</sub>")
        r4 = legend_row(INK, "v<sub>o</sub> = 0", "Outer raceway (fixed ICR)")

        legend = VGroup(kicker, title, rule, r1, r2, r3, r4).arrange(
            DOWN, aligned_edge=LEFT, buff=0.32
        )
        title.shift(UP * 0.12)
        rule.shift(UP * 0.04)
        legend.move_to(RIGHT * panel_x)

        # Assemble scene
        self.add(axis_h, axis_v, ground_ticks, outer_ring, pitch_circle, inner_ring_dyn, balls_dyn, legend)

        # 8-second seamless loop: 2 full revolutions of inner ring
        self.play(theta_i.animate.set_value(4 * math.pi), run_time=8.0, rate_func=linear)
