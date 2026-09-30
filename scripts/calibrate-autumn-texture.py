"""Calibrate Autumn Girly Top's baked-photo texture and material.

Run with a Python environment that has Pillow and NumPy installed. The GLB's
geometry, compressed buffers, UVs, and anchor nodes are left byte-for-byte
untouched. The original model can be restored from Git history.
"""

import io
import json
import hashlib
import struct
from pathlib import Path

import numpy as np
from PIL import Image


MODEL = Path('public/garments/Autumn_girly_top.glb')
SOURCE_TEXTURE_SHA256 = '289e158af17762ada6a4395135679412021896ab4eebc575845f760b3b324270'


def calibrate(image_bytes: bytes) -> bytes:
    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    rgb = np.asarray(image, dtype=np.float32) / 255
    luminance = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # Reduce the contrast of photographed wrinkles while preserving the check
    # pattern and avoiding a global lighting change to the other garments.
    target = np.clip(0.5 + (luminance - 0.5) * 0.82 + 0.20 * (1 - luminance) ** 2, 0, 1)
    adjusted = np.clip(rgb + (target - luminance)[..., None], 0, 1)
    output = io.BytesIO()
    Image.fromarray(np.uint8(adjusted * 255 + 0.5)).save(
        output, format='JPEG', quality=90, subsampling=0, optimize=True,
    )
    return output.getvalue()


def main() -> None:
    data = MODEL.read_bytes()
    assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 8)[0] == len(data)
    json_length = struct.unpack_from('<I', data, 12)[0]
    document = json.loads(data[20:20 + json_length])
    bin_header = 20 + json_length
    bin_length, bin_type = struct.unpack_from('<I4s', data, bin_header)
    assert bin_type == b'BIN\0'
    binary = bytearray(data[bin_header + 8:bin_header + 8 + bin_length])
    assert len(document['images']) == 1
    image = document['images'][0]
    assert image['mimeType'] == 'image/jpeg'
    view = document['bufferViews'][image['bufferView']]
    start, old_length = view['byteOffset'], view['byteLength']
    source = binary[start:start + old_length]
    if hashlib.sha256(source).hexdigest() != SOURCE_TEXTURE_SHA256:
        raise ValueError('Expected the original texture; restore the GLB before recalibrating')
    replacement = calibrate(source)
    if len(replacement) > old_length:
        raise ValueError('Calibrated JPEG exceeds its original buffer view')
    binary[start:start + len(replacement)] = replacement
    view['byteLength'] = len(replacement)
    # The scan already includes photographed lighting. Standard PBR lighting
    # darkens the folds a second time, so display this garment as unlit.
    assert len(document['materials']) == 1
    document['materials'][0].setdefault('extensions', {})['KHR_materials_unlit'] = {}
    document.setdefault('extensionsUsed', []).append('KHR_materials_unlit')
    packed_json = json.dumps(document, separators=(',', ':')).encode()
    packed_json += b' ' * (-len(packed_json) % 4)
    output = (
        struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(packed_json) + 8 + len(binary))
        + struct.pack('<I4s', len(packed_json), b'JSON') + packed_json
        + struct.pack('<I4s', len(binary), b'BIN\0') + binary
    )
    MODEL.write_bytes(output)
    print(f'{MODEL}: texture {old_length} -> {len(replacement)} bytes')


if __name__ == '__main__':
    main()
