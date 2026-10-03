from pathlib import Path
import io
import struct

from PIL import Image


SOURCE = Path("/Users/danicahartawan/Downloads/Screenshot 2026-09-28 at 3.55.23\u202fPM.png")
OUT_DIR = Path("/Users/danicahartawan/Documents/ChatGPT/cady/cursor")


def extract_character(image: Image.Image) -> Image.Image:
    # Crop the large reference drawing out of the phone screenshot.
    crop = image.crop((150, 225, 1155, 1080)).convert("RGBA")
    px = crop.load()
    width, height = crop.size

    # Flood-fill only the near-white region connected to the crop edges. This
    # retains the character's off-white body while removing the white panel.
    stack = []
    seen = bytearray(width * height)
    for x in range(width):
        stack.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        stack.extend(((0, y), (width - 1, y)))

    while stack:
        x, y = stack.pop()
        idx = y * width + x
        if seen[idx]:
            continue
        seen[idx] = 1
        r, g, b, _ = px[x, y]
        if min(r, g, b) < 238 or max(r, g, b) - min(r, g, b) > 14:
            continue
        px[x, y] = (r, g, b, 0)
        if x:
            stack.append((x - 1, y))
        if x + 1 < width:
            stack.append((x + 1, y))
        if y:
            stack.append((x, y - 1))
        if y + 1 < height:
            stack.append((x, y + 1))

    bbox = crop.getbbox()
    if bbox:
        crop = crop.crop(bbox)
    return crop


def fit_cursor(character: Image.Image, size: int) -> tuple[Image.Image, tuple[int, int]]:
    margin = max(2, size // 32)
    max_side = size - margin * 2
    scale = min(max_side / character.width, max_side / character.height)
    resized = character.resize(
        (max(1, round(character.width * scale)), max(1, round(character.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))

    # Approximate the upper-left antenna tip in the original character crop.
    hotspot = (x + round(resized.width * 0.24), y + round(resized.height * 0.05))
    return canvas, hotspot


def write_cur(path: Path, image: Image.Image, hotspot: tuple[int, int]) -> None:
    payload = io.BytesIO()
    image.save(payload, "PNG")
    data = payload.getvalue()
    width_byte = 0 if image.width == 256 else image.width
    height_byte = 0 if image.height == 256 else image.height
    header = struct.pack("<HHH", 0, 2, 1)
    entry = struct.pack(
        "<BBBBHHII",
        width_byte,
        height_byte,
        0,
        0,
        hotspot[0],
        hotspot[1],
        len(data),
        6 + 16,
    )
    path.write_bytes(header + entry + data)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    character = extract_character(Image.open(SOURCE))
    character.save(OUT_DIR / "butterfly-cutout.png")

    for size in (32, 64, 128):
        cursor, hotspot = fit_cursor(character, size)
        cursor.save(OUT_DIR / f"butterfly-cursor-{size}.png")
        if size == 128:
            write_cur(OUT_DIR / "butterfly-cursor.cur", cursor, hotspot)


if __name__ == "__main__":
    main()
