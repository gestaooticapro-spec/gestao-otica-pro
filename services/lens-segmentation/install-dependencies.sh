#!/usr/bin/env sh
set -eu

python -m pip install --no-cache-dir -r requirements.txt

# O ultralytics declara opencv-python como dependencia. No worker sem interface
# grafica, essa variante exige libGL; a distribuicao headless fornece o mesmo
# modulo cv2 sem essa dependencia do sistema.
python -m pip uninstall -y opencv-python
python -m pip install --no-cache-dir --force-reinstall --no-deps opencv-python-headless
