"""Apply design/tokens.override.css's deviations to design/tokens.json.

design/tokens.json is the artistic-color-palettes skill's own output and passes
the WCAG gate unexempted. The CSS override layer then maps a few semantic roles
onto the brand primitives, because the skill caps the neutral ramp's chroma at
0.03 and wall green #123D2E has chroma 0.0547, so the ramp cannot reproduce it.

This script reproduces those same deviations in the tokens JSON so that
validate.py can measure what actually ships. The values below must stay in step
with design/tokens.override.css; scripts/contrast-check.mjs fails the build if
the resulting contrast failures are not exactly the documented exemption.

Usage: python apply-override.py <tokens.json> <out.json> <skill-scripts-dir>
"""
import json
import sys

sys.path.insert(0, sys.argv[3])
import colorlib as cl  # noqa: E402

SRC, DST = sys.argv[1], sys.argv[2]

# Each entry mirrors one declaration in design/tokens.override.css.
OVERRIDES = {
    "light": {
        "bg": ("#eef1e8", "palette:chalk"),
        "surface": ("#ffffff", "palette:paper"),
        "text": ("#123d2e", "palette:wall-green"),
        "accent": ("#ff6a1f", "palette:whistle-orange"),
        "on-accent": ("#0b2a1f", "palette:dugout"),
        "accent-hover": ("#f05c00", "brand:accent-hover"),
        "warning": ("#b87f2c", "lightness-fix"),
    },
    "dark": {
        "accent": ("#ff6a1f", "palette:whistle-orange"),
        "on-accent": ("#0b2a1f", "palette:dugout"),
        "accent-hover": ("#ff9970", "brand:accent-hover"),
    },
}

with open(SRC, encoding="utf-8") as f:
    tokens = json.load(f)

for mode, roles in OVERRIDES.items():
    for role, (hexv, ref) in roles.items():
        slot = tokens["roles"][mode].setdefault(role, {})
        slot["hex"] = hexv
        slot["ref"] = ref
        slot["L"] = round(cl.hex_to_oklch(hexv)[0], 4)

with open(DST, "w", encoding="utf-8") as f:
    json.dump(tokens, f, ensure_ascii=False, indent=2)
