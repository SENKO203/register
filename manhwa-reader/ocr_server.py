"""
خادم Manga-OCR الداخلي — يعمل على المنفذ 5555
شغّله قبل node server.js
"""
from flask import Flask, request, jsonify
from manga_ocr import MangaOcr
from PIL import Image

app = Flask(__name__)

print("⏳ جاري تحميل نموذج Manga-OCR...")
ocr = MangaOcr()
print("✅ Manga-OCR جاهز!")


@app.route("/health")
def health():
    return "ok"


@app.route("/ocr", methods=["POST"])
def ocr_regions():
    """
    يستقبل: { imagePath: str, bboxes: [{x0,y0,x1,y1}, ...] }
    يرجع:   { texts: [str, ...] }
    """
    data = request.json
    try:
        img = Image.open(data["imagePath"]).convert("RGB")
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    texts = []
    for b in data["bboxes"]:
        # نقطع منطقة النص من الصورة ونمررها لـ Manga-OCR
        crop = img.crop((b["x0"], b["y0"], b["x1"], b["y1"]))
        # نكبّر الصورة الصغيرة لتحسين الدقة
        w, h = crop.size
        if w < 64 or h < 32:
            scale = max(64 / w, 32 / h)
            crop = crop.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        texts.append(ocr(crop))

    return jsonify({"texts": texts})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5555, debug=False)
