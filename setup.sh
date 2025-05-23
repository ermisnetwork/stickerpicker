#!/bin/bash

python3 -m venv .venv
source .venv/bin/activate
pip3 install -r requirements.txt

python -m sticker.stickerimport \
https://t.me/addstickers/MonoMemeee \
https://t.me/addstickers/monomeme2 \
