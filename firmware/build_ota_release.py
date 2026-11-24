"""Compile an ESP8266 sketch and sign the binary and its node manifest."""
import argparse
import hashlib
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

FIRMWARE = Path(__file__).resolve().parent
MAX_IMAGE_BYTES = 1024 * 1024


def read_config(config):
    patterns = (
        r'^[ \t]*constexpr[ \t]+char[ \t]+DEVICE_ID[ \t]*\[[ \t]*\][ \t]*=[ \t]*"([A-Za-z0-9_-]{1,32})"[ \t]*;[ \t]*(?://.*)?$',
        r'^[ \t]*#[ \t]*define[ \t]+NODE_FIRMWARE_VERSION[ \t]+"([A-Za-z0-9._-]{1,64})"[ \t]*(?://.*)?$',
    )
    results = [re.findall(pattern, config, re.MULTILINE) for pattern in patterns]
    if any(len(values) != 1 for values in results):
        raise ValueError("config.h phải khai báo đúng một DEVICE_ID và NODE_FIRMWARE_VERSION hợp lệ.")
    return results[0][0], results[1][0]


def sign_release(image, key, device_id, version):
    if not image.startswith(b"\xe9") or len(image) + 260 > MAX_IMAGE_BYTES:
        raise ValueError("Bản build phải là file ESP8266 .bin và gói đã ký tối đa 1 MiB.")
    signature = key.sign(image, padding.PKCS1v15(), hashes.SHA256())
    signed_image = image + signature + len(signature).to_bytes(4, "little")
    digest = hashlib.sha256(signed_image).hexdigest()
    payload = f"iot-fota-manifest-v1\n{device_id}\n{version}\n{digest}".encode("ascii")
    manifest_signature = key.sign(payload, padding.PKCS1v15(), hashes.SHA256()).hex()
    return signed_image, f"{device_id}:{version}:{digest}:{manifest_signature}\n"


def build(args):
    key = serialization.load_pem_private_key(args.private_key.read_bytes(), password=None)
    if not isinstance(key, rsa.RSAPrivateKey) or key.key_size != 2048:
        raise ValueError("Cần khóa riêng RSA 2048 bit của dự án.")

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    # Compile the same snapshot that supplies the manifest metadata.
    with tempfile.TemporaryDirectory(prefix=".iot-ota-", dir=output_dir) as temp:
        sketch = Path(temp) / "node_full"
        sketch.mkdir()
        for source in (FIRMWARE / "node_full").iterdir():
            if source.is_file() and source.suffix in {".ino", ".h"}:
                shutil.copy2(source, sketch / source.name)
        device_id, version = read_config((sketch / "config.h").read_text(encoding="utf-8-sig"))
        release_name = f"{device_id}-{version}"
        release = output_dir / release_name
        if release.exists():
            raise FileExistsError(f"Bản build đã có tại {release}. Chọn phiên bản hoặc thư mục khác.")
        binaries = Path(temp) / "compiled"
        compiler_env = {**os.environ, "TEMP": temp, "TMP": temp, "TMPDIR": temp}
        subprocess.run(
            [args.arduino_cli, "compile", "--fqbn", args.fqbn, "--build-path", str(binaries), str(sketch)],
            check=True, env=compiler_env,
        )
        image = (binaries / "node_full.ino.bin").read_bytes()
        signed, manifest = sign_release(image, key, device_id, version)

        staging = Path(temp) / release_name
        staging.mkdir()
        (staging / f"{release_name}.signed.bin").write_bytes(signed)
        (staging / f"{release_name}.manifest").write_text(manifest, encoding="ascii")
        staging.rename(release)
    return release


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--private-key", type=Path, required=True)
    parser.add_argument("--arduino-cli", default="arduino-cli")
    parser.add_argument("--fqbn", default="esp8266:esp8266:nodemcuv2")
    parser.add_argument("--output-dir", type=Path, default=FIRMWARE / "build" / "ota")
    args = parser.parse_args()
    try:
        release = build(args)
    except (OSError, TypeError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Không tạo được bản FOTA: {error}\n")
    print(f"Đã tạo file .signed.bin và .manifest tại {release}")


if __name__ == "__main__":
    main()
