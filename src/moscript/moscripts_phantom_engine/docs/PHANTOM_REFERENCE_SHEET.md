# Phantom Script Reference Sheet v1.0

**Parent Language:** MoScripts  
**Script:** Phantom Script  
**Runtime:** MoScript Glyph Engine

## Elemental Anchors

| Glyph | Name | Element | Phantom Domain | Runtime Function |
|---|---|---|---|---|
| 🜂 | Ikang | Fire | Disease | `signal_ignition` |
| 🜄 | Mmọng | Water | Movement | `displacement_flow` |
| 🜁 | Afim | Air | Conflict | `language_transmission` |
| 🜃 | Isong | Earth | Terrain | `terrain_memory` |

## Alphabet

| Latin | Glyph | Notes |
|---|---|---|
| A | 🜀 | letter_a |
| B | 🜁 | letter_b / Air |
| C | 🜂 | letter_c / Fire |
| D | 🜃 | letter_d / Earth |
| E | 🜄 | letter_e / Water |
| F | 🜅 | letter_f |
| G | 🜆 | letter_g |
| H | 🜇 | letter_h |
| I | 🜈 | letter_i |
| J | 🜉 | letter_j |
| K | 🜊 | letter_k |
| L | 🜋 | letter_l |
| M | 🜌 | letter_m |
| N | 🜍 | letter_n |
| O | 🜎 | letter_o |
| P | 🜏 | letter_p |
| Q | 🜐 | letter_q |
| R | 🜑 | letter_r |
| S | 🜒 | letter_s |
| T | 🜓 | letter_t |
| U | 🜔 | letter_u |
| V | 🜕 | letter_v |
| W | 🜖 | letter_w |
| X | 🜗 | letter_x |
| Y | 🜘 | letter_y |
| Z | 🜙 | letter_z |

## Numerals

| Digit | Glyph |
|---|---|
| 0 | 🜚 |
| 1 | 🜛 |
| 2 | 🜜 |
| 3 | 🜝 |
| 4 | 🜞 |
| 5 | 🜟 |
| 6 | 🜠 |
| 7 | 🜡 |
| 8 | 🜢 |
| 9 | 🜣 |

## Operators

| Glyph | Canonical Name | Meaning | ASCII Fallback |
|---|---|---|---|
| 🜤 | gate | controlled transition / function gate | `->` |
| 🜥 | floor | minimum threshold / lower bound | `>=` |
| 🜦 | join | join / bind / concatenate | `.` |
| 🜧 | open | open scope | `[` |
| 🜨 | close | close scope | `]` |
| 🜩 | define | define / assign | `:` |

## Reading Modes

| Mode | Description | Example |
|---|---|---|
| Literal | glyphs spell Latin words/numbers | `🜏🜇🜀🜍🜓🜎🜌` → `PHANTOM` |
| Semantic | glyph stands for concept/domain | `🜂` → `Fire/Disease` |
| Structural | glyph acts as operator | `🜂🜦🜞` → `C.4` / Disease level 4 |

## Canonical Examples

| Meaning | Phantom |
|---|---|
| PHANTOM | `🜏🜇🜀🜍🜓🜎🜌` |
| 2026 | `🜜🜚🜜🜠` |
| Fire define disease | `🜂🜩DISEASE` |
| Trust floor 70 | `🜓🜑🜔🜒🜓🜥🜡🜚` |
| Fire join 4 | `🜂🜦🜞` |
