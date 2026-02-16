"""
Build the 5-slide classroom presentation as a PPTX file.
Each slide uses a full-bleed generated image as its background.
"""

from pptx import Presentation
from pptx.util import Inches, Emu
import os

# Artifact directory where generated images live
ARTIFACTS = os.path.expanduser(
    "~/.gemini/antigravity/brain/bf1cfaff-cbf4-4981-afd1-e29b91362d50"
)

SLIDES = [
    {
        "file": "slide_1_title_1771262113608.png",
        "title": "Slide 1 — Title",
    },
    {
        "file": "slide_2_sensor_1771284270393.png",
        "title": "Slide 2 — How the Sensor Captures Your Move",
    },
    {
        "file": "slide_3_600numbers_1771284805624.png",
        "title": "Slide 3 — What the AI Actually Sees",
    },
    {
        "file": "slide_4_challenge_1771262190125.png",
        "title": "Slide 4 — The Swap Challenge",
    },
    {
        "file": "slide_5_wrapup_1771262208398.png",
        "title": "Slide 5 — Wrap-Up",
    },
]

OUTPUT = os.path.join(os.path.dirname(__file__), "Severn_Edge_AI_Classroom_Slides.pptx")


def build():
    prs = Presentation()
    # Set widescreen 16:9
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    blank_layout = prs.slide_layouts[6]  # blank layout

    for slide_info in SLIDES:
        path = os.path.join(ARTIFACTS, slide_info["file"])
        if not os.path.exists(path):
            print(f"  ⚠ Missing: {slide_info['file']} — skipping")
            continue

        slide = prs.slides.add_slide(blank_layout)

        # Add image stretched to full slide
        slide.shapes.add_picture(
            path,
            left=Emu(0),
            top=Emu(0),
            width=prs.slide_width,
            height=prs.slide_height,
        )

        # Add speaker notes
        slide.notes_slide.notes_text_frame.text = slide_info["title"]

        print(f"  ✓ {slide_info['title']}")

    prs.save(OUTPUT)
    print(f"\n✅ Saved: {OUTPUT}")


if __name__ == "__main__":
    build()
