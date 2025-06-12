# maunium-stickerpicker - A fast and simple Matrix sticker picker widget.
# Copyright (C) 2020 Tulir Asokan
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
from typing import Dict, Tuple
import argparse
import asyncio
import os.path
import json
import re

from telethon import TelegramClient
from telethon.tl.functions.messages import GetAllStickersRequest, GetStickerSetRequest
from telethon.tl.types.messages import AllStickers
from telethon.tl.types import InputStickerSetShortName, Document, DocumentAttributeSticker
from telethon.tl.types.messages import StickerSet as StickerSetFull

from .lib import util  # Assuming util has helper functions like convert_image

async def reupload_document(
    client: TelegramClient,
    document: Document,
    output_dir: str,
    ext: str
) -> Tuple[Dict, bytes]:
    print(f"Downloading {document.id}", end="", flush=True)
    data = await client.download_media(document, file=bytes)
    print(".", end="", flush=True)

    is_tgs = document.mime_type == "application/x-tgsticker"

    if is_tgs:
        width, height = 512, 512
    else:
        data, width, height = util.convert_image(data)
    print(".", end="", flush=True)

    sticker_ext = "tgs" if is_tgs else ext
    sticker_filename = f"{document.id}.{sticker_ext}"
    sticker_path = os.path.join(output_dir, 'thumbnails', sticker_filename)
    web_relative_path = f"packs/thumbnails/{sticker_filename}"

    with open(sticker_path, "wb") as f:
        f.write(data)
    print(".", flush=True)

    return {
        "url": web_relative_path,
        "width": width,
        "height": height,
        "size": len(data)
    }, data

def add_meta(document: Document, info: Dict, pack: StickerSetFull) -> None:
    for attr in document.attributes:
        if isinstance(attr, DocumentAttributeSticker):
            info["body"] = attr.alt
    info["id"] = f"tg-{document.id}"
    # Simplified metadata, removing Matrix-specific fields
    info["telegram"] = {
        "pack": {
            "id": str(pack.set.id),
            "short_name": pack.set.short_name,
        },
        "id": str(document.id),
        "emoticons": [],
    }

async def reupload_pack(
    client: TelegramClient,
    pack: StickerSetFull,
    output_dir: str, ext: str
) -> None:
    pack_path = os.path.join(output_dir, f"{pack.set.short_name}.json")
    os.makedirs(os.path.join(output_dir, 'thumbnails'), exist_ok=True)
    try:
        os.makedirs(os.path.dirname(pack_path), exist_ok=True)
    except FileExistsError:
        pass

    print(f"Processing {pack.set.title} with {pack.set.count} stickers "
          f"and writing output to {pack_path}")

    already_uploaded = {}
    try:
        with util.open_utf8(pack_path) as pack_file:
            existing_pack = json.load(pack_file)
            already_uploaded = {int(sticker["telegram"]["id"]): sticker
                                for sticker in existing_pack["stickers"]}
            print(f"Found {len(already_uploaded)} already processed stickers")
    except FileNotFoundError:
        pass

    stickers_data: Dict[str, bytes] = {}
    reuploaded_documents: Dict[int, Dict] = {}
    for document in pack.documents:
        try:
            reuploaded_documents[document.id] = already_uploaded[document.id]
            print(f"Skipped processing {document.id}")
        except KeyError:
            reuploaded_documents[document.id], data = await reupload_document(client, document, output_dir, ext)
        add_meta(document, reuploaded_documents[document.id], pack)
        stickers_data[reuploaded_documents[document.id]["url"]] = data

    for sticker in pack.packs:
        if not sticker.emoticon:
            continue
        for document_id in sticker.documents:
            doc = reuploaded_documents[document_id]
            if doc["body"] == "":
                doc["body"] = sticker.emoticon
            doc["telegram"]["emoticons"].append(sticker.emoticon)

    with util.open_utf8(pack_path, "w") as pack_file:
        json.dump({
            "title": pack.set.title,
            "id": f"tg-{pack.set.id}",
            "telegram": {
                "short_name": pack.set.short_name,
                "hash": str(pack.set.hash),
            },
            "stickers": list(reuploaded_documents.values()),
        }, pack_file, ensure_ascii=False)
    print(f"Saved {pack.set.title} as {pack.set.short_name}.json")

    util.add_to_index(os.path.basename(pack_path), output_dir)

pack_url_regex = re.compile(r"^(?:(?:https?://)?(?:t|telegram)\.(?:me|dog)/addstickers/)?"
                            r"([A-Za-z0-9-_]+)"
                            r"(?:\.json)?$")

parser = argparse.ArgumentParser()
parser.add_argument("--list", help="List your saved sticker packs", action="store_true")
parser.add_argument("--session", help="Telethon session file name", default="sticker-import")
parser.add_argument("--output-dir", help="Directory to write packs to", default="web/packs", type=str)
parser.add_argument("--ext", help="Output image format (png, webp, or jpg)", choices=["png", "webp", "jpg", "webm", "tgs"], default="webp")
parser.add_argument("pack", help="Sticker pack URLs to import", action="append", nargs="*")

async def main(args: argparse.Namespace) -> None:
    client = TelegramClient(args.session, 298751, "cb676d6bae20553c9996996a8f52b4d7")
    await client.start()

    if args.list:
        stickers: AllStickers = await client(GetAllStickersRequest(hash=0))
        index = 1
        width = len(str(len(stickers.sets)))
        print("Your saved sticker packs:")
        for saved_pack in stickers.sets:
            print(f"{index:>{width}}. {saved_pack.title} "
                  f"(t.me/addstickers/{saved_pack.short_name})")
            index += 1
    elif args.pack[0]:
        input_packs = []
        for pack_url in args.pack[0]:
            match = pack_url_regex.match(pack_url)
            if not match:
                print(f"'{pack_url}' doesn't look like a sticker pack URL")
                return
            input_packs.append(InputStickerSetShortName(short_name=match.group(1)))
        for input_pack in input_packs:
            pack: StickerSetFull = await client(GetStickerSetRequest(input_pack, hash=0))
            await reupload_pack(client, pack, args.output_dir, args.ext)
    else:
        parser.print_help()

    await client.disconnect()

def cmd() -> None:
    asyncio.run(main(parser.parse_args()))

if __name__ == "__main__":
    cmd()
